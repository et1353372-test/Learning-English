(async () => {
  const r = await fetch("https://cdn.jsdelivr.net/gh/cmusphinx/cmudict@master/cmudict.dict");
  const txt = await r.text();
  const lines = txt.split("\n");
  console.log("total lines:", lines.length);
  console.log("first 8 lines:", JSON.stringify(lines.slice(0, 8)));
  const good = lines.filter(l => /^good/i.test(l)).slice(0, 5);
  console.log("good lines:", JSON.stringify(good));
  const exc = lines.filter(l => /^excuse/i.test(l)).slice(0, 5);
  console.log("excuse lines:", JSON.stringify(exc));
  process.exit(0);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
