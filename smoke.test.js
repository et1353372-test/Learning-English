// 冒烟测试：jsdom 加载 APP，模拟点击核心流程
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const root = __dirname;

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.speechSynthesis = {
  getVoices: () => [{ lang: "en-US", name: "en" }, { lang: "zh-CN", name: "zh" }],
  speak: u => setTimeout(() => { u.onend && u.onend(); u.onerror && u.onerror(); }, 3),
  cancel: () => {}, onvoiceschanged: null,
};
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.navigator.mediaDevices = { getUserMedia: async () => { throw new Error("no mic in test"); } };
window.Audio = function () { return { play: () => {}, pause: () => {} }; };
window.fetch = async () => { throw new Error("offline in test"); };

const all = ["js/data.js", "js/data_pdf.js", "js/data_more_dialogs.js", "js/data_family_8000.js", "js/store.js", "js/tts.js", "js/recorder.js", "js/app.js"]
  .map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
const epilogue = `window.__test = { Store, renderReview, renderMe, renderHome, render, openTopic, openScene, goBack, countDue, setView: (f, a) => { viewFn = f; viewArg = a; } };`;
window.eval(all + "\n;\n" + epilogue);
const T = window.__test;

const d = window.document;
const q = s => d.querySelector(s);
const qa = s => [...d.querySelectorAll(s)];
let pass = 0;
const fails = [];
const check = (name, cond) => { cond ? pass++ : (fails.push(name), console.log("FAIL:", name)); };

check("home-3-resource-folders", qa(".res-cell").length === 3 && qa(".scene-cell").length === 0);

// 资源夹 → 场景列表 → 场景
window.eval("openResource('ae')");
check("resource-page-scenes", qa(".scene-cell").length === 6);
qa(".scene-cell")[0].click();
check("via-resource-to-scene", q(".page-title").textContent.length > 2);

// PDF 话题：点话题直达听读（无中间页），情景对话入口在听读页
T.openTopic("d21");
check("topic-two-modes", !!q("#playerBar") && !!q("#btnDialog2"));
check("topic-title", q(".page-title").textContent.includes("餐厅点餐"));

q("#btnDialog2").click();
q("#startBtn").click();
check("pdf-dialog-run", qa("#stage .bubble").length >= 1);

// 场景话题列表
T.setView(T.renderHome, null); T.render();
T.openScene("travel");
check("scene-title-travel", q(".page-title").textContent.includes("旅行"));
check("scene-3-topics", qa(".topic-card").length === 3);

// 听读跟读：完整对话 + 三种展示切换 + 收藏/掌握
T.setView(T.renderHome, null); T.render();
T.openTopic("travel-airport");
check("listen-3-zone-layout", view_class_has("listen-mode") && order_ok());
function view_class_has(c) { return d.getElementById("view").classList.contains(c); }
function order_ok() {
  const ids = [...d.getElementById("view").children].map(x => x.id || x.className);
  return ids.indexOf("playerBar") > ids.indexOf("senPanel") && ids.indexOf("chipRow") > ids.indexOf("playerBar");
}
check("listen-full-dialog", qa(".line-item").length === 6);
check("listen-3-audio-btns", qa(".audio-toggle button").length === 3);
check("listen-nav-topic-btns", !!q("#prevT") && !!q("#nextT"));
check("listen-loop-btn", !!q("#loopBtn"));
check("listen-no-rec-feature", !q("#recZone") && !q("#recToggle"));

qa(".audio-toggle button").find(b => b.dataset.ver === "zh").click();
check("listen-zh-only", qa(".sentence-zh.big").length === 6 && qa(".sentence-en").length === 0);
qa(".audio-toggle button").find(b => b.dataset.ver === "mix").click();
check("listen-mix-both", qa(".sentence-en").length === 6 && qa(".sentence-zh").length === 6);
qa(".audio-toggle button").find(b => b.dataset.ver === "en").click();

// 点词查义（本地词库：restaurant 场景 travel-airport 无 match → 在线失败 → 暂无网络释义）
q(".line-item .w").click();
check("word-pop-shown", !!q(".word-pop"));
q("#wpAdd").click();
setTimeout(() => {
  check("word-in-book", Object.keys(T.Store.get().wordbook).length === 1);
  check("word-pop-auto-closed", !q(".word-pop"));
  console.log("SYNC-PART-DONE");
  checkDimsLater();
}, 40);
function checkDimsLater() {}

// 收藏文案（已收藏/收藏）
q("#favBtn").click();
check("fav-saved", !!T.Store.get().favs["travel-airport:s0"]);
check("fav-chip-已收藏", q("#favBtn").textContent.includes("已收藏"));
q("#favBtn").click();
check("fav-removed", !T.Store.get().favs["travel-airport:s0"]);
q("#favBtn").click();
q("#masterBtn").click();
check("master-saved", T.Store.get().mastery["travel-airport:s0"] === "mastered");

// 上一个/下一个话题导航（travel 场景 3 个话题循环；下一话题已移到底部 chip 行）
const before = q(".page-title").textContent;
check("listen-nav-topic-btns", !!q("#prevT") && !!q("#nextT"));
q("#nextT").click();
check("nav-next-topic", q(".page-title").textContent !== before && qa(".line-item").length > 0);
q("#prevT").click();
// 情景对话：听读页 ctrl-row 的 🎭 入口
q("#btnDialog2").click();
check("dialog-setup", !!q("#rA") && !!q("#rB") && qa("[data-h]").length === 3);
q("#startBtn").click();
check("dialog-run-header", q(".page-title").textContent.includes("角色扮演"));
check("dialog-bubble-appeared", q("#stage").children.length > 0);

// 复习模块
T.setView(T.renderHome, null); T.render();
T.Store.setReviewWeak("travel-hotel:s1");
T.setView(T.renderReview, null); T.render();
check("review-item-listed", q(".ri-title").textContent.length > 3);
check("review-count-due", T.countDue() > 0);

// 个人中心（含生词本卡片）
T.setView(T.renderMe, null); T.render();
check("me-page-title", q(".page-title").textContent.includes("个人中心"));
check("me-wordbook", d.body.textContent.includes("生词本"));

T.setView(T.renderHome, null); T.render();
check("home-again-ok", qa(".res-cell").length === 3);

// 自定义语料：新建 → 机翻（stub）→ 保存 → 练习 → 删除
const flush = () => new Promise(r => setTimeout(r, 350));
(async () => {
  T.setView(T.renderHome, null); T.render();
  window.fetch = async () => ({ json: async () => ({ responseData: { translatedText: "TEST translation ok" }, responseStatus: 200, matches: [{ translation: "TEST short" }] }) });
  window.eval("openResource('custom')");
  check("custom-manage-page", d.body.textContent.includes("自定义对话") || d.body.textContent.includes("我的自定义"));
  window.eval("openScene('custom')"); // inline onclick 在 jsdom 不执行，直调等价
  check("custom-manage-empty", d.body.textContent.includes("新建对话场景"));
  q("#newBtn").click();
  q("#cName").value = "点咖啡";
  q("#cZh").value = "我想要一杯热美式\n请给我少糖";
  q("#trBtn").click(); await flush();
  check("custom-translated", (q("#cEn").value.match(/TEST short/g) || []).length === 2);
  q("#saveBtn").click(); await flush();
  const saved = T.Store.get().customTopics || [];
  check("custom-saved-topic", saved.length === 1);
  check("custom-topic-shape", saved[0].dialogs[0].lines.length === 2 && saved[0].dialogs[0].lines[0].en.startsWith("TEST"));

  T.setView(T.renderHome, null); T.render();
  window.eval("openTopic('" + saved[0].id + "')");
  check("custom-two-modes", !!q("#playerBar") && !!q("#btnDialog2"));
  check("custom-listen-lines", qa(".line-item").length === 2);

  T.setView(T.renderHome, null); T.render();
  window.eval("openResource('custom')");
  window.eval("openScene('custom')");
  check("custom-listed", qa(".recent-item").some(x => x.textContent.includes("点咖啡")));
  window.confirm = () => true;
  window.eval("delCustom('" + saved[0].id + "')");
  check("custom-deleted", (T.Store.get().customTopics || []).length === 0);

  // ① 改名检查
  T.setView(T.renderHome, null); T.render();
  check("app-renamed-xf", d.body.textContent.includes("XF 的口语练习助手"));
  check("app-renamed-custom", d.body.textContent.includes("我的自定义对话"));

  // ⑥ 即兴对话：随机场景 → 逐步走一轮（选提示说法 + 跳过 + 结算）
  q("#freeBtn").click(); await flush();
  check("free-run-layout", !!q("#freeTurn") && !!q("#turnMic") && !!q("#turnHint"));
  for (let t = 0; t < 10; t++) {
    await flush();
    const mic = q("#turnMic");
    if (mic) { q("#turnHint").click(); await flush(); const sug = q("#hintBox [data-sug]"); if (sug) sug.click(); else q("#turnSkip").click(); await flush(); }
  }
  await flush(); await flush();
  check("free-score-shown", d.body.textContent.includes("/100") || d.body.textContent.includes("/100\u200d"));
  check("free-std-dialog", d.body.textContent.includes("标准示范"));
  check("free-continue-btn", !!q("#freeContinueBtn"));
  check("free-retry-btn", !!q("#freeRetryBtn"));

  // ⑤ 角色扮演提示修复验证（全新一遍对话，稳定后检查提示为下一句=你的台词）
  T.setView(T.renderHome, null); T.render();
  window.eval("openTopic('travel-airport')");
  q("#btnDialog2").click();
  q("#startBtn").click();
  for (let k = 0; k < 6; k++) await flush();
  check("dialog-hint-next-user-line", d.body.textContent.includes("轮到你了"));

  // ② 自定义对话角色解析：A:/B: 前缀保存后听读页按角色显示
  window.eval("openResource('custom')"); window.eval("openScene('custom')");
  q("#newBtn").click();
  q("#cName").value = "面试聊天";
  q("#cEn").value = "A: Hey! Long time no chat.\nB: Oh hi! I'm hunting for a new job.\nA: How's it going so far?";
  q("#saveBtn").click(); await flush();
  const tRole = T.Store.get().customTopics.find(t => t.name === "面试聊天");
  check("role-parse-saved", !!tRole && tRole.dialogs[0].lines.filter(l => l.who === "A").length === 2);
  check("role-prefix-stripped", !tRole.dialogs[0].lines[0].en.startsWith("A:"));
  T.setView(T.renderHome, null); T.render();
  window.eval("openTopic('" + tRole.id + "')");
  check("listen-shows-role", d.body.textContent.includes("👤 A") && !d.body.textContent.includes("第 1 句"));

  // ① 选区收藏短语链路：模拟 selection → 弹条 → 保存
  window.getSelection = () => ({ toString: () => "had a few interviews", removeAllRanges: () => {} });
  window.eval("document.dispatchEvent(new Event('selectionchange'))");
  await new Promise(r => setTimeout(r, 120));
  check("phrase-bar-shown", !!q("#pbSave"));
  q("#pbSave").click(); await new Promise(r => setTimeout(r, 20));
  const phraseFav = Object.values(T.Store.get().favs).find(f => f.isPhrase && f.en === "had a few interviews");
  check("phrase-is-favourite", !!phraseFav);

  // 📄 英语阅读模块：独立列表（不入自定义对话）+ 听读页无角色扮演入口
  const rt = { id: "rt1", name: "英语阅读", icon: "📄", desc: "英语阅读 · 2 段", words: [], sentences: [], reading: true, dialogs: [{ title: "t", lines: [{ en: "Hello paragraph one.", zh: "" }, { en: "Second paragraph here.", zh: "" }] }] };
  T.Store.saveReadings([rt]);
  T.setView(T.renderHome, null); T.render();
  q("#readingBtn").click();
  check("reading-module-list", d.body.textContent.includes("我的阅读（1）"));
  window.eval("openTopic('rt1')");
  check("reading-listen-no-dialog", !!q("#playerBar") && !q("#btnDialog2"));
  check("reading-para-lines", qa(".line-item").length === 2);

  // ③ hero 新统计卡 + 日常场景练习区改名 + 上传资源流程
  T.setView(T.renderHome, null); T.render();
  check("hero-new-stats", d.body.textContent.includes("生词本") && !d.body.textContent.includes("累计分钟"));
  check("home-scene-rename", d.body.textContent.includes("日常场景练习"));
  check("home-added-res-button", d.body.textContent.includes("添加对话资源"));
  check("home-no-fav-section", !d.getElementById("view").textContent.includes("我的收藏 ‹") && !d.getElementById("view").textContent.includes("我的收藏<span"));

  // 加资源改为“直接选文件”流程：解析纯文本（等价于选中 txt 文件）→ 自动成品
  window.__f = { name: "日常英语500句.txt", text: async () => "Hello world. | 你好世界。\nA: How are you?\nB: I'm fine, thank you.\nSee you tomorrow." };
  window.eval("handleUploadResourceFile(window.__f)");
  await new Promise(r => setTimeout(r, 200));
  check("upload-resource-added", (T.Store.get().uploads || []).length === 1 && qa(".res-cell").length === 4);
  const up = T.Store.get().uploads[0];
  check("upload-grouped", up.icon === "📗" && up.topics.length === 1 && up.topics[0].dialogs[0].lines.length === 4);
  check("upload-roles-parsed", up.topics[0].dialogs[0].lines[1].who === "A");
  window.eval("openTopic('" + up.topics[0].id + "')");
  check("upload-listen-ok", qa(".line-item").length === 4);
  window.eval("openResource('" + up.sceneId + "')");
  check("upload-res-page", d.body.textContent.includes("日常英语500句"));

  // hero 打卡点击（点一次 → 今日已打卡 + 累计天数）
  T.setView(T.renderHome, null); T.render();
  window.eval("markToday(); renderHome()"); await new Promise(r => setTimeout(r, 30));
  check("checkin-label", q(".stat-label").textContent.includes("已打卡"));
  check("checkin-counted", (T.Store.get().checkins && Object.keys(T.Store.get().checkins).length) >= 1);

  console.log("PASS: " + pass + ", FAIL: " + fails.length);
  process.exit(fails.length ? 1 : 0);
})();
return;
