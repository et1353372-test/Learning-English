// 探测 CMU 词典（ARPAbet→IPA 可转美音）+ 复查 wordset 是否含音标字段
(async () => {
  const tries = [
    ["cmu@master", "https://cdn.jsdelivr.net/gh/cmusphinx/cmudict@master/cmudict.dict"],
    ["cmu@next", "https://cdn.jsdelivr.net/gh/cmusphinx/cmudict@next/cmudict.dict"],
    ["cmu-gh-pages", "https://cdn.jsdelivr.net/gh/cmusphinx/cmudict@gh-pages/cmudict.dict"],
  ];
  for (const [name, url] of tries) {
    try {
      const r = await fetch(url);
      if (!r.ok) { console.log(name, r.status); continue; }
      const txt = await r.text();
      const line = txt.split("\n").find(l => l.startsWith("GOOD "));
      console.log(name, r.status, "bytes:", txt.length, "| GOOD line:", JSON.stringify(line));
    } catch (e) { console.log(name, "FAIL", e.message); }
  }
  // 复查 wordset：是否有任何词条带音标字段
  const r2 = await fetch("https://cdn.jsdelivr.net/npm/wordset-dictionary@1.0.0/data/g.json");
  const data = await r2.json();
  const keys = new Set();
  Object.values(data).slice(0, 50).forEach(e => Object.keys(e).forEach(k => keys.add(k)));
  console.log("wordset entry fields:", [...keys]);
  process.exit(0);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
