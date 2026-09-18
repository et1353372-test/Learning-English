# Dialog Library and Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate 36-scenario online-sourced improvised-dialogue catalog and correctly import titled bilingual dialog documents without an intermediate uploaded-resource page.

**Architecture:** A new local data file will hold 36 normalized improvised scenarios from the approved online source. `js/app.js` will combine it with the existing handcrafted scenarios. The upload parser will be a title-aware state machine that emits clean `{ title, lines }` groups; uploaded cards will route directly to their generated scene.

**Tech Stack:** Vanilla JavaScript, static PWA, JSDOM tests, Node.js.

**Spec:** `docs/superpowers/specs/2026-09-18-dialog-library-and-import-design.md`

## Global Constraints

- Do not add the existing American English 30-topic catalog to improvised practice.
- Add exactly 36 new local improvised scenarios sourced from *More Dialogs for Everyday Use*; do not fetch this catalog at practice time.
- Do not use uploaded dialogs as improvised-practice scenarios.
- Store only English in `line.en` and only Chinese translation in `line.zh`.
- Keep built-in multi-scene resource navigation unchanged.
- This workspace has no Git repository; do not create commits.

---

### Task 1: Add the separate 36-scenario improvised catalog

**Files:**
- Create: `js/data_more_dialogs.js`
- Modify: `index.html:25-30`
- Modify: `smoke.test.js:23-31`
- Test: `dialog-library-import.test.js`

**Interfaces:**
- Produces: global `MORE_FREE_SCENARIOS`, an array of exactly 36 `{ id, name, icon, intro, lines }` objects.
- Consumes: no user-uploaded or existing `FREE_SCENARIOS` data.
- Each `lines` item is either `{ who: "A", en, zh }` or `{ who: "B", dir, sugs: [{ en, zh }] }`.

- [ ] **Step 1: Write the failing catalog test**

```js
assert.equal(window.MORE_FREE_SCENARIOS.length, 36);
assert.equal(window.MORE_FREE_SCENARIOS.some(s => s.id === "f-cafe"), false);
assert.ok(window.MORE_FREE_SCENARIOS.every(s =>
  /^more-/.test(s.id) && s.lines.some(line => line.who === "B" && line.sugs.length > 0)
));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: failure because `MORE_FREE_SCENARIOS` is not loaded.

- [ ] **Step 3: Create the catalog and load it before `js/app.js`**

```js
const MORE_FREE_SCENARIOS = [
  {
    id: "more-01",
    name: "...",
    icon: "💬",
    intro: "...",
    lines: [
      { who: "A", en: "...", zh: "..." },
      { who: "B", dir: "...", sugs: [{ en: "...", zh: "..." }] },
    ],
  },
  // Continue through more-36, using the normalized source dialogs.
];
```

Add `<script src="js/data_more_dialogs.js"></script>` after `js/data_pdf.js` in `index.html`; add the same file to the JSDOM source array in all test harnesses.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: catalog assertions pass.

### Task 2: Use both catalogues for improvised-practice randomization

**Files:**
- Modify: `js/app.js:157-164`
- Modify: `js/app.js:716-726`
- Test: `dialog-library-import.test.js`

**Interfaces:**
- Consumes: `FREE_SCENARIOS`, `MORE_FREE_SCENARIOS`, `lastFreeId`.
- Produces: `allFreeScenarios()` returning the 46-scenario combined pool.

- [ ] **Step 1: Write the failing random-pool test**

```js
const pool = window.eval("allFreeScenarios()");
assert.equal(pool.length, 46);
assert.ok(pool.some(s => s.id === "f-cafe"));
assert.ok(pool.some(s => s.id === "more-36"));
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: `allFreeScenarios is not defined`.

- [ ] **Step 3: Implement a single combined-pool helper and replace both random selections**

```js
function allFreeScenarios() {
  return FREE_SCENARIOS.concat(typeof MORE_FREE_SCENARIOS === "undefined" ? [] : MORE_FREE_SCENARIOS);
}

const pool = allFreeScenarios().filter(s => s.id !== lastFreeId);
const sc = pool[Math.floor(Math.random() * pool.length)];
```

Use this code for the homepage `#freeBtn` handler and the `#freeAgainBtn` handler. Keep the current no-immediate-repeat behavior.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: 46 catalog entries and both IDs are present.

### Task 3: Replace line-chunking with a title-aware bilingual dialog parser

**Files:**
- Modify: `js/app.js:171-267`
- Test: `dialog-library-import.test.js`

**Interfaces:**
- Produces: `parseUploadDialogText(raw) -> Array<{ title: string, lines: Array<{ en: string, zh: string, who?: string }> }>`.
- Consumes: uploaded TXT/MD/PDF extracted text.
- Replaces: `parsePdfDialogText` as the first parser used by `handleUploadResourceFile`.

- [ ] **Step 1: Write failing parser tests using the user's document form**

```js
const parsed = window.eval(`parseUploadDialogText(${JSON.stringify(
  "30套完整版日常英语情景对话（中英对照）\n适用难度：A2-B1\n\n1. Greeting & Small Talk 日常打招呼与闲聊\nA: Hi Mark! It’s so good to run into you here.（嗨马克！太巧在这里碰到你了。）\nB: Hey Lisa! Long time no see.（嗨莉萨！好久不见。）\n\n2. At a Cafe 咖啡店\nA: What would you like? (您想喝点什么？)\nB: A latte, please.（请来一杯拿铁。）"
)})`);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].title, "Greeting & Small Talk 日常打招呼与闲聊");
assert.deepEqual(parsed[0].lines[0], { who: "A", en: "Hi Mark! It’s so good to run into you here.", zh: "嗨马克！太巧在这里碰到你了。" });
assert.equal(parsed.flatMap(d => d.lines).some(line => /适用难度|30套完整版/.test(line.en)), false);
assert.equal(window.eval(`parseUploadDialogText("1. One dialog\\nA: Hello.（你好。）\\nB: Hi.（嗨。）")`).length, 1);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: `parseUploadDialogText is not defined`.

- [ ] **Step 3: Implement the parser with heading, speaker, and Chinese-suffix recognition**

```js
const heading = line.match(/^(?:#{1,6}\s*)?(?:Dialogue\s+\d+[\d.\-–]*\s*[:：]|\d{1,3}\s*[.、:：])\s*(.+)$/i);
const speaker = line.match(/^([A-Za-z][A-Za-z .'-]{0,30})\s*:\s*(.+)$/);
const bilingual = text.match(/^(.*?)[（(]\s*([\u3400-\u9fff][^）)]*)[）)]\s*$/);
```

Maintain an active dialog only after a recognized heading. Skip metadata prefixes (`适用难度`, `内容特点`, `使用方式`) and divider-only lines. On a speaker line, split a trailing Chinese parenthesis into `en` and `zh`; save the speaker in `who`. If the next non-heading line contains Chinese only, append it to the preceding line's `zh`. Accept dialogs with at least two English lines.

- [ ] **Step 4: Replace upload fallback behavior and preserve clean topic titles**

```js
let dialogs = parseUploadDialogText(text);
if (!dialogs.length) dialogs = chunkUngroupedDialogLines(parseUploadLines(text), f.name);
```

Use each `d.title` for both `topics[k].name` and `dialogs[0].title`; only fall back to the filename when an unstructured file has no heading. Never insert the document title as a line.

- [ ] **Step 5: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: two titled dialogs, one valid single dialog, and no metadata/Chinese leakage into `en`.

### Task 4: Remove the uploaded-resource intermediate scene page

**Files:**
- Modify: `js/app.js:39-56`
- Test: `dialog-library-import.test.js`

**Interfaces:**
- Consumes: `allResList()` records with `uploaded: true` and a single `sceneIds[0]`.
- Produces: direct `openScene(sceneId)` navigation for uploaded resources only.

- [ ] **Step 1: Write the failing direct-navigation test**

```js
window.eval("openResource('uploaded-resource-id')");
assert.match(document.querySelector("#view").textContent, /Greeting & Small Talk/);
assert.equal(document.querySelector("#view").textContent.includes("场景列表"), false);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node dialog-library-import.test.js`

Expected: the old intermediate page contains `场景列表`.

- [ ] **Step 3: Route uploaded cards directly to their scene**

```js
function openResource(resId) {
  if (resId === "custom") return renderCustomManage();
  const resource = allResList().find(r => r.id === resId);
  if (resource && resource.uploaded) return openScene(resource.sceneIds[0]);
  pushView(renderResource, resId);
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node dialog-library-import.test.js`

Expected: the uploaded resource opens the topic list directly while an existing built-in resource still opens its scene list.

### Task 5: Run the complete verification suite

**Files:**
- Modify: `smoke.test.js` only if its JSDOM source list needs `js/data_more_dialogs.js`.
- Test: `dialog-library-import.test.js`, `translation-wordbook.test.js`, `smoke.test.js`

- [ ] **Step 1: Run all regression and smoke suites**

Run: `node dialog-library-import.test.js`

Expected: all catalog, parser, and navigation checks pass.

Run: `node translation-wordbook.test.js`

Expected: both translation and late wordbook synchronization checks pass.

Run: `node smoke.test.js`

Expected: existing smoke checks report zero failures.

- [ ] **Step 2: Inspect delivered behavior against the approved scope**

Confirm: only the 36 new scenarios expand improvised practice; no user upload participates in that pool; titles create imported topics; Chinese is absent from `en`; and uploaded cards bypass the intermediate scene page.
