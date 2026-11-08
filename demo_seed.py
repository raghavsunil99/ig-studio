#!/usr/bin/env python3
"""Create fictional demo data for IG Studio (used for screenshots and trying the app).

    python3 demo_seed.py      # writes demo-data/
    python3 app.py --demo     # http://127.0.0.1:8766, no Claude calls, no tokens

Everything here is made up: the account, the reels and the numbers.
"""

import json
import random
import shutil
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "demo-data"
ACCOUNT = "@pixel.and.python"
rng = random.Random(7)

# (title, format, rough multiple)
REELS = [
    ("Comment PYTHON for my roadmap", "comment-to-get", 21.0),
    ("Free resume template, comment CV", "comment-to-get", 34.0),
    ("Interns at Big Tech earn this", "career money", 9.2),
    ("I failed 11 interviews first", "story", 4.1),
    ("Comment SQL for 50 questions", "comment-to-get", 16.5),
    ("What a data analyst really does", "career money", 2.4),
    ("Day in my life as a dev", "story", 1.3),
    ("Laptop under 50k for coding", "gear", 1.6),
    ("How Wi-Fi actually works", "tech trivia", 0.58),
    ("Why ships float", "tech trivia", 0.52),
    ("How UPI works in 30 seconds", "tech trivia", 0.66),
    ("Why your phone gets hot", "tech trivia", 0.61),
    ("JavaScript closures in 45s", "tutorial", 0.82),
    ("CSS grid vs flexbox", "tutorial", 0.78),
    ("Git rebase explained", "tutorial", 0.74),
    ("Python list comprehension", "tutorial", 0.91),
    ("React useEffect mistakes", "tutorial", 0.86),
    ("SQL joins with a pizza", "tutorial", 1.1),
    ("AI will not take your job if", "opinion", 1.9),
    ("Stop watching tutorials", "opinion", 2.8),
    ("ChatGPT wrote my portfolio", "opinion", 1.2),
    ("New AI model launched today", "news", 0.95),
    ("Big layoffs: what it means", "news", 1.05),
    ("Robot dog delivers food", "news", 0.7),
    ("My first salary breakdown", "career money", 3.3),
    ("5 sites to learn for free", "list", 1.4),
    ("3 VS Code extensions I use", "list", 1.0),
    ("Keyboard shortcuts that save hours", "list", 0.97),
    ("Comment AI for 20 prompts", "comment-to-get", 1.4),
    ("Office tour in Bengaluru", "story", 0.88),
]
MEDIAN = 5200


def reels():
    start = date(2026, 9, 8)
    out = []
    order = list(range(len(REELS)))
    rng.shuffle(order)
    for n, idx in enumerate(order):
        title, fmt, m = REELS[idx]
        views = int(MEDIAN * m * rng.uniform(0.95, 1.05))
        mult = round(views / MEDIAN, 2)
        spread = mult >= 1.5
        out.append({
            "title": title,
            "date": (start + timedelta(days=round(n * 1.9))).isoformat(),
            "views": views,
            "multiple": mult,
            "non_follower_pct": round(rng.uniform(78, 94) if mult > 8 else rng.uniform(48, 70) if spread else rng.uniform(20, 34)),
            "sends_pct": round(rng.uniform(2.5, 5.2) if mult > 8 else rng.uniform(0.4, 1.6) if spread else rng.uniform(0.0, 0.3), 2),
            "saves_pct": round(rng.uniform(1.5, 4) if fmt in ("tutorial", "list", "comment-to-get") else rng.uniform(0.1, 0.8), 2),
            "follows": int(views * rng.uniform(0.012, 0.02)) if mult > 8 else int(views * rng.uniform(0.0005, 0.002)),
            "format": fmt,
            "group": "top" if mult >= 1.5 else "bottom" if mult < 0.8 else "mid",
        })
    return sorted(out, key=lambda r: r["date"])


def audit_md(rs):
    top = sorted(rs, key=lambda r: -r["multiple"])[:5]
    bottom = sorted(rs, key=lambda r: r["multiple"])[:5]
    line = lambda r: f"| {r['title']} | {r['views']:,} | {r['multiple']}x | {r['non_follower_pct']}% | {r['follows']:,} |"
    viz = {
        "title": "Comment-to-get reels carry the account",
        "subtitle": f"{ACCOUNT} · {len(rs)} reels · Sep 8 to Nov 2, 2026",
        "kpis": [
            {"label": "Median views", "value": f"{MEDIAN:,}", "note": "your normal (1x)", "delta": "+18% vs previous 30 reels", "trend": "up"},
            {"label": "Best reel", "value": f"{top[0]['multiple']}x", "note": top[0]["title"]},
            {"label": "Follows from top 3", "value": f"{sum(r['follows'] for r in top[:3]):,}", "note": "comment-to-get reels"},
            {"label": "Tech trivia average", "value": "0.59x", "note": "4 of the bottom 5", "delta": "-0.2x vs August", "trend": "down"},
        ],
        "reels": rs,
        "findings": [
            {"title": "Broad rewards win", "body": "Comment-to-get reels with a reward almost everyone wants (resume template, roadmap) ran 16x to 34x with 80%+ non-follower reach.", "confidence": "high"},
            {"title": "The reward matters, not the mechanic", "body": "'Comment AI for 20 prompts' used the same ask and got 1.4x. A narrow reward reaches a narrow audience.", "confidence": "medium"},
            {"title": "Tech trivia is the bottom five", "body": "'How X works' reels sit at 0.5x to 0.7x with about 25% non-follower reach and almost no follows.", "confidence": "high"},
            {"title": "Tutorials keep followers, not growth", "body": "Tutorials hold near 0.8x to 1.1x with strong saves. Good for retention, better as carousels.", "confidence": "medium"},
            {"title": "Career-money stories travel", "body": "Salary and intern-pay reels hit 2x to 9x. Money plus a career is the second-best theme.", "confidence": "medium"},
        ],
        "do_more": ["One comment-to-get reel a week with a broad reward", "Career and salary stories with real numbers", "Turn tutorials into carousels"],
        "stop": ["'How does X work' tech trivia", "News that isn't about jobs or careers"],
        "next": ["Post the 'free mock interview' comment reel on Monday", "Send retention graphs for the top and bottom reel", "Re-run the audit in two weeks"],
    }
    return f"""# Comment-to-get reels carry the account

**{ACCOUNT}, {len(rs)} reels from Sep 8 to Nov 2, 2026. Median views {MEDIAN:,}.** Multiples are views divided by that median.

## Top 5

| reel | views | vs normal | non-followers | follows |
|---|---|---|---|---|
{chr(10).join(line(r) for r in top)}

## Bottom 5

| reel | views | vs normal | non-followers | follows |
|---|---|---|---|---|
{chr(10).join(line(r) for r in bottom)}

## What the data says

1. **Broad rewards win.** The resume template and roadmap reels ran 16x to 34x, with most of their reach from non-followers and the bulk of the account's new follows.
2. **The reward matters, not the mechanic.** "Comment AI for 20 prompts" used the same ask and got 1.4x.
3. **Tech trivia is the bottom five.** "How X works" reels sit at 0.5x to 0.7x and win almost no follows.
4. **Tutorials keep followers, not growth.** Strong saves, flat reach. Move them to carousels.

**STOP:** tech trivia, and news that isn't about careers.
**DO MORE:** one comment-to-get reel a week with a broad reward.

*Demo data: the account and every number here are fictional.*

```igviz
{json.dumps(viz, indent=1)}
```
"""


def profile_md():
    parts = [("Name field", 9, 12, "top"), ("Bio first line", 6, 12, "bottom"), ("Bio body", 6, 8, "mid"),
             ("Pinned three", 4, 10, "bottom"), ("Link", 7, 8, "top"), ("Highlights", 5, 8, "mid"),
             ("Grid legibility", 7, 8, "top"), ("Photo", 6, 6, "top"), ("Handle", 5, 6, "top"),
             ("Category & contact", 6, 6, "top"), ("Recent activity", 9, 10, "top"), ("Story presence", 3, 6, "bottom")]
    total = sum(p[1] for p in parts)
    viz = {
        "title": f"Profile score {total}/100: fix the first line and the pins",
        "subtitle": f"{ACCOUNT} · 12-part rubric",
        "kpis": [{"label": "Profile score", "value": f"{total}/100", "note": "good, not great"},
                 {"label": "Points to win", "value": str(100 - total), "note": "most in bio + pinned"},
                 {"label": "Strongest", "value": "Photo, handle", "note": "full marks"}],
        "chart": {"title": "Points by rubric part", "unit": " pts",
                  "items": [{"label": l, "value": v, "max": m, "group": g, "detail": f"{v} of {m} points"} for l, v, m, g in parts]},
        "findings": [{"title": "Line one doesn't say who it's for", "body": "'Dev | Creator | Chai lover' tells a new visitor nothing. Try: 'Helping freshers get their first tech job'.", "confidence": "high"},
                     {"title": "Pinned posts are old", "body": "Pin the resume-template reel, the salary breakdown and one tutorial carousel.", "confidence": "high"}],
        "do_more": ["Pin your three best proof posts"], "stop": ["Emoji-only highlight names"],
        "next": ["Rewrite bio line one", "Re-pin the top three"],
    }
    return f"# Profile score: {total}/100\n\nDemo result.\n\n```igviz\n{json.dumps(viz, indent=1)}\n```\n"


REEL_MD = """# Reel: "Stop sending your resume as a Word file"

## Hook options (scored with hookscore.py)

| # | hook | score |
|---|---|---|
| 1 | **Stop sending your resume as a Word file.** | 81.4 STRONG |
| 2 | Recruiters open your resume for 6 seconds. Here's what they see. | 53.4 OK |
| 3 | I reviewed 200 fresher resumes last month. | 51.8 OK |

## Script (30s)

| time | beat | line |
|---|---|---|
| 0:00 | HOOK | Stop sending your resume as a Word file. |
| 0:03 | 1 | Recruiters open it for 6 seconds, often on a phone. Word files break there. |
| 0:10 | 2 | The top third decides it: your name, the role you want, one number you're proud of. |
| 0:18 | 3 | Name the file properly. "resume_final_v3.docx" says you're not sure. |
| 0:24 | ASK | Comment CV and I'll send you the template I use. |

## On-screen text

- 0:00 "Word file? ❌"
- 0:10 "Name · Role · One number"
- 0:18 "PDF. Always."

*Demo result: fictional.*
"""


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "instagram").mkdir(parents=True)
    (OUT / "results").mkdir()
    (OUT / "canned").mkdir()
    rs = reels()
    (OUT / "instagram" / "reels.json").write_text(json.dumps(
        {"account": ACCOUNT, "updated": "2026-11-08 18:30", "reels": rs}, indent=1))
    (OUT / "instagram" / "voice.md").write_text(
        "# Voice\n\nTalks like a senior friend to college students. Short sentences, Hinglish words are fine.\n"
        "Never says: 'game-changer', 'delve', 'unlock'.\n")
    audit = audit_md(rs)
    docs = {
        "ig-audit": ("20261108-183000-demo01", "2026-11-08 18:30", "Comment-to-get reels carry the account", audit),
        "ig-profile": ("20261107-120000-demo02", "2026-11-07 12:00", "Profile score 73/100", profile_md()),
        "ig-reel": ("20261106-090000-demo03", "2026-11-06 09:00", "Reel: Stop sending your resume as a Word file", REEL_MD),
    }
    for skill, (rid, created, title, md) in docs.items():
        doc = {"id": rid, "skill": skill, "title": title, "created": created, "result": md, "session_id": None,
               "usage": {"input": 4200, "cache_read": 142000, "cache_write": 9800, "output": 2900, "turns": 9, "cost_usd": 0.142},
               "elapsed": 84, "reels": rs if skill == "ig-audit" else None}
        (OUT / "results" / f"{rid}.json").write_text(json.dumps(doc, indent=1))
        (OUT / "canned" / f"{skill}.md").write_text(md)
    print(f"Demo data written to {OUT} ({len(rs)} fictional reels). Start with: python3 app.py --demo")


if __name__ == "__main__":
    main()
