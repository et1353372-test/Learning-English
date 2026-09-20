/* ============ 录音工具 ============ */
const Recorder = (() => {
  let stream = null, media = null, chunks = [], url = null;
  async function start() {
    if (url) { URL.revokeObjectURL(url); url = null; }
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    media = new MediaRecorder(stream);
    chunks = [];
    media.ondataavailable = e => chunks.push(e.data);
    media.start();
  }
  function stop() {
    return new Promise(resolve => {
      media.onstop = () => {
        const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
        url = URL.createObjectURL(blob);
        const sec = Math.round((Date.now() - (media._t0 || Date.now())) / 1000);
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        resolve({ url, blob, seconds: sec });
      };
      if (media.state !== "inactive") media.stop(); else media.onstop();
    });
  }
  return { start, stop, get url() { return url; } };
})();
