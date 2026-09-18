// 探测 jsdelivr 数据包文件树 + 候选音标源
const timed = async (name, url, ms = 10000) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: ac.signal });
    const txt = r.ok ? (await r.text()) : "";
    console.log(name, r.status, (Date.now() - t0) + "ms", txt.slice(0, 300).replace(/\n/g, " "));
  } catch (e) { console.log(name, "FAIL", (Date.now() - t0) + "ms", e.message); }
  finally { clearTimeout(t); }
};
(async () => {
  // jsdelivr Data API：列出包内文件树
  await timed("wordset文件树", "https://data.jsdelivr.com/v1/package/npm/wordset-dictionary@1.0.0/flat");
  await timed("cmudict-npm文件树", "https://data.jsdelivr.com/v1/package/npm/cmudict@0.0.2/flat");
  await timed("ipa-dict-gh文件树", "https://data.jsdelivr.com/v1/package/gh/open-dict-data/ipa-dict@master/flat");
  process.exit(0);
})();
