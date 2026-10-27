import { METRIC_GUIDE } from "./metricGuide";

// Every AI review card is identical apart from its domain and title — same
// loader, same 1-hour KV cache, same Retry (force) button.
function reviewCard(domain: string, title: string, sub = ""): string {
  return `<div class="card ai-card">
      <div class="ai-head">
        <h3>✦ ${title}</h3>
        <button class="btn btn-ghost btn-sm" id="review-${domain}-btn" onclick="loadReview('${domain}',true)">Retry</button>
      </div>
      ${sub ? `<div class="card-sub">${sub}</div>` : ""}
      <div id="review-${domain}">
        <div class="skeleton" style="width:70%"></div>
        <div class="skeleton" style="width:90%"></div>
        <div class="skeleton" style="width:55%"></div>
      </div>
    </div>`;
}

export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Health</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /*
    Design direction: a fitness-first performance app (WHOOP/Strava/Nike
    vernacular), not a clinical instrument and not a generic SaaS
    dashboard. This product's own metrics (Strain, Readiness, WHOOP-style
    recovery) are already fitness-tracker DNA, so the design matches that
    energy: bold condensed numerals, true black, color-coded by
    physiological direction (green/amber/coral) rather than one timid
    accent, confident filled CTAs.
  */
  :root {
    --void:#000000; --panel:#121212; --panel2:#181818; --line:#262626;
    --ink:#ffffff; --dim:#8a8a8a; --faint:#555555;
    --pulse:#b4ff39; --up:#34d399; --down:#f76b4d; --caution:#fbbf24;
    /* kept the name --mono from the prior design pass (it's used ~40 places
       for every numeric readout) even though Barlow Condensed isn't a
       monospace face — renaming the token would mean touching every call
       site for no functional gain; what matters is the value. */
    --mono: 'Barlow Condensed', -apple-system, sans-serif;
    --sans: 'Inter', -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { margin:0; padding:0; }
  /* Baseline for every native form control, so a new input/select/textarea
     added anywhere never falls back to the browser's light-mode default
     (which stands out badly against this dark theme) unless it opts out. */
  input, select, textarea {
    background:var(--panel2); color:var(--ink); border:1px solid var(--line);
    border-radius:4px; padding:8px 10px; font-size:13.5px; font-family:var(--sans);
    color-scheme: dark;
  }
  input:focus, select:focus, textarea:focus { outline:none; border-color:var(--pulse); }
  input::placeholder, textarea::placeholder { color:var(--faint); }
  body {
    background:var(--void); color:var(--ink); font-family:var(--sans);
    min-height:100vh; -webkit-font-smoothing:antialiased;
  }
  a { color:inherit; }
  .sub { color:var(--dim); font-size:13px; line-height:1.5; }
  .faint { color:var(--faint); font-size:12px; }
  .num { font-family:var(--mono); font-weight:700; }

  /* ---- gate ---- */
  #gate { max-width:360px; margin:18vh auto; padding:0; text-align:left; }
  #gate .mark { font-family:var(--mono); font-weight:700; font-size:26px; color:var(--pulse); margin-bottom:10px; }
  #gate h1 { font-size:19px; margin:0 0 6px; font-weight:700; }
  #gate input { width:100%; padding:11px 12px; margin:16px 0 10px; border-radius:6px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-size:14px; font-family:var(--sans); text-align:left; }
  #gate input:focus { outline:none; border-color:var(--pulse); }
  button { font:inherit; }
  .btn { padding:11px 18px; border-radius:6px; border:none; background:var(--pulse); color:var(--void); font-weight:700; cursor:pointer; font-size:13.5px; transition:transform .1s, opacity .15s; }
  .btn:hover { opacity:.9; } .btn:active { transform:scale(.97); }
  .btn:disabled { opacity:.35; cursor:default; }
  .btn-ghost { background:var(--panel2); color:var(--ink); border:1px solid var(--line); font-weight:600; }
  .btn-ghost:hover { border-color:var(--pulse); }
  .btn-sm { padding:7px 12px; font-size:12px; border-radius:5px; }
  #gate .btn { width:100%; text-align:center; }
  #gateError { color:var(--down); min-height:16px; font-size:13px; }

  /* ---- shell ---- */
  #app { display:none; max-width:900px; margin:0 auto; padding:0 20px 60px; }
  header.top { position:sticky; top:0; z-index:20; background:rgba(0,0,0,.92); backdrop-filter:blur(10px); padding:18px 20px 10px; margin:0 -20px 20px; border-bottom:1px solid var(--line); }
  header.top .row { display:flex; align-items:baseline; justify-content:space-between; max-width:900px; margin:0 auto; }
  header.top h1 { font-size:18px; margin:0; font-weight:800; letter-spacing:-.01em; }
  header.top .sub { font-family:var(--mono); font-weight:600; font-size:13px; }
  .tabs { display:flex; gap:6px; overflow-x:auto; margin-top:14px; padding-bottom:2px; max-width:900px; margin-left:auto; margin-right:auto; scrollbar-width:none; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab { white-space:nowrap; padding:7px 13px; border-radius:999px; background:transparent; border:1px solid var(--line); color:var(--dim); cursor:pointer; font-size:13px; font-weight:600; }
  .tab.active { color:var(--void); background:var(--pulse); border-color:var(--pulse); }

  .section { display:none; }
  .section.active { display:block; }

  /* ---- hero: big, bold, color-coded — this is the first thing you see ---- */
  .hero { display:grid; grid-template-columns:auto 1fr; gap:28px; padding:0 0 22px; margin-bottom:22px; border-bottom:1px solid var(--line); align-items:center; }
  .ring-wrap { position:relative; width:140px; height:140px; flex-shrink:0; }
  .ring-wrap svg { transform:rotate(-90deg); }
  .ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .ring-label .n { font-family:var(--mono); font-size:46px; font-weight:800; letter-spacing:-.01em; line-height:1; color:var(--pulse); }
  .ring-label .u { font-size:11px; color:var(--dim); margin-top:2px; font-weight:600; }
  .hero-meta .delta { display:inline-flex; align-items:center; gap:5px; padding:3px 0; font-family:var(--mono); font-size:16px; font-weight:700; margin-bottom:8px; }
  .delta.good { color:var(--up); }
  .delta.bad { color:var(--down); }
  .hero-meta h2 { margin:0 0 4px; font-size:16px; font-weight:600; color:var(--ink); }
  .readiness-chip { display:inline-flex; align-items:center; gap:7px; margin-top:10px; margin-right:14px; font-size:13px; font-weight:600; color:var(--dim); }
  .readiness-chip .num { color:var(--ink); font-weight:700; }
  .dot { width:8px; height:8px; border-radius:50%; }

  /* ---- grid / readouts: color-coded left edge by trend direction ---- */
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:0; margin-bottom:22px; border-top:1px solid var(--line); }
  .stat { padding:13px 14px 13px 12px; border-bottom:1px solid var(--line); border-left:3px solid var(--line); }
  .stat .label { color:var(--dim); font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; }
  .stat .value { font-family:var(--mono); font-size:26px; font-weight:800; margin-top:4px; letter-spacing:-.01em; }
  .stat .value .unit { font-size:12px; color:var(--dim); font-weight:600; margin-left:3px; font-family:var(--sans); }
  .stat .trend { font-family:var(--mono); font-size:12px; font-weight:700; margin-top:3px; }
  .trend.up { color:var(--up); } .trend.down { color:var(--down); } .trend.flat { color:var(--faint); }
  .stat:has(.trend.up) { border-left-color:var(--up); }
  .stat:has(.trend.down) { border-left-color:var(--down); }

  /* A panel still exists where content needs real grouping (forms, lists,
     AI output) — flat fill, hairline edge, no decorative shadow. */
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; margin-bottom:12px; }
  .card h3 { margin:0 0 4px; font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px; color:var(--ink); }
  .card .card-sub { color:var(--dim); font-size:12.5px; margin-bottom:12px; }
  .chart-empty { height:240px; display:flex; align-items:center; justify-content:center; color:var(--faint); font-size:13px; text-align:center; padding:0 20px; }
  .simple-table { width:100%; font-size:13px; border-collapse:collapse; }
  .simple-table td { padding:7px 10px 7px 0; border-bottom:1px solid var(--line); color:var(--ink); font-family:var(--mono); font-weight:600; }
  .simple-table td:first-child { color:var(--dim); white-space:nowrap; font-family:var(--sans); font-weight:400; }
  canvas { max-height:240px; }

  /* ---- AI insights: same panel, lime accent stripe (this app's brand) ---- */
  .ai-card { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--pulse); border-radius:0 8px 8px 0; }
  .ai-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .ai-headline { font-size:16px; font-weight:700; margin:2px 0 10px; color:var(--ink); }
  .ai-list { margin:0 0 10px; padding-left:16px; font-size:13.5px; line-height:1.7; color:var(--ink); }
  .ai-list.concerns li { color:var(--down); }
  .ai-list.recs li { color:var(--pulse); }
  .ai-section-title { font-size:11px; color:var(--dim); font-weight:700; margin:12px 0 4px; }
  .ai-meta { color:var(--faint); font-size:11.5px; margin-top:8px; font-family:var(--mono); }
  .skeleton { height:12px; border-radius:2px; background:linear-gradient(90deg,var(--panel2),#202020,var(--panel2)); background-size:200% 100%; animation:shimmer 1.4s infinite; margin:8px 0; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }

  /* ---- bests / markers ---- */
  .bests { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:0; border-top:1px solid var(--line); }
  .best { padding:12px 14px 12px 0; border-bottom:1px solid var(--line); }
  .best .label { color:var(--dim); font-size:11.5px; font-weight:600; }
  .best .value { font-family:var(--mono); font-size:20px; font-weight:800; margin-top:4px; color:var(--pulse); }
  .best .date { color:var(--faint); font-size:11px; margin-top:2px; font-family:var(--mono); }

  .extra-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:0; border-top:1px solid var(--line); }
  .extra-tile { padding:10px 12px 10px 0; border-bottom:1px solid var(--line); }
  .extra-tile .label { color:var(--dim); font-size:10.5px; }
  .extra-tile .value { font-family:var(--mono); font-size:16px; font-weight:700; margin-top:2px; }
  .extra-tile .g-mini { font-size:11px; color:var(--dim); line-height:1.4; margin-top:4px; padding-right:8px; }
  .extra-tile .g-mini b { color:var(--ink); font-weight:600; }

  .markers-list { display:flex; flex-direction:column; gap:10px; }
  .marker-row { display:flex; align-items:center; gap:10px; }
  .marker-row .mname { flex:1; font-size:13px; color:var(--dim); }
  .marker-row .mval { font-family:var(--mono); font-size:15px; font-weight:700; width:64px; text-align:right; color:var(--ink); }
  .marker-bar { flex:2; height:4px; background:var(--panel2); overflow:hidden; border-radius:2px; }
  .marker-bar > div { height:100%; }

  /* ---- profile / import ---- */
  .profile-form, .import-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .profile-form input, .profile-form select { padding:8px 10px; border-radius:6px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-size:13.5px; }
  input[type="file"] { color:var(--dim); font-size:13px; }
  progress { width:100%; height:4px; border-radius:2px; overflow:hidden; accent-color:var(--pulse); margin-top:8px; }

  /* ---- "what it means / what to do" under every metric ---- */
  .guide { margin-top:10px; padding-top:10px; border-top:1px dashed var(--line); font-size:12.5px; line-height:1.55; }
  .guide + .guide { margin-top:8px; }
  .guide .g-name { color:var(--ink); font-weight:700; font-size:12px; }
  .guide .g-val { font-family:var(--mono); font-weight:700; color:var(--ink); margin-left:6px; }
  .guide .g-mean { color:var(--dim); }
  .guide .g-act { color:var(--ink); margin-top:4px; font-size:13.5px; }
  .guide .g-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .guide .g-act::before { content:"→ "; font-weight:700; }
  .s-good::before, .s-good .dot-s { color:var(--up); }
  .s-ok::before { color:var(--pulse); }
  .s-watch::before { color:var(--caution); }
  .s-bad::before { color:var(--down); }
  .stat .g-mini { font-size:11.5px; color:var(--dim); line-height:1.45; margin-top:6px; }
  .stat .g-mini b { color:var(--ink); font-weight:600; }
  .chart-box { position:relative; height:240px; }

  /* ---- action items ---- */
  .actions { list-style:none; margin:0; padding:0; }
  .actions li { display:grid; grid-template-columns:auto 1fr; gap:10px; padding:10px 0; border-bottom:1px solid var(--line); }
  .actions li:last-child { border-bottom:none; }
  .prio { font-family:var(--mono); font-size:11px; font-weight:800; padding:2px 7px; border-radius:3px; height:fit-content; text-transform:uppercase; letter-spacing:.04em; }
  .prio.high { background:var(--down); color:var(--void); }
  .prio.medium { background:var(--caution); color:var(--void); }
  .prio.low { background:var(--panel2); color:var(--dim); border:1px solid var(--line); }
  .actions .a-text { font-weight:600; font-size:14px; }
  .actions .a-why { color:var(--dim); font-size:12.5px; margin-top:2px; }

  /* ---- fitness metric cards ---- */
  .fit-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; margin-bottom:12px; }
  .fit { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--line); border-radius:0 8px 8px 0; padding:14px; }
  .fit.good { border-left-color:var(--up); } .fit.ok { border-left-color:var(--pulse); }
  .fit.watch { border-left-color:var(--caution); } .fit.bad { border-left-color:var(--down); }
  .fit .label { color:var(--dim); font-size:12px; font-weight:600; }
  .fit .value { font-family:var(--mono); font-size:24px; font-weight:800; margin:2px 0 6px; }
  .fit .fit-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .fit .act { font-size:13.5px; line-height:1.55; margin-top:4px; }
  .fit .act::before { content:"→ "; font-weight:700; color:var(--pulse); }

  /* ---- readability pass: bigger type, more air, plain-language status ---- */
  body { font-size:15px; line-height:1.6; }
  .sub { font-size:14px; }
  .card { padding:20px; margin-bottom:14px; }
  .card h3 { font-size:16px; }
  .card .card-sub { font-size:13.5px; line-height:1.55; }
  .ai-list { font-size:14.5px; line-height:1.65; }
  .ai-list li { margin-bottom:6px; }
  .ai-headline { font-size:18px; line-height:1.4; }
  .ai-section-title { font-size:12px; text-transform:uppercase; letter-spacing:.06em; margin-top:16px; }
  .ai-loading { color:var(--dim); font-size:13px; margin-top:6px; }

  h2.sec { font-size:22px; font-weight:800; margin:34px 0 12px; letter-spacing:-.01em; }
  h2.sec span { display:block; font-size:13.5px; font-weight:500; color:var(--dim); letter-spacing:0; margin-top:2px; }
  .greet { margin:6px 0 18px; }
  .greet-hi { font-size:28px; font-weight:800; letter-spacing:-.02em; }
  .greet-sub { color:var(--dim); font-size:14px; }

  .pill { display:inline-block; font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; letter-spacing:.02em; vertical-align:middle; white-space:nowrap; }
  .p-good { background:rgba(52,211,153,.15); color:var(--up); }
  .p-ok { background:rgba(180,255,57,.12); color:var(--pulse); }
  .p-watch { background:rgba(251,191,36,.15); color:var(--caution); }
  .p-bad { background:rgba(247,107,77,.15); color:var(--down); }
  .p-unknown { background:var(--panel2); color:var(--dim); }
  details.more { margin-top:8px; font-size:13px; color:var(--dim); }
  details.more summary { cursor:pointer; color:var(--faint); font-size:12.5px; list-style:none; }
  details.more summary::-webkit-details-marker { display:none; }
  details.more summary::before { content:"＋ "; }
  details.more[open] summary::before { content:"− "; }
  details.more > div { margin-top:6px; line-height:1.6; }

  .scoreboard { display:grid; grid-template-columns:minmax(260px, 1fr) 1.3fr; gap:24px; align-items:center; }
  .scoreboard > details { grid-column:1 / -1; }
  .score-main { display:flex; gap:18px; align-items:center; }
  .score-word { font-size:24px; font-weight:800; }
  .score-summary { color:var(--dim); font-size:14px; margin-top:2px; }
  .score-part { padding:9px 0; border-bottom:1px solid var(--line); }
  .score-part:last-child { border-bottom:none; }
  .score-part .sp-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .score-part .sp-name { font-weight:700; font-size:14px; }
  .score-part .sp-num { font-family:var(--mono); font-weight:800; font-size:18px; }
  .score-part .sp-bar { height:5px; background:var(--panel2); border-radius:3px; margin:5px 0 4px; overflow:hidden; }
  .score-part .sp-bar > div { height:100%; border-radius:3px; }
  .score-part .sp-detail { color:var(--dim); font-size:12.5px; line-height:1.45; }

  .trio { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-bottom:14px; }
  .trio .t { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
  .trio .t-label { color:var(--dim); font-size:12.5px; font-weight:600; }
  .trio .t-val { font-family:var(--mono); font-size:38px; font-weight:800; line-height:1.1; margin:4px 0; }
  .trio .t-val small { font-size:15px; color:var(--dim); font-weight:600; }
  .trio .t-act { font-size:13.5px; line-height:1.5; margin-top:8px; }

  .week { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; text-align:center; }
  .wd { padding:6px 2px; border-radius:6px; min-width:0; }
  .wd.today { background:var(--panel2); outline:1px solid var(--line); }
  .wd .w-name { font-size:12px; font-weight:700; color:var(--dim); }
  .wd .w-barbox { height:70px; display:flex; align-items:flex-end; justify-content:center; margin:6px 0; }
  .wd .w-bar { width:60%; max-width:26px; border-radius:3px 3px 0 0; background:#34d399; min-height:2px; }
  .wd .w-steps { font-family:var(--mono); font-weight:700; font-size:14px; }
  .wd .w-rings { font-size:10px; letter-spacing:2px; margin-top:2px; }
  .wd .w-type { font-size:10.5px; color:var(--dim); margin-top:2px; min-height:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ring-on { color:var(--pulse); } .ring-off { color:var(--faint); }
  .legend { display:flex; gap:16px; margin-top:12px; font-size:12px; color:var(--dim); flex-wrap:wrap; }
  .legend i { display:inline-block; vertical-align:middle; margin-right:5px; }
  .lg-bar { width:8px; height:12px; background:#34d399; border-radius:2px; }
  .lg-dot { width:8px; height:8px; border-radius:50%; background:var(--faint); }
  .lg-dot.on { background:var(--pulse); }

  .highlights { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; margin-bottom:14px; }
  .hl { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 16px; display:grid; grid-template-columns:auto 1fr; gap:12px; }
  .hl .hl-ic { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; }
  .hl.win .hl-ic { background:rgba(52,211,153,.15); color:var(--up); }
  .hl.watch .hl-ic { background:rgba(251,191,36,.15); color:var(--caution); }
  .hl.info .hl-ic { background:rgba(96,165,250,.15); color:#60a5fa; }
  .hl .hl-title { font-weight:700; font-size:14.5px; line-height:1.4; }
  .hl .hl-detail { color:var(--dim); font-size:13px; line-height:1.5; margin-top:3px; }

  .longview { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-bottom:14px; }
  .lv { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .lv .lv-label { color:var(--dim); font-size:12.5px; font-weight:600; display:flex; justify-content:space-between; gap:6px; align-items:center; }
  .lv .lv-val { font-family:var(--mono); font-size:24px; font-weight:800; margin-top:2px; }
  .lv .lv-val small { font-size:13px; color:var(--dim); font-weight:600; font-family:var(--sans); }
  .lv .lv-note { font-size:12.5px; color:var(--dim); margin-top:4px; }
  svg.spark { display:block; margin-top:8px; overflow:visible; }
  .stat svg.spark { margin-top:6px; }
  #trainingLoadStats { grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); }
  #quickStats { grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); }
  #quickStats .stat { padding:16px 16px 16px 14px; }
  #quickStats .g-mini { font-size:13px; line-height:1.5; color:var(--ink); margin-top:8px; }
  .stat .asof { font-size:11.5px; color:var(--faint); font-weight:500; margin-left:6px; font-family:var(--sans); }
  .untracked { color:var(--dim); font-size:13.5px; margin:-8px 0 14px; }
  .wk-row { display:grid; grid-template-columns:44px 1fr 70px; gap:10px; align-items:center; padding:4px 0; font-size:13px; }
  .wk-row .wk-bar { height:10px; background:var(--panel2); border-radius:5px; overflow:hidden; }
  .wk-row .wk-bar > div { height:100%; background:#34d399; border-radius:5px; }
  .wk-row .wk-n { font-family:var(--mono); font-weight:700; text-align:right; }

  @media (max-width:640px) {
    .scoreboard { grid-template-columns:1fr; }
    .greet-hi { font-size:23px; }
    .wd .w-steps { font-size:12px; }
  }

  footer { color:var(--faint); font-size:11.5px; text-align:left; padding:28px 0 10px; border-top:1px solid var(--line); margin-top:10px; }

  @media (max-width:560px) {
    .hero { grid-template-columns:1fr; text-align:left; }
  }
</style>
</head>
<body>

<div id="gate">
  <div class="mark">⌁</div>
  <h1>Unlock your health data</h1>
  <p class="sub">The access token your Apple Shortcut and dashboard share.</p>
  <input id="tokenInput" type="password" placeholder="Access token" />
  <button class="btn" onclick="saveToken()">Unlock</button>
  <p id="gateError" class="sub"></p>
</div>

<div id="app">
  <header class="top">
    <div class="row">
      <h1>Health</h1>
      <div class="sub" id="lastUpdated">—</div>
    </div>
    <nav class="tabs">
      <button class="tab active" data-tab="overview" onclick="showTab('overview')">Overview</button>
      <button class="tab" data-tab="training" onclick="showTab('training')">Training</button>
      <button class="tab" data-tab="heart" onclick="showTab('heart')">Heart &amp; Recovery</button>
      <button class="tab" data-tab="activity" onclick="showTab('activity')">Activity &amp; Mobility</button>
      <button class="tab" data-tab="sleep" onclick="showTab('sleep')">Sleep</button>
      <button class="tab" data-tab="age" onclick="showTab('age')">Biological Age</button>
      <button class="tab" data-tab="ai" onclick="showTab('ai')">Ask AI</button>
      <button class="tab" data-tab="discoveries" onclick="showTab('discoveries')">Discoveries</button>
      <button class="tab" data-tab="more" onclick="showTab('more')">More data</button>
      <button class="tab" data-tab="settings" onclick="showTab('settings')">Import &amp; Settings</button>
    </nav>
  </header>

  <!-- OVERVIEW -->
  <section class="section active" id="tab-overview">
    <div class="greet">
      <div class="greet-hi" id="greeting">Hello</div>
      <div class="greet-sub" id="greetingSub">Loading your data…</div>
    </div>

    <div class="scoreboard card">
      <div class="score-main">
        <div class="ring-wrap">
          <svg width="148" height="148" viewBox="0 0 148 148">
            <circle cx="74" cy="74" r="64" fill="none" stroke="#1d1d1d" stroke-width="12" />
            <circle id="scoreRing" cx="74" cy="74" r="64" fill="none" stroke="url(#ringGrad)" stroke-width="12" stroke-linecap="round" stroke-dasharray="402" stroke-dashoffset="402" />
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#b4ff39" /><stop offset="100%" stop-color="#34d399" /></linearGradient></defs>
          </svg>
          <div class="ring-label"><div class="n" id="scoreNum">—</div><div class="u">health score</div></div>
        </div>
        <div>
          <div class="score-word" id="scoreWord">—</div>
          <div class="score-summary" id="scoreSummary">Calculating…</div>
        </div>
      </div>
      <div class="score-parts" id="scoreParts"></div>
      <details class="more"><summary>How is this calculated?</summary><div>An average of four areas, each scored 0-100 against <em>your</em> data: Recovery (today's heart data vs your 30-day normal), Activity (exercise minutes vs 150/week and daily steps vs 8,000), Fitness (VO2max for your age plus how many days you were active) and Sleep (hours vs your goal). Areas without enough data are left out rather than guessed.</div></details>
    </div>

    <h2 class="sec">Today<span>How ready you are, and what to do about it</span></h2>
    <div class="trio" id="todayTrio"></div>
    ${reviewCard("today", "Today's call", "Train hard, train easy, or recover, with a plan for today.")}
    <div class="card">
      <h3>Your action items</h3>
      <div class="card-sub">Ranked by priority and worked out from your data. Each one comes with the reason.</div>
      <ul class="actions" id="overviewActions"><li class="sub">Loading…</li></ul>
    </div>

    <h2 class="sec">This week<span>The last 7 days, day by day</span></h2>
    <div class="card"><div class="week" id="weekStrip"></div>
      <div class="legend"><span><i class="lg-bar"></i>steps</span><span><i class="lg-dot on"></i>ring closed</span><span><i class="lg-dot"></i>ring missed</span></div>
    </div>
    <div class="highlights" id="highlights"></div>
    ${reviewCard("weekly", "Your week in review", "A coach's take on the last 7 days, and what to change next week.")}

    <h2 class="sec">Key numbers<span>Today, with the last 30 days behind it</span></h2>
    <div class="grid" id="quickStats"></div>
    <div class="untracked" id="untracked"></div>

    <h2 class="sec">The long view<span>Monthly averages over the last 12 months</span></h2>
    <div class="longview" id="longView"></div>
    <div class="card">
      <h3>Your weekly rhythm</h3>
      <div class="card-sub">Average steps for each day of the week, over the last 12 weeks.</div>
      <div id="weekdayBars"></div>
    </div>
    ${reviewCard("longterm", "Where you're heading", "Where the 12-month trends point, and the habits to build over the next 3 months.")}

    <h2 class="sec">Personal bests<span>Your all-time records</span></h2>
    <div class="card"><div class="bests" id="bestsGrid"></div></div>
  </section>

  <!-- AI ANALYST -->
  <section class="section" id="tab-ai">
    ${reviewCard("overview", "AI Insights")}

    <div class="card ai-card">
      <h3>✦ Ask my health data</h3>
      <div class="card-sub">Computed in code, not guessed by the model.</div>
      <form class="profile-form" onsubmit="askHealthQuestion(event)" style="margin-bottom:10px;">
        <input id="askInput" type="text" placeholder="e.g. How has my HRV changed over 90 days?" style="flex:1;" />
        <button type="submit" class="btn btn-sm" id="askBtn">Ask</button>
      </form>
      <div id="askBody"></div>
    </div>

    <div class="card ai-card">
      <h3>✦ Chart this for me</h3>
      <div class="card-sub">Real data, rendered by the app — the model only picks what to show.</div>
      <form class="profile-form" onsubmit="askForChart(event)" style="margin-bottom:10px;">
        <input id="chartInput" type="text" placeholder="e.g. Chart my steps and sleep over the last 60 days" style="flex:1;" />
        <button type="submit" class="btn btn-sm" id="chartAskBtn">Chart</button>
      </form>
      <div id="chartAskStatus" class="sub"></div>
      <canvas id="aiChartCanvas" style="display:none;"></canvas>
    </div>
  </section>

  <!-- DISCOVERIES -->
  <section class="section" id="tab-discoveries">
    ${reviewCard("discoveries", "Discoveries review", "What the patterns in your data suggest — and experiments to test them.")}
    <div class="card">
      <h3>Report
        <button class="btn btn-ghost btn-sm" onclick="loadReport('week')" style="margin-left:8px;">Week</button>
        <button class="btn btn-ghost btn-sm" onclick="loadReport('month')">Month</button>
      </h3>
      <div id="reportBody" class="sub">Loading…</div>
    </div>

    <div class="card">
      <h3>Discoveries</h3>
      <div class="card-sub">Correlation, not causation.</div>
      <div id="discoveriesBody" class="sub">Loading…</div>
    </div>

    <div class="card">
      <h3>Experiments</h3>
      <div class="card-sub">Before/after, not proof.</div>
      <form class="profile-form" onsubmit="createExperiment(event)" style="margin-bottom:12px;">
        <input id="expTitle" type="text" placeholder="e.g. Consistent 10:30pm bedtime" style="flex:1; min-width:160px;" />
        <select id="expMetric"></select>
        <input id="expStartDate" type="date" />
        <button type="submit" class="btn btn-sm">Start</button>
      </form>
      <div id="experimentsList"></div>
    </div>
  </section>

  <!-- TRAINING -->
  <section class="section" id="tab-training">
    ${reviewCard("training", "Training review", "Load, consistency and a prescription for the next 7 days.")}
    <div class="card">
      <h3>Action items</h3>
      <ul class="actions" id="trainingActions"><li class="sub">Loading…</li></ul>
    </div>
    <div id="trainingLoadStats" class="grid"></div>
    <div class="fit-grid" id="fitnessMetrics"></div>
    <div class="card">
      <h3>Fitness, fatigue &amp; form</h3>
      <div class="card-sub">Bars: daily load (0-21). Fitness = 42-day load (your base). Fatigue = 7-day load. Form = fitness − fatigue.</div>
      <div class="chart-box"><canvas id="loadChart"></canvas></div>
      <div class="guide"><div class="g-mean">Fitness rising slowly while form hovers between −5 and +3 is productive training. Form below −5 for days = overreaching; above +5 for weeks = detraining.</div><div class="g-act">Build fitness ~5-10% a week; every 3-4 weeks take an easier week to let form recover.</div></div>
    </div>
    <div class="card">
      <h3>Weekly volume (last 8 weeks)</h3>
      <div class="card-sub">Active day = ≥20 exercise minutes or a logged workout.</div>
      <div id="weeklyTable"></div>
    </div>
  </section>

  <!-- HEART & RECOVERY -->
  <section class="section" id="tab-heart">
    ${reviewCard("recovery", "Recovery review", "HRV, resting HR and how you bounce back from hard days.")}
    <div class="card"><h3>Resting heart rate &amp; HRV</h3><div class="chart-box"><canvas id="heartChart"></canvas></div><div data-guide="restingHeartRate,hrv"></div></div>
    <div class="card"><h3>Heart rate range (avg / min / max)</h3><div class="chart-box"><canvas id="hrRangeChart"></canvas></div><div data-guide="heartRateAvg,walkingHeartRateAvg"></div></div>
    <div class="card"><h3>VO2max trend</h3><div class="chart-box"><canvas id="vo2Chart"></canvas></div><div data-guide="vo2max"></div></div>
    <div class="card">
      <h3>Readiness, explained</h3>
      <div class="card-sub">HRV, resting HR, and sleep vs. <em>your</em> own 30-day baseline — never compared across people.</div>
      <div data-guide="readiness,strain,respiratoryRate,oxygenSaturation"></div>
    </div>
  </section>

  <!-- ACTIVITY & MOBILITY -->
  <section class="section" id="tab-activity">
    ${reviewCard("activity", "Activity review")}
    <div class="card"><h3>Steps</h3><div class="chart-box"><canvas id="stepsChart"></canvas></div><div data-guide="steps"></div></div>
    <div class="card"><h3>Active energy &amp; exercise minutes</h3><div class="chart-box"><canvas id="energyChart"></canvas></div><div data-guide="activeEnergy,exerciseMinutes"></div></div>
    <div class="card"><h3>Stand minutes &amp; flights climbed</h3><div class="chart-box"><canvas id="standChart"></canvas></div><div data-guide="standHours,flightsClimbed"></div></div>
    <div class="card"><h3>Walking speed &amp; gait quality</h3><div class="card-sub">Gait speed is one of the better-studied single predictors of healthy aging.</div><div class="chart-box"><canvas id="gaitChart"></canvas></div><div data-guide="walkingSpeed,walkingAsymmetryPct,walkingDoubleSupportPct"></div></div>
    <div class="card"><h3>Workouts</h3><div class="chart-box"><canvas id="workoutChart"></canvas></div><div data-guide="workoutMinutes"></div></div>
    <div class="card">
      <h3>Recent sessions</h3>
      <div id="workoutList" class="card-sub">No workout sessions in the imported data yet.</div>
    </div>
    <div class="card">
      <h3>Activity Rings</h3>
      <div class="card-sub">Move/Exercise/Stand goals from your export's Activity Summary, vs. today's actual.</div>
      <div id="activityRings" class="sub">No Activity Ring data in the imported data yet.</div>
    </div>
  </section>

  <!-- SLEEP -->
  <section class="section" id="tab-sleep">
    ${reviewCard("sleep", "Sleep review")}
    <div class="card"><h3>Sleep duration</h3><div class="chart-box"><canvas id="sleepChart"></canvas></div><div data-guide="sleepHours,sleepEfficiency"></div></div>
    <div class="card"><h3>Sleep stages</h3><div class="card-sub">Core, deep, REM and awake time, where your export has stage-level detail.</div><div class="chart-box"><canvas id="sleepStagesChart"></canvas></div><div data-guide="sleepDeepHours,sleepRemHours"></div></div>
    <div class="card"><h3>Weight</h3><div class="chart-box"><canvas id="weightChart"></canvas></div><div data-guide="weightKg,bodyFatPct"></div></div>
  </section>

  <!-- BIOLOGICAL AGE -->
  <section class="section" id="tab-age">
    ${reviewCard("body", "Body & bio-age review", "Which marker is ageing you most, and what moves it.")}
    <div class="card"><h3>Biological vs chronological age</h3><div class="chart-box"><canvas id="ageChart"></canvas></div><div data-guide="biologicalAge"></div></div>
    <div class="card">
      <h3>What's driving it</h3>
      <div class="card-sub">Closer to the left (younger) is better.</div>
      <div class="markers-list" id="markersList"></div>
    </div>
  </section>

  <!-- EVERYTHING ELSE -->
  <section class="section" id="tab-more">
    <div class="card">
      <h3>Everything else your export contained</h3>
      <div class="card-sub">Captured, but without a dedicated chart yet.</div>
      <div id="extraList"></div>
    </div>
  </section>

  <!-- SETTINGS -->
  <section class="section" id="tab-settings">
    <div class="card" id="profileCard">
      <h3>Profile</h3>
      <div class="card-sub">Needed once to compute biological age.</div>
      <form class="profile-form" onsubmit="saveProfile(event)">
        <input id="birthDate" type="date" required />
        <select id="sex"><option value="male">Male</option><option value="female">Female</option></select>
        <input id="heightCm" type="number" placeholder="Height (cm)" />
        <button type="submit" class="btn btn-sm">Save</button>
      </form>
    </div>
    <div class="card">
      <h3>Goals &amp; notes</h3>
      <div class="card-sub">Separate from sensor data. Never fed into any score.</div>
      <form onsubmit="saveKnowledge(event)" style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
        <textarea id="knowledgeGoals" placeholder="Goals (e.g. run a 10k by June, improve sleep consistency)" rows="2" style="background:var(--panel2); border:1px solid var(--line); border-radius:4px; color:var(--ink); padding:8px; font-family:inherit;"></textarea>
        <textarea id="knowledgePreferences" placeholder="Preferences (e.g. prefer morning workouts, strength 3x/week)" rows="2" style="background:var(--panel2); border:1px solid var(--line); border-radius:4px; color:var(--ink); padding:8px; font-family:inherit;"></textarea>
        <div style="display:flex; gap:8px; align-items:center;">
          <input id="knowledgeSleepTarget" type="number" step="0.5" placeholder="Sleep target (hr)" style="width:160px;" />
          <button type="submit" class="btn btn-sm">Save</button>
        </div>
      </form>
      <div class="card-sub">Daily check-in</div>
      <form class="profile-form" onsubmit="addKnowledgeNote(event)" style="margin-bottom:10px;">
        <input id="noteDate" type="date" />
        <input id="noteEnergy" type="number" min="1" max="10" placeholder="Energy 1-10" style="width:110px;" />
        <input id="noteSoreness" type="number" min="1" max="10" placeholder="Soreness 1-10" style="width:120px;" />
        <input id="noteText" type="text" placeholder="Note" style="flex:1; min-width:120px;" />
        <button type="submit" class="btn btn-sm">Log</button>
      </form>
      <div id="knowledgeNotesList"></div>
    </div>
    <div class="card">
      <h3>Import Apple Health export</h3>
      <p class="card-sub">iPhone: Health app → profile picture → Export All Health Data → share the .zip here. Parsing happens entirely in this browser; only the small daily summaries are sent to your Worker.</p>
      <div class="import-row">
        <input id="importFile" type="file" accept=".zip" />
        <button class="btn btn-sm" id="importBtn" onclick="importExportZip()">Import</button>
      </div>
      <progress id="importProgress" value="0" max="100" style="display:none;"></progress>
      <p id="importStatus" class="sub"></p>
    </div>
    <div class="card">
      <h3>Data coverage</h3>
      <div class="card-sub">Missing days are shown honestly, never filled in.</div>
      <div id="coverageSummary" class="sub">Loading…</div>
      <div id="coverageList"></div>
    </div>
    <div class="card">
      <h3>Personal baselines (30-day)</h3>
      <div class="card-sub">What's normal for <em>you</em>, not a population average.</div>
      <div id="baselineList"></div>
    </div>
    <div class="card">
      <h3>Export your data</h3>
      <p class="card-sub">Every stored day, every column discovered from your actual data — CSV, straight to your downloads.</p>
      <button class="btn btn-sm" onclick="exportCsv()" id="exportBtn">Download CSV</button>
      <p id="exportStatus" class="sub"></p>
    </div>
  </section>

  <footer>Estimates only, not medical advice. Data lives in your own GitHub repo.</footer>
</div>

<script>
function getToken() { try { return localStorage.getItem('healthToken') || ''; } catch (e) { return ''; } }
function saveToken() {
  var t = document.getElementById('tokenInput').value.trim();
  if (!t) return;
  try { localStorage.setItem('healthToken', t); } catch (e) {}
  boot().catch(function () {});
}

async function authedFetch(path, opts) {
  opts = opts || {};
  var token = getToken();
  var res = await fetch(path, Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + token }) }));
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) {
    var errBody = null;
    try { errBody = await res.json(); } catch (e) {}
    throw new Error((errBody && errBody.error) || ('request failed: ' + res.status));
  }
  return res.json();
}

function fmt(n, d) {
  d = d || 0;
  return (n === null || n === undefined) ? '—' : Number(n).toFixed(d);
}
function fmtCompact(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString();
}
function timeAgo(iso) {
  if (!iso) return '';
  var ms = Date.now() - new Date(iso).getTime();
  var min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  var hr = Math.round(min / 60);
  if (hr < 24) return hr + 'h ago';
  return Math.round(hr / 24) + 'd ago';
}

var reviewLoadedOnce = {};
var appBooted = false;
var TAB_REVIEWS = { overview: ['today', 'weekly', 'longterm'], training: ['training'], heart: ['recovery'], activity: ['activity'], sleep: ['sleep'], age: ['body'], discoveries: ['discoveries'], ai: ['overview'] };
function showTab(id) {
  document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelector('.tab[data-tab="' + id + '"]').classList.add('active');
  try { localStorage.setItem('healthTab', id); } catch (e) {}

  // AI reviews are slow on a cache miss (an LLM call), so each is loaded
  // lazily on first visit to its tab rather than all at once in boot().
  if (appBooted) (TAB_REVIEWS[id] || []).forEach(function (domain) {
    if (!reviewLoadedOnce[domain]) { reviewLoadedOnce[domain] = true; loadReview(domain, false); }
  });
}

async function saveProfile(e) {
  e.preventDefault();
  var birthDate = document.getElementById('birthDate').value;
  var sex = document.getElementById('sex').value;
  var heightCm = Number(document.getElementById('heightCm').value) || undefined;
  await authedFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birthDate: birthDate, sex: sex, heightCm: heightCm }) });
  boot().catch(function () {});
}

async function loadKnowledge() {
  try {
    var k = await authedFetch('/api/knowledge');
    document.getElementById('knowledgeGoals').value = k.goals || '';
    document.getElementById('knowledgePreferences').value = k.preferences || '';
    document.getElementById('knowledgeSleepTarget').value = k.sleepTargetHours || '';
    renderKnowledgeNotes(k.notes || []);
  } catch (err) {
    document.getElementById('knowledgeNotesList').textContent = 'Could not load (' + err.message + ').';
  }
}

function renderKnowledgeNotes(notes) {
  var el = document.getElementById('knowledgeNotesList');
  var recent = notes.slice(-10).reverse();
  if (recent.length === 0) { el.innerHTML = '<div class="sub">No check-ins logged yet.</div>'; return; }
  el.innerHTML = '<table class="simple-table"><tbody>' + recent.map(function (n) {
    var parts = [n.date];
    if (n.energy) parts.push('energy ' + n.energy + '/10');
    if (n.soreness) parts.push('soreness ' + n.soreness + '/10');
    if (n.note) parts.push(n.note);
    return '<tr><td>' + parts.join('</td><td>') + '</td><td><button class="btn btn-ghost btn-sm" onclick="deleteKnowledgeNote(\\'' + n.date + '\\')">Delete</button></td></tr>';
  }).join('') + '</tbody></table>';
}

async function saveKnowledge(evt) {
  evt.preventDefault();
  var goals = document.getElementById('knowledgeGoals').value;
  var preferences = document.getElementById('knowledgePreferences').value;
  var sleepTargetHours = Number(document.getElementById('knowledgeSleepTarget').value) || undefined;
  await authedFetch('/api/knowledge', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goals: goals, preferences: preferences, sleepTargetHours: sleepTargetHours }) });
}

async function addKnowledgeNote(evt) {
  evt.preventDefault();
  var date = document.getElementById('noteDate').value || new Date().toISOString().slice(0, 10);
  var energy = Number(document.getElementById('noteEnergy').value) || undefined;
  var soreness = Number(document.getElementById('noteSoreness').value) || undefined;
  var note = document.getElementById('noteText').value || undefined;
  var res = await authedFetch('/api/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: date, energy: energy, soreness: soreness, note: note }) });
  document.getElementById('noteText').value = '';
  loadKnowledge();
}

async function deleteKnowledgeNote(date) {
  await authedFetch('/api/knowledge/notes?date=' + encodeURIComponent(date), { method: 'DELETE' });
  loadKnowledge();
}

var charts = {};
function chartHasData(config) {
  var datasets = (config.data && config.data.datasets) || [];
  for (var i = 0; i < datasets.length; i++) {
    var arr = datasets[i].data || [];
    for (var j = 0; j < arr.length; j++) {
      var v = arr[j];
      if (v !== null && v !== undefined && !Number.isNaN(v)) return true;
    }
  }
  return false;
}

function upsertChart(id, config) {
  var el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }

  var emptyEl = document.getElementById(id + 'Empty');
  if (!chartHasData(config)) {
    el.style.display = 'none';
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.id = id + 'Empty';
      emptyEl.className = 'chart-empty';
      emptyEl.textContent = 'No data for this yet — import your Apple Health export to populate it.';
      el.parentElement.insertBefore(emptyEl, el);
    }
    return;
  }
  if (emptyEl) emptyEl.remove();
  el.style.display = '';

  config.options = Object.assign({ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{ legend:{ labels:{ color:'#8a8a8a', boxWidth:10, font:{size:11, family:"'IBM Plex Mono',monospace"} } } },
    scales:{ x:{ ticks:{ color:'#8a8a8a', maxTicksLimit:8, font:{size:10, family:"'IBM Plex Mono',monospace"} }, grid:{ color:'#262626' } },
             y:{ ticks:{ color:'#8a8a8a', font:{size:10, family:"'IBM Plex Mono',monospace"} }, grid:{ color:'#262626' } } } }, config.options || {});
  el.parentElement.style.height = '240px';
  charts[id] = new Chart(el, config);
}

function last(arr) { return arr.length ? arr[arr.length - 1] : undefined; }

function trendArrow(curr, prev) {
  if (curr === null || prev === null || curr === undefined || prev === undefined || prev === 0) return { cls: 'flat', text: '' };
  var pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 1) return { cls: 'flat', text: 'steady' };
  var up = pct > 0;
  return { cls: up ? 'up' : 'down', text: (up ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + '%' };
}

// A concrete, actionable training-load readout: 7-day exercise volume and
// workout frequency vs. the prior week, with a plain-language load status
// instead of just raw numbers.
function renderTrainingLoad(trends) {
  var l7 = trends.last7, p7 = trends.prev7;
  var exMin = l7.exerciseMinutes, prevExMin = p7.exerciseMinutes;
  var html = '';
  var tile = function (label, value, unit, trend, key, v) {
    return '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</div>' +
      (trend.text ? '<div class="trend ' + trend.cls + '">' + trend.text + ' vs last week</div>' : '<div class="trend flat">—</div>') + miniGuide(key, v) + '</div>';
  };
  html += tile('Exercise / day (7-day avg)', fmtCompact(exMin), 'min', trendArrow(exMin, prevExMin), 'exerciseMinutes', exMin);
  html += tile('Active energy / day (7-day avg)', fmtCompact(l7.activeEnergy), 'kcal', trendArrow(l7.activeEnergy, p7.activeEnergy), 'activeEnergy', l7.activeEnergy);
  html += tile('Steps / day (7-day avg)', fmtCompact(l7.steps), '', trendArrow(l7.steps, p7.steps), 'steps', l7.steps);

  var status = 'Not enough data';
  if (exMin !== null && exMin !== undefined) {
    if (exMin < 90) status = 'Low volume this week';
    else if (prevExMin !== null && prevExMin !== undefined && exMin > prevExMin * 1.15) status = 'Building — up from last week';
    else if (prevExMin !== null && prevExMin !== undefined && exMin < prevExMin * 0.85) status = 'Tapering — down from last week';
    else status = 'Steady — holding last week\\'s volume';
  }
  html += '<div class="stat"><div class="label">Load status</div><div class="value" style="font-size:16px;">' + status + '</div></div>';
  document.getElementById('trainingLoadStats').innerHTML = html;
}

function renderBests(bests) {
  var defs = [
    ['Lowest resting HR', bests.lowestRestingHeartRate, 'bpm', 0],
    ['Highest HRV', bests.highestHrv, 'ms', 0],
    ['Highest VO2max', bests.highestVo2max, '', 1],
    ['Most steps in a day', bests.mostSteps, '', 0],
    ['Fastest gait speed', bests.fastestWalkingSpeed, 'm/s', 2],
    ['Longest exercise', bests.longestExerciseMinutes, 'min', 0],
  ];
  document.getElementById('bestsGrid').innerHTML = defs.map(function (d) {
    var name = d[0], b = d[1], unit = d[2], dp = d[3];
    if (!b) return '<div class="best"><div class="label">' + name + '</div><div class="value">—</div></div>';
    return '<div class="best"><div class="label">' + name + '</div><div class="value">' + fmt(b.value, dp) + (unit ? ' ' + unit : '') + '</div><div class="date">' + b.date + '</div></div>';
  }).join('');
}

function renderExtraMetrics(days) {
  var el = document.getElementById('extraList');
  var latest = null;
  for (var i = days.length - 1; i >= 0; i--) {
    if (days[i].extra && Object.keys(days[i].extra).length) { latest = days[i]; break; }
  }
  if (!latest) { el.innerHTML = '<p class="sub">Nothing extra captured yet — re-run Import once your export has more record types, or they\\'ll show up here automatically.</p>'; return; }
  var keys = Object.keys(latest.extra).sort();
  el.innerHTML = '<p class="sub" style="margin-bottom:10px;">As of ' + latest.date + ':</p><div class="extra-grid">' + keys.map(function (k) {
    var g = METRIC_GUIDE[k];
    return '<div class="extra-tile"><div class="label">' + (g ? g.label : k.replace(/([A-Z])/g, ' $1').trim()) + '</div><div class="value">' + fmt(latest.extra[k], 2) + '</div>' +
      (g ? miniGuide(k, latest.extra[k]) : '<div class="g-mini">Raw Apple Health reading — no interpretation available yet.</div>') + '</div>';
  }).join('') + '</div>';
}

function renderActivityRings(today) {
  var el = document.getElementById('activityRings');
  if (!today || (today.activeEnergyGoal === undefined && today.exerciseMinutesGoal === undefined && today.standHoursGoal === undefined && today.standHours === undefined)) {
    return; // leave the default "no data yet" message in place
  }
  var rings = [
    { label: 'Move', actual: today.activeEnergy, goal: today.activeEnergyGoal, unit: 'kcal', color: '#f76b4d' },
    { label: 'Exercise', actual: today.exerciseMinutes, goal: today.exerciseMinutesGoal, unit: 'min', color: '#34d399' },
    { label: 'Stand', actual: today.standHours, goal: today.standHoursGoal, unit: 'hr', color: '#b4ff39' },
  ];
  el.innerHTML = '<div class="grid">' + rings.map(function (r) {
    if (r.goal === undefined) return '';
    var pct = r.actual !== undefined ? Math.round((r.actual / r.goal) * 100) : 0;
    return '<div class="stat"><div class="label" style="color:' + r.color + ';">' + r.label + '</div><div class="value">' + fmt(r.actual, 0) + ' / ' + fmt(r.goal, 0) + ' ' + r.unit + '</div><div class="trend flat">' + pct + '% of goal</div></div>';
  }).join('') + '</div>';
}

function renderMarkers(latest) {
  var el = document.getElementById('markersList');
  if (!latest || !latest.markers.length) { el.innerHTML = '<p class="sub">No markers yet.</p>'; return; }
  var colors = ['#b4ff39', '#60a5fa', '#f76b4d', '#34d399', '#fbbf24'];
  el.innerHTML = latest.markers.map(function (m, i) {
    var pct = Math.max(4, Math.min(100, (m.markerAge / 90) * 100));
    return '<div class="marker-row"><div class="mname">' + m.marker + '</div>' +
      '<div class="marker-bar"><div style="width:' + pct + '%;background:' + colors[i % colors.length] + '"></div></div>' +
      '<div class="mval">' + fmt(m.markerAge, 0) + 'y</div></div>';
  }).join('');
}

// ---------------- overview: plain-language building blocks ----------------
var STATUS_WORD = { good: 'Good', ok: 'OK', watch: 'Watch', bad: 'Act now', unknown: 'No data' };
function pill(status, text) { return status ? '<span class="pill p-' + status + '">' + (text || STATUS_WORD[status] || status) + '</span>' : ''; }
function more(text, label) { return text ? '<details class="more"><summary>' + (label || 'What does this mean?') + '</summary><div>' + text + '</div></details>' : ''; }
function scoreStatus(n) { return n === null || n === undefined ? 'unknown' : n >= 65 ? 'good' : n >= 50 ? 'ok' : n >= 35 ? 'watch' : 'bad'; }
function scoreColor(n) { return { good: '#34d399', ok: '#b4ff39', watch: '#fbbf24', bad: '#f76b4d', unknown: '#555' }[scoreStatus(n)]; }
function compact(n) { if (n === null || n === undefined) return '—'; return n >= 10000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)); }
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function niceDate(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1]; }

// Tiny inline SVG trend line (nulls skipped, not drawn as zero).
function spark(values, color, h) {
  h = h || 30;
  var w = 100;
  var pts = [];
  values.forEach(function (v, i) { if (typeof v === 'number') pts.push([i, v]); });
  if (pts.length < 2) return '';
  var ys = pts.map(function (p) { return p[1]; });
  var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys), span = (max - min) || 1;
  var n = Math.max(1, values.length - 1);
  var d = pts.map(function (p, j) { return (j ? 'L' : 'M') + (p[0] / n * w).toFixed(2) + ' ' + (h - 3 - (p[1] - min) / span * (h - 6)).toFixed(2); }).join(' ');
  var lp = pts[pts.length - 1];
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="' + h + '">' +
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" />' +
    '<circle cx="' + (lp[0] / n * w).toFixed(2) + '" cy="' + (h - 3 - (lp[1] - min) / span * (h - 6)).toFixed(2) + '" r="2.5" fill="' + color + '" vector-effect="non-scaling-stroke" /></svg>';
}

function workoutName(t) {
  if (!t) return null;
  var w = t.replace(/^HKWorkoutActivityType/, '').replace(/^(Traditional|Functional)(?=StrengthTraining)/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function renderGreeting(days) {
  var h = new Date().getHours();
  document.getElementById('greeting').textContent = h < 5 ? 'Late night check-in' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  var lastDate = days.length ? days[days.length - 1].date : null;
  document.getElementById('greetingSub').textContent = lastDate
    ? 'Here is where you stand. Data synced up to ' + niceDate(lastDate) + '.'
    : 'No data yet. Import your Apple Health export in Settings.';
}

function renderTodayTrio(trends, bio) {
  var tiles = [];
  var r = trends.readinessScore;
  if (r !== null && r !== undefined) {
    var g = guideFor('readiness', r);
    tiles.push({ label: 'Readiness', val: r + '<small>/100</small>', status: g.status, word: r >= 70 ? 'Recovered' : r >= 45 ? 'Partly recovered' : 'Still recovering', act: g.action, meaning: g.meaning });
  }
  var st = trends.todayStrain;
  if (st !== null && st !== undefined) {
    var gs = guideFor('strain', st);
    tiles.push({ label: "Today's strain", val: fmt(st, 1) + '<small>/21</small>', status: gs.status, word: st >= 18 ? 'All-out' : st >= 14 ? 'Hard' : st >= 8 ? 'Moderate' : 'Light', act: gs.action, meaning: gs.meaning });
  }
  if (bio) {
    var gb = guideFor('biologicalAge', bio.deltaYears);
    tiles.push({ label: 'Biological age', val: fmt(bio.biologicalAge, 0) + '<small> yrs</small>', status: gb.status,
      word: (bio.deltaYears > 0 ? '+' : '') + fmt(bio.deltaYears, 1) + ' vs your age (' + fmt(bio.chronologicalAge, 0) + ')', act: gb.action, meaning: gb.meaning });
  } else {
    tiles.push({ label: 'Biological age', val: '—', status: 'unknown', word: 'Not set up', act: 'Add your birth date in Settings to see it.', meaning: METRIC_GUIDE.biologicalAge.meaning });
  }
  document.getElementById('todayTrio').innerHTML = tiles.map(function (t) {
    return '<div class="t"><div class="t-label">' + t.label + '</div><div class="t-val">' + t.val + '</div>' + pill(t.status || 'ok', t.word) +
      '<div class="t-act">' + t.act + '</div>' + more(t.meaning) + '</div>';
  }).join('');
}

function renderScore(score) {
  var ring = document.getElementById('scoreRing');
  var n = score.overall;
  document.getElementById('scoreNum').textContent = n === null ? '—' : n;
  document.getElementById('scoreWord').textContent = score.word;
  document.getElementById('scoreWord').style.color = scoreColor(n);
  document.getElementById('scoreSummary').textContent = score.summary;
  ring.setAttribute('stroke-dashoffset', String(402 * (1 - Math.max(0.03, (n || 0) / 100))));
  document.getElementById('scoreParts').innerHTML = score.parts.map(function (p) {
    return '<div class="score-part"><div class="sp-top"><span class="sp-name">' + p.label + ' ' + pill(scoreStatus(p.score), p.word) + '</span>' +
      '<span class="sp-num" style="color:' + scoreColor(p.score) + '">' + (p.score === null ? '—' : p.score) + '</span></div>' +
      '<div class="sp-bar"><div style="width:' + (p.score || 0) + '%;background:' + scoreColor(p.score) + '"></div></div>' +
      '<div class="sp-detail">' + p.detail + '</div></div>';
  }).join('');
}

function renderWeekStrip(week) {
  var el = document.getElementById('weekStrip');
  if (!week.length) { el.innerHTML = '<p class="sub">No data yet.</p>'; return; }
  var max = Math.max.apply(null, week.map(function (d) { return d.steps || 0; }).concat([10000]));
  el.innerHTML = week.map(function (d, i) {
    var rings = '';
    for (var k = 0; k < d.ringsTracked; k++) rings += '<span class="' + (k < d.ringsClosed ? 'ring-on' : 'ring-off') + '">●</span>';
    var title = niceDate(d.date) + ': ' + (d.steps !== null ? Math.round(d.steps).toLocaleString() + ' steps' : 'no steps') + (d.exerciseMinutes !== null ? ', ' + d.exerciseMinutes + ' exercise min' : '') + (d.ringsTracked ? ', ' + d.ringsClosed + '/' + d.ringsTracked + ' rings' : '');
    return '<div class="wd' + (i === week.length - 1 ? ' today' : '') + '" title="' + title + '"><div class="w-name">' + (i === week.length - 1 ? 'Today' : d.weekday) + '</div>' +
      '<div class="w-barbox"><div class="w-bar" style="height:' + Math.round(((d.steps || 0) / max) * 100) + '%;' + ((d.steps || 0) >= 8000 ? '' : 'opacity:.45;') + '"></div></div>' +
      '<div class="w-steps">' + compact(d.steps) + '</div><div class="w-rings">' + (rings || '&nbsp;') + '</div>' +
      '<div class="w-type">' + (d.workoutType || (d.exerciseMinutes ? d.exerciseMinutes + ' min' : '')) + '</div></div>';
  }).join('');
}

function renderHighlights(list) {
  var el = document.getElementById('highlights');
  if (!list.length) { el.innerHTML = ''; return; }
  var icon = { win: '▲', watch: '!', info: 'i' };
  el.innerHTML = list.map(function (h) {
    return '<div class="hl ' + h.tone + '"><div class="hl-ic">' + icon[h.tone] + '</div><div><div class="hl-title">' + h.title + '</div><div class="hl-detail">' + h.detail + '</div></div></div>';
  }).join('');
}

var LONG_VIEW = [
  { key: 'steps', label: 'Daily steps', unit: '', dp: 0, up: true, color: '#34d399' },
  { key: 'exerciseMinutes', label: 'Exercise minutes / day', unit: 'min', dp: 0, up: true, color: '#b4ff39' },
  { key: 'restingHeartRate', label: 'Resting heart rate', unit: 'bpm', dp: 0, up: false, color: '#f76b4d' },
  { key: 'hrv', label: 'HRV', unit: 'ms', dp: 0, up: true, color: '#60a5fa' },
  { key: 'vo2max', label: 'VO2max', unit: '', dp: 1, up: true, color: '#a78bfa' },
  { key: 'weightKg', label: 'Weight', unit: 'kg', dp: 1, up: null, color: '#fbbf24' },
];

function renderLongView(monthly, pattern) {
  var el = document.getElementById('longView');
  el.innerHTML = LONG_VIEW.map(function (m) {
    var vals = monthly.map(function (p) { return p[m.key]; });
    var present = monthly.filter(function (p) { return typeof p[m.key] === 'number'; });
    if (present.length < 2) return '';
    var first = present[0], lastP = present[present.length - 1];
    var a = first[m.key], b = lastP[m.key];
    var pct = a ? ((b - a) / Math.abs(a)) * 100 : 0;
    var status = 'unknown', word = 'Steady';
    if (Math.abs(pct) >= 3) {
      var better = m.up === null ? null : (pct > 0) === m.up;
      status = better === null ? 'ok' : better ? 'good' : 'watch';
      word = better === null ? (pct > 0 ? 'Rising' : 'Falling') : better ? 'Improving' : 'Slipping';
    } else { status = 'ok'; }
    var fmtV = function (v) { return m.dp ? v.toFixed(m.dp) : Math.round(v).toLocaleString(); };
    return '<div class="lv"><div class="lv-label"><span>' + m.label + '</span>' + pill(status, word) + '</div>' +
      '<div class="lv-val">' + fmtV(b) + ' <small>' + m.unit + ' in ' + MONTHS[Number(lastP.month.slice(5)) - 1] + '</small></div>' +
      spark(vals, m.color, 34) +
      '<div class="lv-note">' + (pct >= 0 ? '+' : '') + pct.toFixed(0) + '% since ' + MONTHS[Number(first.month.slice(5)) - 1] + ' ' + first.month.slice(0, 4) + ' (' + fmtV(a) + ')</div></div>';
  }).join('') || '<p class="sub">Not enough monthly history yet.</p>';

  var wk = document.getElementById('weekdayBars');
  var order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var byDay = {};
  pattern.forEach(function (p) { byDay[p.weekday] = p; });
  var maxS = Math.max.apply(null, pattern.map(function (p) { return p.avgSteps || 0; }).concat([1]));
  wk.innerHTML = order.map(function (d) {
    var p = byDay[d] || {};
    var v = p.avgSteps || 0;
    return '<div class="wk-row"><span>' + d + '</span><div class="wk-bar"><div style="width:' + (v / maxS * 100) + '%;' + (v >= 8000 ? '' : 'opacity:.5;') + '"></div></div><span class="wk-n">' + compact(p.avgSteps) + '</span></div>';
  }).join('');
}

async function loadOverview() {
  try {
    var o = await authedFetch('/api/overview');
    renderScore(o.score);
    renderWeekStrip(o.week || []);
    renderHighlights(o.highlights || []);
    renderLongView(o.monthly || [], o.weekdayPattern || []);
  } catch (err) {
    document.getElementById('scoreSummary').textContent = 'Could not load (' + err.message + ').';
  }
}

// Latest reading of a field within the last N days (some metrics,
// like VO2max or weight, aren't measured daily).
function latestReading(key, within) {
  var recent = GUIDE_DAYS.slice(-(within || 30));
  for (var i = recent.length - 1; i >= 0; i--) if (typeof recent[i][key] === 'number') return { value: recent[i][key], date: recent[i].date };
  return null;
}

function statTile(def, trends) {
  var l7 = trends.last7, p7 = trends.prev7;
  var reading = latestReading(def.key, 30);
  if (!reading) return null;
  var isToday = reading.date === GUIDE_DAYS[GUIDE_DAYS.length - 1].date;
  var trend = trendArrow(l7[def.key], p7[def.key]);
  var cls = trend.cls;
  if (cls !== 'flat' && def.up === false) cls = (cls === 'up') ? 'down' : 'up';
  if (def.up === null) cls = 'flat';
  var color = cls === 'up' ? '#34d399' : cls === 'down' ? '#f76b4d' : '#8a8a8a';
  var series = GUIDE_DAYS.slice(-30).map(function (d) { return typeof d[def.key] === 'number' ? d[def.key] : null; });
  var guideVal = l7[def.key] !== null && l7[def.key] !== undefined ? l7[def.key] : reading.value;
  var shown = def.dp === 0 && reading.value >= 1000 ? Math.round(reading.value).toLocaleString() : fmt(reading.value, def.dp);
  return '<div class="stat"><div class="label">' + def.label + '</div><div class="value">' + shown + (def.unit ? '<span class="unit">' + def.unit + '</span>' : '') +
    (isToday ? '' : '<span class="asof">' + niceDate(reading.date) + '</span>') + '</div>' +
    (trend.text ? '<div class="trend ' + cls + '">' + trend.text + ' vs last week (7-day avg)</div>' : '<div class="trend flat">not enough data to compare weeks</div>') +
    spark(series, color, 28) + miniGuide(def.key, guideVal) + '</div>';
}

var KEY_NUMBERS = [
  { key: 'steps', label: 'Steps', unit: '', dp: 0, up: true },
  { key: 'exerciseMinutes', label: 'Exercise', unit: 'min', dp: 0, up: true },
  { key: 'restingHeartRate', label: 'Resting heart rate', unit: 'bpm', dp: 0, up: false },
  { key: 'hrv', label: 'HRV', unit: 'ms', dp: 0, up: true },
  { key: 'vo2max', label: 'VO2max', unit: '', dp: 1, up: true },
  { key: 'walkingSpeed', label: 'Walking speed', unit: 'm/s', dp: 2, up: true },
  { key: 'sleepHours', label: 'Sleep', unit: 'hr', dp: 1, up: true },
  { key: 'weightKg', label: 'Weight', unit: 'kg', dp: 1, up: null },
];

function renderQuickStats(today, trends) {
  var untracked = [];
  var html = KEY_NUMBERS.map(function (def) {
    var t = GUIDE_DAYS.length ? statTile(def, trends) : null;
    if (!t) untracked.push(def.label.toLowerCase());
    return t || '';
  }).join('');
  document.getElementById('quickStats').innerHTML = html;
  document.getElementById('untracked').textContent = untracked.length
    ? 'Not tracked in the last 30 days: ' + untracked.join(', ') + '. ' + untracked.map(function (u) {
        var k = KEY_NUMBERS.filter(function (d) { return d.label.toLowerCase() === u; })[0];
        return METRIC_GUIDE[k.key] ? METRIC_GUIDE[k.key].fallback : '';
      }).join(' ')
    : '';
}

// ---------------- metric guide: meaning + what to do ----------------
// Data from src/metricGuide.ts, serialised at render time so the copy lives
// in one (tested) place.
var METRIC_GUIDE = ${JSON.stringify(METRIC_GUIDE)};
var GUIDE_VALUES = {}; // values not on daily rows (readiness, strain, bio-age delta)
var GUIDE_DAYS = [];
var PCT_KEYS = { oxygenSaturation: 1, walkingAsymmetryPct: 1, walkingDoubleSupportPct: 1, sleepEfficiency: 1 };

function guideFor(key, v) {
  var e = METRIC_GUIDE[key];
  if (!e) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) {
    for (var i = 0; i < e.rules.length; i++) {
      var r = e.rules[i];
      var hit = r.op === '<' ? v < r.value : r.op === '<=' ? v <= r.value : r.op === '>' ? v > r.value : v >= r.value;
      if (hit) return { meaning: e.meaning, status: r.status, action: r.action };
    }
  }
  return { meaning: e.meaning, status: null, action: e.fallback };
}

// 7-day mean of a field (or extra[field]) — what "your current value" means
// for a chart card, smoothing over a single odd day.
function recentValue(key) {
  if (GUIDE_VALUES[key] !== undefined) return GUIDE_VALUES[key];
  var vals = GUIDE_DAYS.slice(-7).map(function (d) { return d[key] !== undefined ? d[key] : (d.extra ? d.extra[key] : undefined); })
    .filter(function (v) { return typeof v === 'number'; });
  return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
}

function fmtGuideValue(key, v) {
  if (v === null || v === undefined) return '—';
  if (PCT_KEYS[key]) return (v * 100).toFixed(1) + '%';
  if (key === 'biologicalAge') return (v > 0 ? '+' : '') + v.toFixed(1) + ' yrs vs actual';
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toString();
}

function guideBlock(key) {
  var e = METRIC_GUIDE[key];
  if (!e) return '';
  var v = recentValue(key);
  var g = guideFor(key, v);
  var valLabel = GUIDE_VALUES[key] !== undefined ? 'now' : '7-day avg';
  return '<div class="guide"><div class="g-top"><span class="g-name">' + e.label + '</span>' +
    (v !== null ? '<span class="g-val">' + fmtGuideValue(key, v) + '</span><span class="faint">' + valLabel + '</span>' : '') + pill(g.status) + '</div>' +
    (g.action ? '<div class="g-act s-' + (g.status || 'ok') + '">' + g.action + '</div>' : '') + more(g.meaning) + '</div>';
}

function miniGuide(key, v) {
  var g = guideFor(key, v);
  if (!g) return '';
  return '<div class="g-mini">' + pill(g.status) + ' ' + g.action + more(g.meaning) + '</div>';
}

function fillGuides() {
  document.querySelectorAll('[data-guide]').forEach(function (el) {
    el.innerHTML = el.getAttribute('data-guide').split(',').map(guideBlock).join('');
  });
}

// ---------------- training & fitness ----------------
function renderActionItems(elId, items, limit) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!items || items.length === 0) { el.innerHTML = '<li class="sub">Nothing flagged — keep the current plan.</li>'; return; }
  el.innerHTML = items.slice(0, limit || items.length).map(function (a) {
    return '<li><span class="prio ' + a.priority + '">' + a.priority + '</span><div><div class="a-text">' + a.text + '</div><div class="a-why">' + a.area + ' · ' + a.why + '</div></div></li>';
  }).join('');
}

function renderFitnessMetrics(metrics) {
  var el = document.getElementById('fitnessMetrics');
  if (!metrics.length) { el.innerHTML = '<p class="sub">Not enough data yet.</p>'; return; }
  el.innerHTML = metrics.map(function (m) {
    return '<div class="fit ' + m.status + '"><div class="fit-top"><span class="label">' + m.label + '</span>' + pill(m.status) + '</div><div class="value">' + m.display + '</div>' +
      '<div class="act">' + m.action + '</div>' + more(m.meaning) + '</div>';
  }).join('');
}

function renderWeekly(weeks) {
  var el = document.getElementById('weeklyTable');
  if (!weeks.length) { el.innerHTML = '<p class="sub">No data yet.</p>'; return; }
  el.innerHTML = '<table class="simple-table"><thead><tr class="faint"><td>Week of</td><td>Active days</td><td>Exercise</td><td>Workouts</td><td>Distance</td><td>Load</td></tr></thead><tbody>' +
    weeks.slice().reverse().map(function (w) {
      return '<tr><td>' + w.weekStart + '</td><td>' + w.activeDays + '/7</td><td>' + w.exerciseMinutes + ' min</td><td>' + w.workouts + '</td><td>' + w.distanceKm + ' km</td><td>' + w.load + '</td></tr>';
    }).join('') + '</tbody></table>';
}

async function loadFitness() {
  try {
    var f = await authedFetch('/api/fitness');
    renderActionItems('overviewActions', f.actionItems, 4);
    renderActionItems('trainingActions', f.actionItems);
    renderFitnessMetrics(f.metrics || []);
    renderWeekly(f.weekly || []);
    var s = f.loadSeries || [];
    upsertChart('loadChart', { type: 'bar', data: { labels: s.map(function (p) { return p.date; }), datasets: [
      { type: 'bar', label: 'Daily load', data: s.map(function (p) { return p.load; }), backgroundColor: '#ffffff22', order: 3 },
      { type: 'line', label: 'Fitness', data: s.map(function (p) { return p.fitness; }), borderColor: '#b4ff39', pointRadius: 0, borderWidth: 2, tension: .3, order: 1 },
      { type: 'line', label: 'Fatigue', data: s.map(function (p) { return p.fatigue; }), borderColor: '#f76b4d', pointRadius: 0, borderWidth: 1.5, tension: .3, order: 1 },
      { type: 'line', label: 'Form', data: s.map(function (p) { return p.form; }), borderColor: '#60a5fa', borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, tension: .3, order: 1 },
    ]}});
  } catch (err) {
    ['overviewActions', 'trainingActions'].forEach(function (id) { var el = document.getElementById(id); if (el) el.innerHTML = '<li class="sub">Could not load (' + err.message + ').</li>'; });
  }
}

// Generic AI review loader — same KV-cached-for-an-hour-with-retry
// architecture for every domain (overview/training/sleep/...); only the
// domain query param and the target DOM ids change per call site.
async function loadReview(domain, force) {
  var btn = document.getElementById('review-' + domain + '-btn');
  var body = document.getElementById('review-' + domain);
  if (!btn || !body) return;
  reviewLoadedOnce[domain] = true;
  btn.disabled = true;
  var slow = setTimeout(function () {
    if (body.querySelector('.skeleton') && !body.querySelector('.ai-loading')) body.insertAdjacentHTML('beforeend', '<div class="ai-loading">Writing your review from your latest data. The first run takes about 30 seconds.</div>');
  }, 2500);
  if (force) body.innerHTML = '<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:55%"></div>';
  try {
    var res = await authedFetch('/api/insights?domain=' + domain + (force ? '&force=1' : ''));
    var ins = res.insights;
    var html = '<div class="ai-headline">' + ins.headline + '</div>';
    if (ins.recommendations && ins.recommendations.length) {
      html += '<div class="ai-section-title">Do next</div><ul class="ai-list recs">' + ins.recommendations.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="ai-section-title">What the data shows</div><ul class="ai-list">' + ins.insights.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    if (ins.concerns && ins.concerns.length) {
      html += '<div class="ai-section-title">Keep an eye on</div><ul class="ai-list concerns">' + ins.concerns.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="ai-meta">' + (res.cached ? 'Cached · generated ' + timeAgo(res.generatedAt) : 'Freshly generated') + '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<p class="sub">Couldn\\'t load this review (' + err.message + ').</p>';
  } finally {
    clearTimeout(slow);
    btn.disabled = false;
  }
}

function loadInsights(force) { return loadReview('overview', force); }

// The Overview tab gets a compact version of the same overview-domain
// review (headline + top action items only, no retry button of its own)
// so "how am I doing + what should I do" is visible without switching to
// the AI Analyst tab. Same cache entry as loadInsights — no extra LLM cost.
async function askHealthQuestion(evt) {
  evt.preventDefault();
  var input = document.getElementById('askInput');
  var question = input.value.trim();
  if (!question) return;
  var btn = document.getElementById('askBtn');
  var body = document.getElementById('askBody');
  btn.disabled = true;
  body.innerHTML = '<div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div>';
  try {
    var res = await authedFetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question }) });
    var r = res.result;
    var meta = r.sampleCount + ' day' + (r.sampleCount === 1 ? '' : 's') + ' of data, ' + r.spec.startDate + ' to ' + r.spec.endDate + ' (' + r.spec.metric + ', ' + r.spec.aggregation + ')';
    body.innerHTML = '<div class="ai-headline">' + res.answer + '</div><div class="ai-meta">' + meta + '</div>';
  } catch (err) {
    body.innerHTML = '<p class="sub">Couldn\\'t answer that (' + err.message + ').</p>';
  } finally {
    btn.disabled = false;
  }
}

var AI_CHART_COLORS = ['#b4ff39', '#fbbf24', '#34d399'];

async function askForChart(evt) {
  evt.preventDefault();
  var input = document.getElementById('chartInput');
  var question = input.value.trim();
  if (!question) return;
  var btn = document.getElementById('chartAskBtn');
  var status = document.getElementById('chartAskStatus');
  var canvas = document.getElementById('aiChartCanvas');
  btn.disabled = true;
  status.textContent = 'Thinking…';
  try {
    var res = await authedFetch('/api/chart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question }) });
    var chart = res.chart;
    var spec = chart.spec;
    canvas.style.display = 'block';
    upsertChart('aiChartCanvas', { type: spec.type, data: { labels: chart.labels, datasets: chart.series.map(function (s, i) {
      return { label: s.metric, data: s.values, borderColor: AI_CHART_COLORS[i % AI_CHART_COLORS.length], backgroundColor: AI_CHART_COLORS[i % AI_CHART_COLORS.length] + '99', tension: .3, pointRadius: 0, borderWidth: 1.5, spanGaps: true };
    }) } });
    status.textContent = spec.title + ' — ' + spec.startDate + ' to ' + spec.endDate;
  } catch (err) {
    canvas.style.display = 'none';
    status.textContent = 'Could not chart that (' + err.message + ').';
  } finally {
    btn.disabled = false;
  }
}

function buildCharts(days, history) {
  var labels = days.map(function (d) { return d.date; });
  var pick = function (f) { return days.map(function (d) { return d[f] !== undefined ? d[f] : null; }); };

  upsertChart('heartChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Resting HR', data: pick('restingHeartRate'), borderColor: '#f76b4d', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'HRV', data: pick('hrv'), borderColor: '#b4ff39', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5 },
  ]}});

  upsertChart('hrRangeChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Avg HR', data: pick('heartRateAvg'), borderColor: '#fbbf24', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Max HR', data: pick('heartRateMax'), borderColor: '#f76b4d', tension: .3, pointRadius: 0, borderWidth: 1 },
    { label: 'Min HR', data: pick('heartRateMin'), borderColor: '#34d399', tension: .3, pointRadius: 0, borderWidth: 1 },
  ]}});

  upsertChart('vo2Chart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'VO2max', data: pick('vo2max'), borderColor: '#a78bfa', tension: .3, pointRadius: 2, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('stepsChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Steps', data: pick('steps'), backgroundColor: '#34d39999' },
  ]}});

  upsertChart('energyChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Active energy (kcal)', data: pick('activeEnergy'), backgroundColor: '#fbbf2499' },
    { label: 'Exercise (min)', data: pick('exerciseMinutes'), backgroundColor: '#b4ff3999' },
  ]}});

  upsertChart('standChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Stand minutes', data: pick('standMinutes'), backgroundColor: '#34d39999' },
    { label: 'Flights climbed', data: pick('flightsClimbed'), backgroundColor: '#fbbf2499' },
  ]}});

  upsertChart('gaitChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Walking speed (m/s)', data: pick('walkingSpeed'), borderColor: '#b4ff39', tension: .3, pointRadius: 0, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('workoutChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Workout minutes', data: pick('workoutMinutes'), backgroundColor: '#fbbf2499' },
  ]}});

  var workoutDays = days.filter(function (d) { return d.workoutCount; }).slice(-15).reverse();
  var listEl = document.getElementById('workoutList');
  if (workoutDays.length === 0) {
    listEl.textContent = 'No workout sessions in the imported data yet.';
  } else {
    listEl.innerHTML = '<table class="simple-table"><tbody>' + workoutDays.map(function (d) {
      var parts = [niceDate(d.date), workoutName(d.workoutType) || 'Workout', d.workoutMinutes + ' min'];
      if (d.workoutEnergy) parts.push(Math.round(d.workoutEnergy) + ' kcal');
      if (d.workoutDistanceKm) parts.push(d.workoutDistanceKm.toFixed(1) + ' km');
      return '<tr>' + parts.map(function (p) { return '<td>' + p + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  upsertChart('sleepChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Sleep hours', data: pick('sleepHours'), backgroundColor: '#60a5fa99' },
  ]}});

  upsertChart('sleepStagesChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Core', data: pick('sleepCoreHours'), backgroundColor: '#60a5fa' },
    { label: 'Deep', data: pick('sleepDeepHours'), backgroundColor: '#3b82f6' },
    { label: 'REM', data: pick('sleepRemHours'), backgroundColor: '#a78bfa' },
    { label: 'Awake', data: pick('sleepAwakeHours'), backgroundColor: '#f76b4d' },
  ]}, options: { scales: {
    x: { stacked: true, ticks: { color: '#8a8a8a', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#262626' } },
    y: { stacked: true, ticks: { color: '#8a8a8a', font: { size: 10 } }, grid: { color: '#262626' } },
  } }});

  upsertChart('weightChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Weight (kg)', data: pick('weightKg'), borderColor: '#fbbf24', tension: .3, pointRadius: 1, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('ageChart', { type: 'line', data: { labels: history.map(function (h) { return h.date; }), datasets: [
    { label: 'Biological age', data: history.map(function (h) { return h.biologicalAge; }), borderColor: '#b4ff39', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Chronological age', data: history.map(function (h) { return h.chronologicalAge; }), borderColor: '#8a8a8a', borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
  ]}});
}

async function boot() {
  document.getElementById('gateError').textContent = '';
  var series, analytics, trends;
  try {
    var results = await Promise.all([authedFetch('/api/series'), authedFetch('/api/analytics'), authedFetch('/api/trends')]);
    series = results[0]; analytics = results[1]; trends = results[2];
  } catch (err) {
    document.getElementById('gateError').textContent = 'Invalid token or server error.';
    throw err;
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  var days = series.days || [];
  var latestAnalytics = analytics.latest;
  var history = analytics.history || [];
  var today = days.length ? days[days.length - 1] : {};

  document.getElementById('lastUpdated').textContent = days.length ? ('Synced ' + days[days.length - 1].date) : 'No data yet';

  GUIDE_DAYS = days;
  GUIDE_VALUES = { readiness: trends.readinessScore, strain: trends.todayStrain, biologicalAge: latestAnalytics ? latestAnalytics.deltaYears : null };
  Object.keys(GUIDE_VALUES).forEach(function (k) { if (GUIDE_VALUES[k] === null || GUIDE_VALUES[k] === undefined) delete GUIDE_VALUES[k]; });
  fillGuides();
  renderGreeting(days);
  renderTodayTrio(trends, latestAnalytics);
  renderMarkers(latestAnalytics);
  renderQuickStats(today, trends);
  renderTrainingLoad(trends);
  renderBests(trends.bests);
  renderExtraMetrics(days);
  renderActivityRings(today);
  buildCharts(days.slice(-180), history.slice(-180));

  var savedTab = null;
  try { savedTab = localStorage.getItem('healthTab'); } catch (e) {}
  appBooted = true;
  showTab(savedTab && document.getElementById('tab-' + savedTab) ? savedTab : 'overview');

  loadFitness();
  loadOverview();
  loadDataQuality();
  loadDiscoveries();
  loadReport('week');
  loadKnowledge();
  loadExperiments();
}

async function loadReport(period) {
  var el = document.getElementById('reportBody');
  el.textContent = 'Loading…';
  try {
    var res = await authedFetch('/api/report?period=' + period);
    var changed = res.metricChanges.filter(function (m) { return m.direction === 'up' || m.direction === 'down'; });
    var html = '<div class="card-sub">' + res.currentStart + ' to ' + res.currentEnd + ', vs. ' + res.previousStart + ' to ' + res.previousEnd + '</div>';
    if (changed.length === 0) {
      html += '<div class="sub">No meaningful change vs. the prior period.</div>';
    } else {
      html += '<ul class="ai-list">' + changed.map(function (m) {
        var arrow = m.direction === 'up' ? '↑' : '↓';
        var pct = m.changePct !== null ? (m.changePct > 0 ? '+' : '') + m.changePct + '%' : '';
        return '<li>' + m.metric + ': ' + m.previousAvg + ' → ' + m.currentAvg + ' ' + arrow + ' ' + pct + '</li>';
      }).join('') + '</ul>';
    }
    if (res.anomalies && res.anomalies.length > 0) {
      html += '<div class="ai-section-title">Anomalies this period</div><ul class="ai-list concerns">' + res.anomalies.slice(0, 5).map(function (a) {
        return '<li>' + a.date + ': ' + a.metric + ' ' + a.direction + ' baseline (' + Math.abs(a.zScore).toFixed(1) + 'σ)</li>';
      }).join('') + '</ul>';
    }
    el.innerHTML = html;
  } catch (err) {
    el.textContent = 'Could not load (' + err.message + ').';
  }
}

var EXPERIMENT_METRICS = ['hrv', 'restingHeartRate', 'heartRateAvg', 'vo2max', 'steps', 'activeEnergy', 'exerciseMinutes', 'standMinutes', 'sleepHours', 'sleepEfficiency', 'weightKg', 'walkingSpeed', 'strain', 'workoutMinutes'];

function populateExperimentMetricSelect() {
  var sel = document.getElementById('expMetric');
  if (!sel || sel.options.length > 0) return;
  sel.innerHTML = EXPERIMENT_METRICS.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
}

async function loadExperiments() {
  populateExperimentMetricSelect();
  var el = document.getElementById('experimentsList');
  try {
    var res = await authedFetch('/api/experiments');
    renderExperiments(res.results || []);
  } catch (err) {
    el.textContent = 'Could not load (' + err.message + ').';
  }
}

function renderExperiments(results) {
  var el = document.getElementById('experimentsList');
  if (results.length === 0) { el.innerHTML = '<div class="sub">No experiments yet — start one above.</div>'; return; }
  el.innerHTML = results.map(function (r) {
    var e = r.experiment;
    var change = r.changePct !== null ? (r.changePct > 0 ? '+' : '') + r.changePct + '%' : 'no data yet';
    var arrow = r.direction === 'up' ? '↑' : r.direction === 'down' ? '↓' : r.direction === 'flat' ? '→' : '';
    return '<div class="card" style="background:var(--panel2); margin-bottom:10px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:baseline;">' +
      '<strong>' + e.title + '</strong>' +
      '<button class="btn btn-ghost btn-sm" onclick="deleteExperiment(\\'' + e.id + '\\')">Delete</button>' +
      '</div>' +
      '<div class="sub">' + e.metric + ' since ' + e.startDate + ' — baseline ' + (r.baselineAvg !== null ? r.baselineAvg : '—') + ' → during ' + (r.duringAvg !== null ? r.duringAvg : '—') + ' ' + arrow + ' ' + change + '</div>' +
      '<div class="sub">Adherence: ' + r.adherencePct + '%</div>' +
      '<div class="sub" style="font-size:11px;">' + r.confounderNote + '</div>' +
      '<button class="btn btn-ghost btn-sm" onclick="toggleAdherenceToday(\\'' + e.id + '\\')" style="margin-top:6px;">Mark today done</button>' +
      '</div>';
  }).join('');
}

async function createExperiment(evt) {
  evt.preventDefault();
  var title = document.getElementById('expTitle').value.trim();
  var metric = document.getElementById('expMetric').value;
  var startDate = document.getElementById('expStartDate').value || new Date().toISOString().slice(0, 10);
  if (!title) return;
  await authedFetch('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, metric: metric, startDate: startDate }) });
  document.getElementById('expTitle').value = '';
  loadExperiments();
}

async function toggleAdherenceToday(id) {
  var today = new Date().toISOString().slice(0, 10);
  await authedFetch('/api/experiments/adherence?id=' + encodeURIComponent(id) + '&date=' + today, { method: 'POST' });
  loadExperiments();
}

async function deleteExperiment(id) {
  await authedFetch('/api/experiments?id=' + encodeURIComponent(id), { method: 'DELETE' });
  loadExperiments();
}

async function loadDiscoveries() {
  var el = document.getElementById('discoveriesBody');
  try {
    var res = await authedFetch('/api/discoveries');
    var reportable = (res.correlations || []).filter(function (c) { return c.strength !== 'negligible' && c.strength !== 'insufficient_data'; });
    var html = '';
    if (reportable.length === 0) {
      html += '<div class="sub">No correlations above a meaningful threshold found yet in your data.</div>';
    } else {
      html += '<div class="ai-section-title">Correlations (not causation)</div><ul class="ai-list">' + reportable.map(function (c) {
        return '<li>' + c.label + ': r=' + c.r + ' (' + c.strength + ', ' + c.direction + '), n=' + c.sampleSize + ' days. ' + c.hypothesis + '</li>';
      }).join('') + '</ul>';
    }
    var anomalies = (res.anomalies || []).slice(0, 8);
    if (anomalies.length > 0) {
      html += '<div class="ai-section-title">Recent anomalies</div><ul class="ai-list concerns">' + anomalies.map(function (a) {
        var ctx = Object.keys(a.relatedObservations).map(function (k) { return k + '=' + a.relatedObservations[k]; }).join(', ');
        return '<li>' + a.date + ': ' + a.metric + ' was ' + a.value + ' (' + a.direction + ' baseline of ' + a.baselineMean + ' by ' + Math.abs(a.zScore).toFixed(1) + 'σ)' + (ctx ? ' — same day: ' + ctx : '') + '</li>';
      }).join('') + '</ul>';
    }
    el.innerHTML = html || '<div class="sub">Not enough history yet to find discoveries.</div>';
  } catch (err) {
    el.textContent = 'Could not load (' + err.message + ').';
  }
}

async function loadDataQuality() {
  try {
    var results = await Promise.all([authedFetch('/api/coverage'), authedFetch('/api/baselines')]);
    renderCoverage(results[0]);
    renderBaselines((results[1].windows && results[1].windows['30']) || []);
  } catch (err) {
    document.getElementById('coverageSummary').textContent = 'Could not load (' + err.message + ').';
  }
}

function renderCoverage(cov) {
  var summaryEl = document.getElementById('coverageSummary');
  var listEl = document.getElementById('coverageList');
  if (!cov || !cov.totalDays) { summaryEl.textContent = 'No data yet.'; listEl.innerHTML = ''; return; }
  var gapNote = cov.recentGapDays > 1 ? ' — last record is ' + cov.recentGapDays + ' days old.' : '';
  summaryEl.textContent = cov.totalDays + ' days stored (' + cov.dateRange.start + ' to ' + cov.dateRange.end + ')' + gapNote;
  listEl.innerHTML = '<table class="simple-table"><tbody>' + cov.metrics.slice(0, 20).map(function (m) {
    var pct = Math.round(m.coveragePct * 100);
    var staleNote = m.staleDays > 14 ? ' <span style="color:var(--down)">stale ' + m.staleDays + 'd</span>' : '';
    return '<tr><td>' + m.metric + '</td><td>' + pct + '%</td><td>' + m.daysPresent + '/' + m.totalDays + ' days' + staleNote + '</td></tr>';
  }).join('') + '</tbody></table>';
}

function renderBaselines(list) {
  var el = document.getElementById('baselineList');
  if (!list || list.length === 0) { el.innerHTML = '<div class="sub">Not enough recent history yet.</div>'; return; }
  var arrows = { up: '↑', down: '↓', flat: '→', unknown: '—' };
  el.innerHTML = '<table class="simple-table"><tbody>' + list.map(function (b) {
    var z = b.zScore !== undefined ? (b.zScore > 0 ? '+' : '') + b.zScore.toFixed(1) + 'σ' : '—';
    var insufficient = !b.sufficient ? ' <span class="sub">(limited history)</span>' : '';
    var g = guideFor(b.metric, b.mean);
    var name = g ? METRIC_GUIDE[b.metric].label : b.metric;
    return '<tr title="' + (g ? g.meaning.replace(/"/g, '&quot;') : '') + '"><td>' + name + '</td><td>' + b.mean + '</td><td>' + arrows[b.trend] + '</td><td>' + z + insufficient + '</td>' +
      '<td style="font-family:var(--sans);font-weight:400;color:var(--dim);font-size:12px;">' + (g ? g.action : '') + '</td></tr>';
  }).join('') + '</tbody></table>';
}

/* ---------------- Apple Health export.xml parsing (client-side) ----------------
 * Captures EVERY HKQuantityTypeIdentifier and HKCategoryTypeIdentifier record
 * the export contains, not just a curated subset: named fields we know how to
 * chart/analyze get their own DailyMetrics property; anything else lands in
 * \`extra\`, keyed by the bare HK identifier, aggregated by a sum-vs-average
 * heuristic. Nothing from "Export All Health Data" is silently dropped.
 */

// identifier (without the HK.../TypeIdentifier prefix) -> { field, agg }
// agg: 'avg' (default), 'sum', 'last', or 'speed' (avg + unit-aware km/h->m/s)
var KNOWN_QUANTITY_FIELDS = {
  RestingHeartRate: { field: 'restingHeartRate', agg: 'avg' },
  HeartRate: { field: 'heartRateAvg', agg: 'avg' }, // min/max handled specially
  WalkingHeartRateAverage: { field: 'walkingHeartRateAvg', agg: 'avg' },
  HeartRateVariabilitySDNN: { field: 'hrv', agg: 'avg' },
  RespiratoryRate: { field: 'respiratoryRate', agg: 'avg' },
  OxygenSaturation: { field: 'oxygenSaturation', agg: 'avg' },
  BodyTemperature: { field: 'bodyTemperature', agg: 'avg' },
  VO2Max: { field: 'vo2max', agg: 'avg' },
  StepCount: { field: 'steps', agg: 'sum' },
  ActiveEnergyBurned: { field: 'activeEnergy', agg: 'sum' },
  BasalEnergyBurned: { field: 'basalEnergy', agg: 'sum' },
  AppleExerciseTime: { field: 'exerciseMinutes', agg: 'sum' },
  AppleStandTime: { field: 'standMinutes', agg: 'sum' },
  FlightsClimbed: { field: 'flightsClimbed', agg: 'sum' },
  DistanceWalkingRunning: { field: 'distanceKm', agg: 'sum' },
  DistanceCycling: { field: 'distanceCyclingKm', agg: 'sum' },
  TimeInDaylight: { field: 'daylightMinutes', agg: 'sum' },
  WalkingSpeed: { field: 'walkingSpeed', agg: 'speed' },
  WalkingStepLength: { field: 'walkingStepLength', agg: 'avg' },
  WalkingAsymmetryPercentage: { field: 'walkingAsymmetryPct', agg: 'avg' },
  WalkingDoubleSupportPercentage: { field: 'walkingDoubleSupportPct', agg: 'avg' },
  BodyMass: { field: 'weightKg', agg: 'last' },
  BodyFatPercentage: { field: 'bodyFatPct', agg: 'last' },
  BloodPressureSystolic: { field: 'bloodPressureSystolic', agg: 'avg' },
  BloodPressureDiastolic: { field: 'bloodPressureDiastolic', agg: 'avg' },
  BloodGlucose: { field: 'bloodGlucose', agg: 'avg' },
};

// Heuristic for anything NOT in the known-fields map above: does the name
// look like a cumulative quantity (sum it) or an instantaneous reading /
// rate / percentage (average it)?
var EXTRA_SUM_HINT = /Energy|Distance|Count|Time|Duration|Flights|Steps|Water|Caffeine|Protein|Carbohydrate|Fat[A-Z]|Sugar|Sodium|Fiber|Cholesterol|Calcium|Iron|Vitamin|NumberOf|UsageEvent/;

function healthAttr(line, name) {
  var m = line.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : undefined;
}
function healthParseNaive(ts) {
  var m = ts.match(/^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2})/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function healthDurationMinutes(startDate, endDate) {
  return (healthParseNaive(endDate) - healthParseNaive(startDate)) / 60000;
}
function healthSleepNightDate(startDate) {
  var date = startDate.slice(0, 10);
  var hour = Number(startDate.slice(11, 13));
  if (hour < 18) return date;
  var parts = date.split('-').map(Number);
  var dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function healthSpeedToMps(value, unit) {
  if (!unit) return value;
  var u = unit.toLowerCase();
  if (u.indexOf('km/hr') !== -1 || u.indexOf('km/h') !== -1) return value / 3.6;
  if (u.indexOf('mi/hr') !== -1 || u.indexOf('mph') !== -1) return value * 0.44704;
  return value; // already m/s
}
function healthNewDayAcc() {
  return {
    known: {}, // field name -> array of values (for avg/speed)
    knownSum: {}, // field name -> running sum (for sum fields)
    heartRate: [],
    sleepCoreMin: 0, sleepDeepMin: 0, sleepRemMin: 0, sleepUnspecMin: 0, sleepAwakeMin: 0, sleepInBedMin: 0,
    mindfulMinutes: 0,
    extraAvg: {}, // identifier -> array of values
    extraSum: {}, // identifier -> running sum
    extraCount: {}, // category identifier -> occurrence count
    workoutCount: 0, workoutMinutes: 0, workoutEnergy: 0, workoutDistanceKm: 0,
    workoutTypes: {}, // HKWorkoutActivityType (prefix stripped) -> count
  };
}
function healthAvg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : undefined; }
function healthMin(arr) { return arr.length ? Math.min.apply(null, arr) : undefined; }
function healthMax(arr) { return arr.length ? Math.max.apply(null, arr) : undefined; }
function healthLast(arr) { return arr.length ? arr[arr.length - 1] : undefined; }
function healthRound(n, dp) {
  if (n === undefined) return undefined;
  var f = Math.pow(10, dp || 0);
  return Math.round(n * f) / f;
}
function healthPushKnown(bucket, field, value) {
  if (!bucket[field]) bucket[field] = [];
  bucket[field].push(value);
}
function healthAddSum(bucket, field, value) {
  bucket[field] = (bucket[field] || 0) + (value || 0);
}

var SLEEP_STAGE_MAP = {
  HKCategoryValueSleepAnalysisAsleepCore: 'sleepCoreMin',
  HKCategoryValueSleepAnalysisAsleepDeep: 'sleepDeepMin',
  HKCategoryValueSleepAnalysisAsleepREM: 'sleepRemMin',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'sleepUnspecMin',
  HKCategoryValueSleepAnalysisAwake: 'sleepAwakeMin',
  HKCategoryValueSleepAnalysisInBed: 'sleepInBedMin',
};

function healthToKm(value, unit) {
  if (!unit) return value;
  var u = unit.toLowerCase();
  if (u === 'mi') return value * 1.60934;
  if (u === 'm') return value / 1000;
  return value; // already km
}

// <Workout> elements are a separate record kind from <Record> — one per
// exercise session, with its own duration/energy/distance attributes
// directly on the opening tag (even though the element itself usually has
// nested <WorkoutEvent>/<MetadataEntry> children on later lines).
// <ActivitySummary> is a separate, once-per-day element carrying the
// three Activity Ring goals and the Stand ring's actual value (Move and
// Exercise actuals are already captured from <Record> ActiveEnergyBurned
// and AppleExerciseTime sums, so only their goals are new information
// here).
function healthProcessActivitySummaryLine(days, line) {
  var date = healthAttr(line, 'dateComponents');
  if (!date) return;
  if (!days.has(date)) days.set(date, healthNewDayAcc());
  var d = days.get(date);

  var moveGoal = Number(healthAttr(line, 'activeEnergyBurnedGoal'));
  var exerciseGoal = Number(healthAttr(line, 'appleExerciseTimeGoal'));
  var standGoal = Number(healthAttr(line, 'appleStandHoursGoal'));
  var standActual = Number(healthAttr(line, 'appleStandHours'));

  if (!Number.isNaN(moveGoal) && moveGoal > 0) d.moveGoalKcal = moveGoal;
  if (!Number.isNaN(exerciseGoal) && exerciseGoal > 0) d.exerciseGoalMinutes = exerciseGoal;
  if (!Number.isNaN(standGoal) && standGoal > 0) d.standGoalHours = standGoal;
  if (!Number.isNaN(standActual)) d.standHoursActual = standActual;
}

function healthProcessWorkoutLine(days, line) {
  var startDate = healthAttr(line, 'startDate');
  var endDate = healthAttr(line, 'endDate');
  if (!startDate) return;
  var date = startDate.slice(0, 10);
  if (!days.has(date)) days.set(date, healthNewDayAcc());
  var d = days.get(date);

  var durationStr = healthAttr(line, 'duration');
  var minutes = durationStr ? Number(durationStr) : NaN;
  if (!minutes || Number.isNaN(minutes)) minutes = endDate ? healthDurationMinutes(startDate, endDate) : 0;

  var energyStr = healthAttr(line, 'totalEnergyBurned');
  var distanceStr = healthAttr(line, 'totalDistance');
  var distanceUnit = healthAttr(line, 'totalDistanceUnit');

  d.workoutCount += 1;
  if (minutes > 0) d.workoutMinutes += minutes;
  if (energyStr) d.workoutEnergy += Number(energyStr) || 0;
  if (distanceStr) d.workoutDistanceKm += healthToKm(Number(distanceStr) || 0, distanceUnit);

  var typeMatch = line.match(/workoutActivityType="HKWorkoutActivityType([A-Za-z0-9]+)"/);
  var typeName = typeMatch ? typeMatch[1] : 'Other';
  d.workoutTypes[typeName] = (d.workoutTypes[typeName] || 0) + 1;
}

function healthProcessLine(days, line) {
  if (line.indexOf('<Workout ') !== -1) { healthProcessWorkoutLine(days, line); return; }
  if (line.indexOf('<ActivitySummary ') !== -1) { healthProcessActivitySummaryLine(days, line); return; }
  if (line.indexOf('<Record ') === -1) return;
  var typeMatch = line.match(/type="HK(Quantity|Category)TypeIdentifier([A-Za-z0-9]+)"/);
  if (!typeMatch) return;
  var isQuantity = typeMatch[1] === 'Quantity';
  var name = typeMatch[2];
  var startDate = healthAttr(line, 'startDate');
  var endDate = healthAttr(line, 'endDate');
  var value = healthAttr(line, 'value');
  var unit = healthAttr(line, 'unit');
  if (!startDate) return;
  var date = startDate.slice(0, 10);
  if (!days.has(date)) days.set(date, healthNewDayAcc());
  var d = days.get(date);

  if (isQuantity) {
    var num = Number(value);
    if (Number.isNaN(num)) return;
    if (name === 'HeartRate') { d.heartRate.push(num); return; }
    if (name === 'BodyFatPercentage') { healthPushKnown(d.known, 'bodyFatPct', num <= 1 ? num * 100 : num); return; }
    var known = KNOWN_QUANTITY_FIELDS[name];
    if (known) {
      if (known.agg === 'sum') healthAddSum(d.knownSum, known.field, num);
      else if (known.agg === 'speed') healthPushKnown(d.known, known.field, healthSpeedToMps(num, unit));
      else healthPushKnown(d.known, known.field, num); // avg or last both collect; finalize picks
      return;
    }
    // Unrecognized quantity type: generic bucket, sum or average by heuristic.
    if (EXTRA_SUM_HINT.test(name)) healthAddSum(d.extraSum, name, num);
    else healthPushKnown(d.extraAvg, name, num);
    return;
  }

  // Category record
  if (name === 'SleepAnalysis') {
    // A night's sleep stage records naturally straddle midnight (e.g. Core
    // 23:00->23:45, Deep 23:45->01:30, ...), and attributing each record by
    // its own startDate splits one night's sleep across two calendar days —
    // the pre-midnight minutes land on the date sleep started, the rest on
    // the next date, understating both. Apple's own Health app attributes a
    // whole night to the WAKE date, so: any record starting at 18:00 or
    // later is attributed to the following calendar day, matching that
    // convention and keeping a full night together. Naps (which start well
    // before 18:00) are unaffected.
    var stageField = SLEEP_STAGE_MAP[value];
    if (stageField && endDate) {
      var sleepDate = healthSleepNightDate(startDate);
      if (!days.has(sleepDate)) days.set(sleepDate, healthNewDayAcc());
      days.get(sleepDate)[stageField] += healthDurationMinutes(startDate, endDate);
    }
    return;
  }
  if (name === 'MindfulSession') {
    if (endDate) d.mindfulMinutes += healthDurationMinutes(startDate, endDate);
    return;
  }
  // Any other category record (e.g. IrregularHeartRhythmEvent, HighHeartRateEvent):
  // count occurrences per day.
  d.extraCount[name] = (d.extraCount[name] || 0) + 1;
}

function healthFinalizeDays(days) {
  var result = [];
  days.forEach(function (d, date) {
    var rec = { date: date, source: 'health-export-import' };
    var set = function (key, val) { if (val !== undefined && !Number.isNaN(val)) rec[key] = val; };

    // Known avg/speed/last fields collected as arrays.
    for (var field in d.known) {
      var isLast = field === 'weightKg' || field === 'bodyFatPct';
      var v = isLast ? healthLast(d.known[field]) : healthAvg(d.known[field]);
      set(field, healthRound(v, field === 'oxygenSaturation' || field.indexOf('Pct') !== -1 ? 3 : 1));
    }
    // Known sum fields.
    for (var sumField in d.knownSum) {
      if (d.knownSum[sumField] > 0) rec[sumField] = healthRound(d.knownSum[sumField], 2);
    }
    set('heartRateAvg', healthRound(healthAvg(d.heartRate), 1));
    set('heartRateMin', healthRound(healthMin(d.heartRate), 0));
    set('heartRateMax', healthRound(healthMax(d.heartRate), 0));

    var sleepHours = (d.sleepCoreMin + d.sleepDeepMin + d.sleepRemMin + d.sleepUnspecMin) / 60;
    if (sleepHours > 0) rec.sleepHours = healthRound(sleepHours, 2);
    if (d.sleepCoreMin > 0) rec.sleepCoreHours = healthRound(d.sleepCoreMin / 60, 2);
    if (d.sleepDeepMin > 0) rec.sleepDeepHours = healthRound(d.sleepDeepMin / 60, 2);
    if (d.sleepRemMin > 0) rec.sleepRemHours = healthRound(d.sleepRemMin / 60, 2);
    if (d.sleepAwakeMin > 0) rec.sleepAwakeHours = healthRound(d.sleepAwakeMin / 60, 2);
    if (d.sleepInBedMin > 0) {
      rec.sleepInBedHours = healthRound(d.sleepInBedMin / 60, 2);
      if (sleepHours > 0) rec.sleepEfficiency = healthRound(Math.min(1, sleepHours / (d.sleepInBedMin / 60)), 3);
    }
    if (d.mindfulMinutes > 0) rec.mindfulMinutes = Math.round(d.mindfulMinutes);

    if (d.workoutCount > 0) {
      rec.workoutCount = d.workoutCount;
      rec.workoutMinutes = healthRound(d.workoutMinutes, 1);
      if (d.workoutEnergy > 0) rec.workoutEnergy = healthRound(d.workoutEnergy, 1);
      if (d.workoutDistanceKm > 0) rec.workoutDistanceKm = healthRound(d.workoutDistanceKm, 2);
      var topType = null, topCount = 0;
      for (var wt in d.workoutTypes) { if (d.workoutTypes[wt] > topCount) { topType = wt; topCount = d.workoutTypes[wt]; } }
      if (topType) rec.workoutType = topType;
    }

    if (d.moveGoalKcal !== undefined) rec.activeEnergyGoal = d.moveGoalKcal;
    if (d.exerciseGoalMinutes !== undefined) rec.exerciseMinutesGoal = d.exerciseGoalMinutes;
    if (d.standGoalHours !== undefined) rec.standHoursGoal = d.standGoalHours;
    if (d.standHoursActual !== undefined) rec.standHours = d.standHoursActual;

    var extra = {};
    for (var avgKey in d.extraAvg) extra[avgKey] = healthRound(healthAvg(d.extraAvg[avgKey]), 3);
    for (var sumKey in d.extraSum) if (d.extraSum[sumKey] > 0) extra[sumKey] = healthRound(d.extraSum[sumKey], 2);
    for (var countKey in d.extraCount) extra[countKey + 'Count'] = d.extraCount[countKey];
    if (Object.keys(extra).length > 0) rec.extra = extra;

    result.push(rec);
  });
  result.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return result;
}

function setImportStatus(text) {
  document.getElementById('importStatus').textContent = text;
}

async function exportCsv() {
  var btn = document.getElementById('exportBtn');
  var status = document.getElementById('exportStatus');
  btn.disabled = true;
  status.textContent = 'Preparing download…';
  try {
    var res = await fetch('/api/export', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('request failed: ' + res.status);
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'health-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    status.textContent = 'Downloaded.';
  } catch (err) {
    status.textContent = 'Could not export (' + err.message + ').';
  } finally {
    btn.disabled = false;
  }
}

async function importExportZip() {
  var fileInput = document.getElementById('importFile');
  var zipFile = fileInput.files && fileInput.files[0];
  var progressEl = document.getElementById('importProgress');
  var btn = document.getElementById('importBtn');
  if (!zipFile) { setImportStatus('Choose a file first.'); return; }

  btn.disabled = true;
  btn.textContent = 'Importing…';

  var days = new Map();
  var leftover = '';
  var bytesSeen = 0;
  var totalBytes = zipFile.size || 0;
  var decoder = new TextDecoder();
  var foundExportXml = false;

  function handleChunkText(text, final) {
    leftover += text;
    var lines = leftover.split('\\n');
    leftover = final ? '' : lines.pop();
    for (var i = 0; i < lines.length; i++) healthProcessLine(days, lines[i]);
  }

  try {
    progressEl.style.display = 'block';
    progressEl.value = 0;
    setImportStatus('Reading zip...');
    var unzipper = new fflate.Unzip();
    unzipper.register(fflate.UnzipInflate);
    unzipper.onfile = function (file) {
      if (file.name.indexOf('export.xml') === -1) return;
      foundExportXml = true;
      file.ondata = function (err, chunk, final) {
        if (err) { setImportStatus('Error reading export.xml: ' + err.message); return; }
        handleChunkText(decoder.decode(chunk, { stream: !final }), final);
        bytesSeen += chunk.length;
        setImportStatus('Parsing export.xml... ' + days.size + ' days found');
      };
      file.start();
    };

    var reader = zipFile.stream().getReader();
    var readBytes = 0;
    while (true) {
      var res = await reader.read();
      if (res.done) { unzipper.push(new Uint8Array(0), true); break; }
      readBytes += res.value.length;
      if (totalBytes) progressEl.value = Math.min(95, Math.round((readBytes / totalBytes) * 95));
      unzipper.push(res.value, false);
    }

    if (!foundExportXml) { setImportStatus('No export.xml found in that zip — is it an Apple Health export?'); progressEl.style.display = 'none'; return; }

    var dayRecords = healthFinalizeDays(days);
    if (dayRecords.length === 0) { setImportStatus('No recognizable health records found.'); progressEl.style.display = 'none'; return; }

    setImportStatus('Uploading ' + dayRecords.length + ' days to your repo...');
    progressEl.value = 98;
    var result = await authedFetch('/import-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: dayRecords }) });
    progressEl.value = 100;
    setImportStatus('✓ Done — imported ' + result.daysImported + ' days (' + result.totalDays + ' total in series). Refreshing dashboard…');
    try {
      await boot();
      setImportStatus('✓ Done — imported ' + result.daysImported + ' days (' + result.totalDays + ' total in series). Dashboard refreshed.');
    } catch (bootErr) {
      setImportStatus('✓ Import succeeded (' + result.daysImported + ' days), but refreshing the dashboard failed (' + bootErr.message + '). Reload the page.');
    }
  } catch (err) {
    setImportStatus('✗ Import failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import';
    setTimeout(function () { progressEl.style.display = 'none'; }, 1500);
  }
}

if (getToken()) { boot().catch(function () {}); }
</script>
</body>
</html>`;
}
