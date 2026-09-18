const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
(async () => {
  const dom = new JSDOM(fs.readFileSync("index.html", "utf8"), { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.speechSynthesis = { getVoices: () => [{ lang: "en-US", localService: true }, { lang: "en-GB", localService: true }], speak: u => setTimeout(() => u.onend && u.onend(), 3), cancel: () => {}, onvoiceschanged: null };
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  w.navigator.mediaDevices = { getUserMedia: async () => { throw 0; } };
  w.Audio = function () { return { play() {}, pause() {} }; };
  w.fetch = (...a) => fetch(...a); // 真实网络
  const all = ["js/data.js", "js/data_pdf.js", "js/data_more_dialogs.js", "js/store.js", "js/tts.js", "js/recorder.js", "js/app.js"]
    .map(f => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n;\n");
  w.eval(all + "\n;\nwindow.__t=1;");
  const d = w.document;
  w.eval("openTopic('travel-airport')");
  d.querySelector(".line-item .w").click();
  await new Promise(r => setTimeout(r, 9000));
  console.log("phon row:", d.querySelector("#wpPhon").textContent.replace(/\s+/g, " "));
  console.log("def row:", d.querySelector("#wpDef").textContent);
  console.log("cache:", w.localStorage.getItem("phonCache"));
  process.exit(0);
})().catch(e => { console.error("MAIN", e); process.exit(1); });
