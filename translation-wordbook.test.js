const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = __dirname;
const source = ["js/data.js", "js/data_pdf.js", "js/data_more_dialogs.js", "js/store.js", "js/tts.js", "js/recorder.js", "js/app.js"]
  .map(file => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n;\n");

function createApp(fetchImpl) {
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
  window.fetch = fetchImpl;
  window.eval(source + "\n;\nwindow.__test = { Store };");
  return window;
}

const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const response = json => ({ json: async () => json });
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

async function sentenceTranslationFallsBackToChineseOnly() {
  const window = createApp(async url => {
    if (url.includes("mymemory.translated.net")) {
      return response({ responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY." } });
    }
    if (url.includes("translate.googleapis.com")) {
      return response([[["我们需要什么？"]]]);
    }
    throw new Error("Unexpected URL: " + url);
  });
  const { document } = window;
  window.eval("openTopic('d25')");
  window.getSelection = () => ({ toString: () => "what do we need", removeAllRanges() {} });
  document.dispatchEvent(new window.Event("selectionchange"));
  await wait(75);
  document.querySelector("#pbTrans").click();
  await wait();

  assert.equal(document.querySelector("#pbDef").textContent, "释义：我们需要什么？");
}

async function wordbookEntryReceivesLateTranslationAndPhonetics() {
  const zh = deferred();
  const dictionary = deferred();
  const window = createApp(url => {
    if (url.includes("mymemory.translated.net")) return zh.promise;
    if (url.includes("dictionaryapi.dev")) return dictionary.promise;
    throw new Error("Unexpected URL: " + url);
  });
  const { document } = window;
  window.eval("showWordPop('ingredients', findTopic('d25').topic)");
  document.querySelector("#wpAdd").click();

  zh.resolve(response({ responseData: { translatedText: "食材" } }));
  dictionary.resolve(response([{
    phonetics: [
      { text: "/ɪnˈɡriːdiənts/", audio: "https://audio.example/en-gb.mp3" },
      { text: "/ɪnˈɡriːdiənts/", audio: "https://audio.example/en-us.mp3" },
    ],
    meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "items used in cooking" }] }],
  }]));
  await wait();
  await wait();

  const saved = window.__test.Store.get().wordbook.ingredients;
  assert.equal(saved.zh, "食材");
  assert.equal(saved.phonUk, "/ɪnˈɡriːdiənts/");
  assert.equal(saved.phonUs, "/ɪnˈɡriːdiənts/");
  window.eval("renderWordbook()");
  assert.match(document.querySelector("#view").textContent, /食材/);
  assert.match(document.querySelector("#view").textContent, /英.*ɪnˈɡriːdiənts/);
}

(async () => {
  const cases = [
    ["sentence translation falls back to Chinese only", sentenceTranslationFallsBackToChineseOnly],
    ["wordbook entry receives late translation and phonetics", wordbookEntryReceivesLateTranslationAndPhonetics],
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
