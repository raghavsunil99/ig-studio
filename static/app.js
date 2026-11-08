// IG Studio front end. Writing tabs go to Claude Code via /api/generate;
// checker tabs run the skills' Python scripts via /api/check.

const WRITE = [
  { id: "ig-reel", name: "Reel script", blurb: "Raw idea in, hook options, spoken script, on-screen text and a timed beat sheet out.",
    label: "Your idea", ph: "e.g. Why I stopped offering free discovery calls, and what I do instead",
    extras: [{ k: "Target length (seconds)", type: "select", opts: ["30", "15", "45", "60", "90"] },
             { k: "Who it is for", ph: "e.g. freelance designers" }] },
  { id: "ig-caption", name: "Caption", blurb: "The line that survives the “… more” cut, the body, one ask, search terms, three hashtags.",
    label: "What the post is (or paste the reel script)", ph: "Paste the script or describe the post…",
    extras: [{ k: "Search terms to be found for", ph: "comma separated" },
             { k: "Post type", type: "select", opts: ["Reel", "Carousel", "Single image"] }] },
  { id: "ig-carousel", name: "Carousel", blurb: "A cover that earns the swipe and slide-by-slide copy for 1080×1350.",
    label: "The idea, list or steps", ph: "e.g. 7 things I check before sending a proposal" },
  { id: "ig-story", name: "Stories", blurb: "Today's frame-by-frame story sequence, the stickers, and the one that moves people to DMs.",
    label: "What happened today / what you want to push", ph: "e.g. Finished a client rebrand, want to fill 2 slots for December" },
  { id: "ig-dm", name: "DM", blurb: "Keyword delivery, the first message to someone who engaged, collab pitches, follow-ups.",
    label: "Who it's to and the context", ph: "e.g. @someone commented GUIDE on my reel about pricing",
    extras: [{ k: "Kind of DM", type: "select", opts: ["Reply to someone who engaged", "Warm approach", "Collab or brand pitch", "Follow-up"] }] },
  { id: "ig-comment", name: "Comment on others", blurb: "Comments on other people's posts that read like a person with an opinion.",
    label: "Paste their post or reel text (with the account name)", ph: "@account: caption / what the reel says…" },
  { id: "ig-reply", name: "Reply to my comments", blurb: "Sorts your comments by which are worth answering, then drafts the replies.",
    label: "Paste the comments (with handles)", ph: "@anna: how much do you charge?\n@ben: this is wrong because…" },
  { id: "ig-profile", name: "Profile score", blurb: "Scores your profile out of 100 on a 12-part rubric and rewrites what loses points.",
    label: "Your profile", ph: "Name field:\nHandle:\nBio:\nLink goes to:\nHighlights:\nPinned posts:\nFirst 9 grid covers:" },
  { id: "ig-plan", name: "Weekly plan", blurb: "What to post this week, which format, when, and who to engage with.",
    label: "What you sell, your themes, and what happened this week", ph: "I sell…\nThemes:\nThis week:\nAccounts I want to be seen by:" },
  { id: "ig-repurpose", name: "Repurpose", blurb: "One long asset (video, podcast, newsletter, call) into a week of reels and carousels.",
    label: "Paste the transcript or article", ph: "Paste the whole thing…" },
  { id: "ig-audit", name: "Audit my posts", blurb: "What worked, why, and what to stop making, from your own numbers.",
    label: "Paste your recent posts with their stats", ph: "Post / hook — views, reach, saves, shares, follows…" },
  { id: "ig-human", name: "Humanize (with Claude)", blurb: "Rewrites a draft so it sounds like you, with a before/after detection score.",
    label: "Your draft", ph: "Paste any caption, script, DM…" },
];

const CHECK = [
  { id: "hookscore", name: "Hook scorer", blurb: "Ranks hook lines on five properties. One hook per line.",
    label: "Hook options (one per line)", ph: "I lost 3 clients last month and here's what I changed\nStop sending proposals as PDFs" },
  { id: "beats", name: "Beat sheet", blurb: "Times a spoken script into beats and flags what runs long.",
    label: "Your script", ph: "Paste the spoken script…", opts: [{ k: "target", label: "Target length (seconds)", ph: "30" }] },
  { id: "caption", name: "Caption check", blurb: "Shows what the feed shows before “… more” and lints the caption.",
    label: "Your caption", ph: "Paste the caption…", opts: [{ k: "keywords", label: "Search terms", ph: "comma separated" }] },
  { id: "humanize", name: "Strip AI tells", blurb: "Removes em dashes, stock AI words and invisible characters. Shows what changed.",
    label: "Your text", ph: "Paste any draft…" },
  { id: "detect", name: "AI detector", blurb: "Scores how machine-written a draft looks on five checks.",
    label: "Your text", ph: "Paste any draft…" },
  { id: "swipe", name: "Viral ranker", blurb: "Ranks reels you collected by how far they beat their own account. Tab-separated, with a header row.",
    label: "Reels (tab-separated: account, followers, median, views, hook)",
    ph: "account\tfollowers\tmedian\tviews\thook\n@someone\t48000\t11000\t412000\tnobody tells you your first 30 flop" },
];

const DASH = { id: "dash", name: "Dashboard", blurb: "Your saved reel data and latest audit insights. Opens instantly and uses no tokens." };
const VOICE = { id: "voice", name: "My voice & log", blurb: "The files every writing skill reads, so drafts sound like you and don't repeat themes." };

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = (s) => (window.marked && window.DOMPurify)
  ? DOMPurify.sanitize(marked.parse(s)) : `<pre class="pre">${esc(s)}</pre>`;
const store = {
  get(k) { try { return localStorage.getItem("igs:" + k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem("igs:" + k, v); } catch {} },
};
let claudeOK = false;

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  return r.json();
}

function nav(current) {
  const btn = (t) => `<button data-id="${t.id}" data-tip="${esc(t.blurb)}" aria-label="${esc(t.name + ": " + t.blurb)}" class="${t.id === current ? "on" : ""}">${esc(t.name)}</button>`;
  $("#nav").innerHTML =
    `<h3>Your account</h3>${btn(DASH)}` +
    `<h3>Write with Claude</h3>${WRITE.map(btn).join("")}` +
    `<h3>Free checkers</h3>${CHECK.map(btn).join("")}` +
    `<h3>Setup</h3>${btn(VOICE)}`;
  $("#nav").querySelectorAll("button").forEach((b) => {
    b.onclick = () => { hideTip(); open(b.dataset.id); };
    b.onmouseenter = b.onfocus = () => showTip(b);
    b.onmouseleave = b.onblur = hideTip;
  });
}

// One floating tooltip, positioned beside the hovered nav item so the
// scrolling sidebar can't clip it.
const tip = Object.assign(document.createElement("div"), { className: "tip-pop", role: "tooltip" });
document.body.appendChild(tip);
function showTip(b, place) {
  tip.textContent = b.dataset.tip;
  tip.classList.add("show");
  const r = b.getBoundingClientRect(), narrow = window.innerWidth < 760;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = narrow ? r.left : r.right + 10, y = narrow ? r.bottom + 6 : r.top + r.height / 2 - h / 2;
  if (place === "above") { x = r.left + r.width / 2 - w / 2; y = r.top - h - 6; }
  x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip() { tip.classList.remove("show"); }

function open(id) {
  store.set("tab", id);
  nav(id);
  $("#out").hidden = true; $("#out").innerHTML = "";
  const w = WRITE.find((t) => t.id === id), c = CHECK.find((t) => t.id === id);
  const t = w || c || (id === "dash" ? DASH : VOICE);
  $("#title").textContent = t.name;
  $("#blurb").textContent = t.blurb;
  $("#badge").textContent = w ? "Uses Claude Code" : c ? "Free · runs instantly" : id === "dash" ? "Instant · no tokens" : "Saved on this Mac";
  $("#badge").className = "badge" + (w ? " ai" : "");
  if (w) return writeForm(w);
  if (c) return checkForm(c);
  if (id === "dash") return dashboard();
  voiceForm();
}

function field(e, i) {
  if (e.type === "select")
    return `<div><label>${esc(e.k)}</label><select data-x="${i}">${e.opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`;
  return `<div><label>${esc(e.k)} <span class="hint">(optional)</span></label><input data-x="${i}" placeholder="${esc(e.ph || "")}"></div>`;
}

function writeForm(t) {
  const extras = t.extras || [];
  $("#form").innerHTML = `
    <label for="txt">${esc(t.label)}</label>
    <textarea id="txt" placeholder="${esc(t.ph)}"></textarea>
    ${extras.length ? `<div class="row">${extras.map(field).join("")}</div>` : ""}
    <div class="actions">
      <button class="btn" id="go" ${claudeOK ? "" : "disabled"}>Generate</button>
      <span class="tip">Takes about 1 to 3 minutes. Counts toward your normal Claude usage.</span>
      <select id="saved" class="saved-pick" hidden aria-label="Open a saved result"></select>
    </div>`;
  savedPicker(t);
  const ta = $("#txt");
  ta.value = store.get("draft:" + t.id);
  ta.oninput = () => store.set("draft:" + t.id, ta.value);
  try { const last = JSON.parse(store.get("last:" + t.id)); if (last && last.result) renderResult(t, last); } catch {}
  $("#go").onclick = async () => {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    const ex = {};
    extras.forEach((e, i) => ex[e.k] = $(`[data-x="${i}"]`).value);
    await generate({ skill: t.id, text, extras: ex }, t);
  };
}

const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n || 0);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function usageLine(u, secs) {
  if (!u) return "";
  const total = u.input + u.cache_read + u.cache_write + u.output;
  const cost = u.cost_usd != null ? ` · API-equivalent $${u.cost_usd.toFixed(3)} <span class="hint">(not charged on Pro)</span>` : "";
  return `<div class="usage"><strong>${fmtK(total)} tokens</strong> ·
    ${fmtK(u.input + u.cache_write)} new input · ${fmtK(u.cache_read)} from cache · ${fmtK(u.output)} written
    · ${u.turns ?? "?"} steps · ${fmtT(secs)}${cost}<br><span class="hint">${todayLine()}</span></div>`;
}

function addToToday(u) {
  if (!u) return;
  const day = new Date().toISOString().slice(0, 10);
  let d; try { d = JSON.parse(store.get("usage")); } catch {}
  if (!d || d.day !== day) d = { day, jobs: 0, tokens: 0, out: 0 };
  d.jobs++; d.tokens += u.input + u.cache_read + u.cache_write + u.output; d.out += u.output;
  store.set("usage", JSON.stringify(d));
}
function todayLine() {
  let d; try { d = JSON.parse(store.get("usage")); } catch {}
  if (!d || d.day !== new Date().toISOString().slice(0, 10)) return "";
  return `Today in IG Studio: ${d.jobs} job${d.jobs === 1 ? "" : "s"}, ${fmtK(d.tokens)} tokens (${fmtK(d.out)} written).`;
}

// ---- Infographic -----------------------------------------------------------
const VIZ_SKILLS = new Set(["ig-audit", "ig-profile"]);

function splitViz(text) {
  const m = text.match(/```igviz\s*([\s\S]*?)```/);
  if (!m) return { text, viz: null };
  let viz = null;
  const raw = m[1].split("\n").map((l) => l.replace(/\s+\/\/[^"\n]*$/, "")).join("\n");
  try { viz = JSON.parse(raw); } catch { try { viz = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")); } catch {} }
  return { text: text.replace(m[0], "").trim(), viz };
}

// ---- Analytics view (Studio-style) ------------------------------------------
const nf = (n) => n == null || isNaN(n) ? "–" : Number(n).toLocaleString();
const pct = (n) => n == null || isNaN(n) ? "–" : (+n).toFixed(n < 1 && n > 0 ? 2 : 1).replace(/\.0$/, "") + "%";
const mult = (n) => n == null ? "–" : (n >= 10 ? (+n).toFixed(1) : (+n).toFixed(2)).replace(/0$/, "") + "x";
const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const GROUP_NAMES = { top: "Above normal", mid: "Around normal", bottom: "Below normal" };
const ARROW = { up: "▲", down: "▼", flat: "■" };

// Scale helper: log when the range is huge, so small values stay visible.
function scaler(values, extra) {
  const v = values.filter((x) => x > 0), top = Math.max(...v, extra || 0) || 1;
  const lo = Math.min(...v, extra || Infinity), useLog = v.length > 1 && top / lo > 20, floor = lo / 4;
  return { useLog, f: (x) => !(x > 0) ? 0 : useLog ? 100 * Math.log(x / floor) / Math.log(top / floor) : 100 * x / top };
}

function kpiCards(kpis) {
  return (kpis || []).slice(0, 4).map((k) => `
    <div class="kpi">
      <div class="kpi-l">${esc(k.label)}</div>
      <div class="kpi-v">${esc(k.value)}</div>
      ${k.delta ? `<div class="kpi-d t-${esc(k.trend || "flat")}"><span aria-hidden="true">${ARROW[k.trend] || ""}</span> ${esc(k.delta)}</div>` : ""}
      ${k.note ? `<div class="kpi-n">${esc(k.note)}</div>` : ""}
    </div>`).join("");
}

function barList(items, unit, baseline, title, legend) {
  const s = scaler(items.map((i) => i.value), baseline);
  const base = baseline ? s.f(baseline) : null;
  const groups = [...new Set(items.map((i) => i.group || "mid"))];
  return `<div class="ig-card">
    <div class="ig-card-h"><h3>${esc(title)}</h3>
      ${legend && groups.length > 1 ? `<div class="legend">${groups.map((g) => `<span><i class="sw g-${g}"></i>${legend[g] || g}</span>`).join("")}</div>` : ""}</div>
    <div class="bars">${items.map((i) => {
      const shown = i.shown || (i.value + unit + (i.max ? ` / ${i.max}${unit}` : ""));
      const w = i.max ? 100 * i.value / i.max : Math.max(1.5, s.f(i.value));
      return `<div class="bar-row" tabindex="0" data-tip="${esc(i.detail || shown)}" aria-label="${esc(i.label + ": " + shown)}">
        <span class="bar-l">${esc(i.label)}</span>
        <span class="bar-t">${i.max ? `<span class="bar-max" style="width:100%"></span>` : ""}
          <span class="bar-f g-${i.group || "mid"}" style="width:${w}%"></span>
          ${base && base > 0.5 && base < 100 ? `<span class="bar-base" style="left:${base}%"></span>` : ""}</span>
        <span class="bar-v">${esc(shown)}</span></div>`;
    }).join("")}</div>
    <div class="hint small">${base ? `Dashed line = ${baseline}${unit}, your normal. ` : ""}${s.useLog ? "Log scale, so small values stay visible. " : ""}Hover for details.</div>
  </div>`;
}

// Views per reel in posting order, like a Studio "views" chart.
function timeline(reels, median) {
  const rs = reels.filter((r) => r.views > 0).slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  if (rs.length < 3) return "";
  const s = scaler(rs.map((r) => r.views), median);
  const mline = median ? s.f(median) : null;
  const d0 = rs[0].date, d1 = rs[rs.length - 1].date;
  return `<div class="ig-card">
    <div class="ig-card-h"><h3>Views per reel</h3>
      <div class="legend">${["top", "mid", "bottom"].filter((g) => rs.some((r) => (r.group || "mid") === g)).map((g) => `<span><i class="sw g-${g}"></i>${GROUP_NAMES[g]}</span>`).join("")}${mline ? `<span><i class="sw-dash"></i>Median ${nf(median)}</span>` : ""}</div></div>
    <div class="cols">
      ${mline ? `<div class="col-median" style="bottom:${mline}%"></div>` : ""}
      ${rs.map((r) => `<div class="col" tabindex="0" aria-label="${esc(`${r.title}: ${nf(r.views)} views`)}"
          data-tip="${esc(`${r.title}${r.date ? " · " + r.date : ""}\n${nf(r.views)} views · ${mult(r.multiple)}${r.non_follower_pct != null ? " · " + pct(r.non_follower_pct) + " non-followers" : ""}`)}">
          <span class="col-f g-${r.group || "mid"}" style="height:${Math.max(2, s.f(r.views))}%"></span></div>`).join("")}
    </div>
    <div class="cols-x"><span>${esc(d0 || "oldest")}</span><span>${rs.length} reels</span><span>${esc(d1 || "newest")}</span></div>
    ${s.useLog ? `<div class="hint small">Log scale, so small reels stay visible. Hover a column for details.</div>` : `<div class="hint small">Hover a column for details.</div>`}
  </div>`;
}

// Who watched: follower vs non-follower share, top vs bottom reels.
function reachSplit(reels) {
  const rows = ["top", "mid", "bottom"].map((g) => {
    const a = avg(reels.filter((r) => (r.group || "mid") === g && r.non_follower_pct != null).map((r) => +r.non_follower_pct));
    return a == null ? "" : `<div class="split-row">
      <span class="bar-l">${GROUP_NAMES[g]}</span>
      <span class="split" role="img" aria-label="${GROUP_NAMES[g]}: ${Math.round(a)}% non-followers">
        <span class="s-non" style="width:${a}%"></span><span class="s-fol" style="width:${100 - a}%"></span></span>
      <span class="bar-v">${Math.round(a)}%</span></div>`;
  }).join("");
  return rows ? `<div class="ig-card"><div class="ig-card-h"><h3>Reach from non-followers</h3>
    <div class="legend"><span><i class="sw s-non"></i>Non-followers</span><span><i class="sw s-fol"></i>Followers</span></div></div>
    ${rows}<div class="hint small">Average share of each group's reach that came from people who don't follow you. High = the reel spread.</div></div>` : "";
}

function formatBreakdown(reels) {
  const by = {};
  reels.forEach((r) => { if (r.format && r.multiple != null) (by[r.format] = by[r.format] || []).push(+r.multiple); });
  const items = Object.entries(by).map(([f, a]) => {
    const m = avg(a);
    return { label: f, value: +m.toFixed(2), shown: mult(m), group: m >= 1.5 ? "top" : m < 0.8 ? "bottom" : "mid",
      detail: `${a.length} reel${a.length > 1 ? "s" : ""} · average ${mult(m)} your normal` };
  }).sort((a, b) => b.value - a.value);
  return items.length > 1 ? barList(items, "x", 1, "Average performance by content type", null) : "";
}

function contentTable(reels) {
  const cols = [["title", "Reel"], ["date", "Posted"], ["views", "Views"], ["multiple", "vs normal"],
    ["non_follower_pct", "Non-followers"], ["sends_pct", "Sends"], ["saves_pct", "Saves"], ["follows", "Follows"]]
    .filter(([k]) => k === "title" || reels.some((r) => r[k] != null));
  const s = scaler(reels.map((r) => r.multiple || 0), 1);
  const cell = (r, k) => k === "views" || k === "follows" ? nf(r[k]) : k.endsWith("_pct") ? pct(r[k])
    : k === "multiple" ? `<span class="mini"><span class="mini-f g-${r.group || "mid"}" style="width:${Math.max(3, s.f(r[k]))}%"></span></span>${mult(r[k])}`
    : esc(r[k] ?? "–");
  return `<div class="ig-card table-card"><div class="ig-card-h"><h3>Content</h3><span class="hint">Click a column to sort</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k === "title" || k === "date" ? "" : "num"}">${l}</th>`).join("")}</tr></thead>
    <tbody>${reels.map((r) => `<tr>${cols.map(([k]) => `<td class="${k === "title" ? "t" : k === "date" ? "" : "num"}">${cell(r, k)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
}

function insights(v) {
  const conf = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };
  const findings = (v.findings || []).map((f, n) => `
    <div class="find"><div class="find-n">${n + 1}</div><div>
      <strong>${esc(f.title)}</strong><p>${esc(f.body || "")}</p>
      ${f.confidence ? `<span class="pill c-${esc(f.confidence)}">${conf[f.confidence] || esc(f.confidence)}</span>` : ""}
    </div></div>`).join("");
  const list = (title, arr, cls) => (arr && arr.length)
    ? `<div class="ig-list ${cls}"><h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const lists = list("Do more", v.do_more, "l-more") + list("Stop", v.stop, "l-stop") + list("Next", v.next, "l-next");
  return (lists ? `<div class="ig-lists">${lists}</div>` : "") +
    (findings ? `<div class="ig-card"><h3>What the data says</h3><div class="finds">${findings}</div></div>` : "");
}

function analytics(v) {
  const reels = (v.reels || []).filter((r) => r && r.title);
  // The baseline the audit used: views ÷ multiple (so the line matches the report's median).
  const ref = reels.find((r) => r.views > 0 && r.multiple > 0);
  const median = v.median || (ref ? Math.round(ref.views / ref.multiple) : null);
  const ch = v.chart;
  const legacy = ch && (ch.items || []).length && !reels.length
    ? barList(ch.items.filter((i) => typeof i.value === "number").map((i) => ({ ...i, shown: (i.max ? i.value + " / " + i.max + (ch.unit || "") : (ch.unit === "x" ? mult(i.value) : i.value + (ch.unit || ""))) })),
        ch.unit || "", ch.baseline, ch.title || "", ch.items.some((i) => i.max) ? { top: "Strong", mid: "Partial", bottom: "Losing points" } : GROUP_NAMES)
    : "";
  const overview = `<div class="kpis">${kpiCards(v.kpis)}</div>` +
    (reels.length ? timeline(reels, median) + `<div class="two">${reachSplit(reels)}${formatBreakdown(reels)}</div>` : "") + legacy;
  const tabs = [["overview", "Overview", overview]];
  if (reels.length) tabs.push(["content", "Content", contentTable(reels)]);
  const ins = insights(v);
  if (ins) tabs.push(["insights", "Insights", ins]);
  return `<section class="ig" data-viz>
    <header class="ig-h"><div><div class="ig-kicker">Analytics</div><h2>${esc(v.title || "")}</h2>${v.subtitle ? `<p>${esc(v.subtitle)}</p>` : ""}</div></header>
    <nav class="ig-tabs" role="tablist">${tabs.map(([id, l], i) => `<button role="tab" data-tab="${id}" aria-selected="${i === 0}">${l}</button>`).join("")}</nav>
    ${tabs.map(([id, , html], i) => `<div class="ig-pane" data-pane="${id}" ${i ? "hidden" : ""}>${html}</div>`).join("")}
  </section>`;
}

// Wire up tabs, tooltips and table sorting after the view is in the page.
function wireAnalytics(root) {
  const sec = root.querySelector("[data-viz]"); if (!sec) return;
  sec.querySelectorAll(".ig-tabs button").forEach((b) => b.onclick = () => {
    sec.querySelectorAll(".ig-tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
    sec.querySelectorAll(".ig-pane").forEach((p) => p.hidden = p.dataset.pane !== b.dataset.tab);
  });
  sec.querySelectorAll(".bar-row, .col").forEach((b) => {
    b.onmouseenter = b.onfocus = () => showTip(b, "above");
    b.onmouseleave = b.onblur = hideTip;
  });
  const tbl = sec.querySelector(".tbl"); if (!tbl) return;
  tbl.querySelectorAll("th").forEach((th, idx) => th.onclick = () => {
    const dir = th.dataset.dir === "desc" ? "asc" : "desc";
    tbl.querySelectorAll("th").forEach((x) => delete x.dataset.dir); th.dataset.dir = dir;
    const val = (tr) => { const t = tr.children[idx].textContent.replace(/[,%x–]/g, "").trim(); const n = parseFloat(t); return isNaN(n) ? t.toLowerCase() : n; };
    const rows = [...tbl.tBodies[0].rows].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * (dir === "asc" ? 1 : -1); });
    rows.forEach((r) => tbl.tBodies[0].appendChild(r));
  });
}

let currentJob = null;

async function generate(payload, t, keepText) {
  const go = $("#go"); if (go) go.disabled = true;
  const out = $("#out"); out.hidden = false;
  out.innerHTML = `
    <div class="progress">
      <div class="prog-head">
        <div class="spin"></div>
        <div class="prog-main"><strong id="pstat">Claude Code is working on it</strong>
          <div class="hint" id="pmeta">0:00 · step 1</div></div>
        <button class="btn ghost small" id="cancel">Cancel</button>
      </div>
      <div class="bar"><div class="bar-in" id="pbar"></div></div>
      <ol class="steps" id="psteps"></ol>
    </div>`;
  let r;
  try { r = await api("/api/generate", payload); }
  catch (e) { r = { error: "The app server stopped. Restart it and try again." }; }
  if (r.error) { if (go) go.disabled = false; out.innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
  const job = currentJob = r.job_id;
  $("#cancel").onclick = async () => {
    $("#cancel").disabled = true; $("#cancel").textContent = "Cancelling…";
    await api("/api/cancel", { job_id: job });
  };
  let since = 0, steps = [], j;
  while (true) {
    await new Promise((res) => setTimeout(res, 1000));
    if (currentJob !== job) return;                  // user started something else
    try { j = await fetch(`/api/job?id=${job}&since=${since}`).then((x) => x.json()); }
    catch { j = { status: "error", error: "Lost contact with the app server." }; }
    if (j.error && !j.status) j.status = "error";
    if (j.steps) { steps = steps.concat(j.steps); since = j.n; }
    if (j.status !== "running") break;
    const el = $("#psteps"); if (!el) return;        // user switched tab
    el.innerHTML = steps.map((s, i) => `<li class="${i === steps.length - 1 ? "now" : "done"}">${esc(s)}</li>`).join("");
    el.scrollTop = el.scrollHeight;                  // keep the latest step in view
    const live = j.live.input + j.live.output;
    $("#pmeta").textContent = `${fmtT(j.elapsed)} · step ${steps.length} · ~${fmtK(live)} tokens so far (${fmtK(j.live.output)} written)`;
    // Rough guide only: most jobs finish in about 1 to 3 minutes.
    $("#pbar").style.width = Math.min(92, 100 * (1 - Math.exp(-j.elapsed / 70))) + "%";
  }
  if (go) go.disabled = false;
  if (j.status === "cancelled") {
    out.innerHTML = `<div class="err">${esc(j.error || "Cancelled.")}</div>${j.usage ? usageLine(j.usage, j.elapsed) : ""}`;
    return;
  }
  if (j.status === "error") { out.innerHTML = `<div class="err">${esc(j.error)}</div>`; return; }
  addToToday(j.usage);
  // "Make it visual" asks only for the chart block; keep the earlier report.
  const result = keepText ? keepText.replace(/```igviz[\s\S]*?```/, "").trim() + "\n\n" + j.result : j.result;
  const rec = { result, session_id: j.session_id, usage: j.usage, elapsed: j.elapsed };
  renderResult(t, rec);
  await persist(t.id, rec);
  if (rec.reels && store.get("tab") === t.id) renderResult(t, rec);   // redraw with the full reel set
}

// Save a finished result on disk (and the reels it found into the shared reel file).
async function persist(skill, rec) {
  try {
    const r = await api("/api/save", { skill, rec: { ...rec, viz: splitViz(rec.result).viz } });
    if (r.id) rec.id = r.id;
    if (r.reels) rec.reels = r.reels;
  } catch {}
  store.set("last:" + skill, JSON.stringify(rec));
}

// Draw a finished result: infographic (if any), usage, the written report, follow-up box.
function renderResult(t, rec) {
  const out = $("#out"); out.hidden = false;
  let { text, viz } = splitViz(rec.result);
  if (viz && rec.reels && rec.reels.length) viz = { ...viz, reels: rec.reels };
  const canViz = VIZ_SKILLS.has(t.id) && !viz;
  const canUpgrade = t.id === "ig-audit" && viz && !(viz.reels || []).length;
  out.innerHTML = `
    <div class="toolbar">
      <button class="btn ghost small" id="copy">Copy text</button>
      ${canViz ? `<button class="btn small" id="mkviz">Make it visual</button>` : ""}
      ${canUpgrade ? `<button class="btn small" id="mkviz">Upgrade to full analytics</button>` : ""}
      ${VIZ_SKILLS.has(t.id) ? "" : `<button class="btn ghost small" id="tohook">Score hooks</button>
      <button class="btn ghost small" id="todetect">AI-detector check</button>`}
    </div>
    ${usageLine(rec.usage, rec.elapsed || 0)}
    ${viz ? analytics(viz) : ""}
    ${viz ? `<details class="report"><summary>Full written report</summary><article class="result">${md(text)}</article></details>`
          : `<article class="result">${md(text)}</article>`}
    <div class="followup">
      <input id="fu" placeholder="Ask for a change, e.g. “make the hook punchier” or “shorter, 15 seconds”">
      <button class="btn" id="fugo">Send</button>
    </div>`;
  $("#copy").onclick = async () => { await navigator.clipboard.writeText(text); $("#copy").textContent = "Copied"; };
  if ($("#tohook")) $("#tohook").onclick = () => sendTo("hookscore", text);
  if ($("#todetect")) $("#todetect").onclick = () => sendTo("detect", text);
  if ($("#mkviz")) $("#mkviz").onclick = () => generate({ session_id: rec.session_id, followup: "viz", want_viz: true }, t, rec.result);
  wireAnalytics(out);
  const fu = $("#fu");
  const send = () => fu.value.trim() && generate({ session_id: rec.session_id, followup: fu.value.trim() }, t);
  $("#fugo").onclick = send;
  fu.onkeydown = (e) => { if (e.key === "Enter") send(); };
}

function sendTo(tool, text) {
  open(tool);
  $("#txt").value = text;
  store.set("draft:" + tool, text);
  $("#go").click();
}

function checkForm(t) {
  const opts = t.opts || [];
  $("#form").innerHTML = `
    <label for="txt">${esc(t.label)}</label>
    <textarea id="txt" placeholder="${esc(t.ph)}"></textarea>
    ${opts.length ? `<div class="row">${opts.map((o) => `<div><label>${esc(o.label)} <span class="hint">(optional)</span></label><input data-o="${o.k}" placeholder="${esc(o.ph)}"></div>`).join("")}</div>` : ""}
    <div class="actions"><button class="btn" id="go">Run</button></div>`;
  const ta = $("#txt");
  ta.value = store.get("draft:" + t.id);
  ta.oninput = () => store.set("draft:" + t.id, ta.value);
  ta.onkeydown = (e) => { if (t.id === "swipe" && e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "\t"); } };
  $("#go").onclick = async () => {
    let text = ta.value;
    if (!text.trim()) return ta.focus();
    if (t.id === "hookscore") text = text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“]|["”]$/g, "")).join("\n");
    const options = {};
    opts.forEach((o) => options[o.k] = $(`[data-o="${o.k}"]`).value);
    const out = $("#out"); out.hidden = false;
    out.innerHTML = `<div class="wait"><div class="spin"></div>Running…</div>`;
    const r = await api("/api/check", { tool: t.id, text, options });
    if (r.error) { out.innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
    const cleaned = t.id === "humanize" && r.json && r.json.text;
    out.innerHTML = (cleaned ? `
      <div class="toolbar"><strong>Cleaned text</strong>
        <button class="btn ghost small" id="copy">Copy</button>
        <button class="btn ghost small" id="todetect">AI-detector check</button></div>
      <div class="result"><pre class="pre" style="white-space:pre-wrap">${esc(cleaned)}</pre></div>
      <div class="toolbar" style="margin-top:18px"><strong>What changed</strong></div>` : "") +
      `<div class="result"><pre class="pre">${esc(r.text || JSON.stringify(r.json, null, 2))}</pre></div>`;
    if (cleaned) {
      $("#copy").onclick = async () => { await navigator.clipboard.writeText(cleaned); $("#copy").textContent = "Copied"; };
      $("#todetect").onclick = () => sendTo("detect", cleaned);
    }
  };
}

async function voiceForm() {
  $("#form").innerHTML = `<div class="wait"><div class="spin"></div>Loading…</div>`;
  const files = await api("/api/files");
  const info = {
    "voice.md": "How you talk on camera, words you never use, who you talk to. The Reel, Caption, DM and Story tabs read this.",
    "log.md": "What you posted and which hook formula it used. Stops the weekly plan repeating itself.",
    "swipe.md": "Your swipe file of reels that are working in your niche. The weekly plan trusts this over general rules.",
  };
  $("#form").innerHTML = Object.keys(info).map((f) => `
    <div style="margin-bottom:22px">
      <label>${f} <span class="hint">· ${info[f]}</span></label>
      <textarea data-f="${f}" style="min-height:140px" placeholder="Empty. Write it here, or let the skills fill it in.">${esc(files[f] || "")}</textarea>
      <div class="actions"><button class="btn small" data-save="${f}">Save ${f}</button><span class="saved" data-ok="${f}"></span></div>
    </div>`).join("") + `<p class="tip">Saved to ~/.claude/instagram/. Claude in chat reads the same files.</p>`;
  $("#form").querySelectorAll("[data-save]").forEach((b) => b.onclick = async () => {
    const f = b.dataset.save;
    const r = await api("/api/files", { name: f, content: $(`[data-f="${f}"]`).value });
    $(`[data-ok="${f}"]`).textContent = r.ok ? "Saved" : r.error;
  });
}

(async function init() {
  try {
    const s = await api("/api/status");
    claudeOK = s.claude;
    $("#status").className = "status " + (s.claude ? "ok" : "no");
    $("#status").textContent = s.claude ? "Claude Code connected" : "Claude Code not found: writing tabs are off";
    if (s.demo) $("#status").insertAdjacentHTML("afterend", `<div class="demo-pill">Demo mode · fictional data · no tokens</div>`);
  } catch {
    $("#status").className = "status no";
    $("#status").textContent = "App server not running";
  }
  await migrateLocal();
  wireTheme();
  route();
  window.addEventListener("hashchange", route);
})();

// Deep links: #dash, #dash/content, #ig-audit/insights, #hookscore …
function route() {
  const [id, pane] = decodeURIComponent(location.hash.slice(1)).split("/");
  const known = [DASH, VOICE, ...WRITE, ...CHECK].some((t) => t.id === id);
  if (!known) return open(store.get("tab") || "dash");
  open(id);
  if (pane) {
    const pick = () => { const b = document.querySelector(`[data-tab="${pane}"]`); if (b) b.click(); else setTimeout(pick, 100); };
    setTimeout(pick, 50);
  }
}

function wireTheme() {
  const cur = () => store.get("theme") || "system";
  const paint = () => document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === cur()));
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.onclick = () => {
    const t = b.dataset.themeSet;
    store.set("theme", t === "system" ? "" : t);
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    paint();
  });
  paint();
}

// Results made before saving existed live only in this browser: copy them to disk once.
async function migrateLocal() {
  for (const t of WRITE) {
    let rec; try { rec = JSON.parse(store.get("last:" + t.id)); } catch {}
    if (rec && rec.result && !rec.id) await persist(t.id, rec);
  }
}

// "Saved results" dropdown: reopen any earlier result instantly, no tokens.
async function savedPicker(t) {
  let list = [];
  try { list = await api("/api/history?skill=" + encodeURIComponent(t.id)); } catch {}
  const sel = $("#saved"); if (!sel || !list.length) return;
  sel.innerHTML = `<option value="">Saved results (${list.length})</option>` +
    list.map((r) => `<option value="${esc(r.id)}">${esc(r.created)} · ${esc(r.title.slice(0, 48))}</option>`).join("");
  sel.hidden = false;
  sel.onchange = async () => {
    if (!sel.value) return;
    const d = await api("/api/result?id=" + encodeURIComponent(sel.value));
    if (d.error) return;
    const rec = { id: d.id, result: d.result, session_id: d.session_id, usage: d.usage, elapsed: d.elapsed, reels: d.reels };
    store.set("last:" + t.id, JSON.stringify(rec));
    renderResult(t, rec);
    sel.value = "";
  };
}

// Dashboard: drawn from the saved reel file + latest audit. No Claude call at all.
async function dashboard() {
  $("#form").innerHTML = `<div class="wait"><div class="spin"></div>Loading saved data…</div>`;
  const [db, hist] = await Promise.all([api("/api/reels"), api("/api/history?skill=ig-audit")]);
  const reels = (db.reels || []).filter((r) => r.views > 0);
  if (!reels.length) {
    $("#form").innerHTML = `<p>No saved reel data yet.</p><p class="tip">Run <strong>Audit my posts</strong> once. Its reels are saved here, and this page then opens instantly without using any tokens.</p>`;
    return;
  }
  const sorted = reels.map((r) => r.views).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const rs = reels.map((r) => {
    const m = +(r.views / median).toFixed(2);
    return { ...r, multiple: m, group: m >= 1.5 ? "top" : m < 0.8 ? "bottom" : "mid" };
  });
  const best = rs.reduce((a, b) => (b.multiple > a.multiple ? b : a));
  const follows = rs.reduce((s, r) => s + (+r.follows || 0), 0);
  const hits = rs.filter((r) => r.group === "top").length;
  let latest = null;
  if (hist.length) { try { latest = splitViz((await api("/api/result?id=" + hist[0].id)).result).viz; } catch {} }
  const dates = rs.map((r) => r.date).filter(Boolean).sort();
  const v = {
    title: latest?.title || "Your reels at a glance",
    subtitle: `${db.account || "Saved data"} · ${rs.length} reels${dates.length ? ` · ${dates[0]} to ${dates[dates.length - 1]}` : ""} · updated ${db.updated || "–"}`,
    kpis: [
      { label: "Median views", value: nf(median), note: "your normal (1x)" },
      { label: "Best reel", value: mult(best.multiple), note: best.title },
      { label: "Reels above 1.5x", value: `${hits} of ${rs.length}`, note: `${Math.round(100 * hits / rs.length)}% hit rate` },
      { label: "Follows tracked", value: nf(follows), note: "from reels with follow data" },
    ],
    median, reels: rs, findings: latest?.findings, do_more: latest?.do_more, stop: latest?.stop, next: latest?.next,
  };
  $("#form").innerHTML = `<p class="tip" style="margin:0">Multiples here are recalculated against the median of all ${rs.length} saved reels. Insights come from your latest audit${hist.length ? ` (${esc(hist[0].created)})` : ""}. Run a new audit to add reels.</p>`;
  const out = $("#out"); out.hidden = false;
  out.innerHTML = analytics(v);
  wireAnalytics(out);
}
