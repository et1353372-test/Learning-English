# Improvised Transcription and Dialogue Length Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a user's actual free-form spoken English as text before closing the microphone, score only that text, and make every improvised scenario long enough for meaningful practice.

**Architecture:** `js/recorder.js` preserves the microphone recording for playback. `js/app.js` starts browser-standard microphone ASR separately, awaits its final result before stopping the recorder, and stores only textual answer evaluation in a turn. Dialogue builders in `js/data_more_dialogs.js` and the free-scenario accessor provide context-appropriate tails so all supplied scenarios reach ten alternating lines without mutating source data.

**Tech Stack:** Vanilla JavaScript, browser Web Speech API, MediaRecorder, JSDOM and Node `assert` tests.

**Spec:** `docs/superpowers/specs/2026-09-20-improvised-transcription-and-length-design.md`

## Global Constraints

- Keep static GitHub Pages deployment; no backend, credentials, paid API or application-originated network request.
- Do not feed reference answers or prompt phrases into speech recognition.
- Keep recording playback, typed turns, prompt hints and demonstration playback unchanged.
- Score only textual answer quality; do not display or calculate recognition-confidence, sound-quality or pronunciation scoring.
- Preserve existing ten-line scenario wording and custom/imported dialogue behavior.
- This workspace has no Git repository; do not create commits or use Git worktrees.

## Review Focus

- A speech result that arrives only after `stop()` must be retained before the audio track is closed.
- Browsers that reject `recognition.start(track)` must still attempt normal `recognition.start()`.
- A no-speech, permissions, unsupported or network error must produce a helpful message rather than an invented transcript.
- A scenario whose existing line count is 8 must not be shortened or have its existing lines rewritten.
- A recognition confidence value must never change the session score.

---

### Task 1: Final-result-aware speech transcription

**Files:**
- Modify: `js/recorder.js:1-27`
- Modify: `js/app.js:906-938,1117-1150`
- Modify: `dialog-library-import.test.js:15-35, before the case runner`

**Interfaces:**
- Consumes: a running recorder and optional `MediaStreamTrack`.
- Produces: `Recorder.getAudioTrack()` and `startASR(track)` with `finish(): Promise<{transcript, error}>`.

- [ ] **Step 1: Write a failing final-result test**

Add a JSDOM recognition fixture that has `start(track)`, emits no text immediately, then emits a final `Maybe tomorrow` result inside `stop()` followed by `onend`. Assert `await asr.finish()` returns `Maybe tomorrow`, and that its start call received the literal fixture track.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because the current `startASR()` ignores its argument and returns text before the final callback.

- [ ] **Step 3: Write a failing graceful-fallback test**

Add a fixture whose `start(track)` throws and whose subsequent zero-argument start succeeds. Assert `finish()` returns the final transcript. Add a fixture emitting `onerror({error: "no-speech"})`; assert `finish()` has an empty transcript and error `no-speech`.

- [ ] **Step 4: Implement the smallest ASR and recorder changes**

Expose `getAudioTrack()` from `Recorder` while its stream exists. Implement `startASR(audioTrack)` to retain final and interim text, attempt `start(audioTrack)` then `start()`, preserve the browser error name, and resolve `finish()` from `onend` (with a short timeout safety net). In `renderFreeRun`, call `startASR(Recorder.getAudioTrack())`; when confirming, await `finish()` before `Recorder.stop()`, show `⏳ 正在转写…`, and render either the actual text or a Chinese failure explanation with the recording URL.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: the new final-result and fallback/error cases pass alongside existing tests.

### Task 2: Remove audio confidence from session scoring

**Files:**
- Modify: `js/app.js:978-1080,1130-1150`
- Modify: `dialog-library-import.test.js:120-180`

**Interfaces:**
- Consumes: `userTurns` containing `{answerEvaluation: {score}}`.
- Produces: `scoreFreeSession(turns) => { total, contentScore }` and results markup with per-turn feedback.

- [ ] **Step 1: Write a failing text-only-score test**

Change the session fixture to include a microphone answer with a deliberately high `clarity.score: 99` and answer quality `70`; assert both `contentScore` and `total` are `70`. Assert result markup contains `回答质量` and does not contain `识别清晰度`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL because the current session calculation can weight measured clarity and the current markup renders it.

- [ ] **Step 3: Implement text-only scoring**

Remove `scoreRecognitionClarity` from the free-run data path. Make `scoreFreeSession` average only `answerEvaluation.score`; replace the clarity row and explanation with text stating that the score assesses relevance, completeness and naturalness of the English answer, not sound quality.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: text-only score and markup cases pass.

### Task 3: Guarantee ten lines for all free scenarios

**Files:**
- Modify: `js/data_more_dialogs.js:42-55`
- Modify: `js/app.js:902-904`
- Modify: `dialog-library-import.test.js:76-86`

**Interfaces:**
- Consumes: the current 10 base scenarios and 36 seed-driven scenarios.
- Produces: `allFreeScenarios()` containing 46 scenarios, each with at least 10 lines alternating A and B and at least 5 B turns.

- [ ] **Step 1: Write a failing scenario-length test**

Call `allFreeScenarios()` and assert `pool.length === 46`, every `scene.lines.length >= 10`, every adjacent pair alternates `who`, and each scene has at least five `B` entries. This fails because the 36 `MORE_FREE_SCENARIOS` currently have four lines and several base scenarios have eight.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: FAIL on a `more-*` scenario with four lines.

- [ ] **Step 3: Implement minimal contextual continuations**

Extend `makeMoreScenario` with one of three six-line tails (service, plan, social) selected by explicit topic-id sets. In `allFreeScenarios()`, clone only short base scenarios and append one A/B closing exchange selected by `scene.id`; do not alter already-ten-line data. Use complete English and Chinese text in every new line.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: all 46 scenarios meet the line, alternation and user-turn requirements.

### Task 4: Regression verification

**Files:**
- Verify only.

- [ ] **Step 1: Check JavaScript syntax**

Run: `node --check js/app.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --check js/recorder.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node --check js/data_more_dialogs.js`

Expected: exit code 0.

- [ ] **Step 2: Run complete suite**

Run: `node dialog-library-import.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node translation-wordbook.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node smoke.test.js`

Expected: every suite reports no failures and exits 0.

## Self-review

- The plan covers final ASR timing, track fallback, explanatory error handling, text-only scoring and the scenario-length guarantee.
- Every review-focus input has an owning test in Tasks 1–3.
- The plan has no backend or external-service work, so it preserves static deployment.
- The plan only changes the two source data builders, recorder and improvisation flow; imports and standard dialogue data are out of scope.
