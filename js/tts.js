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

  function speak(text, lang, rate) {
    return new Promise(resolve => {
      if (!("speechSynthesis" in window)) return resolve();
      if (stopped || !text) return resolve();
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
