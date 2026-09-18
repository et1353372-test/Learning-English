// 验证 wordset-dictionary 的词条结构（是否含 IPA 音标）
(async () => {
  const r = await fetch("https://cdn.jsdelivr.net/npm/wordset-dictionary@1.0.0/data/g.json");
  console.log("g.json", r.status, "size~", r.headers.get("content-length"));
  const t0 = Date.now();
  const data = await r.json();
  console.log("parse ok", (Date.now() - t0) + "ms", "type:", Array.isArray(data) ? "array" : typeof data);
  if (Array.isArray(data)) {
    console.log("len:", data.length, "sample keys:", Object.keys(data[0] || {}));
    const good = data.find(x => (x.word || x.name || "").toLowerCase() === "good");
    console.log("good entry:", JSON.stringify(good).slice(0, 400));
  } else {
    console.log("top keys:", Object.keys(data).slice(0, 10));
    const g = data["good"] || data["Good"];
    console.log("good entry:", JSON.stringify(g).slice(0, 400));
  }
  process.exit(0);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
