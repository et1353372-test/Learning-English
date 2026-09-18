/* ============ 本地状态存储 ============ */
const Store = (() => {
  const KEY = "oral_app_v1";
  const defaults = {
    settings: { speed: 1, accent: "US", saveRecordings: true, playOrder: "en-zh" },
    stats: { totalSeconds: 0, dialogCount: 0, startedAt: Date.now() },
    mastery: {},      // { "topicId:rowId": "mastered"|"weak" }
    favs: {},         // { "topicId:rowId": {en, zh, topicName, sceneId} }
    recent: [],       // [{type:'topic'|'fav', topicId, sceneId, ts}]
    review: {},       // { "topicId:rowId": {level:, nextTs:} }  简易艾宾浩斯
    wordbook: {},     // { word: {zh, phonetic, def, topicName, ts} }
    customTopics: [], // [{...topic}] 用户自建语料
    readings: [],     // [{...topic, reading:true}] 上传的英语阅读
    uploads: [],      // [{id, name, icon, desc, sceneId, topics, ts}] 上传解析出的资源模块
    checkins: {},     // { "2026/9/11": ts }
    uploads: [],      // [{id, name, icon, desc, sceneId, ts}] 上传解析出的资源模块
    lastPractice: null, // 记录今日打卡
  };
  let state = load();
  function load() {
    try {
      return Object.assign(JSON.parse(JSON.stringify(defaults)), JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) { return JSON.parse(JSON.stringify(defaults)); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function get() { return state; }
  return {
    get, save,
    markMastery(itemId, status) {
      if (status) state.mastery[itemId] = status; else delete state.mastery[itemId];
      save();
    },
    toggleFav(itemId, info) {
      if (state.favs[itemId]) { delete state.favs[itemId]; save(); return false; }
      state.favs[itemId] = Object.assign({ ts: Date.now() }, info); save(); return true;
    },
    addRecent(topicId, sceneId) {
      state.recent = state.recent.filter(r => r.topicId !== topicId);
      state.recent.unshift({ topicId, sceneId, ts: Date.now() });
      state.recent = state.recent.slice(0, 8);
      save();
    },
    addLearnSeconds(sec) {
      state.stats.totalSeconds += sec;
      state.lastPractice = new Date().toDateString();
      const key = new Date().toLocaleDateString();
      if (!state.checkins) state.checkins = {};
      if (!state.checkins[key]) state.checkins[key] = Date.now();
      save();
    },
    addDialogDone() { state.stats.dialogCount++; save(); },
    markReview(itemId) {
      // 艾宾浩斯简易：level 0~5，间隔 1天/2天/4天/7天/15天
      const cur = state.review[itemId] || { level: 0 };
      const gaps = [1, 2, 4, 7, 15];
      cur.nextTs = Date.now() + gaps[Math.min(cur.level, 4)] * 864e5;
      cur.level = cur.level + 1;
      state.review[itemId] = cur;
      if (cur.level >= 5) { // 毕业 → 已掌握
        state.mastery[itemId] = "mastered";
        delete state.review[itemId];
      }
      save();
    },
    setReviewWeak(itemId) {
      state.review[itemId] = { level: 0, nextTs: Date.now() + 432e5 };
      state.mastery[itemId] = "weak";
      save();
    },
    addWord(word, info) {
      state.wordbook[word] = Object.assign({ ts: Date.now() }, info); save(); return true;
    },
    updateWord(word, info) {
      if (!state.wordbook[word]) return false;
      state.wordbook[word] = Object.assign({}, state.wordbook[word], info); save(); return true;
    },
    removeWord(word) {
      delete state.wordbook[word]; save();
      return false;
    },
    saveCustomTopics(arr) {
      state.customTopics = arr; save();
    },
    saveReadings(arr) {
      state.readings = arr; save();
    },
    saveUploads(arr) {
      state.uploads = arr; save();
    },
    reset() { state = JSON.parse(JSON.stringify(defaults)); save(); },
  };
})();

function findTopic(topicId) {
  for (const s of SCENES) for (const t of s.topics) if (t.id === topicId) return { scene: s, topic: t };
  return null;
}
