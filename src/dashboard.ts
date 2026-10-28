import { METRIC_GUIDE, METRIC_FORMAT } from "./metricGuide";

// Every AI review card is identical apart from its domain and title — same
// loader, same 1-hour KV cache, same Retry (force) button.
function reviewCard(domain: string, title: string, sub = ""): string {
  return `<div class="card ai-card">
      <div class="ai-head">
        <h3>${title}</h3>
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
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0a0a0a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Health">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@200;300;400;500;600;700&display=swap" rel="stylesheet">
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
    --pulse:#a3e635; --up:#34d399; --down:#f76b4d; --caution:#fbbf24;
    --gold:#d4a853; --gold-glow:rgba(212,168,83,.25); --royal:#c9b8ff;
    --panel-glass:rgba(18,18,18,.65);
    --depth-1:0 1px 3px rgba(0,0,0,.3),0 1px 2px rgba(0,0,0,.2);
    --depth-2:0 4px 12px rgba(0,0,0,.35),0 2px 4px rgba(0,0,0,.2);
    --depth-3:0 12px 40px rgba(0,0,0,.4),0 4px 8px rgba(0,0,0,.25);
    --ease-spring:cubic-bezier(.34,1.56,.64,1);
    --ease-smooth:cubic-bezier(.25,.46,.45,.94);
    /* kept the name --mono from the prior design pass (it's used ~40 places
       for every numeric readout) even though Barlow Condensed isn't a
       monospace face — renaming the token would mean touching every call
       site for no functional gain; what matters is the value. */
    --mono: 'Barlow Condensed', -apple-system, sans-serif;
    --sans: 'Inter', -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html { scroll-behavior:smooth; }
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
  .btn { padding:11px 18px; border-radius:6px; border:none; background:var(--pulse); color:var(--void); font-weight:700; cursor:pointer; font-size:13.5px; transition:transform .1s, opacity .15s; box-shadow:0 0 20px rgba(163,230,53,.15); }
  .btn:hover { opacity:.9; } .btn:active { transform:scale(.97); }
  .btn:disabled { opacity:.35; cursor:default; }
  .btn-ghost { background:var(--panel2); color:var(--ink); border:1px solid var(--line); font-weight:600; }
  .btn-ghost:hover { border-color:var(--pulse); }
  .btn-sm { padding:7px 12px; font-size:12px; border-radius:5px; }
  #gate .btn { width:100%; text-align:center; }
  #gateError { color:var(--down); min-height:16px; font-size:13px; }

  /* ---- shell ---- */
  #app { display:none; max-width:900px; margin:0 auto; padding:0 20px 60px; }
  #app.app-revealing { animation:appReveal .6s var(--ease-smooth) both; }
  header.top { position:sticky; top:0; z-index:20; background:rgba(0,0,0,.92); backdrop-filter:blur(10px); padding:18px 20px 10px; margin:0 -20px 20px; border-bottom:1px solid var(--line); }
  header.top .row { display:flex; align-items:baseline; justify-content:space-between; max-width:900px; margin:0 auto; }
  header.top h1 { font-size:18px; margin:0; font-weight:800; letter-spacing:-.01em; }
  header.top .sub { font-family:var(--mono); font-weight:600; font-size:13px; }
  .tabs { display:flex; gap:6px; overflow-x:auto; margin-top:14px; padding-bottom:2px; max-width:900px; margin-left:auto; margin-right:auto; scrollbar-width:none; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab { white-space:nowrap; padding:7px 13px; border-radius:999px; background:transparent; border:1px solid var(--line); color:var(--dim); cursor:pointer; font-size:13px; font-weight:600; transition:color .2s, transform .15s var(--ease-spring), background-color .2s, border-color .2s; }
  .tab.active { color:var(--void); background:var(--pulse); border-color:var(--pulse); transform:scale(1.04); }

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
  .stat { padding:13px 14px 13px 12px; border-bottom:1px solid var(--line); border-left:3px solid var(--line); transition:transform .25s var(--ease-spring), border-color .2s, background-color .2s; }
  .stat[style*="cursor:pointer"]:hover { border-left-color:var(--gold); background-color:rgba(255,255,255,.02); transform:translateX(2px); }
  .stat[style*="cursor:pointer"]:active { transform:scale(.98); }
  .stat .label { color:var(--dim); font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; }
  .stat .value { font-family:var(--mono); font-size:28px; font-weight:800; margin-top:4px; letter-spacing:-.01em; }
  .stat .value .unit { font-size:12px; color:var(--dim); font-weight:600; margin-left:3px; font-family:var(--sans); }
  .stat .trend { font-family:var(--mono); font-size:12px; font-weight:700; margin-top:3px; }
  .trend.up { color:var(--up); } .trend.down { color:var(--down); } .trend.flat { color:var(--faint); }
  .stat:has(.trend.up) { border-image:linear-gradient(to bottom, var(--up), transparent) 1; }
  .stat:has(.trend.down) { border-image:linear-gradient(to bottom, var(--down), transparent) 1; }
  .stat { position:relative; }
  .stat svg.spark.watermark { position:absolute; right:10px; bottom:10px; width:60%; height:28px; opacity:.06; pointer-events:none; }
  @keyframes trendBounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-2px); } }
  @keyframes trendPulse { 0%,100% { opacity:1; } 50% { opacity:.55; } }
  .trend.up { animation:trendBounce 1.8s ease-in-out infinite; }
  .trend.down { animation:trendPulse 1.8s ease-in-out infinite; }

  /* A panel still exists where content needs real grouping (forms, lists,
     AI output) — flat fill, hairline edge, no decorative shadow. */
  .card {
    background:var(--panel-glass); backdrop-filter:blur(16px) saturate(1.2); -webkit-backdrop-filter:blur(16px) saturate(1.2);
    border:1px solid rgba(255,255,255,.06); border-radius:8px; padding:18px; margin-bottom:12px;
    box-shadow:var(--depth-1), inset 0 1px 0 rgba(255,255,255,.04);
    position:relative; overflow:hidden;
  }
  .card::before {
    content:''; position:absolute; inset:0; pointer-events:none; opacity:.03;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .card h3 { margin:0 0 4px; font-size:14px; font-weight:700; display:flex; align-items:center; gap:8px; color:var(--ink); }
  .card .card-sub { color:var(--dim); font-size:12.5px; margin-bottom:12px; }
  .chart-empty { height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--faint); font-size:13px; text-align:center; padding:0 20px; gap:8px; }
  .chart-empty svg { width:32px; height:32px; opacity:.3; }
  .chart-skeleton { height:280px; border-radius:8px; background:var(--panel2); overflow:hidden; position:relative; }
  .chart-skeleton::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,#202020,transparent); background-size:200% 100%; animation:shimmer 1.4s infinite; }
  .workout-cards { display:flex; flex-direction:column; gap:8px; }
  .wk-card { display:grid; grid-template-columns:42px 1fr auto; gap:12px; align-items:center; padding:13px 14px; background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--pulse); border-radius:0 8px 8px 0; transition:transform .1s; }
  .wk-card:active { transform:scale(.98); }
  .wk-icon { width:42px; height:42px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
  .wk-info { min-width:0; }
  .wk-name { font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wk-meta { font-size:12px; color:var(--dim); display:flex; gap:10px; margin-top:2px; font-family:var(--mono); font-weight:600; }
  .wk-date { font-size:12px; color:var(--faint); font-family:var(--mono); font-weight:600; text-align:right; white-space:nowrap; }
  .wk-dur-bar { height:4px; background:var(--panel2); border-radius:2px; margin-top:6px; overflow:hidden; }
  .wk-dur-fill { height:100%; border-radius:2px; transition:width .4s; }
  .simple-table { width:100%; font-size:13px; border-collapse:collapse; }
  .simple-table td { padding:7px 10px 7px 0; border-bottom:1px solid var(--line); color:var(--ink); font-family:var(--mono); font-weight:600; }
  .simple-table td:first-child { color:var(--dim); white-space:nowrap; font-family:var(--sans); font-weight:400; }
  canvas { max-height:280px; }

  /* ---- AI insights: same panel, lime accent stripe (this app's brand) ---- */
  .ai-card { background:var(--panel-glass); backdrop-filter:blur(16px) saturate(1.2); -webkit-backdrop-filter:blur(16px) saturate(1.2); border:1px solid rgba(255,255,255,.06); border-left:3px solid var(--pulse); border-image:linear-gradient(to bottom, var(--pulse), var(--gold)) 1; border-radius:0 8px 8px 0; box-shadow:var(--depth-1); }
  .ai-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .ai-headline { font-size:16px; font-weight:700; margin:2px 0 10px; color:var(--ink); }
  .ai-body { font-size:13.5px; line-height:1.7; color:var(--ink); margin:0 0 8px; }
  .ai-concern { font-size:13px; line-height:1.6; color:var(--caution); margin:0 0 8px; padding-left:10px; border-left:2px solid var(--caution); }
  .ai-meta { color:var(--faint); font-size:11.5px; margin-top:8px; font-family:var(--mono); }
  .skeleton { height:12px; border-radius:2px; background:linear-gradient(90deg,var(--panel2),rgba(212,168,83,.12),var(--panel2)); background-size:200% 100%; animation:shimmer 1.4s infinite; margin:8px 0; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
  @keyframes fadeSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .reveal { animation:fadeSlideUp .35s var(--ease-smooth) both; }
  @keyframes revealUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes borderGlow { 0%,100% { box-shadow:var(--depth-2), 0 0 0 1px rgba(212,168,83,0); } 50% { box-shadow:var(--depth-2), 0 0 24px rgba(212,168,83,.12); } }
  @keyframes appReveal { from { opacity:0; filter:blur(6px); } to { opacity:1; filter:blur(0); } }
  .scroll-observe { opacity:0; transform:translateY(20px); transition:opacity .5s var(--ease-smooth), transform .5s var(--ease-smooth); transition-delay:var(--stagger, 0ms); }
  .scroll-observe.in-view { opacity:1; transform:translateY(0); }

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
  .chart-box { position:relative; height:280px; }
  .chart-wrap { position:relative; }
  .chart-readout { position:absolute; top:0; left:0; background:rgba(18,18,18,.95); backdrop-filter:blur(8px); border:1px solid var(--line); border-radius:6px; padding:6px 10px; font-size:11px; font-family:var(--mono); pointer-events:none; z-index:10; white-space:nowrap; opacity:0; transition:opacity .12s; }
  .chart-readout.vis { opacity:1; }
  .chart-readout .cr-date { color:var(--dim); font-size:10px; margin-bottom:3px; }
  .chart-readout .cr-row { display:flex; align-items:center; gap:6px; }
  .chart-readout .cr-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .chart-readout .cr-val { font-weight:700; }
  .range-bar { height:4px; background:var(--panel2); border-radius:2px; margin-top:6px; position:relative; }
  .range-fill { position:absolute; height:100%; background:rgba(52,211,153,.2); border-radius:2px; }
  .range-dot { position:absolute; top:-3px; width:10px; height:10px; border-radius:50%; background:var(--pulse); border:2px solid var(--panel); }
  .stat .baseline { font-family:var(--mono); font-size:11px; font-weight:700; margin-left:6px; }
  .ar-wrap { display:flex; gap:20px; align-items:center; padding:12px 0; }
  .ar-svg { flex-shrink:0; }
  .ar-svg circle { transition:stroke-dashoffset 1.5s var(--ease-spring); }
  .ar-labels { flex:1; display:flex; flex-direction:column; gap:8px; }
  .ar-row { display:flex; align-items:center; gap:8px; }
  .ar-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .ar-name { font-size:12px; color:var(--dim); font-weight:600; width:56px; }
  .ar-num { font-family:var(--mono); font-weight:800; font-size:16px; }
  .ar-goal { font-size:11px; color:var(--faint); margin-left:4px; }
  .ar-pct { font-family:var(--mono); font-weight:700; font-size:12px; margin-left:auto; }

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
  .fit { cursor:pointer; transition:transform .25s var(--ease-spring), border-color .2s, box-shadow .2s; }
  .fit:hover { border-color:var(--faint); transform:translateY(-2px); box-shadow:var(--depth-2); }
  .fit:active { transform:scale(.98); }
  .lv { cursor:pointer; transition:transform .25s var(--ease-spring), border-color .2s, box-shadow .2s; }
  .lv:hover { border-color:var(--faint); transform:translateY(-2px); box-shadow:var(--depth-2); }
  .lv:active { transform:scale(.98); }

  /* ---- readability pass: bigger type, more air, plain-language status ---- */
  body { font-size:15px; line-height:1.6; }
  .sub { font-size:14px; }
  .card { padding:20px; margin-bottom:14px; }
  .card h3 { font-size:16px; }
  .card .card-sub { font-size:13.5px; line-height:1.55; }
  .ai-body { font-size:14.5px; line-height:1.65; }
  .ai-headline { font-size:18px; line-height:1.4; }
  .ai-loading { color:var(--dim); font-size:13px; margin-top:6px; }

  h2.sec { font-size:24px; font-weight:800; margin:34px 0 12px; letter-spacing:-.025em; }
  h2.sec span { display:block; font-size:13.5px; font-weight:500; color:var(--dim); letter-spacing:0; margin-top:2px; }
  .greet { margin:6px 0 18px; }
  .greet-hi { font-size:34px; font-weight:300; letter-spacing:-.03em; }
  .greet-sub { color:var(--dim); font-size:14px; }
  .streak-pill { display:inline-flex; align-items:center; gap:5px; margin-left:10px; padding:3px 10px 3px 8px; border-radius:999px; background:rgba(212,168,83,.12); border:1px solid rgba(212,168,83,.35); color:var(--gold); font-size:13px; font-weight:700; font-family:var(--mono); vertical-align:middle; }

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

  .scoreboard { padding:24px; box-shadow:var(--depth-2), inset 0 1px 0 rgba(255,255,255,.04); backdrop-filter:blur(20px) saturate(1.2); -webkit-backdrop-filter:blur(20px) saturate(1.2); transition:box-shadow .3s; }
  .scoreboard:hover { animation:borderGlow 2.4s ease-in-out infinite; }
  .multi-ring-layout { display:grid; grid-template-columns:auto 1fr; gap:24px; align-items:center; }
  .multi-ring { position:relative; width:180px; height:180px; flex-shrink:0; }
  .multi-ring svg { transform:rotate(-90deg); }
  .multi-ring .ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .multi-ring .ring-label .n { font-size:44px; }
  .score-arc { transition:stroke-dashoffset 1.5s var(--ease-spring); }
  .multi-ring-info { min-width:0; }
  .ring-legend { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
  .ring-legend .rl-row { display:flex; align-items:center; gap:8px; font-size:13px; }
  .ring-legend .rl-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .ring-legend .rl-name { flex:1; font-weight:600; color:var(--dim); }
  .ring-legend .rl-score { font-family:var(--mono); font-weight:800; font-size:15px; }
  .ring-legend .rl-word { font-size:11px; margin-left:4px; }
  .scoreboard > details { margin-top:12px; }
  @media (max-width:640px) { .multi-ring-layout { grid-template-columns:1fr; justify-items:center; text-align:center; } .multi-ring { width:160px; height:160px; } .ring-legend { align-items:center; } }
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
    .greet-hi { font-size:26px; }
    .wd .w-steps { font-size:12px; }
  }

  /* ---- plan & goals ---- */
  .plan-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .plan-progress { font-weight:700; font-size:15px; }
  .plan-progress .num { font-size:22px; color:var(--pulse); margin-right:4px; }
  .plan-days { display:grid; gap:8px; margin-top:12px; }
  .pday { display:grid; grid-template-columns:52px 1fr auto; gap:12px; align-items:center; padding:12px; border-radius:8px; background:var(--panel2); border:1px solid var(--line); }
  .pday.today { border-color:var(--pulse); }
  .pday.rest { opacity:.6; }
  .pday .pd-day { font-weight:800; font-size:13px; color:var(--dim); }
  .pday .pd-day b { display:block; color:var(--ink); font-size:15px; }
  .pday .pd-title { font-weight:700; font-size:14.5px; }
  .pday .pd-title .pd-min { color:var(--dim); font-weight:600; margin-left:6px; font-size:13px; }
  .pday .pd-detail { color:var(--dim); font-size:13px; margin-top:2px; line-height:1.45; }
  .pday .pd-adj { color:var(--caution); font-size:12.5px; margin-top:4px; }
  .pday .pd-was { text-decoration:line-through; color:var(--faint); font-size:12.5px; }
  .tick { width:34px; height:34px; border-radius:50%; border:2px solid var(--line); background:transparent; color:var(--dim); cursor:pointer; font-size:15px; font-weight:800; }
  .tick.on { background:var(--up); border-color:var(--up); color:var(--void); }
  .tick:disabled { cursor:default; opacity:.5; }
  .session-card .s-big { font-size:20px; font-weight:800; margin:4px 0 2px; }
  .session-card .s-big small { color:var(--dim); font-size:14px; font-weight:600; margin-left:6px; }
  .goal { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:10px; }
  .goal .g-head { display:flex; justify-content:space-between; gap:10px; align-items:center; }
  .goal .g-title { font-weight:700; font-size:15px; }
  .goal .g-nums { font-family:var(--mono); font-weight:800; font-size:22px; margin:6px 0 2px; }
  .goal .g-nums small { color:var(--dim); font-size:13px; font-weight:600; font-family:var(--sans); }
  .goal .g-track { position:relative; height:8px; background:var(--panel2); border-radius:4px; margin:8px 0 6px; }
  .goal .g-fill { position:absolute; left:0; top:0; bottom:0; border-radius:4px; }
  .goal .g-mark { position:absolute; top:-4px; width:2px; height:16px; background:var(--ink); opacity:.6; }
  .goal .g-sum { color:var(--dim); font-size:13px; }
  .goal-form { display:flex; flex-wrap:wrap; gap:8px; }
  .goal-form select { flex:1 1 180px; } .goal-form #goalTarget { width:110px; } .goal-form #goalTitle { flex:1 1 160px; }
  .link-btn { background:none; border:none; color:var(--faint); cursor:pointer; font-size:12.5px; padding:0; }
  .link-btn:hover { color:var(--down); }

  /* ---- 5-tab navigation: top on desktop, bottom bar on phones ---- */
  .tabs.primary .tab { display:inline-flex; align-items:center; gap:6px; }
  .tabs.primary .tab svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
  .subnav { display:flex; gap:18px; overflow-x:auto; margin-top:10px; scrollbar-width:none; max-width:900px; margin-left:auto; margin-right:auto; position:relative; }
  .subnav::-webkit-scrollbar { display:none; }
  .subnav:empty { display:none; }
  .subnav::after { content:''; position:absolute; bottom:0; left:var(--ul-left, 0); width:var(--ul-width, 0); height:2px; background:var(--pulse); transition:left .25s ease, width .25s ease; border-radius:1px; }
  .subtab { background:none; border:none; color:var(--dim); font-size:13.5px; font-weight:600; padding:4px 0 8px; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; }
  .subtab.active { color:var(--ink); border-bottom-color:transparent; }
  .section { transition:opacity .2s ease; }
  .section.active.tab-enter { animation:fadeSlideUp .35s var(--ease-smooth) both; }

  /* ---- Today: verdict + dials ---- */
  .verdict { border-radius:16px; padding:24px 28px; margin-bottom:12px; border:1px solid var(--line); box-shadow:var(--depth-2); position:relative; overflow:hidden; }
  .verdict .v-word {
    font-family:var(--mono); font-size:42px; font-weight:900; line-height:1.05; margin:0 0 4px; letter-spacing:-.02em;
    background:linear-gradient(135deg, currentColor, currentColor 60%, rgba(255,255,255,.6));
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;
    text-shadow:0 0 40px rgba(163,230,53,.15);
  }
  .verdict .v-line { font-size:15px; font-weight:600; line-height:1.45; }
  .verdict .v-why { font-size:12.5px; opacity:.75; margin-top:4px; }
  @keyframes meshShift { 0% { background-position:0% 50%; } 50% { background-position:100% 50%; } 100% { background-position:0% 50%; } }
  .v-hard { background:linear-gradient(135deg, rgba(52,211,153,.20) 0%, rgba(163,230,53,.14) 35%, rgba(52,211,153,.08) 70%, rgba(163,230,53,.18) 100%); background-size:200% 200%; animation:meshShift 6s ease infinite; border-color:rgba(52,211,153,.4); color:#6ee7b7; }
  .v-steady { background:linear-gradient(135deg, rgba(251,191,36,.14) 0%, rgba(253,224,71,.10) 35%, rgba(251,191,36,.06) 70%, rgba(253,224,71,.14) 100%); background-size:200% 200%; animation:meshShift 6s ease infinite; border-color:rgba(251,191,36,.4); color:#fcd34d; }
  .v-recover { background:linear-gradient(135deg, rgba(247,107,77,.16) 0%, rgba(252,165,148,.10) 35%, rgba(247,107,77,.06) 70%, rgba(252,165,148,.14) 100%); background-size:200% 200%; animation:meshShift 6s ease infinite; border-color:rgba(247,107,77,.45); color:#fca594; }
  .v-neutral { background:var(--panel); color:var(--ink); }
  .v-hard .v-line, .v-steady .v-line, .v-recover .v-line { color:var(--ink); }
  .brief-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px; }
  .brief-item { background:rgba(18,18,18,.5); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:12px 10px; text-align:center; transition:transform .25s var(--ease-spring); }
  .brief-item:hover { transform:scale(1.02); }
  .brief-n { font-family:var(--mono); font-size:24px; font-weight:900; }
  .brief-d { font-size:12px; font-weight:600; margin-top:1px; }
  .brief-d.up { color:var(--up); }
  .brief-d.dn { color:var(--down); }
  .brief-u { font-size:11px; color:var(--dim); margin-top:2px; text-transform:uppercase; letter-spacing:.04em; font-weight:600; }
  .strain-budget { margin-bottom:12px; }
  .sb-label { font-size:12px; color:var(--dim); font-weight:600; margin-bottom:4px; }
  .sb-track { height:10px; background:var(--panel); border:1px solid var(--line); border-radius:5px; position:relative; overflow:hidden; }
  .sb-fill { height:100%; border-radius:5px; background:var(--up); transition:width .4s; }
  .sb-fill.high { background:var(--caution); }
  .sb-fill.over { background:var(--down); }
  .sb-target { position:absolute; top:0; bottom:0; width:2px; background:var(--dim); }
  .sleep-arch { display:flex; height:28px; border-radius:6px; overflow:hidden; margin-bottom:4px; }
  .sleep-arch .seg { height:100%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; font-family:var(--mono); color:var(--ink); transition:width .6s ease; min-width:0; overflow:hidden; }
  .seg-core { background:#60a5fa; } .seg-deep { background:#3b82f6; } .seg-rem { background:#a78bfa; } .seg-awake { background:rgba(247,107,77,.7); }
  .sleep-arch-legend { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .sleep-arch-legend .sal { display:flex; align-items:center; gap:5px; font-size:11.5px; color:var(--dim); font-weight:600; }
  .sleep-arch-legend .sal-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
  .sleep-arch-legend .sal-val { font-family:var(--mono); font-weight:700; color:var(--ink); }
  .one-action { border-left:3px solid var(--pulse); border-radius:0 8px 8px 0; }
  .oa-label { font-size:11px; color:var(--dim); font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
  .oa-text { font-size:14px; font-weight:600; color:var(--ink); }
  .wm-item { display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13.5px; border-bottom:1px solid var(--line); }
  .wm-item:last-child { border-bottom:none; }
  .wm-key { color:var(--dim); font-weight:600; flex:0 0 auto; }
  .wm-val { font-family:var(--mono); font-weight:800; }
  .wm-delta { font-size:12px; font-weight:600; }
  .wm-delta.up { color:var(--up); }
  .wm-delta.dn { color:var(--down); }
  .session-card .s-row { display:flex; align-items:center; gap:10px; padding:6px 0; font-size:14px; }
  .session-card .s-ico { width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; background:var(--panel2); color:var(--dim); flex-shrink:0; }
  .session-card .s-ico.done { background:var(--up); color:var(--void); }
  .session-card .s-ico.now { background:var(--pulse); color:var(--void); }

  @media (max-width:640px) {
    body { padding-bottom:76px; }
    /* backdrop-filter makes the header a containing block for position:fixed
       children, which would pin the bottom bar to the header instead. */
    header.top { backdrop-filter:none; background:#000; }
    .tabs.primary { position:fixed; left:0; right:0; bottom:0; z-index:30; margin:0; padding:6px 4px calc(6px + env(safe-area-inset-bottom)); background:rgba(0,0,0,.94); backdrop-filter:blur(12px); border-top:1px solid var(--line); justify-content:space-around; gap:0; }
    .tabs.primary .tab { flex-direction:column; gap:3px; border:none; background:none; padding:4px 6px; font-size:10.5px; border-radius:8px; color:var(--faint); }
    .tabs.primary .tab svg { width:22px; height:22px; }
    .tabs.primary .tab.active { background:none; color:var(--pulse); }
    .tabs.primary .tab.active svg { filter:drop-shadow(0 0 4px var(--pulse)); }
    .verdict .v-word { font-size:34px; }
    .brief-n { font-size:20px; }
  }

  /* ---- metric detail sheet ---- */
  .metric-sheet { position:fixed; inset:0; z-index:50; background:var(--void); overflow-y:auto; -webkit-overflow-scrolling:touch; display:none; transform:translateY(100%); transition:transform .3s cubic-bezier(.32,.72,0,1), opacity .3s; opacity:0; }
  .metric-sheet.open { transform:translateY(0); opacity:1; }
  .ms-head { position:sticky; top:0; z-index:2; background:rgba(0,0,0,.94); backdrop-filter:blur(10px); padding:16px 20px 12px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; }
  .ms-back { background:none; border:none; color:var(--ink); font-size:22px; cursor:pointer; padding:0 4px; line-height:1; }
  .ms-title { font-size:17px; font-weight:800; flex:1; }
  .ms-body { max-width:640px; margin:0 auto; padding:20px 20px 80px; }
  .ms-hero { text-align:center; padding:20px 0 18px; border-bottom:1px solid var(--line); margin-bottom:18px; }
  .ms-big { font-family:var(--mono); font-size:56px; font-weight:800; line-height:1; letter-spacing:-.02em; }
  .ms-unit { font-size:16px; color:var(--dim); font-weight:600; margin-left:4px; font-family:var(--sans); }
  .ms-normal { font-size:13.5px; color:var(--dim); margin-top:8px; }
  .ms-best { font-size:13px; color:var(--faint); margin-top:4px; }
  .ms-best b { color:var(--pulse); font-weight:700; }
  .ms-ranges { display:flex; justify-content:center; gap:6px; margin-bottom:18px; }
  .ms-ranges button { padding:6px 14px; border-radius:999px; background:transparent; border:1px solid var(--line); color:var(--dim); cursor:pointer; font-size:12.5px; font-weight:600; }
  .ms-ranges button.active { color:var(--void); background:var(--pulse); border-color:var(--pulse); }
  .ms-chart { position:relative; height:260px; margin-bottom:18px; }
  .ms-section { margin-bottom:18px; }
  .ms-section h4 { font-size:13px; font-weight:700; color:var(--dim); text-transform:uppercase; letter-spacing:.06em; margin:0 0 8px; }
  .ms-tvn { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; }
  .ms-tvn-item { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
  .ms-tvn-item .tvn-label { font-size:12px; color:var(--dim); font-weight:600; }
  .ms-tvn-item .tvn-val { font-family:var(--mono); font-size:22px; font-weight:800; margin:2px 0; }
  .ms-tvn-item .tvn-delta { font-family:var(--mono); font-size:13px; font-weight:700; }
  .ms-corr { padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px; }
  .ms-corr:last-child { border-bottom:none; }
  .ms-bestworst { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .ms-bw { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; }
  .ms-bw .bw-label { font-size:12px; color:var(--dim); font-weight:600; }
  .ms-bw .bw-val { font-family:var(--mono); font-size:20px; font-weight:800; margin-top:2px; }
  .ms-bw .bw-date { font-size:11px; color:var(--faint); font-family:var(--mono); }
  .ms-meaning { font-size:14px; line-height:1.6; color:var(--dim); }
  .ms-action { font-size:14.5px; line-height:1.55; margin-top:8px; }
  .ms-action::before { content:"\\2192  "; font-weight:700; color:var(--pulse); }
  .ms-compare { display:inline-block; margin-left:8px; }
  .ms-compare button { padding:5px 12px; border-radius:999px; background:var(--panel2); border:1px solid var(--line); color:var(--dim); cursor:pointer; font-size:11.5px; font-weight:700; transition:all .15s; }
  .ms-compare button.active { background:var(--pulse); color:var(--void); border-color:var(--pulse); }
  .ms-histogram { height:70px; margin:0 0 14px; display:flex; align-items:flex-end; gap:1px; }
  .ms-hist-bar { flex:1; border-radius:2px 2px 0 0; background:var(--pulse); opacity:.2; transition:opacity .2s; min-width:0; }
  .ms-hist-bar.current { opacity:1; }
  .ms-hist-labels { display:flex; justify-content:space-between; font-size:10px; color:var(--faint); font-family:var(--mono); font-weight:600; margin-bottom:14px; }
  .ms-handle { width:36px; height:4px; background:var(--faint); border-radius:2px; margin:0 auto 6px; opacity:.5; }
  .metric-sheet.dragging { transition:none !important; }

  /* ---- week recap ---- */
  .recap-card { background:linear-gradient(135deg, rgba(163,230,53,.08) 0%, rgba(52,211,153,.06) 50%, rgba(96,165,250,.08) 100%); border:1px solid rgba(163,230,53,.25); border-radius:12px; padding:18px; margin-bottom:14px; }
  .recap-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px; }
  .recap-header .recap-range { font-size:12px; color:var(--dim); font-family:var(--mono); font-weight:600; }
  .recap-header .recap-tone { font-size:13px; font-weight:800; }
  .recap-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .recap-stat { text-align:center; }
  .recap-stat .rs-val { font-size:22px; font-weight:800; font-family:var(--mono); }
  .recap-stat .rs-label { font-size:11px; color:var(--dim); font-weight:600; margin-top:2px; }
  .recap-spark { display:flex; align-items:flex-end; gap:1px; height:24px; justify-content:center; margin-top:4px; }
  .recap-spark .rs-bar { width:4px; border-radius:1px; background:var(--pulse); opacity:.6; }
  @media (max-width:480px) { .recap-grid { grid-template-columns:repeat(2,1fr); } }

  /* ---- weekly story cards ---- */
  .story-scroll { display:flex; gap:12px; overflow-x:auto; padding:4px 0 12px; scroll-snap-type:x mandatory; scrollbar-width:none; }
  .story-scroll::-webkit-scrollbar { display:none; }
  .story-card { min-width:280px; max-width:320px; flex-shrink:0; scroll-snap-align:start; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
  .story-card .sc-week { font-size:12px; color:var(--dim); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
  .story-card .sc-title { font-size:18px; font-weight:800; margin:4px 0 8px; }
  .story-card .sc-stats { display:flex; gap:14px; margin-bottom:8px; }
  .story-card .sc-stat { text-align:center; }
  .story-card .sc-stat .sc-n { font-family:var(--mono); font-size:20px; font-weight:800; }
  .story-card .sc-stat .sc-u { font-size:10.5px; color:var(--dim); }
  .story-card .sc-note { font-size:13px; color:var(--dim); line-height:1.5; }
  .story-nav { display:flex; gap:6px; margin-top:4px; }
  .story-nav .sn-dot { width:8px; height:8px; border-radius:50%; background:var(--line); }
  .story-nav .sn-dot.active { background:var(--pulse); }

  /* ---- year in review ---- */
  .yir-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-bottom:14px; }
  .yir { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; text-align:center; }
  .yir .yir-label { font-size:12px; color:var(--dim); font-weight:600; }
  .yir .yir-val { font-family:var(--mono); font-size:28px; font-weight:800; margin:4px 0; color:var(--pulse); }
  .yir .yir-sub { font-size:12px; color:var(--faint); }

  /* ---- year heatmap ---- */
  .heatmap-wrap { overflow-x:auto; margin-bottom:8px; }
  .heatmap-wrap::-webkit-scrollbar { display:none; }
  .heatmap { display:grid; grid-template-rows:repeat(7,1fr); grid-auto-flow:column; gap:2px; min-width:max-content; }
  .hm-cell { width:11px; height:11px; border-radius:2px; background:var(--panel2); }
  .hm-1 { background:rgba(180,255,57,.15); } .hm-2 { background:rgba(180,255,57,.35); }
  .hm-3 { background:rgba(180,255,57,.55); } .hm-4 { background:rgba(180,255,57,.85); }
  .hm-metric-sel { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .hm-metric-sel select { appearance:none; -webkit-appearance:none; background:var(--panel2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238a8a8a'/%3E%3C/svg%3E") no-repeat right 10px center; border:1px solid var(--line); color:var(--ink); font-size:12px; font-weight:700; font-family:var(--mono); padding:6px 28px 6px 10px; border-radius:8px; cursor:pointer; }
  .hm-metric-sel select:focus { outline:none; border-color:var(--pulse); }
  .hm-labels { display:flex; justify-content:space-between; font-size:10px; color:var(--faint); margin-bottom:4px; padding:0 2px; }
  .hm-legend { display:flex; align-items:center; gap:3px; font-size:10px; color:var(--faint); margin-top:4px; }
  .hm-legend span { width:11px; height:11px; border-radius:2px; display:inline-block; }
  .hm-year-selector { display:flex; gap:6px; overflow-x:auto; margin-bottom:10px; scrollbar-width:none; }
  .hm-year-selector::-webkit-scrollbar { display:none; }
  .hm-year-selector button { padding:5px 12px; border-radius:999px; background:transparent; border:1px solid var(--line); color:var(--dim); cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap; }
  .hm-year-selector button.active { color:var(--void); background:var(--pulse); border-color:var(--pulse); }

  /* ---- then vs now ---- */
  .tvn-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-bottom:14px; }
  .tvn-card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .tvn-card .tvn-metric { font-weight:700; font-size:14px; }
  .tvn-card .tvn-then { color:var(--dim); font-size:13px; margin-top:4px; }
  .tvn-card .tvn-now { font-family:var(--mono); font-size:20px; font-weight:800; margin-top:2px; }
  .tvn-card .tvn-change { font-family:var(--mono); font-size:13px; font-weight:700; margin-top:2px; }

  /* ---- milestones ---- */
  .milestones { display:flex; flex-direction:column; gap:10px; }
  .milestone { display:grid; grid-template-columns:auto 1fr; gap:14px; align-items:center; padding:12px 14px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
  .milestone .ms-icon { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:800; background:rgba(180,255,57,.12); color:var(--pulse); flex-shrink:0; }
  .milestone .ms-text { font-weight:700; font-size:14px; }
  .milestone .ms-when { color:var(--dim); font-size:12.5px; margin-top:2px; }

  /* ---- all metrics grid ---- */
  .am-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:0; border-top:1px solid var(--line); }
  .am-tile { padding:14px 14px 14px 12px; border-bottom:1px solid var(--line); border-left:3px solid var(--line); cursor:pointer; transition:border-color .15s; }
  .am-tile:hover { border-left-color:var(--pulse); }
  .am-tile.s-good { border-left-color:var(--up); }
  .am-tile.s-ok { border-left-color:var(--pulse); }
  .am-tile.s-watch { border-left-color:var(--caution); }
  .am-tile.s-bad { border-left-color:var(--down); }
  .am-tile .am-label { color:var(--dim); font-size:12px; font-weight:600; display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .am-tile .am-val { font-family:var(--mono); font-size:22px; font-weight:800; margin-top:2px; }
  .am-tile .am-val .unit { font-size:12px; color:var(--dim); font-weight:600; margin-left:3px; font-family:var(--sans); }
  .am-tile .am-act { font-size:12.5px; color:var(--dim); margin-top:4px; line-height:1.45; }

  /* step 5: strain-recovery, workout types, day explorer, seasonal */
  .sr-chart { position:relative; width:100%; height:260px; }
  .sr-dot { position:absolute; border-radius:50%; opacity:.7; transition:opacity .15s; cursor:pointer; }
  .sr-dot:hover { opacity:1; }
  .sr-axis-x { position:absolute; bottom:-18px; width:100%; text-align:center; font-size:11px; color:var(--dim); }
  .sr-axis-y { position:absolute; left:-4px; top:-18px; font-size:11px; color:var(--dim); }
  .sr-tooltip { position:fixed; background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:8px 10px; font-size:12px; z-index:40; pointer-events:none; display:none; box-shadow:0 2px 8px rgba(0,0,0,.15); }
  .wt-bars { display:flex; flex-direction:column; gap:6px; }
  .wt-row { display:flex; align-items:center; gap:8px; }
  .wt-label { flex:0 0 100px; font-size:12px; color:var(--dim); text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wt-bar-wrap { flex:1; height:22px; background:var(--void); border-radius:4px; overflow:hidden; position:relative; }
  .wt-bar { height:100%; border-radius:4px; background:var(--pulse); transition:width .4s ease; }
  .wt-count { flex:0 0 50px; font-size:12px; color:var(--faint); font-family:var(--mono); }
  .de-picker { display:flex; gap:8px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
  .de-picker input[type="date"] { font-family:var(--mono); font-size:14px; background:var(--void); color:var(--txt); border:1px solid var(--line); border-radius:6px; padding:6px 10px; }
  .de-picker button { background:var(--void); color:var(--dim); border:1px solid var(--line); border-radius:6px; padding:5px 12px; font-size:12px; cursor:pointer; }
  .de-picker button:hover { color:var(--txt); border-color:var(--pulse); }
  .de-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:8px; }
  .de-item { background:var(--void); border-radius:6px; padding:10px 12px; cursor:pointer; }
  .de-item:hover { border:1px solid var(--pulse); padding:9px 11px; }
  .de-item .de-key { font-size:11px; color:var(--dim); font-weight:600; text-transform:uppercase; }
  .de-item .de-val { font-family:var(--mono); font-size:20px; font-weight:800; margin-top:2px; }
  .de-item .de-unit { font-size:11px; color:var(--dim); margin-left:2px; font-family:var(--sans); }
  .season-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }
  .season-card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .season-card h4 { margin:0 0 8px; font-size:13px; color:var(--dim); font-weight:600; }
  .season-bars { display:flex; align-items:flex-end; gap:2px; height:80px; }
  .season-bar { flex:1; background:var(--pulse); border-radius:3px 3px 0 0; min-width:12px; position:relative; transition:height .3s; }
  .season-bar .sbl { position:absolute; bottom:-16px; left:50%; transform:translateX(-50%); font-size:9px; color:var(--faint); white-space:nowrap; }

  /* step 6: check-in & PWA */
  .checkin-fab { position:fixed; bottom:76px; right:16px; width:48px; height:48px; border-radius:50%; background:var(--pulse); color:#fff; border:none; font-size:22px; cursor:pointer; z-index:30; box-shadow:0 2px 10px rgba(0,0,0,.3); display:none; }
  .checkin-fab.show { display:flex; align-items:center; justify-content:center; }
  .checkin-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:60; display:none; align-items:flex-end; justify-content:center; }
  .checkin-overlay.open { display:flex; }
  .checkin-sheet { background:var(--panel); border-radius:16px 16px 0 0; padding:20px 16px 30px; width:100%; max-width:440px; max-height:80vh; overflow-y:auto; }
  .checkin-sheet h3 { margin:0 0 14px; font-size:16px; }
  .ci-q { margin-bottom:16px; }
  .ci-q label { display:block; font-size:13px; color:var(--dim); font-weight:600; margin-bottom:6px; }
  .ci-opts { display:flex; gap:6px; flex-wrap:wrap; }
  .ci-opt { padding:8px 16px; border-radius:20px; border:1px solid var(--line); background:var(--void); color:var(--txt); font-size:14px; cursor:pointer; transition:all .15s; }
  .ci-opt:hover, .ci-opt.sel { background:var(--pulse); color:#fff; border-color:var(--pulse); }
  .ci-actions { display:flex; gap:8px; margin-top:16px; }
  .ci-actions button { flex:1; padding:10px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:none; }
  .ci-actions .ci-save { background:var(--pulse); color:#fff; }
  .ci-actions .ci-cancel { background:var(--void); color:var(--dim); border:1px solid var(--line); }
  .install-banner { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin:10px 0; display:none; align-items:center; gap:10px; }
  .install-banner.show { display:flex; }
  .install-banner .ib-text { flex:1; font-size:13px; }
  .install-banner button { background:var(--pulse); color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; }
  @media (min-width:561px) { .checkin-fab { bottom:24px; right:24px; } }

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
    <nav class="tabs primary" id="primaryNav">
      <button class="tab" data-view="today" onclick="showView('today')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg><span>Today</span></button>
      <button class="tab" data-view="plan" onclick="showView('plan')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg><span>Plan</span></button>
      <button class="tab" data-view="trends" onclick="showView('trends')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l5-6 4 3 7-9"/></svg><span>Trends</span></button>
      <button class="tab" data-view="coach" onclick="showView('coach')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg><span>Coach</span></button>
      <button class="tab" data-view="you" onclick="showView('you')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg><span>You</span></button>
    </nav>
    <nav class="subnav" id="subNav"></nav>
  </header>

  <!-- TODAY -->
  <section class="section active" id="tab-overview">
    <div class="greet">
      <div class="greet-hi" id="greeting">Hello</div>
      <div class="greet-sub" id="greetingSub">Loading your data…</div>
    </div>

    <div class="verdict v-neutral" id="verdict">
      <div class="v-word" id="verdictWord">…</div>
      <div class="v-line" id="verdictLine">Reading your recovery.</div>
      <div class="v-why" id="verdictWhy"></div>
    </div>

    <div class="brief-row" id="sleepBrief">
      <div class="brief-item"><div class="brief-n" id="bSleepH">—</div><div class="brief-u">hours slept</div></div>
      <div class="brief-item"><div class="brief-n" id="bSleepQ">—</div><div class="brief-u">quality</div></div>
      <div class="brief-item"><div class="brief-n" id="bDeepRem">—</div><div class="brief-u">deep+REM</div></div>
    </div>
    <div id="sleepArch"></div>

    <div class="brief-row" id="bodyState">
      <div class="brief-item"><div class="brief-n" id="bHrv">—</div><div class="brief-d" id="bHrvD"></div><div class="brief-u">HRV</div></div>
      <div class="brief-item"><div class="brief-n" id="bRhr">—</div><div class="brief-d" id="bRhrD"></div><div class="brief-u">resting HR</div></div>
      <div class="brief-item"><div class="brief-n" id="bRecov">—</div><div class="brief-u">recovery</div></div>
    </div>

    <div class="strain-budget" id="strainBudget">
      <div class="sb-label">Strain <span id="sbUsed">0</span> / <span id="sbMax">21</span></div>
      <div class="sb-track"><div class="sb-fill" id="sbFill"></div><div class="sb-target" id="sbTarget"></div></div>
    </div>

    <div class="card session-card" id="todaySession"><h3>Up next</h3><div class="sub">Loading your plan…</div></div>

    <div class="card" id="whatMoved">
      <h3>What moved</h3>
      <div class="sub" id="whatMovedList">Checking…</div>
    </div>

    ${reviewCard("today", "Coach’s note")}

    <div class="card one-action" id="oneAction" style="display:none;">
      <div class="oa-label">Focus today</div>
      <div class="oa-text" id="oneActionText"></div>
    </div>
  </section>

  <!-- TRENDS: LONG VIEW -->
  <section class="section" id="tab-longview">
    <h2 class="sec" style="margin-top:6px;">The long view<span>12 months of monthly averages</span></h2>
    <div class="longview" id="longView"></div>
    <div class="card">
      <h3>Your weekly rhythm</h3>
      <div class="card-sub">Average steps by weekday, last 12 weeks.</div>
      <div id="weekdayBars"></div>
    </div>
    ${reviewCard("longterm", "Where you’re heading", "Where your trends point, and habits for the next 3 months.")}
  </section>

  <!-- TRENDS: ALL METRICS -->
  <section class="section" id="tab-allmetrics">
    <h2 class="sec" style="margin-top:6px;">All metrics<span>Every metric with data, at a glance</span></h2>
    <div class="am-grid" id="allMetricsGrid"></div>
  </section>

  <!-- TRENDS: INSIGHTS (strain, workout types, seasonal) -->
  <section class="section" id="tab-insights">
    <h2 class="sec" style="margin-top:6px;">Strain vs recovery<span>Exercise load vs your recovery signals</span></h2>
    <div class="card">
      <div class="chart-box"><canvas id="scatterChart"></canvas></div>
      <div class="card-sub" style="margin-top:8px;">Dot size = exercise minutes. X = strain (exercise + active energy). Y = recovery (HRV percentile).</div>
    </div>

    <h2 class="sec">Workouts by type<span>What you do most</span></h2>
    <div class="card">
      <div class="wt-bars" id="wtBars"></div>
    </div>

    <h2 class="sec">Seasonal patterns<span>How your metrics shift across months</span></h2>
    <div class="season-grid" id="seasonGrid"></div>
  </section>

  <!-- TRENDS: DAY EXPLORER -->
  <section class="section" id="tab-dayexplorer">
    <h2 class="sec" style="margin-top:6px;">Day explorer<span>Pick any day and see every metric</span></h2>
    <div class="de-picker">
      <input type="date" id="deDate" />
      <button onclick="deNav(-1)">&larr; Prev</button>
      <button onclick="deNav(1)">Next &rarr;</button>
      <button onclick="deToday()">Today</button>
    </div>
    <div class="de-grid" id="deGrid"></div>
  </section>

  <!-- YOU: RECORDS -->
  <section class="section" id="tab-records">
    <h2 class="sec" style="margin-top:6px;">Heatmap<span>Every day at a glance</span></h2>
    <div class="card">
      <div class="hm-metric-sel">
        <select id="hmMetricSel" onchange="changeHmMetric(this.value)">
          <option value="activity" selected>Activity</option>
          <option value="steps">Steps</option>
          <option value="exerciseMinutes">Exercise min</option>
          <option value="sleepHours">Sleep hours</option>
          <option value="hrv">HRV</option>
          <option value="restingHeartRate">Resting HR</option>
          <option value="activeEnergy">Active energy</option>
        </select>
      </div>
      <div class="hm-year-selector" id="hmYears"></div>
      <div class="hm-labels" id="hmLabels"></div>
      <div class="heatmap-wrap"><div class="heatmap" id="heatmap"></div></div>
      <div class="hm-legend">Less <span class="hm-cell"></span><span class="hm-cell hm-1"></span><span class="hm-cell hm-2"></span><span class="hm-cell hm-3"></span><span class="hm-cell hm-4"></span> More</div>
    </div>

    <h2 class="sec">Then vs now<span>How your key metrics changed over the years</span></h2>
    <div class="tvn-grid" id="thenVsNow"></div>

    <h2 class="sec">Personal bests<span>Your all-time records</span></h2>
    <div class="card"><div class="bests" id="bestsGrid"></div></div>

    <h2 class="sec">Milestones<span>What you have accomplished</span></h2>
    <div class="milestones" id="milestones"></div>
  </section>

  <!-- WEEKLY STORY -->
  <section class="section" id="tab-story">
    <h2 class="sec" style="margin-top:6px;">Your weeks<span>Swipe through recent weeks</span></h2>
    <div class="story-scroll" id="storyScroll"></div>

    <h2 class="sec">Year in review<span id="yirYear"></span></h2>
    <div class="yir-grid" id="yirGrid"></div>
  </section>

  <!-- AI ANALYST -->
  <section class="section" id="tab-ai">
    ${reviewCard("overview", "AI Insights")}

    <div class="card ai-card">
      <h3>✦ Ask my health data</h3>
      <div class="card-sub">Answers come from your real numbers.</div>
      <form class="profile-form" onsubmit="askHealthQuestion(event)" style="margin-bottom:10px;">
        <input id="askInput" type="text" placeholder="e.g. How has my HRV changed over 90 days?" style="flex:1;" />
        <button type="submit" class="btn btn-sm" id="askBtn">Ask</button>
      </form>
      <div id="askBody"></div>
    </div>

    <div class="card ai-card">
      <h3>✦ Chart this for me</h3>
      <div class="card-sub">Your real data. AI only picks what to plot.</div>
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
    ${reviewCard("discoveries", "Discoveries review", "What your patterns suggest, and how to test them.")}
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
      <div class="card-sub">Compare before and after a change.</div>
      <form class="profile-form" onsubmit="createExperiment(event)" style="margin-bottom:12px;">
        <input id="expTitle" type="text" placeholder="e.g. Consistent 10:30pm bedtime" style="flex:1; min-width:160px;" />
        <select id="expMetric"></select>
        <input id="expStartDate" type="date" />
        <button type="submit" class="btn btn-sm">Start</button>
      </form>
      <div id="experimentsList"></div>
    </div>
  </section>

  <!-- PLAN & GOALS -->
  <section class="section" id="tab-plan">
    <h2 class="sec" style="margin-top:6px;">This week's plan<span id="planSub">Adapts to your recovery each day</span></h2>
    <div class="card">
      <div class="plan-head">
        <div id="planProgress" class="plan-progress"></div>
        <button class="btn btn-ghost btn-sm" id="planRegenBtn" onclick="regeneratePlan()">Rewrite plan</button>
      </div>
      <div id="planRationale" class="card-sub" style="margin-top:8px;"></div>
      <div class="plan-days" id="planDays"><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div></div>
    </div>

    <h2 class="sec">Goals<span>Targets with deadlines, tracked against your trend</span></h2>
    <div id="goalsList"></div>
    <div class="card">
      <h3>Add a goal</h3>
      <form class="goal-form" onsubmit="addGoal(event)">
        <select id="goalMetric" onchange="updateGoalHint()"></select>
        <input id="goalTarget" type="number" step="any" placeholder="Target" required />
        <input id="goalDeadline" type="date" required />
        <input id="goalTitle" type="text" placeholder="Name (optional)" />
        <button type="submit" class="btn btn-sm">Add goal</button>
      </form>
      <div class="card-sub" id="goalHint" style="margin-top:8px;"></div>
    </div>
    <h2 class="sec">This week<span>Last 7 days</span></h2>
    <div class="card"><div class="week" id="weekStrip"></div>
      <div class="legend"><span><i class="lg-bar"></i>steps</span><span><i class="lg-dot on"></i>ring closed</span><span><i class="lg-dot"></i>ring missed</span></div>
    </div>
    <div class="highlights" id="highlights"></div>
    <button class="btn btn-ghost btn-sm" id="moreHighlights" style="display:none;margin:-4px 0 14px;" onclick="toggleHighlights()">Show all highlights</button>
    ${reviewCard("weekly", "Your week in review", "What worked, what slipped, what to change.")}
    <div id="weekRecap"></div>

    <h2 class="sec">Key numbers<span>Latest values with 30-day trend</span></h2>
    <div class="grid" id="quickStats"></div>
    <div class="untracked" id="untracked"></div>

    <h2 class="sec" id="scoreSection">Health score<span>Four areas, scored against your own data</span></h2>
    <div class="scoreboard card" id="scoreboardCard">
      <div class="multi-ring-layout">
        <div class="multi-ring" id="multiRing">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r="72" fill="none" stroke="#1d1d1d" stroke-width="10" />
            <circle cx="90" cy="90" r="58" fill="none" stroke="#1d1d1d" stroke-width="10" />
            <circle cx="90" cy="90" r="44" fill="none" stroke="#1d1d1d" stroke-width="10" />
            <circle cx="90" cy="90" r="30" fill="none" stroke="#1d1d1d" stroke-width="10" />
            <circle id="sr0" cx="90" cy="90" r="72" fill="none" stroke="#34d399" stroke-width="10" stroke-linecap="round" stroke-dasharray="452.4" stroke-dashoffset="452.4" class="score-arc" />
            <circle id="sr1" cx="90" cy="90" r="58" fill="none" stroke="#f76b4d" stroke-width="10" stroke-linecap="round" stroke-dasharray="364.4" stroke-dashoffset="364.4" class="score-arc" />
            <circle id="sr2" cx="90" cy="90" r="44" fill="none" stroke="#60a5fa" stroke-width="10" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="276.5" class="score-arc" />
            <circle id="sr3" cx="90" cy="90" r="30" fill="none" stroke="#a78bfa" stroke-width="10" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="188.5" class="score-arc" />
          </svg>
          <div class="ring-label"><div class="n" id="scoreNum">—</div><div class="u">health score</div></div>
        </div>
        <div class="multi-ring-info">
          <div class="score-word" id="scoreWord">—</div>
          <div class="score-summary" id="scoreSummary">Calculating…</div>
          <div class="ring-legend" id="ringLegend"></div>
        </div>
      </div>
      <details class="more"><summary>How is this calculated?</summary><div>The average of four 0-100 scores. <b>Recovery</b>: today\\'s heart data vs your normal. <b>Activity</b>: exercise minutes vs 150 a week, steps vs 8,000. <b>Fitness</b>: VO2max for your age, plus active days. <b>Sleep</b>: hours vs your goal. Areas without data are skipped, not guessed.</div></details>
    </div>
  </section>

  <!-- TRAINING -->
  <section class="section" id="tab-training">
    ${reviewCard("training", "Training review", "Load, consistency, and your next 7 days.")}
    <div class="card">
      <h3>Action items</h3>
      <ul class="actions" id="trainingActions"><li class="sub">Loading…</li></ul>
    </div>
    <div id="trainingLoadStats" class="grid"></div>
    <div class="fit-grid" id="fitnessMetrics"></div>
    <div class="card">
      <h3>Fitness, fatigue &amp; form</h3>
      <div class="card-sub">Bars: daily load. Green: fitness base. Red: fatigue. Blue: freshness.</div>
      <div class="chart-box"><canvas id="loadChart"></canvas></div>
      <div class="guide"><div class="g-mean">Fitness rising slowly while form hovers between −5 and +3 is productive training. Form below −5 for days = overreaching; above +5 for weeks = detraining.</div><div class="g-act">Build fitness ~5-10% a week; every 3-4 weeks take an easier week to let form recover.</div></div>
    </div>
    <div class="card">
      <h3>Weekly volume (last 8 weeks)</h3>
      <div class="card-sub">Active day: 20+ exercise minutes or a workout.</div>
      <div id="weeklyTable"></div>
    </div>
  </section>

  <!-- HEART & RECOVERY -->
  <section class="section" id="tab-heart">
    ${reviewCard("recovery", "Recovery review", "How well you bounce back.")}
    <div class="card"><h3>Resting heart rate &amp; HRV</h3><div class="chart-box"><canvas id="heartChart"></canvas></div><div data-guide="restingHeartRate,hrv"></div></div>
    <div class="card"><h3>Heart rate range (avg / min / max)</h3><div class="chart-box"><canvas id="hrRangeChart"></canvas></div><div data-guide="heartRateAvg,walkingHeartRateAvg"></div></div>
    <div class="card"><h3>VO2max trend</h3><div class="chart-box"><canvas id="vo2Chart"></canvas></div><div data-guide="vo2max"></div></div>
    <div class="card">
      <h3>Readiness, explained</h3>
      <div class="card-sub">HRV, resting heart rate and sleep vs <em>your</em> 30-day normal.</div>
      <div data-guide="readiness,strain,respiratoryRate,oxygenSaturation"></div>
    </div>
  </section>

  <!-- ACTIVITY & MOBILITY -->
  <section class="section" id="tab-activity">
    ${reviewCard("activity", "Activity review")}
    <div class="card"><h3>Steps</h3><div class="chart-box"><canvas id="stepsChart"></canvas></div><div data-guide="steps"></div></div>
    <div class="card"><h3>Active energy &amp; exercise minutes</h3><div class="chart-box"><canvas id="energyChart"></canvas></div><div data-guide="activeEnergy,exerciseMinutes"></div></div>
    <div class="card"><h3>Stand minutes &amp; flights climbed</h3><div class="chart-box"><canvas id="standChart"></canvas></div><div data-guide="standHours,flightsClimbed"></div></div>
    <div class="card"><h3>Walking speed &amp; gait quality</h3><div class="card-sub">Walking speed is a strong marker of healthy ageing.</div><div class="chart-box"><canvas id="gaitChart"></canvas></div><div data-guide="walkingSpeed,walkingAsymmetryPct,walkingDoubleSupportPct"></div></div>
    <div class="card"><h3>Workouts</h3><div class="chart-box"><canvas id="workoutChart"></canvas></div><div data-guide="workoutMinutes"></div></div>
    <div class="card">
      <h3>Recent sessions</h3>
      <div id="workoutList" class="card-sub">No workout sessions in the imported data yet.</div>
    </div>
    <div class="card">
      <h3>Activity Rings</h3>
      <div class="card-sub">Today vs your ring goals.</div>
      <div id="activityRings" class="sub">No Activity Ring data in the imported data yet.</div>
    </div>
  </section>

  <!-- SLEEP -->
  <section class="section" id="tab-sleep">
    ${reviewCard("sleep", "Sleep review")}
    <div class="card"><h3>Sleep duration</h3><div class="chart-box"><canvas id="sleepChart"></canvas></div><div data-guide="sleepHours,sleepEfficiency"></div></div>
    <div class="card"><h3>Sleep stages</h3><div class="card-sub">Core, deep, REM and awake time.</div><div class="chart-box"><canvas id="sleepStagesChart"></canvas></div><div data-guide="sleepDeepHours,sleepRemHours"></div></div>
    <div class="card"><h3>Weight</h3><div class="chart-box"><canvas id="weightChart"></canvas></div><div data-guide="weightKg,bodyFatPct"></div></div>
  </section>

  <!-- BIOLOGICAL AGE -->
  <section class="section" id="tab-age">
    ${reviewCard("body", "Body & bio-age review", "Your oldest marker, and how to improve it.")}
    <div class="card"><h3>Biological vs chronological age</h3><div class="chart-box"><canvas id="ageChart"></canvas></div><div data-guide="biologicalAge"></div></div>
    <div class="card">
      <h3>What's driving it</h3>
      <div class="card-sub">Shorter bars are younger.</div>
      <div class="markers-list" id="markersList"></div>
    </div>
  </section>

  <!-- EVERYTHING ELSE -->
  <section class="section" id="tab-more">
    <div class="card">
      <h3>Everything else your export contained</h3>
      <div class="card-sub">Everything else your export recorded.</div>
      <div id="extraList"></div>
    </div>
  </section>

  <!-- SETTINGS -->
  <section class="section" id="tab-settings">
    <div class="card" id="profileCard">
      <h3>Profile</h3>
      <div class="card-sub">Needed once, for biological age.</div>
      <form class="profile-form" onsubmit="saveProfile(event)">
        <input id="birthDate" type="date" required />
        <select id="sex"><option value="male">Male</option><option value="female">Female</option></select>
        <input id="heightCm" type="number" placeholder="Height (cm)" />
        <button type="submit" class="btn btn-sm">Save</button>
      </form>
    </div>
    <div class="card">
      <h3>Goals &amp; notes</h3>
      <div class="card-sub">Your context for the AI. Never used in scores.</div>
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
      <p class="card-sub">Health app → profile picture → Export All Health Data. The file is read in your browser; only daily summaries are uploaded.</p>
      <div class="import-row">
        <input id="importFile" type="file" accept=".zip" />
        <button class="btn btn-sm" id="importBtn" onclick="importExportZip()">Import</button>
      </div>
      <progress id="importProgress" value="0" max="100" style="display:none;"></progress>
      <p id="importStatus" class="sub"></p>
    </div>
    <div class="card">
      <h3>Data coverage</h3>
      <div class="card-sub">Missing days stay missing, never guessed.</div>
      <div id="coverageSummary" class="sub">Loading…</div>
      <div id="coverageList"></div>
    </div>
    <div class="card">
      <h3>Personal baselines (30-day)</h3>
      <div class="card-sub">What's normal for <em>you</em>.</div>
      <div id="baselineList"></div>
    </div>
    <div class="card">
      <h3>Export your data</h3>
      <p class="card-sub">Every day and every metric, as a CSV.</p>
      <button class="btn btn-sm" onclick="exportCsv()" id="exportBtn">Download CSV</button>
      <p id="exportStatus" class="sub"></p>
    </div>
  </section>

  <footer>Estimates only, not medical advice. Data lives in your own GitHub repo.</footer>

  <div class="metric-sheet" id="metricSheet">
    <div class="ms-handle"></div>
    <div class="ms-head">
      <button class="ms-back" onclick="closeMetric()">&larr;</button>
      <span class="ms-title" id="msTitle"></span>
      <span id="msPill"></span>
    </div>
    <div class="ms-body" id="msBody"></div>
  </div>

  <button class="checkin-fab" id="checkinFab" onclick="openCheckin()">+</button>
  <div class="checkin-overlay" id="checkinOverlay">
    <div class="checkin-sheet">
      <h3>Evening check-in</h3>
      <div class="ci-q"><label>How do you feel?</label>
        <div class="ci-opts" id="ciMood">
          <span class="ci-opt" data-v="great" onclick="ciSel(this)">Great</span>
          <span class="ci-opt" data-v="good" onclick="ciSel(this)">Good</span>
          <span class="ci-opt" data-v="ok" onclick="ciSel(this)">OK</span>
          <span class="ci-opt" data-v="tired" onclick="ciSel(this)">Tired</span>
          <span class="ci-opt" data-v="bad" onclick="ciSel(this)">Bad</span>
        </div>
      </div>
      <div class="ci-q"><label>Energy level</label>
        <div class="ci-opts" id="ciEnergy">
          <span class="ci-opt" data-v="high" onclick="ciSel(this)">High</span>
          <span class="ci-opt" data-v="moderate" onclick="ciSel(this)">Moderate</span>
          <span class="ci-opt" data-v="low" onclick="ciSel(this)">Low</span>
        </div>
      </div>
      <div class="ci-actions">
        <button class="ci-cancel" onclick="closeCheckin()">Cancel</button>
        <button class="ci-save" onclick="saveCheckin()">Save</button>
      </div>
    </div>
  </div>

  <div class="install-banner" id="installBanner">
    <div class="ib-text">Add to home screen for quick access.</div>
    <button onclick="installApp()">Install</button>
    <button onclick="dismissInstall()" style="background:transparent;color:var(--dim);padding:6px 8px;">&times;</button>
  </div>
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
var TAB_REVIEWS = { overview: ['today'], plan: ['weekly'], longview: ['longterm'], training: ['training'], heart: ['recovery'], activity: ['activity'], sleep: ['sleep'], age: ['body'], discoveries: ['discoveries'], ai: ['overview'] };
// Five top-level views, each a group of sections shown one at a time via
// a sub-tab row. Sections keep their old ids, so every loader still works.
var VIEWS = {
  today: [['overview', 'Today']],
  plan: [['plan', 'Week and goals'], ['training', 'Training load']],
  trends: [['heart', 'Heart'], ['activity', 'Activity'], ['sleep', 'Sleep and body'], ['longview', 'Long view'], ['insights', 'Insights'], ['dayexplorer', 'Day explorer'], ['allmetrics', 'All metrics']],
  coach: [['ai', 'Ask and reviews'], ['discoveries', 'Discoveries'], ['story', 'Weekly story']],
  you: [['age', 'Biological age'], ['records', 'Records'], ['more', 'More data'], ['settings', 'Settings']],
};
function viewOf(sectionId) {
  for (var v in VIEWS) if (VIEWS[v].some(function (x) { return x[0] === sectionId; })) return v;
  return 'today';
}
function showView(view) {
  var last = null;
  try { last = localStorage.getItem('healthSub:' + view); } catch (e) {}
  var ok = last && VIEWS[view].some(function (x) { return x[0] === last; });
  showTab(ok ? last : VIEWS[view][0][0]);
  window.scrollTo(0, 0);
}
function showTab(id) {
  if (!document.getElementById('tab-' + id)) id = 'overview';
  var view = viewOf(id);
  document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active', 'tab-enter'); });
  var activeSection = document.getElementById('tab-' + id);
  activeSection.classList.add('active');
  void activeSection.offsetWidth;
  activeSection.classList.add('tab-enter');
  document.querySelectorAll('#primaryNav .tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === view); });
  var subs = VIEWS[view];
  document.getElementById('subNav').innerHTML = subs.length < 2 ? '' : subs.map(function (x) {
    return '<button class="subtab' + (x[0] === id ? ' active' : '') + '" onclick="showTab(&quot;' + x[0] + '&quot;)">' + x[1] + '</button>';
  }).join('');
  try { localStorage.setItem('healthTab', id); localStorage.setItem('healthSub:' + view, id); } catch (e) {}

  // Reviews are pre-written server-side and all loaded at boot (see
  // loadAllReviews); this only covers a tab opened before that finished.
  if (appBooted) (TAB_REVIEWS[id] || []).forEach(function (domain) {
    if (!reviewLoadedOnce[domain]) { reviewLoadedOnce[domain] = true; loadReview(domain, false); }
  });
  if (appBooted) { staggerReveal(activeSection); initScrollAnimations(activeSection); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  requestAnimationFrame(function () {
    var subNav = document.getElementById('subNav');
    var activeBtn = subNav ? subNav.querySelector('.subtab.active') : null;
    if (activeBtn && subNav) {
      subNav.style.setProperty('--ul-left', activeBtn.offsetLeft + 'px');
      subNav.style.setProperty('--ul-width', activeBtn.offsetWidth + 'px');
    }
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

var BASELINES = null;
var charts = {};
var C = { pulse:'#a3e635', up:'#34d399', down:'#f76b4d', caution:'#fbbf24', blue:'#60a5fa', purple:'#a78bfa', dim:'#8a8a8a', grid:'#1e1e1e', faint:'#555555' };

function countUp(el, target, duration, decimals, from, force) {
  if (!el || (!force && el.dataset.counted)) return;
  el.dataset.counted = '1';
  duration = duration || 600;
  decimals = decimals || 0;
  from = from || 0;
  var start = performance.now();
  function step(now) {
    var t = Math.min((now - start) / duration, 1);
    var ease = 1 - Math.pow(1 - t, 3);
    el.textContent = (from + (target - from) * ease).toFixed(decimals);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = target.toFixed(decimals);
  }
  requestAnimationFrame(step);
}

function morphNumber(el, newValue, decimals) {
  if (!el) return;
  var cur = parseFloat(el.textContent) || 0;
  if (Math.abs(cur - newValue) < 0.01) return;
  countUp(el, newValue, 400, decimals, cur, true);
}

function staggerReveal(container) {
  if (!container) return;
  var els = container.querySelectorAll('.card, .stat, .ai-card, .fit, .lv, .hl, .trio .t, .brief-item');
  els.forEach(function (el, i) {
    el.classList.remove('reveal');
    void el.offsetWidth;
    el.style.animationDelay = (i * 40) + 'ms';
    el.classList.add('reveal');
  });
}

var scrollObserver = null;
var SCROLL_REVEAL_SELECTOR = '.card, .stat, .fit, .lv, .hl, .trio .t, .brief-item, .recap-card, .yir, .tvn-card, .milestone, .wk-card, .season-card, h2.sec';
function initScrollAnimations(root) {
  if (!('IntersectionObserver' in window)) return;
  if (!scrollObserver) {
    scrollObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); scrollObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.15, rootMargin: '-40px' });
  }
  var scope = root || document;
  var els = scope.querySelectorAll(SCROLL_REVEAL_SELECTOR);
  els.forEach(function (el, i) {
    if (el.classList.contains('in-view') || el.classList.contains('scroll-observe')) return;
    el.classList.add('scroll-observe');
    el.style.setProperty('--stagger', Math.min(i, 12) * 60 + 'ms');
    scrollObserver.observe(el);
  });
}

var crosshairPlugin = {
  id: 'crosshair',
  afterInit: function (chart) {
    chart._crosshair = { idx: -1, x: 0 };
  },
  afterDraw: function (chart) {
    var ci = chart._crosshair;
    if (!ci || ci.idx < 0) return;
    var ctx = chart.ctx, area = chart.chartArea;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1;
    ctx.moveTo(ci.x, area.top);
    ctx.lineTo(ci.x, area.bottom);
    ctx.stroke();
    ctx.restore();
  }
};
Chart.register(crosshairPlugin);

function attachCrosshair(id) {
  var canvas = document.getElementById(id);
  if (!canvas) return;
  var wrap = canvas.closest('.chart-wrap');
  if (!wrap) {
    var parent = canvas.parentElement;
    wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    parent.insertBefore(wrap, canvas);
    wrap.appendChild(canvas);
  }
  var readout = wrap.querySelector('.chart-readout');
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'chart-readout';
    wrap.appendChild(readout);
  }
  canvas.style.touchAction = 'pan-y';

  function update(evt) {
    var chart = charts[id];
    if (!chart) return;
    var rect = canvas.getBoundingClientRect();
    var clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    var x = clientX - rect.left;
    var area = chart.chartArea;
    if (x < area.left || x > area.right) { hide(); return; }
    var scale = chart.scales.x;
    var idx = Math.round(scale.getValueForPixel(x));
    var labels = chart.data.labels || [];
    if (idx < 0 || idx >= labels.length) { hide(); return; }
    chart._crosshair.idx = idx;
    chart._crosshair.x = scale.getPixelForValue(idx);
    chart.draw();
    var html = '<div class="cr-date">' + labels[idx] + '</div>';
    chart.data.datasets.forEach(function (ds) {
      var v = ds.data[idx];
      if (v === null || v === undefined) return;
      var c = ds.borderColor || ds.backgroundColor || C.pulse;
      if (typeof c !== 'string') c = C.pulse;
      c = c.replace(/99$/, '');
      html += '<div class="cr-row"><span class="cr-dot" style="background:' + c + '"></span><span class="cr-val">' + (typeof v === 'number' ? (v % 1 ? v.toFixed(1) : v) : v) + '</span> <span style="color:' + C.dim + '">' + ds.label + '</span></div>';
    });
    readout.innerHTML = html;
    readout.classList.add('vis');
    var rx = chart._crosshair.x - readout.offsetWidth / 2;
    rx = Math.max(0, Math.min(rx, wrap.offsetWidth - readout.offsetWidth));
    readout.style.left = rx + 'px';
  }

  function hide() {
    var chart = charts[id];
    if (chart && chart._crosshair) { chart._crosshair.idx = -1; chart.draw(); }
    readout.classList.remove('vis');
  }

  canvas.addEventListener('pointermove', update);
  canvas.addEventListener('pointerdown', update);
  canvas.addEventListener('pointerleave', hide);
  canvas.addEventListener('pointerup', hide);
}

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

  var chartFont = "'Barlow Condensed',-apple-system,sans-serif";
  config.options = Object.assign({ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{ legend:{ labels:{ color:C.dim, boxWidth:10, font:{size:11, family:chartFont} } },
      tooltip:{enabled:false} },
    scales:{ x:{ ticks:{ color:C.dim, maxTicksLimit:8, font:{size:9, family:chartFont} }, grid:{ display:false }, border:{display:false} },
             y:{ ticks:{ color:C.dim, font:{size:9, family:chartFont} }, grid:{ color:C.grid, drawBorder:false }, border:{display:false} } },
    animation:{ duration:800 } }, config.options || {});
  var wrap = el.closest('.chart-wrap');
  (wrap || el.parentElement).style.height = '280px';
  if (config.type === 'line') {
    (config.data.datasets || []).forEach(function (ds, i) {
      if (i === 0 || (config.data.datasets.length === 1)) {
        ds.fill = ds.fill !== undefined ? ds.fill : true;
        if (!ds._gradientColor) ds._gradientColor = ds.borderColor || C.pulse;
      }
    });
  }
  if (config.type === 'bar') {
    (config.data.datasets || []).forEach(function (ds) {
      if (ds.borderRadius === undefined) ds.borderRadius = 3;
    });
  }
  charts[id] = new Chart(el, config);
  if (config.type === 'line') {
    var ctx = el.getContext('2d');
    var area = charts[id].chartArea;
    (config.data.datasets || []).forEach(function (ds, i) {
      if (ds._gradientColor && (i === 0 || config.data.datasets.length === 1)) {
        var grad = ctx.createLinearGradient(0, area.top, 0, area.bottom);
        grad.addColorStop(0, ds._gradientColor + '30');
        grad.addColorStop(1, ds._gradientColor + '00');
        charts[id].data.datasets[i].backgroundColor = grad;
        charts[id].data.datasets[i].fill = true;
      }
    });
    charts[id].update('none');
  }
  attachCrosshair(id);
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
    { label: 'Move', actual: today.activeEnergy, goal: today.activeEnergyGoal, unit: 'kcal', color: C.down },
    { label: 'Exercise', actual: today.exerciseMinutes, goal: today.exerciseMinutesGoal, unit: 'min', color: C.up },
    { label: 'Stand', actual: today.standHours, goal: today.standHoursGoal, unit: 'hr', color: C.pulse },
  ];
  var radii = [42, 32, 22];
  var sw = 8;
  var svgSize = 100;
  var svgRings = rings.map(function (r, i) {
    if (r.goal === undefined) return { svg: '', row: '' };
    var pct = r.actual !== undefined ? Math.min((r.actual / r.goal), 1.5) : 0;
    var radius = radii[i];
    var circ = 2 * Math.PI * radius;
    var offset = circ * (1 - pct);
    return {
      svg: '<circle cx="' + svgSize / 2 + '" cy="' + svgSize / 2 + '" r="' + radius + '" fill="none" stroke="' + r.color + '" stroke-opacity=".12" stroke-width="' + sw + '"/>' +
           '<circle cx="' + svgSize / 2 + '" cy="' + svgSize / 2 + '" r="' + radius + '" fill="none" stroke="' + r.color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + circ.toFixed(1) + '" data-target="' + offset.toFixed(1) + '"/>',
      row: '<div class="ar-row"><span class="ar-dot" style="background:' + r.color + '"></span><span class="ar-name">' + r.label + '</span><span class="ar-num">' + fmt(r.actual, 0) + '<span class="ar-goal">/ ' + fmt(r.goal, 0) + ' ' + r.unit + '</span></span><span class="ar-pct" style="color:' + r.color + '">' + Math.round(pct * 100) + '%</span></div>'
    };
  });
  el.innerHTML = '<div class="ar-wrap"><svg class="ar-svg" viewBox="0 0 ' + svgSize + ' ' + svgSize + '" width="120" height="120" style="transform:rotate(-90deg)">' +
    svgRings.map(function (r) { return r.svg; }).join('') + '</svg><div class="ar-labels">' +
    svgRings.map(function (r) { return r.row; }).join('') + '</div></div>';
  requestAnimationFrame(function () {
    el.querySelectorAll('circle[data-target]').forEach(function (c) { c.style.strokeDashoffset = c.dataset.target; });
  });
}

function renderMarkers(latest) {
  var el = document.getElementById('markersList');
  if (!latest || !latest.markers.length) { el.innerHTML = '<p class="sub">No markers yet.</p>'; return; }
  var colors = [C.pulse, C.blue, C.down, C.up, C.caution];
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
function scoreColor(n) { return { good: C.up, ok: C.pulse, watch: C.caution, bad: C.down, unknown: C.faint }[scoreStatus(n)]; }
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

// ---------------- Today: verdict + dials ----------------
// Filled in from three async sources (trends at boot, then fitness and the
// plan); renderVerdict() re-runs as each arrives.
var TODAY = { readiness: null, strain: null, score: null, fitness: null, plan: null };
var HARD_TYPES = ['intervals', 'long', 'strength'];

function renderVerdict() {
  var r = TODAY.readiness;
  var flag = TODAY.fitness ? (TODAY.fitness.actionItems || []).filter(function (a) { return a.priority === 'high' && a.area === 'recovery'; })[0] : null;
  var t = TODAY.plan && TODAY.plan.today;
  var s = t ? (t.adjusted || t) : null;
  var cls = 'v-neutral', word = 'No call yet', line = 'Needs a few days of heart data.';
  if (r !== null || flag || (t && t.adjusted)) {
    if ((r !== null && r < 45) || flag || (t && t.adjusted)) { cls = 'v-recover'; word = 'Recover'; }
    else if (r !== null && r >= 70 && !flag) { cls = 'v-hard'; word = 'Go hard'; }
    else { cls = 'v-steady'; word = 'Go steady'; }
  }
  if (t && t.status === 'done') line = 'Today’s session is done: ' + t.title + '. Recover well tonight.';
  else if (s && s.type === 'rest') line = 'Rest day. Light stretching only.';
  else if (s) line = s.title + ', ' + s.minutes + ' min. ' + s.detail;
  else if (word === 'Recover') line = 'Easy walk or stretching only. Sleep early.';
  else if (word === 'Go hard') line = 'Good day for your hardest session.';
  else if (word === 'Go steady') line = 'Train, but keep it moderate.';
  var why = [];
  if (t && t.adjusted) why.push(t.adjusted.reason); // already names readiness
  else {
    if (r !== null) why.push('Readiness ' + r + '/100');
    if (flag) why.push(flag.why);
  }
  var el = document.getElementById('verdict');
  el.className = 'verdict ' + cls;
  document.getElementById('verdictWord').textContent = (r !== null && r >= 90 ? '\\u{1F451} ' : '') + word;
  document.getElementById('verdictLine').textContent = (r !== null && r >= 85 && word === 'Go hard' ? 'Beast mode. ' : '') + line;
  document.getElementById('verdictWhy').textContent = why.join(' · ');
}

// ---------- today: sleep brief, body state, strain budget, what moved ----------
function renderSleepBrief(today, prev) {
  var h = today ? today.sleepHours : null;
  var q = today && today.sleepEfficiency !== undefined ? Math.round(today.sleepEfficiency * 100) : null;
  var deep = today ? (today.sleepDeepHours || 0) + (today.sleepRemHours || 0) : null;
  var elH = document.getElementById('bSleepH');
  var elQ = document.getElementById('bSleepQ');
  var elD = document.getElementById('bDeepRem');
  if (h !== null) { elH.textContent = '0'; countUp(elH, h, 600, 1); } else elH.textContent = '—';
  if (q !== null) { elQ.textContent = '0'; countUp(elQ, q, 600, 0); } else elQ.textContent = '—';
  if (deep !== null && deep > 0) { elD.textContent = '0'; countUp(elD, deep, 600, 1); } else elD.textContent = '—';
}

function renderSleepArch(today) {
  var el = document.getElementById('sleepArch');
  if (!el || !today) return;
  var stages = [
    { key: 'sleepCoreHours', label: 'Core', cls: 'seg-core', color: '#60a5fa' },
    { key: 'sleepDeepHours', label: 'Deep', cls: 'seg-deep', color: '#3b82f6' },
    { key: 'sleepRemHours', label: 'REM', cls: 'seg-rem', color: '#a78bfa' },
    { key: 'sleepAwakeHours', label: 'Awake', cls: 'seg-awake', color: 'rgba(247,107,77,.7)' },
  ];
  var total = 0;
  stages.forEach(function (s) { total += today[s.key] || 0; });
  if (total <= 0) { el.innerHTML = ''; return; }
  var bar = '<div class="sleep-arch">';
  stages.forEach(function (s) {
    var v = today[s.key] || 0;
    var pct = Math.round(v / total * 100);
    if (pct < 1) return;
    bar += '<div class="seg ' + s.cls + '" style="width:' + pct + '%">' + (pct >= 8 ? pct + '%' : '') + '</div>';
  });
  bar += '</div><div class="sleep-arch-legend">';
  stages.forEach(function (s) {
    var v = today[s.key] || 0;
    if (v <= 0) return;
    bar += '<div class="sal"><div class="sal-dot" style="background:' + s.color + '"></div>' + s.label + ' <span class="sal-val">' + v.toFixed(1) + 'h</span></div>';
  });
  bar += '</div>';
  el.innerHTML = bar;
}

function renderBodyState(today, baselines) {
  var hrv = today ? today.hrv : null;
  var rhr = today ? today.restingHeartRate : null;
  var recov = TODAY.readiness;
  document.getElementById('bHrv').textContent = hrv !== null ? String(Math.round(hrv)) : '—';
  document.getElementById('bRhr').textContent = rhr !== null ? String(Math.round(rhr)) : '—';
  document.getElementById('bRecov').textContent = recov !== null ? recov + '/100' : '—';
  if (baselines) {
    var hrvB = baselines.hrv, rhrB = baselines.restingHeartRate;
    if (hrvB && hrvB.mean && hrv !== null) {
      var d = Math.round(hrv - hrvB.mean);
      var el = document.getElementById('bHrvD');
      el.textContent = (d >= 0 ? '+' : '') + d + ' ms';
      el.className = 'brief-d ' + (d >= 0 ? 'up' : 'dn');
    }
    if (rhrB && rhrB.mean && rhr !== null) {
      var d2 = Math.round(rhr - rhrB.mean);
      var el2 = document.getElementById('bRhrD');
      el2.textContent = (d2 >= 0 ? '+' : '') + d2 + ' bpm';
      el2.className = 'brief-d ' + (d2 <= 0 ? 'up' : 'dn');
    }
  }
}

function renderStrainBudget() {
  var strain = TODAY.strain || 0;
  var recov = TODAY.readiness;
  var maxStrain = recov !== null && recov >= 70 ? 18 : recov !== null && recov >= 45 ? 14 : 10;
  var pct = Math.min(100, Math.round(strain / 21 * 100));
  var fill = document.getElementById('sbFill');
  fill.style.width = pct + '%';
  fill.className = 'sb-fill' + (strain > maxStrain ? ' over' : strain > maxStrain * 0.8 ? ' high' : '');
  document.getElementById('sbUsed').textContent = fmt(strain, 1);
  document.getElementById('sbMax').textContent = String(maxStrain);
  document.getElementById('sbTarget').style.left = Math.round(maxStrain / 21 * 100) + '%';
}

function renderWhatMoved(today, yesterday) {
  var el = document.getElementById('whatMovedList');
  if (!today || !yesterday) { el.innerHTML = '<div class="sub">Need two days of data.</div>'; return; }
  var keys = ['steps', 'exerciseMinutes', 'restingHeartRate', 'hrv', 'sleepHours', 'activeEnergy', 'vo2max', 'walkingSpeed'];
  var moved = [];
  keys.forEach(function (k) {
    if (typeof today[k] !== 'number' || typeof yesterday[k] !== 'number') return;
    var diff = today[k] - yesterday[k];
    var pct = yesterday[k] !== 0 ? Math.abs(diff / yesterday[k]) : 0;
    if (pct < 0.1 && Math.abs(diff) < 3) return;
    var fmt2 = METRIC_FORMAT[k];
    var unit = fmt2 ? (fmt2.unit || '') : '';
    var label = k.replace(/([A-Z])/g, ' $1').trim();
    var better = fmt2 && fmt2.better;
    var isUp = diff > 0;
    var good = better === 'higher' ? isUp : better === 'lower' ? !isUp : null;
    moved.push({ key: k, label: label, val: fmtMetricVal(k, today[k]), diff: diff, pct: pct, unit: unit, isUp: isUp, good: good });
  });
  moved.sort(function (a, b) { return b.pct - a.pct; });
  if (moved.length === 0) { el.innerHTML = '<div class="sub">Steady day — nothing flagged.</div>'; return; }
  el.innerHTML = moved.slice(0, 5).map(function (m) {
    var arrow = m.isUp ? '&#9650;' : '&#9660;';
    var cls = m.good === true ? 'up' : m.good === false ? 'dn' : '';
    var click = METRIC_FORMAT[m.key] ? ' style="cursor:pointer" onclick="openMetric(\\'' + m.key + '\\')"' : '';
    return '<div class="wm-item"' + click + '><span class="wm-key">' + m.label + '</span> <span class="wm-val">' + m.val + '</span> <span class="wm-delta ' + cls + '">' + arrow + ' ' + Math.round(m.pct * 100) + '%</span></div>';
  }).join('');
}

function renderOneAction() {
  if (!TODAY.fitness || !TODAY.fitness.actionItems || !TODAY.fitness.actionItems.length) return;
  var top = TODAY.fitness.actionItems[0];
  var el = document.getElementById('oneAction');
  document.getElementById('oneActionText').textContent = top.text + (top.why ? ' — ' + top.why : '');
  el.style.display = '';
}

var HIGHLIGHTS_ALL = [];
var highlightsOpen = false;
function toggleHighlights() { highlightsOpen = !highlightsOpen; renderHighlights(HIGHLIGHTS_ALL); }

function renderScore(score) {
  TODAY.score = score.overall; TODAY.scoreWord = score.word;
  var n = score.overall;
  var numEl = document.getElementById('scoreNum');
  numEl.textContent = n === null ? '—' : String(n);
  document.getElementById('scoreWord').textContent = score.word;
  document.getElementById('scoreWord').style.color = scoreColor(n);
  document.getElementById('scoreSummary').textContent = score.summary;
  if (n !== null) countUp(numEl, n, 800, 0);
  var ringColors = [C.up, C.down, C.blue, C.purple];
  var radii = [72, 58, 44, 30];
  score.parts.forEach(function (p, i) {
    var el = document.getElementById('sr' + i);
    if (!el) return;
    var circ = 2 * Math.PI * radii[i];
    var pct = Math.max(0.03, (p.score || 0) / 100);
    el.setAttribute('stroke', ringColors[i % ringColors.length]);
    requestAnimationFrame(function () { el.setAttribute('stroke-dashoffset', String(circ * (1 - pct))); });
  });
  var legendEl = document.getElementById('ringLegend');
  if (legendEl) {
    legendEl.innerHTML = score.parts.map(function (p, i) {
      return '<div class="rl-row"><div class="rl-dot" style="background:' + ringColors[i] + '"></div><span class="rl-name">' + p.label + '</span>' + pill(scoreStatus(p.score), p.word) + '<span class="rl-score" style="color:' + scoreColor(p.score) + '">' + (p.score === null ? '—' : p.score) + '</span></div>';
    }).join('');
  }
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
  HIGHLIGHTS_ALL = list;
  var el = document.getElementById('highlights');
  var btn = document.getElementById('moreHighlights');
  if (!list.length) { el.innerHTML = ''; btn.style.display = 'none'; return; }
  var icon = { win: '▲', watch: '!', info: 'i' };
  var shown = highlightsOpen ? list : list.slice(0, 4);
  el.innerHTML = shown.map(function (h) {
    return '<div class="hl ' + h.tone + '"><div class="hl-ic">' + icon[h.tone] + '</div><div><div class="hl-title">' + h.title + '</div><div class="hl-detail">' + h.detail + '</div></div></div>';
  }).join('');
  btn.style.display = list.length > 4 ? 'inline-block' : 'none';
  btn.textContent = highlightsOpen ? 'Show fewer' : 'Show all ' + list.length + ' highlights';
}

var LONG_VIEW = [
  { key: 'steps', label: 'Daily steps', unit: '', dp: 0, up: true, color: C.up },
  { key: 'exerciseMinutes', label: 'Exercise minutes / day', unit: 'min', dp: 0, up: true, color: C.pulse },
  { key: 'restingHeartRate', label: 'Resting heart rate', unit: 'bpm', dp: 0, up: false, color: C.down },
  { key: 'hrv', label: 'HRV', unit: 'ms', dp: 0, up: true, color: C.blue },
  { key: 'vo2max', label: 'VO2max', unit: '', dp: 1, up: true, color: C.purple },
  { key: 'weightKg', label: 'Weight', unit: 'kg', dp: 1, up: null, color: C.caution },
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
    return '<div class="lv" style="cursor:pointer" onclick="openMetric(\\'' + m.key + '\\')"><div class="lv-label"><span>' + m.label + '</span>' + pill(status, word) + '</div>' +
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
  var color = cls === 'up' ? C.up : cls === 'down' ? C.down : C.dim;
  var series = GUIDE_DAYS.slice(-30).map(function (d) { return typeof d[def.key] === 'number' ? d[def.key] : null; });
  var guideVal = l7[def.key] !== null && l7[def.key] !== undefined ? l7[def.key] : reading.value;
  var shown = def.dp === 0 && reading.value >= 1000 ? Math.round(reading.value).toLocaleString() : fmt(reading.value, def.dp);
  var baselineDelta = '';
  if (typeof guideVal === 'number' && BASELINES && BASELINES[def.key]) {
    var bl = BASELINES[def.key];
    var bdPct = ((guideVal - bl) / Math.abs(bl) * 100);
    if (Math.abs(bdPct) >= 1) {
      var bdCls = def.up === null ? 'flat' : (bdPct > 0 === def.up) ? 'up' : 'down';
      var bdColor = bdCls === 'up' ? 'var(--up)' : bdCls === 'down' ? 'var(--down)' : 'var(--dim)';
      baselineDelta = '<span class="baseline" style="color:' + bdColor + '">' + (bdPct > 0 ? '+' : '') + bdPct.toFixed(0) + '% vs 30d</span>';
    }
  }
  var rangeBar = '';
  var band = metricNormalBand(def.key);
  if (band && typeof reading.value === 'number') {
    var lo = band.p25, hi = band.p75, span = hi - lo || 1;
    var fillL = 0, fillW = 100;
    var dotPos = Math.max(0, Math.min(100, ((reading.value - lo) / span) * 100));
    rangeBar = '<div class="range-bar"><div class="range-fill" style="left:0;width:100%"></div><div class="range-dot" style="left:calc(' + dotPos.toFixed(0) + '% - 5px)"></div></div>';
  }
  return '<div class="stat" style="cursor:pointer" onclick="openMetric(\\'' + def.key + '\\')"><div class="label">' + def.label + '</div><div class="value">' + shown + (def.unit ? '<span class="unit">' + def.unit + '</span>' : '') +
    (isToday ? '' : '<span class="asof">' + niceDate(reading.date) + '</span>') + baselineDelta + '</div>' +
    (trend.text ? '<div class="trend ' + cls + '">' + trend.text + ' vs last week</div>' : '<div class="trend flat">not enough data to compare weeks</div>') +
    spark(series, color, 28) + rangeBar + miniGuide(def.key, guideVal) + '</div>';
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

function renderWeekRecap(trends) {
  var el = document.getElementById('weekRecap');
  if (!el || !trends || !GUIDE_DAYS.length) return;
  var l7 = trends.last7;
  if (!l7) return;

  var now = new Date();
  var weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
  var fmt = function (d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
  var range = fmt(weekStart) + ' – ' + fmt(now);

  var last7Days = GUIDE_DAYS.slice(-7);
  var avg = function (k) { var vals = last7Days.map(function (d) { return d[k]; }).filter(function (v) { return v !== undefined && v !== null; }); return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null; };
  var sum = function (k) { var vals = last7Days.map(function (d) { return d[k] || 0; }); return vals.reduce(function (a, b) { return a + b; }, 0); };

  var avgSleep = avg('sleepHours');
  var avgSteps = avg('steps');
  var avgHrv = avg('hrv');
  var totalExercise = sum('exerciseMinutes');
  var workoutCount = last7Days.filter(function (d) { return (d.exerciseMinutes || 0) >= 20 || (d.workoutMinutes || 0) > 0; }).length;

  var tone = 'Steady Week';
  var toneColor = 'var(--caution)';
  if (avgHrv && avgSteps) {
    if (avgHrv > 45 && avgSteps > 8000 && workoutCount >= 4) { tone = 'Strong Week'; toneColor = 'var(--up)'; }
    else if (workoutCount <= 2 || (avgSleep && avgSleep < 6)) { tone = 'Recovery Week'; toneColor = 'var(--down)'; }
  }

  var spark = function (k) {
    var vals = last7Days.map(function (d) { return d[k] || 0; });
    var mx = Math.max.apply(null, vals) || 1;
    return '<div class="recap-spark">' + vals.map(function (v) { return '<div class="rs-bar" style="height:' + Math.max(2, (v / mx) * 22) + 'px"></div>'; }).join('') + '</div>';
  };

  var stats = [
    { val: avgSleep !== null ? avgSleep.toFixed(1) + 'h' : '—', label: 'Avg sleep', sparkKey: 'sleepHours' },
    { val: avgSteps !== null ? Math.round(avgSteps).toLocaleString() : '—', label: 'Avg steps', sparkKey: 'steps' },
    { val: avgHrv !== null ? Math.round(avgHrv) + 'ms' : '—', label: 'Avg HRV', sparkKey: 'hrv' },
    { val: Math.round(totalExercise) + 'm', label: 'Exercise', sparkKey: 'exerciseMinutes' },
    { val: workoutCount + 'd', label: 'Active days', sparkKey: null },
  ];

  el.innerHTML = '<div class="recap-card">' +
    '<div class="recap-header"><span class="recap-range">' + range + '</span><span class="recap-tone" style="color:' + toneColor + '">' + tone + '</span></div>' +
    '<div class="recap-grid">' + stats.map(function (s) {
      return '<div class="recap-stat"><div class="rs-val">' + s.val + '</div><div class="rs-label">' + s.label + '</div>' + (s.sparkKey ? spark(s.sparkKey) : '') + '</div>';
    }).join('') + '</div></div>';
}

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

// ---------------- plan & goals ----------------
var PLAN = null;
function fmtGoalVal(v, unit) { if (v === null || v === undefined) return '—'; return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100); }
var GOAL_METRIC_OPTIONS = [];
var SESSION_ICON = { rest: '–', walk: 'W', easy: 'E', zone2: 'Z2', intervals: 'HI', strength: 'S', long: 'L', mobility: 'M' };
var STATUS_TEXT = { done: ['good', 'Done'], missed: ['bad', 'Missed'], rest: ['unknown', 'Rest'], today: ['ok', 'Today'], upcoming: ['unknown', 'Upcoming'] };

function sessionLine(d) {
  var s = d.adjusted || d;
  return s.type === 'rest' ? 'Rest day' : s.title + '<small>' + s.minutes + ' min</small>';
}

// "Up next": today plus the next two planned days, so the week ahead is
// one glance away without leaving Today.
function renderTodaySession(view) {
  var el = document.getElementById('todaySession');
  if (!view || !view.days || !view.today) { el.innerHTML = '<h3>Up next</h3><div class="sub">No plan for this week yet.</div>'; return; }
  var idx = view.days.indexOf(view.days.filter(function (d) { return d.date === view.today.date; })[0]);
  var rows = view.days.slice(idx, idx + 3).map(function (d, i) {
    var s = d.adjusted || d;
    var ico = d.status === 'done' ? '<span class="s-ico done">✓</span>' : i === 0 ? '<span class="s-ico now">•</span>' : '<span class="s-ico">' + d.weekday.charAt(0) + '</span>';
    var when = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.weekday;
    var what = s.type === 'rest' ? 'Rest' : s.title + ' · ' + s.minutes + ' min';
    return '<div class="s-row">' + ico + '<div><b>' + when + '</b> <span style="color:var(--dim)">' + what + '</span>' +
      (i === 0 && d.adjusted ? '<div class="pd-adj">Swapped from ' + d.title + '.</div>' : '') + '</div></div>';
  }).join('');
  el.innerHTML = '<div class="ai-head"><h3>Up next</h3><span class="sub">' + view.completed + ' of ' + view.planned + ' done this week</span></div>' + rows +
    '<div style="margin-top:6px;"><a href="#" style="color:var(--pulse);font-size:13px;" onclick="showView(&quot;plan&quot;);return false;">See the full week</a></div>';
}

function renderPlan(view) {
  PLAN = view;
  TODAY.plan = view; renderVerdict();
  renderTodaySession(view);
  var pct = view.planned ? Math.round(view.completed / view.planned * 100) : 0;
  document.getElementById('planProgress').innerHTML = '<span class="num">' + view.completed + '/' + view.planned + '</span> sessions done so far (' + pct + '%)';
  document.getElementById('planSub').textContent = 'Week of ' + niceDate(view.weekStart) + '. Adapts to your recovery each day.';
  document.getElementById('planRationale').textContent = (view.rationale || '') + (view.source === 'template' ? ' (Standard plan: the AI was unavailable.)' : '');
  document.getElementById('planDays').innerHTML = view.days.map(function (d) {
    var st = STATUS_TEXT[d.status];
    var s = d.adjusted || d;
    var canTick = d.type !== 'rest' && d.status !== 'upcoming';
    var tickTitle = d.status === 'done' ? (d.autoDetected ? 'Detected from your data (' + d.actualMinutes + ' min)' : 'Marked done. Tap to undo.') : 'Mark as done';
    return '<div class="pday ' + d.status + '">' +
      '<div class="pd-day">' + d.weekday + '<b>' + Number(d.date.slice(8)) + '</b></div>' +
      '<div><div class="pd-title">' + (s.type === 'rest' ? 'Rest' : s.title) + (s.minutes ? '<span class="pd-min">' + s.minutes + ' min</span>' : '') + ' ' + pill(st[0], st[1]) + '</div>' +
      (d.adjusted ? '<div class="pd-was">' + d.title + ', ' + d.minutes + ' min</div>' : '') +
      '<div class="pd-detail">' + s.detail + (d.actualMinutes && d.type !== 'rest' ? ' · You did ' + d.actualMinutes + ' min.' : '') + '</div>' +
      (d.adjusted ? '<div class="pd-adj">' + d.adjusted.reason + '</div>' : '') + '</div>' +
      (canTick ? '<button class="tick' + (d.status === 'done' ? ' on' : '') + '" title="' + tickTitle + '" ' + (d.autoDetected ? 'disabled' : '') + ' onclick="togglePlanDay(\\'' + d.date + '\\')">✓</button>' : '<span></span>') +
      '</div>';
  }).join('');
}

async function loadPlanView() {
  try {
    renderPlan(await authedFetch('/api/plan'));
  } catch (err) {
    document.getElementById('planDays').innerHTML = '<p class="sub">Couldn\\'t load the plan (' + err.message + ').</p>';
    document.getElementById('todaySession').innerHTML = '<h3>Today\\'s session</h3><div class="sub">Couldn\\'t load the plan.</div>';
  }
}

async function regeneratePlan() {
  var btn = document.getElementById('planRegenBtn');
  btn.disabled = true;
  btn.textContent = 'Writing…';
  try { renderPlan(await authedFetch('/api/plan', { method: 'POST' })); }
  catch (err) { alert('Could not rewrite the plan: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Rewrite plan'; }
}

async function togglePlanDay(date) {
  try { var res = await authedFetch('/api/plan/done?date=' + date, { method: 'POST' }); renderPlan(res.view); }
  catch (err) { alert('Could not update: ' + err.message); }
}

var GOAL_STATUS = { achieved: ['good', 'Reached'], ahead: ['good', 'Ahead'], on_track: ['ok', 'On track'], behind: ['watch', 'Behind'], no_data: ['unknown', 'No data'] };

function renderGoals(res) {
  GOAL_METRIC_OPTIONS = res.metrics || [];
  var sel = document.getElementById('goalMetric');
  if (!sel.options.length) {
    sel.innerHTML = GOAL_METRIC_OPTIONS.map(function (m) { return '<option value="' + m.key + '">' + m.label + '</option>'; }).join('');
    var d = new Date(); d.setDate(d.getDate() + 84);
    document.getElementById('goalDeadline').value = d.toISOString().slice(0, 10);
    updateGoalHint();
  }
  var el = document.getElementById('goalsList');
  var list = res.progress || [];
  if (!list.length) { el.innerHTML = '<div class="card"><div class="sub">No goals yet. Add one below — the plan and your AI reviews will work towards it.</div></div>'; return; }
  el.innerHTML = list.map(function (g) {
    var st = GOAL_STATUS[g.status];
    var color = { good: C.up, ok: C.pulse, watch: C.caution, unknown: C.faint }[st[0]];
    return '<div class="goal"><div class="g-head"><span class="g-title">' + g.goal.title + '</span><span>' + pill(st[0], st[1]) +
      ' <button class="link-btn" onclick="deleteGoal(\\'' + g.goal.id + '\\')">Remove</button></span></div>' +
      '<div class="g-nums">' + fmtGoalVal(g.current) + ' <small>now · target ' + fmtGoalVal(g.goal.target) + (g.unit ? ' ' + g.unit : '') + ' by ' + niceDate(g.goal.deadline) + '</small></div>' +
      '<div class="g-track"><div class="g-fill" style="width:' + (g.progressPct || 0) + '%;background:' + color + '"></div><div class="g-mark" style="left:' + g.expectedPct + '%" title="Where you should be by now"></div></div>' +
      '<div class="g-sum">' + g.summary + (g.goal.startValue !== null ? ' Started at ' + fmtGoalVal(g.goal.startValue) + '.' : '') + '</div></div>';
  }).join('');
}

function updateGoalHint() {
  var key = document.getElementById('goalMetric').value;
  var m = GOAL_METRIC_OPTIONS.filter(function (x) { return x.key === key; })[0];
  if (!m) return;
  var cur = m.current === null ? 'no recent data' : fmtGoalVal(m.current) + (m.unit ? ' ' + m.unit : '');
  document.getElementById('goalHint').textContent = 'Your current ' + m.label.toLowerCase() + ': ' + cur + '.' + (key === 'exerciseMinutes' ? ' Measured as a 7-day total.' : '');
}

async function loadGoals() {
  try { renderGoals(await authedFetch('/api/goals')); }
  catch (err) { document.getElementById('goalsList').innerHTML = '<p class="sub">Couldn\\'t load goals (' + err.message + ').</p>'; }
}

async function addGoal(evt) {
  evt.preventDefault();
  var body = {
    metric: document.getElementById('goalMetric').value,
    target: Number(document.getElementById('goalTarget').value),
    deadline: document.getElementById('goalDeadline').value,
    title: document.getElementById('goalTitle').value || undefined,
  };
  try {
    await authedFetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    document.getElementById('goalTarget').value = '';
    document.getElementById('goalTitle').value = '';
    loadGoals();
  } catch (err) { alert('Could not add goal: ' + err.message); }
}

async function deleteGoal(id) {
  if (!confirm('Remove this goal?')) return;
  await authedFetch('/api/goals?id=' + encodeURIComponent(id), { method: 'DELETE' });
  loadGoals();
}

// ---------------- metric guide: meaning + what to do ----------------
// Data from src/metricGuide.ts, serialised at render time so the copy lives
// in one (tested) place.
var METRIC_GUIDE = ${JSON.stringify(METRIC_GUIDE)};
var METRIC_FORMAT = ${JSON.stringify(METRIC_FORMAT)};
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

// ---------------- metric detail sheet ----------------
var DISCOVERIES_CACHE = null;
var metricChartInstance = null;

function fmtMetricVal(key, v) {
  if (v === null || v === undefined) return '\\u2014';
  var f = METRIC_FORMAT[key];
  if (f && f.pct) return (v * 100).toFixed(f.dp) + '%';
  if (f) return f.dp === 0 && Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Number(v).toFixed(f.dp);
  return Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);
}

function metricUnit(key) {
  var f = METRIC_FORMAT[key];
  if (!f) return '';
  if (f.pct) return '%';
  return f.unit || '';
}

function metricSeries(key, rangeDays) {
  var days = GUIDE_DAYS;
  if (!days.length) return [];
  if (rangeDays && rangeDays < days.length) days = days.slice(-rangeDays);
  return days.map(function (d) {
    var v = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
    return { date: d.date, value: v };
  });
}

function metricBest(key) {
  var best = null, bestDate = null;
  var f = METRIC_FORMAT[key];
  var up = f ? f.better : null;
  GUIDE_DAYS.forEach(function (d) {
    var v = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
    if (v === null) return;
    if (best === null || (up === 'down' ? v < best : v > best)) { best = v; bestDate = d.date; }
  });
  return best !== null ? { value: best, date: bestDate } : null;
}

function metricWorst(key) {
  var worst = null, worstDate = null;
  var f = METRIC_FORMAT[key];
  var up = f ? f.better : null;
  GUIDE_DAYS.forEach(function (d) {
    var v = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
    if (v === null) return;
    if (worst === null || (up === 'down' ? v > worst : v < worst)) { worst = v; worstDate = d.date; }
  });
  return worst !== null ? { value: worst, date: worstDate } : null;
}

function metricAvgWindow(key, endIdx, windowDays) {
  var vals = [];
  var start = Math.max(0, endIdx - windowDays + 1);
  for (var i = start; i <= endIdx; i++) {
    var d = GUIDE_DAYS[i];
    var v = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
    if (v !== null) vals.push(v);
  }
  return vals.length >= 3 ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
}

function metricThenVsNow(key) {
  var days = GUIDE_DAYS;
  if (days.length < 30) return [];
  var now = metricAvgWindow(key, days.length - 1, 30);
  var results = [];
  var windows = [
    { label: '1 year ago', offset: 365 },
    { label: '3 years ago', offset: 1095 },
    { label: '5 years ago', offset: 1825 },
  ];
  windows.forEach(function (w) {
    var idx = days.length - 1 - w.offset;
    if (idx < 30) return;
    var then = metricAvgWindow(key, idx, 30);
    if (then === null || now === null) return;
    var delta = now - then;
    var pct = then !== 0 ? (delta / Math.abs(then)) * 100 : 0;
    results.push({ label: w.label, then: then, now: now, delta: delta, pct: pct });
  });
  return results;
}

function metricNormalBand(key) {
  var days = GUIDE_DAYS.slice(-90);
  var vals = [];
  days.forEach(function (d) {
    var v = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
    if (v !== null) vals.push(v);
  });
  if (vals.length < 10) return null;
  vals.sort(function (a, b) { return a - b; });
  var p25 = vals[Math.floor(vals.length * 0.25)];
  var p75 = vals[Math.floor(vals.length * 0.75)];
  return { p25: p25, p75: p75 };
}

function rollingAvg(series, window) {
  return series.map(function (pt, i) {
    if (pt.value === null) return null;
    var vals = [];
    for (var j = Math.max(0, i - window + 1); j <= i; j++) {
      if (series[j].value !== null) vals.push(series[j].value);
    }
    return vals.length >= 2 ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : pt.value;
  });
}

var METRIC_RANGE = '30';
var METRIC_COMPARE = false;

function toggleCompare(key) {
  METRIC_COMPARE = !METRIC_COMPARE;
  var btn = document.querySelector('.ms-compare button');
  if (btn) btn.classList.toggle('active', METRIC_COMPARE);
  var days = METRIC_RANGE === 'all' ? null : Number(METRIC_RANGE);
  renderMetricChart(key, days);
}

function renderHistogram(key, currentValue) {
  if (currentValue === null || currentValue === undefined) return '';
  var all = [];
  GUIDE_DAYS.forEach(function (d) { if (typeof d[key] === 'number') all.push(d[key]); });
  if (all.length < 10) return '';
  var min = Math.min.apply(null, all);
  var max = Math.max.apply(null, all);
  if (max === min) return '';
  var bins = 20;
  var step = (max - min) / bins;
  var counts = new Array(bins).fill(0);
  var currentBin = -1;
  all.forEach(function (v) {
    var b = Math.min(bins - 1, Math.floor((v - min) / step));
    counts[b]++;
  });
  currentBin = Math.min(bins - 1, Math.floor((currentValue - min) / step));
  var maxCount = Math.max.apply(null, counts);
  var html = '<div class="ms-histogram">';
  for (var i = 0; i < bins; i++) {
    var h = maxCount > 0 ? Math.max(2, Math.round(counts[i] / maxCount * 100)) : 2;
    html += '<div class="ms-hist-bar' + (i === currentBin ? ' current' : '') + '" style="height:' + h + '%"></div>';
  }
  html += '</div>';
  var f = METRIC_FORMAT[key];
  var dp = f && f.dp !== undefined ? f.dp : 0;
  html += '<div class="ms-hist-labels"><span>' + min.toFixed(dp) + '</span><span>You are here</span><span>' + max.toFixed(dp) + '</span></div>';
  return html;
}

function openMetric(key) {
  var guide = METRIC_GUIDE[key];
  var f = METRIC_FORMAT[key];
  var label = guide ? guide.label : (f ? key : key.replace(/([A-Z])/g, ' $1').trim());

  var sheet = document.getElementById('metricSheet');
  document.getElementById('msTitle').textContent = label;

  var reading = latestReading(key, 90);
  var v = reading ? reading.value : null;
  var g = guideFor(key, v);
  document.getElementById('msPill').innerHTML = g ? pill(g.status) : '';

  var unit = metricUnit(key);
  var band = metricNormalBand(key);
  var best = metricBest(key);
  var worst = metricWorst(key);
  var tvn = metricThenVsNow(key);
  var corrs = DISCOVERIES_CACHE ? DISCOVERIES_CACHE.filter(function (c) {
    return (c.metricA === key || c.metricB === key) && c.strength !== 'negligible' && c.strength !== 'insufficient_data';
  }).slice(0, 5) : [];

  var html = '<div class="ms-hero">';
  html += '<div class="ms-big">' + fmtMetricVal(key, v) + '<span class="ms-unit">' + unit + '</span></div>';
  if (band) html += '<div class="ms-normal">Your normal: ' + fmtMetricVal(key, band.p25) + ' \\u2013 ' + fmtMetricVal(key, band.p75) + ' ' + unit + ' (90-day p25\\u2013p75)</div>';
  if (best) html += '<div class="ms-best">Best ever: <b>' + fmtMetricVal(key, best.value) + '</b> ' + unit + ' on ' + niceDate(best.date) + '</div>';
  html += '</div>';

  html += renderHistogram(key, v);

  html += '<div class="ms-ranges">';
  ['7', '30', '90', '365', 'all'].forEach(function (r) {
    html += '<button class="' + (r === METRIC_RANGE ? 'active' : '') + '" onclick="changeMetricRange(\\'' + key + '\\',\\'' + r + '\\')">' + (r === 'all' ? 'All' : r === '365' ? '1Y' : r + 'D') + '</button>';
  });
  METRIC_COMPARE = false;
  html += '<span class="ms-compare"><button onclick="toggleCompare(\\'' + key + '\\')">vs prev</button></span>';
  html += '</div>';
  html += '<div class="ms-chart"><canvas id="msChart"></canvas></div>';

  if (g) {
    html += '<div class="ms-section">';
    html += '<h4>What it means</h4>';
    html += '<div class="ms-meaning">' + g.meaning + '</div>';
    if (g.action) html += '<div class="ms-action">' + g.action + '</div>';
    html += '</div>';
  }

  if (tvn.length) {
    html += '<div class="ms-section"><h4>Then vs now</h4><div class="ms-tvn">';
    tvn.forEach(function (t) {
      var better = f && f.better;
      var dirCls = Math.abs(t.pct) < 3 ? 'flat' : (better === 'up' ? (t.delta > 0 ? 'up' : 'down') : better === 'down' ? (t.delta < 0 ? 'up' : 'down') : 'flat');
      var color = dirCls === 'up' ? 'var(--up)' : dirCls === 'down' ? 'var(--down)' : 'var(--dim)';
      html += '<div class="ms-tvn-item"><div class="tvn-label">' + t.label + '</div><div class="tvn-val">' + fmtMetricVal(key, t.then) + '</div>' +
        '<div class="tvn-delta" style="color:' + color + '">' + (t.pct >= 0 ? '+' : '') + t.pct.toFixed(0) + '% (' + (t.delta >= 0 ? '+' : '') + fmtMetricVal(key, t.delta) + ')</div></div>';
    });
    html += '</div></div>';
  }

  if (corrs.length) {
    html += '<div class="ms-section"><h4>Linked to</h4>';
    corrs.forEach(function (c) {
      html += '<div class="ms-corr">' + c.label + ' <span class="faint">r=' + c.r + ', ' + c.strength + '</span></div>';
    });
    html += '</div>';
  }

  if (best || worst) {
    html += '<div class="ms-section"><h4>Extremes</h4><div class="ms-bestworst">';
    if (best) html += '<div class="ms-bw"><div class="bw-label">Best</div><div class="bw-val" style="color:var(--up)">' + fmtMetricVal(key, best.value) + ' ' + unit + '</div><div class="bw-date">' + best.date + '</div></div>';
    if (worst) html += '<div class="ms-bw"><div class="bw-label">Worst</div><div class="bw-val" style="color:var(--down)">' + fmtMetricVal(key, worst.value) + ' ' + unit + '</div><div class="bw-date">' + worst.date + '</div></div>';
    html += '</div></div>';
  }

  document.getElementById('msBody').innerHTML = html;
  renderMetricChart(key, Number(METRIC_RANGE) || null);

  sheet.style.display = 'block';
  requestAnimationFrame(function () { sheet.classList.add('open'); });
  history.pushState({ metric: key }, '', '#metric/' + key);
  var big = document.querySelector('.ms-big');
  if (big && v !== null) {
    var dp = f && f.dp !== undefined ? f.dp : 0;
    countUp(big, v, 600, dp);
  }
}

function closeMetric() {
  var sheet = document.getElementById('metricSheet');
  sheet.classList.remove('open');
  setTimeout(function () { sheet.style.display = 'none'; }, 300);
  if (metricChartInstance) { metricChartInstance.destroy(); metricChartInstance = null; }
  if (location.hash.indexOf('#metric/') === 0) history.back();
}

window.addEventListener('popstate', function (e) {
  var sheet = document.getElementById('metricSheet');
  if (sheet && sheet.classList.contains('open') && (!e.state || !e.state.metric)) {
    sheet.classList.remove('open');
    setTimeout(function () { sheet.style.display = 'none'; }, 300);
    if (metricChartInstance) { metricChartInstance.destroy(); metricChartInstance = null; }
  }
  if (e.state && e.state.metric) openMetric(e.state.metric);
});

(function initPullToDismiss() {
  var sheet, startY, startScroll, dragging;
  document.addEventListener('touchstart', function (e) {
    sheet = document.getElementById('metricSheet');
    if (!sheet || !sheet.classList.contains('open')) return;
    if (sheet.scrollTop > 5) return;
    startY = e.touches[0].clientY;
    startScroll = sheet.scrollTop;
    dragging = false;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (startY === undefined || !sheet || !sheet.classList.contains('open')) return;
    var dy = e.touches[0].clientY - startY;
    if (dy > 10 && sheet.scrollTop <= 0) {
      if (!dragging) { dragging = true; sheet.classList.add('dragging'); }
      var offset = dy > 100 ? 100 + (dy - 100) * 0.4 : dy;
      sheet.style.transform = 'translateY(' + offset + 'px)';
      sheet.style.opacity = String(Math.max(0.4, 1 - offset / 400));
      e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('touchend', function () {
    if (!dragging || !sheet) { startY = undefined; return; }
    sheet.classList.remove('dragging');
    var dy = parseFloat(sheet.style.transform.replace('translateY(', '')) || 0;
    if (dy > 120) {
      closeMetric();
    } else {
      sheet.style.transform = '';
      sheet.style.opacity = '';
    }
    startY = undefined;
    dragging = false;
  });
})();

function changeMetricRange(key, range) {
  METRIC_RANGE = range;
  var days = range === 'all' ? null : Number(range);
  renderMetricChart(key, days);
  document.querySelectorAll('.ms-ranges button').forEach(function (b) {
    b.classList.toggle('active', b.textContent === (range === 'all' ? 'All' : range === '365' ? '1Y' : range + 'D'));
  });
  var series = metricSeries(key, days);
  if (series.length) {
    var latest = series[series.length - 1];
    var f = METRIC_FORMAT[key];
    var dp = f && f.dp !== undefined ? f.dp : 0;
    var big = document.querySelector('.ms-big');
    if (big && latest.value !== null) morphNumber(big, latest.value, dp);
  }
}

function renderMetricChart(key, rangeDays) {
  var series = metricSeries(key, rangeDays);
  if (!series.length) return;

  var f = METRIC_FORMAT[key];
  var band = metricNormalBand(key);

  var useWeekly = rangeDays && rangeDays > 90;
  var useMonthly = !rangeDays || (rangeDays && rangeDays > 730);
  var labels, values, avg;

  if (useMonthly) {
    var byMonth = {};
    series.forEach(function (pt) {
      if (pt.value === null) return;
      var m = pt.date.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(pt.value);
    });
    var months = Object.keys(byMonth).sort();
    labels = months;
    values = months.map(function (m) { var arr = byMonth[m]; return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; });
    avg = null;
  } else if (useWeekly) {
    var byWeek = {};
    series.forEach(function (pt) {
      if (pt.value === null) return;
      var d = new Date(pt.date + 'T00:00:00Z');
      var dow = (d.getUTCDay() + 6) % 7;
      var mon = new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
      if (!byWeek[mon]) byWeek[mon] = [];
      byWeek[mon].push(pt.value);
    });
    var weeks = Object.keys(byWeek).sort();
    labels = weeks;
    values = weeks.map(function (w) { var arr = byWeek[w]; return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; });
    avg = null;
  } else {
    labels = series.map(function (pt) { return pt.date; });
    values = series.map(function (pt) { return pt.value; });
    avg = rollingAvg(series, 7);
  }

  var datasets = [{ label: (METRIC_GUIDE[key] ? METRIC_GUIDE[key].label : key), data: values, borderColor: C.pulse, tension: .3, pointRadius: 0, borderWidth: 1.8, spanGaps: true }];

  if (avg) {
    datasets.push({ label: '7-day avg', data: avg, borderColor: C.blue, borderDash: [4, 4], pointRadius: 0, borderWidth: 1.2, tension: .3, spanGaps: true, fill: false });
  }

  if (band && !useWeekly && !useMonthly) {
    datasets.push({ label: 'p75', data: labels.map(function () { return band.p75; }), borderColor: 'transparent', pointRadius: 0, fill: '+1', backgroundColor: 'rgba(163,230,53,.08)' });
    datasets.push({ label: 'p25', data: labels.map(function () { return band.p25; }), borderColor: 'transparent', pointRadius: 0, fill: false });
  }

  if (METRIC_COMPARE && rangeDays) {
    var prevSeries = metricSeries(key, rangeDays * 2);
    var prevLen = prevSeries.length - series.length;
    if (prevLen > 0) {
      var prevSlice = prevSeries.slice(0, prevLen);
      var prevValues;
      if (useWeekly) {
        var pw = {}; prevSlice.forEach(function (pt) { if (pt.value === null) return; var d = new Date(pt.date + 'T00:00:00Z'); var dow = (d.getUTCDay() + 6) % 7; var mon = new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10); if (!pw[mon]) pw[mon] = []; pw[mon].push(pt.value); });
        var pws = Object.keys(pw).sort().slice(-labels.length);
        prevValues = pws.map(function (w) { var arr = pw[w]; return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; });
      } else {
        prevValues = prevSlice.slice(-labels.length).map(function (pt) { return pt.value; });
      }
      while (prevValues.length < labels.length) prevValues.unshift(null);
      datasets.splice(1, 0, { label: 'Previous ' + rangeDays + 'd', data: prevValues, borderColor: C.dim, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.2, tension: .3, spanGaps: true, fill: false });
    }
  }

  if (metricChartInstance) { metricChartInstance.destroy(); metricChartInstance = null; }
  var el = document.getElementById('msChart');
  if (!el) return;
  el.parentElement.style.height = '260px';
  var chartFont = "'Barlow Condensed',-apple-system,sans-serif";
  metricChartInstance = new Chart(el, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: datasets.length > 1, labels: { color: C.dim, boxWidth: 10, font: { size: 11, family: chartFont } } },
        tooltip: { enabled: false } },
      scales: { x: { ticks: { color: C.dim, maxTicksLimit: 8, font: { size: 9, family: chartFont } }, grid: { display: false }, border: { display: false } },
                y: { ticks: { color: C.dim, font: { size: 9, family: chartFont } }, grid: { color: C.grid, drawBorder: false }, border: { display: false } } },
      animation: { duration: 800 }
    }
  });
  var msCtx = el.getContext('2d');
  var msArea = metricChartInstance.chartArea;
  var msGrad = msCtx.createLinearGradient(0, msArea.top, 0, msArea.bottom);
  msGrad.addColorStop(0, C.pulse + '30');
  msGrad.addColorStop(1, C.pulse + '00');
  metricChartInstance.data.datasets[0].backgroundColor = msGrad;
  metricChartInstance.data.datasets[0].fill = true;
  metricChartInstance.update('none');
  attachCrosshair('msChart');
}

// "All metrics" grid: every metric with data, one tile each.
function renderAllMetrics() {
  var el = document.getElementById('allMetricsGrid');
  if (!el || !GUIDE_DAYS.length) return;

  var allKeys = {};
  var last30 = GUIDE_DAYS.slice(-30);
  last30.forEach(function (d) {
    Object.keys(d).forEach(function (k) {
      if (k === 'date' || k === 'source' || k === 'extra') return;
      if (typeof d[k] === 'number') allKeys[k] = true;
    });
    if (d.extra) Object.keys(d.extra).forEach(function (k) { if (typeof d.extra[k] === 'number') allKeys[k] = true; });
  });

  var keys = Object.keys(allKeys).sort(function (a, b) {
    var ga = METRIC_GUIDE[a], gb = METRIC_GUIDE[b];
    if (ga && !gb) return -1;
    if (!ga && gb) return 1;
    return a.localeCompare(b);
  });

  el.innerHTML = keys.map(function (key) {
    var reading = latestReading(key, 30);
    if (!reading) {
      var extra30 = last30.slice().reverse();
      for (var i = 0; i < extra30.length; i++) {
        var ev = extra30[i].extra && extra30[i].extra[key];
        if (typeof ev === 'number') { reading = { value: ev, date: extra30[i].date }; break; }
      }
    }
    if (!reading) return '';
    var guide = METRIC_GUIDE[key];
    var label = guide ? guide.label : key.replace(/([A-Z])/g, ' $1').trim();
    var v = reading.value;
    var g = guideFor(key, v);
    var statusCls = g && g.status ? 's-' + g.status : '';
    var unit = metricUnit(key);
    var shown = fmtMetricVal(key, v);
    var series30 = GUIDE_DAYS.slice(-30).map(function (d) {
      var val = typeof d[key] === 'number' ? d[key] : (d.extra && typeof d.extra[key] === 'number' ? d.extra[key] : null);
      return val;
    });
    var f = METRIC_FORMAT[key];
    var better = f ? f.better : null;
    var color = '#8a8a8a';
    if (series30.filter(function (x) { return x !== null; }).length >= 2) {
      var first = null, last2 = null;
      for (var j = 0; j < series30.length; j++) if (series30[j] !== null && first === null) first = series30[j];
      for (var j2 = series30.length - 1; j2 >= 0; j2--) if (series30[j2] !== null && last2 === null) last2 = series30[j2];
      if (first !== null && last2 !== null) {
        var dir = last2 > first ? 'up' : last2 < first ? 'down' : 'flat';
        if (better === 'up') color = dir === 'up' ? C.up : dir === 'down' ? C.down : C.dim;
        else if (better === 'down') color = dir === 'down' ? C.up : dir === 'up' ? C.down : C.dim;
      }
    }
    return '<div class="am-tile ' + statusCls + '" onclick="openMetric(\\'' + key + '\\')">' +
      '<div class="am-label"><span>' + label + '</span>' + (g ? pill(g.status) : '') + '</div>' +
      '<div class="am-val">' + shown + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</div>' +
      spark(series30, color, 24) +
      (g && g.action ? '<div class="am-act">' + g.action + '</div>' : '') +
      '</div>';
  }).join('');
}

// ---------------- training & fitness ----------------
function renderActionItems(elId, items, limit) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!items || items.length === 0) { el.innerHTML = '<li class="sub">Nothing flagged. Keep going.</li>'; return; }
  el.innerHTML = items.slice(0, limit || items.length).map(function (a) {
    return '<li><span class="prio ' + a.priority + '">' + a.priority + '</span><div><div class="a-text">' + a.text + '</div><div class="a-why">' + a.area + ' · ' + a.why + '</div></div></li>';
  }).join('');
}

function renderFitnessMetrics(metrics) {
  var el = document.getElementById('fitnessMetrics');
  if (!metrics.length) { el.innerHTML = '<p class="sub">Not enough data yet.</p>'; return; }
  el.innerHTML = metrics.map(function (m) {
    var clickKey = m.key && METRIC_FORMAT[m.key] ? ' style="cursor:pointer" onclick="openMetric(\\'' + m.key + '\\')"' : '';
    return '<div class="fit ' + m.status + '"' + clickKey + '><div class="fit-top"><span class="label">' + m.label + '</span>' + pill(m.status) + '</div><div class="value">' + m.display + '</div>' +
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
    TODAY.fitness = f; renderVerdict(); renderStrainBudget(); renderOneAction();
    renderActionItems('trainingActions', f.actionItems);
    renderFitnessMetrics(f.metrics || []);
    renderWeekly(f.weekly || []);
    var s = f.loadSeries || [];
    upsertChart('loadChart', { type: 'bar', data: { labels: s.map(function (p) { return p.date; }), datasets: [
      { type: 'bar', label: 'Daily load', data: s.map(function (p) { return p.load; }), backgroundColor: '#ffffff22', order: 3 },
      { type: 'line', label: 'Fitness', data: s.map(function (p) { return p.fitness; }), borderColor: C.pulse, pointRadius: 0, borderWidth: 2, tension: .3, order: 1 },
      { type: 'line', label: 'Fatigue', data: s.map(function (p) { return p.fatigue; }), borderColor: C.down, pointRadius: 0, borderWidth: 1.5, tension: .3, order: 1 },
      { type: 'line', label: 'Form', data: s.map(function (p) { return p.form; }), borderColor: C.blue, borderDash: [4, 4], pointRadius: 0, borderWidth: 1.5, tension: .3, order: 1 },
    ]}});
  } catch (err) {
    var traEl = document.getElementById('trainingActions'); if (traEl) traEl.innerHTML = '<li class="sub">Could not load (' + err.message + ').</li>';
  }
}

// Generic AI review loader — same KV-cached-for-an-hour-with-retry
// architecture for every domain (overview/training/sleep/...); only the
// domain query param and the target DOM ids change per call site.
// Every review at once, the visible tab's first. They're pre-written on the
// server, so this is a handful of instant cache reads, not LLM calls.
function loadAllReviews(firstTab) {
  var order = (TAB_REVIEWS[firstTab] || []).slice();
  Object.keys(TAB_REVIEWS).forEach(function (t) { TAB_REVIEWS[t].forEach(function (d) { if (order.indexOf(d) < 0) order.push(d); }); });
  order.forEach(function (d) { if (!reviewLoadedOnce[d]) { reviewLoadedOnce[d] = true; loadReview(d, false); } });
}

async function loadReview(domain, force, silent) {
  var btn = document.getElementById('review-' + domain + '-btn');
  var body = document.getElementById('review-' + domain);
  if (!btn || !body) return;
  reviewLoadedOnce[domain] = true;
  btn.disabled = true;
  var slow = setTimeout(function () {
    if (body.querySelector('.skeleton') && !body.querySelector('.ai-loading')) body.insertAdjacentHTML('beforeend', '<div class="ai-loading">Writing your review. First run takes about 30 seconds.</div>');
  }, 2500);
  if (force && !silent) body.innerHTML = '<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:55%"></div>';
  try {
    var res = await authedFetch('/api/insights?domain=' + domain + (force ? '&force=1' : ''));
    var ins = res.insights;
    var html = '<div class="ai-headline">' + ins.headline + '</div>';
    if (ins.body) {
      html += '<p class="ai-body">' + ins.body + '</p>';
      if (ins.concern) html += '<p class="ai-concern">' + ins.concern + '</p>';
    } else {
      if (ins.recommendations && ins.recommendations.length) {
        html += '<p class="ai-body">' + ins.recommendations.join(' ') + '</p>';
      }
      if (ins.insights && ins.insights.length) {
        html += '<p class="ai-body">' + ins.insights.join(' ') + '</p>';
      }
      if (ins.concerns && ins.concerns.length) {
        html += '<p class="ai-concern">' + ins.concerns[0] + '</p>';
      }
    }
    // Out of date: the server is rewriting it in the background — pick up
    // the new version shortly, without a loading state.
    if (res.refreshing && !silent) setTimeout(function () { loadReview(domain, false, true); }, 45000);
    html += '<div class="ai-meta">' + (res.refreshing ? 'Updated ' + timeAgo(res.generatedAt) + ' · refreshing with your latest data' : res.stale ? 'Couldn\\'t refresh just now. Showing the review from ' + timeAgo(res.generatedAt) + '.' : res.cached ? 'Updated ' + timeAgo(res.generatedAt) : 'Just updated') + '</div>';
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

var AI_CHART_COLORS = [C.pulse, C.caution, C.up];

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
    { label: 'Resting HR', data: pick('restingHeartRate'), borderColor: C.down, backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5, fill: false },
    { label: 'HRV', data: pick('hrv'), borderColor: C.pulse, backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5 },
  ]}});

  upsertChart('hrRangeChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Avg HR', data: pick('heartRateAvg'), borderColor: C.caution, tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Max HR', data: pick('heartRateMax'), borderColor: C.down, tension: .3, pointRadius: 0, borderWidth: 1, fill: false },
    { label: 'Min HR', data: pick('heartRateMin'), borderColor: C.up, tension: .3, pointRadius: 0, borderWidth: 1, fill: false },
  ]}});

  upsertChart('vo2Chart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'VO2max', data: pick('vo2max'), borderColor: C.purple, tension: .3, pointRadius: 2, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('stepsChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Steps', data: pick('steps'), backgroundColor: C.up + '99' },
  ]}});

  upsertChart('energyChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Active energy (kcal)', data: pick('activeEnergy'), backgroundColor: C.caution + '99' },
    { label: 'Exercise (min)', data: pick('exerciseMinutes'), backgroundColor: C.pulse + '99' },
  ]}});

  upsertChart('standChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Stand minutes', data: pick('standMinutes'), backgroundColor: C.up + '99' },
    { label: 'Flights climbed', data: pick('flightsClimbed'), backgroundColor: C.caution + '99' },
  ]}});

  upsertChart('gaitChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Walking speed (m/s)', data: pick('walkingSpeed'), borderColor: C.pulse, tension: .3, pointRadius: 0, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('workoutChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Workout minutes', data: pick('workoutMinutes'), backgroundColor: C.caution + '99' },
  ]}});

  var workoutDays = days.filter(function (d) { return d.workoutCount; }).slice(-15).reverse();
  var listEl = document.getElementById('workoutList');
  if (workoutDays.length === 0) {
    listEl.textContent = 'No workout sessions in the imported data yet.';
  } else {
    var maxMin = Math.max.apply(null, workoutDays.map(function (d) { return d.workoutMinutes || 0; }).concat([1]));
    var wkIcons = { running: '\\u{1F3C3}', cycling: '\\u{1F6B4}', walking: '\\u{1F6B6}', swimming: '\\u{1F3CA}', yoga: '\\u{1F9D8}', hiking: '\\u26F0\\uFE0F', dance: '\\u{1F483}', tennis: '\\u{1F3BE}', pickleball: '\\u{1F3D3}', soccer: '\\u26BD', basketball: '\\u{1F3C0}', elliptical: '\\u{1F3CB}' };
    var wkColors = { running: C.up, cycling: C.blue, walking: C.pulse, swimming: C.blue, yoga: C.purple, hiking: C.up, pickleball: C.caution, tennis: C.caution };
    listEl.innerHTML = '<div class="workout-cards">' + workoutDays.map(function (d) {
      var name = workoutName(d.workoutType) || 'Workout';
      var key = name.toLowerCase();
      var icon = wkIcons[key] || '\\u{1F4AA}';
      var color = wkColors[key] || C.pulse;
      var meta = [d.workoutMinutes + ' min'];
      if (d.workoutEnergy) meta.push(Math.round(d.workoutEnergy) + ' kcal');
      if (d.workoutDistanceKm) meta.push(d.workoutDistanceKm.toFixed(1) + ' km');
      var pct = Math.round((d.workoutMinutes || 0) / maxMin * 100);
      return '<div class="wk-card" style="border-left-color:' + color + '"><div class="wk-icon">' + icon + '</div><div class="wk-info"><div class="wk-name">' + name + '</div><div class="wk-meta">' + meta.join(' \\u00B7 ') + '</div><div class="wk-dur-bar"><div class="wk-dur-fill" style="width:' + pct + '%;background:' + color + '"></div></div></div><div class="wk-date">' + niceDate(d.date) + '</div></div>';
    }).join('') + '</div>';
  }

  upsertChart('sleepChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Sleep hours', data: pick('sleepHours'), backgroundColor: C.blue + '99' },
  ]}});

  upsertChart('sleepStagesChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Core', data: pick('sleepCoreHours'), backgroundColor: C.blue },
    { label: 'Deep', data: pick('sleepDeepHours'), backgroundColor: '#3b82f6' },
    { label: 'REM', data: pick('sleepRemHours'), backgroundColor: C.purple },
    { label: 'Awake', data: pick('sleepAwakeHours'), backgroundColor: C.down },
  ]}, options: { scales: {
    x: { stacked: true, ticks: { color: C.dim, maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false }, border: { display: false } },
    y: { stacked: true, ticks: { color: C.dim, font: { size: 9 } }, grid: { color: C.grid, drawBorder: false }, border: { display: false } },
  } }});

  upsertChart('weightChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Weight (kg)', data: pick('weightKg'), borderColor: C.caution, tension: .3, pointRadius: 1, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('ageChart', { type: 'line', data: { labels: history.map(function (h) { return h.date; }), datasets: [
    { label: 'Biological age', data: history.map(function (h) { return h.biologicalAge; }), borderColor: C.pulse, tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Chronological age', data: history.map(function (h) { return h.chronologicalAge; }), borderColor: C.dim, borderDash: [5, 5], pointRadius: 0, borderWidth: 1, fill: false },
  ]}});
}

// ---------------- strain vs recovery, workout types, day explorer, seasonal ----------------
function renderStrainRecovery() {
  var el = document.getElementById('scatterChart');
  if (!el || GUIDE_DAYS.length < 14) return;

  var last90 = GUIDE_DAYS.slice(-90);
  var hrvVals = last90.map(function (d) { return d.hrv; }).filter(function (v) { return typeof v === 'number'; });
  if (hrvVals.length < 5) return;
  hrvVals.sort(function (a, b) { return a - b; });

  var green = [], yellow = [], red = [];
  var srMeta = [];
  last90.forEach(function (d) {
    var strain = (d.exerciseMinutes || 0) + (d.activeEnergy || 0) / 50;
    if (typeof d.hrv !== 'number') return;
    var pctRank = hrvVals.indexOf(d.hrv) / Math.max(1, hrvVals.length - 1) * 100;
    var pt = { x: Math.round(strain), y: Math.round(pctRank) };
    var size = Math.max(3, Math.min(8, (d.exerciseMinutes || 0) / 8));
    srMeta.push({ date: d.date, exMin: d.exerciseMinutes || 0 });
    if (pctRank >= 60) green.push(Object.assign({}, pt, { r: size }));
    else if (pctRank >= 35) yellow.push(Object.assign({}, pt, { r: size }));
    else red.push(Object.assign({}, pt, { r: size }));
  });

  var chartFont = "'Barlow Condensed',-apple-system,sans-serif";
  upsertChart('scatterChart', { type: 'bubble', data: { datasets: [
    { label: 'High recovery', data: green, backgroundColor: C.up + '99', borderColor: C.up },
    { label: 'Moderate', data: yellow, backgroundColor: C.caution + '99', borderColor: C.caution },
    { label: 'Low recovery', data: red, backgroundColor: C.down + '99', borderColor: C.down },
  ]}, options: {
    scales: {
      x: { title: { display: true, text: 'Daily Strain', color: C.dim, font: { size: 11, family: chartFont } }, ticks: { color: C.dim, font: { size: 9, family: chartFont } }, grid: { display: false }, border: { display: false } },
      y: { title: { display: true, text: 'Recovery %', color: C.dim, font: { size: 11, family: chartFont } }, ticks: { color: C.dim, font: { size: 9, family: chartFont } }, grid: { color: C.grid, drawBorder: false }, border: { display: false }, min: 0, max: 100 }
    }
  }});
}

function showSrTip() {}
function hideSrTip() {
  var tip = document.getElementById('srTooltip');
  if (tip) tip.style.display = 'none';
}

function renderWorkoutTypes() {
  var el = document.getElementById('wtBars');
  if (!el) return;

  var counts = {};
  GUIDE_DAYS.forEach(function (d) {
    if (d.workouts && Array.isArray(d.workouts)) {
      d.workouts.forEach(function (w) {
        var t = w.type || 'Unknown';
        counts[t] = (counts[t] || 0) + 1;
      });
    } else if (d.workoutCount) {
      counts['Exercise'] = (counts['Exercise'] || 0) + d.workoutCount;
    }
  });

  var sorted = Object.keys(counts).map(function (k) { return { type: k, count: counts[k] }; });
  sorted.sort(function (a, b) { return b.count - a.count; });
  if (sorted.length === 0) { el.innerHTML = '<div class="sub">No workout data found.</div>'; return; }

  var max = sorted[0].count;
  var colors = ['var(--pulse)', 'var(--up)', 'var(--caution)', 'var(--down)', 'var(--dim)'];
  el.innerHTML = sorted.slice(0, 10).map(function (item, i) {
    var pct = Math.max(3, Math.round(item.count / max * 100));
    var c = colors[i % colors.length];
    return '<div class="wt-row"><div class="wt-label">' + item.type + '</div><div class="wt-bar-wrap"><div class="wt-bar" style="width:' + pct + '%;background:' + c + '"></div></div><div class="wt-count">' + item.count + '</div></div>';
  }).join('');
}

function renderSeasonalPatterns() {
  var el = document.getElementById('seasonGrid');
  if (!el || GUIDE_DAYS.length < 90) { if (el) el.innerHTML = '<div class="sub">Need more data for seasonal patterns.</div>'; return; }

  var metrics = [
    { key: 'steps', label: 'Steps' },
    { key: 'exerciseMinutes', label: 'Exercise min' },
    { key: 'restingHeartRate', label: 'Resting HR' },
    { key: 'sleepHours', label: 'Sleep hours' }
  ];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  el.innerHTML = metrics.map(function (m) {
    var sums = new Array(12).fill(0);
    var cnts = new Array(12).fill(0);
    GUIDE_DAYS.forEach(function (d) {
      if (typeof d[m.key] !== 'number') return;
      var mo = parseInt(d.date.slice(5, 7), 10) - 1;
      sums[mo] += d[m.key];
      cnts[mo]++;
    });
    var avgs = sums.map(function (s, i) { return cnts[i] ? s / cnts[i] : 0; });
    var maxVal = Math.max.apply(null, avgs) || 1;

    return '<div class="season-card"><h4>' + m.label + '</h4><div class="season-bars">' +
      avgs.map(function (v, i) {
        var pct = Math.max(2, Math.round(v / maxVal * 100));
        return '<div class="season-bar" style="height:' + pct + '%" title="' + months[i] + ': ' + (m.key === 'steps' ? compact(Math.round(v)) : v.toFixed(1)) + '"><div class="sbl">' + months[i].charAt(0) + '</div></div>';
      }).join('') +
      '</div></div>';
  }).join('');
}

function renderDayExplorer(dateStr) {
  var el = document.getElementById('deGrid');
  var input = document.getElementById('deDate');
  if (!el || !input) return;

  if (!dateStr) {
    dateStr = GUIDE_DAYS.length ? GUIDE_DAYS[GUIDE_DAYS.length - 1].date : new Date().toISOString().slice(0, 10);
  }
  input.value = dateStr;

  var day = null;
  for (var i = 0; i < GUIDE_DAYS.length; i++) {
    if (GUIDE_DAYS[i].date === dateStr) { day = GUIDE_DAYS[i]; break; }
  }
  if (!day) { el.innerHTML = '<div class="sub">No data for ' + niceDate(dateStr) + '.</div>'; return; }

  var items = [];
  var keys = Object.keys(day).filter(function (k) { return k !== 'date' && k !== 'workouts' && typeof day[k] === 'number'; });
  keys.forEach(function (k) {
    var fmt = METRIC_FORMAT[k];
    var label = fmt ? (METRIC_GUIDE[k] ? METRIC_GUIDE[k].meaning.split('.')[0].split(',')[0] : k) : k;
    if (label.length > 30) label = k;
    var val = day[k];
    var unit = fmt ? (fmt.unit || '') : '';
    var display = fmt && fmt.dp !== undefined ? val.toFixed(fmt.dp) : (val > 999 ? compact(val) : String(Math.round(val * 100) / 100));
    var click = METRIC_FORMAT[k] ? ' onclick="openMetric(\\'' + k + '\\')"' : '';
    items.push('<div class="de-item"' + click + '><div class="de-key">' + k.replace(/([A-Z])/g, ' $1').trim() + '</div><div class="de-val">' + display + '<span class="de-unit">' + unit + '</span></div></div>');
  });
  el.innerHTML = items.join('');
}

function deNav(dir) {
  var input = document.getElementById('deDate');
  if (!input || !input.value) return;
  var d = new Date(input.value + 'T12:00:00');
  d.setDate(d.getDate() + dir);
  renderDayExplorer(d.toISOString().slice(0, 10));
}

function deToday() {
  if (GUIDE_DAYS.length) renderDayExplorer(GUIDE_DAYS[GUIDE_DAYS.length - 1].date);
}

// ---------------- weekly story cards & year in review ----------------
function renderWeeklyStory() {
  var el = document.getElementById('storyScroll');
  if (!el || GUIDE_DAYS.length < 7) { if (el) el.innerHTML = '<div class="sub">Not enough data yet.</div>'; return; }

  var weeks = [];
  var i = GUIDE_DAYS.length - 1;
  while (i >= 6 && weeks.length < 12) {
    var end = i;
    var start = Math.max(0, i - 6);
    var slice = GUIDE_DAYS.slice(start, end + 1);
    weeks.push(slice);
    i -= 7;
  }

  el.innerHTML = weeks.map(function (wk, idx) {
    var steps = 0, exMin = 0, workouts = 0, sleepSum = 0, sleepCount = 0;
    wk.forEach(function (d) {
      steps += d.steps || 0;
      exMin += d.exerciseMinutes || 0;
      if (d.workoutCount) workouts += d.workoutCount;
      if (typeof d.sleepHours === 'number') { sleepSum += d.sleepHours; sleepCount++; }
    });
    var avgSteps = Math.round(steps / wk.length);
    var avgSleep = sleepCount ? (sleepSum / sleepCount).toFixed(1) : null;

    var title = 'Steady week';
    if (exMin >= 200) title = 'Powerhouse week';
    else if (exMin >= 150) title = 'On target';
    else if (exMin >= 100) title = 'Building';
    else if (exMin < 60) title = 'Easy week';

    var weekLabel = niceDate(wk[0].date) + ' \\u2013 ' + niceDate(wk[wk.length - 1].date);
    var note = '';
    if (avgSteps >= 10000) note = 'Averaged 10k+ steps a day.';
    else if (avgSteps >= 8000) note = 'Solid step count.';
    else if (avgSteps < 5000) note = 'Low movement. More walks help.';

    return '<div class="story-card">' +
      '<div class="sc-week">' + (idx === 0 ? 'This week' : idx === 1 ? 'Last week' : weekLabel) + '</div>' +
      '<div class="sc-title">' + title + '</div>' +
      '<div class="sc-stats">' +
        '<div class="sc-stat"><div class="sc-n">' + compact(avgSteps) + '</div><div class="sc-u">steps/day</div></div>' +
        '<div class="sc-stat"><div class="sc-n">' + exMin + '</div><div class="sc-u">exercise min</div></div>' +
        '<div class="sc-stat"><div class="sc-n">' + workouts + '</div><div class="sc-u">workouts</div></div>' +
        (avgSleep ? '<div class="sc-stat"><div class="sc-n">' + avgSleep + '</div><div class="sc-u">h sleep</div></div>' : '') +
      '</div>' +
      (note ? '<div class="sc-note">' + note + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderYearInReview() {
  var el = document.getElementById('yirGrid');
  var yearEl = document.getElementById('yirYear');
  if (!el || GUIDE_DAYS.length < 30) { if (el) el.innerHTML = '<div class="sub">Not enough data yet.</div>'; return; }

  var lastYear = Number(GUIDE_DAYS[GUIDE_DAYS.length - 1].date.slice(0, 4));
  var yearDays = GUIDE_DAYS.filter(function (d) { return d.date.slice(0, 4) === String(lastYear); });
  if (yearDays.length < 14) { el.innerHTML = '<div class="sub">Not enough data this year.</div>'; return; }
  yearEl.textContent = String(lastYear);

  var steps = 0, exMin = 0, workouts = 0, activeDays = 0;
  var sleepSum = 0, sleepN = 0;
  var bestSteps = 0, bestStepsDate = '';
  yearDays.forEach(function (d) {
    steps += d.steps || 0;
    exMin += d.exerciseMinutes || 0;
    if (d.workoutCount) workouts += d.workoutCount;
    if ((d.exerciseMinutes || 0) >= 20 || (d.workoutMinutes || 0) >= 15) activeDays++;
    if (typeof d.sleepHours === 'number') { sleepSum += d.sleepHours; sleepN++; }
    if ((d.steps || 0) > bestSteps) { bestSteps = d.steps || 0; bestStepsDate = d.date; }
  });

  var cards = [
    { label: 'Total steps', val: (steps / 1000000).toFixed(1) + 'M', sub: '~' + Math.round(steps * 0.0008) + ' km walked' },
    { label: 'Exercise', val: Math.round(exMin / 60) + 'h', sub: Math.round(exMin / yearDays.length) + ' min/day avg' },
    { label: 'Workouts', val: String(workouts), sub: (workouts / (yearDays.length / 7)).toFixed(1) + '/week' },
    { label: 'Active days', val: String(activeDays), sub: Math.round(activeDays / yearDays.length * 100) + '% of days' },
  ];
  if (sleepN > 10) cards.push({ label: 'Avg sleep', val: (sleepSum / sleepN).toFixed(1) + 'h', sub: sleepN + ' nights tracked' });
  cards.push({ label: 'Best step day', val: compact(bestSteps), sub: niceDate(bestStepsDate) });

  el.innerHTML = cards.map(function (c) {
    return '<div class="yir"><div class="yir-label">' + c.label + '</div><div class="yir-val">' + c.val + '</div><div class="yir-sub">' + c.sub + '</div></div>';
  }).join('');
}

// ---------------- heatmap, then-vs-now, milestones ----------------
var hmYear = null;
var hmMetric = 'activity';

var HM_COLORS = {
  activity: [180,255,57],
  steps: [180,255,57],
  exerciseMinutes: [52,211,153],
  sleepHours: [96,165,250],
  hrv: [167,139,250],
  restingHeartRate: [247,107,77],
  activeEnergy: [251,191,36]
};

function hmLevel(day, metric) {
  if (!day) return { level: 0, tip: '' };
  if (metric === 'activity') {
    var mins = (day.exerciseMinutes || 0) + (day.workoutMinutes || 0);
    var steps = day.steps || 0;
    var level = 0;
    if (steps >= 10000 || mins >= 45) level = 4;
    else if (steps >= 8000 || mins >= 30) level = 3;
    else if (steps >= 5000 || mins >= 15) level = 2;
    else if (steps > 0 || mins > 0) level = 1;
    return { level: level, tip: (day.steps ? Math.round(day.steps).toLocaleString() + ' steps' : '') + (day.exerciseMinutes ? ', ' + day.exerciseMinutes + ' min' : '') };
  }
  var v = day[metric];
  if (v === undefined || v === null) return { level: 0, tip: 'no data' };
  var vals = GUIDE_DAYS.map(function (dd) { return dd[metric]; }).filter(function (x) { return x !== undefined && x !== null; }).sort(function (a, b) { return a - b; });
  if (!vals.length) return { level: 0, tip: String(v) };
  var p25 = vals[Math.floor(vals.length * 0.25)];
  var p50 = vals[Math.floor(vals.length * 0.50)];
  var p75 = vals[Math.floor(vals.length * 0.75)];
  var flip = metric === 'restingHeartRate';
  var lev = 0;
  if (flip) {
    if (v <= p25) lev = 4; else if (v <= p50) lev = 3; else if (v <= p75) lev = 2; else lev = 1;
  } else {
    if (v >= p75) lev = 4; else if (v >= p50) lev = 3; else if (v >= p25) lev = 2; else lev = 1;
  }
  var unit = metric === 'sleepHours' ? 'h' : metric === 'exerciseMinutes' ? ' min' : metric === 'hrv' ? ' ms' : metric === 'restingHeartRate' ? ' bpm' : metric === 'activeEnergy' ? ' kcal' : '';
  return { level: lev, tip: (typeof v === 'number' ? v.toFixed(metric === 'sleepHours' ? 1 : 0) : v) + unit };
}

function renderHeatmap(year) {
  hmYear = year;
  var el = document.getElementById('heatmap');
  var labelsEl = document.getElementById('hmLabels');
  var legendEl = document.querySelector('.hm-legend');
  if (!el || !GUIDE_DAYS.length) return;

  var rgb = HM_COLORS[hmMetric] || HM_COLORS.activity;
  var style = document.getElementById('hmDynStyle');
  if (!style) { style = document.createElement('style'); style.id = 'hmDynStyle'; document.head.appendChild(style); }
  style.textContent = '.hm-1{background:rgba(' + rgb.join(',') + ',.15)}.hm-2{background:rgba(' + rgb.join(',') + ',.35)}.hm-3{background:rgba(' + rgb.join(',') + ',.55)}.hm-4{background:rgba(' + rgb.join(',') + ',.85)}';

  var byDate = {};
  GUIDE_DAYS.forEach(function (d) { byDate[d.date] = d; });

  var startDate = new Date(Date.UTC(year, 0, 1));
  var startDow = (startDate.getUTCDay() + 6) % 7;
  var endDate = new Date(Date.UTC(year, 11, 31));
  var cells = [];

  for (var i = 0; i < startDow; i++) cells.push('<div class="hm-cell" style="visibility:hidden"></div>');

  var d = new Date(startDate);
  while (d <= endDate) {
    var iso = d.toISOString().slice(0, 10);
    var day = byDate[iso];
    var info = hmLevel(day, hmMetric);
    var onclick = hmMetric !== 'activity' ? ' onclick="openMetric(\\'' + hmMetric + '\\')"' : '';
    cells.push('<div class="hm-cell' + (info.level ? ' hm-' + info.level : '') + '" title="' + iso + ': ' + (info.tip || 'no data') + '"' + onclick + ' style="cursor:pointer"></div>');
    d.setUTCDate(d.getUTCDate() + 1);
  }
  el.innerHTML = cells.join('');

  var monthLabels = [];
  for (var m = 0; m < 12; m++) monthLabels.push(MONTHS[m]);
  labelsEl.innerHTML = monthLabels.map(function (m) { return '<span>' + m + '</span>'; }).join('');

  if (legendEl) {
    legendEl.innerHTML = 'Less <span class="hm-cell"></span><span class="hm-cell hm-1"></span><span class="hm-cell hm-2"></span><span class="hm-cell hm-3"></span><span class="hm-cell hm-4"></span> More';
  }

  var btns = document.querySelectorAll('#hmYears button');
  btns.forEach(function (b) { b.classList.toggle('active', Number(b.textContent) === year); });
}

function changeHmMetric(metric) {
  hmMetric = metric;
  if (hmYear) renderHeatmap(hmYear);
}

function initHeatmap() {
  if (!GUIDE_DAYS.length) return;
  var years = {};
  GUIDE_DAYS.forEach(function (d) { years[d.date.slice(0, 4)] = true; });
  var sorted = Object.keys(years).sort().reverse();
  var el = document.getElementById('hmYears');
  el.innerHTML = sorted.map(function (y) {
    return '<button onclick="renderHeatmap(' + y + ')">' + y + '</button>';
  }).join('');
  renderHeatmap(Number(sorted[0]));
}

function renderThenVsNow() {
  var el = document.getElementById('thenVsNow');
  if (!el || GUIDE_DAYS.length < 60) { el.innerHTML = '<div class="sub">Need more history for comparisons.</div>'; return; }

  var keys = [
    { key: 'steps', label: 'Daily steps' },
    { key: 'restingHeartRate', label: 'Resting HR' },
    { key: 'hrv', label: 'HRV' },
    { key: 'vo2max', label: 'VO2max' },
    { key: 'exerciseMinutes', label: 'Exercise / day' },
    { key: 'walkingSpeed', label: 'Walking speed' },
    { key: 'sleepHours', label: 'Sleep' },
  ];

  var html = '';
  keys.forEach(function (def) {
    var tvn = metricThenVsNow(def.key);
    if (!tvn.length) return;
    var f = METRIC_FORMAT[def.key];
    var unit = metricUnit(def.key);
    var now = tvn[0].now;
    var oldest = tvn[tvn.length - 1];
    var better = f ? f.better : null;
    var delta = now - oldest.then;
    var pct = oldest.then !== 0 ? (delta / Math.abs(oldest.then)) * 100 : 0;
    var dirCls = Math.abs(pct) < 3 ? 'flat' : (better === 'up' ? (delta > 0 ? 'up' : 'down') : better === 'down' ? (delta < 0 ? 'up' : 'down') : 'flat');
    var color = dirCls === 'up' ? 'var(--up)' : dirCls === 'down' ? 'var(--down)' : 'var(--dim)';

    html += '<div class="tvn-card" style="cursor:pointer" onclick="openMetric(\\'' + def.key + '\\')">';
    html += '<div class="tvn-metric">' + def.label + '</div>';
    html += '<div class="tvn-then">' + oldest.label + ': ' + fmtMetricVal(def.key, oldest.then) + ' ' + unit + '</div>';
    html += '<div class="tvn-now">' + fmtMetricVal(def.key, now) + ' <span style="font-size:13px;color:var(--dim);font-family:var(--sans);font-weight:600">' + unit + ' now</span></div>';
    html += '<div class="tvn-change" style="color:' + color + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%</div>';
    html += '</div>';
  });

  el.innerHTML = html || '<div class="sub">Not enough history for then-vs-now comparisons yet.</div>';
}

function renderMilestones() {
  var el = document.getElementById('milestones');
  if (!el || !GUIDE_DAYS.length) return;

  var milestones = [];
  var totalDays = GUIDE_DAYS.length;
  var firstDate = GUIDE_DAYS[0].date;
  var lastDate = GUIDE_DAYS[GUIDE_DAYS.length - 1].date;

  milestones.push({ icon: '1', text: totalDays.toLocaleString() + ' days of health data', when: firstDate + ' to ' + lastDate });

  var totalSteps = 0, totalExMin = 0, totalWorkouts = 0;
  var streak = 0, maxStreak = 0, streakEnd = '';
  GUIDE_DAYS.forEach(function (d) {
    totalSteps += d.steps || 0;
    totalExMin += d.exerciseMinutes || 0;
    if (d.workoutCount) totalWorkouts += d.workoutCount;
    if ((d.exerciseMinutes || 0) >= 20 || (d.workoutMinutes || 0) >= 15) {
      streak++;
      if (streak > maxStreak) { maxStreak = streak; streakEnd = d.date; }
    } else { streak = 0; }
  });

  if (totalSteps > 0) milestones.push({ icon: '\\u{1F463}', text: Math.round(totalSteps / 1000000) + 'M steps walked', when: 'About ' + Math.round(totalSteps * 0.0008 / 1000) + 'k km' });
  if (totalExMin > 0) milestones.push({ icon: '\\u{26A1}', text: Math.round(totalExMin / 60).toLocaleString() + ' hours of exercise', when: 'About ' + Math.round(totalExMin / totalDays) + ' min per day average' });
  if (totalWorkouts > 0) milestones.push({ icon: '\\u{1F3CB}', text: totalWorkouts.toLocaleString() + ' workouts logged', when: 'About ' + (totalWorkouts / (totalDays / 7)).toFixed(1) + ' per week' });
  if (maxStreak >= 3) milestones.push({ icon: '\\u{1F525}', text: maxStreak + '-day active streak', when: 'Ended ' + niceDate(streakEnd) });

  var best = metricBest('vo2max');
  if (best) milestones.push({ icon: 'V', text: 'Peak VO2max: ' + fmtMetricVal('vo2max', best.value), when: niceDate(best.date) });

  var bestSteps = metricBest('steps');
  if (bestSteps) milestones.push({ icon: '\\u{1F3C6}', text: 'Most steps in a day: ' + Math.round(bestSteps.value).toLocaleString(), when: niceDate(bestSteps.date) });

  el.innerHTML = milestones.map(function (m) {
    return '<div class="milestone"><div class="ms-icon">' + m.icon + '</div><div><div class="ms-text">' + m.text + '</div><div class="ms-when">' + m.when + '</div></div></div>';
  }).join('');
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
  TODAY.readiness = trends.readinessScore === undefined ? null : trends.readinessScore;
  TODAY.strain = trends.todayStrain === undefined ? null : trends.todayStrain;
  renderVerdict();
  renderSleepBrief(today, days.length >= 2 ? days[days.length - 2] : null);
  renderSleepArch(today);
  renderBodyState(today, null);
  renderStrainBudget();
  renderWhatMoved(today, days.length >= 2 ? days[days.length - 2] : null);
  renderMarkers(latestAnalytics);
  renderQuickStats(today, trends);
  renderWeekRecap(trends);
  renderTrainingLoad(trends);
  renderBests(trends.bests);
  renderExtraMetrics(days);
  renderActivityRings(today);
  renderAllMetrics();
  initHeatmap();
  renderThenVsNow();
  renderMilestones();
  renderWeeklyStory();
  renderYearInReview();
  renderStrainRecovery();
  renderWorkoutTypes();
  renderSeasonalPatterns();
  renderDayExplorer();
  var deInput = document.getElementById('deDate');
  if (deInput) deInput.addEventListener('change', function () { renderDayExplorer(deInput.value); });
  buildCharts(days.slice(-180), history.slice(-180));

  var savedTab = null;
  try { savedTab = localStorage.getItem('healthTab'); } catch (e) {}
  appBooted = true;
  var firstTab = savedTab && document.getElementById('tab-' + savedTab) ? savedTab : 'overview';
  var appEl = document.getElementById('app');
  appEl.classList.add('app-revealing');
  requestAnimationFrame(function () { appEl.classList.remove('app-revealing'); });
  showTab(firstTab);
  initScrollAnimations(document.getElementById('tab-' + firstTab));
  loadAllReviews(firstTab);

  loadFitness();
  loadOverview();
  authedFetch('/api/baselines').then(function (b) {
    var w30 = b && b.windows && b.windows['30'];
    if (w30) {
      var map = {};
      w30.forEach(function (x) { map[x.metric] = x.mean; });
      BASELINES = map;
      renderBodyState(today, (function () { var m = {}; w30.forEach(function (x) { m[x.metric] = x; }); return m; })());
    }
  }).catch(function () {});
  loadPlanView();
  loadGoals();
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
    DISCOVERIES_CACHE = res.correlations || [];
    var reportable = DISCOVERIES_CACHE.filter(function (c) { return c.strength !== 'negligible' && c.strength !== 'insufficient_data'; });
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

// --------------- evening check-in ---------------
function openCheckin() {
  document.getElementById('checkinOverlay').classList.add('open');
}
function closeCheckin() {
  document.getElementById('checkinOverlay').classList.remove('open');
  document.querySelectorAll('.ci-opt').forEach(function (o) { o.classList.remove('sel'); });
}
function ciSel(el) {
  el.parentElement.querySelectorAll('.ci-opt').forEach(function (o) { o.classList.remove('sel'); });
  el.classList.add('sel');
}
function saveCheckin() {
  var mood = document.querySelector('#ciMood .ci-opt.sel');
  var energy = document.querySelector('#ciEnergy .ci-opt.sel');
  if (!mood || !energy) return;
  var entry = { date: new Date().toISOString().slice(0, 10), time: new Date().toISOString().slice(11, 16), mood: mood.dataset.v, energy: energy.dataset.v };
  try {
    var arr = JSON.parse(localStorage.getItem('checkins') || '[]');
    arr.push(entry);
    if (arr.length > 90) arr = arr.slice(-90);
    localStorage.setItem('checkins', JSON.stringify(arr));
  } catch (e) {}
  closeCheckin();
}
function showCheckinFab() {
  var h = new Date().getHours();
  var fab = document.getElementById('checkinFab');
  if (fab && h >= 18) fab.classList.add('show');
}

// --------------- PWA install ---------------
var deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  try { if (!localStorage.getItem('installDismissed')) document.getElementById('installBanner').classList.add('show'); } catch (e) {}
});
function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(function () { deferredInstallPrompt = null; document.getElementById('installBanner').classList.remove('show'); });
}
function dismissInstall() {
  document.getElementById('installBanner').classList.remove('show');
  try { localStorage.setItem('installDismissed', '1'); } catch (e) {}
}

// --------------- service worker ---------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function () {});
}

showCheckinFab();
if (getToken()) { boot().catch(function () {}); }
</script>
</body>
</html>`;
}
