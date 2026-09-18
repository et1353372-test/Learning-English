/* Service Worker：网络优先 → 永远先用最新版；断网时用缓存兜底（地铁无网也能练）
   v3：新增 jsdelivr 大文件（CMU 音标库）缓存——首次下载 3.6MB，之后永久秒开 */
const CACHE = "oral-app-v7";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./icon.svg",
  "./css/style.css",
  "./js/data.js", "./js/data_pdf.js", "./js/data_more_dialogs.js", "./js/data_family_8000.js", "./js/store.js", "./js/tts.js", "./js/recorder.js", "./js/app.js",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // jsdelivr CDN 大文件（音标库等）：缓存优先，命中不再下载
  if (/^https:\/\/cdn\.jsdelivr\.net\//.test(e.request.url)) {
    e.respondWith((async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => { });
      return res;
    })());
    return;
  }
  if (!e.request.url.startsWith(self.location.origin)) return; // 其它外部词典接口不劫持
  e.respondWith((async () => {
    try {
      // 有网 → 拿最新版 + 更新缓存（保证发布新版后用户立刻可用）
      const res = await fetch(e.request, { cache: "no-cache" });
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => { });
      return res;
    } catch (err) {
      // 断网 → 回退缓存
      const hit = await caches.match(e.request);
      return hit || caches.match("./index.html");
    }
  })());
});
