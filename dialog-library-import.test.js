const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const sourceFiles = ["js/data.js", "js/data_pdf.js", "js/data_more_dialogs.js", "js/data_family_8000.js", "js/store.js", "js/tts.js", "js/recorder.js", "js/app.js"]
  .filter(file => fs.existsSync(path.join(root, file)));
const source = sourceFiles.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n;\n");

function createApp() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
    url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true,
  });
  const { window } = dom;
  window.speechSynthesis = {
    getVoices: () => [{ lang: "en-US", localService: true }],
    speak: utterance => setTimeout(() => utterance.onend && utterance.onend(), 1),
    cancel: () => {},
  };
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.navigator.mediaDevices = { getUserMedia: async () => { throw new Error("no mic"); } };
  window.Audio = function () { return { play() {}, pause() {} }; };
  window.fetch = async () => { throw new Error("network must not be needed by this fixture"); };
  window.eval(source + "\n;\nwindow.__test = { Store, RESOURCES, SCENES, TTS, Recorder, evaluateFreeResponse, scoreFreeSession, renderFreeScoreSummary };");
  return window;
}

const sampleDocument = `30套完整版日常英语情景对话（中英对照·每场景10句+·可直接导出PDF）
适用难度：A2-B1 初高中/零基础进阶/出国日常交流
内容特点：全真实生活化对话，每场景10句以上。
使用方式：全文复制 → 粘贴至WPS/Word
---
1. Greeting & Small Talk 日常打招呼与闲聊
A: Hi Mark! It’s so good to run into you here.（嗨马克！太巧在这里碰到你了。）
B: Hey Lisa! Long time no see. (嗨莉萨！好久不见。)

2. At a Cafe 咖啡店
A: What would you like?（您想喝点什么？）
B: A latte, please.（请来一杯拿铁。）`;

async function uploadedDocumentBecomesCleanTitledTopics() {
  const window = createApp();
  window.__file = { name: "daily-dialogs.txt", text: async () => sampleDocument };
  await window.eval("handleUploadResourceFile(window.__file)");

  const uploaded = window.__test.Store.get().uploads[0];
  assert.equal(uploaded.topics.length, 2);
  assert.equal(uploaded.topics[0].name, "Greeting & Small Talk 日常打招呼与闲聊");
  const firstLine = uploaded.topics[0].dialogs[0].lines[0];
  assert.equal(firstLine.who, "A");
  assert.equal(firstLine.en, "Hi Mark! It’s so good to run into you here.");
  assert.equal(firstLine.zh, "嗨马克！太巧在这里碰到你了。");
  assert.equal(uploaded.topics.flatMap(topic => topic.dialogs[0].lines)
    .some(line => /30套完整版|适用难度|内容特点|使用方式/.test(line.en)), false);
  window.close();
}

async function uploadedResourceOpensTopicListDirectly() {
  const window = createApp();
  window.__file = { name: "daily-dialogs.txt", text: async () => sampleDocument };
  await window.eval("handleUploadResourceFile(window.__file)");
  const uploaded = window.__test.Store.get().uploads[0];
  window.eval(`openResource(${JSON.stringify(uploaded.sceneId)})`);

  const viewText = window.document.querySelector("#view").textContent;
  assert.match(viewText, /Greeting & Small Talk/);
  assert.equal(viewText.includes("场景列表"), false);
  window.close();
}

async function improvisedPoolAddsOnlyTheSeparateOnlineCatalog() {
  const window = createApp();
  const pool = window.eval("allFreeScenarios()");
  assert.equal(pool.length, 46);
  assert.ok(pool.some(scene => scene.id === "f-cafe"));
  assert.equal(pool.some(scene => /^d\d+$/.test(scene.id)), false);
  assert.equal(pool.filter(scene => /^more-/.test(scene.id)).length, 36);
  assert.ok(pool.every(scene => scene.lines.length >= 10), "every improvisation scene must have at least 10 lines");
  assert.ok(pool.every(scene => scene.lines.every((line, index, lines) => index === 0 || line.who !== lines[index - 1].who)), "every improvisation scene must alternate speakers");
  assert.ok(pool.every(scene => scene.lines.filter(line => line.who === "B").length >= 5), "every improvisation scene must give the learner at least 5 turns");
  window.close();
}

async function homeExplainsTheExpandedImprovisedPracticePool() {
  const window = createApp();
  assert.match(window.document.querySelector("#view").textContent, /46 组/);
  window.close();
}

async function localAnswerQualityRewardsRelevantCompleteResponses() {
  const window = createApp();
  const prompt = "When will you arrive for the business trip?";
  const suggestions = [{ en: "I plan to be there by tomorrow afternoon." }];
  const full = window.__test.evaluateFreeResponse(
    "I plan to be there by tomorrow afternoon.", prompt, suggestions
  );
  const brief = window.__test.evaluateFreeResponse("Maybe tomorrow.", prompt, suggestions);
  const unrelated = window.__test.evaluateFreeResponse("I like pizza.", prompt, suggestions);

  assert.ok(full.score >= 90);
  assert.ok(brief.score >= 60 && brief.score <= 75);
  assert.ok(full.score - brief.score >= 20);
  assert.ok(unrelated.score < brief.score);
  assert.match(brief.feedback.join(" "), /完整/);
  window.close();
}

async function freeDialogSessionScoreUsesTextOnly() {
  const window = createApp();
  const session = window.__test.scoreFreeSession([{
    type: "mic",
    answerEvaluation: { score: 70 },
    clarity: { status: "scored", score: 99 },
  }]);
  assert.equal(session.contentScore, 70);
  assert.equal(session.total, 70);
  window.close();
}

async function freeDialogAsrUsesBrowserMicrophoneModeAndWaitsForFinalTranscript() {
  const window = createApp();
  let instance, startArgs;
  const track = { kind: "audio", id: "shared-microphone-track" };
  window.webkitSpeechRecognition = function () {
    instance = this;
    this.start = (...args) => { startArgs = args; };
    this.stop = () => {
      this.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "Maybe tomorrow" } }],
      });
      this.onend();
    };
  };
  window.__asrTrack = track;
  const asr = window.eval("startASR(window.__asrTrack)");
  const result = await asr.finish();

  assert.equal(startArgs.length, 0);
  assert.equal(result.transcript, "Maybe tomorrow");
  assert.equal(result.error, "");
  window.close();
}

async function freeDialogAsrUsesOneBrowserStartAndReportsRecognitionErrors() {
  const window = createApp();
  const track = { kind: "audio", id: "fallback-track" };
  let startCalls = 0;
  window.webkitSpeechRecognition = function () {
    this.start = (...args) => {
      startCalls++;
      assert.equal(args.length, 0);
    };
    this.stop = () => {
      this.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "I can arrive tomorrow." } }],
      });
      this.onend();
    };
  };
  window.__asrTrack = track;
  const fallback = window.eval("startASR(window.__asrTrack)");
  const fallbackResult = await fallback.finish();
  assert.equal(startCalls, 1);
  assert.equal(fallbackResult.transcript, "I can arrive tomorrow.");

  window.webkitSpeechRecognition = function () {
    this.start = () => {};
    this.stop = () => {
      this.onerror({ error: "no-speech" });
      this.onend();
    };
  };
  const noSpeech = window.eval("startASR()");
  const noSpeechResult = await noSpeech.finish();
  assert.equal(noSpeechResult.transcript, "");
  assert.equal(noSpeechResult.error, "no-speech");
  window.close();
}

async function freeDialogAsrUsesInterimTextWhenNoFinalResultArrives() {
  const window = createApp();
  window.webkitSpeechRecognition = function () {
    this.start = () => {};
    this.stop = () => {
      this.onresult({
        resultIndex: 0,
        results: [{ isFinal: false, 0: { transcript: "I will be there tomorrow" } }],
      });
      this.onend();
    };
  };
  const asr = window.eval("startASR()");
  const result = await asr.finish();
  assert.equal(result.transcript, "I will be there tomorrow");
  assert.equal(result.error, "");
  window.close();
}

async function freeDialogRendersTheFinalSpokenTextInTheLearnerBubble() {
  const window = createApp();
  const recorder = window.__test.Recorder;
  recorder.start = async () => {};
  recorder.stop = async () => ({ url: "blob:spoken-answer" });
  window.webkitSpeechRecognition = function () {
    this.start = () => {};
    this.stop = () => {
      this.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "I can arrive tomorrow morning." } }],
      });
      this.onend();
    };
  };
  window.eval(`renderFreeRun(${JSON.stringify({
    id: "test-spoken-text", name: "转写测试", icon: "🎤", intro: "测试用",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明到达时间", sugs: [{ en: "I can arrive tomorrow morning.", zh: "我明天早上能到。" }] },
    ],
  })})`);
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnMic").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  window.document.querySelector("#turnMic").click();
  await new Promise(resolve => setTimeout(resolve, 100));

  assert.match(window.document.querySelector("#stage").textContent, /I can arrive tomorrow morning\./);
  window.close();
}

async function freeDialogSummaryExplainsTextOnlyScoring() {
  const window = createApp();
  const summary = window.__test.renderFreeScoreSummary({
    total: 70, contentScore: 70,
  }, [{ type: "mic", answerEvaluation: { score: 70, feedback: ["信息还不够完整。"] } }]);
  const summaryEl = window.document.createElement("div");
  summaryEl.innerHTML = summary;
  assert.match(summaryEl.textContent, /回答质量/);
  assert.match(summaryEl.textContent, /信息还不够完整/);
  assert.match(summaryEl.textContent, /不按音质评分/);
  assert.doesNotMatch(summaryEl.textContent, /识别清晰度/);
  window.close();
}

async function chineseTypedFreeAnswerUsesEnglishTranslationForTheAnswer() {
  const window = createApp();
  window.fetch = async () => ({ json: async () => ({
    responseData: { translatedText: "I will arrive tomorrow afternoon." }, matches: [],
  }) });

  const answer = await window.eval("resolveFreeTypedAnswer('我明天下午到。')");

  assert.deepEqual(JSON.parse(JSON.stringify(answer)), {
    english: "I will arrive tomorrow afternoon.",
    zh: "我明天下午到。",
    translated: true,
    error: "",
  });
  window.close();
}

async function failedChineseTypedFreeAnswerDoesNotAdvanceTheTurn() {
  const window = createApp();
  window.fetch = async () => { throw new Error("offline"); };
  window.eval(`renderFreeRun({
    id: "typed-fail", name: "测试", icon: "🎯", intro: "",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明时间", sugs: [{ en: "Tomorrow afternoon.", zh: "明天下午。" }] },
      { who: "A", en: "Thanks.", zh: "谢谢。" },
    ],
  })`);
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeZh").value = "我明天下午到。";
  window.document.querySelector("#typeTranslate").click();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(window.document.querySelector("#typeZh").value, "我明天下午到。");
  assert.match(window.document.querySelector("#hintBox").textContent, /暂时无法把中文译成英文/);
  assert.equal(window.document.querySelectorAll("#stage .bubble").length, 1);
  window.close();
}

async function adaptivePartnerAcknowledgesTimeAndUsesNextTurnDirection() {
  const window = createApp();
  const result = window.eval(`buildAdaptivePartnerLine(
    "I will arrive tomorrow afternoon.", "When will you arrive?",
    { who: "A", en: "Do you need a hotel?", zh: "你需要酒店吗？" },
    { who: "B", dir: "确认时间安排", sugs: [] }
  )`);

  assert.match(result.en, /Tomorrow afternoon/);
  assert.match(result.en, /What time would work best for you\?/);
  assert.equal(result.zh, "明天下午听起来不错。什么时间最适合你？");
  window.close();
}

async function adaptivePartnerAsksForMoreAfterAnOverlyShortAnswer() {
  const window = createApp();
  const originalLine = { who: "A", en: "Do you need a hotel?", zh: "你需要酒店吗？" };
  const result = window.eval(`buildAdaptivePartnerLine(
    "Maybe.", "When will you arrive?",
    ${JSON.stringify(originalLine)},
    { who: "B", dir: "确认时间安排", sugs: [] }
  )`);

  assert.match(result.en, /Could you tell me a little more\?/);
  assert.equal(result.zh, "我明白了。你能再多说一点吗？");
  assert.equal(originalLine.en, "Do you need a hotel?");
  window.close();
}

async function freeDialogReplacesOnlyTheNextPartnerLineForAValidAnswer() {
  const window = createApp();
  const scenario = {
    id: "adaptive", name: "测试", icon: "🎯", intro: "",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明到达时间", sugs: [{ en: "I will arrive tomorrow afternoon.", zh: "我明天下午到。" }] },
      { who: "A", en: "Do you need a hotel?", zh: "你需要订酒店吗？" },
      { who: "B", dir: "确认时间安排", sugs: [{ en: "Tomorrow afternoon works for me.", zh: "明天下午可以。" }] },
    ],
  };
  window.__scenario = scenario;
  window.eval("renderFreeRun(window.__scenario)");
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeEn").value = "I will arrive tomorrow afternoon.";
  window.document.querySelector("#typeGo").click();
  await new Promise(resolve => setTimeout(resolve, 100));

  const bubbles = [...window.document.querySelectorAll("#stage .bubble")].map(node => node.textContent);
  assert.ok(bubbles.some(text => /Tomorrow afternoon sounds good\. What time would work best for you\?/.test(text)));
  assert.equal(bubbles.some(text => text.includes("Do you need a hotel?")), false);
  assert.equal(scenario.lines[2].en, "Do you need a hotel?");
  window.close();
}

async function chineseTypedFreeAnswerRendersEnglishAndOriginalChinese() {
  const window = createApp();
  window.fetch = async () => ({ json: async () => ({
    responseData: { translatedText: "I will arrive tomorrow afternoon." }, matches: [],
  }) });
  window.eval(`renderFreeRun({
    id: "typed-success", name: "测试", icon: "🎯", intro: "",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明到达时间", sugs: [{ en: "I will arrive tomorrow afternoon.", zh: "我明天下午到。" }] },
      { who: "A", en: "Thanks.", zh: "谢谢。" },
      { who: "B", dir: "确认安排", sugs: [{ en: "That works for me.", zh: "这样可以。" }] },
    ],
  })`);
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeZh").value = "我明天下午到。";
  window.document.querySelector("#typeTranslate").click();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(window.document.querySelector("#typeEn").value, "I will arrive tomorrow afternoon.");
  assert.equal(window.document.querySelectorAll("#stage .bubble").length, 1);
  window.document.querySelector("#typeGo").click();
  await new Promise(resolve => setTimeout(resolve, 100));

  const userBubble = window.document.querySelector("#stage .bubble.user .bubble-content");
  assert.equal(userBubble.firstChild.textContent, "I will arrive tomorrow afternoon.");
  assert.equal(userBubble.querySelector(".bubble-zh").textContent, "我明天下午到。");
  window.close();
}

async function emptyEnglishTypedFreeAnswerPromptsForEnglishBeforeSubmitting() {
  const window = createApp();
  window.eval(`renderFreeRun({
    id: "empty-english", name: "测试", icon: "🎯", intro: "",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明到达时间", sugs: [{ en: "Tomorrow afternoon.", zh: "明天下午。" }] },
      { who: "A", en: "Thanks.", zh: "谢谢。" },
    ],
  })`);
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeGo").click();

  assert.equal(window.document.querySelector("#toast").textContent, "还没输入英文对话");
  assert.equal(window.document.querySelectorAll("#stage .bubble").length, 1);
  window.close();
}

async function freeRunProvidesSeparateContinueAndRetryActions() {
  const window = createApp();
  const scenario = {
    id: "f-cafe", name: "当前场景", icon: "🎯", intro: "",
    lines: [{ who: "A", en: "Hello.", zh: "你好。" }, { who: "B", dir: "回应", sugs: [{ en: "Hi.", zh: "你好。" }] }],
  };
  window.__scenario = scenario;
  window.eval("renderFreeRun(window.__scenario)");
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(window.document.querySelector("#freeContinueBtn").textContent, "🎲 继续练习");
  assert.equal(window.document.querySelector("#freeRetryBtn").textContent, "🔄 重新练习");
  window.eval("pushView = (view, arg) => { window.__continuedScene = arg; }");
  window.Math.random = () => 0;
  window.document.querySelector("#freeContinueBtn").click();
  assert.notEqual(window.__continuedScene.id, scenario.id);
  window.eval("renderFreeRun = arg => { window.__retriedScene = arg; }");
  window.document.querySelector("#freeRetryBtn").click();
  assert.strictEqual(window.__retriedScene, scenario);
  window.close();
}

async function skippedFreeAnswerKeepsTheOriginalFollowingPartnerLine() {
  const window = createApp();
  window.eval(`renderFreeRun({
    id: "skip-original", name: "测试", icon: "🎯", intro: "",
    lines: [
      { who: "A", en: "When will you arrive?", zh: "你什么时候到？" },
      { who: "B", dir: "说明到达时间", sugs: [{ en: "I will arrive tomorrow afternoon.", zh: "我明天下午到。" }] },
      { who: "A", en: "Do you need a hotel?", zh: "你需要订酒店吗？" },
      { who: "B", dir: "确认安排", sugs: [{ en: "That works for me.", zh: "这样可以。" }] },
    ],
  })`);
  await new Promise(resolve => setTimeout(resolve, 100));
  window.document.querySelector("#turnSkip").click();
  await new Promise(resolve => setTimeout(resolve, 100));

  assert.ok([...window.document.querySelectorAll("#stage .bubble")]
    .some(node => node.textContent.includes("Do you need a hotel?")));
  window.close();
}

async function uploadParserRemovesEscapesButPreservesSpacedContractions() {
  const window = createApp();
  const escaped = "1.\\ Greeting \\& Small Talk 日常打招呼与闲聊\nA: Hi Mar\\k! I’ m glad to see you here\\.（见到你真高兴。）\nB: Me too\\! How have you been\\?（我也是！你最近怎么样？）";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(escaped)})`);

  assert.equal(parsed[0].title, "Greeting & Small Talk 日常打招呼与闲聊");
  assert.equal(parsed[0].lines[0].en, "Hi Mark! I’ m glad to see you here.");
  assert.equal(parsed[0].lines[1].en, "Me too! How have you been?");
  window.close();
}

async function dialogResourceSeparatesInlineChineseFromEnglish() {
  const window = createApp();
  const source = "1. Breakfast 早餐\nMom: Time to eat! 该吃饭了！\nChild: Just one more minute. 再等一分钟。";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(source)})`);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "Breakfast 早餐");
  assert.equal(JSON.stringify(parsed[0].lines.map(line => [line.en, line.zh])), JSON.stringify([
    ["Time to eat!", "该吃饭了！"],
    ["Just one more minute.", "再等一分钟。"],
  ]));
  window.close();
}

async function dialogResourceUsesEachChapterHeadingAsItsOwnTopic() {
  const window = createApp();
  window.__file = {
    name: "family-dialogs.txt",
    text: async () => "CHAPTER01-01 起床\nMom: Time to wake up! 该起床了！\nChild: Good morning! 早安！\nCHAPTER01-02 早餐\nMom: Eat your breakfast. 吃早餐吧。\nChild: I am coming. 我马上来。",
  };
  await window.eval("handleUploadResourceFile(window.__file)");

  const topics = window.__test.Store.get().uploads[0].topics;
  assert.equal(JSON.stringify(topics.map(topic => topic.name)), JSON.stringify(["01-01 起床", "01-02 早餐"]));
  assert.equal(topics[0].dialogs[0].lines[0].en, "Time to wake up!");
  assert.equal(topics[0].dialogs[0].lines[0].zh, "该起床了！");
  assert.equal(topics.flatMap(topic => topic.dialogs[0].lines).some(line => /CHAPTER/.test(line.en)), false);
  window.close();
}

async function unlabelledDialogResourceStillSplitsByChapterHeading() {
  const window = createApp();
  window.__file = {
    name: "practice.txt",
    text: async () => "CHAPTER01-01 起床\nTime to wake up! 该起床了！\nGood morning! 早安！\nCHAPTER01-02 早餐\nEat your breakfast. 吃早餐吧。\nI am coming. 我马上来。",
  };
  await window.eval("handleUploadResourceFile(window.__file)");

  const topics = window.__test.Store.get().uploads[0].topics;
  assert.equal(JSON.stringify(topics.map(topic => topic.name)), JSON.stringify(["01-01 起床", "01-02 早餐"]));
  assert.equal(JSON.stringify(topics[1].dialogs[0].lines.map(line => [line.who, line.en, line.zh])), JSON.stringify([
    ["A", "Eat your breakfast.", "吃早餐吧。"],
    ["B", "I am coming.", "我马上来。"],
  ]));
  window.close();
}

async function pdfImportKeepsTextItemsOnTheirVisualRows() {
  const window = createApp();
  const items = [
    { str: "晨起出门日常（家庭高频）", transform: [1, 0, 0, 1, 40, 720] },
    { str: "第一篇章", transform: [1, 0, 0, 1, 300, 720] },
    { str: "Good morning!", transform: [1, 0, 0, 1, 40, 690] },
    { str: "早上好！", transform: [1, 0, 0, 1, 300, 690] },
  ];
  const text = window.eval(`pdfTextItemsToLines(${JSON.stringify(items)})`);

  assert.equal(text, "晨起出门日常（家庭高频） 第一篇章\nGood morning! 早上好！");
  window.close();
}

async function pdfImportReadsEveryPageInsteadOfStoppingAtThirty() {
  const window = createApp();
  const pagesRead = [];
  window.pdfjsLib = {
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 31,
      getPage: async pageNumber => {
        pagesRead.push(pageNumber);
        return { getTextContent: async () => ({ items: [{ str: `Page ${pageNumber}`, transform: [1, 0, 0, 1, 40, 720] }] }) };
      },
    }) }),
  };
  window.__file = { name: "long-resource.pdf", arrayBuffer: async () => new ArrayBuffer(0) };
  const text = await window.eval("readArticleText(window.__file)");

  assert.equal(pagesRead.length, 31);
  assert.match(text, /Page 31/);
  window.close();
}

async function chineseChapterHeadingsBecomeTopicsAndNumberedBilingualRowsStayLines() {
  const window = createApp();
  window.__file = {
    name: "family-english.txt",
    text: async () => "美国家庭常用英语 8000 句\n素材简介：亲子生活英语\n第一篇章 晨起出门日常（家庭高频）\n1. Good morning! 早上好！\n2. Did you sleep well last night? 昨晚睡得好吗？\n第二篇章 做家事\n1. Please wash your hands. 请洗手。\n2. Put your toys away. 把玩具收好。",
  };
  await window.eval("handleUploadResourceFile(window.__file)");

  const topics = window.__test.Store.get().uploads[0].topics;
  assert.equal(JSON.stringify(topics.map(topic => topic.name)), JSON.stringify(["第一篇章 晨起出门日常（家庭高频）", "第二篇章 做家事"]));
  assert.equal(JSON.stringify(topics[0].dialogs[0].lines.map(line => [line.who, line.en, line.zh])), JSON.stringify([
    ["A", "Good morning!", "早上好！"],
    ["B", "Did you sleep well last night?", "昨晚睡得好吗？"],
  ]));
  assert.equal(topics.flatMap(topic => topic.dialogs[0].lines).some(line => /素材简介|8000/.test(line.en)), false);
  window.close();
}

async function dialogImportRemovesPdfControlCharactersButKeepsSpacedContractions() {
  const window = createApp();
  const source = "1. Greeting 问候\nA: I’ m glad to see you.\u0000 很高兴见到你。\nB: Me too!\uFFFD 我也是！";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(source)})`);

  assert.equal(parsed[0].lines[0].en, "I’ m glad to see you.");
  assert.equal(parsed[0].lines[0].zh, "很高兴见到你。");
  assert.equal(parsed[0].lines[1].en, "Me too!");
  assert.equal(parsed[0].lines[1].zh, "我也是！");
  window.close();
}

async function dialogImportRepairsWrappedTranslationParenthesis() {
  const window = createApp();
  const source = "1. Greeting 问候\nA: Hi Mark!（嗨，马克！）\nB: Hey Lisa! Long time no see. How have you been lately? （\n嗨莉萨！好久不见。你最近怎么样？）";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(source)})`);

  assert.equal(parsed[0].lines[1].en, "Hey Lisa! Long time no see. How have you been lately?");
  assert.equal(parsed[0].lines[1].zh, "嗨莉萨！好久不见。你最近怎么样？");
  window.close();
}

async function dialogImportNormalizesFullwidthApostrophes() {
  const window = createApp();
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify("1. Plans 计划\nA: I＇ll call you later.（我稍后打给你。）\nB: Great!（太好了！）")})`);

  assert.equal(parsed[0].lines[0].en, "I'll call you later.");
  window.close();
}

async function ttsReadsFullwidthContractionAsOneEnglishRun() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("I＇ll call you later.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{ text: "I will call you later.", lang: "en-US" }]));
  window.close();
}

async function ttsNormalizesSpacedContractionsBeforeSpeaking() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("I ’ ve called. It ’ s ready. That ’ s fine. I ’ ll go. I ’ d wait.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "I have called. It is ready. That is fine. I will go. I would wait.", lang: "en-US",
  }]));
  window.close();
}

async function ttsReadsMaskedPhoneNumbersDigitByDigit() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("Call 138XXXX9657.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "Call one three eight X X X X nine six five seven.", lang: "en-US",
  }]));
  window.close();
}

async function ttsNormalizesCommonContractionForms() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("Don ’ t worry! I can ’ t stay. That ` s fine. It won ’ t happen. We shouldn ’ t wait. I ＇ m ready. You ’ re ready. She ’ ll call. We ’ d help. They ’ ve arrived. He ’ s here. Let ’ s go. There ’ s time. John ’ s book.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "Don't, worry! I can't, stay. That is fine. It won't, happen. We shouldn't, wait. I am ready. You are ready. She will call. We would help. They have arrived. He is here. Let us go. There is time. John's book.", lang: "en-US",
  }]));
  window.close();
}

async function ttsExpandsAuxiliariesSoContractedSuffixesCannotDisappear() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("We ’ ll practice. I ’ ll take it. You ’ ve helped me.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "We will practice. I will take it. You have helped me.", lang: "en-US",
  }]));
  window.close();
}

async function ttsResolvesAmbiguousSAndDContractionsFromContext() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("He's finished. She's already left. I'd finished. I'd wait. John's book.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "He has finished. She has already left. I had finished. I would wait. John's book.", lang: "en-US",
  }]));
  window.close();
}

async function ttsHandlesCompoundContractionsWithoutDroppingAuxiliaries() {
  const window = createApp();
  const spoken = [];
  window.speechSynthesis.speak = utterance => {
    spoken.push({ text: utterance.text, lang: utterance.lang });
    setTimeout(() => utterance.onend && utterance.onend(), 1);
  };

  await window.__test.TTS.speak("I'd've gone. We wouldn't've known.", "en-US", 1);

  assert.equal(JSON.stringify(spoken), JSON.stringify([{
    text: "I would have gone. We wouldn't, have known.", lang: "en-US",
  }]));
  window.close();
}

async function dialogImportDropsOpeningBracketSeparatedByHiddenCharacter() {
  const window = createApp();
  const source = "1. Walking 步行\nA: How many minutes does it take to walk there? （\u200B走过去需要几分钟？）\nB: About ten minutes.（大约十分钟。）";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(source)})`);

  assert.equal(parsed[0].lines[0].en, "How many minutes does it take to walk there?");
  assert.equal(parsed[0].lines[0].zh, "走过去需要几分钟？");
  window.close();
}

async function dialogImportDropsUnicodeFormatCharactersAtBilingualBoundary() {
  const window = createApp();
  const source = "1. Restaurant 餐厅\nB: Thank you so much. Could I have the menu first? （\u2060非常感谢。\nA: Here you are.（给您。）";
  const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(source)})`);

  assert.equal(parsed[0].lines[0].en, "Thank you so much. Could I have the menu first?");
  assert.equal(parsed[0].lines[0].zh, "非常感谢。");
  window.close();
}

async function existingUploadedDialogsRepairHiddenCharactersOnLoad() {
  const window = createApp();
  window.__test.Store.saveUploads([{
    id: "old-upload", sceneId: "old-upload-scene", name: "旧资源", icon: "📗", desc: "旧资源",
    topics: [{
      id: "old-upload-topic", name: "步行", dialogs: [{ lines: [
        { who: "A", en: "How many minutes does it take to walk there? （\u200B走过去需要几分钟？", zh: "" },
        { who: "B", en: "About ten minutes.（", zh: "大约十分钟。" },
      ] }],
    }],
  }]);

  window.eval("syncUploadScenes()");
  const lines = window.__test.Store.get().uploads[0].topics[0].dialogs[0].lines;
  assert.equal(lines[0].en, "How many minutes does it take to walk there?");
  assert.equal(lines[0].zh, "走过去需要几分钟？");
  assert.equal(lines[1].en, "About ten minutes.");
  assert.equal(lines[1].zh, "大约十分钟。");
  window.close();
}

async function nextTopicIsAddedToRecentPractice() {
  const window = createApp();
  window.eval("openTopic('travel-airport')");
  window.document.querySelector("#nextT").click();

  assert.equal(JSON.stringify(window.__test.Store.get().recent.map(item => item.topicId)), JSON.stringify(["travel-hotel", "travel-airport"]));
  window.close();
}

async function recentPracticeKeepsEightAndCanBeClearedFromHome() {
  const window = createApp();
  for (let index = 1; index <= 9; index++) window.__test.Store.addRecent(`topic-${index}`, "scene");
  window.eval("renderHome()");

  assert.equal(window.__test.Store.get().recent.length, 8);
  assert.equal(window.__test.Store.get().recent[0].topicId, "topic-9");
  assert.ok(window.document.querySelector("#clearRecentBtn"));
  window.__test.Store.clearRecent();
  assert.equal(window.__test.Store.get().recent.length, 0);
  window.close();
}

async function mobileHistoryBackReturnsToThePreviousAppPage() {
  const window = createApp();
  window.eval("openScene('travel'); openTopic('travel-airport')");
  window.dispatchEvent(new window.PopStateEvent("popstate"));

  assert.match(window.document.querySelector("#view").textContent, /旅行/);
  assert.ok(window.document.querySelectorAll(".topic-card").length > 0);
  window.close();
}

async function customDialogResourceAlwaysAppearsLast() {
  const window = createApp();
  window.__file = { name: "daily-dialogs.txt", text: async () => sampleDocument };
  await window.eval("handleUploadResourceFile(window.__file)");

  const resourceIds = window.eval("allResList().map(resource => resource.id)");
  assert.equal(resourceIds.at(-1), "custom");
  window.close();
}

async function deleteWholeUploadClearsTheResourceAndItsLearningRecords() {
  const window = createApp();
  window.confirm = () => true;
  window.__file = { name: "daily-dialogs.txt", text: async () => sampleDocument };
  await window.eval("handleUploadResourceFile(window.__file)");
  const uploaded = window.__test.Store.get().uploads[0];
  const topicId = uploaded.topics[0].id;
  window.__test.Store.toggleFav(`${topicId}:s0`, { en: "Hello", zh: "你好" });
  window.__test.Store.markMastery(`${topicId}:s0`, "mastered");
  window.__test.Store.setReviewWeak(`${topicId}:s0`);
  window.__test.Store.addRecent(topicId, uploaded.sceneId);
  window.eval(`openResource(${JSON.stringify(uploaded.sceneId)})`);
  assert.ok(window.document.querySelector("#deleteUploadBtn"));
  window.eval(`delUpload(${JSON.stringify(uploaded.sceneId)})`);

  const state = window.__test.Store.get();
  assert.equal(state.uploads.length, 0);
  assert.equal(state.recent.some(item => item.topicId === topicId), false);
  assert.equal(state.favs[`${topicId}:s0`], undefined);
  assert.equal(state.mastery[`${topicId}:s0`], undefined);
  assert.equal(state.review[`${topicId}:s0`], undefined);
  assert.equal(window.document.querySelector("#view").textContent.includes("daily-dialogs"), false);
  window.close();
}

async function family8000DocumentIsAStandaloneCompleteListeningResource() {
  const window = createApp();
  const resource = window.__test.RESOURCES.find(item => item.id === "family-8000");
  const chapterOne = window.__test.SCENES.find(item => item.id === "family-8000-chapter-01");
  const chapterTwo = window.__test.SCENES.find(item => item.id === "family-8000-chapter-02");

  assert.ok(resource);
  assert.equal(resource.name, "美国家庭常用英语 8000 句");
  assert.equal(resource.sceneIds.length, 47);
  assert.equal(resource.folderLabel, "章节");
  assert.equal(chapterOne.name, "第一章 忙碌的早晨");
  assert.equal(chapterTwo.name, "第二章 做家事");
  assert.ok(chapterOne.topics.length > 10);
  assert.ok(chapterOne.topics.every(topic => topic.name.startsWith("01-")));
  assert.ok(chapterTwo.topics.every(topic => topic.name.startsWith("02-")));
  const allTopics = window.__test.SCENES
    .filter(scene => scene.id.startsWith("family-8000-"))
    .flatMap(scene => scene.topics);
  assert.ok(allTopics.length >= 300);
  assert.ok(allTopics.some(topic => topic.name === "46-05 祝贺信 / 教师节"));
  assert.ok(allTopics.every(topic => topic.reading === true && topic.dialogs.length === 0));
  assert.ok(allTopics.flatMap(topic => [topic.name, ...topic.sentences.flatMap(sentence => [sentence.en, sentence.zh])])
    .every(text => !text.includes("\\")));
  assert.ok(allTopics.flatMap(topic => topic.sentences)
    .some(sentence => sentence.en === "Time to wake up!" && sentence.zh === "该起床了！"));
  window.close();
}

async function family8000ResourceShowsChapterFoldersBeforeTopics() {
  const window = createApp();
  window.eval("openResource('family-8000')");

  const viewText = window.document.querySelector("#view").textContent;
  assert.match(viewText, /章节列表/);
  assert.match(viewText, /第一章 忙碌的早晨/);
  assert.match(viewText, /第二章 做家事/);
  assert.equal(viewText.includes("01-01 起床"), false);
  window.close();
}

async function family8000ResourceIsBundledForOfflineAppLoads() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");

  assert.match(html, /src="js\/data_family_8000\.js"/);
  assert.match(serviceWorker, /js\/data_family_8000\.js/);
}

(async () => {
  const cases = [
    ["uploaded document becomes clean titled topics", uploadedDocumentBecomesCleanTitledTopics],
    ["uploaded resource opens topic list directly", uploadedResourceOpensTopicListDirectly],
    ["improvised pool adds only the separate online catalog", improvisedPoolAddsOnlyTheSeparateOnlineCatalog],
    ["home explains the expanded improvised practice pool", homeExplainsTheExpandedImprovisedPracticePool],
    ["local answer quality rewards relevant complete responses", localAnswerQualityRewardsRelevantCompleteResponses],
    ["free dialog session score uses text only", freeDialogSessionScoreUsesTextOnly],
    ["free dialog ASR uses browser microphone mode and waits for final transcript", freeDialogAsrUsesBrowserMicrophoneModeAndWaitsForFinalTranscript],
    ["free dialog ASR uses one browser start and reports recognition errors", freeDialogAsrUsesOneBrowserStartAndReportsRecognitionErrors],
    ["free dialog ASR uses interim text when no final result arrives", freeDialogAsrUsesInterimTextWhenNoFinalResultArrives],
    ["free dialog renders the final spoken text in the learner bubble", freeDialogRendersTheFinalSpokenTextInTheLearnerBubble],
    ["free dialog summary explains text only scoring", freeDialogSummaryExplainsTextOnlyScoring],
    ["Chinese typed free answer uses English translation for the answer", chineseTypedFreeAnswerUsesEnglishTranslationForTheAnswer],
    ["failed Chinese typed free answer does not advance the turn", failedChineseTypedFreeAnswerDoesNotAdvanceTheTurn],
    ["adaptive partner acknowledges time and uses the next turn direction", adaptivePartnerAcknowledgesTimeAndUsesNextTurnDirection],
    ["adaptive partner asks for more after an overly short answer", adaptivePartnerAsksForMoreAfterAnOverlyShortAnswer],
    ["free dialog replaces only the next partner line for a valid answer", freeDialogReplacesOnlyTheNextPartnerLineForAValidAnswer],
    ["Chinese typed free answer renders English and original Chinese", chineseTypedFreeAnswerRendersEnglishAndOriginalChinese],
    ["empty English typed free answer prompts for English before submitting", emptyEnglishTypedFreeAnswerPromptsForEnglishBeforeSubmitting],
    ["free run provides separate continue and retry actions", freeRunProvidesSeparateContinueAndRetryActions],
    ["skipped free answer keeps the original following partner line", skippedFreeAnswerKeepsTheOriginalFollowingPartnerLine],
    ["upload parser removes escapes but preserves spaced contractions", uploadParserRemovesEscapesButPreservesSpacedContractions],
    ["dialog resource separates inline Chinese from English", dialogResourceSeparatesInlineChineseFromEnglish],
    ["dialog resource uses each chapter heading as its own topic", dialogResourceUsesEachChapterHeadingAsItsOwnTopic],
    ["unlabelled dialog resource still splits by chapter heading", unlabelledDialogResourceStillSplitsByChapterHeading],
    ["pdf import keeps text items on their visual rows", pdfImportKeepsTextItemsOnTheirVisualRows],
    ["pdf import reads every page instead of stopping at thirty", pdfImportReadsEveryPageInsteadOfStoppingAtThirty],
    ["chinese chapter headings become topics and numbered bilingual rows stay lines", chineseChapterHeadingsBecomeTopicsAndNumberedBilingualRowsStayLines],
    ["dialog import removes pdf control characters but keeps spaced contractions", dialogImportRemovesPdfControlCharactersButKeepsSpacedContractions],
    ["dialog import repairs wrapped translation parenthesis", dialogImportRepairsWrappedTranslationParenthesis],
    ["dialog import normalizes fullwidth apostrophes", dialogImportNormalizesFullwidthApostrophes],
    ["tts reads fullwidth contraction as one english run", ttsReadsFullwidthContractionAsOneEnglishRun],
    ["tts normalizes spaced contractions before speaking", ttsNormalizesSpacedContractionsBeforeSpeaking],
    ["tts reads masked phone numbers digit by digit", ttsReadsMaskedPhoneNumbersDigitByDigit],
    ["tts normalizes common contraction forms", ttsNormalizesCommonContractionForms],
    ["tts expands auxiliaries so contracted suffixes cannot disappear", ttsExpandsAuxiliariesSoContractedSuffixesCannotDisappear],
    ["tts resolves ambiguous s and d contractions from context", ttsResolvesAmbiguousSAndDContractionsFromContext],
    ["tts handles compound contractions without dropping auxiliaries", ttsHandlesCompoundContractionsWithoutDroppingAuxiliaries],
    ["dialog import drops opening bracket separated by hidden character", dialogImportDropsOpeningBracketSeparatedByHiddenCharacter],
    ["dialog import drops unicode format characters at bilingual boundary", dialogImportDropsUnicodeFormatCharactersAtBilingualBoundary],
    ["existing uploaded dialogs repair hidden characters on load", existingUploadedDialogsRepairHiddenCharactersOnLoad],
    ["next topic is added to recent practice", nextTopicIsAddedToRecentPractice],
    ["recent practice keeps eight and can be cleared from home", recentPracticeKeepsEightAndCanBeClearedFromHome],
    ["mobile history back returns to the previous app page", mobileHistoryBackReturnsToThePreviousAppPage],
    ["custom dialog resource always appears last", customDialogResourceAlwaysAppearsLast],
    ["delete whole upload clears the resource and its learning records", deleteWholeUploadClearsTheResourceAndItsLearningRecords],
    ["family 8000 document is a standalone complete listening resource", family8000DocumentIsAStandaloneCompleteListeningResource],
    ["family 8000 resource shows chapter folders before topics", family8000ResourceShowsChapterFoldersBeforeTopics],
    ["family 8000 resource is bundled for offline app loads", family8000ResourceIsBundledForOfflineAppLoads],
  ];
  const failures = [];
  for (const [name, run] of cases) {
    try {
      await run();
      console.log("PASS", name);
    } catch (error) {
      failures.push(name);
      console.error("FAIL", name, "\n", error.message);
    }
  }
  process.exit(failures.length ? 1 : 0);
})();
