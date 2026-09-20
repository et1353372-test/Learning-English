# Improvised Chinese Input and Local Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners enter Chinese in an improvised-dialogue typed turn and receive an English translation, then make each following partner turn locally adapt to the learner’s valid English answer.

**Architecture:** Add small pure helpers in `js/app.js` to classify a typed answer, call the existing Chinese-to-English translator, validate the resulting English, and create a non-mutating adaptive copy of the next partner line. The existing free-run renderer uses those helpers for typed and transcribed answers while preserving the source scenario and its next learner-direction metadata.

**Tech Stack:** Vanilla JavaScript, browser Fetch API, browser Web Speech API, JSDOM and Node `assert` tests.

**Spec:** `docs/superpowers/specs/2026-09-21-improvised-chinese-input-and-adaptation-design.md`

## Global Constraints

- Only change this local workspace; do not commit, push, publish, or update GitHub.
- Keep static deployment: no backend, secret, account, paid API, or generative AI service.
- Reuse the existing Chinese-to-English translation capability; never invent a translation when it fails.
- Keep source scenario objects, imported resources, custom resources, recorded-audio playback, hints, demo playback and text-only scoring intact.
- A generated partner line must be per-run only and must not mutate `sc.lines`.
- This workspace is not a Git repository; do not create commits or Git worktrees.

## Review Focus

- Mixed Chinese/English input must be treated as Chinese input and may advance only after a usable English translation is returned.
- Translation failure must leave the learner in the same turn with their text intact, rather than adding a blank or zero-score answer.
- A valid short answer must lead to a clarification prompt; it must not claim a detail that was never said.
- A valid time answer must alter the next partner line and keep the next B turn’s time-oriented exercise goal intact.
- A skipped or untranscribed answer must preserve the original following A line and never mutate a scenario used by a later run.

---

### Task 1: Typed-answer normalization and Chinese translation recovery

**Files:**
- Modify: `js/app.js:1139-1205,1960-1985`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: `resolveFreeTypedAnswer(rawText)` and the existing `mtTranslate(text)` network translator.
- Produces: `Promise<{english: string, zh: string|null, translated: boolean, error: string}>`, where a Chinese source is usable only when `english` has no CJK characters.

- [ ] **Step 1: Write a failing Chinese-input normalization test**

```javascript
async function chineseTypedFreeAnswerUsesEnglishTranslationForTheAnswer() {
  const window = createApp();
  window.fetch = async () => ({ json: async () => ({
    responseData: { translatedText: "I will arrive tomorrow afternoon." }, matches: [],
  }) });
  const answer = await window.eval("resolveFreeTypedAnswer('我明天下午到。')");
  assert.deepEqual(JSON.parse(JSON.stringify(answer)), {
    english: "I will arrive tomorrow afternoon.", zh: "我明天下午到。", translated: true, error: "",
  });
  window.close();
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL with `resolveFreeTypedAnswer is not defined`.

- [ ] **Step 3: Implement the minimal typed-answer helper and UI usage**

```javascript
async function resolveFreeTypedAnswer(rawText) {
  const source = (rawText || "").trim();
  if (!/[\u3400-\u9fff]/.test(source)) return { english: source, zh: null, translated: false, error: "" };
  const english = await mtTranslate(source);
  if (!english || /[\u3400-\u9fff]/.test(english)) return { english: "", zh: source, translated: true, error: "translation-unavailable" };
  return { english, zh: source, translated: true, error: "" };
}
```

Change the typed form copy and placeholder to accept Chinese or English. On a successful Chinese translation, display `english` as the bubble’s English text and `zh` as its Chinese text, then evaluate `english`. On a translation failure, retain the input and current turn, restore the button, and show the specified retry message.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: the new Chinese-input test passes with all existing tests.

- [ ] **Step 5: Add and run the translation-failure interaction test**

```javascript
async function failedChineseTypedFreeAnswerDoesNotAdvanceTheTurn() {
  const window = createApp();
  window.fetch = async () => { throw new Error("offline"); };
  window.eval("renderFreeRun({ id:'typed-fail', name:'测试', icon:'🎯', intro:'', lines:[{who:'A',en:'When will you arrive?',zh:'你什么时候到？'},{who:'B',dir:'说明时间',sugs:[{en:'Tomorrow afternoon.',zh:'明天下午。'}]},{who:'A',en:'Thanks.',zh:'谢谢。'}] })");
  await new Promise(resolve => setTimeout(resolve, 20));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeIn").value = "我明天下午到。";
  window.document.querySelector("#typeGo").click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(window.document.querySelector("#typeIn").value, "我明天下午到。");
  assert.match(window.document.querySelector("#hintBox").textContent, /暂时无法把中文译成英文/);
  assert.equal(window.document.querySelectorAll("#stage .bubble").length, 1);
  window.close();
}
```

Run: `node dialog-library-import.test.js`

Expected: the new failure-recovery test passes and the existing typed-turn behavior remains green.

### Task 2: Pure local adaptive-partner builder

**Files:**
- Modify: `js/app.js:1040-1138`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: `buildAdaptivePartnerLine(answer, prompt, originalLine, nextLearnerLine)`.
- Produces: `{ who: "A", en: string, zh: string, adaptive: true }` without changing either supplied line.

- [ ] **Step 1: Write failing adaptive-line behavior tests**

```javascript
async function adaptivePartnerAcknowledgesTimeAndUsesNextTurnDirection() {
  const window = createApp();
  const result = window.eval(`buildAdaptivePartnerLine(
    "I will arrive tomorrow afternoon.", "When will you arrive?",
    { who:"A", en:"Do you need a hotel?", zh:"你需要酒店吗？" },
    { who:"B", dir:"确认时间安排", sugs:[] }
  )`);
  assert.match(result.en, /Tomorrow afternoon/);
  assert.match(result.en, /time.*work best|time.*suit/i);
  assert.notEqual(result.en, "Do you need a hotel?");
  window.close();
}

async function adaptivePartnerAsksForMoreAfterAnOverlyShortAnswer() {
  const window = createApp();
  const result = window.eval(`buildAdaptivePartnerLine(
    "Maybe.", "When will you arrive?",
    { who:"A", en:"Do you need a hotel?", zh:"你需要酒店吗？" },
    { who:"B", dir:"确认时间安排", sugs:[] }
  )`);
  assert.match(result.en, /tell me a little more/i);
  window.close();
}
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node dialog-library-import.test.js`

Expected: FAIL with `buildAdaptivePartnerLine is not defined`.

- [ ] **Step 3: Implement the minimal rule-based builder**

Implement narrow helpers to normalize tokens, detect a meaningful time phrase, select an acknowledgement (time, location, preference, confirmation, refusal, reason, action, or generic), and select an English/Chinese follow-up from `nextLearnerLine.dir`. If answer quality is incomplete, select the clarification pair instead. The builder must return a new object and leave `originalLine` unchanged.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `node dialog-library-import.test.js`

Expected: both adaptive behavior tests pass with all existing tests.

### Task 3: Insert the adaptive partner line into a free-run only

**Files:**
- Modify: `js/app.js:1139-1229`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: a valid answer string, the prior partner prompt, `buildAdaptivePartnerLine`, and the following two source lines.
- Produces: the generated A line at the next run step, while `sc.lines` remains unchanged.

- [ ] **Step 1: Write a failing rendered-flow test**

```javascript
async function freeDialogReplacesOnlyTheNextPartnerLineForAValidAnswer() {
  const window = createApp();
  window.eval("renderFreeRun({ id:'adaptive', name:'测试', icon:'🎯', intro:'', lines:[{who:'A',en:'When will you arrive?',zh:'你什么时候到？'},{who:'B',dir:'说明到达时间',sugs:[{en:'I will arrive tomorrow afternoon.',zh:'我明天下午到。'}]},{who:'A',en:'Do you need a hotel?',zh:'你需要订酒店吗？'},{who:'B',dir:'确认时间安排',sugs:[{en:'Tomorrow afternoon works for me.',zh:'明天下午可以。'}]}] })");
  await new Promise(resolve => setTimeout(resolve, 20));
  window.document.querySelector("#turnType").click();
  window.document.querySelector("#typeIn").value = "I will arrive tomorrow afternoon.";
  window.document.querySelector("#typeGo").click();
  await new Promise(resolve => setTimeout(resolve, 30));
  const bubbles = [...window.document.querySelectorAll("#stage .bubble")].map(node => node.textContent);
  assert.ok(bubbles.some(text => /Tomorrow afternoon/.test(text)));
  assert.equal(bubbles.some(text => text.includes("Do you need a hotel?")), false);
  assert.equal(window.eval("sc.lines[2].en"), "Do you need a hotel?");
  window.close();
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because the unmodified source A line is displayed after the typed answer.

- [ ] **Step 3: Implement per-run pending adaptive state**

Keep a `pendingAdaptiveLine` local to `renderFreeRun`. When a valid answer is completed, construct a copy only when the next source line is A and its successor is B. In `step()`, consume the pending copy in place of the current A line, clear it after playback, then increment the same source index. For skips and empty ASR text, call the normal advance without a generated line.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: the generated time acknowledgement is rendered, the fixed source line is not rendered in that run, and the source scenario is untouched.

### Task 4: Regression verification

**Files:**
- Verify only.

- [ ] **Step 1: Check syntax**

Run: `node --check js/app.js`

Expected: exit code 0.

- [ ] **Step 2: Run the complete local suite**

Run: `node dialog-library-import.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node translation-wordbook.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node smoke.test.js`

Expected: every suite exits 0 with no `FAIL` output.

## Self-review

- Task 1 covers Chinese submission, English-only score input and network failure recovery.
- Task 2 covers different local reactions for detailed and incomplete answers without claiming cloud-level understanding.
- Task 3 covers runtime replacement, next-turn alignment and source-data immutability.
- Every review-focus input has a named test in Tasks 1–3.
- The plan does not add a server, API credential, paid feature, commit or repository update.
