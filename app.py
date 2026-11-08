#!/usr/bin/env python3
"""IG Studio - a local web app on top of the ig-* Claude Code skills.

No API key: writing jobs are handed to the Claude Code command on this Mac,
which uses your existing Claude login. The checkers run the skills' own
Python scripts directly and cost nothing.

Run:  python3 app.py        then open http://127.0.0.1:8765
"""

import glob
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEMO = "--demo" in sys.argv                # fictional data, no Claude calls (see demo_seed.py)
HOST = "127.0.0.1"
PORT = int(os.environ.get("IG_STUDIO_PORT", "8766" if DEMO else "8765"))
HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
WORKSPACE = HERE / "workspace"          # Claude Code runs here
SKILLS = Path.home() / ".claude" / "skills"
IG_DATA = (HERE / "demo-data" / "instagram") if DEMO else (Path.home() / ".claude" / "instagram")
GEN_TIMEOUT = 600                         # seconds per writing job

# skill id -> what the request is, shown to Claude in the prompt
WRITERS = {
    "ig-reel": "Write a Reel: hook options, spoken script, on-screen text, timed beat sheet.",
    "ig-caption": "Write the Instagram caption for this post and lint it.",
    "ig-carousel": "Build a carousel: cover, slide-by-slide copy.",
    "ig-story": "Write today's Story sequence, frame by frame, with stickers.",
    "ig-dm": "Write the Instagram DM (and the follow-ups).",
    "ig-comment": "Write comments on this other person's post.",
    "ig-reply": "Triage and draft replies to these comments on my own post.",
    "ig-profile": "Score my profile out of 100 and rewrite what loses points.",
    "ig-plan": "Plan my week on Instagram.",
    "ig-repurpose": "Turn this long asset into a week of reels and carousels.",
    "ig-audit": "Audit what I have already posted: what worked, why, what to stop.",
    "ig-human": "Humanize this draft and show the before/after detection score.",
}

# checker id -> (script path, extra-args builder)
CHECKERS = {
    "hookscore": "ig-reel/hookscore.py",
    "beats": "ig-reel/beats.py",
    "caption": "ig-caption/caption.py",
    "humanize": "ig-human/humanize.py",
    "detect": "ig-human/detect.py",
    "swipe": "ig-viral/swipe.py",
}

ALLOWED_TOOLS = [
    "Skill", "Read", "Glob", "Grep", "Write", "Edit",
    "Bash(python3:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(mkdir:*)",
]


def find_claude():
    """The `claude` command: $CLAUDE_BIN, PATH, or the copy inside Claude.app."""
    env = os.environ.get("CLAUDE_BIN")
    if env and os.access(env, os.X_OK):
        return env
    for name in ("claude",):
        p = shutil.which(name)
        if p:
            return p
    for p in (Path.home() / ".local/bin/claude", Path.home() / ".claude/local/claude",
              Path("/opt/homebrew/bin/claude"), Path("/usr/local/bin/claude")):
        if os.access(p, os.X_OK):
            return str(p)
    pattern = str(Path.home() / "Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude")

    def ver(path):
        v = Path(path).parents[4].name
        return tuple(int(x) if x.isdigit() else 0 for x in v.split("."))

    found = sorted(glob.glob(pattern), key=ver, reverse=True)
    return found[0] if found else None


def child_env():
    # Drop variables that make the child think it is nested inside another session.
    return {k: v for k, v in os.environ.items()
            if not (k == "CLAUDECODE" or k.startswith("CLAUDE_CODE_"))}


# Skills whose results are numbers-heavy get an infographic. Claude adds a
# machine-readable block the page draws; the written report stays as well.
VIZ_SKILLS = {"ig-audit", "ig-profile"}
VIZ_SPEC = """
At the very end of your reply, add ONE fenced code block with the language tag igviz
containing valid JSON (no comments, no trailing commas) that summarises the result for an
infographic. Use only numbers you actually reported above. Keep every text field short
(labels under 32 characters, bodies under 160). Schema:
{
  "title": "headline in plain words",
  "subtitle": "account, date range or scope",
  "kpis": [{"label": "Median views", "value": "4,659", "note": "baseline",
            "delta": "+12% vs previous 30 days", "trend": "up"}],   // 2 to 4 tiles; delta/trend
                                                                       // (up|down|flat) only if you know it
  "reels": [{"title": "Comment Wipro", "date": "2026-10-12", "views": 201650, "multiple": 43.3,
             "non_follower_pct": 95, "sends_pct": 4.9, "saves_pct": null, "follows": 2800,
             "format": "comment-to-get", "group": "top"}],
             // audits only: EVERY reel you have numbers for (not just top/bottom), null for unknowns;
             // format = a short content type you identified (2 to 6 distinct values)
  "chart": {
    "title": "what the bars show",
    "unit": "x",                  // suffix shown after each value, e.g. "x" or " pts"
    "baseline": 1,                // optional reference line, e.g. 1 for 1x = normal
    "items": [{"label": "Comment Wipro", "value": 43.3, "max": null,
               "group": "top",      // top | bottom | mid
               "detail": "201,650 views · 95% non-follower · 2,800 follows"}]
  },
  "findings": [{"title": "short claim", "body": "one or two sentences", "confidence": "high"}],
  "do_more": ["..."], "stop": ["..."], "next": ["the single next action", "..."]
}
For a profile score: kpis include the total out of 100; chart items are the rubric parts with
"value" = points scored and "max" = points available, group top/mid/bottom by how they did.
For an audit: chart items are the top and bottom reels by outlier multiple, with baseline 1.
"""


def build_prompt(skill, text, extras):
    lines = [
        f"Use the /{skill} skill (its instructions are in ~/.claude/skills/{skill}/SKILL.md).",
        f"Task: {WRITERS[skill]}",
        "",
        "You are running inside a local app, so you cannot ask me follow-up questions in this turn.",
        "If something the skill normally asks for is missing, make sensible assumptions and list them",
        "in a short 'Assumptions' section at the end, plus what I should send you to improve it.",
        "Run the skill's own Python checkers where the skill says to, and include their scores.",
        "Do not use a browser, do not post or send anything.",
        "Reply with the finished deliverable in clean Markdown. No preamble about the steps you took.",
        "",
    ]
    for k, v in (extras or {}).items():
        if str(v).strip():
            lines.append(f"{k}: {v}")
    if skill in VIZ_SKILLS:
        lines.append(VIZ_SPEC)
    if skill == "ig-audit":
        lines.append(saved_reels_note())
    lines += ["", "My input:", text.strip()]
    return "\n".join(lines)


JOBS = {}
JOBS_LOCK = threading.Lock()


def describe_tool(block):
    """Turn one Claude Code tool call into a short, human progress line."""
    name, inp = block.get("name", ""), block.get("input") or {}
    base = lambda p: Path(str(p)).name if p else ""
    if name == "Skill":
        return f"Loading the {inp.get('skill') or inp.get('command') or 'skill'} playbook"
    if name == "Read":
        return f"Reading {base(inp.get('file_path'))}"
    if name in ("Write", "Edit"):
        return f"Writing {base(inp.get('file_path'))}"
    if name == "Bash":
        cmd = str(inp.get("command", ""))
        for tool in ("hookscore", "beats", "caption", "humanize", "detect", "swipe"):
            if tool + ".py" in cmd:
                return f"Running the {tool}.py checker"
        return "Running: " + (inp.get("description") or cmd)[:70]
    if name in ("Glob", "Grep"):
        return "Searching files"
    return f"Using {name}"


def _watch(job):
    """Read Claude Code's event stream and keep the job record up to date."""
    p = job["proc"]
    seen_msgs = set()
    for line in p.stdout:
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = ev.get("type")
        with JOBS_LOCK:
            if t == "system" and ev.get("subtype") == "init":
                job["steps"].append("Claude Code started")
                job["session_id"] = ev.get("session_id")
            elif t == "assistant":
                msg = ev.get("message") or {}
                mid, usage = msg.get("id"), msg.get("usage") or {}
                if mid and mid not in seen_msgs:
                    seen_msgs.add(mid)
                    job["live_out"] += usage.get("output_tokens", 0)
                    job["live_in"] += (usage.get("input_tokens", 0)
                                       + usage.get("cache_read_input_tokens", 0)
                                       + usage.get("cache_creation_input_tokens", 0))
                for b in msg.get("content") or []:
                    if b.get("type") == "tool_use":
                        job["steps"].append(describe_tool(b))
                    elif b.get("type") == "text" and b.get("text", "").strip():
                        if not job["steps"] or job["steps"][-1] != "Writing the answer":
                            job["steps"].append("Writing the answer")
            elif t == "result":
                job["final"] = ev
    p.wait()
    err = job["stderr_thread"]
    err.join(timeout=2)
    with JOBS_LOCK:
        if job["status"] == "cancelled":
            return
        ev = job.get("final") or {}
        job["session_id"] = ev.get("session_id") or job.get("session_id")
        u = ev.get("usage") or {}
        job["usage"] = {
            "input": u.get("input_tokens", 0),
            "cache_read": u.get("cache_read_input_tokens", 0),
            "cache_write": u.get("cache_creation_input_tokens", 0),
            "output": u.get("output_tokens", 0),
            "turns": ev.get("num_turns"),
            "cost_usd": ev.get("total_cost_usd"),
        } if ev else None
        if ev and not ev.get("is_error") and p.returncode == 0:
            job["status"], job["result"] = "done", ev.get("result", "")
            job["steps"].append("Done")
        else:
            job["status"] = "error"
            job["error"] = str(ev.get("result") or "".join(job["stderr"])
                               or "Claude Code stopped without an answer.")[-2000:]


DEMO_STEPS = ["Claude Code started", "Loading the {skill} playbook", "Reading voice.md",
              "Running the hookscore.py checker", "Writing the answer", "Running the beats.py checker",
              "Running the detect.py checker", "Writing the answer"]


def start_demo_job(prompt):
    """Demo mode: replay a canned run so the app can be tried with no tokens."""
    skill = next((s for s in WRITERS if f"/{s} skill" in prompt), "ig-reel")
    canned = HERE / "demo-data" / "canned" / f"{skill}.md"
    result = canned.read_text() if canned.exists() else (
        f"# Demo result\n\nIn demo mode the **{skill}** tab shows a sample answer. "
        "Run `python3 app.py` (without `--demo`) to use Claude Code for real.")
    job_id = uuid.uuid4().hex[:12]
    job = {"status": "running", "steps": ["Starting Claude Code"], "started": time.time(), "live_in": 0,
           "live_out": 0, "result": None, "error": None, "usage": None, "session_id": None,
           "proc": None, "demo": True}
    with JOBS_LOCK:
        JOBS[job_id] = job

    def play():
        for i, st in enumerate(DEMO_STEPS):
            time.sleep(1.4)
            with JOBS_LOCK:
                if job["status"] != "running":
                    return
                job["steps"].append(st.format(skill=skill))
                job["live_in"] += 21000 + 900 * i
                job["live_out"] += 260
        with JOBS_LOCK:
            job.update(status="done", result=result, steps=job["steps"] + ["Done"], usage={
                "input": 4200, "cache_read": 142000, "cache_write": 9800, "output": 2900,
                "turns": 9, "cost_usd": 0.142})
    threading.Thread(target=play, daemon=True).start()
    return {"job_id": job_id}


def start_job(prompt, session_id=None):
    if DEMO:
        return start_demo_job(prompt)
    exe = find_claude()
    if not exe:
        return {"error": "Could not find the Claude Code command. Open the Claude desktop app "
                         "once, or set CLAUDE_BIN to its path."}
    WORKSPACE.mkdir(exist_ok=True)
    IG_DATA.mkdir(parents=True, exist_ok=True)
    cmd = [exe, "-p", "--output-format", "stream-json", "--verbose",
           "--allowedTools", *ALLOWED_TOOLS,
           "--add-dir", str(SKILLS), "--add-dir", str(IG_DATA)]
    if session_id:
        cmd += ["--resume", session_id]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, bufsize=1, cwd=WORKSPACE, env=child_env(),
                         start_new_session=True)
    p.stdin.write(prompt)
    p.stdin.close()
    job_id = uuid.uuid4().hex[:12]
    job = {"proc": p, "status": "running", "steps": ["Starting Claude Code"], "started": time.time(),
           "live_in": 0, "live_out": 0, "stderr": [], "result": None, "error": None, "usage": None}
    job["stderr_thread"] = threading.Thread(target=lambda: job["stderr"].extend(p.stderr), daemon=True)
    job["stderr_thread"].start()
    with JOBS_LOCK:
        JOBS[job_id] = job
    threading.Thread(target=_watch, args=(job,), daemon=True).start()

    def timeout_guard():
        time.sleep(GEN_TIMEOUT)
        if job["status"] == "running":
            cancel_job(job_id, f"Stopped after {GEN_TIMEOUT // 60} minutes. Try a shorter input.")
    threading.Thread(target=timeout_guard, daemon=True).start()
    return {"job_id": job_id}


def cancel_job(job_id, reason="Cancelled."):
    job = JOBS.get(job_id)
    if not job or job["status"] != "running":
        return {"ok": False}
    with JOBS_LOCK:
        job["status"], job["error"] = "cancelled", reason
        job["steps"].append("Cancelled")
    if job.get("demo"):
        return {"ok": True}
    try:
        os.killpg(job["proc"].pid, signal.SIGTERM)   # stops Claude Code and anything it started
    except ProcessLookupError:
        pass
    def hard_kill():
        time.sleep(3)
        if job["proc"].poll() is None:
            try:
                os.killpg(job["proc"].pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
    threading.Thread(target=hard_kill, daemon=True).start()
    return {"ok": True}


def job_view(job_id, since=0):
    job = JOBS.get(job_id)
    if not job:
        return {"error": "That job is gone (the app was restarted)."}
    with JOBS_LOCK:
        return {"status": job["status"], "steps": job["steps"][since:], "n": len(job["steps"]),
                "elapsed": round(time.time() - job["started"], 1),
                "live": {"input": job["live_in"], "output": job["live_out"]},
                "result": job["result"], "error": job["error"], "usage": job["usage"],
                "session_id": job.get("session_id")}


def run_checker(tool, text, opts):
    script = SKILLS / CHECKERS[tool]
    if not script.exists():
        return {"error": f"{script} is missing. Is the ig-skills pack installed?"}
    args = [sys.executable, "-I", str(script), "-", "--json"]
    if tool == "beats" and opts.get("target"):
        args += ["--target", str(float(opts["target"]))]
    if tool == "caption" and opts.get("keywords"):
        args += ["--keywords", str(opts["keywords"])]
    if tool == "swipe":
        args += ["--hooks", str(SKILLS / "ig-reel/hooks.json")]
    try:
        p = subprocess.run(args, input=text, capture_output=True, text=True,
                           cwd=script.parent, timeout=60)
    except subprocess.TimeoutExpired:
        return {"error": "checker timed out"}
    if p.returncode != 0 and not p.stdout.strip():
        return {"error": (p.stderr or "checker failed").strip()[-1500:]}
    # Human-readable version too (same script, no --json).
    hargs = [a for a in args if a != "--json"] + (["--report"] if tool == "humanize" else [])
    human = subprocess.run(hargs, input=text, capture_output=True, text=True,
                           cwd=script.parent, timeout=60)
    try:
        data = json.loads(p.stdout)
    except json.JSONDecodeError:
        data = None
    # humanize prints the cleaned text on stdout and the change report on stderr
    shown = human.stderr if tool == "humanize" else human.stdout + human.stderr
    return {"json": data, "text": shown.strip(), "note": p.stderr.strip()}


VOICE_FILES = ("voice.md", "log.md", "swipe.md")

# ---- Local storage: every finished result, plus one merged reel database ----
RESULTS = HERE / ("demo-data" if DEMO else "data") / "results"
REELS_DB = IG_DATA / "reels.json"      # shared with Claude in chat, so the skills can reuse it


def save_result(skill, rec):
    RESULTS.mkdir(parents=True, exist_ok=True)
    rid = rec.get("id") or time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
    viz = rec.get("viz") or {}
    title = (viz.get("title") or next((l.lstrip("# ").strip() for l in rec.get("result", "").splitlines()
                                       if l.strip()), "") or skill)[:120]
    doc = {"id": rid, "skill": skill, "title": title, "created": rec.get("created") or time.strftime("%Y-%m-%d %H:%M"),
           "result": rec.get("result", ""), "session_id": rec.get("session_id"),
           "usage": rec.get("usage"), "elapsed": rec.get("elapsed"), "reels": rec.get("reels")}
    (RESULTS / f"{rid}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    if skill == "ig-audit" and viz.get("reels") and not rec.get("id"):
        merge_reels(viz["reels"], viz.get("subtitle", ""))
        doc["reels"] = load_reels()["reels"]          # snapshot of the full set at this audit
        (RESULTS / f"{rid}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    return rid


def list_results(skill=None):
    if not RESULTS.exists():
        return []
    out = []
    for f in sorted(RESULTS.glob("*.json"), reverse=True):
        try:
            d = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if not skill or d.get("skill") == skill:
            out.append({k: d.get(k) for k in ("id", "skill", "title", "created")})
    return out


def load_reels():
    try:
        return json.loads(REELS_DB.read_text())
    except (OSError, json.JSONDecodeError):
        return {"account": "", "updated": None, "reels": []}


def merge_reels(reels, account=""):
    """Upsert reels by title+date so repeated audits only ever add or refresh rows."""
    db = load_reels()
    key = lambda r: (str(r.get("title", "")).strip().lower(), str(r.get("date") or ""))
    by = {key(r): r for r in db["reels"]}
    for r in reels:
        if not r.get("title"):
            continue
        old = by.get(key(r), {})
        by[key(r)] = {**old, **{k: v for k, v in r.items() if v is not None}}
    db["reels"] = sorted(by.values(), key=lambda r: str(r.get("date") or ""))
    db["updated"] = time.strftime("%Y-%m-%d %H:%M")
    if account:
        db["account"] = account.split("·")[0].strip()
    IG_DATA.mkdir(parents=True, exist_ok=True)
    REELS_DB.write_text(json.dumps(db, ensure_ascii=False, indent=1))


def saved_reels_note():
    db = load_reels()
    if not db["reels"]:
        return ""
    last = max((str(r.get("date") or "") for r in db["reels"]), default="")
    return (f"\nSaved data: {REELS_DB} already holds {len(db['reels'])} reels from earlier audits"
            f"{' for ' + db['account'] if db['account'] else ''} (latest posted {last or 'unknown'}). "
            "Reuse it as your dataset: do not re-read old sessions or re-fetch any reel that is already "
            "in it. Only analyse reels from my input that are new or have newer numbers, then write the "
            "audit over the combined set. In the igviz block, list only the new or changed reels under "
            "\"reels\" (the app merges them into the saved file).\n")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        sys.stderr.write("  " + fmt % a + "\n")

    def send(self, code, body, ctype="application/json"):
        if not isinstance(body, (bytes, bytearray)):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/status":
            exe = find_claude()
            return self.send(200, {"claude": bool(exe) or DEMO, "claude_path": exe, "demo": DEMO,
                                   "skills": sorted(s for s in WRITERS if (SKILLS / s).exists()),
                                   "checkers": sorted(c for c, f in CHECKERS.items() if (SKILLS / f).exists())})
        if path == "/api/job":
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            return self.send(200, job_view(q.get("id", [""])[0], int(q.get("since", ["0"])[0] or 0)))
        if path in ("/api/history", "/api/result"):
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            if path == "/api/history":
                return self.send(200, list_results(q.get("skill", [None])[0]))
            rid = q.get("id", [""])[0]
            f = (RESULTS / f"{rid}.json").resolve()
            if RESULTS.resolve() not in f.parents or not f.exists():
                return self.send(404, {"error": "not found"})
            return self.send(200, json.loads(f.read_text()))
        if path == "/api/reels":
            return self.send(200, load_reels())
        if path == "/api/files":
            return self.send(200, {f: (IG_DATA / f).read_text() if (IG_DATA / f).exists() else ""
                                   for f in VOICE_FILES})
        rel = "index.html" if path in ("/", "") else path.lstrip("/")
        f = (STATIC / rel).resolve()
        if STATIC in f.parents and f.is_file():
            ctype = {".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                     ".svg": "image/svg+xml"}.get(f.suffix, "application/octet-stream")
            return self.send(200, f.read_bytes(), ctype + "; charset=utf-8")
        self.send(404, {"error": "not found"})

    def do_POST(self):
        # Only accept requests from this app's own page.
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
            return self.send(403, {"error": "forbidden"})
        try:
            b = self.body()
        except json.JSONDecodeError:
            return self.send(400, {"error": "bad json"})
        if self.path == "/api/generate":
            skill = b.get("skill")
            if b.get("session_id") and b.get("followup"):
                follow = b["followup"]
                if b.get("want_viz"):
                    follow = ("Do not redo the analysis. Using your previous answer and the data "
                              "you already have in this session (you may re-read saved data files, "
                              "but do not fetch anything new), reply with nothing but the "
                              "infographic block described here." + VIZ_SPEC)
                return self.send(200, start_job(follow, b["session_id"]))
            if skill not in WRITERS or not (b.get("text") or "").strip():
                return self.send(400, {"error": "pick a skill and type something"})
            return self.send(200, start_job(build_prompt(skill, b["text"], b.get("extras"))))
        if self.path == "/api/save":
            if b.get("skill") not in WRITERS or not b.get("rec", {}).get("result"):
                return self.send(400, {"error": "nothing to save"})
            rid = save_result(b["skill"], b["rec"])
            has_reels = b["skill"] == "ig-audit" and (b["rec"].get("viz") or {}).get("reels")
            return self.send(200, {"id": rid, "reels": load_reels()["reels"] if has_reels else None})
        if self.path == "/api/cancel":
            return self.send(200, cancel_job(b.get("job_id", "")))
        if self.path == "/api/check":
            tool = b.get("tool")
            if tool not in CHECKERS or not (b.get("text") or "").strip():
                return self.send(400, {"error": "pick a checker and paste some text"})
            return self.send(200, run_checker(tool, b["text"], b.get("options") or {}))
        if self.path == "/api/files":
            name = b.get("name")
            if name not in VOICE_FILES:
                return self.send(400, {"error": "unknown file"})
            IG_DATA.mkdir(parents=True, exist_ok=True)
            (IG_DATA / name).write_text(b.get("content", ""))
            return self.send(200, {"ok": True})
        self.send(404, {"error": "not found"})


def main():
    exe = find_claude()
    if DEMO and not (HERE / "demo-data" / "instagram" / "reels.json").exists():
        print("  Demo data missing. Run: python3 demo_seed.py")
    print(f"\n  IG Studio{' (DEMO: fictional data, no Claude calls)' if DEMO else ''}  ->  http://{HOST}:{PORT}")
    print(f"  Claude Code: {exe or 'NOT FOUND (writing tabs will not work)'}")
    print(f"  Skills:      {SKILLS}\n  Press Ctrl+C to stop.\n")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
