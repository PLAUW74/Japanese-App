"""Reads the topic and task syllabi out of the official HSK 3.0 exam syllabus PDF and
writes data/zh/topics.json and data/zh/tasks.json.

    python -E -P -X utf8 tools/build_zh_topics.py --pdf data-src/zh-pdf/syllabus.pdf --out data/zh

Optional, and the only part of the build that needs anything installed:

    pip install --user pymupdf

Everything else in data/zh/ comes from the published word lists (tools/build_zh_data.py),
which needs nothing. The word, character and grammar syllabi are in this PDF too, but the
lists are cleaner to read and agree with it, so only the topics and tasks are taken here.

The topic syllabus is a ruled three-column table whose first two columns merge across
several rows. Where a horizontal rule starts tells us what it closes: one drawn the full
width of the table ends a first-level topic, one starting at the second column ends a
second-level topic, and one only under the third column is an ordinary row break. That is
what makes the three levels recoverable; the text alone flattens into an unreadable stream.
"""

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    import pymupdf
except ImportError:  # the package was called fitz before version 1.24
    try:
        import fitz as pymupdf
    except ImportError:
        sys.exit("This step needs PyMuPDF:  pip install --user pymupdf")

# Document page 1 is the fourth page of the file.
OFFSET = 3
# Where each band's section starts, from the syllabus's own contents, and where the
# 7-9 section starts, which is what ends band 6. Bands 7-9 are beyond this study plan.
TOPIC_START = {1: 56, 2: 58, 3: 60, 4: 63, 5: 66, 6: 69}
TOPIC_END = 72
TASK_START = {1: 2, 2: 6, 3: 11, 4: 18, 5: 29, 6: 37}
TASK_END = 45

# Every page carries the publisher's name as a watermark, in pieces.
WATERMARK = {"汉考国际", "汉", "考", "国", "际"}
COLUMN_X = (135.5, 236.9)   # fallback only; each page's real columns are read off its rules
RULE_TOLERANCE = 3          # a rule starts a hair left of the column it closes
# The topic table repeats its header on every page, and some bands end with a count row.
TOPIC_HEADER = {"一级话题", "二级话题", "三级话题"}
TOPIC_COUNT = re.compile(r"^\d+个$")
TASK_HEADING = re.compile(r"^[一二三四五六七八九十]+、\s*(.+)$")
# Each can-do statement is introduced by a Wingdings arrow on a line of its own.
BULLET = ""


def page_of(doc, document_page):
    return doc[document_page + OFFSET - 1]


def horizontal_rules(page):
    """[(y, x0)] for each horizontal rule, so x0 says which columns it closes."""
    rules = {}
    for item in page.get_drawings():
        for op in item["items"]:
            if op[0] == "l" and abs(op[1].y - op[2].y) < 1:
                y, x0 = op[1].y, min(op[1].x, op[2].x)
            elif op[0] == "re" and op[1].height < 1:
                y, x0 = op[1].y0, op[1].x0
            else:
                continue
            key = round(y, 1)
            rules[key] = min(rules.get(key, x0), x0)
    return sorted(rules.items())


def column_edges(page):
    """Where the second and third columns begin on this page.

    The table is not laid out identically throughout — band 2's pages put the columns a few
    points to the left of band 1's — so taking the hardcoded positions would misread which
    column a rule closes, and with it the whole hierarchy.
    """
    xs = set()
    for item in page.get_drawings():
        for op in item["items"]:
            if op[0] == "l" and abs(op[1].x - op[2].x) < 1:
                xs.add(round(op[1].x, 1))
            elif op[0] == "re" and op[1].width < 1:
                xs.add(round(op[1].x0, 1))
    ordered = sorted(xs)
    return (ordered[1], ordered[2]) if len(ordered) >= 4 else COLUMN_X


def cells(page, edges):
    """[(column, y_centre, text)] for the words on the page, watermark removed."""
    out = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        text = word.strip()
        if not text or text in WATERMARK or text.isdigit():
            continue
        # The header repeats on every page and would otherwise be swept into the first
        # merged cell below it, as would a band's closing "N个" count.
        if text in TOPIC_HEADER or TOPIC_COUNT.match(text):
            continue
        centre = (x0 + x1) / 2
        column = 0 if centre < edges[0] else (1 if centre < edges[1] else 2)
        out.append((column, (y0 + y1) / 2, text))
    return out


def spans(rules, closes_at):
    """The y ranges of one column's cells: a new one starts after each rule that closes it.

    The table's own top and bottom always bound a cell, even when no rule inside closes
    it — a first-level topic can fill a whole page and carry on to the next, in which case
    the only full-width rules on that page are the two around the header.
    """
    closing = {y for y, x0 in rules if x0 <= closes_at}
    bounds = sorted(closing | {rules[0][0], rules[-1][0]})
    return list(zip(bounds, bounds[1:]))


def text_in(items, column, top, bottom):
    inside = [t for c, y, t in items if c == column and top < y < bottom]
    return "".join(inside).strip()


def carry_labels(rows):
    """A topic cell split by a page break leaves the second half unlabelled, so carry the
    last label forward. A second-level label only carries within its parent."""
    one = two = ""
    for row in rows:
        if row[1] and row[1] != one:
            one, two = row[1], ""
        row[1] = row[1] or one
        if row[2]:
            two = row[2]
        else:
            row[2] = two
    return rows


def read_topics(doc, log):
    rows = []
    for band, start in TOPIC_START.items():
        end = (TOPIC_START.get(band + 1) or TOPIC_END) - 1
        before = len(rows)
        band_rows = []
        for number in range(start, end + 1):
            page = page_of(doc, number)
            rules = horizontal_rules(page)
            if len(rules) < 2:
                continue
            edges = column_edges(page)
            items = cells(page, edges)
            # A rule drawn from the left edge ends a first-level topic; one from the second
            # column ends a second-level topic; the rest are ordinary row breaks.
            level1 = spans(rules, edges[0] - RULE_TOLERANCE)
            level2 = spans(rules, edges[1] - RULE_TOLERANCE)
            leaves = spans(rules, float("inf"))
            for top, bottom in leaves:
                leaf = text_in(items, 2, top, bottom)
                if not leaf:
                    continue
                middle = (top + bottom) / 2
                one = next((text_in(items, 0, a, b) for a, b in level1 if a < middle < b), "")
                two = next((text_in(items, 1, a, b) for a, b in level2 if a < middle < b), "")
                band_rows.append([band, one, two, leaf])
        # Carried within the band: the first row of a band starts a fresh hierarchy.
        rows.extend(carry_labels(band_rows))
        log.append(f"  band {band}: {len(rows) - before} topics (pages {start}-{end})")
    return rows


def read_tasks(doc, log):
    """Each band's section is a run of numbered tasks, each with its can-do statements.

    Read line by line: a statement is introduced by a bullet on a line of its own and then
    wraps over as many lines as it needs, and a heading often shares a block with the line
    above it, so splitting on blank lines would lose it.
    """
    rows = []
    for band, start in TASK_START.items():
        end = (TASK_START.get(band + 1) or TASK_END) - 1
        before = len(rows)
        tasks = []            # [title, [can-do]]
        statement = []

        def end_statement():
            body = re.sub(r"\s+", "", "".join(statement))
            statement.clear()
            if body and tasks:
                tasks[-1][1].append(body)

        for number in range(start, end + 1):
            for raw in page_of(doc, number).get_text().splitlines():
                line = raw.strip()
                if not line or line in WATERMARK or line.isdigit() or line.startswith("HSK（"):
                    continue
                if line.startswith(BULLET):
                    end_statement()
                    line = line[len(BULLET):].strip()
                    if not line:
                        continue
                heading = TASK_HEADING.match(line)
                if heading:
                    end_statement()
                    tasks.append([heading.group(1), []])
                else:
                    statement.append(line)
        end_statement()

        for n, (title, can_do) in enumerate(tasks, 1):
            if can_do:
                rows.append([band, f"t{band}-{n}", title, can_do])
        log.append(f"  band {band}: {len(rows) - before} tasks (pages {start}-{end})")
    return rows


def write_json(path, head, rows_key, rows):
    parts = [json.dumps(head, ensure_ascii=False)[:-1], f', "{rows_key}":[\n']
    parts.append(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows))
    parts.append("\n]}\n")
    path.write_text("".join(parts), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf.resolve())

    log = [f"Read {doc.page_count} pages of {args.pdf.name}", "", "TOPICS"]
    topics = read_topics(doc, log)
    log.append("")
    log.append("TASKS")
    tasks = read_tasks(doc, log)

    source = "HSK 3.0 exam syllabus (中文水平考试 HSK 考试大纲, CLEC, 2025-11)"
    write_json(out / "topics.json", {
        "date": date.today().isoformat(), "source": source,
        # [band, level 1, level 2, level 3]
    }, "topics", topics)
    write_json(out / "tasks.json", {
        "date": date.today().isoformat(), "source": source,
        # [band, id, task, [can-do statement]]
    }, "tasks", tasks)

    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(log))
    print(f"\nWrote {len(topics)} topics and {len(tasks)} tasks to {out}")


if __name__ == "__main__":
    main()
