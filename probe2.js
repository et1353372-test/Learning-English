// 诊断：音标数据源可达性与耗时
const timed = async (name, url, ms = 8000) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: ac.signal });
    const txt = r.ok ? (await r.text()).slice(0, 60) : "";
    console.log(name, r.status, (Date.now() - t0) + "ms", JSON.stringify(txt));
  } catch (e) {
    console.log(name, "FAIL", (Date.now() - t0) + "ms", e.message);
  } finally { clearTimeout(t); }
};
(async () => {
  const w = "Good";
  await timed("dictapi直连", `https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
  await timed("allorigins代理", `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`)}`);
  await timed("mymemory中文", `https://api.mymemory.translated.net/get?q=${w}&langpair=en|zh-CN`);
  await timed("ipa-dict@main", `https://cdn.jsdelivr.net/gh/open-dict-data/ipa-dict@main/data/en_US.txt`);
  await timed("cmudict@0.0.2", `https://cdn.jsdelivr.net/npm/cmudict@0.0.2/cmudict.dict`);
  await timed("cmudict@latest", `https://cdn.jsdelivr.net/npm/cmudict@latest/cmudict.dict`);
  process.exit(0);
})();
