"""Build the bundled family-English resource from the user-provided PDF.

The source uses fixed two-column English/Chinese pages.  This script keeps the
original CHAPTER subheadings as app topics and writes a static browser data file
so the resource works offline after it has been imported once.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from pypdf import PdfReader


SOURCE_PDF = Path(r"C:\Users\Toic\Downloads\美国家庭万用英文英语8000句.pdf")
OUTPUT_FILE = Path(__file__).resolve().parents[1] / "js" / "data_family_8000.js"

CHINESE_RE = re.compile(r"[\u3400-\u9fff]")
CHAPTER_RE = re.compile(r"^CHAPTER\s*(\d+)(?:-(\d+))?(.*)$", re.IGNORECASE)
INITIAL_TOPIC_NAMES = {
    "爸妈最常使用的50句英文": "00-01 爸妈最常使用的 50 句",
    "孩子最常使用的50句英文": "00-02 孩子最常使用的 50 句",
}

# The embedded subset font maps a handful of common CJK glyphs to neighboring
# code points.  These replacements only repair extraction artefacts; they do
# not rewrite the supplied English or Chinese wording.
GLYPH_FIXES = str.maketrans({
    "丌": "不", "乲": "乳", "夗": "多", "夘": "夜", "朊": "朋",
    "讣": "认", "讱": "讲", "诟": "询", "纾": "舒", "烨": "熨",
    "烩": "热", "盙": "摆", "‗": "'", "‘": "'", "’": "'",
    "“": '"', "”": '"', "―": '"',
})


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.translate(GLYPH_FIXES).replace("\\", " / ")).strip()


def title_text(text: str) -> str:
    text = normalize_text(text).lstrip("- ")
    if text.lower().startswith("tips"):
        return "提示" + ("：" + text[4:].strip() if text[4:].strip() else "")
    return re.sub(r"\s*[-\\/]\s*", " / ", text).strip()


def split_columns(row: str) -> tuple[str, str]:
    match = CHINESE_RE.search(row)
    if not match:
        return normalize_text(row), ""
    return normalize_text(row[:match.start()]), normalize_text(row[match.start():])


def sentence_ends(text: str) -> bool:
    return bool(re.search(r"[.!?。！？]$", text.strip()))


def chinese_number(number: int) -> str:
    digits = "零一二三四五六七八九"
    if number < 10:
        return digits[number]
    if number == 10:
        return "十"
    if number < 20:
        return "十" + digits[number % 10]
    tens, ones = divmod(number, 10)
    return digits[tens] + "十" + (digits[ones] if ones else "")


def build_topics() -> list[dict]:
    reader = PdfReader(SOURCE_PDF)
    topics: list[dict] = []
    current: dict | None = None
    unit_name = ""
    pending_en = ""
    pending_zh = ""
    id_counts: defaultdict[str, int] = defaultdict(int)

    def finish_sentence() -> None:
        nonlocal pending_en, pending_zh
        if current and pending_en and pending_zh:
            current["sentences"].append({"en": normalize_text(pending_en), "zh": normalize_text(pending_zh)})
        pending_en = ""
        pending_zh = ""

    def start_topic(code: str, name: str) -> None:
        nonlocal current
        finish_sentence()
        id_counts[code] += 1
        suffix = "" if id_counts[code] == 1 else f"-{id_counts[code]}"
        current = {
            "id": f"family-8000-{code}{suffix}",
            "name": name,
            "icon": "👪",
            "desc": unit_name or "家庭亲子英语短句",
            "words": [],
            "sentences": [],
            "dialogs": [],
            "reading": True,
        }
        topics.append(current)

    for page in reader.pages:
        layout = page.extract_text(extraction_mode="layout") or ""
        for row in layout.splitlines():
            left, right = split_columns(row)
            chapter = CHAPTER_RE.match(left)
            if chapter:
                major, minor, raw_title = chapter.groups()
                raw_title = f"{raw_title} {right}".strip()
                if minor is None:
                    finish_sentence()
                    unit_name = f"第 {int(major)} 章 {title_text(raw_title)}".strip()
                    continue
                section = f"{int(major):02d}-{int(minor):02d}"
                start_topic(section, f"{section} {title_text(raw_title)}")
                continue

            compact_right = right.replace(" ", "")
            if not left and compact_right in INITIAL_TOPIC_NAMES:
                start_topic(compact_right, INITIAL_TOPIC_NAMES[compact_right])
                continue
            if not left and not right:
                continue
            if not right:
                if pending_en and left and not left.isdigit():
                    pending_en = f"{pending_en} {left}"
                continue
            if not left:
                if pending_en:
                    pending_zh = f"{pending_zh}{right}"
                continue
            if not re.search(r"[A-Za-z]", left):
                continue

            if pending_en and not sentence_ends(pending_en):
                pending_en = f"{pending_en} {left}"
                pending_zh = f"{pending_zh}{right}"
            else:
                finish_sentence()
                pending_en, pending_zh = left, right

    finish_sentence()
    return [topic for topic in topics if topic["sentences"]]


def build_chapter_scenes(topics: list[dict]) -> list[dict]:
    scenes: list[dict] = []
    preface_topics = [topic for topic in topics if topic["name"].startswith("00-")]
    if preface_topics:
        preface_sentences = sum(len(topic["sentences"]) for topic in preface_topics)
        scenes.append({
            "id": "family-8000-common",
            "name": "常用 50 句",
            "icon": "📌",
            "desc": f"爸妈与孩子常用短句 · {preface_sentences} 句",
            "topics": preface_topics,
        })

    for chapter_number in range(1, 47):
        prefix = f"{chapter_number:02d}-"
        chapter_topics = [topic for topic in topics if topic["name"].startswith(prefix)]
        if not chapter_topics:
            continue
        unit_name = chapter_topics[0]["desc"]
        match = re.match(r"第\s*\d+\s*章\s*(.*)", unit_name)
        chapter_title = match.group(1).strip() if match else unit_name
        sentence_count = sum(len(topic["sentences"]) for topic in chapter_topics)
        scenes.append({
            "id": f"family-8000-chapter-{chapter_number:02d}",
            "name": f"第{chinese_number(chapter_number)}章 {chapter_title}",
            "icon": "📁",
            "desc": f"{len(chapter_topics)} 个小节 · {sentence_count} 句",
            "topics": chapter_topics,
        })
    return scenes


def main() -> None:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(f"Source PDF not found: {SOURCE_PDF}")

    topics = build_topics()
    scenes = build_chapter_scenes(topics)
    total_sentences = sum(len(topic["sentences"]) for topic in topics)
    resource = {
        "id": "family-8000",
        "name": "美国家庭常用英语 8000 句",
        "icon": "👪",
        "desc": f"亲子生活英语 · {len(scenes)} 个文件夹 · {total_sentences} 句",
        "sceneIds": [scene["id"] for scene in scenes],
        "folderLabel": "章节",
        "folderCountLabel": f"{len(scenes)} 个文件夹",
    }
    output = (
        "/* 由用户提供的《美国家庭万用英文英语8000句》PDF 离线解析生成。 */\n"
        f"const FAMILY_8000_SCENES = {json.dumps(scenes, ensure_ascii=False, indent=2)};\n\n"
        "SCENES.push(...FAMILY_8000_SCENES);\n"
        f"RESOURCES.push({json.dumps(resource, ensure_ascii=False, indent=2)});\n"
    )
    OUTPUT_FILE.write_text(output, encoding="utf-8")
    print(f"Generated {OUTPUT_FILE}: {len(scenes)} folders, {len(topics)} topics, {total_sentences} sentences")


if __name__ == "__main__":
    main()
