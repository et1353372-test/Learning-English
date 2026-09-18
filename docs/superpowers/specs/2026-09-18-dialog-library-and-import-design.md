# Dialog Library and Import Design

## Goal

Expand improvised-dialogue practice with a separate, online-sourced catalog while making uploaded bilingual dialog documents import as titled, clean dialog topics.

## Scope

- Keep the existing American English `Everyday Conversations` 30-topic learning resource and do not add those 30 dialogs to improvised practice.
- Add only the 36 dialogs from American English's *More Dialogs for Everyday Use* as a second, locally bundled improvised-practice catalog. The app must remain usable offline after loading.
- Preserve the existing 10 handcrafted improvised scenarios. The new catalog is an additional random source, never derived from user uploads.
- Parse one uploaded resource into one topic per dialog title. Recognized title forms are `Dialogue 1-1: Title`, numbered headings such as `1. Title` / `1、Title`, and Markdown headings such as `## Title`.
- Parse `A: English（中文）`, `A: English (中文)`, and an adjacent Chinese-only continuation into `{ en, zh }`. Do not retain Chinese in `en`.
- Ignore document-level headings, metadata labels (for example 适用难度 / 内容特点 / 使用方式), separators, page markers, and lines without English dialog content.
- An upload with one recognized title is a valid dialog resource.
- Uploaded resource cards must open the generated topic list directly. The intermediate one-scene page shown in the user's third screenshot is removed for uploaded resources only; built-in multi-scene resources retain their current navigation.

## Data Flow

`MORE_FREE_SCENARIOS` in `js/data_more_dialogs.js` holds normalized, role-based practice scenes. `allFreeScenarios()` in `js/app.js` combines this catalog with the existing `FREE_SCENARIOS`; random selection and "again" use that combined pool.

`parseUploadDialogText(raw)` produces `{ title, lines }[]`. It first finds dialog headings, then accepts only speaker lines or bilingual lines belonging to their active heading. The upload builder maps each parsed dialog to exactly one topic and uses its title for both the topic name and dialog title.

## Error Handling

- If no usable English dialog lines can be extracted, retain the existing clear failure toast and do not save a resource.
- Existing automatic Chinese translation continues only for imported lines that have no Chinese translation.
- Parser input is normalized for whitespace but source titles and English punctuation are otherwise retained.

## Verification

- A parser fixture matching the user's document format produces three titled topics, strips the document preamble, and separates bracketed Chinese from English.
- A single titled dialog is accepted.
- A navigation test verifies an uploaded resource opens its topic list directly.
- An improvised-practice test verifies the pool includes the existing scenarios plus exactly 36 new, separate scenarios.
- Existing smoke and translation/wordbook regression suites remain green.
