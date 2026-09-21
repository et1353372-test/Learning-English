/* ============ 路由 & 页面渲染 ============ */
const $ = sel => document.querySelector(sel);
const viewEl = $("#view");
let currentTab = "home";
let stateStack = []; // 页面返回栈 {fn, arg}
let learnTimer = null; // 学习时长计时
let pageAudio = []; // 复盘用音频对象
let appHistoryReady = false;

function restorePreviousView() {
  if (!stateStack.length) { viewFn = renderHome; viewArg = null; }
  else { const p = stateStack.pop(); viewFn = p.fn; viewArg = p.arg; }
  render();
}
function pushView(fn, arg) {
  stateStack.push({ fn: viewFn, arg: viewArg });
  if (appHistoryReady) history.pushState({ oralApp: true }, "");
  viewFn = fn; viewArg = arg; render();
}
let viewFn = renderHome, viewArg = null;
function render() {
  TTS.cancelled = true; TTS.stop();
  if (pageAudio) pageAudio.forEach(a => a.pause());
  if (typeof wordPopEl !== "undefined" && wordPopEl) { wordPopEl.remove(); wordPopEl = null; }
  viewEl.classList.remove("listen-mode");
  viewEl.scrollTop = 0;
  viewFn(viewArg);
  updateTabbar();
  startLearnTimer();
}
function updateTabbar() {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const map = { renderScene: "home", renderTopic: "home", renderListen: "home", renderDialogSetup: "home", renderReview: "review", renderMe: "me" };
  const cur = map[viewFn.name] || currentTab;
  document.querySelectorAll(".tab").forEach(t => { if (t.dataset.tab === cur) t.classList.add("active"); });
  const n = countDue();
  document.querySelectorAll('.tab[data-tab="review"] .tab-icon').forEach(i => i.innerHTML = "🔁" + (n ? `<span class="review-badge">${n}</span>` : ""));
}
function goBack() {
  if (appHistoryReady && stateStack.length) { history.back(); return; }
  restorePreviousView();
}
function setupAppHistory() {
  if (!("history" in window) || !("pushState" in history)) return;
  const rootState = { oralApp: true, root: true };
  try {
    history.replaceState(rootState, "");
    history.pushState(rootState, "");
    appHistoryReady = true;
    window.addEventListener("popstate", () => {
      if (stateStack.length) { restorePreviousView(); return; }
      history.pushState(rootState, "");
      if (viewFn !== renderHome) restorePreviousView();
    });
  } catch (e) { appHistoryReady = false; }
}
/* 动态资源列表：内置 + 用户上传解析出来的 */
function allResList() {
  const ups = (Store.get().uploads || []).map(u => ({ id: u.sceneId, name: u.name, icon: u.icon, desc: u.desc, sceneIds: [u.sceneId], uploaded: true }));
  const custom = RESOURCES.find(resource => resource.id === "custom");
  return RESOURCES.filter(resource => resource.id !== "custom").concat(ups, custom ? [custom] : []);
}
function openResource(resId) {
  if (resId === "custom") return renderCustomManage();
  const resource = allResList().find(r => r.id === resId);
  if (resource && (resource.uploaded || resource.sceneIds.length === 1)) return openScene(resource.sceneIds[0]);
  pushView(renderResource, resId);
}
function renderResource(resId) {
  const r = allResList().find(x => x.id === resId);
  if (!r) return renderReading();
  const folderLabel = r.folderLabel || "场景";
  viewEl.innerHTML = header(`${r.icon} ${r.name}`, r.desc) + `
    ${r.uploaded ? `<div style="text-align:right;margin-bottom:6px"><span class="chip" onclick="delUpload('${r.id}')">🗑 删除该资源</span></div>` : ""}
    <div class="section-title">📚 ${folderLabel}列表</div>
    <div class="scene-grid" style="grid-template-columns:repeat(2,1fr);">
      ${r.sceneIds.map(id => {
    const s = SCENES.find(x => x.id === id); if (!s) return "";
    return `<button class="scene-cell" onclick="openScene('${s.id}')">
          <div class="scene-icon">${s.icon}</div><div class="scene-name">${s.name}</div>
          <div class="scene-count">${s.topics.length} 个${r.folderLabel ? "小节" : "话题"}</div></button>`;
  }).join("")}
    </div>`;
}
function delUpload(sceneId) {
  const st = Store.get();
  const upload = (st.uploads || []).find(item => item.sceneId === sceneId);
  if (!upload) return;
  if (!confirm("确定删除这个上传的资源及其所有话题？相关的收藏、掌握和复习记录也会清除。")) return;
  const topicIds = new Set((upload.topics || []).map(topic => topic.id));
  st.uploads = (st.uploads || []).filter(u => u.sceneId !== sceneId);
  st.recent = (st.recent || []).filter(item => !topicIds.has(item.topicId));
  ["favs", "mastery", "review"].forEach(key => {
    Object.keys(st[key] || {}).forEach(itemId => {
      if ([...topicIds].some(topicId => itemId.startsWith(topicId + ":"))) delete st[key][itemId];
    });
  });
  Store.saveUploads(st.uploads);
  const sceneIndex = SCENES.findIndex(scene => scene.id === sceneId);
  if (sceneIndex >= 0) SCENES.splice(sceneIndex, 1);
  Store.save();
  toast("已删除"); currentTab = "home"; stateStack = []; viewFn = renderHome; viewArg = null; render();
}
/* 话题 → 直达听读 */
function syncUserContentScenes() { syncCustomScene(); syncReadingsScene(); syncUploadScenes(); }
function rememberTopic(topicId) {
  syncUserContentScenes();
  const f = findTopic(topicId);
  if (f) Store.addRecent(topicId, f.scene.id);
  return f;
}
function openScene(sceneId) { syncUploadScenes(); pushView(renderScene, sceneId); }
function openTopic(topicId) { if (rememberTopic(topicId)) pushView(renderListen, topicId); }
/* 兼容已经保存到本机的旧上传资源：仅修复导入残留字符，不改自定义对话。 */
function repairStoredUploadDialogLines() {
  const uploads = Store.get().uploads || [];
  let changed = false;
  uploads.forEach(upload => (upload.topics || []).forEach(topic => (topic.dialogs || []).forEach(dialog => {
    (dialog.lines || []).forEach(line => {
      const bilingual = splitImportedDialogBilingualLine(line.en || "");
      const en = bilingual.en;
      const zh = cleanImportedDialogText(line.zh || "") || bilingual.zh;
      if (line.en !== en || line.zh !== zh) {
        line.en = en;
        line.zh = zh;
        changed = true;
      }
    });
  })));
  if (changed) Store.saveUploads(uploads);
}
function syncUploadScenes() {
  repairStoredUploadDialogLines();
  (Store.get().uploads || []).forEach(u => {
    let s = SCENES.find(x => x.id === u.sceneId);
    if (!s) { s = { id: u.sceneId, name: u.name, icon: u.icon, desc: u.desc, topics: [] }; SCENES.push(s); }
    s.topics = u.topics || [];
  });
}
function header(title, sub) {
  return `<div class="page-header back-top">
    <button class="back-btn" onclick="goBack()">‹</button>
    <div><div class="page-title">${title}</div>${sub ? `<div class="page-sub">${sub}</div>` : ""}</div>
  </div>`;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1600);
}
function startLearnTimer() {
  clearInterval(learnTimer);
  learnTimer = setInterval(() => {
    if (["renderListen", "renderDialogRun", "renderTopic"].includes(viewFn.name)) Store.addLearnSeconds(30);
  }, 30000);
}

/* ---------- 首页 ---------- */
function checkinCount() {
  const dot = Object.keys(Store.get().checkins || {}).filter(d => Store.get().checkins[d]).length;
  return dot;
}
function markToday() {
  const key = new Date().toLocaleDateString();
  const st = Store.get();
  if (!st.checkins) st.checkins = {};
  if (st.checkins[key]) { toast(`✅ 今日已打卡（累计 ${checkinCount()} 天）`); return; }
  st.checkins[key] = Date.now();
  st.lastPractice = new Date().toDateString();
  Store.save(); toast(`🎉 今日打卡成功，已坚持 ${checkinCount()} 天`);
}
function clearRecentPractice() {
  if (!Store.get().recent.length) return;
  if (!confirm("确定清空最近练习吗？不会删除资源、收藏或学习记录。")) return;
  Store.clearRecent();
  toast("已清空最近练习");
  renderHome();
}
function renderHome() {
  syncUserContentScenes();
  const st = Store.get();
  const favN = Object.keys(st.favs).length;
  const wordN = Object.keys(st.wordbook).length;
  const today = new Date().toDateString() === st.lastPractice;
  let recentHtml = "";
  st.recent.forEach(r => {
    const f = findTopic(r.topicId); if (!f) return;
    recentHtml += `<div class="recent-item" onclick="openTopic('${r.topicId}')">
      <div class="ri-icon">${f.topic.icon}</div>
      <div><div class="ri-title">${f.topic.name}</div><div class="ri-sub">${f.scene.name}</div></div>
      <div class="arrow">›</div></div>`;
  });
  const allRes = allResList();
  const freeN = allFreeScenarios().length;
  const wordBookPage = () => pushView(renderWordbook, null);
  viewEl.innerHTML = `
    <div class="hero">
      <h1>XF 的口语练习助手 🗣️</h1>
      <p>生活 · 工作 · 旅行，碎片时间练口语</p>
      <div class="stats-row">
        <button class="stat-box stat-click" title="打卡" onclick="markToday();renderHome()"><div class="stat-num">${checkinCount()}</div><div class="stat-label">${today ? "✅ 已打卡" : "📅 打卡"}</div></button>
        <button class="stat-box stat-click" title="我的收藏" onclick="viewFn=renderMe;viewArg='fav';render()"><div class="stat-num">${favN}</div><div class="stat-label">⭐ 我的收藏</div></button>
        <button class="stat-box stat-click" title="生词本" onclick="window.__wb && window.__wb()"><div class="stat-num">${wordN}</div><div class="stat-label">📖 生词本</div></button>
      </div>
    </div>
    <div class="section-title">📚 日常场景练习<span class="more" id="addResBtn">＋ 添加对话资源</span></div>
    <input type="file" id="resFile" accept=".txt,.md,.pdf,text/plain,application/pdf" style="display:none">
    <div class="res-grid">
      ${allRes.map(r => {
    const topics = r.sceneIds.map(id => SCENES.find(s => s.id === id)).filter(Boolean).reduce((n, s) => n + s.topics.length, 0);
    return `<button class="res-cell" onclick="openResource('${r.id}')">
          <div class="res-icon">${r.icon}</div>
          <div style="flex:1;text-align:left"><div class="res-name">${r.name}</div>
          <div class="res-desc">${r.desc}</div>
          <div class="scene-count">${r.uploaded ? "1 个场景" : (r.folderCountLabel || r.sceneIds.length + " 个场景")} · ${topics} 个话题</div></div>
          <div class="arrow">›</div></button>`;
  }).join("")}
    </div>
    <div style="height:16px"></div>
    <div class="card" style="padding:14px;">
      <div class="section-title">🎓 即兴对话练习 <span style="font-size:11px;color:var(--muted);font-weight:400">${freeN} 组场景</span></div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">随机日常场景：APP 先开口，你接话；不知道怎么表达随时点提示；包含短对话与多轮情景，结束有评分和示范对话</div>
      <button class="btn-primary" style="width:100%;padding:12px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-weight:700;font-size:15px;cursor:pointer;" id="freeBtn">🎲 随机开始一场对话</button>
    </div>
    <div class="card" style="padding:14px;">
      <div class="section-title">📄 英语阅读练习</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">上传 txt / md / pdf 英语文章，自动分段成可听读的内容（英文原声 / 中文 / 中英对照，无角色扮演）</div>
      <button class="btn-primary" style="width:100%;padding:12px;border:none;border-radius:12px;background:#39b983;color:#fff;font-weight:700;font-size:15px;cursor:pointer;" id="readingBtn">📚 进入阅读练习</button>
    </div>
    <div class="section-title">🕘 最近练习<span class="more" id="clearRecentBtn" style="margin-right:10px">清空</span><span class="more" onclick="currentTab='home';viewFn=renderSceneAll;viewArg=null;render()">全部 ›</span></div>
    <div class="card" style="padding:6px 12px;">${recentHtml || `<div class="empty-block" style="padding:20px;">还没有练习记录，先去首页挑个话题吧</div>`}</div>`;
  window.__wb = wordBookPage;
  $("#freeBtn").onclick = () => {
    // 随机换场景，且连续两场不重复（避免只在这几个里打转的感觉）
    const pool = allFreeScenarios().filter(s => s.id !== lastFreeId);
    const sc = pool[Math.floor(Math.random() * pool.length)];
    lastFreeId = sc.id;
    pushView(renderFreeRun, sc);
  };
  $("#readingBtn").onclick = () => openReading();
  $("#clearRecentBtn").onclick = clearRecentPractice;
  $("#addResBtn").onclick = () => $("#resFile").click();
  $("#resFile").onchange = e => handleUploadResourceFile(e.target.files[0]);
}
/* ---------- 添加对话资源（上传解析成独立资源模块）---------- */
/* 添加对话资源：选择文件（txt/md/pdf），解析成“带中文翻译、可角色扮演”的成品素材库 */
async function handleUploadResourceFile(f) {
  if (!f) return;
  toast("⏳ 正在通读解析文件…");
  try {
    const text = await readArticleText(f);
    let dialogs = parseUploadDialogText(text);
    let mode = "dialogs";
    if (!dialogs.length) {
      dialogs = chunkUngroupedDialogLines(text, f.name);
      if (!dialogs.length) return toast("未识别到英文对话，请检查文件格式");
      mode = "lines";
    }
    const name = f.name.replace(/\.[^.]+$/, "").slice(0, 14);
    const ts = Date.now().toString(36);
    const res = { id: "ur" + ts, name, icon: "📗", sceneId: "u" + ts, topics: [], ts: Date.now(), desc: "" };
    dialogs.forEach((d, k) => {
      const tLines = normalizeRoles(d.lines.map(l => ({ en: l.en, zh: l.zh, who: l.who })));
      const title = d.title || name + " · " + (k + 1);
      res.topics.push({ id: "u" + ts + "_" + k, name: title, icon: "📗", desc: "对话场景 · " + tLines.length + " 句", words: [], sentences: [], dialogs: [{ title, lines: tLines }] });
    });
    res.desc = mode === "dialogs" ? ("解析自原文 · " + dialogs.length + " 组对话") : ("解析自原文 · " + res.topics.length + " 组");
    Store.saveUploads((Store.get().uploads || []).concat([res]));
    syncUploadScenes();
    toast("✅ 「" + name + "」已生成 " + res.topics.length + " 个话题，正在逐句生成中文…");
    translateUploadResource(res);
    currentTab = "home"; stateStack = []; viewFn = renderHome; viewArg = null; render();
  } catch (e) {
    toast("解析失败：可另存为 txt / md 再试");
  }
}
/* 后台把上传资源的台词机翻成中文，分话题落地（进度提示） */
async function translateUploadResource(res) {
  const lineCount = res.topics.reduce((n, t) => n + t.dialogs[0].lines.length, 0);
  let done = 0, fail = 0;
  for (const t of res.topics) {
    for (const l of t.dialogs[0].lines) {
      if (l.zh) { done++; continue; }
      if (done >= 300) break;
      const zh = await mtTranslate(l.en);
      if (zh) l.zh = zh; else fail++;
      done++;
      if (done % 10 === 0) {
        Store.saveUploads((Store.get().uploads || []).map(x => x.id === res.id ? res : x));
        syncUploadScenes();
        toast("🈶 翻译进度 " + done + "/" + Math.min(lineCount, 300) + "…");
      }
    }
    Store.saveUploads((Store.get().uploads || []).map(x => x.id === res.id ? res : x));
  }
  syncUploadScenes();
  toast("✅ 中文翻译完成（" + (done - fail) + " 句" + (fail ? "，失败 " + fail + " 行" : "") + ")");
}
/* 添加对话资源专用：保留缩略形式，只清理文件中多余的转义与空格。 */
function cleanImportedDialogText(text) {
  return String(text || "").replace(/[\p{Cc}\p{Cf}\u25A1\uFFFD]/gu, " ").replace(/\uFF07/g, "'").replace(/\\/g, "").replace(/\s+([,.;!?])/g, "$1").replace(/\s+/g, " ").trim();
}
function isImportedDialogMetadata(text) {
  return /^(?:适用难度|内容特点|使用方式|难度|说明|作者|来源)\s*[:：]/.test(text);
}
function splitImportedDialogBilingualLine(text) {
  const clean = cleanImportedDialogText(text);
  const parenthesized = clean.match(/^(.*?)[（(]\s*([\u3400-\u9fff][^）)]*)\s*[）)]\s*$/);
  const withoutNumber = value => value.trim().replace(/^\d{1,3}\s*[.、:：]\s*/, "").replace(/[（(][\s\u200B-\u200D\uFEFF]*$/, "").trim();
  if (parenthesized) return { en: withoutNumber(parenthesized[1]), zh: parenthesized[2].trim() };
  const chineseIndex = clean.search(/[\u3400-\u9fff]/);
  if (chineseIndex > 0 && /[A-Za-z]/.test(clean.slice(0, chineseIndex))) {
    return { en: withoutNumber(clean.slice(0, chineseIndex)), zh: clean.slice(chineseIndex).trim() };
  }
  return { en: withoutNumber(clean), zh: "" };
}
function isNumberedImportedDialogSentence(line) {
  const numbered = cleanImportedDialogText(line).match(/^\d{1,3}\s*[.、:：]\s*(.+)$/);
  if (!numbered) return false;
  const bilingual = splitImportedDialogBilingualLine(numbered[1]);
  return Boolean(bilingual.zh && /[.!?]["']?$/.test(bilingual.en));
}
function importedDialogHeading(text) {
  const line = cleanImportedDialogText(text);
  const markdown = line.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return markdown[1].trim();
  const chineseChapter = line.match(/^(第\s*[一二三四五六七八九十百零〇0-9]+(?:\s*篇(?:\s*章)?|\s*章|\s*部分|\s*单元)\s*.*)$/);
  if (chineseChapter) return chineseChapter[1].replace(/\s+/g, " ").trim();
  const structured = line.match(/^(?:CHAPTER|ARTICLE|LESSON|UNIT)\s*(\d{1,3}(?:\s*[-–.]\s*\d+)?)\s*[:：-]?\s*(.+)$/i);
  if (structured) return `${structured[1].replace(/\s*[-–.]\s*/g, "-")} ${structured[2]}`.trim();
  const numbered = line.match(/^(?:Dialogue\s+\d+(?:[-–.]\d+)?\s*[:：]|\d{1,3}\s*[.、:：])\s*(.+)$/i);
  return numbered && !isNumberedImportedDialogSentence(line) ? numbered[1].trim() : "";
}

/* 上传对话解析：按场景标题分组，并把 A: English（中文）拆为独立双语字段。 */
function parseUploadDialogText(raw) {
  if (!raw) return [];
  const dialogs = [];
  let current = null;
  const finish = () => {
    if (current && current.lines.filter(line => /[A-Za-z]/.test(line.en)).length >= 2) {
      dialogs.push({ title: current.title, lines: current.lines });
    }
  };
  const start = title => {
    finish();
    current = { title: title.replace(/\s+/g, " ").trim(), lines: [], speakers: [] };
  };
  raw.split(/\r?\n/).forEach(rawLine => {
    const line = cleanImportedDialogText(rawLine);
    if (!line || /^[-—_]{3,}$/.test(line) || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) return;
    if (/^LANGUAGE NOTES/i.test(line)) { finish(); current = null; return; }
    if (isImportedDialogMetadata(line)) return;

    const heading = importedDialogHeading(line);
    if (heading) { start(heading); return; }
    if (!current) return;

    const speaker = line.match(/^([A-Za-z][A-Za-z .'-]{0,30})\s*[:：]\s*(.+)$/);
    if (speaker && /[A-Za-z]/.test(speaker[2])) {
      const name = speaker[1].trim();
      if (!current.speakers.includes(name)) current.speakers.push(name);
      const text = splitImportedDialogBilingualLine(speaker[2]);
      if (text.en) current.lines.push({ who: current.speakers[0] === name ? "A" : "B", en: text.en, zh: text.zh });
      return;
    }

    const previous = current.lines[current.lines.length - 1];
    if (previous && /[\u3400-\u9fff]/.test(line) && !/[A-Za-z]/.test(line)) {
      previous.zh = line.replace(/^[（(]\s*|\s*[）)]$/g, "").trim();
      return;
    }
    if (previous && /[A-Za-z]/.test(line) && !isImportedDialogMetadata(line)) {
      const text = splitImportedDialogBilingualLine(line);
      previous.en += " " + text.en;
      if (text.zh) previous.zh = text.zh;
    }
  });
  finish();
  return dialogs;
}

function chunkUngroupedDialogLines(raw, filename) {
  const sections = [];
  let current = null;
  raw.split(/\r?\n/).forEach(rawLine => {
    const line = cleanImportedDialogText(rawLine);
    if (!line || /^[-—_]{3,}$/.test(line) || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line) || isImportedDialogMetadata(line)) return;
    const heading = importedDialogHeading(line);
    if (heading) {
      current = { title: heading, lines: [] };
      sections.push(current);
      return;
    }
    if (!current) return;
    const text = splitImportedDialogBilingualLine(line);
    if (!/[A-Za-z]/.test(text.en)) {
      const previous = current.lines[current.lines.length - 1];
      if (previous && /[\u3400-\u9fff]/.test(line)) previous.zh += line;
      return;
    }
    current.lines.push(text);
  });
  if (sections.some(section => section.lines.length >= 2)) {
    return sections.map(section => ({
      title: section.title,
      lines: section.lines.map((line, index) => ({ who: index % 2 === 0 ? "A" : "B", en: line.en, zh: line.zh })),
    })).filter(section => section.lines.length >= 2);
  }
  const lines = parseUploadLines(raw)
    .filter(line => /[A-Za-z]/.test(line.en))
    .map(line => {
      const speaker = line.en.match(/^([A-Za-z][A-Za-z .'-]{0,30})\s*[:：]\s*(.+)$/);
      const text = speaker ? speaker[2].trim() : line.en;
      return { who: speaker && /^A$/i.test(speaker[1]) ? "A" : "B", en: text, zh: line.zh };
    });
  const size = 10;
  return Array.from({ length: Math.ceil(lines.length / size) }, (_, index) => ({
    title: filename.replace(/\.[^.]+$/, "") + " · " + (index + 1),
    lines: lines.slice(index * size, (index + 1) * size),
  })).filter(dialog => dialog.lines.length >= 2);
}

/* 兼容旧版 PDF 标题格式的解析入口。 */
function parsePdfDialogText(raw) {
  if (!raw) return [];
  const headings = [...raw.matchAll(/Dialogue\s+(\d+[-–.]\d+)\s*[:：]\s*([^\n]{1,80})/g)];
  if (headings.length < 2) return [];
  const dialogs = [];
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h].index + headings[h][0].length;
    let seg = raw.slice(start, h + 1 < headings.length ? headings[h + 1].index : raw.length);
    seg = seg.replace(/--\s*\d+ of \d+\s*--/g, "\n");
    const ni = seg.search(/LANGUAGE NOTES/i);
    if (ni >= 0) seg = seg.slice(0, ni);
    const lines = []; let lastSp = null;
    seg.split(/\r?\n/).forEach(r0 => {
      const L = r0.replace(/\s+/g, " ").trim();
      if (!L || L.length < 2) return;
      const sm = L.match(/^([A-Z][A-Za-z'’\. -]{0,30})[:]\s+(.+)$/);
      if (sm) {
        const sp = sm[1].trim();
        const dst = lines[lines.length - 1];
        if (lastSp === sp && dst) dst.en += " " + sm[2].trim();
        else lines.push({ en: sm[2].trim() });
        lastSp = sp; return;
      }
      if (lastSp && lines.length && !/^\d+$/.test(L) && !/^(Dialogue|LANGUAGE)/i.test(L) && L.split(" ").length < 40) {
        lines[lines.length - 1].en += " " + L;
      }
    });
    const ok = lines.filter(l => l.en && l.en.split(" ").length >= 2);
    if (ok.length >= 2) dialogs.push({ title: headings[h][2].trim().replace(/\s+/g, " "), lines: ok.map(l => ({ en: l.en, zh: "" })) });
  }
  return dialogs;
}
/* 解析一行：支持 “EN | ZH” “EN = ZH”，纯英文（中文留空）；说话人前缀由 normalizeRoles 处理 */
function parseUploadLines(raw) {
  const lines = raw.split(/\r?\n/).map(line => String(line || "").replace(/\\/g, "").replace(/\s+([,.;!?])/g, "$1").replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = lines.map(line => {
    let m = line.match(/^(.+?)\s*[|｜]\s*(.+)$/);
    if (!m) m = line.match(/^(.+?)\s*=\s*(.+)$/);
    if (m && m[1].trim() && m[2].trim()) return { en: m[1].trim(), zh: m[2].trim() };
    const parts = line.match(/^(.*?)[（(]\s*([\u3400-\u9fff][^）)]*)\s*[）)]\s*$/);
    return parts ? { en: parts[1].trim(), zh: parts[2].trim() } : { en: line, zh: "" };
  });
  return out;
}

/* 生词本列表页 */function renderWordbook() {
  const st = Store.get();
  const words = Object.entries(st.wordbook).map(([w, info]) => ({ w, ...info })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  viewEl.innerHTML = header("📖 生词本", words.length + " 个单词 · 点喇叭听发音") + `
    <button class="btn-primary" style="width:100%;padding:11px;border:none;border-radius:12px;color:var(--primary);background:#fff;font-weight:700;cursor:pointer;margin-bottom:14px;box-shadow:var(--shadow)" onclick="goBack()">‹ 返回首页</button>
    ${words.length ? words.map(x => `<div class="card" style="padding:14px">
      <div style="font-size:16px;font-weight:800">${x.w}</div>
      ${(x.phonUk || x.phonUs || x.phonetic) ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">${x.phonUk ? "英 " + x.phonUk : ""}${x.phonUs ? (x.phonUk ? "　美 " : "美 ") + x.phonUs : (!x.phonUk && x.phonetic ? x.phonetic : "")}</div>` : ""}
      <div style="font-size:12px;color:var(--muted);margin-top:4px">${x.zh || x.def || ""}</div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="chip on" onclick="TTS.cancelled=false;TTS.speak('${x.w.replace(/'/g, "\\'")}','en-US')">🔊 朗读</button>
        <span style="font-size:11px;color:var(--muted)">${x.topicName || ""}</span>
        <span class="chip" style="margin-left:auto" onclick="Store.removeWord('${x.w}');viewFn=renderWordbook;viewArg=null;render();toast('已移出')">🗑</span>
      </div></div>`).join("") : `<div class="empty-block">📖 生词本还是空的<br>在听读页点击单词加入</div>`}`;
}

/* ---------- 全部场景话题 ---------- */
function renderSceneAll() {
  viewEl.innerHTML = header("全部话题", "三大场景 · 所有话题") +
    SCENES.map(s => `
    <div class="section-title">${s.icon} ${s.name}</div>
    ${s.topics.map(t => topicCardHtml(t, s)).join("")}`).join("");
}
function topicCardHtml(t, s) {
  const mid = `${t.id}:s0`;
  const m = Store.get().mastery[mid];
  const tag = m === "mastered" ? `<span class="tag ok">已掌握</span>` : m === "weak" ? `<span class="tag warn">待加强</span>` : "";
  return `<button class="topic-card" onclick="openTopic('${t.id}')">
    <div class="topic-icon">${t.icon}</div>
    <div style="flex:1"><div class="topic-title">${t.name}</div><div class="topic-desc">${t.desc}</div>
    <div><span class="tag">${t.sentences.length} 短句</span><span class="tag">${t.dialogs.length} 对话</span>${tag}</div></div>
    <div class="arrow" style="color:#c6cad6">›</div></button>`;
}

/* ---------- 场景话题列表 ---------- */
// 场景入口：自定义语料引导到管理页
function renderScene(sceneId) {
  if (sceneId === "custom") return renderCustomManage();
  const s = SCENES.find(x => x.id === sceneId);
  const uploaded = (Store.get().uploads || []).some(item => item.sceneId === sceneId);
  viewEl.innerHTML = header(`${s.icon} ${s.name}`, s.desc) +
    `${uploaded ? `<div style="text-align:right;margin-bottom:8px"><button class="chip" id="deleteUploadBtn">🗑 删除整个资源</button></div>` : ""}<div class="section-title">📚 话题列表</div>` + s.topics.map(t => topicCardHtml(t, s)).join("");
  if (uploaded) $("#deleteUploadBtn").onclick = () => delUpload(sceneId);
}

/* ---------- 话题详情：两种模式 ---------- */
function renderTopic(topicId) {
  const f = findTopic(topicId); const { topic, scene } = f;
  Store.addRecent(topicId, scene.id); Store.save();
  viewEl.innerHTML = header(`${topic.icon} ${topic.name}`, scene.name + " · " + topic.desc) + `
    <div class="card" style="text-align:center;padding:26px 16px;">
      <div style="font-size:40px">${topic.icon}</div>
      <div style="font-size:17px;font-weight:800;margin-top:8px">${topic.name}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">${topic.desc}</div>
      <div style="display:flex;gap:12px;margin-top:18px;">
        <button class="mode-btn" style="padding:20px 8px" id="btnListen">🎧<b style="font-size:16px">听读学习</b><small>完整对话 · 三种音频 · 点击单词查词</small></button>
        ${topic.reading ? "" : `<button class="mode-btn gold" style="padding:20px 8px" id="btnDialog">🎭<b style="font-size:16px">情景对话</b><small>角色扮演 · 提示分级</small></button>`}
      </div>
    </div>
    ${topic.reading ? "" : `<div style="text-align:center;font-size:11px;color:var(--muted);">点击对话里单词可查词 · 加入生词本</div>`}`;
  $("#btnListen").onclick = () => pushView(renderListen, topicId);
  $("#btnDialog").onclick = () => pushView(renderDialogSetup, topicId);
}

/* ---------- 模式A：听读学习 ---------- */
function renderListen(topicId) {
  const f = rememberTopic(topicId); if (!f) return renderHome(); const { topic, scene } = f;
  const lines = (topic.dialogs && topic.dialogs[0]) ? topic.dialogs[0].lines : topic.sentences;
  const tIdx = scene.topics.findIndex(t => t.id === topicId);
  let idx = 0, version = "en", loopAll = false, playing = false;
  const itemId = i => `${topicId}:s${i}`;
  const verLabel = { en: "🇬🇧 英文", zh: "🀄 中文", mix: "🔀 中英对照" };
  /* 单词可点击：把英文台词拆成可点单词 */
  const wordsHtml = en => en.split(/\s+/).map(w => {
    const pure = w.replace(/[^A-Za-z'’-]/g, "");
    return `<span class="w" data-w="${pure}">${w}</span>`;
  }).join(" ");
  const lineHtml = (l, ver) =>
    ver === "zh" ? `<div class="sentence-zh big">${l.zh}</div>`
    : ver === "mix" ? `<div class="sentence-en">${wordsHtml(l.en)}</div><div class="sentence-zh">${l.zh}</div>`
    : `<div class="sentence-en">${wordsHtml(l.en)}</div>`;
  viewEl.innerHTML = header(`🎧 ${topic.name} · 听读学习`, "完整原对话 · 点句子=单句播 · 播放键=连续播放")
    + `<div id="senPanel"></div>
    <div class="player-bar" id="playerBar">
      <div class="audio-toggle">
        <button data-ver="en">🇬🇧 英文</button>
        <button data-ver="zh">🀄 中文</button>
        <button data-ver="mix">🔀 中英对照</button>
      </div>
      <div class="speed-slider"><span>字号</span><button class="chip" id="fsDn">A-</button><button class="chip" id="fsUp">A+</button><span style="margin-left:auto">语速</span><input type="range" id="rate" min="0.75" max="1.25" step="0.05" value="${Store.get().settings.speed}"><b id="rateV">${Store.get().settings.speed}x</b></div>
      <div class="ctrl-row">
        <button id="prevT" style="font-size:9px">⏪ 上一话题</button>
        <button id="loopBtn" class="${loopAll ? "chip on" : ""}" style="font-size:11px">🔁 循环</button>
        <button class="play-main" id="main">▶</button>
        <button id="nextT" style="font-size:9px">下一话题 ⏩</button>
        ${topic.reading ? "" : `<button id="btnDialog2" style="font-size:9px">🎭 情景对话</button>`}
      </div>
    </div>
    <div class="chip-row" id="chipRow"></div>`;
  viewEl.classList.add("listen-mode");
  function draw() {
    $("#senPanel").innerHTML = lines.map((l, i) => `<div class="line-item ${i === idx ? "current" : ""}" data-i="${i}">
        <div class="line-no">${l.speaker ? "👤 " + l.speaker : (l.who ? "👤 " + l.who : "第 " + (i + 1) + " 句")}</div>${lineHtml(l, version)}
      </div>`).join("");
    bindLineEvents();
    const id = itemId(idx);
    $("#chipRow").innerHTML = `
      <span class="chip${Store.get().favs[id] ? " on" : ""}" id="favBtn" style="${Store.get().favs[id] ? "background:#fff0ef;color:var(--warn);font-weight:700" : ""}">${Store.get().favs[id] ? "❤️ 已收藏" : "🤍 收藏"}</span>
      <span class="chip ${Store.get().mastery[id] === "mastered" ? "mastered" : ""}" id="masterBtn">${Store.get().mastery[id] === "mastered" ? "✅ 已掌握" : "✅ 标记掌握"}</span>
      <span class="chip ${Store.get().mastery[id] === "weak" ? "on" : ""}" id="weakBtn">${Store.get().mastery[id] === "weak" ? "⚠️ 薄弱" : "⚠️ 加入复习"}</span>`;
    $("#favBtn").onclick = () => {
      const sen = lines[idx];
      const on = Store.toggleFav(id, { en: sen.en, zh: sen.zh, topicName: topic.name, sceneId: scene.id });
      toast(on ? "❤️ 已收藏" : "已取消收藏"); draw();
    };
    $("#masterBtn").onclick = () => {
      const mastered = Store.get().mastery[id] === "mastered";
      Store.markMastery(id, mastered ? null : "mastered");
      if (!mastered) { delete Store.get().review[id]; Store.save(); }
      toast(mastered ? "已取消掌握" : "✅ 标记为已掌握"); draw();
    };
    $("#weakBtn").onclick = () => {
      const weak = Store.get().mastery[id] === "weak";
      if (weak) { Store.markMastery(id, null); delete Store.get().review[id]; Store.save(); toast("已移出复习"); }
      else { Store.setReviewWeak(id); toast("⚠️ 已加入复习计划"); }
      draw(); updateTabbar();
    };
    document.querySelector(`.audio-toggle [data-ver="${version}"]`).classList.add("active");
    viewEl.style.setProperty("--line-fs", (Store.get().settings.fontSize || 17) + "px");
    const cur = document.querySelector(".line-item.current");
    if (cur && cur.scrollIntoView && playing) cur.scrollIntoView({ block: "nearest" });
  }
  function bindLineEvents() {
    document.querySelectorAll(".line-item").forEach(el => el.onclick = e => {
      // 有文字选区（正在划选）时不触发播放，避免选完短语后整句被读出来
      const sel = window.getSelection ? String(window.getSelection()).trim() : "";
      if (sel.length > 0 || e.target.classList.contains("w")) return;
      if (playing) { TTS.stop(); playing = false; }
      idx = +el.dataset.i; draw(); playOne();
    });
    document.querySelectorAll(".line-item .w[data-w]").forEach(sp => {
      sp.onclick = e => {
        e.stopPropagation(); e.preventDefault();
        // 划选句子/短语时交给句子翻译浮条，不弹单词面板（句子翻译只要中文，不要音标）
        const sel = window.getSelection ? String(window.getSelection()).trim() : "";
        if (sel.length > 0) return;
        if (sp.dataset.w) showWordPop(sp.dataset.w, topic);
      };
    });
  }
  const setVer = v => {
    version = v;
    document.querySelectorAll(".audio-toggle button").forEach(b => b.classList.remove("active"));
    document.querySelector(`.audio-toggle [data-ver="${v}"]`).classList.add("active");
    draw(); // 仅切换展示方式，不触发播放
  };
  document.querySelectorAll(".audio-toggle button").forEach(b => b.onclick = () => setVer(b.dataset.ver));

  /* 播放永远是英文原声：单句 / 连播（含整段循环） */
  async function playOne() {
    playing = true; $("#main").textContent = "⏸"; TTS.cancelled = false;
    await TTS.playMaterial([lines[idx]], "en", +$("#rate").value, null);
    playing = false; $("#main").textContent = "▶";
  }
  async function playAll() {
    TTS.cancelled = false;
    do {
      playing = true; $("#main").textContent = "⏸";
      for (let i = idx; i < lines.length; i++) {
        idx = i; draw();
        await TTS.playMaterial([lines[i]], "en", +$("#rate").value, null);
        if (TTS.cancelled) { playing = false; $("#main").textContent = "▶"; return; }
      }
      idx = 0;
    } while (loopAll && !TTS.cancelled);
    playing = false; $("#main").textContent = "▶";
  }
  $("#main").onclick = () => {
    if (playing) { TTS.cancelled = true; playing = false; $("#main").textContent = "▶"; return; }
    playAll();
  };
  $("#loopBtn").onclick = () => {
    loopAll = !loopAll;
    $("#loopBtn").className = loopAll ? "chip on" : "";
    $("#loopBtn").style.fontWeight = loopAll ? 700 : 400;
    toast(loopAll ? "🔁 已开启循环连续播放" : "已关闭循环");
  };
  function jumpTopic(dir) {
    TTS.stop(); playing = false; recOpen = false;
    const nid = scene.topics[(tIdx + dir + scene.topics.length) % scene.topics.length].id;
    stateStack.pop(); pushView(renderListen, nid);
  }
  $("#prevT").onclick = () => jumpTopic(-1);
  $("#nextT") && ($("#nextT").onclick = () => jumpTopic(1));
  $("#btnDialog2") && ($("#btnDialog2").onclick = () => pushView(renderDialogSetup, topicId));
  $("#fsUp").onclick = () => { const st = Store.get(); st.settings.fontSize = Math.min(26, (st.settings.fontSize || 17) + 1); Store.save(); draw(); };
  $("#fsDn").onclick = () => { const st = Store.get(); st.settings.fontSize = Math.max(12, (st.settings.fontSize || 17) - 1); Store.save(); draw(); };
  $("#rate").oninput = e => { $("#rateV").textContent = (+e.target.value).toFixed(2).replace(/\.?0+$/, "") + "x"; };
  $("#rate").onchange = e => { Store.get().settings.speed = +e.target.value; Store.save(); };
  draw();
}
/* 掌握/收藏按钮通用绑定 */
function bindMarkBtns(id, redraw) {
  document.querySelectorAll(`[data-fav="${id}"]`).forEach(el => el.onclick = () => {
    const topic = findTopic(id.split(":")[0]).topic;
    const i = +id.split(":s")[1];
    const src = (topic.dialogs && topic.dialogs[0]) ? topic.dialogs[0].lines : topic.sentences;
    const sen = src[i] || src[0];
    const on = Store.toggleFav(id, { en: sen.en, zh: sen.zh, topicName: topic.name, sceneId: findTopic(topic.id).scene.id });
    toast(on ? "⭐ 已收藏" : "已取消收藏"); redraw && redraw();
  });
  document.querySelectorAll(`[data-master="${id}"]`).forEach(el => el.onclick = () => {
    const mastered = Store.get().mastery[id] === "mastered";
    Store.markMastery(id, mastered ? null : "mastered");
    if (!mastered) { delete Store.get().review[id]; Store.save(); }
    toast(mastered ? "已取消掌握" : "✅ 标记为已掌握"); redraw && redraw();
  });
  document.querySelectorAll(`[data-weak="${id}"]`).forEach(el => el.onclick = () => {
    const weak = Store.get().mastery[id] === "weak";
    if (weak) { Store.markMastery(id, null); delete Store.get().review[id]; Store.save(); toast("已移出复习"); }
    else { Store.setReviewWeak(id); toast("⚠️ 已加入复习计划"); }
    redraw && redraw();
    updateTabbar();
  });
}

/* ---------- 模式B：情景对话 ---------- */
function renderDialogSetup(topicId) {
  const f = findTopic(topicId);
  const d = f.topic.dialogs[0];
  let role = "B", hint = "both";
  viewEl.innerHTML = header(`🎭 ${f.topic.name} · 情景对话`, d.title + "（" + d.lines.length + " 句）") + `
    <div class="card">
      <div class="section-title">👥 选择你要扮演的角色</div>
      <div class="level-row">
        <button class="level-btn" id="rB">🙋 我演 B（我方开口机位=第2句）</button>
        <button class="level-btn" id="rA">🙋 我演 A（先开口机位=第1句）</button>
      </div>
      <div class="section-title" style="margin-top:16px">💡 台词提示等级</div>
      <div class="level-row">
        <button class="level-btn" data-h="none">🔒 无提示（高阶）</button>
        <button class="level-btn" data-h="zh">🀄 中文提示（中阶）</button>
        <button class="level-btn" data-h="both">📖 中英对照（入门）</button>
      </div>
    </div>
    <button class="btn-primary btn-primary" style="width:100%;padding:14px;border-radius:14px;font-size:16px;font-weight:700;border:none;cursor:pointer;" id="startBtn">开始对话 ▶</button>
    <div class="card" style="margin-top:14px">
      <div class="section-title">🗣️ 对话剧本</div>
      ${d.lines.map(l => `<div style="font-size:12px;padding:4px 0;color:var(--muted)"><b style="color:${l.who === 'A' ? 'var(--primary)' : '#e67e22'}">${l.who === 'A' ? '🧔 对方' : '🙋 我'}</b>：${l.en} <span style="opacity:.6">(${l.zh})</span></div>`).join("")}
    </div>`;
  $("#rB").classList.add("active");
  $("#rB").onclick = () => { role = "B"; $("#rB").classList.add("active"); $("#rA").classList.remove("active"); };
  $("#rA").onclick = () => { role = "A"; $("#rA").classList.add("active"); $("#rB").classList.remove("active"); };
  document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { hint = b.dataset.h; document.querySelectorAll("[data-h]").forEach(x => x.classList.remove("active")); b.classList.add("active"); });
  $("#startBtn").onclick = () => pushView(renderDialogRun, { topicId, d, role, hint });
}

let dialogRecordings = [];
function renderDialogRun(cfg) {
  const { d, role } = cfg;
  const partner = role === "A" ? "B" : "A";
  let i = 0; dialogRecordings = []; let recording = false;
  viewEl.innerHTML = header("🎭 角色扮演中", `你扮演 ${role}，APP 扮演 ${partner}`) + `
    <div style="display:flex;gap:6px;margin-bottom:12px;align-items:center;">
      <span class="chip on">提示：${{none: "无", zh: "中文", both: "中英对照"}[cfg.hint]}</span>
      <span class="chip" id="turnLabel"></span>
    </div>
    <div id="stage"></div>
    <div class="hint-box" id="hintBox"></div>
    <div class="stage-actions" id="actions"></div>
    <div id="endBox"></div>`;

  function addBubble(who, text, zh, user, rec) {
    const stage = $("#stage");
    const div = document.createElement("div");
    div.className = user ? "bubble user" : "bubble";
    div.innerHTML = `<div class="avatar">${who}</div>
      <div class="bubble-content">${text}${cfg.hint !== "none" ? `<span class="bubble-zh">${zh}</span>` : ""}
        ${rec ? `<div class="b-funcs b-func show" data-url="${rec}">🔊 播放我的这段录音</div>` : ""}</div>`;
    stage.appendChild(div);
    stage.querySelectorAll(".b-func").forEach(el => {
      if (el.dataset.bound) return; el.dataset.bound = 1;
      el.onclick = () => new Audio(el.dataset.url).play();
    });
    stage.scrollTop = stage.scrollHeight;
    viewEl.scrollTop = viewEl.scrollHeight;
  }
  function hintHtml(line) {
    if (cfg.hint === "both") return `<div style="font-size:15px;font-weight:700">${line.en}</div><div style="font-size:12px;color:var(--muted);margin-top:6px">${line.zh}</div>`;
    if (cfg.hint === "zh") return `<div style="font-size:14px;color:var(--muted)">${line.zh}</div>`;
    return `<div style="font-size:13px;color:#999">🔒 无提示：凭记忆说出台词，说完点下方按钮</div>`;
  }
  function updateHintBox(line) {
    $("#turnLabel").textContent = "第 " + (i + 1) + "/" + d.lines.length + " 句";
    if (!line) $("#hintBox").innerHTML = "";
    else $("#hintBox").innerHTML = `<div style="font-size:11px;color:var(--primary);font-weight:700;margin-bottom:6px">✕ 轮到你了！下面提示的是你的第 ${i + 1} 句台词</div>${hintHtml(line)}`;
  }
  async function playPartner(id) {
    TTS.cancelled = false;
    await TTS.speak(d.lines[id].en, "en-US", Store.get().settings.speed || 1);
  }
  function showRecordBtn(line) {
    const box = $("#hintBox");
    let b = document.createElement("button");
    b.className = "btn-danger btn-primary btn-primary";
    b.style.cssText = "background:var(--primary);border:none;color:#fff;padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer;margin-top:8px;";
    b.textContent = "● 录音并说出台词";
    b.onclick = async () => {
      if (recording) return;
      try { await Recorder.start(); } catch (e) { toast("无法访问麦克风"); return; }
      recording = true; b.textContent = "🔴 录音中…说完请点击 [■ 我说完了]";
      b.disabled = false;
      b.onclick = async () => {
        const rec = await Recorder.stop();
        dialogRecordings[i] = rec.url;
        recording = false;
        addBubble(role, line.en, line.zh, true, rec.url);
        b.remove();
        $("#actions").innerHTML = `<button class="btn-primary" id="nextStep">说得不错，继续 ▶</button>`;
        $("#nextStep").onclick = () => next();
      };
    };
    box.appendChild(b);
  }
  const userLine = id => d.lines[id].who === role;
  async function step() {
    TTS.cancelled = true; TTS.stop();
    // 连续的“对方台词”自动连播推进，直到轮到用户
    while (i < d.lines.length && !userLine(i)) {
      const line = d.lines[i];
      addBubble(line.speaker || line.who, line.en, line.zh, false, null);
      $("#hintBox").innerHTML = `<div style="font-size:13px;color:var(--muted)">🔊 对方正在说话…</div>`;
      $("#actions").innerHTML = "";
      await playPartner(i);
      if (TTS.cancelled) return;
      i++;
    }
    $("#turnLabel").textContent = "第 " + (i + 1) + "/" + d.lines.length + " 句";
    if (i >= d.lines.length) return endReplay();
    // 现在轮到用户了：提示的就是“你的台词 = 下一句”
    $("#hintBox").innerHTML = `<div style="font-size:13px;color:var(--muted)">✕ 轮到你了！提示的是你的下一句台词</div>`;
    updateHintBox(d.lines[i]);
    showRecordBtn(d.lines[i]);
  }
  function next() {
    i++;
    $("#actions").innerHTML = "";
    if (i >= d.lines.length) endReplay(); else step();
  }
  async function endReplay() {
    Store.addDialogDone(); Store.save();
    $("#hintBox").style.display = "none";
    $("#actions").innerHTML = "";
    // 结果卡：复盘 + 复习标记
    $("#endBox").innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:20px;font-weight:800">🎉 对话完成！</div>
      <div style="font-size:12px;color:var(--muted);margin:6px 0 14px">回放复盘一遍会更牢固</div>
      <button class="btn-primary" id="replayBtn" style="border:none;background:var(--primary);color:#fff;padding:12px 22px;border-radius:12px;font-weight:700;cursor:pointer">🎬 回放整段对话</button><br><br>
      <button id="masterBtn" style="border:1.5px solid var(--primary);background:#fff;color:var(--primary);padding:12px 22px;border-radius:12px;font-weight:700;cursor:pointer;">✅ 标记已掌握</button>
      <button id="weakBtn" style="border:1.5px solid #ffd3cc;background:#fff;color:var(--warn);padding:12px 22px;border-radius:12px;font-weight:700;cursor:pointer;">⚠️ 标记薄弱</button>
    </div>`;
    $("#replayBtn").onclick = async () => {
      TTS.cancelled = false;
      for (let k = 0; k < d.lines.length; k++) {
        if (TTS.cancelled) return;
        await TTS.speak(d.lines[k].en, "en-US", Store.get().settings.speed || 1);
        if (dialogRecordings[k]) await playAudio(dialogRecordings[k]);
        else if (userLine(k)) await new Promise(r => setTimeout(r, 200));
      }
      toast("回放结束");
    };
    $("#masterBtn").onclick = () => {
      Store.markMastery(`${cfg.topicId}:d0`, "mastered");
      delete Store.get().review[`${cfg.topicId}:d0`];
      Store.save(); toast("✅ 已标记掌握");
    };
    $("#weakBtn").onclick = () => {
      Store.setReviewWeak(`${cfg.topicId}:d0`);
      toast("⚠️ 已加入复习计划");
      updateTabbar();
    };
  }
  async function playAudio(url) { await new Promise(r => { const a = new Audio(url); pageAudio.push(a); a.onended = r; a.onerror = r; a.play(); }); }
  // 开场
  step();
}

/* 短语选区浮动条：听读页里选中文字后出现，可一键收藏该短语 */
let phraseBarEl = null;
function setupPhraseSelection() {
  if (phraseBarEl) return;
  phraseBarEl = document.createElement("div");
  phraseBarEl.style.display = "none";
  document.body.appendChild(phraseBarEl);
  const check = () => {
    const sel = window.getSelection ? String(window.getSelection()) : "";
    let onListen = viewFn === renderListen || viewFn.name === "renderListen";
    if (!onListen || !sel || sel.trim().length < 2) { phraseBarEl.style.display = "none"; return; }
    // 划选翻译句子时，若残留单词面板（带音标）一并关闭：句子翻译只展示中文
    if (typeof wordPopEl !== "undefined" && wordPopEl && wordPopEl.isConnected) wordPopEl.remove();
    const phrase = sel.trim().replace(/\s+/g, " ");
    let meaning = "";
    phraseBarEl.className = "word-pop phrase-pop";
    phraseBarEl.style.display = "block";
    phraseBarEl.innerHTML = `<div style="font-size:15px;font-weight:800;margin-bottom:6px">${phrase.replace(/</g, "&lt;")}</div>
      <div class="wp-def" id="pbDef" style="min-height:16px"></div>
      <div class="wp-actions">
        <button class="chip on" id="pbListen">🔊 朗读</button>
        <button class="chip" id="pbTrans">🌐 翻译</button>
        <button class="chip on" id="pbSave">⭐ 收藏</button>
        <button class="chip" id="pbX">✕</button>
      </div>`;
    $("#pbX").onclick = () => { phraseBarEl.style.display = "none"; window.getSelection && window.getSelection().removeAllRanges(); };
    $("#pbListen").onclick = () => { TTS.cancelled = false; TTS.speak(phrase, "en-US", 1); };
    $("#pbTrans").onclick = async () => {
      const tEl = $("#pbTrans"); if (tEl) tEl.textContent = "⏳ 翻译中…";
      const zh = await mtZh(phrase);
      if (tEl) tEl.textContent = "🌐 翻译";
      meaning = zh || "";
      const d2 = $("#pbDef");
      if (d2) d2.textContent = meaning ? "释义：" + meaning : "翻译失败，仍可收藏";
    };
    $("#pbSave").onclick = () => {
      const pid = "p" + Date.now().toString(36);
      const topicId = viewArg;
      const ft = findTopic(topicId) || {};
      Store.toggleFav(pid, { en: phrase, zh: meaning, isPhrase: true, topicName: ft.topic ? ft.topic.name : "短语收藏", sceneId: ft.scene ? ft.scene.id : "custom" });
      toast("⭐ 短语已收藏" + (meaning ? "：" + meaning : "")); phraseBarEl.style.display = "none";
      window.getSelection && window.getSelection().removeAllRanges();
      updateTabbar();
    };
  };
  document.addEventListener("selectionchange", () => setTimeout(check, 60));
  document.addEventListener("touchend", () => setTimeout(check, 120));
}

/* ---------- 随机即兴对话练习 ---------- */
let lastFreeId = null;
const BASE_FREE_SCENARIO_TAILS = {
  "f-grocery": [
    { who: "A", en: "The checkout is at the front. Do you need help finding anything else?", zh: "收银台在前面。还需要我帮您找别的东西吗？" },
    { who: "B", dir: "确认已经买齐并再次道谢", sugs: [{ en: "No, I'm all set. Thanks again for your help.", zh: "不用了，我都买齐了。再次谢谢你的帮助。" }] },
  ],
  "f-trip": [
    { who: "A", en: "Great. Let's confirm the dates tonight so we can book everything.", zh: "太好了。今晚确认日期，这样我们就能把东西都订好。" },
    { who: "B", dir: "同意并说明会确认时间", sugs: [{ en: "Perfect. I'll check my schedule and message you tonight.", zh: "太好了。我会看看日程，今晚发消息给你。" }] },
  ],
  "f-hotel": [
    { who: "A", en: "You're welcome. Your room is on the fifth floor. Enjoy your stay.", zh: "不客气。您的房间在五楼，祝您入住愉快。" },
    { who: "B", dir: "确认并礼貌结束入住", sugs: [{ en: "Great. I'll head up now. Thanks again.", zh: "太好了。我现在就上去，再次感谢。" }] },
  ],
  "f-street": [
    { who: "A", en: "The store is on the left, so you can't miss it.", zh: "商店在左边，你不会错过的。" },
    { who: "B", dir: "确认路线并再次感谢", sugs: [{ en: "Got it. I'll look for it on the left. Thanks again.", zh: "明白了，我会在左边找。再次感谢。" }] },
    { who: "A", en: "No problem. I hope you find what you need.", zh: "不客气。希望你能找到需要的东西。" },
    { who: "B", dir: "礼貌道别", sugs: [{ en: "I'm sure I will. Have a great day.", zh: "我相信能找到。祝你今天愉快。" }] },
  ],
  "f-doctor": [
    { who: "A", en: "If your symptoms get worse, please come back or call the clinic.", zh: "如果症状加重，请回来复诊或打电话给诊所。" },
    { who: "B", dir: "确认医嘱并道谢", sugs: [{ en: "I will. Thank you for the advice, doctor.", zh: "我会的。谢谢您的建议，医生。" }] },
  ],
  "f-repair": [
    { who: "A", en: "We'll send you a message as soon as the repair is finished.", zh: "维修完成后我们会马上给您发消息。" },
    { who: "B", dir: "确认联系方式并道谢", sugs: [{ en: "That works for me. Thanks, I'll wait for your message.", zh: "这样很好，谢谢，我会等你的消息。" }] },
  ],
  "f-mail": [
    { who: "A", en: "Please keep the receipt until the package arrives.", zh: "请保留收据，直到包裹送达。" },
    { who: "B", dir: "确认会保留收据并结束", sugs: [{ en: "I will. Thanks for explaining everything.", zh: "我会的。谢谢你解释得这么清楚。" }] },
  ],
  "f-work-hi": [
    { who: "A", en: "It's a plan. Let's finish a few things before we celebrate.", zh: "就这么定了。庆祝前先把几件事做完。" },
    { who: "B", dir: "轻松回应并确认稍后见", sugs: [{ en: "Absolutely. I'll wrap up my work and see you later.", zh: "当然。我收尾工作后就去见你。" }] },
  ],
};
function allFreeScenarios() {
  const base = FREE_SCENARIOS.map(scene => {
    const tail = BASE_FREE_SCENARIO_TAILS[scene.id] || [];
    return tail.length ? { ...scene, lines: scene.lines.concat(tail) } : scene;
  });
  return base.concat(typeof MORE_FREE_SCENARIOS === "undefined" ? [] : MORE_FREE_SCENARIOS);
}
function freeAsrFailureMessage(error) {
  const messages = {
    "not-allowed": "浏览器没有获得麦克风或语音转写权限。",
    "service-not-allowed": "浏览器当前不允许使用语音转写服务。",
    "no-speech": "没有检测到可识别的英文语音。",
    "network": "浏览器语音转写服务暂时不可用，请检查网络后重试。",
    "language-not-supported": "当前浏览器不支持英文语音转写。",
    "unsupported": "当前浏览器不支持语音转写，请改用键入。",
    "timeout": "语音转写等待超时，请再试一次或改用键入。",
  };
  return messages[error] || "浏览器没有返回可用的英文转写，请再试一次或改用键入。";
}
/* 浏览器语音识别：录音确认后必须等最终结果，不能提前读取空文本。 */
function startASR() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let finalTranscript = "", interimTranscript = "", error = "", settled = false, timer = null, resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const text = () => (finalTranscript.trim() || interimTranscript.trim());
  const settle = () => {
    if (settled) return;
    settled = true;
    if (timer) { clearTimeout(timer); timer = null; }
    resolveFinished({ transcript: text(), error });
  };
  try {
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = e => {
      let nextInterim = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const result = e.results[k][0];
        if (e.results[k].isFinal) finalTranscript += " " + result.transcript;
        else nextInterim += " " + result.transcript;
      }
      if (nextInterim.trim()) interimTranscript = nextInterim.trim();
    };
    r.onerror = e => { error = e && e.error || "recognition-error"; };
    r.onend = settle;
    try { r.start(); }
    catch (e) { error = e && e.name || "unsupported"; settle(); }
    return {
      finish() {
        if (settled) return finished;
        try { r.stop(); }
        catch (e) { error = error || e && e.name || "recognition-error"; settle(); }
        if (!settled) timer = setTimeout(() => { error = error || "timeout"; settle(); }, 2200);
        return finished;
      },
      getTranscript: text,
    };
  } catch (e) { return null; }
}
const FREE_SCORE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from", "have", "i", "in", "is", "it",
  "me", "my", "of", "on", "or", "our", "please", "the", "that", "the", "their", "there", "they", "this", "to",
  "we", "will", "with", "you", "your",
]);
function normalizeFreeScoreText(text) {
  return (text || "").replace(/[\u2018\u2019\uFF07`]/g, "'").toLowerCase().trim();
}
function freeScoreWords(text, includeStopWords) {
  return (normalizeFreeScoreText(text).match(/[a-z]+(?:'[a-z]+)?|\d+(?::\d+)?/g) || [])
    .filter(word => includeStopWords || !FREE_SCORE_STOP_WORDS.has(word));
}
function inferFreeQuestionIntent(prompt) {
  const t = normalizeFreeScoreText(prompt);
  if (/^(when\b|what time\b)|\bwhen\b/.test(t)) return "time";
  if (/^(where\b)|\bwhere\b/.test(t)) return "place";
  if (/\bhow (many|much)\b|\bwhat (number|time)\b/.test(t)) return "quantity";
  if (/^(why\b)|\bwhy\b/.test(t)) return "reason";
  if (/\b(what|which).*(like|prefer|want|think)\b/.test(t)) return "preference";
  if (/^(do|does|did|are|is|am|can|could|would|will|have|has|should)\b/.test(t)) return "yes-no";
  return "action";
}
function matchesFreeQuestionIntent(answer, intent) {
  const t = normalizeFreeScoreText(answer);
  if (!t) return false;
  if (intent === "time") return /\b(today|tomorrow|tonight|yesterday|morning|afternoon|evening|night|later|soon|early|late|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|year)\b|\b\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\b/.test(t);
  if (intent === "place") return /\b(here|there|home|office|airport|hotel|restaurant|store|school|station|downtown|upstairs|downstairs|near|at|in|on)\b/.test(t);
  if (intent === "quantity") return /\b\d+(?:\.\d+)?\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|few|many|much|some|half)\b/.test(t);
  if (intent === "reason") return /\b(because|since|so|due to|to)\b/.test(t);
  if (intent === "preference") return /\b(like|love|prefer|want|would rather|think|feel)\b/.test(t);
  if (intent === "yes-no") return /^(yes|no|sure|certainly|absolutely|of course|i can|i can't|i do|i don't|i will|i won't)\b/.test(t);
  return /\b(i|we|he|she|they|it|let's|let us)\b/.test(t);
}
function evaluateFreeResponse(answer, prompt, suggestions) {
  const rawWords = freeScoreWords(answer, true);
  const answerWords = freeScoreWords(answer, false);
  const hasEnglish = /[a-z]/i.test(answer || "");
  if (!hasEnglish || !rawWords.length) {
    return { score: 0, relevance: 0, completeness: 0, naturalness: 0, feedback: ["请用英文回应这一轮。"] };
  }
  const intent = inferFreeQuestionIntent(prompt);
  const answerSet = new Set(answerWords);
  const referenceWords = [...new Set((suggestions || []).flatMap(s => freeScoreWords(s && s.en, false)))];
  const promptWords = [...new Set(freeScoreWords(prompt, false))];
  const referenceMatches = referenceWords.filter(word => answerSet.has(word)).length;
  const promptMatches = promptWords.filter(word => answerSet.has(word)).length;
  const intentMatched = matchesFreeQuestionIntent(answer, intent);
  let relevance = 0;
  if (intentMatched) relevance += 30;
  if (referenceWords.length) relevance += Math.min(20, Math.round(referenceMatches / referenceWords.length * 20));
  if (promptWords.length) relevance += Math.min(10, Math.round(promptMatches / promptWords.length * 10));
  relevance = Math.min(50, relevance);
  let completeness = rawWords.length >= 8 ? 30 : rawWords.length >= 5 ? 27 : rawWords.length >= 3 ? 23 : rawWords.length >= 2 ? 16 : 6;
  const normalized = normalizeFreeScoreText(answer);
  const hasSubject = /\b(i|we|you|he|she|they|it|there|this|that)\b/.test(normalized);
  const hasVerb = /\b(am|are|is|was|were|be|been|being|can|could|will|would|should|have|has|had|do|does|did|go|come|arrive|leave|plan|need|want|like|love|prefer|think|book|make|take|stay|meet|call|help)\b/.test(normalized);
  let naturalness = hasSubject && hasVerb ? 20 : intentMatched && rawWords.length <= 4 ? 14 : rawWords.length >= 3 ? 12 : 8;
  if (/[^\x00-\x7F\s.,!?;:'"’\-]/.test(answer)) naturalness = Math.max(0, naturalness - 8);
  const score = Math.min(100, relevance + completeness + naturalness);
  const feedback = [];
  if (relevance < 25) feedback.push("回答没有直接回应当前问题。");
  else if (relevance < 45) feedback.push("回答方向正确，但可以补充更具体的信息。");
  if (completeness < 25) feedback.push("信息还不够完整，试着补充主语、动作或细节。");
  if (naturalness < 16) feedback.push("尽量组织成更自然的英文表达。");
  if (!feedback.length) feedback.push("回答完整、切题，表达自然。");
  return { score, relevance, completeness, naturalness, feedback };
}
function adaptiveTimePhrase(answer) {
  const match = (answer || "").match(/\b(?:today|tomorrow|tonight)(?:\s+(?:morning|afternoon|evening|night))?|\b(?:this|next)\s+(?:morning|afternoon|evening|week|weekend)|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?|\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i);
  if (!match) return "";
  const phrase = match[0].trim();
  return phrase ? phrase[0].toUpperCase() + phrase.slice(1) : "";
}
function adaptiveFollowUpForDirection(line) {
  const dir = normalizeFreeScoreText(line && line.dir);
  if (/(time|when|schedule|arrival|时间|什么时候|到达|安排|约定|营业)/.test(dir)) {
    return { en: "What time would work best for you?", zh: "什么时间最适合你？" };
  }
  if (/(where|place|location|地点|地方|目的地|去哪|去的地方)/.test(dir)) {
    return { en: "Where would be most convenient for you?", zh: "哪里对你最方便？" };
  }
  if (/(why|reason|理由|原因)/.test(dir)) {
    return { en: "What makes you say that?", zh: "你为什么这么说？" };
  }
  if (/(choose|choice|prefer|whether|选择|是否|要不要|同意|确认)/.test(dir)) {
    return { en: "Which option would you prefer?", zh: "你更倾向于哪个选择？" };
  }
  if (/(plan|next|安排|下一步|计划|分工)/.test(dir)) {
    return { en: "What would you like to do next?", zh: "你接下来想怎么做？" };
  }
  return { en: "Could you tell me a little more about that?", zh: "你能再多说一点吗？" };
}
function isAdaptiveAnswerTooShort(answer) {
  const normalized = normalizeFreeScoreText(answer).replace(/[.!?]+$/, "");
  const words = freeScoreWords(answer, true);
  return words.length <= 1 || /^(maybe|not sure|i don't know|i do not know|no idea)$/.test(normalized);
}
function buildAdaptivePartnerLine(answer, prompt, originalLine, nextLearnerLine) {
  const text = (answer || "").trim();
  if (isAdaptiveAnswerTooShort(text)) {
    return { who: "A", en: "I understand. Could you tell me a little more?", zh: "我明白了。你能再多说一点吗？", adaptive: true };
  }
  const time = adaptiveTimePhrase(text);
  let acknowledgement;
  let acknowledgementZh;
  if (time) {
    acknowledgement = `${time} sounds good.`;
    acknowledgementZh = `${time === "Tomorrow afternoon" ? "明天下午" : "这个时间"}听起来不错。`;
  } else if (/^(yes|yeah|sure|of course|definitely|sounds good)\b/i.test(text)) {
    acknowledgement = "Great, thanks for confirming.";
    acknowledgementZh = "太好了，感谢你的确认。";
  } else if (/^(no|not really|i can't|i cannot|i don't|i do not)\b/i.test(text)) {
    acknowledgement = "I understand. Let's look at another option.";
    acknowledgementZh = "我明白了。我们换个选择看看。";
  } else if (/\b(because|since)\b/i.test(text)) {
    acknowledgement = "Thanks for explaining that.";
    acknowledgementZh = "谢谢你的说明。";
  } else if (/\b(like|love|prefer|would rather|want)\b/i.test(text)) {
    acknowledgement = "That makes sense.";
    acknowledgementZh = "这很合理。";
  } else if (/\b(at|in|near|home|office|airport|hotel|restaurant|store|school|station|downtown)\b/i.test(text)) {
    acknowledgement = "That location sounds convenient.";
    acknowledgementZh = "那个地点听起来很方便。";
  } else {
    acknowledgement = "Thanks for sharing that.";
    acknowledgementZh = "谢谢你的分享。";
  }
  const followUp = adaptiveFollowUpForDirection(nextLearnerLine || originalLine || { dir: "" });
  return { who: "A", en: `${acknowledgement} ${followUp.en}`, zh: `${acknowledgementZh}${followUp.zh}`, adaptive: true };
}
function scoreFreeSession(turns) {
  const contentTurns = (turns || []).map(turn => {
    if (turn && turn.answerEvaluation && Number.isFinite(turn.answerEvaluation.score)) return turn.answerEvaluation.score;
    if (turn && turn.type === "sug") return 40;
    return 0;
  });
  const contentScore = contentTurns.length ? Math.round(contentTurns.reduce((sum, score) => sum + score, 0) / contentTurns.length) : 0;
  return { total: contentScore, contentScore };
}
function renderFreeScoreSummary(session, turns) {
  const total = Number.isFinite(session && session.total) ? session.total : 0;
  const contentScore = Number.isFinite(session && session.contentScore) ? session.contentScore : 0;
  const stars = total >= 90 ? "⭐⭐⭐⭐⭐" : total >= 75 ? "⭐⭐⭐⭐" : total >= 60 ? "⭐⭐⭐" : "⭐⭐";
  const feedbackRows = (turns || []).map((turn, index) => {
    const evaluation = turn && turn.answerEvaluation || { score: 0, feedback: [] };
    const feedback = (evaluation.feedback || []).join(" ") || "本轮没有可用反馈。";
    return `<div style="text-align:left;padding:7px 0;border-top:1px solid #edf0f7;font-size:12px;color:var(--muted)"><b style="color:var(--text)">第 ${index + 1} 轮 · ${evaluation.score || 0}/100</b><div style="margin-top:2px">${feedback}</div></div>`;
  }).join("");
  return `<div class="card" style="text-align:center">
      <div style="font-size:20px;font-weight:800">🎉 对话完成！</div>
      <div style="font-size:34px;font-weight:900;color:var(--primary);margin:8px 0 2px;">${total}<span style="font-size:14px;color:var(--muted)">/100</span></div>
      <div style="letter-spacing:2px">${stars}</div>
      <div style="display:flex;justify-content:center;gap:14px;margin:10px 0;font-size:13px;color:var(--muted)"><span>回答质量：<b style="color:var(--text)">${contentScore}/100</b></span></div>
      <div style="font-size:11px;color:var(--muted);margin:8px 0 12px">评分只看英文回答是否切题、完整和自然，不按音质评分。</div>
      ${feedbackRows ? `<div style="margin:8px 0 12px">${feedbackRows}</div>` : ""}
      <button class="btn-primary" id="playStd" style="border:none;background:var(--primary);color:#fff;padding:12px 22px;border-radius:12px;font-weight:700;cursor:pointer;min-width:120px">▶ 播放示范</button>
      <button class="btn-primary" id="stdBtn" style="border:none;background:var(--primary-light);color:var(--primary);padding:12px 22px;border-radius:12px;font-weight:700;cursor:pointer">📖 展开示范文本</button>
    </div>`;
}
function renderFreeRun(scRaw) {
  const sc = JSON.parse(JSON.stringify(scRaw)); // 拷贝一份，避免 _shown 状态污染
  let i = 0; const userTurns = []; // 记录每轮表现 {type:'mic'|'sug'|'skip', sugIndex?}
  const recUrls = []; let recording = false;
  let pendingAdaptiveLine = null;
  let currentPartnerPrompt = "";
  viewEl.innerHTML = `<div class="page-header back-top">
    <button class="back-btn" onclick="goBack()">‹</button>
    <div style="flex:1"><div class="page-title">🎲 即兴对话 · ${sc.name}</div><div class="page-sub">${sc.intro}</div></div>
    <div style="display:flex;gap:5px;flex-shrink:0">
      <button id="freeContinueBtn" class="chip on" title="随机切换到另一场对话" style="font-size:12px">🎲 继续练习</button>
      <button id="freeRetryBtn" class="chip" title="从头练习当前对话" style="font-size:12px">🔄 重新练习</button>
    </div>
  </div>` + `
    <div class="chip-row" style="justify-content:flex-start;margin-bottom:10px;"><span class="chip on">共 ${sc.lines.length} 轮</span><span class="chip" id="freeTurn"></span></div>
    <div id="stage"></div>
    <div class="hint-box" id="hintBox"></div>
    <div class="stage-actions" id="actions"></div>
    <div id="endBox"></div>
    <div style="height:12px"></div>`;
  $("#freeContinueBtn").onclick = () => {
    const pool = allFreeScenarios().filter(s => s.id !== sc.id);
    const s2 = pool[Math.floor(Math.random() * pool.length)];
    lastFreeId = s2.id;
    pushView(renderFreeRun, s2);
  };
  $("#freeRetryBtn").onclick = () => renderFreeRun(scRaw);
  function bubble(who, text, zh, user, rec) {
    const div = document.createElement("div");
    div.className = user ? "bubble user" : "bubble";
    div.innerHTML = `<div class="avatar">${who}</div>
      <div class="bubble-content">${text}${zh ? `<span class="bubble-zh">${zh}</span>` : ""}${rec ? `<div class="b-func show" data-url="${rec}">🔊 播放我的录音</div>` : ""}</div>`;
    $("#stage").appendChild(div);
    $("#stage").querySelectorAll(".b-func").forEach(el => {
      if (el.dataset.bound) return; el.dataset.bound = 1;
      el.onclick = () => new Audio(el.dataset.url).play();
    });
    viewEl.scrollTop = viewEl.scrollHeight;
    return div;
  }
  function hintHtml(l) {
    let html = `<div style="font-size:12px;color:var(--primary);font-weight:700;margin-bottom:6px">💡 表达方向</div>
      <div style="font-size:13px;">${l.dir}</div>`;
    if (l._shown) {
      html += `<div style="margin-top:10px;font-size:12px;color:var(--muted)">参考说法（点一句就当你说出口了）：</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">` +
        l.sugs.map((s, k) => `<button class="level-btn" data-sug="${k}" style="text-align:left">
          <b style="color:var(--primary)">${s.en}</b><br><span style="font-size:11px;color:var(--muted);font-weight:400">${s.zh}</span></button>`).join("") + `</div>`;
    }
    return html;
  }
  function showUserTurn(l) {
    const prompt = currentPartnerPrompt;
    $("#freeTurn").textContent = "第 " + (i + 1) + "/" + sc.lines.length + " 轮";
    $("#actions").innerHTML = `
      <button class="btn-primary" id="turnMic">🎤 我说</button>
      <button class="btn-ghost" id="turnType">⌨️ 键入</button>
      <button class="btn-ghost" id="turnHint">💡 提示</button>
      <button id="turnSkip" style="flex:0.7;border:none;border-radius:14px;padding:13px 0;font-size:13px;background:#f0f2f8;color:var(--muted);cursor:pointer;">跳过</button>`;
    $("#turnMic").onclick = async () => {
      if (recording) return;
      try { await Recorder.start(); } catch (e) { return toast("无法访问麦克风"); }
      recording = true; $("#turnMic").textContent = "🔴 说完点我确认"; $("#turnMic").classList.add("hot");
      const asr = startASR();
      $("#turnMic").onclick = async () => {
        const micButton = $("#turnMic");
        micButton.disabled = true; micButton.textContent = "⏳ 正在转写…"; micButton.classList.remove("hot");
        const recognition = asr ? await asr.finish() : { transcript: "", error: "unsupported" };
        const rec = await Recorder.stop();
        const transcript = recognition.transcript || "";
        recording = false; recUrls[i] = rec.url;
        let div;
        if (transcript) {
          const answerEvaluation = evaluateFreeResponse(transcript, prompt, l.sugs);
          userTurns.push({ type: "mic", answer: transcript, answerEvaluation });
          div = bubble("B", transcript, "翻译中…", true, rec.url);
          try { const zh = await mtZh(transcript); const z = div.querySelector(".bubble-zh"); if (z && zh) z.textContent = zh; } catch (e) { }
        } else {
          userTurns.push({
            type: "mic",
            answer: "",
            answerEvaluation: { score: 0, feedback: ["没有识别到英文回答，因此这轮无法评分。"] },
          });
          div = bubble("B", "（未转写到英文文本）", freeAsrFailureMessage(recognition.error), true, rec.url);
        }
        doneTurn(transcript);
      };
    };
    $("#turnType").onclick = () => {
      $("#hintBox").innerHTML = `
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">⌨️ 在英文框输入后可直接提交；不会时可先在中文框翻译。</div>
        <label for="typeEn" style="display:block;margin-bottom:4px;font-size:12px;font-weight:700;color:var(--text)">🇺🇸 英文</label>
        <input id="typeEn" placeholder="Type your English here…" style="width:100%;padding:10px;border:1.5px solid #e3e6ef;border-radius:10px;font-size:14px;box-sizing:border-box;">
        <label for="typeZh" style="display:block;margin:9px 0 4px;font-size:12px;font-weight:700;color:var(--text)">🇨🇳 中文（可选）</label>
        <div style="display:flex;gap:7px">
          <input id="typeZh" placeholder="输入中文后点击翻译" style="min-width:0;flex:1;padding:10px;border:1.5px solid #e3e6ef;border-radius:10px;font-size:14px;box-sizing:border-box;">
          <button class="btn-ghost" id="typeTranslate" style="flex:0 0 auto;padding:10px 12px">翻译为英文</button>
        </div>
        <div id="typeError" style="min-height:17px;margin-top:5px;font-size:12px;color:var(--warn)"></div>
        <button class="btn-primary" id="typeGo" style="width:100%;margin-top:8px;padding:11px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-weight:700;cursor:pointer;">说这句 →</button>`;
      $("#typeTranslate").onclick = async () => {
        const chineseInput = $("#typeZh");
        const englishInput = $("#typeEn");
        const button = $("#typeTranslate");
        const error = $("#typeError");
        const chinese = chineseInput.value.trim();
        if (!chinese) return toast("还没输入中文内容");
        button.disabled = true;
        button.textContent = "⏳ 翻译中…";
        const answer = await resolveFreeTypedAnswer(chinese);
        button.disabled = false;
        button.textContent = "翻译为英文";
        if (answer.error) {
          error.textContent = "暂时无法把中文译成英文，请检查网络后重试。";
          chineseInput.focus();
          return;
        }
        englishInput.value = answer.english;
        error.textContent = "已翻译到英文框，可检查后点击“说这句”。";
        englishInput.focus();
      };
      $("#typeGo").onclick = async () => {
        const input = $("#typeEn");
        const button = $("#typeGo");
        const error = $("#typeError");
        const english = input.value.trim();
        const chinese = $("#typeZh").value.trim();
        if (!english) return toast("还没输入英文对话");
        if (isChineseText(english)) {
          error.textContent = "请在下方中文框输入中文并点击“翻译为英文”。";
          input.focus();
          return;
        }
        button.disabled = true;
        userTurns.push({
          type: "typed", answer: english, sourceAnswer: chinese,
          answerEvaluation: evaluateFreeResponse(english, prompt, l.sugs),
        });
        const div = bubble("B", english, chinese || "翻译中…", true, null);
        if (!chinese) {
          try { const zh = await mtZh(english); if (zh) { const zhEl = div.querySelector(".bubble-zh"); if (zhEl) zhEl.textContent = zh; } } catch (e) { }
        }
        doneTurn(english);
      };
    };
    $("#turnHint").onclick = () => {
      l._shown = true;
      $("#hintBox").innerHTML = hintHtml(l);
      $("#hintBox").querySelectorAll("[data-sug]").forEach(b => b.onclick = () => {
        const s = l.sugs[+b.dataset.sug];
        userTurns.push({ type: "sug", en: s.en, answerEvaluation: { score: 40, feedback: ["本轮使用了参考说法。"] } });
        bubble("B", s.en, s.zh, true, null);
        doneTurn(s.en);
      });
    };
    $("#turnSkip").onclick = () => {
      userTurns.push({ type: "skip", answerEvaluation: { score: 0, feedback: ["本轮已跳过。"] } });
      bubble("B", "（跳过这轮）", "", true, null); doneTurn();
    };
  }
  function doneTurn(answer) {
    $("#hintBox").innerHTML = ""; $("#actions").innerHTML = "";
    const nextPartner = sc.lines[i + 1];
    const nextLearner = sc.lines[i + 2];
    pendingAdaptiveLine = answer && nextPartner && nextPartner.who === "A" && nextLearner && nextLearner.who === "B"
      ? buildAdaptivePartnerLine(answer, currentPartnerPrompt, nextPartner, nextLearner)
      : null;
    i++;
    step();
  }
  async function step() {
    TTS.cancelled = true; TTS.stop();
    $("#freeTurn") && ($("#freeTurn").textContent = "第 " + (i + 1) + "/" + sc.lines.length + " 轮");
    if (i >= sc.lines.length) return endFree();
    const sourceLine = sc.lines[i];
    const l = pendingAdaptiveLine && sourceLine.who === "A" ? pendingAdaptiveLine : sourceLine;
    if (l.who === "A") {
      pendingAdaptiveLine = null;
      currentPartnerPrompt = l.en;
      bubble("A", l.en, l.zh, false, null);
      $("#hintBox").innerHTML = `<div style="font-size:13px;color:var(--muted)">🔊 对方在说…</div>`;
      $("#actions").innerHTML = "";
      TTS.cancelled = false;
      await TTS.speak(l.en, "en-US", Store.get().settings.speed || 1);
      if (TTS.cancelled) return;
      i++;
      step();
    } else {
      $("#hintBox").innerHTML = `<div style="font-size:12px;color:var(--muted);margin-bottom:6px">到你了！这段的方向：</div>${hintHtml(l)}`;
      showUserTurn(l);
    }
  }
  async function endFree() {
    TTS.stop();
    const session = scoreFreeSession(userTurns);
    Store.addDialogDone(); Store.save();
    $("#hintBox").style.display = "none"; $("#actions").innerHTML = "";
    $("#endBox").innerHTML = renderFreeScoreSummary(session, userTurns) + `
      <div class="card" id="stdCard" style="display:none">
        <div class="section-title">📖 标准示范</div>
        ${sc.lines.map(l => l.who === "A"
          ? `<div style="padding:5px 0"><b style="color:var(--primary)">${sc.icon} 对方：${l.en}</b> <span style="font-size:11px;color:var(--muted)">${l.zh}</span></div>`
          : `<div style="padding:5px 0"><b style="color:#e67e22">你：</b>${l.sugs[0].en} <span style="font-size:11px;color:var(--muted)">${l.sugs[0].zh}</span></div>`).join("")}
      </div>`;
    // ▶ 播放示范（带暂停）：三个功能一排中的第一个
    window.__stdPlaying = false;
    $("#playStd").onclick = () => {
      const pBtn = $("#playStd");
      if (window.__stdPlaying) {
        window.__stdPlaying = false; TTS.cancelled = true; TTS.stop();
        pBtn.textContent = "▶ 继续播放"; toast("已暂停示范播放");
        return;
      }
      window.__stdPlaying = true; TTS.cancelled = false;
      pBtn.textContent = "⏸ 暂停";
      (async () => {
        if (!pBtn.dataset.pos) {
          // 全新播放从头开始
          for (const l of sc.lines) {
            if (!window.__stdPlaying) break;
            const en = l.who === "A" ? l.en : l.sugs[0].en;
            await TTS.speak(en, "en-US", Store.get().settings.speed || 1);
            if (TTS.cancelled || !window.__stdPlaying) break;
            await new Promise(r => setTimeout(r, 200));
          }
        }
        if (!window.__stdPlaying) { pBtn.textContent = "▶ 播放示范"; window.__stdPlaying = false; return; }
      })();
    };
    $("#stdBtn").onclick = () => { $("#stdCard").style.display = $("#stdCard").style.display === "none" ? "block" : "none"; };
  }
  step();
}

/* ---------- 点词查义 & 生词本 & 短语收藏 ---------- */
let wordPopEl = null;
let phraseSelMode = false; // 短语选择模式
let phraseBuf = [];
let phraseSelMeaning = "";
function showWordPop(word, topic, keepSel) {
  wordPopEl = wordPopEl || document.createElement("div");
  phraseSelMeaning = "";
  if (phraseSelMode) {
    if (!keepSel) phraseBuf.push(word); // 短语模式：点什么词就追加什么
  }
  wordPopEl.className = "word-pop";
  wordPopEl.style.display = "block";
  document.body.appendChild(wordPopEl);
  const local = []
    .concat(topic.words || [])
    .concat((topic.dialogs && topic.dialogs[0] && topic.dialogs[0].words) || [])
    .find(w => w.en.toLowerCase() === word.toLowerCase());
  const inBook = () => !!Store.get().wordbook[word];
  wordPopEl.dataset.curword = word;
  wordPopEl.innerHTML = `<div class="wp-word">${phraseSelMode ? (phraseBuf.join(" ") || "短语选词中：继续点单词…") : word}</div>
    <div id="wpPhon" style="display:none;font-size:12px;color:var(--muted);margin:2px 0 6px;"></div>
    <div class="wp-def" id="wpDef">${phraseSelMode ? "（点🌐翻译获取释义）" : "正在查询网络释义…"}</div>
    <div class="wp-actions">
      <button class="chip on" id="wpSpeak">🔊 朗读</button>
      <button class="chip" id="wpTranslate">🌐 翻译</button>
      ${phraseSelMode ? `<button class="chip on" id="phraseSave">💾 保存短语</button>` : ""}
      <button class="chip ${inBook() && !phraseSelMode ? "fav" : ""}" id="wpAdd">${inBook() && !phraseSelMode ? "✓ 已在生词本" : "＋ 加入生词本"}</button>
      <button class="chip" id="wpClose">✕</button>
    </div>`;
  $("#wpSpeak").onclick = () => { TTS.cancelled = false; TTS.speak(phraseSelMode && phraseBuf.length ? phraseBuf.join(" ") : word, "en-US", 1); };
  $("#wpTranslate") && ($("#wpTranslate").onclick = async () => {
    const target = phraseSelMode && phraseBuf.length ? phraseBuf.join(" ") : word;
    const tEl = $("#wpTranslate"); tEl.textContent = "⏳ 翻译中…";
    const zh = await mtZh(target);
    tEl.textContent = "🌐 翻译";
    const d2 = $("#wpDef");
    if (d2) { d2.classList.remove("loading"); d2.textContent = zh ? "释义：" + zh : "翻译失败，可点击朗读"; }
    wordPopEl.dataset.zh = zh || wordPopEl.dataset.zh || "";
    phraseSelMode && (phraseSelMeaning = zh || "");
  });
  $("#wpClose").onclick = () => { phraseSelMode = false; phraseBuf = []; wordPopEl.remove(); };
  // 短语模式：翻译到保存（保存后提示短语+翻译并关闭弹窗）
  $("#phraseSave") && ($("#phraseSave").onclick = async () => {
    const phrase = phraseBuf.join(" ").trim();
    if (!phrase) return toast("先点选组成短语的单词");
    let zh = phraseSelMeaning || "";
    if (!zh) { try { zh = await mtZh(phrase) || ""; } catch (e) { } }
    const pid = "p" + Date.now().toString(36);
    const ft = findTopic(topic.id) || {};
    Store.toggleFav(pid, { en: phrase, zh, isPhrase: true, topicName: topic.name, sceneId: ft.scene ? ft.scene.id : "custom" });
    phraseSelMode = false; phraseBuf = [];
    toast("⭐ 已收藏：" + phrase + (zh ? " · " + zh : ""));
    wordPopEl.remove(); // 保存后直接关闭弹窗
    updateTabbar();
  });
  $("#wpAdd").onclick = () => {
    const book = Store.get().wordbook;
    if (book[word]) { Store.removeWord(word); toast("已从生词本移除"); wordPopEl.remove(); updateTabbar(); return; }
    const info = { topicName: topic.name };
    if (local) info.zh = local.zh;
    if (wordPopEl.dataset.zh) info.zh = wordPopEl.dataset.zh;
    if (wordPopEl.dataset.phonUk) info.phonUk = wordPopEl.dataset.phonUk;
    if (wordPopEl.dataset.phonUs) info.phonUs = wordPopEl.dataset.phonUs;
    if (wordPopEl.dataset.phonetic) info.phonetic = wordPopEl.dataset.phonetic;
    if (wordPopEl.dataset.def) info.def = wordPopEl.dataset.def;
    Store.addWord(word, info);
    toast("📖 已加入生词本：" + word);
    wordPopEl.remove(); // 点击加入生词本后自动关闭弹窗
    updateTabbar();
  };
  if (local) { paintWord({ zh: local.zh }); return; }
  lookupOnline(word, false);
  function syncSavedWordDetails(entry) {
    if (!Store.get().wordbook[word]) return;
    const updates = {};
    if (entry.zh) updates.zh = entry.zh;
    if (entry.uk) updates.phonUk = entry.uk;
    if (entry.us) updates.phonUs = entry.us;
    if (entry.uk || entry.us) updates.phonetic = entry.uk || entry.us;
    if (entry.def) updates.def = entry.def;
    if (Object.keys(updates).length) Store.updateWord(word, updates);
  }
  // 百度翻译式：英/美音标 + 各自发音按钮 + 中文翻译
  function paintWord(entry) {
    entry = entry || {};
    syncSavedWordDetails(entry);
    if (!wordPopEl || !wordPopEl.isConnected) return; // 弹窗已关闭则不再回填
    if (wordPopEl.dataset.curword !== word) return; // 弹窗已切换到别的单词
    const ph = $("#wpPhon"), df = $("#wpDef");
    wordPopEl.dataset.zh = entry.zh || wordPopEl.dataset.zh || "";
    wordPopEl.dataset.phonUk = entry.uk || "";
    wordPopEl.dataset.phonUs = entry.us || "";
    wordPopEl.dataset.phonetic = entry.uk || entry.us || "";
    wordPopEl.dataset.def = entry.def || wordPopEl.dataset.def || "";
    if (ph) {
      if (entry.uk || entry.us) {
        ph.style.display = "block";
        ph.innerHTML =
          (entry.uk ? `英 <b style="color:var(--text)">${entry.uk}</b> <button class="chip" data-acc="UK" style="padding:1px 8px;font-size:11px">🔊</button>` : "") +
          (entry.us ? `&nbsp;&nbsp;美 <b style="color:var(--text)">${entry.us}</b> <button class="chip" data-acc="US" style="padding:1px 8px;font-size:11px">🔊</button>` : "");
        ph.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => speakAccent(word, b.dataset.acc));
      } else ph.style.display = "none";
    }
    if (df) {
      df.className = "wp-def";
      df.textContent = entry.zh ? entry.zh + (entry.def ? " · " + entry.def : "")
        : (entry.def || "网络查询失败，暂无释义（可点击朗读）");
    }
  }
  async function lookupOnline(w, force) {
    const key = w.toLowerCase();
    const entry = Object.assign({}, phonCacheAll()[key] || {});
    const needPhon = !(entry.uk || entry.us);
    const needZh = !entry.zh;
    if (!needPhon && !needZh && !force) { paintWord(entry); return; }
    const write = () => {
      const c = phonCacheAll(); c[key] = entry;
      try { localStorage.setItem("phonCache", JSON.stringify(c)); } catch (e) { }
    };
    // 中文翻译：MyMemory 独立并行，先到先画（之前中文能出、音标不出，就是因为被前面的源串行卡死）
    if (needZh || force) {
      fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(w)}&langpair=en|zh-CN`, 5000)
        .then(r => r.json())
        .then(mm => {
          const rt = (mm.responseData || {}).translatedText || "";
          if (rt && !/INVALID|EXCEPTION|QUOTA/i.test(rt) && /[\u4e00-\u9fa5]/.test(rt)) {
            entry.zh = rt; write(); paintWord(entry);
          }
        })
        .catch(() => { });
    }
    // 音标：dictionaryapi（英+美+释义，每个源 4s 快速失败）→ CMU 词典（美音 IPA，稳定兜底）
    if (needPhon || force) {
      (async () => {
        const target = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`;
        for (const u of [target, `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`]) {
          try {
            const r = await fetchWithTimeout(u, 4000);
            const data = await r.json();
            if (Array.isArray(data) && data[0]) {
              const e0 = data[0];
              const phs = (e0.phonetics || []).filter(p => p && p.text);
              let uk = "", us = "";
              phs.forEach(p => {
                const a = (p.audio || "").toLowerCase();
                if (!uk && /gb|uk|en-gb/.test(a)) uk = p.text;
                else if (!us && /us|en-us/.test(a)) us = p.text;
              });
              if (!uk && phs[0]) uk = phs[0].text;
              if (!us && phs[1]) us = phs[1].text;
              if (!uk && e0.phonetic) uk = e0.phonetic;
              if (!us) us = uk;
              const defs = [];
              (e0.meanings || []).slice(0, 2).forEach(m => (m.definitions || []).slice(0, 1).forEach(d => defs.push(`[${m.partOfSpeech}] ${d.definition}`)));
              entry.uk = entry.uk || uk;
              entry.us = entry.us || us;
              entry.def = entry.def || defs.join("；");
              if (entry.uk || entry.us) break;
            }
          } catch (e) { }
        }
        if (!entry.us) {
          const ipa = await cmuIpa(w); // CMU 美音兜底（jsdelivr 国内可达）
          if (ipa) entry.us = ipa;
        }
        write(); paintWord(entry);
      })();
    }
  }
}
/* 带超时的 fetch（避免单个源挂起拖死整个查询） */
function fetchWithTimeout(url, ms) {
  if (!window.AbortController) return fetch(url);
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(id));
}
/* ARPAbet → 美式 IPA */
const ARP2IPA = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ",
  B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɝ", EY: "eɪ",
  F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k",
  L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p",
  R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u",
  V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};
function arpaToIpa(phones) {
  let out = "";
  for (const tok of phones.split(/\s+/)) {
    const m = tok.match(/^([A-Z]+?)([0-2])?$/);
    if (!m) continue;
    let ph = ARP2IPA[m[1]];
    if (!ph) continue;
    if (m[1] === "AH" && m[2] === "0") ph = "ə";
    if (m[1] === "ER" && m[2] === "0") ph = "ɚ";
    const mark = m[2] === "1" ? "ˈ" : m[2] === "2" ? "ˌ" : "";
    out += mark + ph;
  }
  return out ? "/" + out + "/" : "";
}
/* CMU 音标库：jsdelivr gh 镜像（国内可达），每会话加载一次，常驻内存 */
let cmuMapPromise = null;
function loadCmuDict() {
  if (cmuMapPromise) return cmuMapPromise;
  toast("⏳ 正在加载音标库（首次约 3.6MB，之后秒开）…");
  cmuMapPromise = fetchWithTimeout("https://cdn.jsdelivr.net/gh/cmusphinx/cmudict@master/cmudict.dict", 30000)
    .then(r => r.text())
    .then(txt => {
      const map = new Map();
      for (const line of txt.split("\n")) {
        const sp = line.indexOf(" ");
        if (sp < 1) continue;
        const w = line.slice(0, sp).toLowerCase();
        if (map.has(w) || /\(\d+\)$/.test(w)) continue; // 只收首个发音变体
        map.set(w, line.slice(sp + 1).trim());
      }
      return map;
    })
    .catch(() => { cmuMapPromise = null; return null; });
  return cmuMapPromise;
}
async function cmuIpa(word) {
  try {
    const map = await loadCmuDict();
    if (!map) return "";
    const ph = map.get(word.toLowerCase().replace(/[^a-z'-]/g, ""));
    return ph ? arpaToIpa(ph) : "";
  } catch (e) { return ""; }
}
/* 音标本地缓存（网络抖动时复用上次结果） */
function phonCacheAll() {
  try { return JSON.parse(localStorage.getItem("phonCache") || "{}"); } catch (e) { return {}; }
}
/* 按英式/美式音库朗读单词（音标行的小喇叭） */
function speakAccent(text, accent) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const want = accent === "UK" ? "gb" : "us";
  const vs = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("en"));
  const v = vs.find(x => x.lang.toLowerCase().includes(want)) || vs.find(x => x.localService) || vs[0];
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = accent === "UK" ? "en-GB" : "en-US";
  u.rate = Store.get().settings.speed || 1;
  speechSynthesis.speak(u);
}


/* ---------- 复习页 ---------- */
function todayEnd() { return new Date(new Date().setHours(24, 0, 0, 0)).getTime(); }
function countDue() {
  const st = Store.get();
  const dueNow = Object.entries(st.review).filter(([id, r]) => (r.nextTs || 0) <= Date.now() && st.mastery[id] !== "mastered").map(e => e[0]);
  const weak = Object.keys(st.mastery).filter(k => st.mastery[k] === "weak" && !dueNow.includes(k));
  return dueNow.length + weak.length;
}
function renderReview() {
  const st = Store.get();
  const due = Object.entries(st.review).filter(([id, r]) => (r.nextTs || 0) <= Date.now() && st.mastery[id] !== "mastered").map(e => e[0]);
  const weak = Object.keys(st.mastery).filter(k => st.mastery[k] === "weak" && !due.includes(k));
  const items = [...due, ...weak];
  viewEl.innerHTML = header("🔁 复习计划", "依据艾宾浩斯记忆曲线安排 · 越薄弱越常出现") + `
    <div class="card">
      <div class="section-title">📋 今日待复习（${due.length + weak.length} 条）</div>
      ${items.length ? "" : `<div class="empty-block">🎉 暂无待复习内容<br><span style="font-size:11px">在练习里点「⚠️ 加入复习」或「薄弱」后，内容会出现在这里</span></div>`}
      ${items.slice(0, 20).map(id => `<div class="recent-item" onclick="openReviewItem('${id}')">
        <div class="ri-icon">📌</div>
        <div style="min-width:0"><div class="ri-title" style="text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${favText(id)}</div>
        <div class="ri-sub">${id.endsWith("d0") ? "进阶对话" : "入门短句"}</div></div>
        <div class="arrow">›</div></div>`).join("")}
    </div>
    <div class="section-title">🎯 随机抽一个练</div>
    <button class="btn-primary btn-primary" id="randBtn" style="width:100%;padding:14px;border-radius:14px;font-size:15px;font-weight:700;border:none;cursor:pointer;">🎲 随机复习一题</button>
    <div id="randBox"></div>`;
  $("#randBtn").onclick = () => {
    if (!items.length) return toast("暂无复习内容");
    const id = items[Math.floor(Math.random() * items.length)];
    openReviewItem(id);
  };
}
function favText(id) {
  const t = id.split(":")[0];
  const f = findTopic(t); if (!f) return id;
  const k = id.split(":s")[1];
  if (k !== undefined) return f.topic.sentences[+k] ? f.topic.sentences[+k].en : id;
  const f2 = Store.get().favs[id];
  if (f2) return f2.en;
  const d = f.topic.dialogs[0];
  return d ? d.title + "（对话）" : id;
}
function openReviewItem(id) {
  const [tid, kind] = id.split(":");
  if (kind === "d0") goDialogFromReview(tid);
  else pushView(renderListen, tid);
}
function goDialogFromReview(topicId) {
  const f = findTopic(topicId);
  const d = f.topic.dialogs[0];
  const role = "B", hint = "both";
  pushView(renderDialogRun, { topicId, d, role, hint });
}

/* ---------- 我的 ---------- */
function renderMe(tab) {
  const st = Store.get();
  const mins = Math.round(st.stats.totalSeconds / 60);
  const favList = Object.entries(st.favs).map(([id, f]) => ({ id, ...f }));
  const isFavTab = tab === "fav";
  viewEl.innerHTML = header("👤 个人中心", "学习情况与偏好设置") + (isFavTab ? renderFavTab(favList) : `
    <div class="hero" style="background:linear-gradient(120deg,#ffb74d,#ff9f43)">
      <h1>共练习 ${mins} 分钟</h1>
      <p>开始于 ${new Date(st.stats.startedAt).toLocaleDateString()}</p>
      <div class="stats-row">
        <div class="stat-box"><div class="stat-num">${mins}</div><div class="stat-label">练习分钟</div></div>
        <div class="stat-box"><div class="stat-num">${st.stats.dialogCount}</div><div class="stat-label">完成对话</div></div>
        <div class="stat-box"><div class="stat-num">${favList.length}</div><div class="stat-label">收藏</div></div>
      </div>
    </div>
    <div class="card">
      <div class="section-title">⭐ 我的收藏</div>
      <div class="recent-item" onclick="viewFn=renderMe;viewArg='fav';render()"><div class="ri-icon">⭐</div><div class="ri-title">查看全部收藏（${favList.length}）</div><div class="arrow">›</div></div>
    </div>
    <div class="card">
      <div class="section-title">📖 生词本（${Object.keys(st.wordbook).length}）</div>
      ${Object.keys(st.wordbook).length ? Object.entries(st.wordbook).slice(-8).reverse().map(([w, info]) => `
        <div class="recent-item">
          <div class="ri-icon">🔤</div>
          <div style="min-width:0;flex:1"><div class="ri-title">${w}${(info.phonUk || info.phonUs) ? ` <span style="font-size:11px;color:var(--muted);font-weight:400">${info.phonUk ? "英" + info.phonUk : ""}${info.phonUs ? " 美" + info.phonUs : ""}</span>` : (info.phonetic ? ` <span style="font-size:11px;color:var(--muted);font-weight:400">${info.phonetic}</span>` : "")}</div><div class="ri-sub">${info.zh || info.def || ""} <span style="opacity:.6">${info.topicName ? "· " + info.topicName : ""}</span></div></div>
          <span class="chip on" onclick="TTS.cancelled=false;TTS.speak('${w.replace(/'/g, "\\'")}','en-US')">🔊</span>
          <span class="chip" onclick="Store.removeWord('${w}');viewFn=renderMe;viewArg=null;render();toast('已移出生词本')">✕</span>
        </div>`).join("") : `<div style="font-size:12px;color:var(--muted);">在对话里点击单词即可查词并加入生词本</div>`}
    </div>
    <div class="card">
      <div class="section-title">⚙️ 设置</div>
      <div class="setting-row"><div><div class="sr-label">默认语速</div><div class="sr-desc">0.75x 恢复慢速，1.25x 提速</div></div>
        <b style="font-size:13px">${st.settings.speed}x</b></div>
      <div class="setting-row"><div><div class="sr-label">默认播报顺序</div><div class="sr-desc">连播时的朗读顺序</div></div>
        <div class="seg">
          <button data-po="en-zh" class="${st.settings.playOrder === "en-zh" ? "on" : ""}">英→中</button>
          <button data-po="zh-en" class="${st.settings.playOrder === "zh-en" ? "on" : ""}">中→英</button>
        </div></div>
      <div class="setting-row"><div><div class="sr-label">英语音色</div><div class="sr-desc">美式 / 英式发音（切换需设备已有该音色）</div></div>
        <div class="seg">
          <button data-acc="US" class="${st.settings.accent === "US" ? "on" : ""}">🇺🇸 美式</button>
          <button data-acc="UK" class="${st.settings.accent === "UK" ? "on" : ""}">🇬🇧 英式</button>
        </div></div>
      <div class="setting-row"><div><div class="sr-label">保存录音</div><div class="sr-desc">开启后录音保留在本次会话</div></div>
        <label class="switch"><input type="checkbox" id="saveSw" ${st.settings.saveRecordings ? "checked" : ""}><em></em></label></div>
    </div>
    <div style="text-align:center;margin-top:4px"><span style="font-size:12px;color:var(--muted);cursor:pointer" onclick="if(confirm('确定清空全部练习数据吗？')==true && (Store.reset(), render(), true)) {} ">清空练习数据</span></div>
    <div style="text-align:center;margin-top:10px;">
      <span style="font-size:11px;color:var(--muted)">版本 ${APP_VERSION}${swState()}</span>
      <span style="font-size:11px;color:var(--primary);cursor:pointer;margin-left:10px" onclick="forceRefresh()">⟳ 强制刷新缓存</span>
    </div>
    <div style="height:8px"></div>
    <div style="height:8px"></div>`);
  document.querySelectorAll("[data-po]").forEach(b => b.onclick = () => { st.settings.playOrder = b.dataset.po; Store.save(); renderMe(); });
  document.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { st.settings.accent = b.dataset.acc; Store.save(); renderMe(); });
  const sw = $("#saveSw"); if (sw) sw.onchange = e => { st.settings.saveRecordings = e.target.checked; Store.save(); };
}
function renderFavTab(list) {
  return `<button class="btn-primary btn-primary" style="width:100%;padding:11px;border:none;border-radius:12px;color:var(--primary);background:#fff;font-weight:700;cursor:pointer;margin-bottom:14px;box-shadow:var(--shadow)" onclick="viewFn=renderMe;viewArg=null;render()">‹ 返回设置</button>
    <div class="section-title">⭐ 收藏的句子（${list.length}）</div>
    ${list.length ? list.map(f => `<div class="card" style="padding:14px">
      <div style="font-size:15px;font-weight:700">${f.en}</div>
      <div style="font-size:13px;color:var(--muted);margin-top:4px">${f.zh}</div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="chip on" onclick="TTS.cancelled=false;TTS.speak('${f.en.replace(/'/g, "\\'")}','en-US')">🎧 听原声</button>
        <span style="font-size:11px;color:var(--muted)">${f.topicName}</span>
        <span class="chip" onclick="Store.toggleFav('${f.id}','');viewFn=renderMe;viewArg='fav';render();toast('已取消收藏')" style="margin-left:auto">🗑 移除</span>
      </div></div>`).join("") : `<div class="empty-block">🌟 还没有收藏<br>在听读练习里点「⭐ 收藏」把好句子加进来</div>`}`;
}

/* ---------- 自定义语料资源 ---------- */
function syncCustomScene() {
  let s = SCENES.find(x => x.id === "custom");
  if (!s) { s = { id: "custom", name: "自定义", icon: "✍️", desc: "我自己的日常语料", topics: [] }; SCENES.push(s); }
  s.topics = Store.get().customTopics || [];
}
let readingSceneEl = null;
function syncReadingsScene() {
  let s = SCENES.find(x => x.id === "reading");
  if (!s) { s = { id: "reading", name: "英语阅读", icon: "📄", desc: "上传的阅读材料", topics: [] }; SCENES.push(s); }
  s.topics = Store.get().readings || [];
}
function renderReading() {
  const list = Store.get().readings || [];
  viewEl.innerHTML = header("📄 英语阅读练习", "上传 txt / pdf 英语文章，转成分段听读（无角色扮演）") + `
    <input type="file" id="readFile" accept=".txt,.md,.pdf,text/plain,application/pdf" style="display:none">
    <button class="btn-primary" style="width:100%;padding:14px;border:none;border-radius:14px;background:#39b983;color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:14px;" id="readBtn">📤 上传英语文章（txt / md / pdf）</button>
    <div class="card" style="padding:12px;">
      <div class="section-title">📚 我的阅读（${list.length}）</div>
      ${list.length ? list.map(t => `<div class="recent-item">
        <div class="ri-icon">📄</div>
        <div style="min-width:0;flex:1;cursor:pointer" onclick="openTopic('${t.id}')"><div class="ri-title">${t.name}</div>
        <div class="ri-sub">${t.dialogs[0].lines.length} 段 · ${t.desc}</div></div>
        <span class="chip" onclick="delReading('${t.id}')">🗑</span>
      </div>`).join("") : `<div style="font-size:12px;color:var(--muted);padding:8px 0;">还没有上传的阅读。点上面按钮，选一篇英语 txt / md / pdf 上传。</div>`}
    </div>
    <div class="card" style="padding:12px;">
      <div class="section-title">💡 玩法</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.9">
        1. 上传文章自动分段，逐段排骨成可点读的行<br>
        2. 前若干段自动机翻中文，用于「中文/中英对照」<br>
        3. 播放控制与内置话题一致：原声 / 连播 / 循环 / A+ / 语速<br>
        4. 阅读类内容不含情景对话（角色扮演）
      </div>
    </div>`;
  $("#readBtn").onclick = () => $("#readFile").click();
  $("#readFile").onchange = e => handleReadingFile(e.target.files[0]);
}
function openReading() { pushView(renderReading, null); }
function delReading(id) {
  if (!confirm("确定删除这篇阅读？相关的收藏/掌握记录也会清除。")) return;
  const st = Store.get();
  st.readings = (st.readings || []).filter(t => t.id !== id);
  Store.saveReadings(st.readings);
  ["favs", "mastery", "review"].forEach(k => Object.keys(st[k]).forEach(x => { if (x.startsWith(id + ":")) delete st[k][x]; }));
  Store.save(); syncReadingsScene(); toast("已删除"); render();
}
async function handleReadingFile(f) {
  if (!f) return;
  try {
    const text = await readArticleText(f);
    const name = f.name.replace(/\.[^.]+$/, "").trim() || "英语阅读";
    const lines = parseUploadLines(text).filter(line => /[A-Za-z]/.test(line.en)).slice(0, 80);
    if (!lines.length) return toast("未识别到英文文章，请检查文件格式");
    const stamp = Date.now().toString(36);
    const topic = {
      id: `r${stamp}`,
      name,
      icon: "📄",
      desc: `英语文章 · ${lines.length} 段`,
      words: [], sentences: [], reading: true,
      dialogs: [{ title: name, lines }],
    };
    const list = (Store.get().readings || []).concat([topic]);
    Store.saveReadings(list); syncReadingsScene();
    toast("📄 已添加，正在生成中文对照…");
    jobTopicTranslate(topic);
    pushView(renderListen, topic.id);
  } catch (e) {
    toast(f.name && /\.pdf$/i.test(f.name) ? "PDF 解析失败，可另存为 txt / md 再试" : "文件读取失败");
  }
}
function pdfTextItemsToLines(items) {
  const rows = [];
  (items || []).filter(item => item.str && item.str.trim()).forEach(item => {
    const transform = item.transform || [];
    const x = Number(transform[4]) || 0;
    const y = Number(transform[5]) || 0;
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 3);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, text: item.str.trim() });
  });
  return rows.sort((a, b) => b.y - a.y)
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(" "))
    .join("\n");
}
async function readArticleText(f) {
  if (/\.pdf$/i.test(f.name)) {
    await ensurePdfJs();
    const data = new Uint8Array(await f.arrayBuffer());
    const doc = await window.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    const n = doc.numPages;
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      pages.push(pdfTextItemsToLines(tc.items));
    }
    return pages.join("\n\n");
  }
  return await f.text();
}
function ensurePdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; resolve(); } catch (e) { reject(e); } };
    s.onerror = () => reject(new Error("pdf.js CDN 加载失败"));
    document.head.appendChild(s);
  });
}
async function jobTopicTranslate(topic) {
  const st = Store.get();
  const owner = (st.readings || []).find(x => x.id === topic.id) ? "readings" : "customTopics";
  const lines = topic.dialogs[0].lines, N = 15;
  for (let k = 0; k < Math.min(N, lines.length); k++) {
    if (lines[k].zh) continue;
    try { const zh = await mtZh(lines[k].en); if (zh) lines[k].zh = zh; } catch (e) { break; }
  }
  const arr = (st[owner] || []).map(x => x.id === topic.id ? topic : x);
  if (owner === "readings") Store.saveReadings(arr); else Store.saveCustomTopics(arr);
  toast("✅ 中文对照已生成（前 15 段）");
}
function renderCustomManage() {
  const list = Store.get().customTopics || [];
  viewEl.innerHTML = header("✍️ 自定义对话", "把日常想说的中文，变成专属美式语料") + `
    <button class="btn-primary" style="width:100%;padding:14px;border:none;border-radius:14px;background:var(--primary);color:#fff;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:14px;" id="newBtn">＋ 新建对话场景</button>
    <div class="card" style="padding:12px;">
      <div class="section-title">📋 我的对话（${list.length}）</div>
      ${list.length ? list.map(t => `<div class="recent-item">
        <div class="ri-icon">${t.icon}</div>
        <div style="min-width:0;flex:1;cursor:pointer" onclick="openTopic('${t.id}')"><div class="ri-title">${t.name}</div>
        <div class="ri-sub">${t.dialogs[0].lines.length} 句 · ${t.desc}</div></div>
        <span class="chip on" onclick="openCustomEdit('${t.id}')">✏️ 编辑</span>
        <span class="chip" onclick="delCustom('${t.id}')">🗑</span>
      </div>`).join("") : `<div style="font-size:12px;color:var(--muted);padding:8px 0;">还没有自定义对话。点上面按钮，把你今天想说的中文逐句写进来。</div>`}
    </div>
    <div class="card" style="padding:12px;">
      <div class="section-title">💡 玩法</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.9">
        1. 一行一句输入自己的中文（支持“店员：/你：”前缀的多轮对话）<br>
        2. 点「🇺🇸 自动翻译」生成美式表达草稿，逐句直接在英文区改<br>
        3. 也可以不走翻译，英文台词区直接手写英文对话<br>
        4. 保存后正常听读 / 角色扮演练习它<br>
        5. 数据存本机 + 同步码可跨设备迁移（见下方按钮）
      </div>
    </div>
    <div class="card" style="padding:12px;">
      <div class="section-title">☁️ 跨设备同步（同步码）</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">把当前设备上所有自定义对话打包成一串“同步码”，复制到另一台设备的「导入同步码」即可完整复制过来（自定义对话本来就在本机永久保存，跨设备需手动传码）</div>
      <div style="display:flex;gap:8px;">
        <button class="chip on" id="expBtn">📤 生成同步码</button>
        <button class="chip" id="impBtn">⬇️ 导入同步码</button>
      </div>
      <textarea id="syncCode" rows="3" placeholder="导出：同步码出现在这里（可整段复制）；导入：把同步码粘贴到此处" style="width:100%;margin-top:8px;padding:8px;border:1px solid #e3e6ef;border-radius:8px;font-size:11px;"></textarea>
      <div id="syncResult" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
    </div>`;
  $("#newBtn").onclick = () => pushView(renderCustomEditor, null);
  const ta = $("#syncCode");
  $("#expBtn").onclick = () => {
    const list = Store.get().customTopics || [];
    if (!list.length) return toast("还没有自定义对话可导出");
    ta.value = btoa(unescape(encodeURIComponent(JSON.stringify(list))));
    $("#syncResult").textContent = `✅ 同步码已生成（${list.length} 个对话，${ta.value.length} 字符），复制带上`;
    $("#syncResult").style.color = "var(--ok)";
    (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).catch(() => {});
    toast("已复制到剪贴板（失败则手动全选复制）");
  };
  $("#impBtn").onclick = () => {
    const code = ta.value.trim();
    if (!code) return toast("先把同步码粘贴进下面的框");
    let data = null;
    try { data = JSON.parse(decodeURIComponent(escape(atob(code.replace(/\s/g, ""))))); } catch (e) {}
    if (!data || !Array.isArray(data)) return toast("同步码无效");
    const st = Store.get();
    const cur = st.customTopics || [];
    let add = 0, upd = 0;
    data.forEach(t => {
      if (!t || !t.id || !t.dialogs) return;
      const idx = cur.findIndex(x => x.id === t.id);
      if (idx >= 0) { cur[idx] = t; upd++; } else { cur.push(t); add++; }
    });
    Store.saveCustomTopics(cur);
    syncCustomScene();
    toast(`导入完成（新增 ${add}、更新 ${upd}）`);
    render();
  };
}
function openCustomEdit(topicId) { pushView(renderCustomEditor, topicId); }
function delCustom(topicId) {
  if (!confirm("确定删除这个自定义话题？删除后其收藏/掌握记录也会清除。")) return;
  const st = Store.get();
  st.customTopics = (st.customTopics || []).filter(t => t.id !== topicId);
  Store.saveCustomTopics(st.customTopics);
  ["favs", "mastery", "review"].forEach(k => Object.keys(st[k]).forEach(id => { if (id.startsWith(topicId + ":")) delete st[k][id]; }));
  Store.save();
  syncCustomScene();
  toast("已删除"); render();
}
/* 剥离 “角色名: 台词” 前缀，返回 {sp, text} 或 null */
function splitRolePrefix(str) {
  const m = str.match(/^\s*([^\s:：]{1,15})\s*[:：]\s+(.+)$/s);
  return m ? { sp: m[1], text: m[2].trim() } : null;
}
/* 把行数组归一为 {en, zh, speaker, who} 结构：首个说话者=A，第二个=B，其余并入 B */
function normalizeRoles(lines) {
  const seen = [];
  lines.forEach(l => {
    const pEn = splitRolePrefix(l.en), pZh = splitRolePrefix(l.zh);
    const sp = pEn ? pEn.sp : (pZh ? pZh.sp : null);
    if (sp) {
      if (!seen.includes(sp)) seen.push(sp);
      l.speaker = sp;
      l.who = seen[0] === sp ? "A" : "B"; // 只保留两个角色位
      if (pEn) l.en = pEn.text;
      if (pZh) l.zh = pZh.text;
    } else {
      l.speaker = l.speaker || null;
      if (!l.who || !/^[AB]$/.test(l.who)) l.who = seen.length === 0 ? "A" : "B";
    }
  });
  return lines;
}
function renderCustomEditor(editId) {
  const ext = editId ? (Store.get().customTopics || []).find(t => t.id === editId) : null;
  const icon = ext ? ext.icon : "💬";
  viewEl.innerHTML = header(editId ? "✏️ 编辑语料" : "＋ 新建对话", "中文逐句输入，可自动生成美式表达") + `
    <div class="card">
      <div class="setting-row"><div class="sr-label">场景名称</div></div>
      <input id="cName" maxlength="12" placeholder="例：点果茶" value="${ext ? ext.name.replace(/"/g, "&quot;") : ""}" style="width:100%;padding:10px;border:1.5px solid #e3e6ef;border-radius:10px;font-size:14px;margin-bottom:12px;">
      <div class="sr-label">中文台词</div>
      <textarea id="cZh" rows="7" placeholder="一行一句想说的中文，例如：&#10;店员：你好，请问想喝点什么？&#10;你：你好，我要一杯鸭屎香柠檬茶。&#10;你：少糖，正常冰，谢谢。&#10;（纯英语对话可只填英文台词区）" style="width:100%;padding:10px;border:1.5px solid #e3e6ef;border-radius:10px;font-size:13px;margin-top:6px;"></textarea>
      <div class="setting-row" style="padding:8px 0 4px;">
        <div><div class="sr-label">英文台词</div><div class="sr-desc">英文留空 → 自动翻译；不满意可点重新翻译；也可只填英文直接保存</div></div>
        <button class="chip on" id="trBtn">🇺🇸 自动翻译</button>
      </div>
      <textarea id="cEn" class="en-area" rows="7" placeholder="中文留空时本栏可直接粘贴英文对话（支持 A:/B: 前缀，逐行保留）；译文也逐句显示在这里，可直接修改" style="width:100%;padding:10px;border:1.5px solid #e3e6ef;border-radius:10px;font-size:13px;font-family:Consolas,monospace;"></textarea>
    </div>
    <button class="btn-primary" style="width:100%;padding:14px;border:none;border-radius:14px;background:var(--primary);color:#fff;font-size:15px;font-weight:700;cursor:pointer;" id="saveBtn">💾 保存到自定义对话</button>
    <div style="height:60px"></div>`;
  if (editId) {
    const src = ext.dialogs[0].lines;
    $("#cZh").value = src.map(l => l.zh).join("\n");
    $("#cEn").value = src.map(l => l.en).join("\n");
  }
  function parseLines() {
    const zh = $("#cZh").value.split("\n").map(x => x.trim()).filter(Boolean);
    const enRaw = $("#cEn").value.split("\n").map(x => x.trim()).filter(Boolean);
    // 支持纯英文直存：以英文行数为准，中文可为空；两栏行数取大
    const n = Math.max(zh.length, enRaw.length);
    const out = [];
    for (let k = 0; k < n; k++) out.push({ zh: zh[k] || "", en: enRaw[k] || "" });
    return out;
  }
  $("#trBtn").onclick = async () => {
    const zh = parseLines ? $("#cZh").value.split("\n").map(x => x.trim()).filter(Boolean) : [];
    if (!zh.length) return toast("请先输入中文（纯英文对话可直接点保存）");
    $("#trBtn").textContent = "⏳ 翻译中…"; $("#trBtn").disabled = true;
    const enOut = []; let fail = 0;
    for (const z of zh) { const en = await mtTranslate(z); if (en) enOut.push(en); else { enOut.push(""); fail++; } }
    $("#cEn").value = enOut.join("\n");
    $("#trBtn").textContent = "🇺🇸 重新翻译"; $("#trBtn").disabled = false;
    toast(fail ? `${fail} 句机翻失败，该行留空可手填` : "✅ 翻译完成，已填入英文台词区，可直接修改");
  };
  $("#saveBtn").onclick = async () => {
    let draft = parseLines();
    // 纯英文输入：无任何中文也接受；逐行补齐（中文空 & 英文空的行丢弃）
    draft = draft.filter(d => d.zh || d.en);
    for (const d of draft) {
      if (!d.en && d.zh) { const en = await mtTranslate(d.zh); if (en) d.en = en; }
      else if (!d.zh && d.en) { const zh = await mtZh(d.en).catch(() => null); if (zh) d.zh = zh; }
    }
    if (draft.some(d => !d.en && d.zh)) return toast("还有句子没有英文，补充或再点自动翻译");
    if (!draft.length) return toast("先填写中文台词或英文台词");
    const name = $("#cName").value.trim() || (`我的对话 ${new Date().toLocaleDateString().replace(/\//g, "-")} · ${draft.length} 句`);
    let list = Store.get().customTopics || [];
    const topic = {
      id: editId || ("c" + Date.now().toString(36)),
      name: name.slice(0, 12), icon,
      desc: `我的对话 · ${draft.length} 句`,
      words: [],
      sentences: [],
      dialogs: [{ title: name.slice(0, 12), lines: normalizeRoles(draft.map(d => ({ en: d.en, zh: d.zh }))) }],
    };
    if (editId) list = list.map(t => (t.id === editId ? topic : t));
    else list = list.concat([topic]);
    Store.saveCustomTopics(list);
    syncCustomScene();
    toast("💾 已保存，可返回练习啦");
    stateStack.pop(); stateStack.pop(); viewFn = renderCustomManage; viewArg = null; render();
  };
}
function usableZh(text) {
  const t = (text || "").trim();
  return t && /[\u3400-\u9fff]/.test(t) && !/INVALID|EXCEPTION|QUOTA|WARNING|HTML ERROR/i.test(t) ? t : null;
}
/* 英译中：优先 MyMemory，额度或服务异常时改用备用翻译；只接受中文结果 */
async function mtZh(en) {
  try {
    const r = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(en)}&langpair=en-US|zh-CN`, 5000);
    const m = await r.json();
    const translated = usableZh((m.responseData || {}).translatedText || "");
    if (translated) return translated;
  } catch (e) { }
  try {
    const r = await fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(en)}`, 5000);
    const data = await r.json();
    const translated = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map(part => Array.isArray(part) ? part[0] : "").join("")
      : "";
    return usableZh(translated);
  } catch (e) { return null; }
}
/* MyMemory 中英机翻 → 从多个候选中取“简洁、口语”的那句 → 首字母大写 + 结尾标点 */
async function mtTranslate(line) {  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(line)}&langpair=zh-CN|en-US`);
    const m = await r.json();
    const rt0 = (m.responseData || {}).translatedText || "";
    if (!rt0 && !m.matches) return null;
    const bad = t => !t || /INVALID|EXCEPTION|QUOTA|HTML ERROR/i.test(t) || /[\u4e00-\u9fa5]/.test(t);
    // 候选集：官方主译 + 匹配库多译本（matches 常含更简短口语的译文）
    const cands = [];
    const rt = (m.responseData || {}).translatedText || "";
    if (!bad(rt)) cands.push(rt);
    (m.matches || []).forEach(x => { if (x && !bad(x.translation)) cands.push(x.translation); });
    if (!cands.length) return null;
    // 优选最短的候选（短译通常更口语、更易懂），主译权重靠前
    cands.sort((a, b) => a.length - b.length);
    let t = (cands.find(x => x.length <= 40) || cands[0]).trim();
    t = t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
    t = t.replace(/\s+/g, " ").trim();
    if (!t) return null;
    t = t[0].toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) t += t.includes("?") ? "?" : ".";
    return t;
  } catch (e) { return null; }
}

function isChineseText(text) {
  return /[\u3400-\u9fff]/.test(text || "");
}
async function resolveFreeTypedAnswer(rawText) {
  const source = (rawText || "").trim();
  if (!isChineseText(source)) return { english: source, zh: null, translated: false, error: "" };
  const english = await mtTranslate(source);
  if (!english || isChineseText(english)) {
    return { english: "", zh: source, translated: true, error: "translation-unavailable" };
  }
  return { english, zh: source, translated: true, error: "" };
}

/* ---------- 版本 & 缓存自更新 ---------- */
const APP_VERSION = "v1.6 · " + new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function swState() {
  if (!("serviceWorker" in navigator)) return "";
  return navigator.serviceWorker.controller ? " · 离线可用" : "";
}
async function forceRefresh() {
  toast("正在清理缓存并刷新…");
  try {
    if ("caches" in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { /* 忽略 */ }
  setTimeout(() => location.reload(true), 400);
}
/* SW 检测到新版本时提示刷新 */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    toast("🔄 已更新到最新版本");
  });
}

/* ---------- Tab 事件 ---------- */
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  currentTab = t.dataset.tab;
  stateStack = [];
  viewFn = { home: renderHome, review: renderReview, me: renderMe }[currentTab];
  viewArg = currentTab === "me" ? null : viewArg;
  render();
});

/* 启动 */
if (!TTS.available) toast("当前浏览器不支持语音合成，建议用 Chrome / Edge");
TTS.refresh && window.speechSynthesis && TTS.refresh();
setupPhraseSelection();
syncCustomScene();
syncReadingsScene();
setupAppHistory();
render();
