# Execution ledger — plan: docs/superpowers/plans/2026-09-20-improvised-transcription-and-length.md

Pre-flight: no Git repository is present, so the plan's Git-backed SDD workspace and task scripts cannot run. Ruling: use this repository-local execution ledger instead; cost if wrong: the work has no commit-range record, but each TDD command and outcome remains documented here.

Baseline: `node dialog-library-import.test.js; node translation-wordbook.test.js; node smoke.test.js` → PASS: 68, FAIL: 0.

Pre-flight interfaces: Task 1 produces final transcript/error data consumed by Task 2's text-only score and Task 3's unchanged user-turn shape; no conflict. Task 3 only consumes `allFreeScenarios()` and shares no mutable data with Tasks 1–2.

Task 1: complete (no commit range: workspace is not a Git repository; tests: `node dialog-library-import.test.js` → 38/38 PASS). The final-result test was RED (`asr.finish is not a function`), then GREEN. The track-fallback and no-speech-error test was RED (`fallback.finish is not a function`), then GREEN.

Task 2: complete (no commit range: workspace is not a Git repository; tests: `node dialog-library-import.test.js` → 38/38 PASS). The text-only session test was RED (`77 !== 70`) and the results-markup test was RED because the old UI showed recognition clarity; both are GREEN after removing confidence from the score data path and markup.

Task 3: complete (no commit range: workspace is not a Git repository; tests: `node dialog-library-import.test.js` → 38/38 PASS). The pool-length test was RED (`every improvisation scene must have at least 10 lines`) then GREEN after only appending contextual A/B exchanges to short scenarios. Existing ten-line scenario wording remains unchanged.

Task 1 follow-up: complete (tests: `node dialog-library-import.test.js` → 39/39 PASS). Ruling: expose the recorder's track only while the stream is live, then clear the stream after its recorder stops — this prevents a later recognition request from receiving a closed track; cost if wrong: a browser would fall back to a separate microphone request. The direct recorder-track test was RED (`recorder.getAudioTrack is not a function`) then GREEN.

Final review: self-review (no subagent permitted and this workspace has no Git review range). Added and ran two missing user-visible ASR regressions: interim-only text was RED (`'' !== 'I will be there tomorrow'`) then GREEN; the learner-bubble flow was RED (the transcript was absent from the bubble) then GREEN. No Critical, Important or Minor findings remain after reviewing the implementation against the spec.

Task 4: complete (syntax: `node --check js/app.js; node --check js/recorder.js; node --check js/data_more_dialogs.js` → exit 0; full suite: `node dialog-library-import.test.js; node translation-wordbook.test.js; node smoke.test.js` → PASS: 68, FAIL: 0).

2026-09-21 transcription regression: Root-cause ruling: the target browser records audio but returns neither a transcript nor an ASR error when called through `SpeechRecognition.start(MediaStreamTrack)`. Replace this optional, limited-availability input path with browser-standard `SpeechRecognition.start()` while preserving final-result waiting and recording playback; cost if wrong: browsers lacking Web Speech recognition will still show their explicit unsupported/error message and cannot transcribe locally. RED: supplied-track call gave 1 start argument and fallback tried two starts; GREEN: standard microphone start gives 0 arguments and exactly one start. Final verification: syntax checks plus `node dialog-library-import.test.js; node translation-wordbook.test.js; node smoke.test.js` → PASS: 68, FAIL: 0.
