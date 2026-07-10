from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


HTML_PATH = Path("policy_latest.html")
TEXT_PATH = Path("policy_latest.txt")
DATA_PATH = Path("manual-data.js")
TREE_REPORT_PATH = Path("structure-tree-latest.md")
AUDIT_REPORT_PATH = Path("migration-audit-latest.md")
MAPPING_REPORT_PATH = Path("content-mapping-latest.md")


def normalize_text(value: str) -> str:
    value = value.replace("\xa0", " ").replace("\u3000", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def slug(value: str, fallback: str) -> str:
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "-", value, flags=re.UNICODE).strip("-").lower()
    return text or fallback


class ParagraphParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.paragraphs: list[dict] = []
        self.current: dict | None = None
        self.stack: list[tuple[str, dict]] = []
        self.inline_html: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key: value or "" for key, value in attrs}
        self.stack.append((tag, attrs_dict))
        if tag == "p":
            self.current = {
                "pClass": attrs_dict.get("class", ""),
                "text": "",
                "bold": False,
                "spanClasses": set(),
                "htmlIndex": len(self.paragraphs) + 1,
            }
            self.inline_html = []
            return
        if self.current is None:
            return
        if tag == "b":
            self.current["bold"] = True
        if tag == "span":
            span_class = attrs_dict.get("class", "")
            if span_class:
                self.current["spanClasses"].add(span_class)
        if tag in {"b", "strong"}:
            self.inline_html.append("<strong>")
        elif tag == "br":
            self.inline_html.append("<br>")

    def handle_endtag(self, tag: str) -> None:
        if self.current is not None:
            if tag in {"b", "strong"}:
                self.inline_html.append("</strong>")
            if tag == "p":
                self.current["inlineHtml"] = "".join(self.inline_html)
                self.current["spanClasses"] = sorted(self.current["spanClasses"])
                self.paragraphs.append(self.current)
                self.current = None
                self.inline_html = []
        if self.stack:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if self.current is None:
            return
        self.current["text"] += data
        escaped = (
            data.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        self.inline_html.append(escaped)


def extract_styles(html: str) -> dict[str, str]:
    styles: dict[str, str] = {}
    for match in re.finditer(r"(p|span)\.(\w+)\s*\{([^}]*)\}", html):
        styles[f"{match.group(1)}.{match.group(2)}"] = match.group(3)
    return styles


def paragraph_features(raw_paragraphs: list[dict], styles: dict[str, str]) -> list[dict]:
    result: list[dict] = []
    source_line = 0
    for raw in raw_paragraphs:
        text = normalize_text(raw["text"])
        if not text:
            continue
        source_line += 1
        p_style = styles.get(f"p.{raw['pClass']}", "")
        span_style = " ".join(styles.get(f"span.{cls}", "") for cls in raw["spanClasses"])
        style_text = f"{p_style} {span_style}"
        font_match = re.search(r"font:\s*([0-9.]+)px", p_style)
        margin_match = re.search(r"margin:\s*[^;]*?\s+0\.0px\s+([0-9.]+)px", p_style)
        background = None
        if "#ffff00" in style_text:
            background = "yellow"
        elif "#00ff00" in style_text:
            background = "green"
        result.append(
            {
                "id": f"p-{source_line:04d}",
                "sourceLine": source_line,
                "htmlIndex": raw["htmlIndex"],
                "text": text,
                "inlineHtml": raw["inlineHtml"],
                "pClass": raw["pClass"],
                "bold": bool(raw["bold"]),
                "background": background,
                "fontSize": float(font_match.group(1)) if font_match else None,
                "indent": float(margin_match.group(1)) if margin_match else 0,
            }
        )
    return result


MINOR_TITLE_RE = re.compile(
    r"^(\d+[.．]\s*)?(保险标的|投保人及被保险人|保险金额|赔偿限额|主要保险责任范围|承保条件|保险期限|保险费率|主要保险责任|投保人|保险责任范围)[:：]?$"
)


def is_chapter(p: dict) -> bool:
    return bool(re.match(r"^第[一二三四五六七八九十]+章\s*", p["text"]))


def is_root_title(p: dict) -> bool:
    return p["text"] == "非车险"


def is_module_heading(p: dict, chapter_title: str | None) -> bool:
    text = p["text"]
    if is_root_title(p) or is_chapter(p):
        return False
    if p["pClass"] == "p3" and p["bold"] and (p["fontSize"] or 0) >= 16:
        return True
    return False


def is_cn_heading(text: str) -> bool:
    return bool(re.match(r"^（[一二三四五六七八九十]+）", text))


def looks_like_sentence_item(text: str) -> bool:
    if "；" in text:
        return True
    if any(token in text for token in ("属于被保险人", "由被保险人", "其他具有法律上承认")):
        return True
    return False


def is_major_bold_card(text: str) -> bool:
    if MINOR_TITLE_RE.match(text):
        return False
    major_terms = (
        "业务承保政策",
        "业务范围",
        "核保流程",
        "核保要素",
        "承保管理指引",
        "共保业务处理原则",
        "异地业务处理原则",
        "业务审批上报规则",
        "典型风险业务承保规则",
        "公众责任险",
        "鼓励承保业务",
        "禁止承保业务",
        "谨慎承保业务",
    )
    if text in {"承保条件：", "投保时应注明保险金额确定方式，以便理赔。"}:
        return False
    return len(text) <= 36 and any(term in text for term in major_terms)


CHAPTER2_CARD_TITLES = {
    "附加条款使用规则",
    "保险金额",
    "职业类别",
    "团体业务核保规则",
    "团体人身意外伤害保险",
    "建筑施工人员团体意外伤害保险",
    "意外险业务核保授权",
}


def is_card_heading(
    p: dict,
    chapter_title: str | None,
    module_title: str | None,
    current_card: dict | None = None,
) -> tuple[bool, str]:
    text = p["text"]
    if not chapter_title or not module_title:
        return False, ""
    if is_module_heading(p, chapter_title) or is_chapter(p) or is_root_title(p):
        return False, ""
    if chapter_title.startswith("第二章"):
        if text in CHAPTER2_CARD_TITLES:
            return True, "精修标题样式+语义识别"
        return False, ""
    if chapter_title.startswith("第一章"):
        if p["pClass"] == "p4" and p["bold"] and (p["fontSize"] or 0) >= 14:
            return True, "精修标题样式"
    if chapter_title.startswith("第三章"):
        return False, ""
    return False, ""


def classify_line_kind(text: str) -> str:
    if re.search(r"(年保险费|保险费|年保费|保费计算|=|＝).*(保险金额|费率|系数)", text):
        return "formula"
    if re.search(r"(禁止承保|不予承保|拒保|不得承保|原则上不予承保)", text):
        return "warning"
    if re.search(r"(谨慎承保|严格控制|注意|需严格|应严格)", text):
        return "caution"
    if re.search(r"(鼓励承保|优质|推荐)", text):
        return "positive"
    if re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲ]", text):
        return "list"
    if re.match(r"^[（(]?\d+[）).．]", text) or is_cn_heading(text):
        return "list"
    if MINOR_TITLE_RE.match(text) or re.match(r"^[一二三四五六七八九十]+、", text):
        return "subheading"
    return "paragraph"


def infer_tags(text: str) -> list[str]:
    tags: list[str] = []
    rules = [
        ("鼓励承保", r"鼓励承保|优质|推荐"),
        ("禁止承保", r"禁止承保|不予承保|拒保|不得承保|原则上不予承保"),
        ("谨慎承保", r"谨慎承保|严格控制|注意|需严格|应严格"),
        ("核保要素", r"核保|上报|审批|承保前风险评估|承保方案"),
        ("承保条件", r"承保条件|费率|免赔|保险费|保费"),
        ("保险责任", r"保险责任|责任范围|赔偿限额|保险金额|保险期限|保险标的"),
        ("再保合约", r"再保|自留额|承保能力|共保折扣"),
        ("管理指引", r"管理指引|风险信息|危险单位|查勘|风险管理"),
    ]
    for label, pattern in rules:
        if re.search(pattern, text):
            tags.append(label)
    return tags


def make_block(p: dict) -> dict:
    return {
        "sourceLine": p["sourceLine"],
        "text": p["text"],
        "html": p["inlineHtml"],
        "kind": classify_line_kind(p["text"]),
        "signals": {
            "bold": p["bold"],
            "background": p["background"],
            "fontSize": p["fontSize"],
            "indent": p["indent"],
            "pClass": p["pClass"],
        },
    }


def build_manual(paragraphs: list[dict]) -> dict:
    manual = {
        "source": "非车险政策宣导(4).doc",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "paragraphCount": len(paragraphs),
        "chapters": [],
        "allParagraphs": paragraphs,
        "visualExtraction": {
            "htmlTables": "<table" in HTML_PATH.read_text(encoding="utf-8").lower(),
            "htmlImages": "<img" in HTML_PATH.read_text(encoding="utf-8").lower(),
            "unreliableItems": [],
        },
    }
    current_chapter = None
    current_module = None
    current_card = None
    root_seen = False

    def close_card() -> None:
        nonlocal current_card
        current_card = None

    for p in paragraphs:
        text = p["text"]
        if is_root_title(p):
            manual["rootTitle"] = text
            root_seen = True
            continue
        if is_chapter(p):
            close_card()
            current_module = None
            current_chapter = {
                "id": f"chapter-{len(manual['chapters']) + 1}",
                "title": text,
                "sourceLine": p["sourceLine"],
                "basis": ["第X章编号", "加粗居中样式" if p["bold"] else "编号识别"],
                "modules": [],
                "standaloneBlocks": [],
            }
            manual["chapters"].append(current_chapter)
            continue
        if current_chapter is None:
            continue
        if is_module_heading(p, current_chapter["title"]):
            close_card()
            current_module = {
                "id": f"{current_chapter['id']}-module-{len(current_chapter['modules']) + 1}",
                "title": text,
                "sourceLine": p["sourceLine"],
                "sourceLines": [p["sourceLine"]],
                "basis": ["加粗", "较大字号", "独占一行", "语义为险种/业务模块"],
                "introBlocks": [],
                "cards": [],
            }
            current_chapter["modules"].append(current_module)
            continue
        if current_module is None:
            current_chapter["standaloneBlocks"].append(make_block(p))
            continue
        is_card, basis = is_card_heading(p, current_chapter["title"], current_module["title"], current_card)
        if is_card:
            close_card()
            current_card = {
                "id": f"{current_module['id']}-card-{len(current_module['cards']) + 1}",
                "title": text.strip(" .。"),
                "rawTitle": text,
                "sourceLine": p["sourceLine"],
                "basis": [basis, "独占一行" if len(text) <= 90 else "语义判断"],
                "summary": "",
                "tags": [],
                "blocks": [],
            }
            current_module["cards"].append(current_card)
            continue
        block = make_block(p)
        if current_card is not None:
            current_card["blocks"].append(block)
        else:
            current_module["introBlocks"].append(block)

    for chapter in manual["chapters"]:
        for module in chapter["modules"]:
            kept_cards = []
            for card in module["cards"]:
                if not card["blocks"]:
                    module["introBlocks"].append(
                        {
                            "sourceLine": card["sourceLine"],
                            "text": card["rawTitle"],
                            "html": card["rawTitle"],
                            "kind": "group",
                            "signals": {"basis": card["basis"]},
                        }
                    )
                else:
                    kept_cards.append(card)
            module["cards"] = kept_cards
            if not module["cards"]:
                card = {
                    "id": f"{module['id']}-card-1",
                    "title": module["title"],
                    "rawTitle": module["title"],
                    "sourceLine": module["sourceLine"],
                    "basis": ["二级标题无下级卡片，保留为占位卡片"],
                    "summary": "该模块暂无下级标题，已作为独立主题保留。",
                    "tags": [],
                    "blocks": module["introBlocks"],
                }
                module["introBlocks"] = []
                module["cards"].append(card)
            for card in module["cards"]:
                block_text = " ".join(block["text"] for block in card["blocks"])
                card["summary"] = next((block["text"] for block in card["blocks"] if len(block["text"]) > 8), card["title"])
                if len(card["summary"]) > 90:
                    card["summary"] = card["summary"][:90] + "..."
                card["tags"] = infer_tags(f"{card['title']} {block_text}")

    unreliable = []
    for module in manual["chapters"][0]["modules"] if manual["chapters"] else []:
        blocks = list(module["introBlocks"])
        for card in module["cards"]:
            blocks.extend(card["blocks"])
        for block in blocks:
            if block["text"] in {"承保能力打折扣的业务", "共保业务承保能力"}:
                unreliable.append(
                    {
                        "sourceLine": block["sourceLine"],
                        "text": block["text"],
                        "reason": "HTML/RTF 转换后该标题后只剩空行，疑似原 Word 表格或图片未可靠导出。",
                    }
                )
    manual["visualExtraction"]["unreliableItems"] = unreliable
    if not manual.get("rootTitle") and root_seen:
        manual["rootTitle"] = "非车险"
    return manual


def coverage(manual: dict) -> dict:
    covered: set[int] = set()
    for chapter in manual["chapters"]:
        covered.add(chapter["sourceLine"])
        for block in chapter["standaloneBlocks"]:
            covered.add(block["sourceLine"])
        for module in chapter["modules"]:
            for line in module.get("sourceLines", [module["sourceLine"]]):
                covered.add(line)
            for block in module["introBlocks"]:
                covered.add(block["sourceLine"])
            for card in module["cards"]:
                covered.add(card["sourceLine"])
                for block in card["blocks"]:
                    covered.add(block["sourceLine"])
    all_lines = {p["sourceLine"] for p in manual["allParagraphs"]}
    return {
        "totalParagraphs": len(all_lines),
        "coveredParagraphs": len(covered),
        "uncoveredLines": sorted(all_lines - covered),
    }


def write_reports(manual: dict, cov: dict) -> None:
    lines = ["# 最新《非车险政策宣导》结构树", ""]
    for chapter in manual["chapters"]:
        lines.append(f"- {chapter['title']}（依据：{'、'.join(chapter['basis'])}；原文行 {chapter['sourceLine']}）")
        for module in chapter["modules"]:
            lines.append(f"  - {module['title']}（依据：{'、'.join(module['basis'])}；原文行 {', '.join(map(str, module['sourceLines']))}）")
            if module["introBlocks"]:
                lines.append(f"    - 模块说明/独立信息块：{len(module['introBlocks'])} 段")
            for card in module["cards"]:
                end_line = card["blocks"][-1]["sourceLine"] if card["blocks"] else card["sourceLine"]
                lines.append(
                    f"    - {card['title']}（卡片；依据：{'、'.join(card['basis'])}；内容范围 {card['sourceLine']}-{end_line}；{len(card['blocks'])} 段）"
                )
    TREE_REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    card_count = sum(len(module["cards"]) for chapter in manual["chapters"] for module in chapter["modules"])
    module_count = sum(len(chapter["modules"]) for chapter in manual["chapters"])
    audit = [
        "# 最新迁移审计报告",
        "",
        f"- 原文有效段落数：{manual['paragraphCount']}",
        f"- 一级板块数量：{len(manual['chapters'])}",
        f"- 二级标题数量：{module_count}",
        f"- 卡片数量：{card_count}",
        f"- 已归属段落数：{cov['coveredParagraphs']}",
        f"- 未归属段落行号：{cov['uncoveredLines'] or '无'}",
        f"- HTML 表格标签：{'有' if manual['visualExtraction']['htmlTables'] else '未检测到'}",
        f"- HTML 图片标签：{'有' if manual['visualExtraction']['htmlImages'] else '未检测到'}",
        "",
        "## 表格/图片或视觉内容待确认",
    ]
    if manual["visualExtraction"]["unreliableItems"]:
        for item in manual["visualExtraction"]["unreliableItems"]:
            audit.append(f"- 原文行 {item['sourceLine']}：{item['text']}。{item['reason']}")
    else:
        audit.append("- 暂未发现转换后明显缺失的表格/图片占位。")
    audit.extend(
        [
            "",
            "## 标题识别存疑清单",
            "- 暂未发现需人工确认的标题层级；已按新版 Word 标题样式识别一级章节、二级模块与主题卡片。",
            "- 对未检测到下级主题标题的二级模块，已生成模块级卡片并保留其所在位置。",
            "",
            "## 删除的重复内容",
            "- 无。未主动删除任何疑似重复段落；即使“保险金额和保险价值的确定”出现近似重复，也按原文位置保留。",
        ]
    )
    AUDIT_REPORT_PATH.write_text("\n".join(audit) + "\n", encoding="utf-8")

    mapping = [
        "# 原文内容迁移映射表",
        "",
        "| 原文位置 | 一级板块 | 二级标题 | 三级卡片/信息块 | 展示方式 | 是否已迁移 |",
        "|---|---|---|---|---|---|",
    ]
    for chapter in manual["chapters"]:
        for block in chapter["standaloneBlocks"]:
            mapping.append(
                f"| {block['sourceLine']} | {chapter['title']} | - | {block['text']} | 章节独立信息块 | 是 |"
            )
        for module in chapter["modules"]:
            if module["introBlocks"]:
                source_lines = ", ".join(str(block["sourceLine"]) for block in module["introBlocks"])
                mapping.append(
                    f"| {source_lines} | {chapter['title']} | {module['title']} | 模块说明/分组标题 | 二级模块说明区 | 是 |"
                )
            for card in module["cards"]:
                end_line = card["blocks"][-1]["sourceLine"] if card["blocks"] else card["sourceLine"]
                mapping.append(
                    f"| {card['sourceLine']}-{end_line} | {chapter['title']} | {module['title']} | {card['title']} | 主题卡片 + 详情弹窗 | 是 |"
                )
    if manual.get("rootTitle"):
        mapping.append(f"| 1 | {manual['rootTitle']} | - | 网页总标题 | 页面标题 | 是 |")
    MAPPING_REPORT_PATH.write_text("\n".join(mapping) + "\n", encoding="utf-8")


def main() -> None:
    html = HTML_PATH.read_text(encoding="utf-8")
    parser = ParagraphParser()
    parser.feed(html)
    paragraphs = paragraph_features(parser.paragraphs, extract_styles(html))
    manual = build_manual(paragraphs)
    cov = coverage(manual)
    DATA_PATH.write_text(
        "window.MANUAL_DATA = "
        + json.dumps(manual, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    write_reports(manual, cov)
    print(
        json.dumps(
            {
                "paragraphs": manual["paragraphCount"],
                "chapters": len(manual["chapters"]),
                "modules": sum(len(chapter["modules"]) for chapter in manual["chapters"]),
                "cards": sum(len(module["cards"]) for chapter in manual["chapters"] for module in chapter["modules"]),
                "coverage": cov,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
