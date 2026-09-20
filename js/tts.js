/* ============ TTS 三种音频切换控制器 ============
   音频版本：en（英文原声）/ zh（中文译文）/ mix（中英对照交替）
   Chrome 无声修复：
   a) cancel() 之后立刻 speak 会产生 race → 静音丢弃，改为 cancel 后延时 140ms
   b) voices 未就绪（Chrome 偶发空列表）时 speak 内自动重建 voices
   c) 12s 无 end 事件超时兜底推进 */
const TTS = (() => {
  let voices = [];
  let stopped = true; // true=要求停止

  function refresh() { if ("speechSynthesis" in window) { voices = speechSynthesis.getVoices(); } }
  if ("speechSynthesis" in window) {
    refresh();
    try { speechSynthesis.onvoiceschanged = refresh; } catch (e) { }
  }
  function getVoicesReady() { if (!voices.length) refresh(); return voices; }

  function pickVoice(langPrefer) {
    if (!getVoicesReady().length) return null;
    const need = langPrefer.startsWith("zh") ? "zh" : "en";
    const all = voices.filter(v => v.lang.toLowerCase().startsWith(need));
    if (!all.length) return null;
    const prefer = (Store.get().settings.accent || "US") === "UK" ? "gb" : "us";
    // Chrome 若命中谷歌云端音库（需访问谷歌服务器），在部分网络环境下会静音；
    // 优先使用 Windows 本地音库（localService = true）
    const accentLocal = all.find(v => v.localService && v.lang.toLowerCase().includes(prefer));
    const anyLocal = all.find(v => v.localService);
    const accentRemote = all.find(v => v.lang.toLowerCase().includes(prefer));
    const chosen = accentLocal || anyLocal || accentRemote;
    // 完全没有本地音库（Chrome 只有谷歌云端语音）时给出一次性提示
    if (!anyLocal && !pickVoice._warned) {
      pickVoice._warned = true;
      setTimeout(() => toast("提示：浏览器当前只有云端语音（可能被网络拦截导致无声），建议在系统设置里安装英文语音包更稳定"), 800);
    }
    return chosen;
  }

  function normalizeSpeechText(text) {
    const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const sContractionHosts = new Set(["he", "she", "it", "that", "this", "there", "here", "what", "who", "where", "when", "why", "how", "let"]);
    const pastParticiples = new Set([
      "been", "become", "begun", "bought", "brought", "built", "caught", "come", "cut", "done", "drunk", "driven",
      "eaten", "fallen", "felt", "found", "given", "gone", "grown", "heard", "held", "kept", "known", "left", "lost",
      "made", "met", "paid", "put", "read", "run", "said", "seen", "sent", "shown", "slept", "spoken", "spent",
      "stood", "taken", "taught", "thought", "told", "understood", "won", "worn", "written",
    ]);
    const followingWord = (source, offset) => {
      const match = source.slice(offset).match(/^\s+(?:(?:already|just|never|ever|recently|always|finally|still)\s+)*([A-Za-z]+)/i);
      return match ? match[1].toLowerCase() : "";
    };
    const followsPastParticiple = (source, offset) => {
      const word = followingWord(source, offset);
      return word === "better" || pastParticiples.has(word) || /ed$/.test(word);
    };
    const canonical = String(text || "")
      .replace(/&(?:apos|#39|#x27|rsquo|lsquo);/gi, "'")
      .replace(/[\u0060\u00B4\u02BB\u02BC\u2018\u2019\u201B\u2032\uFF07]/g, "'")
      .replace(/[\u00A0\u2007\u202F\u200B-\u200D\uFEFF]/g, " ")
      // 只整理单词内部的撇号，保留 Don't / that's / I've 等自然缩略形式。
      .replace(/([A-Za-z])\s*'\s*(?=[A-Za-z])/g, "$1'");
    return canonical
      // 页面保留缩略形式；朗读副本展开助动词，避免不同设备吞掉 /l/、/v/ 等尾音。
      .replace(/\b([A-Za-z]+)'ll\b/gi, "$1 will")
      .replace(/\b([A-Za-z]+)'ve\b/gi, "$1 have")
      .replace(/\b([A-Za-z]+)'re\b/gi, "$1 are")
      .replace(/\b([A-Za-z]+)'m\b/gi, "$1 am")
      .replace(/\blet's\b/gi, word => /^[A-Z]/.test(word) ? "Let us" : "let us")
      .replace(/\b([A-Za-z]+)'d\b/gi, (full, subject, offset, source) => {
        return `${subject} ${followsPastParticiple(source, offset + full.length) ? "had" : "would"}`;
      })
      .replace(/\b([A-Za-z]+)'s\b/gi, (full, subject, offset, source) => {
        if (!sContractionHosts.has(subject.toLowerCase())) return full;
        return `${subject} ${followsPastParticiple(source, offset + full.length) ? "has" : "is"}`;
      })
      // 否定缩略语按自然形式朗读，不展开成 do not / cannot。
      .replace(/\b([A-Za-z]+n't)\b(?=\s+[A-Za-z])/gi, "$1,")
      // 七位及以上、可能带 X 的号码按位朗读，避免被语音引擎当成一个大数。
      .replace(/\b[0-9Xx]{7,}\b/g, number => number.split("").map(char => {
        return /\d/.test(char) ? digits[Number(char)] : "X";
      }).join(" "));
  }

  function speak(text, lang, rate) {
    return new Promise(resolve => {
      if (!("speechSynthesis" in window)) return resolve();
      if (stopped || !text) return resolve();
      text = normalizeSpeechText(text);
      // 语言混合切分：数字 10 / 语气词 嗯 之类，交给各自语言的音库读，避免中文音库读出"十"、英文音库把"嗯"拼成字母
      const runs = [];
      let curRun = null;
      const classify = ch => /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff01-\uff5e]/.test(ch) ? "zh" : "en";
      for (const ch of text) {
        const cls = classify(ch);
        if (!curRun || curRun.cls !== cls) { curRun = { cls: cls, text: "" }; runs.push(curRun); }
        curRun.text += ch;
      }
      (async () => {
        for (const run of runs) {
          if (stopped) break;
          const t = run.text.replace(/^\s+|\s+$/g, "");
          if (!t) continue;
          await speakRun(t, run.cls === "zh" ? "zh-CN" : lang.startsWith("zh") ? "zh-CN" : "en-US", rate);
          if (stopped) break;
        }
        resolve();
      })();
      function speakRun(txt, runLang, rt) {
        return new Promise(resolve => {
          if (stopped || !txt) return resolve();
          const u = new SpeechSynthesisUtterance(txt);
          const v = pickVoice(runLang);
          if (v) u.voice = v;
          u.lang = v ? v.lang : runLang;
          u.rate = rt || Store.get().settings.speed || 1;
          let done = false;
          const fin = () => { if (!done) { done = true; resolve(); } };
          u.onend = fin;
          u.onerror = () => { speechSynthesis.cancel(); fin(); };
          speechSynthesis.speak(u);
          setTimeout(fin, 12000); // 兜底：设备引擎不触发 onend 时继续
        });
      }
    });
  }

  function stop() {
    stopped = true;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  /* 播放一组台词的指定版本（每段音频相互独立，不混播）
     version: 'en' | 'zh' | 'mix'   onLine(i) 每句开始回调，用于高亮 */
  async function playMaterial(lines, version, rate, onLine) {
    stopped = false;
    speechSynthesis.cancel(); // 清掉上一段
    await new Promise(r => setTimeout(r, 120)); // Chrome cancel→speak race 规避
    for (let i = 0; i < lines.length; i++) {
      if (stopped) break;
      onLine && onLine(i);
      const line = lines[i];
      if (version === "zh") await speak(line.zh, "zh-CN", rate);
      else await speak(line.en, "en-US", rate);
      if (stopped) break;
      if (version === "mix") await speak(line.zh, "zh-CN", rate);
    }
    if (!stopped) onLine && onLine(-1);
  }

  const api = {
    // 浏览器自动触发换语时可能没带手势；这里统一入口自动按需 resume voices
    speak: async (text, lang, rate) => {
      stopped = false;
      await new Promise(r => setTimeout(r, 60));
      if (window.speechSynthesis && speechSynthesis.paused) speechSynthesis.resume();
      await speak(text, lang, rate);
    },
    speakRaw: speak,
    stop, refresh, playMaterial,
    available: "speechSynthesis" in window,
  };  Object.defineProperty(api, "cancelled", {
    set(v) { stopped = v; if (v) { if ("speechSynthesis" in window) speechSynthesis.cancel(); } },
    get() { return stopped; },
  });
  return api;
})();
