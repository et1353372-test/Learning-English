# Local Improvised Dialogue Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace completion-weighted improvisational-dialogue scoring with explainable local answer-quality scoring and conservatively labelled recognition clarity.

**Architecture:** Keep all scoring in `js/app.js` as deterministic pure helpers that receive the current prompt, suggestions and browser recognition result. `renderFreeRun` records per-turn evaluations and delegates all session math and result copy to these helpers, so no UI path can award a score merely for opening the microphone.

**Tech Stack:** Vanilla JavaScript, browser Web Speech API when available, JSDOM and Node assert tests.

**Spec:** `docs/superpowers/specs/2026-09-20-local-improvised-dialogue-scoring.md`

## Global Constraints

- Keep the application deployable as static GitHub Pages; no secret, backend, new service, or scoring network call.
- Do not alter dialogue resources, import parsing, TTS or recording playback.
- Label browser-derived speech data as “识别清晰度”, never as pronunciation accuracy.
- A missing or empty browser transcript must not earn a microphone/completion score.
- This working folder has no Git repository; do not create commits or use Git worktrees.

## Review Focus

- A natural short answer such as `Tomorrow afternoon.` should not be rejected solely for omitting a subject.
- A sentence that repeats a question word but does not answer it should not receive high relevance.
- A useful alternative answer with different wording must score above an unrelated English sentence.
- SpeechRecognition implementations that omit `confidence` must remain transparent and conservative.
- Existing static-only flows must not make a new fetch request during scoring.

### Task 1: Add deterministic local scoring helpers

**Files:**
- Modify: `js/app.js:905-934`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: `answer: string`, `prompt: string`, `suggestions: Array<{en: string}>`, `transcript: string`, and `confidence: number | undefined`.
- Produces: `evaluateFreeResponse`, `scoreRecognitionClarity`, and `scoreFreeSession`, exported through `window.__test` for JSDOM.

- [ ] **Step 1: Write the failing response-quality tests**

Add JSDOM tests that call the not-yet-exported `evaluateFreeResponse` with:

```js
const prompt = "When will you arrive for the business trip?";
const suggestions = [{ en: "I plan to be there by tomorrow afternoon." }];
const full = window.__test.evaluateFreeResponse(
  "I plan to be there by tomorrow afternoon.", prompt, suggestions
);
const brief = window.__test.evaluateFreeResponse("Maybe tomorrow.", prompt, suggestions);
const unrelated = window.__test.evaluateFreeResponse("I like pizza.", prompt, suggestions);
assert.ok(full.score >= 90);
assert.ok(brief.score >= 60 && brief.score <= 75);
assert.ok(full.score - brief.score >= 20);
assert.ok(unrelated.score < brief.score);
assert.match(brief.feedback.join(" "), /完整/);
```

- [ ] **Step 2: Run the response-quality test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because `window.__test.evaluateFreeResponse` is not defined.

- [ ] **Step 3: Write the failing clarity and no-free-microphone-credit tests**

Add tests using this desired interface:

```js
const absent = window.__test.scoreRecognitionClarity("", undefined);
assert.equal(absent.status, "unavailable");
assert.equal(absent.score, null);
const transcriptOnly = window.__test.scoreRecognitionClarity("Maybe tomorrow", undefined);
assert.equal(transcriptOnly.status, "transcript-only");
assert.ok(transcriptOnly.score < 100);
const session = window.__test.scoreFreeSession([{
  type: "mic", answerEvaluation: { score: 70 }, clarity: absent,
}]);
assert.equal(session.contentScore, 70);
assert.equal(session.clarityScore, null);
assert.equal(session.total, 70);
```

- [ ] **Step 4: Run the test and verify it fails for the missing interface**

Run: `node dialog-library-import.test.js`

Expected: FAIL because `scoreRecognitionClarity` and `scoreFreeSession` are not defined.

- [ ] **Step 5: Implement the smallest scoring helpers**

In `js/app.js`, add only deterministic helpers:

```js
function evaluateFreeResponse(answer, prompt, suggestions) { /* return specified breakdown */ }
function scoreRecognitionClarity(transcript, confidence) { /* no transcript => unavailable */ }
function scoreFreeSession(turns) { /* content 75%, clarity 25% only when scored */ }
```

Use a local question-intent classifier (`when`, `where`, `how many/how much`, yes/no, why, preference/action), content-word overlap with `suggestions`, English detection and response length/structure. The score must meet the concrete test ranges without hard-coding the example sentence. Extend `window.__test` with the three helpers.

- [ ] **Step 6: Run the scoring regression test suite and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: all existing cases and the new scoring cases print `PASS`, exit code 0.

### Task 2: Connect recording and typed turns to the scoring helpers

**Files:**
- Modify: `js/app.js:905-1088`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: Task 1 helper signatures and current B-line shape `{dir: string, sugs: Array<{en: string, zh: string}>}`.
- Produces: `userTurns` entries containing `answerEvaluation` and `clarity`; `startASR()` result with `getTranscript()` and `getConfidence()`.

- [ ] **Step 1: Write the failing ASR-result preservation test**

Create a mock `SpeechRecognition` that emits a final result with transcript `Maybe tomorrow` and confidence `0.72`; assert the `startASR()` handle returns both values after its result callback. Also test an omitted confidence returns `undefined`, not a fake value.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because the current ASR handle exposes only `getTranscript()`.

- [ ] **Step 3: Implement the minimal turn-data changes**

Change `startASR()` to retain the best final result confidence and expose `getConfidence()`. In both the microphone and typed branches, call `evaluateFreeResponse(answer, precedingPrompt, l.sugs)`. In the microphone branch call `scoreRecognitionClarity(transcript, asr.getConfidence())`; no transcript yields `unavailable`. Remove `rateTypedBonus` use from the free-dialogue flow and remove the no-transcript microphone credit.

- [ ] **Step 4: Run the scoring test suite and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: all cases print `PASS`, exit code 0.

### Task 3: Render an honest per-session breakdown

**Files:**
- Modify: `js/app.js:1060-1088`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: Task 1 `scoreFreeSession(turns)` result and Task 2 evaluated `userTurns`.
- Produces: results markup with total score, answer-quality score, clarity score/status, and per-turn feedback.

- [ ] **Step 1: Write the failing results-markup test**

Extract a pure `renderFreeScoreSummary(session, turns)` function or equivalent testable markup builder. Assert that a `clarityScore: null` summary includes `回答质量`, `识别清晰度：未测评`, and does not contain `发音满分`. Assert a scored summary includes the numerical `识别清晰度` value and the supplied per-turn feedback.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because the summary builder is not defined.

- [ ] **Step 3: Implement results markup using the session helper**

Replace the fixed completion scoring block in `endFree()` with `scoreFreeSession(userTurns)`. Render the three score fields and concise feedback. Retain standard demonstration playback and expansion exactly as they are. Replace the old explanation text with a clear static-only limitation: “识别清晰度来自浏览器转写，不等同于发音测评。”

- [ ] **Step 4: Run all project regression checks**

Run:

```powershell
node dialog-library-import.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node translation-wordbook.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node smoke.test.js
```

Expected: every suite exits 0; no new network dependency or source-loading failure.

## Self-review

- The design’s no-backend, no-service and no-network constraints are enforced by pure local helpers and the full regression command.
- The test plan covers the full answer, short but relevant answer, unrelated answer, absent transcript, omitted confidence and final transparency copy.
- The retained UI path is deliberately limited to existing `renderFreeRun`; imports, resources, TTS and recording playback are outside this plan.
- No Git commit steps are included because this workspace has no Git repository.
