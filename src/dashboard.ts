import { METRIC_GUIDE, METRIC_FORMAT } from "./metricGuide";
import { renderMuscleMap, renderFrontBody, renderBackBody } from "./muscleMap";
import { EXERCISE_LIBRARY } from "./exerciseLibrary";

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
<title>Body</title>
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
    --gold:#d4a853; --royal:#c9b8ff;

    --depth-1:0 1px 3px rgba(0,0,0,.3),0 1px 2px rgba(0,0,0,.2);
    --depth-2:0 4px 12px rgba(0,0,0,.35),0 2px 4px rgba(0,0,0,.2);
    --depth-3:0 12px 40px rgba(0,0,0,.4),0 4px 8px rgba(0,0,0,.25);
    --ease-spring:cubic-bezier(.34,1.56,.64,1);
    --ease-smooth:cubic-bezier(.25,.46,.45,.94);
    /* kept the name --mono from the prior design pass (it's used ~40 places
       for every numeric readout) even though Barlow Condensed isn't a
       monospace face — renaming the token would mean touching every call
       site for no functional gain; what matters is the value. */
    --noise:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.08'/%3E%3C/svg%3E");
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
  .sub { color:var(--dim); font-size:13.5px; line-height:1.55; letter-spacing:.01em; }
  .faint { color:var(--faint); font-size:12px; letter-spacing:.01em; }
  .num { font-family:var(--mono); font-weight:700; }

  /* ---- gate ---- */
  #gate { max-width:360px; margin:18vh auto; padding:0; text-align:left; }
  #gate .mark { font-family:var(--mono); font-weight:700; font-size:26px; color:var(--pulse); margin-bottom:10px; }
  #gate h1 { font-size:19px; margin:0 0 6px; font-weight:700; }
  #gate input { width:100%; padding:11px 12px; margin:16px 0 10px; border-radius:6px; border:1px solid var(--line); background:var(--panel2); color:var(--ink); font-size:14px; font-family:var(--sans); text-align:left; }
  #gate input:focus { outline:none; border-color:var(--pulse); }
  button { font:inherit; }
  .btn { padding:11px 18px; border-radius:6px; border:none; background:var(--pulse); color:var(--void); font-weight:700; cursor:pointer; font-size:13.5px; transition:transform .2s var(--ease-spring), opacity .15s; box-shadow:0 0 20px rgba(163,230,53,.15); }
  .btn:hover { opacity:.9; } .btn:active { transform:scale(.95); }
  .btn:disabled { opacity:.35; cursor:default; }
  .btn-ghost { background:var(--panel2); color:var(--ink); border:1px solid var(--line); font-weight:600; }
  .btn-ghost:hover { border-color:var(--pulse); }
  .btn-sm { padding:7px 12px; font-size:12px; border-radius:5px; }
  #gate .btn { width:100%; text-align:center; }
  #gateError { color:var(--down); min-height:16px; font-size:13px; }

  /* ---- shell ---- */
  #app { display:none; max-width:900px; margin:0 auto; padding:0 20px 60px; }
  #app.app-revealing { animation:appReveal .5s var(--ease-smooth) both; }
  header.top { position:sticky; top:0; z-index:20; background:rgba(0,0,0,.94); backdrop-filter:blur(24px) saturate(1.3); padding:16px 20px 10px; margin:0 -20px 20px; border-bottom:1px solid var(--line); }
  header.top .row { display:flex; align-items:baseline; justify-content:space-between; max-width:900px; margin:0 auto; }
  header.top h1 { font-size:17px; margin:0; font-weight:800; letter-spacing:-.01em; color:var(--ink); }
  header.top .sub { font-family:var(--mono); font-weight:600; font-size:12.5px; color:var(--dim); }
  .tabs { display:flex; gap:4px; overflow-x:auto; margin-top:12px; padding-bottom:2px; max-width:900px; margin-left:auto; margin-right:auto; scrollbar-width:none; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab { white-space:nowrap; padding:7px 14px; border-radius:999px; background:transparent; border:1px solid transparent; color:var(--dim); cursor:pointer; font-size:13px; font-weight:600; transition:color .2s, background-color .2s, border-color .2s; }
  .tab:hover { color:var(--ink); }
  .tab.active { color:var(--void); background:var(--pulse); border-color:var(--pulse); }

  .section { display:none; }
  .section.active { display:block; }

  /* ---- hero: big, bold, color-coded — this is the first thing you see ---- */
  .hero { display:grid; grid-template-columns:auto 1fr; gap:24px; padding:0 0 20px; margin-bottom:20px; border-bottom:1px solid var(--line); align-items:center; }
  .ring-wrap { position:relative; width:130px; height:130px; flex-shrink:0; }
  .ring-wrap svg { transform:rotate(-90deg); }
  .ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .ring-label .n { font-family:var(--mono); font-size:44px; font-weight:800; letter-spacing:-.02em; line-height:1; color:var(--pulse); }
  .ring-label .u { font-size:11px; color:var(--dim); margin-top:3px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; }
  .hero-meta .delta { display:inline-flex; align-items:center; gap:5px; padding:3px 0; font-family:var(--mono); font-size:15px; font-weight:700; margin-bottom:6px; }
  .delta.good { color:var(--up); }
  .delta.bad { color:var(--down); }
  .hero-meta h2 { margin:0 0 4px; font-size:15px; font-weight:600; color:var(--ink); }
  .readiness-chip { display:inline-flex; align-items:center; gap:7px; margin-top:8px; margin-right:14px; font-size:13px; font-weight:600; color:var(--dim); }
  .readiness-chip .num { color:var(--ink); font-weight:700; }
  .dot { width:8px; height:8px; border-radius:50%; }

  /* ---- grid / readouts: color-coded left edge by trend direction ---- */
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:0; margin-bottom:22px; border-top:1px solid var(--line); }
  .stat { padding:16px 16px 16px 14px; border-bottom:1px solid var(--line); border-left:3px solid var(--line); transition:border-color .2s, background-color .2s; }
  .stat[style*="cursor:pointer"]:hover { border-left-color:var(--pulse); background-color:rgba(255,255,255,.02); }
  .stat .label { color:var(--dim); font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:6px; letter-spacing:.02em; text-transform:uppercase; }
  .stat .value { font-family:var(--mono); font-size:30px; font-weight:800; margin-top:6px; letter-spacing:-.02em; line-height:1; }
  .stat .value .unit { font-size:13px; color:var(--dim); font-weight:600; margin-left:4px; font-family:var(--sans); text-transform:none; }
  .stat .trend { font-family:var(--mono); font-size:12.5px; font-weight:700; margin-top:5px; }
  .trend.up { color:var(--up); } .trend.down { color:var(--down); } .trend.flat { color:var(--faint); }
  .stat:has(.trend.up) { border-image:linear-gradient(to bottom, var(--up), transparent) 1; }
  .stat:has(.trend.down) { border-image:linear-gradient(to bottom, var(--down), transparent) 1; }
  .stat { position:relative; }
  .stat svg.spark.watermark { position:absolute; right:10px; bottom:10px; width:60%; height:28px; opacity:.05; pointer-events:none; }
  /* trend indicators: static, no animation — motion without information is noise */

  /* A panel still exists where content needs real grouping (forms, lists,
     AI output) — flat fill, hairline edge, no decorative shadow. */
  .card {
    background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:14px;
    position:relative; overflow:hidden;
  }
  .card h3 { margin:0 0 6px; font-size:14.5px; font-weight:700; display:flex; align-items:center; gap:8px; color:var(--ink); letter-spacing:-.01em; }
  .card .card-sub { color:var(--dim); font-size:13px; margin-bottom:14px; line-height:1.5; }
  .chart-empty { height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--faint); font-size:13px; text-align:center; padding:0 20px; gap:8px; }
  .chart-empty svg { width:32px; height:32px; opacity:.3; }
  .chart-skeleton { height:280px; border-radius:8px; background:var(--panel2); overflow:hidden; position:relative; }
  .chart-skeleton::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,#202020,transparent); background-size:200% 100%; animation:shimmer 1.4s infinite; }
  .workout-cards { display:flex; flex-direction:column; gap:6px; }
  .wk-card { display:grid; grid-template-columns:40px 1fr auto; gap:12px; align-items:center; padding:14px 16px; background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--pulse); border-radius:0 10px 10px 0; }
  .wk-icon { width:40px; height:40px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
  .wk-info { min-width:0; }
  .wk-name { font-weight:700; font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wk-meta { font-size:12.5px; color:var(--dim); display:flex; gap:10px; margin-top:3px; font-family:var(--mono); font-weight:600; }
  .wk-date { font-size:12px; color:var(--faint); font-family:var(--mono); font-weight:600; text-align:right; white-space:nowrap; }
  .wk-dur-bar { height:4px; background:var(--panel2); border-radius:2px; margin-top:6px; overflow:hidden; }
  .wk-dur-fill { height:100%; border-radius:2px; transition:width .4s; }
  .simple-table { width:100%; font-size:13.5px; border-collapse:collapse; }
  .simple-table td { padding:9px 12px 9px 0; border-bottom:1px solid var(--line); color:var(--ink); font-family:var(--mono); font-weight:600; }
  .simple-table td:first-child { color:var(--dim); white-space:nowrap; font-family:var(--sans); font-weight:400; font-size:13px; }
  canvas { max-height:280px; }

  /* ---- AI insights ---- */
  .ai-card { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--pulse); border-radius:0 12px 12px 0; }
  .ai-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .ai-headline { font-size:17px; font-weight:800; margin:4px 0 12px; color:var(--ink); letter-spacing:-.02em; line-height:1.25; }
  .ai-body { font-size:14px; line-height:1.65; color:rgba(255,255,255,.88); margin:0 0 10px; }
  .ai-concern { font-size:13.5px; line-height:1.55; color:var(--caution); margin:0 0 10px; padding:10px 12px; background:rgba(251,191,36,.06); border-radius:6px; border-left:3px solid var(--caution); }
  .ai-meta { color:var(--faint); font-size:11px; margin-top:10px; font-family:var(--mono); letter-spacing:.02em; text-transform:uppercase; }
  .skeleton { height:12px; border-radius:4px; background:linear-gradient(90deg,var(--panel2),rgba(255,255,255,.04),var(--panel2)); background-size:200% 100%; animation:shimmer 1.8s infinite; margin:8px 0; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
  @keyframes fadeSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .reveal { animation:fadeSlideUp .35s var(--ease-smooth) both; }
  @keyframes revealUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes appReveal { from { opacity:0; filter:blur(6px); } to { opacity:1; filter:blur(0); } }
  .scroll-observe { opacity:0; transform:translateY(20px); transition:opacity .5s var(--ease-smooth), transform .5s var(--ease-smooth); transition-delay:var(--stagger, 0ms); }
  .scroll-observe.in-view { opacity:1; transform:translateY(0); }

  /* ---- readiness ring ---- */
  .readiness-ring-wrap { position:relative; width:150px; height:150px; margin:0 auto 12px; }
  .readiness-ring-wrap svg { width:100%; height:100%; transform:rotate(-90deg); }
  .readiness-ring-wrap .rr-bg { fill:none; stroke:var(--panel2); stroke-width:10; }
  .readiness-ring-wrap .rr-fill { fill:none; stroke-width:10; stroke-linecap:round; transition:stroke-dashoffset 1s var(--ease-smooth), stroke 0.5s; }
  .readiness-ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .readiness-ring-label .rr-num { font-family:var(--mono); font-size:48px; font-weight:900; line-height:1; letter-spacing:-.02em; }
  .readiness-ring-label .rr-text { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin-top:4px; color:var(--dim); }

  /* ---- premium: count-up number ---- */
  .count-up { display:inline-block; }
  @keyframes countPulse { 0% { transform:scale(1); } 50% { transform:scale(1.08); } 100% { transform:scale(1); } }
  .count-up.done { animation:countPulse .3s var(--ease-spring); }

  /* ---- premium: confetti ---- */
  .confetti-container { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; overflow:hidden; }
  .confetti-piece { position:absolute; width:8px; height:8px; border-radius:2px; opacity:0; animation:confettiFall 2.5s ease-out forwards; }
  @keyframes confettiFall {
    0% { opacity:1; transform:translateY(-10px) rotate(0deg) scale(1); }
    50% { opacity:1; }
    100% { opacity:0; transform:translateY(100vh) rotate(720deg) scale(0.3); }
  }

  /* ---- toast notifications ---- */
  .toast-container { position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:10000; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
  .toast { padding:12px 20px; border-radius:10px; background:var(--panel); border:1px solid var(--line); color:var(--ink); font-size:14px; font-weight:600; box-shadow:var(--depth-2); animation:toastIn .3s var(--ease-smooth) both; pointer-events:auto; display:flex; align-items:center; gap:8px; }
  .toast.success { border-left:3px solid var(--up); }
  .toast.info { border-left:3px solid var(--pulse); }
  .toast.warning { border-left:3px solid var(--caution); }
  @keyframes toastIn { from { opacity:0; transform:translateY(-20px) scale(.95); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes toastOut { from { opacity:1; transform:translateY(0) scale(1); } to { opacity:0; transform:translateY(-10px) scale(.95); } }

  /* ---- premium: live countdown ---- */
  .live-countdown { font-family:var(--mono); font-weight:700; font-size:14px; color:var(--pulse); }
  .live-countdown .cd-label { font-family:var(--sans); font-weight:600; font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; }
  .live-countdown .cd-time { font-size:22px; letter-spacing:.02em; }

  /* ---- premium: tab slide ---- */
  .section { transition:opacity .25s var(--ease-smooth), transform .25s var(--ease-smooth); }
  .section.slide-out { opacity:0; transform:translateX(-20px); pointer-events:none; }
  .section.slide-in { opacity:0; transform:translateX(20px); }
  .section.active { opacity:1; transform:translateX(0); }

  /* ---- premium: dynamic header glow ---- */
  .header-glow { position:absolute; inset:0; pointer-events:none; opacity:.15; transition:background 1s; border-radius:0; }

  /* ---- premium: pulse dot for live data ---- */
  .live-dot { width:6px; height:6px; border-radius:50%; background:var(--up); display:inline-block; margin-right:6px; animation:livePulse 2s ease-in-out infinite; }
  @keyframes livePulse { 0%,100% { opacity:1; box-shadow:0 0 0 0 rgba(52,211,153,.4); } 50% { opacity:.7; box-shadow:0 0 0 6px rgba(52,211,153,0); } }

  /* ---- skeleton shimmer cards ---- */
  .skel-card { padding:20px; margin-bottom:14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .skel-line { height:12px; border-radius:4px; background:linear-gradient(90deg,var(--panel2) 25%,rgba(255,255,255,.04) 50%,var(--panel2) 75%); background-size:400% 100%; animation:shimmer 1.8s infinite; margin:8px 0; }
  .skel-circle { width:60px; height:60px; border-radius:50%; background:linear-gradient(90deg,var(--panel2) 25%,rgba(255,255,255,.04) 50%,var(--panel2) 75%); background-size:400% 100%; animation:shimmer 1.8s infinite; margin:0 auto 12px; }
  .skel-row { display:flex; gap:12px; }
  .skel-row .skel-line { flex:1; }

  /* ---- bests / markers ---- */
  .bests { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:0; border-top:1px solid var(--line); }
  .best { padding:12px 14px 12px 0; border-bottom:1px solid var(--line); }
  .best .label { color:var(--dim); font-size:11.5px; font-weight:600; }
  .best .value { font-family:var(--mono); font-size:20px; font-weight:800; margin-top:4px; color:var(--pulse); }
  .new-badge { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:999px; background:var(--gold); color:#1a1200; font-size:9.5px; font-weight:800; letter-spacing:.04em; vertical-align:middle; animation:newPop .5s var(--ease-spring) both; }
  @keyframes newPop { 0% { transform:scale(0) rotate(-10deg); opacity:0; } 60% { transform:scale(1.2) rotate(4deg); opacity:1; } 100% { transform:scale(1) rotate(0); } }
  .triple-crown { display:inline-flex; align-items:center; gap:4px; margin-top:8px; padding:4px 10px; border-radius:999px; background:rgba(212,168,83,.12); border:1px solid rgba(212,168,83,.35); color:var(--gold); font-size:12px; font-weight:700; }
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
  .guide { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); font-size:13px; line-height:1.55; }
  .guide + .guide { margin-top:10px; }
  .guide .g-name { color:var(--ink); font-weight:700; font-size:12.5px; text-transform:uppercase; letter-spacing:.02em; }
  .guide .g-val { font-family:var(--mono); font-weight:700; color:var(--ink); margin-left:6px; }
  .guide .g-mean { color:var(--dim); }
  .guide .g-act { color:var(--ink); margin-top:6px; font-size:13.5px; line-height:1.6; }
  .guide .g-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .guide .g-act::before { content:"→ "; font-weight:700; color:var(--pulse); }
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
  .fit { cursor:pointer; transition:border-color .2s; }
  .fit:hover { border-color:var(--faint); }
  .lv { cursor:pointer; transition:border-color .2s; }
  .lv:hover { border-color:var(--faint); }

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
  .greet { margin:4px 0 16px; }
  .greet-hi { font-size:28px; font-weight:300; letter-spacing:-.02em; line-height:1.2; }
  .greet-sub { color:var(--dim); font-size:13.5px; margin-top:4px; }
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

  .scoreboard { padding:24px; background:var(--panel); border:1px solid var(--line); border-radius:12px; }
  .scoreboard:hover { border-color:var(--faint); }
  .multi-ring-layout { display:grid; grid-template-columns:auto 1fr; gap:24px; align-items:center; }
  .multi-ring { position:relative; width:180px; height:180px; flex-shrink:0; }
  .multi-ring::before { content:''; position:absolute; inset:-20px; border-radius:50%; pointer-events:none; }
  .multi-ring svg { transform:rotate(-90deg); position:relative; }
  .ring-label .n.score-gold { color:var(--gold); }
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
  .subtab { background:none; border:none; color:var(--dim); font-size:13.5px; font-weight:600; padding:6px 0 10px; cursor:pointer; white-space:nowrap; border-bottom:2px solid transparent; transition:color .15s; }
  .subtab:hover { color:var(--ink); }
  .subtab.active { color:var(--ink); border-bottom-color:transparent; }
  .section { transition:opacity .2s ease; }
  .section.active.tab-enter { animation:fadeSlideUp .35s var(--ease-smooth) both; }

  /* ---- Today: verdict + dials ---- */
  .verdict { border-radius:12px; padding:22px 24px; margin-bottom:14px; border:1px solid var(--line); position:relative; overflow:hidden; }
  .verdict .v-word {
    font-family:var(--mono); font-size:42px; font-weight:900; line-height:1.05; margin:0 0 6px; letter-spacing:-.02em;
    color:currentColor;
  }
  .verdict .v-line { font-size:14.5px; font-weight:500; line-height:1.5; color:var(--ink); }
  .verdict .v-why { font-size:12.5px; color:var(--dim); margin-top:6px; font-family:var(--mono); font-weight:600; }
  .v-row { display:flex; align-items:center; gap:16px; }
  .v-ring { position:relative; width:48px; height:48px; flex-shrink:0; }
  .v-ring-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:900; }
  .v-info { flex:1; min-width:0; }
  .v-info .v-word { font-size:22px; margin:0; }
  .v-info .v-line { font-size:13px; }
  .v-stats { display:flex; gap:12px; flex-shrink:0; }
  .v-stats .vs-item { text-align:center; }
  .v-stats .vs-val { font-family:var(--mono); font-size:18px; font-weight:800; line-height:1; }
  .v-stats .vs-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; }
  .v-hard { background:rgba(52,211,153,.08); border-color:rgba(52,211,153,.25); color:#6ee7b7; }
  .v-steady { background:rgba(251,191,36,.06); border-color:rgba(251,191,36,.25); color:#fcd34d; }
  .v-recover { background:rgba(247,107,77,.08); border-color:rgba(247,107,77,.3); color:#fca594; }
  .v-neutral { background:var(--panel); color:var(--dim); }
  .brief-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
  .compact-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--line); border-radius:8px; overflow:hidden; margin-bottom:14px; }
  .compact-grid .cg-cell { background:var(--panel); padding:10px 12px; }
  .compact-grid .cg-label { font-size:11px; color:var(--dim); letter-spacing:.02em; text-transform:uppercase; }
  .compact-grid .cg-val { font-family:var(--mono); font-size:15px; font-weight:700; margin-top:3px; }
  @media (max-width:480px) { .compact-grid { grid-template-columns:repeat(2,1fr); } }
  .brief-item { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 12px; text-align:center; }
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
    .tabs.primary { position:fixed; left:0; right:0; bottom:0; z-index:30; margin:0; padding:6px 4px calc(6px + env(safe-area-inset-bottom)); background:rgba(0,0,0,.94); backdrop-filter:blur(20px) saturate(1.3); border-top:1px solid var(--line); justify-content:space-around; gap:0; }
    .tabs.primary .tab { flex-direction:column; gap:3px; border:none; background:none; padding:4px 6px; font-size:10.5px; border-radius:8px; color:var(--faint); position:relative; transform:none; }
    .tabs.primary .tab svg { width:22px; height:22px; transition:transform .2s var(--ease-spring); }
    .tabs.primary .tab.active { background:none; color:var(--pulse); transform:none; }
    .tabs.primary .tab.active svg { transform:scale(1.12); }
    .tabs.primary .tab.active::after { content:''; position:absolute; bottom:1px; width:4px; height:4px; border-radius:50%; background:var(--pulse); }
    .verdict .v-word { font-size:28px; }
    .v-stats { gap:8px; }
    .v-stats .vs-val { font-size:15px; }
    .brief-n { font-size:20px; }
  }

  /* ---- metric detail sheet ---- */
  .metric-sheet { position:fixed; inset:0; z-index:50; background:var(--void); overflow-y:auto; -webkit-overflow-scrolling:touch; display:none; transform:translateY(100%); transition:transform .4s var(--ease-spring), opacity .3s; opacity:0; }
  .metric-sheet.open { transform:translateY(0); opacity:1; }
  .ms-head { position:sticky; top:0; z-index:2; background:rgba(0,0,0,.85); backdrop-filter:blur(20px) saturate(1.3); padding:16px 20px 12px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:12px; }
  .ms-back { background:none; border:none; color:var(--ink); font-size:22px; cursor:pointer; padding:0 4px; line-height:1; transition:transform .15s var(--ease-spring); }
  .ms-back:active { transform:scale(.85); }
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
  .ms-handle { width:40px; height:4px; background:var(--faint); border-radius:2px; margin:0 auto 6px; opacity:.5; animation:handlePulse 2s ease-in-out 3; }
  @keyframes handlePulse { 0%,100% { opacity:.5; } 50% { opacity:.9; } }
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
  .hm-cell { width:13px; height:13px; border-radius:3px; background:var(--panel2); transition:transform .15s var(--ease-spring), outline-color .15s; }
  .hm-cell:hover { outline:2px solid var(--pulse); outline-offset:1px; transform:scale(1.2); }
  .hm-1 { background:rgba(180,255,57,.15); } .hm-2 { background:rgba(180,255,57,.35); }
  .hm-3 { background:rgba(180,255,57,.55); } .hm-4 { background:rgba(212,168,83,.85); }
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

  /* ---- animated body analysis ---- */
  .ab-hero { text-align:center; margin-bottom:18px; }
  .ab-score-ring { position:relative; width:160px; height:160px; margin:0 auto 12px; }
  .ab-ring-svg { width:100%; height:100%; transform:rotate(-90deg); }
  .ab-ring-bg { fill:none; stroke:var(--line); stroke-width:6; }
  .ab-ring-fill { fill:none; stroke:url(#abGrad); stroke-width:6; stroke-linecap:round; transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1); }
  .ab-ring-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .ab-ring-num { font-family:var(--mono); font-size:48px; font-weight:900; background:linear-gradient(135deg, var(--pulse), var(--up)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; line-height:1; }
  .ab-ring-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin-top:2px; }
  .ab-hero-stats { display:flex; justify-content:center; gap:20px; flex-wrap:wrap; }
  .ab-hero-stats .ab-hs { text-align:center; }
  .ab-hero-stats .ab-hs-val { font-family:var(--mono); font-size:20px; font-weight:800; }
  .ab-hero-stats .ab-hs-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; font-weight:600; }

  /* body silhouette interactive */
  .ab-body-wrap { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; margin-bottom:14px; }
  .ab-body-toggle { display:flex; gap:4px; margin-bottom:14px; justify-content:center; }
  .ab-toggle { background:var(--panel2); border:1px solid var(--line); border-radius:6px; padding:5px 18px; font-size:12px; font-weight:700; color:var(--dim); cursor:pointer; transition:all .2s; }
  .ab-toggle.active { background:var(--pulse); color:var(--void); border-color:var(--pulse); }
  .ab-body-container { position:relative; display:flex; justify-content:center; min-height:360px; }
  .ab-body-view { display:none; width:220px; }
  .ab-body-view.active { display:block; }
  .ab-body-view svg { width:100%; height:auto; }

  .ab-body-view .muscle-region { cursor:pointer; transition:fill .4s, opacity .4s; fill:var(--dim); opacity:.5; }
  .ab-body-view .muscle-region:hover { opacity:1 !important; }
  .ab-body-view .muscle-region.m-optimal { fill:var(--up); opacity:1; }
  .ab-body-view .muscle-region.m-undertrained { fill:var(--caution); opacity:.65; }
  .ab-body-view .muscle-region.m-neglected { fill:var(--faint); opacity:.35; }
  .ab-body-view .muscle-region.m-overtrained { fill:var(--royal); opacity:1; }
  .ab-body-view .body-outline { fill:none; stroke:var(--dim); stroke-width:1; opacity:.45; }
  .ab-body-view .body-deco { fill:var(--dim); opacity:.4; }

  .ab-body-legend { display:flex; justify-content:center; gap:14px; margin-top:12px; flex-wrap:wrap; }
  .ab-leg { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--dim); font-weight:600; }
  .ab-leg-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

  /* muscle detail panel */
  .ab-muscle-detail { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px; animation:slideUp .3s var(--ease-spring); }
  .ab-md-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .ab-md-head h3 { margin:0; font-size:16px; text-transform:capitalize; }
  .ab-md-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:10px; }
  .ab-md-stat { background:var(--panel2); border-radius:8px; padding:10px; text-align:center; }
  .ab-md-stat .amd-val { font-family:var(--mono); font-size:22px; font-weight:900; }
  .ab-md-stat .amd-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.03em; margin-top:2px; }
  .ab-md-bar { height:6px; background:var(--panel2); border-radius:3px; overflow:hidden; margin-top:8px; }
  .ab-md-bar > div { height:100%; border-radius:3px; transition:width .4s; }
  .ab-md-reco { font-size:12.5px; color:var(--dim); line-height:1.5; margin-top:8px; padding-top:8px; border-top:1px solid var(--line); }

  /* duo layout for physique + mobility */
  .ab-duo { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:0; }
  @media (max-width:580px) { .ab-duo { grid-template-columns:1fr; } }

  /* mini body on overview */
  .ab-mini-body { display:flex; align-items:center; gap:14px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px; cursor:pointer; transition:border-color .2s; }
  .ab-mini-body:hover { border-color:rgba(163,230,53,.3); }
  .ab-mini-body svg { width:60px; flex-shrink:0; }
  .ab-mini-info { flex:1; }
  .ab-mini-score { font-family:var(--mono); font-size:28px; font-weight:900; line-height:1; }
  .ab-mini-label { font-size:11px; color:var(--dim); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  .ab-mini-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
  .ab-mini-chip { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; text-transform:capitalize; }
  .ab-mini-chip.optimal { background:rgba(52,211,153,.15); color:var(--up); }
  .ab-mini-chip.undertrained { background:rgba(251,191,36,.15); color:var(--caution); }
  .ab-mini-chip.neglected { background:rgba(247,107,77,.12); color:var(--down); }
  .ab-mini-chip.overtrained { background:rgba(201,184,255,.15); color:var(--royal); }

  /* ==== BODY-CENTRIC HOME ==== */
  .body-home { display:flex; flex-direction:column; align-items:center; position:relative; }


  /* central body stage */
  .body-stage { position:relative; width:100%; max-width:280px; margin:0 auto; padding-top:60px; }
  .body-stage-svg { position:relative; width:220px; margin:0 auto; display:block; }
  .body-stage-svg svg { width:100%; height:auto; }
  .body-stage-svg .muscle-region { cursor:pointer; transition:fill .4s, opacity .4s; fill:var(--dim); opacity:.5; }
  .body-stage-svg .muscle-region:hover { opacity:1 !important; }
  .body-stage-svg .muscle-region.m-optimal { fill:var(--up); opacity:1; }
  .body-stage-svg .muscle-region.m-undertrained { fill:var(--caution); opacity:.65; }
  .body-stage-svg .muscle-region.m-neglected { fill:var(--faint); opacity:.35; }
  .body-stage-svg .muscle-region.m-overtrained { fill:var(--royal); opacity:1; }
  .body-stage-svg .body-deco { fill:var(--dim); opacity:.4; }
  .body-stage-svg .body-outline { fill:none; stroke:var(--dim); stroke-width:1; opacity:.45; }


  /* body score floating badge */
  .body-score-badge { position:absolute; top:-8px; left:50%; transform:translateX(-50%); z-index:4; text-align:center; }
  .bsb-ring { width:80px; height:80px; margin:0 auto; position:relative; }
  .bsb-ring svg { width:100%; height:100%; transform:rotate(-90deg); }
  .bsb-ring .bsb-bg { fill:none; stroke:var(--line); stroke-width:4; }
  .bsb-ring .bsb-fill { fill:none; stroke:url(#bsbGrad); stroke-width:4; stroke-linecap:round; transition:stroke-dashoffset 1s cubic-bezier(.4,0,.2,1); }
  .bsb-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .bsb-num { font-family:var(--mono); font-size:22px; font-weight:900; line-height:1; color:var(--pulse); }
  .bsb-label { font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); }


  /* metric drawer (slides up on tap) */
  .metric-drawer { position:fixed; bottom:0; left:0; right:0; z-index:55; transform:translateY(100%); transition:transform .35s cubic-bezier(.32,1.2,.54,1); }
  .metric-drawer.open { transform:translateY(0); }
  .metric-drawer-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:54; opacity:0; pointer-events:none; transition:opacity .3s; }
  .metric-drawer-bg.open { opacity:1; pointer-events:auto; }
  .md-sheet { background:var(--panel); border:1px solid var(--line); border-radius:20px 20px 0 0; padding:20px 16px 32px; max-height:70vh; overflow-y:auto; box-shadow:0 -4px 30px rgba(0,0,0,.3); }
  .md-handle { width:36px; height:4px; background:var(--faint); border-radius:2px; margin:0 auto 16px; }
  .md-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .md-header h3 { margin:0; font-size:18px; font-weight:800; }
  .md-header .md-close { background:var(--panel2); border:none; color:var(--dim); width:28px; height:28px; border-radius:50%; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .md-hero-num { font-family:var(--mono); font-size:48px; font-weight:900; line-height:1; margin-bottom:4px; }
  .md-hero-sub { font-size:12px; color:var(--dim); margin-bottom:14px; }
  .md-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:14px; }
  .md-stat { background:var(--panel2); border-radius:8px; padding:10px; text-align:center; }
  .md-stat .mds-v { font-family:var(--mono); font-size:18px; font-weight:800; }
  .md-stat .mds-l { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.03em; margin-top:2px; }
  .md-spark { width:100%; height:60px; margin:8px 0; }
  .md-spark svg { width:100%; height:100%; }
  .md-reco { font-size:12.5px; color:var(--dim); line-height:1.5; padding-top:10px; border-top:1px solid var(--line); }

  /* quick-glance row below body */
  .qg-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; margin:12px 0; width:100%; }
  .qg-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; cursor:pointer; transition:all .2s var(--ease-spring); }
  .qg-card:hover { border-color:rgba(163,230,53,.3); transform:translateY(-2px); }
  .qg-card .qg-head { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
  .qg-card .qg-icon { font-size:14px; }
  .qg-card .qg-name { font-size:11px; color:var(--dim); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
  .qg-card .qg-val { font-family:var(--mono); font-size:22px; font-weight:900; line-height:1; }
  .qg-card .qg-sub { font-size:11px; color:var(--dim); margin-top:3px; }
  .qg-card .qg-delta { font-size:11px; font-weight:700; }
  .qg-card .qg-delta.up { color:var(--up); }
  .qg-card .qg-delta.down { color:var(--down); }
  .qg-card .qg-spark { display:block; margin-top:6px; }
  .qg-expand { display:none; grid-column:1/-1; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; animation:fadeSlideUp .25s var(--ease-smooth) both; }
  .qg-expand.open { display:block; }
  .qg-expand .qe-chart { height:80px; margin:8px 0; }
  .qg-expand .qe-days { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center; }
  .qg-expand .qe-day { font-size:10px; }
  .qg-expand .qe-day .qed-val { font-family:var(--mono); font-size:13px; font-weight:700; }
  .qg-expand .qe-day .qed-label { color:var(--dim); }
  .qg-expand .qe-insight { font-size:12px; color:var(--dim); margin-top:8px; padding-top:8px; border-top:1px solid var(--line); }
  .body-inline-detail { width:100%; max-width:280px; margin:12px auto 0; }
  .bid-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; animation:fadeSlideUp .25s ease both; }
  .bid-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .bid-name { font-size:16px; font-weight:800; text-transform:capitalize; }
  .bid-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .bid-stat { text-align:center; background:var(--panel2); border-radius:8px; padding:8px; }
  .bid-val { font-size:20px; font-weight:900; }
  .bid-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
  .bid-reco { font-size:12.5px; color:var(--dim); line-height:1.5; margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
  .bid-reco::before { content:"→ "; font-weight:700; color:var(--pulse); }

  /* muscle tap ripple */
  @keyframes muscleRipple { 0% { r:0; opacity:.6; } 100% { r:30; opacity:0; } }
  .muscle-ripple { fill:none; stroke:var(--pulse); stroke-width:2; animation:muscleRipple .6s ease-out forwards; pointer-events:none; }

  /* quick-glance card entrance stagger */
  .qg-card { opacity:0; animation:qgCardIn .4s var(--ease-spring) both; }
  @keyframes qgCardIn { from { opacity:0; transform:translateY(14px) scale(.96); } to { opacity:1; transform:translateY(0) scale(1); } }
  .qg-card:nth-child(1) { animation-delay:.05s; }
  .qg-card:nth-child(2) { animation-delay:.1s; }
  .qg-card:nth-child(3) { animation-delay:.15s; }
  .qg-card:nth-child(4) { animation-delay:.2s; }
  .qg-card:nth-child(5) { animation-delay:.25s; }
  .qg-card:nth-child(6) { animation-delay:.3s; }

  /* satellite chip entrance */
  .sat-chip { opacity:0; animation:satChipIn .35s var(--ease-spring) both; }
  @keyframes satChipIn { from { opacity:0; transform:scale(.8); } to { opacity:1; transform:scale(1); } }
  .sat-chip:nth-child(1) { animation-delay:.1s; }
  .sat-chip:nth-child(2) { animation-delay:.18s; }
  .sat-chip:nth-child(3) { animation-delay:.26s; }
  .sat-chip:nth-child(4) { animation-delay:.34s; }

  /* muscle detail slide-up from home body */
  .home-muscle-sheet { position:fixed; bottom:0; left:0; right:0; z-index:56; transform:translateY(100%); transition:transform .35s cubic-bezier(.32,1.2,.54,1); }
  .home-muscle-sheet.open { transform:translateY(0); }
  .home-muscle-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:55; opacity:0; pointer-events:none; transition:opacity .3s; }
  .home-muscle-bg.open { opacity:1; pointer-events:auto; }
  .hms-sheet { background:var(--panel); border:1px solid var(--line); border-radius:20px 20px 0 0; padding:20px 16px 32px; max-height:65vh; overflow-y:auto; box-shadow:0 -4px 30px rgba(0,0,0,.3); }
  .hms-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
  .hms-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; }
  .hms-icon.optimal { background:rgba(52,211,153,.15); }
  .hms-icon.undertrained { background:rgba(251,191,36,.15); }
  .hms-icon.neglected { background:rgba(85,85,85,.15); }
  .hms-icon.overtrained { background:rgba(201,184,255,.15); }
  .hms-title { font-size:18px; font-weight:800; text-transform:capitalize; flex:1; }
  .hms-close { background:var(--panel2); border:none; color:var(--dim); width:28px; height:28px; border-radius:50%; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .hms-status-pill { display:inline-block; font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; text-transform:uppercase; letter-spacing:.04em; }
  .hms-status-pill.optimal { background:rgba(52,211,153,.15); color:var(--up); }
  .hms-status-pill.undertrained { background:rgba(251,191,36,.15); color:var(--caution); }
  .hms-status-pill.neglected { background:rgba(85,85,85,.15); color:var(--faint); }
  .hms-status-pill.overtrained { background:rgba(201,184,255,.15); color:var(--royal); }
  .hms-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:12px 0; }
  .hms-stat { background:var(--panel2); border-radius:10px; padding:12px; text-align:center; }
  .hms-stat-val { font-family:var(--mono); font-size:24px; font-weight:900; }
  .hms-stat-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
  .hms-bar { height:8px; background:var(--panel2); border-radius:4px; overflow:hidden; margin:8px 0; }
  .hms-bar > div { height:100%; border-radius:4px; transition:width .6s var(--ease-spring); }
  .hms-reco { font-size:13px; color:var(--dim); line-height:1.55; padding:12px 0; border-top:1px solid var(--line); }
  .hms-reco::before { content:"→ "; font-weight:700; color:var(--pulse); }
  .hms-sparkline { width:100%; height:48px; margin:8px 0; }
  .hms-sparkline svg { width:100%; height:100%; }

  /* enhanced metric drawer sparklines */
  .md-sparkline { width:100%; height:56px; margin:10px 0; }
  .md-sparkline svg { width:100%; height:100%; }
  .md-trend-row { display:flex; gap:6px; margin:8px 0 14px; }
  .md-trend-chip { font-size:11px; font-weight:700; padding:3px 10px; border-radius:999px; }
  .md-trend-chip.improving { background:rgba(52,211,153,.15); color:var(--up); }
  .md-trend-chip.declining { background:rgba(247,107,77,.15); color:var(--down); }
  .md-trend-chip.stable { background:var(--panel2); color:var(--dim); }
  .md-insight { font-size:12.5px; color:var(--dim); line-height:1.55; padding:10px 12px; background:var(--panel2); border-radius:8px; margin:8px 0; border-left:3px solid var(--pulse); }

  @media (max-width:480px) {
    .body-stage { max-width:240px; }
    .body-stage-svg { width:160px; }
    .qg-row { grid-template-columns:repeat(2,1fr); }
  }

  .body-comp-bars { display:flex; height:32px; border-radius:8px; overflow:hidden; margin:12px 0 8px; }
  .body-comp-bars .bcb-lean { background:linear-gradient(90deg, var(--pulse), var(--up)); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:var(--void); }
  .body-comp-bars .bcb-fat { background:rgba(247,107,77,.6); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:var(--ink); }
  .body-comp-legend { display:flex; gap:16px; font-size:12px; color:var(--dim); }
  .body-comp-legend .bcl-dot { width:8px; height:8px; border-radius:2px; display:inline-block; margin-right:4px; vertical-align:middle; }

  .muscle-vol-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; }
  .mv-card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; position:relative; overflow:hidden; }
  .mv-card .mv-name { font-size:12px; font-weight:700; text-transform:capitalize; }
  .mv-card .mv-sets { font-family:var(--mono); font-size:22px; font-weight:900; margin-top:2px; }
  .mv-card .mv-sets small { font-size:12px; color:var(--dim); font-weight:600; }
  .mv-card .mv-bar { height:4px; background:var(--panel2); border-radius:2px; margin-top:6px; overflow:hidden; }
  .mv-card .mv-bar > div { height:100%; border-radius:2px; transition:width .4s; }
  .mv-card .mv-status { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; margin-top:4px; }
  .mv-card.optimal .mv-status { color:var(--up); }
  .mv-card.undertrained .mv-status { color:var(--caution); }
  .mv-card.neglected .mv-status { color:var(--down); }
  .mv-card.overtrained .mv-status { color:var(--royal); }

  .symmetry-meter { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); }
  .symmetry-meter:last-child { border-bottom:none; }
  .symmetry-meter .sm-label { width:80px; font-size:12px; font-weight:600; color:var(--dim); }
  .symmetry-meter .sm-bar { flex:1; height:8px; background:var(--panel2); border-radius:4px; position:relative; overflow:visible; }
  .symmetry-meter .sm-indicator { position:absolute; top:-4px; width:16px; height:16px; border-radius:50%; border:2px solid var(--panel); }
  .symmetry-meter .sm-val { width:50px; font-family:var(--mono); font-weight:800; font-size:14px; text-align:right; }

  .physique-card { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .physique-card .pc-main { grid-column:1/-1; }
  .physique-card .pc-type { font-family:var(--mono); font-size:28px; font-weight:900; }
  .physique-card .pc-desc { font-size:13.5px; color:var(--dim); line-height:1.55; margin-top:4px; }
  .physique-card .pc-list { list-style:none; margin:8px 0 0; padding:0; }
  .physique-card .pc-list li { font-size:13px; padding:3px 0; color:var(--dim); }
  .physique-card .pc-list li::before { content:'●'; margin-right:6px; font-size:8px; vertical-align:middle; }
  .physique-card .pc-list.strong li::before { color:var(--up); }
  .physique-card .pc-list.weak li::before { color:var(--down); }
  .physique-card .pc-stat { text-align:center; background:var(--panel2); border-radius:8px; padding:12px; }
  .physique-card .pc-stat .pcs-val { font-family:var(--mono); font-size:24px; font-weight:900; }
  .physique-card .pc-stat .pcs-label { font-size:11px; color:var(--dim); margin-top:2px; }

  .mobility-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
  .mob-item { background:var(--panel2); border-radius:8px; padding:12px; }
  .mob-item .mob-val { font-family:var(--mono); font-size:20px; font-weight:800; }
  .mob-item .mob-label { font-size:11px; color:var(--dim); font-weight:600; margin-top:2px; }
  .mob-item .mob-status { font-size:11px; font-weight:700; margin-top:3px; }

  .imbalance-item { padding:8px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
  .imbalance-item:last-child { border-bottom:none; }
  .imbalance-item .ib-sev { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:3px; }
  .imbalance-item .ib-sev.severe { background:rgba(247,107,77,.2); color:var(--down); }
  .imbalance-item .ib-sev.moderate { background:rgba(251,191,36,.2); color:var(--caution); }
  .imbalance-item .ib-sev.mild { background:var(--panel2); color:var(--dim); }
  .imbalance-item .ib-text { font-size:13px; color:var(--dim); flex:1; }

  .body-overview-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
  .bos-item { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 8px; text-align:center; cursor:pointer; transition:border-color .2s; }
  .bos-item:hover { border-color:var(--faint); }
  .bos-item .bos-val { font-family:var(--mono); font-size:20px; font-weight:900; }
  .bos-item .bos-label { font-size:10px; color:var(--dim); font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
  @media (max-width:480px) { .body-overview-strip { grid-template-columns:repeat(2,1fr); } .body-hero { grid-template-columns:1fr; } }

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
  @keyframes fabSpringIn { from { transform:scale(0) rotate(-180deg); opacity:0; } to { transform:scale(1) rotate(0); opacity:1; } }
  .checkin-fab { position:fixed; bottom:76px; right:16px; width:48px; height:48px; border-radius:50%; background:var(--pulse); color:#fff; border:none; font-size:22px; cursor:pointer; z-index:30; box-shadow:0 2px 10px rgba(0,0,0,.3); display:none; transition:transform .2s var(--ease-spring); }
  .checkin-fab.show { display:flex; align-items:center; justify-content:center; animation:fabSpringIn .45s var(--ease-spring) both; }
  .checkin-fab:active { transform:scale(.9); }
  .checkin-overlay { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:60; display:none; align-items:flex-end; justify-content:center; }
  .checkin-overlay.open { display:flex; }
  .checkin-sheet { background:var(--panel); border:1px solid var(--line); border-radius:20px 20px 0 0; padding:20px 16px 30px; width:100%; max-width:440px; max-height:80vh; overflow-y:auto; box-shadow:0 -4px 30px rgba(0,0,0,.3); animation:fadeSlideUp .3s var(--ease-spring) both; }
  .checkin-sheet h3 { margin:0 0 14px; font-size:16px; }
  .ci-q { margin-bottom:16px; }
  .ci-q label { display:block; font-size:13px; color:var(--dim); font-weight:600; margin-bottom:6px; }
  .ci-opts { display:flex; gap:6px; flex-wrap:wrap; }
  .ci-opt { padding:8px 16px; border-radius:20px; border:1px solid var(--line); background:var(--void); color:var(--txt); font-size:14px; cursor:pointer; transition:all .15s; }
  .ci-opt:hover { background:linear-gradient(135deg, var(--pulse), var(--gold)); color:#fff; border-color:var(--pulse); }
  .ci-opt.sel { background:var(--pulse); color:#fff; border-color:var(--pulse); }
  .ci-opt:active { transform:scale(.95); }
  .ci-actions { display:flex; gap:8px; margin-top:16px; }
  .ci-actions button { flex:1; padding:10px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:transform .15s var(--ease-spring); }
  .ci-actions button:active { transform:scale(.95); }
  .ci-actions .ci-save { background:var(--pulse); color:#fff; }
  .ci-actions .ci-cancel { background:var(--void); color:var(--dim); border:1px solid var(--line); }
  .install-banner { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin:10px 0; display:none; align-items:center; gap:10px; }
  .install-banner.show { display:flex; }
  .install-banner .ib-text { flex:1; font-size:13px; }
  .install-banner button { background:var(--pulse); color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:13px; cursor:pointer; }
  @media (min-width:561px) { .checkin-fab { bottom:24px; right:24px; } }

  /* ---- workout logger ---- */
  .muscle-map { display:flex; gap:12px; justify-content:center; padding:8px 0; }
  .muscle-view { text-align:center; }
  .muscle-view-label { font-size:10px; color:var(--dim); margin-top:4px; text-transform:uppercase; letter-spacing:.5px; }
  .muscle-body { width:120px; height:auto; }
  .muscle-body circle, .muscle-body rect, .muscle-body ellipse, .muscle-body path { fill:var(--line); transition:fill .2s, filter .2s; }
  .muscle-region { cursor:default; }
  .muscle-region.lit { fill:var(--pulse) !important; }
  .muscle-region.lit-secondary { fill:var(--pulse) !important; opacity:.45; }
  .muscle-map-mini { pointer-events:none; }
  .muscle-map-mini .muscle-body { width:56px; }
  .muscle-map-mini .muscle-view-label { display:none; }
  .muscle-map-mini .muscle-map { gap:4px; padding:0; }

  .wl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); z-index:70; display:none; align-items:flex-end; justify-content:center; }
  .wl-overlay.open { display:flex; }
  .wl-sheet { background:var(--panel); border-radius:16px 16px 0 0; padding:20px 16px 30px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; }
  .wl-sheet h3 { margin:0 0 16px; font-size:18px; font-weight:700; }
  .wl-row { display:flex; gap:8px; margin-bottom:12px; align-items:center; }
  .wl-row input, .wl-row select { background:var(--void); border:1px solid var(--line); color:var(--ink); border-radius:6px; padding:8px 10px; font-family:inherit; font-size:14px; flex:1; }
  .wl-row input:focus { border-color:var(--pulse); outline:none; }
  .wl-exercise { background:var(--void); border:1px solid var(--line); border-radius:10px; padding:12px; margin-bottom:10px; position:relative; }
  .wl-ex-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .wl-ex-name { font-weight:700; font-size:15px; flex:1; }
  .wl-ex-muscles { font-size:11px; color:var(--pulse); }
  .wl-ex-rm { position:absolute; top:10px; right:10px; background:none; border:none; color:var(--faint); cursor:pointer; font-size:16px; padding:4px; }
  .wl-ex-rm:hover { color:var(--down); }
  .wl-sets-head { display:grid; grid-template-columns:36px 1fr 1fr 28px; gap:6px; font-size:10px; color:var(--dim); font-weight:600; text-transform:uppercase; margin-bottom:4px; padding:0 2px; }
  .wl-set-row { display:grid; grid-template-columns:36px 1fr 1fr 28px; gap:6px; margin-bottom:4px; align-items:center; }
  .wl-set-row .set-num { font-family:var(--mono); font-weight:700; color:var(--pulse); font-size:14px; text-align:center; }
  .wl-set-row input { background:var(--panel2); border:1px solid var(--line); color:var(--ink); border-radius:4px; padding:6px; font-family:var(--mono); font-size:14px; font-weight:600; text-align:center; width:100%; box-sizing:border-box; }
  .wl-set-row input:focus { border-color:var(--pulse); outline:none; }
  .wl-set-row .set-rm { background:none; border:none; color:var(--faint); cursor:pointer; font-size:14px; text-align:center; padding:0; }
  .wl-set-row .set-rm:hover { color:var(--down); }
  .wl-add-set { background:none; border:1px dashed var(--line); color:var(--dim); border-radius:6px; padding:4px 0; font-size:12px; cursor:pointer; margin-top:4px; width:100%; }
  .wl-add-set:hover { border-color:var(--pulse); color:var(--pulse); }
  .wl-add-ex { background:none; border:1px dashed var(--line); color:var(--dim); border-radius:10px; padding:14px; font-size:14px; cursor:pointer; text-align:center; width:100%; margin-bottom:12px; }
  .wl-add-ex:hover { border-color:var(--pulse); color:var(--pulse); }
  .wl-ac { position:relative; flex:1; }
  .wl-ac input { width:100%; box-sizing:border-box; }
  .wl-ac-list { position:absolute; top:100%; left:0; right:0; background:var(--panel2); border:1px solid var(--line); border-radius:0 0 8px 8px; max-height:200px; overflow-y:auto; z-index:80; display:none; }
  .wl-ac-list.show { display:block; }
  .wl-ac-item { padding:8px 12px; cursor:pointer; font-size:13px; display:flex; justify-content:space-between; align-items:center; }
  .wl-ac-item:hover { background:var(--pulse); color:#000; }
  .wl-ac-cat { font-size:10px; color:var(--dim); text-transform:uppercase; }
  .wl-ac-item:hover .wl-ac-cat { color:rgba(0,0,0,.5); }
  .wl-link-section { background:var(--panel2); border-radius:8px; padding:10px 12px; margin-bottom:12px; }
  .wl-link-section h4 { margin:0 0 8px; font-size:12px; color:var(--dim); font-weight:600; text-transform:uppercase; }
  .wl-link-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:13px; margin-bottom:2px; }
  .wl-link-item:hover, .wl-link-item.selected { background:var(--pulse); color:#000; }
  .wl-link-item .wl-li-meta { font-size:11px; color:var(--dim); }
  .wl-link-item:hover .wl-li-meta, .wl-link-item.selected .wl-li-meta { color:rgba(0,0,0,.5); }
  .wl-actions { display:flex; gap:8px; margin-top:16px; }
  .wl-actions button { flex:1; padding:12px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; border:none; }
  .wl-actions .wl-save { background:var(--pulse); color:#000; }
  .wl-actions .wl-save:disabled { opacity:.4; cursor:not-allowed; }
  .wl-actions .wl-cancel { background:var(--void); color:var(--dim); border:1px solid var(--line); }
  .wl-log-btn { background:var(--pulse); color:#000; border:none; border-radius:8px; padding:10px 20px; font-size:14px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
  .wl-log-btn:hover { filter:brightness(1.1); }
  .wl-history-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; margin-bottom:10px; cursor:pointer; transition:border-color .15s; }
  .wl-history-card:hover { border-color:var(--pulse); }
  .wl-hc-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
  .wl-hc-type { font-weight:700; font-size:16px; }
  .wl-hc-date { font-size:12px; color:var(--dim); }
  .wl-hc-stats { display:flex; gap:16px; font-size:13px; color:var(--dim); margin-bottom:6px; flex-wrap:wrap; }
  .wl-hc-stat strong { color:var(--ink); font-family:var(--mono); font-weight:700; }
  .wl-hc-exercises { font-size:12px; color:var(--faint); }
  .wl-hc-bottom { display:flex; align-items:center; gap:12px; margin-top:8px; }
  .wl-hc-linked { font-size:11px; color:var(--pulse); display:flex; align-items:center; gap:4px; }
  .wl-detail { background:var(--void); border-radius:10px; padding:16px; margin-bottom:12px; }
  .wl-detail h4 { margin:0 0 4px; font-size:15px; }
  .wl-d-meta { font-size:12px; color:var(--dim); margin-bottom:12px; }
  .wl-detail-ex { margin-bottom:12px; }
  .wl-detail-ex h5 { margin:0 0 4px; font-size:14px; color:var(--pulse); font-weight:600; }
  .wl-detail-sets { display:grid; grid-template-columns:36px repeat(2,1fr); gap:2px 8px; font-size:13px; }
  .wl-detail-sets .ds-head { color:var(--dim); font-size:10px; font-weight:600; text-transform:uppercase; }
  .wl-detail-sets .ds-num { color:var(--pulse); font-family:var(--mono); font-weight:700; }
  .wl-detail-sets .ds-val { font-family:var(--mono); font-weight:600; }
  .wl-detail-actions { display:flex; gap:8px; margin-top:12px; }
  .wl-detail-actions button { padding:6px 14px; border-radius:6px; font-size:13px; cursor:pointer; border:none; font-weight:600; }
  .wl-detail-actions .wl-edit { background:var(--pulse); color:#000; }
  .wl-detail-actions .wl-del { background:var(--void); color:var(--down); border:1px solid var(--line); }
  .wl-empty { text-align:center; padding:40px 20px; color:var(--dim); }
  .wl-empty p { margin:8px 0; font-size:14px; }

  /* ---- recovery breakdown ---- */
  .recovery-pillars { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .rp-item { background:var(--panel2); border-radius:8px; padding:10px; text-align:center; }
  .rp-label { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px; }
  .rp-val { font-family:var(--mono); font-weight:700; font-size:18px; }
  .rp-bar { height:4px; border-radius:2px; background:var(--line); margin-top:6px; }
  .rp-fill { height:100%; border-radius:2px; transition:width .4s var(--ease-smooth); }

  /* ---- illness card ---- */
  .illness-card { border-left:3px solid var(--caution); }
  .illness-card.critical { border-left-color:var(--down); }
  .illness-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .illness-icon { font-size:18px; }
  .illness-title { font-weight:700; font-size:15px; }

  /* ---- checkin enhancements ---- */
  .ci-row { display:flex; gap:8px; margin:10px 0; }
  .ci-field { flex:1; }
  .ci-field label { display:block; font-size:11px; color:var(--dim); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em; }
  .ci-field input { width:100%; box-sizing:border-box; padding:8px; background:var(--panel2); border:1px solid var(--line); border-radius:6px; color:var(--ink); font-family:var(--mono); font-size:14px; }
  .ci-toggles { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .ci-toggle { display:flex; align-items:center; gap:6px; padding:6px 10px; border:1px solid var(--line); border-radius:20px; font-size:12px; cursor:pointer; }
  .ci-toggle input { display:none; }
  .ci-toggle input:checked + span { color:var(--pulse); }
  .ci-toggle:has(input:checked) { border-color:var(--pulse); background:rgba(163,230,53,.08); }

  /* ---- workout analytics ---- */
  .pr-list { list-style:none; padding:0; margin:0; }
  .pr-item { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); }
  .pr-item:last-child { border-bottom:none; }
  .pr-exercise { font-weight:600; font-size:14px; }
  .pr-value { font-family:var(--mono); font-weight:700; font-size:16px; color:var(--pulse); }
  .pr-meta { font-size:11px; color:var(--dim); }
  .mb-bars { display:flex; flex-direction:column; gap:6px; }
  .mb-row { display:flex; align-items:center; gap:8px; }
  .mb-label { width:80px; font-size:12px; color:var(--dim); text-transform:capitalize; }
  .mb-bar-wrap { flex:1; height:20px; background:var(--panel2); border-radius:4px; position:relative; }
  .mb-bar-fill { height:100%; border-radius:4px; transition:width .4s var(--ease-smooth); }
  .mb-count { font-family:var(--mono); font-weight:700; font-size:13px; min-width:28px; text-align:right; }
  .freq-list { list-style:none; padding:0; margin:0; }
  .freq-item { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .freq-item:last-child { border-bottom:none; }
  .freq-change { font-family:var(--mono); font-weight:700; }
  .freq-change.up { color:var(--up); }
  .freq-change.down { color:var(--down); }

  /* ---- sleep protocol ---- */
  .sp-card { background:linear-gradient(135deg, var(--royal)08, var(--panel2)); border:1px solid var(--royal)33; border-radius:10px; padding:16px; }
  .sp-times { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin:12px 0; }
  .sp-time { text-align:center; padding:8px; background:var(--panel); border-radius:8px; }
  .sp-time-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-bottom:2px; }
  .sp-time-val { font-family:var(--mono); font-weight:800; font-size:18px; }
  .sp-deadlines { display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }
  .sp-deadline { font-size:12px; padding:4px 10px; background:var(--panel); border:1px solid var(--line); border-radius:20px; }
  .sp-deadline .dl-icon { margin-right:4px; }
  .sp-steps { list-style:none; padding:0; margin:10px 0 0; }
  .sp-steps li { font-size:13px; color:var(--dim); padding:4px 0; padding-left:20px; position:relative; }
  .sp-steps li::before { content:''; position:absolute; left:0; top:10px; width:8px; height:8px; border-radius:50%; background:var(--royal); opacity:.5; }

  /* ---- lifestyle impacts ---- */
  .li-grid { display:flex; flex-direction:column; gap:10px; }
  .li-card { padding:12px 14px; background:var(--panel2); border-radius:8px; border-left:3px solid var(--dim); }
  .li-card.has-impact { border-left-color:var(--caution); }
  .li-card.positive-impact { border-left-color:var(--up); }
  .li-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .li-icon { font-size:18px; }
  .li-name { font-weight:700; font-size:14px; }
  .li-conf { font-size:10px; color:var(--faint); text-transform:uppercase; letter-spacing:.04em; }
  .li-impacts { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
  .li-impact { font-family:var(--mono); font-size:12px; font-weight:600; padding:2px 8px; border-radius:12px; }
  .li-impact.worse { background:var(--down)18; color:var(--down); }
  .li-impact.better { background:var(--up)18; color:var(--up); }
  .li-impact.neutral { background:var(--dim)12; color:var(--dim); }
  .li-rec { font-size:12.5px; color:var(--dim); line-height:1.5; }

  /* ---- recovery countdown ---- */
  .rc-list { display:flex; flex-direction:column; gap:6px; }
  .rc-item { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--panel2); border-radius:8px; }
  .rc-muscle { font-weight:700; font-size:13px; flex:1; text-transform:capitalize; }
  .rc-bar-wrap { width:80px; height:6px; background:var(--line); border-radius:3px; }
  .rc-bar-fill { height:100%; border-radius:3px; transition:width .4s; }
  .rc-eta { font-family:var(--mono); font-weight:600; font-size:12px; color:var(--dim); text-align:right; min-width:50px; }

  /* ---- smart check-in ---- */
  #smartCheckInArea { display:flex; flex-direction:column; gap:10px; margin-bottom:12px; }
  .sci-card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; transition:border-color .2s, transform .2s var(--ease-spring); }
  .sci-card:hover { border-color:rgba(212,168,83,.25); }
  .sci-card.sci-done { opacity:.6; pointer-events:none; }
  .sci-head { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
  .sci-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; background:rgba(212,168,83,.12); }
  .sci-text { flex:1; min-width:0; }
  .sci-q { font-size:14px; font-weight:700; line-height:1.4; margin:0; }
  .sci-reason { font-size:11.5px; color:var(--dim); margin-top:3px; line-height:1.4; }
  .sci-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .sci-actions input[type="number"], .sci-actions input[type="text"] { background:var(--void); border:1px solid var(--line); color:var(--ink); border-radius:8px; padding:9px 12px; font-size:14px; font-family:var(--mono); width:72px; transition:border-color .15s; }
  .sci-actions input:focus { outline:none; border-color:var(--gold); }
  .sci-actions .sci-save { background:var(--gold); color:var(--void); border:none; border-radius:8px; padding:9px 16px; font-size:13px; font-weight:700; cursor:pointer; transition:transform .15s var(--ease-spring), opacity .15s; }
  .sci-actions .sci-save:active { transform:scale(.95); }
  .sci-bool { display:flex; gap:8px; }
  .sci-bool button { padding:10px 20px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:1px solid var(--line); background:var(--panel2); color:var(--ink); transition:all .15s; }
  .sci-bool button:hover { border-color:var(--gold); }
  .sci-bool button.yes { background:rgba(212,168,83,.15); color:var(--gold); border-color:rgba(212,168,83,.4); }
  .sci-bool button.no { background:var(--panel2); }
  .sci-done-msg { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--up); padding:4px 0; }

  /* ---- personal records ---- */
  .pr-grid { display:flex; flex-direction:column; gap:8px; }
  .pr-card { display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--panel2); border-radius:8px; position:relative; overflow:hidden; }
  .pr-card.new-pr { border:1px solid var(--gold)66; background:linear-gradient(135deg, var(--gold)08, var(--panel2)); }
  .pr-card.new-pr::after { content:'🏆'; position:absolute; top:4px; right:8px; font-size:16px; }
  .pr-name { font-weight:700; font-size:13px; flex:1; min-width:0; }
  .pr-val { font-family:var(--mono); font-weight:800; font-size:18px; text-align:right; }
  .pr-sub { font-size:11px; color:var(--dim); }
  .pr-spark { width:60px; height:24px; flex-shrink:0; }

  /* ---- consistency streaks ---- */
  .streak-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; }
  .streak-card { padding:12px; background:var(--panel2); border-radius:10px; text-align:center; }
  .streak-card.active { border:1px solid var(--up)44; }
  .streak-icon { font-size:24px; margin-bottom:4px; }
  .streak-num { font-family:var(--mono); font-weight:900; font-size:28px; line-height:1; }
  .streak-label { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-top:2px; }
  .streak-best { font-size:10px; color:var(--faint); margin-top:4px; }

  /* ---- weekly comparison ---- */
  .wc-grid { display:flex; flex-direction:column; gap:6px; }
  .wc-row { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--panel2); border-radius:8px; }
  .wc-metric { font-weight:600; font-size:13px; flex:1; }
  .wc-vals { display:flex; gap:16px; font-family:var(--mono); font-size:13px; }
  .wc-val { min-width:50px; text-align:right; }
  .wc-delta { font-weight:700; min-width:60px; text-align:right; }
  .wc-delta.better { color:var(--up); }
  .wc-delta.worse { color:var(--down); }
  .wc-delta.neutral { color:var(--dim); }

  /* ---- training readiness gauge ---- */
  .tr-gauge { text-align:center; padding:16px; }
  .tr-score { font-family:var(--mono); font-weight:900; font-size:56px; line-height:1; }
  .tr-label { font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin:4px 0 12px; }
  .tr-label.peak { color:var(--up); }
  .tr-label.good { color:var(--pulse); }
  .tr-label.moderate { color:var(--caution); }
  .tr-label.low { color:var(--down); }
  .tr-factors { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
  .tr-factor { display:flex; align-items:center; gap:8px; font-size:12px; }
  .tr-factor-name { width:90px; font-weight:600; }
  .tr-factor-bar { flex:1; height:6px; background:var(--line); border-radius:3px; overflow:hidden; }
  .tr-factor-bar > div { height:100%; border-radius:3px; transition:width .5s; }
  .tr-factor-score { font-family:var(--mono); font-weight:700; width:28px; text-align:right; }
  .tr-rec { font-size:13px; color:var(--dim); margin-top:14px; line-height:1.5; text-align:center; }

  /* ---- calendar heatmap ---- */
  .hm-wrap { overflow-x:auto; padding:4px 0; }
  .hm-grid { display:grid; grid-template-rows:repeat(7, 14px); grid-auto-flow:column; grid-auto-columns:14px; gap:2px; }
  .hm-cell { width:14px; height:14px; border-radius:2px; cursor:default; }
  .hm-0 { background:var(--panel2); }
  .hm-1 { background:var(--up)33; }
  .hm-2 { background:var(--up)66; }
  .hm-3 { background:var(--up)aa; }
  .hm-4 { background:var(--up); }
  .hm-legend { display:flex; gap:4px; align-items:center; margin-top:8px; font-size:10px; color:var(--dim); }
  .hm-legend-cell { width:12px; height:12px; border-radius:2px; }

  /* ---- FAB (quick action) ---- */
  .fab-wrap { position:fixed; bottom:24px; right:24px; z-index:100; display:none; }
  .fab-wrap.show { display:block; }
  .fab-btn { width:56px; height:56px; border-radius:50%; border:none; background:linear-gradient(135deg, var(--pulse), var(--gold)); color:#fff; font-size:28px; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.25); transition:transform .15s var(--ease-spring); display:flex; align-items:center; justify-content:center; }
  .fab-btn:active { transform:scale(.9); }
  .fab-menu { position:absolute; bottom:64px; right:0; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:6px 0; min-width:180px; box-shadow:0 8px 32px rgba(0,0,0,.2); display:none; }
  .fab-menu.open { display:block; }
  .fab-item { display:flex; align-items:center; gap:10px; padding:10px 16px; font-size:14px; color:var(--ink); cursor:pointer; border:none; background:none; width:100%; text-align:left; }
  .fab-item:hover { background:var(--panel2); }
  .fab-item-icon { font-size:18px; }

  /* ---- progression & 1RM ---- */
  .e1rm-grid { display:flex; flex-direction:column; gap:8px; }
  .e1rm-card { display:flex; align-items:center; gap:12px; padding:10px 12px; background:var(--panel2); border-radius:8px; }
  .e1rm-name { font-weight:700; font-size:13px; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .e1rm-val { font-family:var(--mono); font-weight:800; font-size:18px; }
  .e1rm-trend { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
  .e1rm-trend.improving { color:var(--up); }
  .e1rm-trend.declining { color:var(--down); }
  .e1rm-trend.plateau { color:var(--caution); }
  .e1rm-delta { font-size:12px; color:var(--dim); font-family:var(--mono); }
  .e1rm-chart { width:80px; height:28px; flex-shrink:0; }

  /* ---- muscle recovery heatmap ---- */
  .mr-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); gap:6px; }
  .mr-cell { text-align:center; padding:8px 4px; border-radius:8px; }
  .mr-cell.fresh { background:var(--up)18; border:1px solid var(--up)44; }
  .mr-cell.recovered { background:var(--pulse)14; border:1px solid var(--pulse)33; }
  .mr-cell.recovering { background:var(--caution)16; border:1px solid var(--caution)44; }
  .mr-cell.sore { background:var(--down)16; border:1px solid var(--down)44; }
  .mr-label { font-size:11px; font-weight:600; text-transform:capitalize; }
  .mr-pct { font-family:var(--mono); font-weight:800; font-size:16px; }
  .mr-status { font-size:10px; text-transform:uppercase; letter-spacing:.04em; font-weight:600; }
  .mr-status.fresh { color:var(--up); }
  .mr-status.recovered { color:var(--pulse); }
  .mr-status.recovering { color:var(--caution); }
  .mr-status.sore { color:var(--down); }

  /* ---- session prescription ---- */
  .rx-card { background:linear-gradient(135deg, var(--pulse)08, var(--panel2)); border:1px solid var(--pulse)33; border-radius:10px; padding:16px; }
  .rx-title { font-family:var(--mono); font-weight:800; font-size:18px; margin-bottom:6px; }
  .rx-reasoning { font-size:13px; color:var(--dim); line-height:1.5; margin-bottom:12px; }
  .rx-details { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .rx-tag { font-size:12px; font-weight:600; padding:4px 10px; border-radius:20px; background:var(--panel); border:1px solid var(--line); }
  .rx-exercises { display:flex; flex-direction:column; gap:4px; }
  .rx-ex { font-size:13px; padding:4px 0; border-bottom:1px solid var(--line)44; }
  .rx-start { background:var(--pulse); color:#fff; border:none; border-radius:8px; padding:10px 20px; font-size:14px; font-weight:700; cursor:pointer; width:100%; margin-top:12px; }

  /* ---- periodization ---- */
  .period-blocks { display:flex; gap:3px; align-items:flex-end; height:60px; margin:12px 0; }
  .period-bar { flex:1; border-radius:3px 3px 0 0; min-width:8px; position:relative; transition:height .3s; }
  .period-bar.build { background:var(--up); }
  .period-bar.peak { background:var(--pulse); }
  .period-bar.deload { background:var(--caution); }
  .period-bar.base { background:var(--dim)44; }
  .period-phase { font-family:var(--mono); font-weight:700; font-size:14px; text-transform:uppercase; letter-spacing:.04em; }

  /* ---- momentum ---- */
  .momentum-list { display:flex; flex-direction:column; gap:6px; }
  .momentum-item { display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--panel2); border-radius:8px; border-left:3px solid var(--dim); }
  .momentum-item.positive { border-left-color:var(--up); }
  .momentum-item.warning { border-left-color:var(--caution); }
  .momentum-icon { font-size:16px; }
  .momentum-text { flex:1; }
  .momentum-title { font-weight:700; font-size:13px; }
  .momentum-detail { font-size:12px; color:var(--dim); }

  /* ---- workout templates ---- */
  .tmpl-grid { display:flex; flex-direction:column; gap:8px; }
  .tmpl-card { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--panel2); border-radius:8px; border-left:3px solid var(--pulse); cursor:pointer; transition:transform .1s; }
  .tmpl-card:active { transform:scale(.98); }
  .tmpl-info { flex:1; min-width:0; }
  .tmpl-name { font-weight:700; font-size:14px; }
  .tmpl-meta { font-size:12px; color:var(--dim); margin-top:2px; }
  .tmpl-actions { display:flex; gap:6px; }
  .tmpl-use { background:var(--pulse); color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer; }
  .tmpl-edit, .tmpl-del { background:none; border:1px solid var(--line); color:var(--dim); border-radius:6px; padding:5px 8px; font-size:11px; cursor:pointer; }
  .tmpl-empty { text-align:center; padding:20px; color:var(--dim); font-size:13px; }

  /* ---- unlogged prompt ---- */
  .unlogged-card { background:linear-gradient(135deg, var(--pulse)12, var(--panel2)); border:1px solid var(--pulse)44; border-radius:10px; padding:14px; margin-bottom:10px; }
  .unlogged-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .unlogged-icon { font-size:20px; }
  .unlogged-title { font-weight:700; font-size:14px; }
  .unlogged-body { font-size:13px; color:var(--dim); margin-bottom:10px; }
  .unlogged-actions { display:flex; gap:8px; }
  .unlogged-log { background:var(--pulse); color:#fff; border:none; border-radius:6px; padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer; }
  .unlogged-dismiss { background:none; border:1px solid var(--line); color:var(--dim); border-radius:6px; padding:7px 12px; font-size:12px; cursor:pointer; }

  /* ---- coach directive ---- */
  .coach-headline { font-family:var(--mono); font-weight:800; font-size:22px; line-height:1.2; margin-bottom:8px; }
  .coach-body { font-size:13.5px; color:var(--dim); line-height:1.6; margin-bottom:12px; }
  .strain-budget { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--panel2); border-radius:10px; margin-bottom:10px; }
  .sb-dial { position:relative; width:64px; height:64px; flex-shrink:0; }
  .sb-dial svg { width:100%; height:100%; transform:rotate(-90deg); }
  .sb-dial .bg { fill:none; stroke:var(--line); stroke-width:6; }
  .sb-dial .fg { fill:none; stroke-width:6; stroke-linecap:round; transition:stroke-dashoffset .6s var(--ease-smooth); }
  .sb-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-weight:800; font-size:18px; }
  .sb-info { flex:1; }
  .sb-zone { font-family:var(--mono); font-weight:700; font-size:14px; text-transform:uppercase; letter-spacing:.06em; }
  .sb-zone.recovery { color:var(--down); }
  .sb-zone.easy { color:var(--caution); }
  .sb-zone.moderate { color:var(--dim); }
  .sb-zone.push { color:var(--up); }
  .sb-zone.peak { color:var(--pulse); }
  .sb-rationale { font-size:12px; color:var(--dim); margin-top:2px; }
  .coach-rx { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
  .coach-rx-item { display:flex; align-items:flex-start; gap:8px; font-size:13px; color:var(--dim); }
  .coach-rx-icon { font-size:14px; flex-shrink:0; margin-top:1px; }
  .injury-bar { height:6px; border-radius:3px; background:var(--line); margin:8px 0 4px; }
  .injury-fill { height:100%; border-radius:3px; transition:width .5s var(--ease-smooth); }
  .injury-factors { font-size:12px; color:var(--dim); }

  /* ---- patterns ---- */
  .pattern-list { display:flex; flex-direction:column; gap:8px; }
  .pattern-item { padding:10px 12px; background:var(--panel2); border-radius:8px; border-left:3px solid var(--pulse); }
  .pattern-item.recovery { border-left-color:var(--up); }
  .pattern-item.sleep { border-left-color:var(--royal); }
  .pattern-item.training { border-left-color:var(--caution); }
  .pattern-item.lifestyle { border-left-color:var(--gold); }
  .pattern-title { font-weight:700; font-size:13px; margin-bottom:4px; }
  .pattern-insight { font-size:12.5px; color:var(--dim); line-height:1.5; }
  .pattern-meta { font-size:11px; color:var(--faint); margin-top:4px; }

  /* ---- report card ---- */
  .rc-overall { font-family:var(--mono); font-weight:800; font-size:48px; text-align:center; margin:8px 0; }
  .rc-overall.a { color:var(--pulse); }
  .rc-overall.b { color:var(--up); }
  .rc-overall.c { color:var(--caution); }
  .rc-overall.d { color:var(--down); }
  .rc-domains { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:12px 0; }
  .rc-domain { text-align:center; padding:8px 4px; background:var(--panel2); border-radius:8px; }
  .rc-domain-label { font-size:10px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px; }
  .rc-domain-grade { font-family:var(--mono); font-weight:700; font-size:20px; }
  .rc-highlights { list-style:none; padding:0; margin:8px 0 0; }
  .rc-highlights li { font-size:12.5px; padding:3px 0; color:var(--dim); }
  .rc-highlights li::before { content:''; display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:8px; vertical-align:middle; }
  .rc-highlights li.good::before { background:var(--up); }
  .rc-highlights li.improve::before { background:var(--caution); }

  /* ---- predictions ---- */
  .pred-list { display:flex; flex-direction:column; gap:8px; }
  .pred-item { padding:10px 12px; background:var(--panel2); border-radius:8px; }
  .pred-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
  .pred-label { font-weight:600; font-size:13px; }
  .pred-trajectory { font-family:var(--mono); font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .pred-trajectory.improving { color:var(--up); }
  .pred-trajectory.declining { color:var(--down); }
  .pred-trajectory.flat { color:var(--dim); }
  .pred-detail { font-size:12.5px; color:var(--dim); line-height:1.5; }

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
      <h1>Body</h1>
      <div class="sub" id="lastUpdated"><span class="live-dot"></span>—</div>
    </div>
    <nav class="tabs primary" id="primaryNav">
      <button class="tab" data-view="today" onclick="showView('today')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 3c1.7 0 3 1.3 3 3s-1.3 3-3 3-3-1.3-3-3 1.3-3 3-3zm0 14c-2.7 0-5-1.3-6.4-3.3C7.6 13.9 12 13 12 13s4.4.9 6.4 2.7C17 17.7 14.7 19 12 19z"/></svg><span>Body</span></button>
      <button class="tab" data-view="trends" onclick="showView('trends')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l5-6 4 3 7-9"/></svg><span>Timeline</span></button>
      <button class="tab" data-view="coach" onclick="showView('coach')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg><span>Coach</span></button>
    </nav>
    <nav class="subnav" id="subNav"></nav>
  </header>

  <!-- TODAY — BODY-CENTRIC HOME -->
  <section class="section active" id="tab-overview">
    <div class="greet">
      <div class="greet-hi"><span id="greeting">Hello</span><span id="greetStreak"></span></div>
      <div class="greet-sub" id="greetingSub">Loading your body…</div>
    </div>

    <!-- Verdict banner -->
    <div class="verdict v-neutral" id="verdict">
      <div class="v-row">
        <div class="v-ring" id="verdictRing">
          <svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="24" cy="24" r="20" fill="none" stroke="var(--pulse)" stroke-width="4" stroke-linecap="round" stroke-dasharray="126" stroke-dashoffset="126" id="vRingFill" style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset .8s ease"/></svg>
          <span class="v-ring-num num" id="verdictNum">—</span>
        </div>
        <div class="v-info">
          <div class="v-word" id="verdictWord">…</div>
          <div class="v-line" id="verdictLine">Reading your recovery.</div>
        </div>
        <div class="v-stats" id="verdictStats"></div>
      </div>
      <div class="v-why" id="verdictWhy"></div>
    </div>

    <!-- Quick-glance metric cards -->
    <div class="qg-row" id="quickGlanceRow"></div>

    <!-- Strain budget bar -->
    <div class="card" id="strainBudgetCard" style="display:none">
      <div class="sb-label">Strain <span id="sbUsed2">0</span> / <span id="sbMax2">21</span></div>
      <div class="sb-track"><div class="sb-fill" id="sbFill2"></div><div class="sb-target" id="sbTarget2"></div></div>
    </div>

    <!-- Body silhouette -->
    <div class="body-home" id="bodyHome">
      <div class="body-stage" id="bodyStage">
        <div class="body-score-badge" id="bodyScoreBadge">
          <div class="bsb-ring">
            <svg viewBox="0 0 80 80">
              <defs><linearGradient id="bsbGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="var(--pulse)"/><stop offset="100%" stop-color="var(--up)"/></linearGradient></defs>
              <circle cx="40" cy="40" r="34" class="bsb-bg"/>
              <circle cx="40" cy="40" r="34" class="bsb-fill" id="bsbFill" stroke-dasharray="214" stroke-dashoffset="214"/>
            </svg>
            <div class="bsb-center">
              <div class="bsb-num count-up" id="bsbNum" data-target="0">—</div>
              <div class="bsb-label">Body</div>
            </div>
          </div>
        </div>
        <div class="body-stage-svg" id="bodyStageSvg"></div>
      </div>
      <div class="body-inline-detail" id="bodyInlineDetail" style="display:none"></div>
    </div>

    <!-- What moved vs yesterday -->
    <div class="card" id="whatMovedCard" style="display:none">
      <h3>What moved</h3>
      <div class="card-sub">vs. yesterday</div>
      <div id="whatMovedList2"></div>
    </div>

    <!-- Smart check-in prompts -->
    <div id="smartCheckInArea"></div>

    <!-- Session up next -->
    <div class="card session-card" id="todaySession"><h3>Up next</h3><div class="skel-line" style="width:60%;"></div><div class="skel-line" style="width:80%;"></div></div>

    <!-- Coach note -->
    ${reviewCard("today", "Coach’s note")}

    <div class="card one-action" id="oneAction" style="display:none;">
      <div class="oa-label">Focus today</div>
      <div class="oa-text" id="oneActionText"></div>
    </div>

    <!-- Illness alert (hidden unless triggered) -->
    <div class="card illness-card" id="illnessCard" style="display:none">
      <div class="illness-head"><span class="illness-icon">⚠</span><span class="illness-title" id="illnessTitle"></span></div>
      <div class="illness-body sub" id="illnessBody"></div>
    </div>

    <!-- Activity heatmap -->
    <div class="card" id="heatmapCard" style="display:none">
      <h3>Activity heatmap <span style="font-weight:400;font-size:12px;color:var(--dim);">last 90 days</span></h3>
      <div class="hm-wrap" id="heatmapGrid"></div>
    </div>

    <!-- Streaks + Weekly comp + PRs -->
    <div class="card" id="streakCard" style="display:none">
      <h3>Consistency streaks</h3>
      <div class="streak-grid" id="streakGrid"></div>
    </div>

    <div class="card" id="weeklyCompCard" style="display:none">
      <h3>This week vs last week</h3>
      <div class="wc-grid" id="weeklyCompGrid"></div>
    </div>

    <div class="card" id="prCard" style="display:none">
      <h3>Personal records</h3>
      <div class="card-sub">Your best estimated 1RM per exercise</div>
      <div class="pr-grid" id="prGrid"></div>
    </div>

    <!-- Offscreen render targets for JS functions that populate them -->
    <div id="sleepArch" style="display:none"></div>
    <div id="bodyOverviewStrip" style="display:none"></div>
    <div class="compact-grid" id="allVitals" style="display:none"></div>
    <div id="readinessCard" style="display:none"><div id="readinessGauge"></div></div>
    <div id="sleepBrief" style="display:none"><div class="brief-n" id="bSleepH">—</div><div class="brief-n" id="bSleepQ">—</div><div class="brief-n" id="bDeepRem">—</div></div>
    <div id="bodyState" style="display:none"><div class="brief-n" id="bHrv">—</div><div id="bHrvD"></div><div class="brief-n" id="bRhr">—</div><div id="bRhrD"></div><div class="brief-n" id="bRecov">—</div></div>
    <div id="strainBudget" style="display:none"><div class="sb-fill" id="sbFill"></div><div id="sbTarget"></div><span id="sbUsed">0</span><span id="sbMax">21</span></div>
    <div id="recoveryBreakdown" style="display:none"><div id="recoveryPillars"></div></div>
    <div id="whatMoved" style="display:none"><div id="whatMovedList"></div></div>
  </section>

  <!-- METRIC DRAWER (slides up on tap from body/orbit) -->
  <div class="metric-drawer-bg" id="metricDrawerBg" onclick="closeMetricDrawer()"></div>
  <div class="metric-drawer" id="metricDrawer">
    <div class="md-sheet">
      <div class="md-handle"></div>
      <div class="md-header">
        <h3 id="mdTitle">—</h3>
        <button class="md-close" onclick="closeMetricDrawer()">×</button>
      </div>
      <div id="mdContent"></div>
    </div>
  </div>

  <!-- HOME MUSCLE DETAIL SHEET (tap muscle on body) -->
  <div class="home-muscle-bg" id="homeMuscBg" onclick="closeHomeMuscle()"></div>
  <div class="home-muscle-sheet" id="homeMuscSheet">
    <div class="hms-sheet">
      <div class="md-handle"></div>
      <div class="hms-header">
        <div class="hms-icon" id="hmsIcon">💪</div>
        <div>
          <div class="hms-title" id="hmsTitle">—</div>
          <span class="hms-status-pill" id="hmsStatus">—</span>
        </div>
        <button class="hms-close" onclick="closeHomeMuscle()">×</button>
      </div>
      <div class="hms-stats" id="hmsStats"></div>
      <div class="hms-bar" id="hmsBar"><div></div></div>
      <div class="hms-sparkline" id="hmsSpark"></div>
      <div class="hms-reco" id="hmsReco"></div>
      <button class="btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="closeHomeMuscle();showTab('body');">Full body analysis →</button>
    </div>
  </div>

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

  <!-- COACH DIRECTIVE -->
  <section class="section" id="tab-directive">
    <div class="card" id="coachDirectiveCard" style="display:none;">
      <div class="coach-headline" id="coachHeadline"></div>
      <div class="coach-body" id="coachBody"></div>

      <h3 style="margin-top:16px;">Strain budget</h3>
      <div class="strain-budget">
        <div class="sb-dial">
          <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="fg" id="sbArc" cx="32" cy="32" r="28"/></svg>
          <div class="sb-num" id="sbNum">—</div>
        </div>
        <div class="sb-info">
          <div class="sb-zone" id="sbZone">—</div>
          <div class="sb-rationale" id="sbRationale"></div>
        </div>
      </div>

      <h3>Injury risk</h3>
      <div style="display:flex;align-items:center;gap:8px;">
        <span id="irLabel" style="font-family:var(--mono);font-weight:700;font-size:14px;">—</span>
        <span id="irScore" style="font-size:12px;color:var(--dim);"></span>
      </div>
      <div class="injury-bar"><div class="injury-fill" id="irFill"></div></div>
      <div class="injury-factors" id="irFactors"></div>

      <div class="coach-rx" id="coachRx"></div>
    </div>

    <div class="card" id="coachPatternsCard" style="display:none;">
      <h3>Your patterns</h3>
      <div class="card-sub">Discovered from your personal data</div>
      <div class="pattern-list" id="patternList"></div>
    </div>

    <div class="card" id="coachReportCard" style="display:none;">
      <h3>Weekly report card</h3>
      <div class="rc-overall" id="rcOverall">—</div>
      <div class="rc-domains" id="rcDomains"></div>
      <ul class="rc-highlights" id="rcHighlights"></ul>
    </div>

    <div class="card" id="coachPredictionsCard" style="display:none;">
      <h3>Performance predictions</h3>
      <div class="card-sub">Where you're heading at current trajectory</div>
      <div class="pred-list" id="predList"></div>
    </div>

    <div class="card" id="sleepProtocolCard" style="display:none">
      <h3>Tonight's sleep protocol</h3>
      <div class="card-sub">Personalized from your data and tomorrow's demands</div>
      <div id="sleepProtocol"></div>
    </div>

    <div class="card" id="recoveryCountdownCard" style="display:none">
      <h3>Recovery countdown</h3>
      <div class="card-sub">Time until each muscle group is ready</div>
      <div class="rc-list" id="recoveryCountdowns"></div>
    </div>

    <div class="card" id="lifestyleImpactsCard" style="display:none">
      <h3>Your lifestyle impact scores</h3>
      <div class="card-sub">How each behavior affects YOUR specific metrics</div>
      <div class="li-grid" id="lifestyleImpacts"></div>
    </div>

    <div id="coachLoading" style="padding:12px 0;">
      <div class="skel-card"><div class="skel-circle"></div><div class="skel-line" style="width:60%;margin:0 auto;"></div><div class="skel-line" style="width:80%;margin:4px auto;"></div></div>
      <div class="skel-card"><div class="skel-row"><div class="skel-line"></div><div class="skel-line"></div></div><div class="skel-line" style="width:70%;"></div></div>
    </div>
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
    <div class="card" id="journalCorrelationsCard" style="display:none">
      <h3>Journal correlations</h3>
      <div class="card-sub">How your habits correlate with sensor metrics.</div>
      <div id="journalCorrelationsBody"></div>
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
          <div class="ring-label"><div class="n" id="scoreNum">—</div><div class="u"><span id="scoreCrown" style="display:none">&#128081; </span>health score</div></div>
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

  <!-- WORKOUTS (manual log) -->
  <section class="section" id="tab-workouts">
    <div id="unloggedPrompts"></div>
    <div class="card" id="templatesCard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="margin:0">Workout templates</h3>
        <button class="wl-log-btn" onclick="openTemplateEditor()">+ New template</button>
      </div>
      <div class="card-sub" style="margin-bottom:10px;">Create routines, start logging from them.</div>
      <div class="tmpl-grid" id="tmplGrid"><div class="tmpl-empty">No templates yet. Create one to speed up logging.</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0">Your workouts</h3>
        <button class="wl-log-btn" onclick="openWorkoutLogger()">+ Log workout</button>
      </div>
      <div id="wlMuscleOverview">${renderMuscleMap()}</div>
      <div id="wlHistory">
        <div class="wl-empty"><p>No workouts logged yet.</p><p style="font-size:12px">Tap <strong>Log workout</strong> to record your first session.</p></div>
      </div>
    </div>
    <div class="card" id="workoutPRsCard" style="display:none">
      <h3>Personal records</h3>
      <div id="workoutPRs"></div>
    </div>
    <div class="card" id="muscleBalanceCard" style="display:none">
      <h3>Muscle balance (30 days)</h3>
      <div class="card-sub">Push / Pull / Legs / Core hit frequency.</div>
      <div id="muscleBalanceChart"></div>
    </div>
    <div class="card" id="workoutFreqCard" style="display:none">
      <h3>Workout frequency</h3>
      <div class="card-sub">Last 30 days vs prior 30 days.</div>
      <div id="workoutFreqChart"></div>
    </div>

    <div class="card" id="sessionRxCard" style="display:none">
      <h3>Today's prescription</h3>
      <div class="card-sub">Based on your recovery, muscle freshness, and strain budget</div>
      <div id="sessionRx"></div>
    </div>

    <div class="card" id="muscleRecoveryCard" style="display:none">
      <h3>Muscle recovery status</h3>
      <div class="card-sub">Estimated recovery per muscle group</div>
      <div class="mr-grid" id="muscleRecoveryGrid"></div>
    </div>

    <div class="card" id="e1rmCard" style="display:none">
      <h3>Estimated 1RM progression</h3>
      <div class="card-sub">Epley formula from your logged sets</div>
      <div class="e1rm-grid" id="e1rmGrid"></div>
    </div>

    <div class="card" id="periodCard" style="display:none">
      <h3>Training periodization</h3>
      <div class="card-sub">Weekly training volume over time</div>
      <div id="periodViz"></div>
    </div>

    <div class="card" id="momentumCard" style="display:none">
      <h3>Momentum alerts</h3>
      <div class="card-sub">What's trending in your training</div>
      <div class="momentum-list" id="momentumList"></div>
    </div>
  </section>

  <!-- SLEEP -->
  <section class="section" id="tab-sleep">
    ${reviewCard("sleep", "Sleep review")}
    <div class="card" id="sleepAnalysisCard" style="display:none">
      <h3>Sleep analysis</h3>
      <div class="brief-row" id="sleepAnalysisRow"></div>
    </div>
    <div class="card"><h3>Sleep duration</h3><div class="chart-box"><canvas id="sleepChart"></canvas></div><div data-guide="sleepHours,sleepEfficiency"></div></div>
    <div class="card"><h3>Sleep stages</h3><div class="card-sub">Core, deep, REM and awake time.</div><div class="chart-box"><canvas id="sleepStagesChart"></canvas></div><div data-guide="sleepDeepHours,sleepRemHours"></div></div>
    <div class="card"><h3>Weight</h3><div class="chart-box"><canvas id="weightChart"></canvas></div><div data-guide="weightKg,bodyFatPct"></div></div>
  </section>

  <!-- BIOLOGICAL AGE -->
  <!-- BODY ANALYSIS -->
  <section class="section" id="tab-body">
    <!-- Animated body score + silhouette hero -->
    <div class="ab-hero" id="abHero">
      <div class="ab-score-ring" id="abScoreRing">
        <svg viewBox="0 0 200 200" class="ab-ring-svg">
          <defs><linearGradient id="abGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="var(--pulse)"/><stop offset="100%" stop-color="var(--up)"/></linearGradient></defs>
          <circle cx="100" cy="100" r="88" class="ab-ring-bg"/>
          <circle cx="100" cy="100" r="88" class="ab-ring-fill" id="abRingFill" stroke-dasharray="553" stroke-dashoffset="553"/>
        </svg>
        <div class="ab-ring-center">
          <div class="ab-ring-num count-up" id="abScoreNum" data-target="0">0</div>
          <div class="ab-ring-label" id="abScoreLabel">—</div>
        </div>
      </div>
      <div class="ab-hero-stats" id="abHeroStats"></div>
    </div>

    <!-- Interactive body silhouette -->
    <div class="ab-body-wrap">
      <div class="ab-body-toggle">
        <button class="ab-toggle active" id="abToggleFront" onclick="toggleBodyView('front')">Front</button>
        <button class="ab-toggle" id="abToggleBack" onclick="toggleBodyView('back')">Back</button>
      </div>
      <div class="ab-body-container" id="abBodyContainer">
        <div class="ab-body-view active" id="abBodyFront"></div>
        <div class="ab-body-view" id="abBodyBack"></div>
      </div>
      <div class="ab-body-legend">
        <span class="ab-leg"><span class="ab-leg-dot" style="background:var(--up);box-shadow:0 0 8px var(--up);"></span>Optimal</span>
        <span class="ab-leg"><span class="ab-leg-dot" style="background:var(--caution);opacity:.6;"></span>Undertrained</span>
        <span class="ab-leg"><span class="ab-leg-dot" style="background:var(--line);"></span>Neglected</span>
        <span class="ab-leg"><span class="ab-leg-dot" style="background:var(--royal);box-shadow:0 0 8px var(--royal);"></span>Overtrained</span>
      </div>
    </div>

    <!-- Muscle detail panel (shown on tap) -->
    <div class="ab-muscle-detail" id="abMuscleDetail" style="display:none">
      <div class="ab-md-head">
        <h3 id="abMdName">—</h3>
        <button class="btn-ghost btn-sm" onclick="document.getElementById('abMuscleDetail').style.display='none'">Close</button>
      </div>
      <div id="abMdContent"></div>
    </div>

    <!-- Body composition bar -->
    <div class="card" id="bodyCompCard" style="display:none">
      <h3>Body composition</h3>
      <div id="bodyCompContent"></div>
    </div>

    <!-- Muscle volume grid -->
    <div class="card" id="muscleVolumeCard" style="display:none">
      <h3>Muscle volume <span style="font-weight:400;font-size:12px;color:var(--dim);">weekly sets per group</span></h3>
      <div id="muscleVolumeContent"></div>
    </div>

    <!-- Symmetry -->
    <div class="card" id="symmetryCard" style="display:none">
      <h3>Body symmetry</h3>
      <div id="symmetryContent"></div>
    </div>

    <!-- Physique + Mobility side by side -->
    <div class="ab-duo">
      <div class="card" id="physiqueCard" style="display:none">
        <h3>Physique profile</h3>
        <div id="physiqueContent"></div>
      </div>
      <div class="card" id="mobilityCard" style="display:none">
        <h3>Mobility & gait</h3>
        <div id="mobilityContent"></div>
      </div>
    </div>

    <!-- Imbalances -->
    <div class="card" id="imbalanceCard" style="display:none">
      <h3>Imbalances to fix</h3>
      <div id="imbalanceContent"></div>
    </div>
  </section>

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
        <textarea id="knowledgeGoals" placeholder="Goals (e.g. run a 10k by June, improve sleep consistency)" rows="2" style="background:var(--panel2); border:1px solid var(--line); border-radius:6px; color:var(--ink); padding:10px; font-family:inherit; font-size:14px; line-height:1.5;"></textarea>
        <textarea id="knowledgePreferences" placeholder="Preferences (e.g. prefer morning workouts, strength 3x/week)" rows="2" style="background:var(--panel2); border:1px solid var(--line); border-radius:6px; color:var(--ink); padding:10px; font-family:inherit; font-size:14px; line-height:1.5;"></textarea>
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

  <div class="fab-wrap" id="checkinFab">
    <div class="fab-menu" id="fabMenu">
      <button class="fab-item" onclick="openWorkoutLogger(); toggleFab();"><span class="fab-item-icon">🏋️</span> Log workout</button>
      <button class="fab-item" onclick="openCheckin(); toggleFab();"><span class="fab-item-icon">📝</span> Evening check-in</button>
      <button class="fab-item" onclick="scrollTo(document.getElementById('tab-directive'),0); switchTab('directive'); toggleFab();"><span class="fab-item-icon">🧠</span> Coach advice</button>
    </div>
    <button class="fab-btn" onclick="toggleFab()">+</button>
  </div>
  <div class="checkin-overlay" id="checkinOverlay">
    <div class="checkin-sheet">
      <h3>Evening check-in</h3>
      <div class="ci-q"><label>Energy (1-10)</label>
        <div class="ci-opts" id="ciEnergy">
          <span class="ci-opt" data-v="2" onclick="ciSel(this)">Low</span>
          <span class="ci-opt" data-v="5" onclick="ciSel(this)">OK</span>
          <span class="ci-opt" data-v="7" onclick="ciSel(this)">Good</span>
          <span class="ci-opt" data-v="9" onclick="ciSel(this)">Great</span>
        </div>
      </div>
      <div class="ci-q"><label>Stress (1-10)</label>
        <div class="ci-opts" id="ciStress">
          <span class="ci-opt" data-v="2" onclick="ciSel(this)">Low</span>
          <span class="ci-opt" data-v="5" onclick="ciSel(this)">Some</span>
          <span class="ci-opt" data-v="7" onclick="ciSel(this)">High</span>
          <span class="ci-opt" data-v="9" onclick="ciSel(this)">Very</span>
        </div>
      </div>
      <div class="ci-q"><label>Soreness (1-10)</label>
        <div class="ci-opts" id="ciSoreness">
          <span class="ci-opt" data-v="1" onclick="ciSel(this)">None</span>
          <span class="ci-opt" data-v="4" onclick="ciSel(this)">Mild</span>
          <span class="ci-opt" data-v="7" onclick="ciSel(this)">Sore</span>
          <span class="ci-opt" data-v="9" onclick="ciSel(this)">Very</span>
        </div>
      </div>
      <div class="ci-row">
        <div class="ci-field"><label>Drinks 🍺</label><input type="number" id="ciAlcohol" min="0" max="20" placeholder="0" /></div>
        <div class="ci-field"><label>Caffeine mg</label><input type="number" id="ciCaffeine" min="0" max="1000" placeholder="0" /></div>
        <div class="ci-field"><label>Water L</label><input type="number" id="ciHydration" min="0" max="10" step="0.5" placeholder="0" /></div>
      </div>
      <div class="ci-toggles">
        <label class="ci-toggle"><input type="checkbox" id="ciLateMeal" /><span>Late meal</span></label>
        <label class="ci-toggle"><input type="checkbox" id="ciScreen" /><span>Screen before bed</span></label>
        <label class="ci-toggle"><input type="checkbox" id="ciIllness" /><span>Feeling ill</span></label>
      </div>
      <div class="ci-q"><label>Note</label><input type="text" id="ciNote" placeholder="Anything else…" style="width:100%;box-sizing:border-box;" /></div>
      <div class="ci-actions">
        <button class="ci-cancel" onclick="closeCheckin()">Cancel</button>
        <button class="ci-save" onclick="saveCheckin()">Save</button>
      </div>
    </div>
  </div>

  <div class="wl-overlay" id="wlOverlay" onclick="if(event.target===this)closeWorkoutLogger()">
    <div class="wl-sheet">
      <h3 id="wlTitle">Log workout</h3>
      <div id="wlTemplateBar" style="display:none;margin-bottom:10px;">
        <select id="wlTemplateSel" onchange="wlApplyTemplate(this.value)" style="width:100%;background:var(--void);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px 10px;font-size:13px;">
          <option value="">Start from template…</option>
        </select>
      </div>
      <div class="wl-row">
        <input type="date" id="wlDate" />
        <input type="text" id="wlType" placeholder="Workout type (e.g. Gym, Push, Legs)" style="flex:1" />
      </div>
      <div class="wl-row">
        <input type="number" id="wlDuration" placeholder="Duration (min)" style="flex:1" min="0" />
      </div>
      <div id="wlExercises"></div>
      <button class="wl-add-ex" id="wlAddExBtn" onclick="wlShowExercisePicker()">+ Add exercise</button>
      <div id="wlExPicker" style="display:none;margin-bottom:12px;">
        <div class="wl-ac">
          <input type="text" id="wlExSearch" placeholder="Search exercises…" oninput="wlSearchExercises()" onfocus="wlSearchExercises()" autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--void);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px 10px;font-size:14px;" />
          <div class="wl-ac-list" id="wlAcList"></div>
        </div>
      </div>
      <div id="wlMuscleMapLive" style="margin-bottom:12px;">${renderMuscleMap()}</div>
      <div class="wl-link-section" id="wlLinkSection" style="display:none">
        <h4>Link to Apple Watch session</h4>
        <div id="wlLinkList"></div>
      </div>
      <div class="wl-row"><textarea id="wlNotes" placeholder="Notes (optional)" rows="2" style="flex:1;background:var(--void);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px 10px;font-family:inherit;font-size:14px;resize:vertical;"></textarea></div>
      <div class="wl-actions">
        <button class="wl-cancel" onclick="closeWorkoutLogger()">Cancel</button>
        <button class="wl-save" id="wlSaveBtn" onclick="saveWorkout()">Save workout</button>
      </div>
    </div>
  </div>

  <div class="wl-overlay" id="tmplOverlay" onclick="if(event.target===this)closeTemplateEditor()">
    <div class="wl-sheet">
      <h3 id="tmplTitle">New template</h3>
      <div class="wl-row">
        <input type="text" id="tmplName" placeholder="Template name (e.g. Push Day)" style="flex:1" />
        <input type="text" id="tmplType" placeholder="Type (e.g. Gym)" style="width:100px" />
      </div>
      <div id="tmplExercises"></div>
      <button class="wl-add-ex" onclick="tmplShowExPicker()">+ Add exercise</button>
      <div id="tmplExPicker" style="display:none;margin-bottom:12px;">
        <div class="wl-ac">
          <input type="text" id="tmplExSearch" placeholder="Search exercises…" oninput="tmplSearchExercises()" onfocus="tmplSearchExercises()" autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--void);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px 10px;font-size:14px;" />
          <div class="wl-ac-list" id="tmplAcList"></div>
        </div>
      </div>
      <div class="wl-row"><textarea id="tmplNotes" placeholder="Notes (optional)" rows="2" style="flex:1;background:var(--void);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:8px 10px;font-family:inherit;font-size:14px;resize:vertical;"></textarea></div>
      <div class="wl-actions">
        <button class="wl-cancel" onclick="closeTemplateEditor()">Cancel</button>
        <button class="wl-save" id="tmplSaveBtn" onclick="saveTemplate()">Save template</button>
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
var MUSCLE_MAP_SVG = \`${renderMuscleMap()}\`;
var BODY_FRONT_SVG = \`${renderFrontBody()}\`;
var BODY_BACK_SVG = \`${renderBackBody()}\`;
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

// ---- workout logger ----
var EXERCISES = ${JSON.stringify(EXERCISE_LIBRARY.map(e => ({ n: e.name, c: e.category, p: e.primary, s: e.secondary })))};
var WL_WORKOUTS = [];
var WL_EDIT_ID = null;
var WL_EXERCISES = []; // current form state: [{name, sets:[{reps,weightKg}], primary, secondary}]
var WL_LINKED = null;

function wlSearchLib(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  var starts = [], contains = [];
  EXERCISES.forEach(function (ex) {
    var n = ex.n.toLowerCase();
    if (n.startsWith(q)) starts.push(ex);
    else if (n.includes(q)) contains.push(ex);
  });
  return starts.concat(contains).slice(0, 8);
}

async function loadWorkouts() {
  try {
    var res = await authedFetch('/api/workouts');
    WL_WORKOUTS = res.workouts || [];
    renderWorkoutHistory();
    renderMuscleOverview();
  } catch (e) {}
}

function renderMuscleOverview() {
  var el = document.getElementById('wlMuscleOverview');
  if (!el) return;
  var muscles = {};
  WL_WORKOUTS.slice(0, 20).forEach(function (w) {
    w.exercises.forEach(function (ex) {
      var lib = EXERCISES.find(function (e) { return e.n.toLowerCase() === ex.name.toLowerCase(); });
      if (lib) {
        lib.p.forEach(function (m) { muscles[m] = (muscles[m] || 0) + 2; });
        lib.s.forEach(function (m) { muscles[m] = (muscles[m] || 0) + 1; });
      }
    });
  });
  var regions = el.querySelectorAll('.muscle-region');
  regions.forEach(function (r) {
    var m = r.getAttribute('data-muscle');
    r.classList.remove('lit', 'lit-secondary');
    if (muscles[m] >= 4) r.classList.add('lit');
    else if (muscles[m] >= 1) r.classList.add('lit-secondary');
  });
}

function renderWorkoutHistory() {
  var el = document.getElementById('wlHistory');
  if (!el) return;
  if (WL_WORKOUTS.length === 0) {
    el.innerHTML = '<div class="wl-empty"><p>No workouts logged yet.</p><p style="font-size:12px">Tap <strong>Log workout</strong> to record your first session.</p></div>';
    return;
  }
  el.innerHTML = WL_WORKOUTS.map(function (w) {
    var totalSets = 0, totalVol = 0, exNames = [];
    w.exercises.forEach(function (ex) {
      exNames.push(ex.name);
      ex.sets.forEach(function (s) { totalSets++; totalVol += (s.reps || 0) * (s.weightKg || 0); });
    });
    var stats = '<div class="wl-hc-stats">';
    stats += '<div class="wl-hc-stat"><strong>' + w.exercises.length + '</strong> exercises</div>';
    stats += '<div class="wl-hc-stat"><strong>' + totalSets + '</strong> sets</div>';
    if (totalVol > 0) stats += '<div class="wl-hc-stat"><strong>' + Math.round(totalVol).toLocaleString() + '</strong> kg vol</div>';
    if (w.durationMin) stats += '<div class="wl-hc-stat"><strong>' + w.durationMin + '</strong> min</div>';
    stats += '</div>';
    var linked = w.linkedSession ? '<div class="wl-hc-linked"><span style="font-size:14px">\\u2713</span> Linked to Apple Watch</div>' : '';
    return '<div class="wl-history-card" onclick="showWorkoutDetail(\\''+w.id+'\\')">' +
      '<div class="wl-hc-top"><div class="wl-hc-type">' + (w.type || 'Workout') + '</div><div class="wl-hc-date">' + niceDate(w.date) + '</div></div>' +
      stats +
      '<div class="wl-hc-exercises">' + exNames.join(' \\u00B7 ') + '</div>' +
      '<div class="wl-hc-bottom">' + linked + '</div>' +
      '</div>';
  }).join('');
}

function showWorkoutDetail(id) {
  var w = WL_WORKOUTS.find(function (x) { return x.id === id; });
  if (!w) return;
  var el = document.getElementById('wlHistory');
  var html = '<div class="wl-detail"><h4>' + (w.type || 'Workout') + '</h4>';
  html += '<div class="wl-d-meta">' + niceDate(w.date) + (w.durationMin ? ' \\u00B7 ' + w.durationMin + ' min' : '') + (w.notes ? ' \\u00B7 ' + w.notes : '') + '</div>';
  w.exercises.forEach(function (ex) {
    html += '<div class="wl-detail-ex"><h5>' + ex.name + '</h5>';
    html += '<div class="wl-detail-sets"><div class="ds-head">Set</div><div class="ds-head">Reps</div><div class="ds-head">Weight</div>';
    ex.sets.forEach(function (s, i) {
      html += '<div class="ds-num">' + (i + 1) + '</div>';
      html += '<div class="ds-val">' + (s.reps || '—') + '</div>';
      html += '<div class="ds-val">' + (s.weightKg ? s.weightKg + ' kg' : '—') + '</div>';
    });
    html += '</div></div>';
  });
  if (w.linkedSession) html += '<div class="wl-hc-linked" style="margin-top:8px"><span>\\u2713</span> Linked: ' + w.linkedSession.type + '</div>';
  html += '<div class="wl-detail-actions"><button class="wl-edit" onclick="editWorkout(\\''+id+'\\')">Edit</button><button class="wl-del" onclick="deleteWorkout(\\''+id+'\\')">Delete</button><button style="background:var(--void);color:var(--dim);border:1px solid var(--line);padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600" onclick="renderWorkoutHistory()">Back</button></div>';
  html += '</div>';
  el.innerHTML = html;
}

function openWorkoutLogger(editId) {
  WL_EDIT_ID = editId || null;
  WL_EXERCISES = [];
  WL_LINKED = null;
  var dateEl = document.getElementById('wlDate');
  var typeEl = document.getElementById('wlType');
  var durEl = document.getElementById('wlDuration');
  var notesEl = document.getElementById('wlNotes');
  document.getElementById('wlTitle').textContent = editId ? 'Edit workout' : 'Log workout';

  if (editId) {
    var w = WL_WORKOUTS.find(function (x) { return x.id === editId; });
    if (w) {
      dateEl.value = w.date;
      typeEl.value = w.type || '';
      durEl.value = w.durationMin || '';
      notesEl.value = w.notes || '';
      WL_LINKED = w.linkedSession || null;
      w.exercises.forEach(function (ex) {
        var lib = EXERCISES.find(function (e) { return e.n.toLowerCase() === ex.name.toLowerCase(); });
        WL_EXERCISES.push({ name: ex.name, sets: ex.sets.map(function (s) { return { reps: s.reps || 0, weightKg: s.weightKg || 0 }; }), primary: lib ? lib.p : [], secondary: lib ? lib.s : [] });
      });
    }
  } else {
    dateEl.value = new Date().toISOString().slice(0, 10);
    typeEl.value = '';
    durEl.value = '';
    notesEl.value = '';
  }
  wlRenderExercises();
  wlHighlightMuscles();
  wlLoadAppleSessions();
  document.getElementById('wlOverlay').classList.add('open');
  document.getElementById('wlExPicker').style.display = 'none';
}

function closeWorkoutLogger() {
  document.getElementById('wlOverlay').classList.remove('open');
  WL_EXERCISES = [];
  WL_EDIT_ID = null;
  WL_LINKED = null;
}

function wlShowExercisePicker() {
  var picker = document.getElementById('wlExPicker');
  picker.style.display = 'block';
  var input = document.getElementById('wlExSearch');
  input.value = '';
  input.focus();
  wlSearchExercises();
}

function wlSearchExercises() {
  var q = document.getElementById('wlExSearch').value;
  var results = wlSearchLib(q);
  var list = document.getElementById('wlAcList');
  if (results.length === 0 && !q.trim()) {
    list.innerHTML = EXERCISES.slice(0, 10).map(function (ex) {
      return '<div class="wl-ac-item" onclick="wlPickExercise(\\''+ex.n.replace(/'/g,"\\\\'")+'\\')"><span>'+ex.n+'</span><span class="wl-ac-cat">'+ex.c+'</span></div>';
    }).join('');
    list.classList.add('show');
    return;
  }
  if (results.length === 0) {
    list.innerHTML = '<div class="wl-ac-item" onclick="wlAddCustomExercise()"><span>Add "' + q + '" as custom</span></div>';
    list.classList.add('show');
    return;
  }
  list.innerHTML = results.map(function (ex) {
    return '<div class="wl-ac-item" onclick="wlPickExercise(\\''+ex.n.replace(/'/g,"\\\\'")+'\\')"><span>'+ex.n+'</span><span class="wl-ac-cat">'+ex.c+'</span></div>';
  }).join('');
  list.classList.add('show');
}

function wlPickExercise(name) {
  var lib = EXERCISES.find(function (e) { return e.n === name; });
  WL_EXERCISES.push({ name: name, sets: [{ reps: 0, weightKg: 0 }], primary: lib ? lib.p : [], secondary: lib ? lib.s : [] });
  document.getElementById('wlExPicker').style.display = 'none';
  document.getElementById('wlAcList').classList.remove('show');
  wlRenderExercises();
  wlHighlightMuscles();
}

function wlAddCustomExercise() {
  var name = document.getElementById('wlExSearch').value.trim();
  if (!name) return;
  WL_EXERCISES.push({ name: name, sets: [{ reps: 0, weightKg: 0 }], primary: [], secondary: [] });
  document.getElementById('wlExPicker').style.display = 'none';
  document.getElementById('wlAcList').classList.remove('show');
  wlRenderExercises();
  wlHighlightMuscles();
}

function wlRenderExercises() {
  var el = document.getElementById('wlExercises');
  el.innerHTML = WL_EXERCISES.map(function (ex, ei) {
    var muscles = ex.primary.concat(ex.secondary).join(', ');
    var html = '<div class="wl-exercise">';
    html += '<button class="wl-ex-rm" onclick="wlRemoveExercise('+ei+')">&times;</button>';
    html += '<div class="wl-ex-head"><div class="wl-ex-name">'+ex.name+'</div>';
    if (muscles) html += '<div class="wl-ex-muscles">'+muscles+'</div>';
    html += '</div>';
    html += '<div class="wl-sets-head"><div>Set</div><div>Reps</div><div>Weight (kg)</div><div></div></div>';
    ex.sets.forEach(function (s, si) {
      html += '<div class="wl-set-row">';
      html += '<div class="set-num">'+(si+1)+'</div>';
      html += '<input type="number" min="0" value="'+(s.reps||'')+'" onchange="wlUpdateSet('+ei+','+si+',\\'reps\\',this.value)" placeholder="0" />';
      html += '<input type="number" min="0" step="0.5" value="'+(s.weightKg||'')+'" onchange="wlUpdateSet('+ei+','+si+',\\'weightKg\\',this.value)" placeholder="0" />';
      html += '<button class="set-rm" onclick="wlRemoveSet('+ei+','+si+')">&times;</button>';
      html += '</div>';
    });
    html += '<button class="wl-add-set" onclick="wlAddSet('+ei+')">+ Add set</button>';
    html += '</div>';
    return html;
  }).join('');
}

function wlRemoveExercise(ei) { WL_EXERCISES.splice(ei, 1); wlRenderExercises(); wlHighlightMuscles(); }
function wlAddSet(ei) { WL_EXERCISES[ei].sets.push({ reps: 0, weightKg: 0 }); wlRenderExercises(); }
function wlRemoveSet(ei, si) { if (WL_EXERCISES[ei].sets.length > 1) { WL_EXERCISES[ei].sets.splice(si, 1); wlRenderExercises(); } }
function wlUpdateSet(ei, si, field, val) { WL_EXERCISES[ei].sets[si][field] = parseFloat(val) || 0; }

function wlHighlightMuscles() {
  var container = document.getElementById('wlMuscleMapLive');
  if (!container) return;
  var primary = {}, secondary = {};
  WL_EXERCISES.forEach(function (ex) {
    (ex.primary || []).forEach(function (m) { primary[m] = true; });
    (ex.secondary || []).forEach(function (m) { if (!primary[m]) secondary[m] = true; });
  });
  container.querySelectorAll('.muscle-region').forEach(function (r) {
    var m = r.getAttribute('data-muscle');
    r.classList.remove('lit', 'lit-secondary');
    if (primary[m]) r.classList.add('lit');
    else if (secondary[m]) r.classList.add('lit-secondary');
  });
}

async function wlLoadAppleSessions() {
  var date = document.getElementById('wlDate').value;
  if (!date) return;
  var section = document.getElementById('wlLinkSection');
  var list = document.getElementById('wlLinkList');
  try {
    var day = GUIDE_DAYS.find(function (d) { return d.date === date; });
    if (day && day.workoutType) {
      section.style.display = 'block';
      var types = (day.workoutType || '').split(',');
      list.innerHTML = types.map(function (t) {
        t = t.trim();
        var sel = WL_LINKED && WL_LINKED.type === t ? ' selected' : '';
        return '<div class="wl-link-item' + sel + '" onclick="wlToggleLink(\\''+t.replace(/'/g,"\\\\'")+'\\',\\''+date+'\\')">' +
          '<span>' + workoutName(t) + '</span>' +
          '<span class="wl-li-meta">' + (day.workoutMinutes ? Math.round(day.workoutMinutes) + ' min' : '') +
          (day.workoutEnergy ? ' \\u00B7 ' + Math.round(day.workoutEnergy) + ' kcal' : '') + '</span></div>';
      }).join('');
    } else {
      section.style.display = 'none';
    }
  } catch (e) { section.style.display = 'none'; }
}

function wlToggleLink(type, date) {
  if (WL_LINKED && WL_LINKED.type === type) { WL_LINKED = null; }
  else { WL_LINKED = { type: type, startTime: date + 'T00:00:00Z' }; }
  wlLoadAppleSessions();
}

async function saveWorkout() {
  var date = document.getElementById('wlDate').value;
  var type = document.getElementById('wlType').value.trim();
  var durationMin = parseInt(document.getElementById('wlDuration').value) || undefined;
  var notes = document.getElementById('wlNotes').value.trim() || undefined;
  if (!date || !type || WL_EXERCISES.length === 0) { alert('Date, type and at least one exercise are required.'); return; }
  var body = {
    date: date,
    type: type,
    durationMin: durationMin,
    notes: notes,
    exercises: WL_EXERCISES.map(function (ex) {
      return { name: ex.name, sets: ex.sets.filter(function (s) { return s.reps > 0 || s.weightKg > 0; }).map(function (s) { return { reps: s.reps || undefined, weightKg: s.weightKg || undefined }; }) };
    }),
    linkedSession: WL_LINKED || undefined,
  };
  if (WL_EDIT_ID) body.id = WL_EDIT_ID;
  document.getElementById('wlSaveBtn').disabled = true;
  document.getElementById('wlSaveBtn').textContent = 'Saving…';
  try {
    await authedFetch('/api/workouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    closeWorkoutLogger();
    showToast('🏋️ Workout saved!', 'success');
    await loadWorkouts();
  } catch (e) {
    alert('Failed to save: ' + e.message);
  } finally {
    document.getElementById('wlSaveBtn').disabled = false;
    document.getElementById('wlSaveBtn').textContent = 'Save workout';
  }
}

function editWorkout(id) { closeWorkoutLogger(); setTimeout(function () { openWorkoutLogger(id); }, 100); }

async function deleteWorkout(id) {
  if (!confirm('Delete this workout?')) return;
  try {
    await authedFetch('/api/workouts?id=' + id, { method: 'DELETE' });
    await loadWorkouts();
  } catch (e) { alert('Failed to delete: ' + e.message); }
}

document.addEventListener('click', function (e) {
  var acList = document.getElementById('wlAcList');
  if (acList && !e.target.closest('.wl-ac')) acList.classList.remove('show');
  var tmplAc = document.getElementById('tmplAcList');
  if (tmplAc && !e.target.closest('.wl-ac')) tmplAc.classList.remove('show');
});
document.addEventListener('change', function (e) {
  if (e.target && e.target.id === 'wlDate') wlLoadAppleSessions();
});

// ---- Workout templates ----
var TMPL_LIST = [];
var TMPL_EXERCISES = [];
var TMPL_EDIT_ID = null;

async function loadTemplates() {
  try {
    var res = await authedFetch('/api/workout-templates');
    TMPL_LIST = res.templates || [];
    renderTemplateGrid();
    populateTemplateSelector();
    loadUnloggedPrompts();
  } catch (e) {}
}

function renderTemplateGrid() {
  var el = document.getElementById('tmplGrid');
  if (!el) return;
  if (TMPL_LIST.length === 0) {
    el.innerHTML = '<div class="tmpl-empty">No templates yet. Create one to speed up logging.</div>';
    return;
  }
  el.innerHTML = TMPL_LIST.map(function (t) {
    var exNames = t.exercises.map(function (e) { return e.name; }).join(' \\u00B7 ');
    var meta = t.exercises.length + ' exercises';
    if (t.useCount > 0) meta += ' \\u00B7 used ' + t.useCount + 'x';
    if (t.lastUsed) meta += ' \\u00B7 last ' + niceDate(t.lastUsed);
    return '<div class="tmpl-card">' +
      '<div class="tmpl-info">' +
        '<div class="tmpl-name">' + t.name + '</div>' +
        '<div class="tmpl-meta">' + t.type + ' \\u00B7 ' + meta + '</div>' +
        '<div style="font-size:12px;color:var(--faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + exNames + '</div>' +
      '</div>' +
      '<div class="tmpl-actions">' +
        '<button class="tmpl-use" onclick="event.stopPropagation();startFromTemplate(\\''+t.id+'\\')">Use</button>' +
        '<button class="tmpl-edit" onclick="event.stopPropagation();editTemplate(\\''+t.id+'\\')">Edit</button>' +
        '<button class="tmpl-del" onclick="event.stopPropagation();deleteTemplate(\\''+t.id+'\\')">\\u00D7</button>' +
      '</div></div>';
  }).join('');
}

function populateTemplateSelector() {
  var sel = document.getElementById('wlTemplateSel');
  if (!sel) return;
  var bar = document.getElementById('wlTemplateBar');
  if (TMPL_LIST.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  sel.innerHTML = '<option value="">Start from template\\u2026</option>' +
    TMPL_LIST.map(function (t) { return '<option value="'+t.id+'">' + t.name + ' (' + t.exercises.length + ' ex)</option>'; }).join('');
}

async function startFromTemplate(id) {
  try {
    var res = await authedFetch('/api/workout-templates/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
    if (!res.ok) return;
    var tmpl = res.template;
    openWorkoutLogger();
    document.getElementById('wlType').value = tmpl.type || '';
    WL_EXERCISES = res.exercises.map(function (ex) {
      var lib = EXERCISES.find(function (e) { return e.n.toLowerCase() === ex.name.toLowerCase(); });
      return { name: ex.name, sets: ex.sets.map(function (s) { return { reps: s.reps || 0, weightKg: s.weightKg || 0 }; }), primary: lib ? lib.p : [], secondary: lib ? lib.s : [] };
    });
    wlRenderExercises();
    wlHighlightMuscles();
    loadTemplates();
  } catch (e) { alert('Failed: ' + e.message); }
}

function wlApplyTemplate(id) {
  if (!id) return;
  startFromTemplate(id);
  document.getElementById('wlTemplateSel').value = '';
}

function openTemplateEditor(editId) {
  TMPL_EDIT_ID = editId || null;
  TMPL_EXERCISES = [];
  document.getElementById('tmplTitle').textContent = editId ? 'Edit template' : 'New template';
  var nameEl = document.getElementById('tmplName');
  var typeEl = document.getElementById('tmplType');
  var notesEl = document.getElementById('tmplNotes');
  if (editId) {
    var t = TMPL_LIST.find(function (x) { return x.id === editId; });
    if (t) {
      nameEl.value = t.name;
      typeEl.value = t.type;
      notesEl.value = t.notes || '';
      TMPL_EXERCISES = t.exercises.map(function (e) { return { name: e.name, defaultSets: e.defaultSets, defaultReps: e.defaultReps, defaultWeightKg: e.defaultWeightKg || 0 }; });
    }
  } else {
    nameEl.value = '';
    typeEl.value = '';
    notesEl.value = '';
  }
  tmplRenderExercises();
  document.getElementById('tmplOverlay').classList.add('open');
  document.getElementById('tmplExPicker').style.display = 'none';
}
function closeTemplateEditor() { document.getElementById('tmplOverlay').classList.remove('open'); TMPL_EXERCISES = []; TMPL_EDIT_ID = null; }
function editTemplate(id) { openTemplateEditor(id); }
async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  try { await authedFetch('/api/workout-templates?id=' + id, { method: 'DELETE' }); await loadTemplates(); } catch (e) { alert('Failed: ' + e.message); }
}

function tmplRenderExercises() {
  var el = document.getElementById('tmplExercises');
  el.innerHTML = TMPL_EXERCISES.map(function (ex, i) {
    return '<div class="wl-exercise">' +
      '<button class="wl-ex-rm" onclick="tmplRemoveEx('+i+')">&times;</button>' +
      '<div class="wl-ex-head"><div class="wl-ex-name">' + ex.name + '</div></div>' +
      '<div class="wl-sets-head"><div>Sets</div><div>Reps</div><div>Weight (kg)</div></div>' +
      '<div class="wl-set-row">' +
        '<input type="number" min="1" max="20" value="'+(ex.defaultSets||3)+'" onchange="tmplUpdateEx('+i+',\\'defaultSets\\',this.value)" />' +
        '<input type="number" min="1" max="100" value="'+(ex.defaultReps||10)+'" onchange="tmplUpdateEx('+i+',\\'defaultReps\\',this.value)" />' +
        '<input type="number" min="0" step="0.5" value="'+(ex.defaultWeightKg||'')+'" onchange="tmplUpdateEx('+i+',\\'defaultWeightKg\\',this.value)" placeholder="opt" />' +
      '</div></div>';
  }).join('');
}

function tmplRemoveEx(i) { TMPL_EXERCISES.splice(i, 1); tmplRenderExercises(); }
function tmplUpdateEx(i, field, val) { TMPL_EXERCISES[i][field] = parseFloat(val) || 0; }

function tmplShowExPicker() {
  document.getElementById('tmplExPicker').style.display = 'block';
  var input = document.getElementById('tmplExSearch');
  input.value = '';
  input.focus();
  tmplSearchExercises();
}

function tmplSearchExercises() {
  var q = document.getElementById('tmplExSearch').value;
  var results = wlSearchLib(q);
  var list = document.getElementById('tmplAcList');
  if (results.length === 0 && !q.trim()) {
    list.innerHTML = EXERCISES.slice(0, 10).map(function (ex) {
      return '<div class="wl-ac-item" onclick="tmplPickEx(\\''+ex.n.replace(/'/g,"\\\\'")+'\\')"><span>'+ex.n+'</span><span class="wl-ac-cat">'+ex.c+'</span></div>';
    }).join('');
    list.classList.add('show');
    return;
  }
  if (results.length === 0) {
    list.innerHTML = '<div class="wl-ac-item" onclick="tmplAddCustomEx()"><span>Add "'+q+'" as custom</span></div>';
    list.classList.add('show');
    return;
  }
  list.innerHTML = results.map(function (ex) {
    return '<div class="wl-ac-item" onclick="tmplPickEx(\\''+ex.n.replace(/'/g,"\\\\'")+'\\')"><span>'+ex.n+'</span><span class="wl-ac-cat">'+ex.c+'</span></div>';
  }).join('');
  list.classList.add('show');
}

function tmplPickEx(name) {
  TMPL_EXERCISES.push({ name: name, defaultSets: 3, defaultReps: 10, defaultWeightKg: 0 });
  document.getElementById('tmplExPicker').style.display = 'none';
  document.getElementById('tmplAcList').classList.remove('show');
  tmplRenderExercises();
}
function tmplAddCustomEx() {
  var name = document.getElementById('tmplExSearch').value.trim();
  if (!name) return;
  TMPL_EXERCISES.push({ name: name, defaultSets: 3, defaultReps: 10, defaultWeightKg: 0 });
  document.getElementById('tmplExPicker').style.display = 'none';
  document.getElementById('tmplAcList').classList.remove('show');
  tmplRenderExercises();
}

async function saveTemplate() {
  var name = document.getElementById('tmplName').value.trim();
  var type = document.getElementById('tmplType').value.trim();
  var notes = document.getElementById('tmplNotes').value.trim() || undefined;
  if (!name || !type || TMPL_EXERCISES.length === 0) { alert('Name, type, and at least one exercise are required.'); return; }
  var body = { name: name, type: type, notes: notes, exercises: TMPL_EXERCISES };
  if (TMPL_EDIT_ID) body.id = TMPL_EDIT_ID;
  document.getElementById('tmplSaveBtn').disabled = true;
  document.getElementById('tmplSaveBtn').textContent = 'Saving\\u2026';
  try {
    await authedFetch('/api/workout-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    closeTemplateEditor();
    await loadTemplates();
  } catch (e) {
    alert('Failed: ' + e.message);
  } finally {
    document.getElementById('tmplSaveBtn').disabled = false;
    document.getElementById('tmplSaveBtn').textContent = 'Save template';
  }
}

// ---- Unlogged workout prompts ----
var DISMISSED_UNLOGGED = {};
try { DISMISSED_UNLOGGED = JSON.parse(localStorage.getItem('dismissedUnlogged') || '{}'); } catch (e) {}

async function loadUnloggedPrompts() {
  try {
    var res = await authedFetch('/api/workouts/unlogged');
    var unlogged = (res.unlogged || []).filter(function (u) { return !DISMISSED_UNLOGGED[u.date]; });
    renderUnloggedPrompts(unlogged);
  } catch (e) {}
}

function renderUnloggedPrompts(unlogged) {
  var el = document.getElementById('unloggedPrompts');
  if (!el) return;
  if (unlogged.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = unlogged.map(function (u) {
    var detail = '';
    if (u.durationMin) detail += u.durationMin + ' min';
    if (u.activeEnergy) detail += (detail ? ' \\u00B7 ' : '') + u.activeEnergy + ' kcal';
    var templateBtns = '';
    if (TMPL_LIST && TMPL_LIST.length > 0) {
      templateBtns = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">' +
        TMPL_LIST.slice(0, 4).map(function(t) {
          return '<button class="unlogged-dismiss" style="border-color:var(--pulse);color:var(--pulse);font-weight:600;" onclick="logUnloggedFromTemplate(' + "'" + u.date + "'" + ',' + "'" + t.id + "'" + ')">' + t.name + '</button>';
        }).join('') +
      '</div>';
    }
    return '<div class="unlogged-card">' +
      '<div class="unlogged-head"><span class="unlogged-icon">\\uD83C\\uDFCB\\uFE0F</span><span class="unlogged-title">Strength session detected</span></div>' +
      '<div class="unlogged-body">' + niceDate(u.date) + (detail ? ' \\u00B7 ' + detail : '') + '<br>What exercises did you do? Log it to track your progress.</div>' +
      '<div class="unlogged-actions">' +
        '<button class="unlogged-log" onclick="logUnloggedWorkout(' + "'" + u.date + "'" + ',' + "'" + u.workoutType + "'" + ')">Log workout</button>' +
        '<button class="unlogged-dismiss" onclick="dismissUnlogged(' + "'" + u.date + "'" + ')">Dismiss</button>' +
      '</div>' +
      templateBtns +
    '</div>';
  }).join('');
}

function logUnloggedWorkout(date, workoutType) {
  openWorkoutLogger();
  document.getElementById('wlDate').value = date;
  var typeName = workoutName(workoutType.split(',')[0].trim());
  document.getElementById('wlType').value = typeName || 'Strength';
  wlLoadAppleSessions();
  dismissUnlogged(date);
}

function logUnloggedFromTemplate(date, templateId) {
  startFromTemplate(templateId);
  setTimeout(function() {
    document.getElementById('wlDate').value = date;
  }, 200);
  dismissUnlogged(date);
}

function dismissUnlogged(date) {
  DISMISSED_UNLOGGED[date] = true;
  try { localStorage.setItem('dismissedUnlogged', JSON.stringify(DISMISSED_UNLOGGED)); } catch (e) {}
  loadUnloggedPrompts();
}

// ---- Progression & premium training features ----

async function loadProgression() {
  try {
    var res = await authedFetch('/api/progression');
    renderExercise1RMs(res.exercise1RMs || []);
    renderMuscleRecovery(res.muscleRecovery || []);
    renderSessionPrescription(res.prescription);
    renderPeriodization(res.periodization);
    renderMomentum(res.momentum || []);
  } catch (e) {}
}

function renderExercise1RMs(items) {
  var card = document.getElementById('e1rmCard');
  var el = document.getElementById('e1rmGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (e) {
    var delta = e.previous1RM ? e.current1RM - e.previous1RM : 0;
    var deltaStr = delta > 0 ? '+' + delta.toFixed(1) : delta < 0 ? delta.toFixed(1) : '—';
    var sparkSvg = '';
    if (e.history && e.history.length >= 2) {
      var vals = e.history.map(function (h) { return h.e1rm; });
      var minV = Math.min.apply(null, vals);
      var maxV = Math.max.apply(null, vals);
      var range = maxV - minV || 1;
      var pts = vals.map(function (v, i) { return (i / (vals.length - 1)) * 78 + 1 + ',' + (26 - ((v - minV) / range) * 24 + 1); }).join(' ');
      var color = e.trend === 'improving' ? 'var(--up)' : e.trend === 'declining' ? 'var(--down)' : 'var(--dim)';
      sparkSvg = '<svg class="e1rm-chart" viewBox="0 0 80 28"><polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<div class="e1rm-card">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="e1rm-name">' + e.exercise + '</div>' +
        '<div class="e1rm-trend ' + e.trend + '">' + e.trend + (e.weeksAtPlateau ? ' \\u00B7 ' + e.weeksAtPlateau + 'w' : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div class="e1rm-val">' + e.current1RM.toFixed(1) + '<span style="font-size:12px;font-weight:400;color:var(--dim);"> kg</span></div>' +
        '<div class="e1rm-delta">' + deltaStr + '</div>' +
      '</div>' +
      sparkSvg +
    '</div>';
  }).join('');
}

function renderMuscleRecovery(items) {
  var card = document.getElementById('muscleRecoveryCard');
  var el = document.getElementById('muscleRecoveryGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (m) {
    return '<div class="mr-cell ' + m.status + '">' +
      '<div class="mr-label">' + m.muscle.replace('_', ' ') + '</div>' +
      '<div class="mr-pct">' + m.recoveryPct + '%</div>' +
      '<div class="mr-status ' + m.status + '">' + m.status + '</div>' +
    '</div>';
  }).join('');
}

function renderSessionPrescription(rx) {
  var card = document.getElementById('sessionRxCard');
  var el = document.getElementById('sessionRx');
  if (!el || !rx) return;
  card.style.display = 'block';
  var html = '<div class="rx-card">';
  html += '<div class="rx-title">' + rx.title + '</div>';
  html += '<div class="rx-reasoning">' + rx.reasoning + '</div>';
  html += '<div class="rx-details">';
  if (rx.durationMin) html += '<span class="rx-tag">' + rx.durationMin + ' min</span>';
  html += '<span class="rx-tag">' + rx.intensityZone + ' intensity</span>';
  if (rx.targetMuscles && rx.targetMuscles.length) html += '<span class="rx-tag">Target: ' + rx.targetMuscles.map(function (m) { return m.replace('_', ' '); }).join(', ') + '</span>';
  html += '</div>';
  if (rx.exercises && rx.exercises.length) {
    html += '<div class="rx-exercises">';
    rx.exercises.forEach(function (ex) {
      html += '<div class="rx-ex"><strong>' + ex.name + '</strong> — ' + ex.sets + ' sets \\u00D7 ' + ex.reps + ' reps' + (ex.notes ? ' <span style="color:var(--dim)">(' + ex.notes + ')</span>' : '') + '</div>';
    });
    html += '</div>';
  }
  if (rx.type !== 'rest') {
    if (rx.suggestedTemplate) {
      html += '<button class="rx-start" onclick="startFromTemplate(\\''+rx.suggestedTemplate.id+'\\')">Start from ' + rx.suggestedTemplate.name + '</button>';
    } else {
      html += '<button class="rx-start" onclick="openWorkoutLogger()">Log this workout</button>';
    }
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderPeriodization(data) {
  var card = document.getElementById('periodCard');
  var el = document.getElementById('periodViz');
  if (!el || !data || !data.blocks || data.blocks.length < 3) return;
  card.style.display = 'block';
  var maxVol = Math.max.apply(null, data.blocks.map(function (b) { return b.totalVolume; })) || 1;
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<span class="period-phase" style="color:' + phaseColor(data.currentPhase) + ';">' + data.currentPhase + '</span>';
  html += '<span style="font-size:12px;color:var(--dim);">Week ' + data.weeksInPhase + '</span>';
  html += '</div>';
  html += '<div class="period-blocks">';
  data.blocks.slice(-12).forEach(function (b) {
    var pct = (b.totalVolume / maxVol) * 100;
    html += '<div class="period-bar ' + b.phase + '" style="height:' + Math.max(4, pct) + '%" title="' + b.weekStart + ': ' + Math.round(b.totalVolume) + 'kg · ' + b.totalSessions + ' sessions"></div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:12px;font-size:11px;color:var(--dim);margin-top:6px;">';
  html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--up);vertical-align:middle;margin-right:3px;"></span>Build</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--pulse);vertical-align:middle;margin-right:3px;"></span>Peak</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--caution);vertical-align:middle;margin-right:3px;"></span>Deload</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--dim)44;vertical-align:middle;margin-right:3px;"></span>Base</span>';
  html += '</div>';
  if (data.suggestion) html += '<div style="font-size:13px;color:var(--dim);margin-top:10px;line-height:1.5;">' + data.suggestion + '</div>';
  if (data.needsDeload) html += '<div style="font-size:13px;color:var(--caution);font-weight:600;margin-top:6px;">\\u26A0\\uFE0F ' + (data.deloadReason || 'Deload recommended') + '</div>';
  el.innerHTML = html;
}

function phaseColor(phase) {
  return phase === 'build' ? 'var(--up)' : phase === 'peak' ? 'var(--pulse)' : phase === 'deload' ? 'var(--caution)' : 'var(--dim)';
}

function renderMomentum(items) {
  var card = document.getElementById('momentumCard');
  var el = document.getElementById('momentumList');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  var icons = { positive: '\\u2B06\\uFE0F', warning: '\\u26A0\\uFE0F', info: '\\u2139\\uFE0F' };
  el.innerHTML = items.map(function (a) {
    return '<div class="momentum-item ' + a.severity + '">' +
      '<span class="momentum-icon">' + (icons[a.severity] || '') + '</span>' +
      '<div class="momentum-text">' +
        '<div class="momentum-title">' + a.title + '</div>' +
        '<div class="momentum-detail">' + a.detail + '</div>' +
      '</div></div>';
  }).join('');
}

// ---- Recommendations ----

async function loadRecommendations() {
  try {
    var res = await authedFetch('/api/recommendations');
    renderSleepProtocol(res.sleepProtocol);
    renderLifestyleImpacts(res.lifestyleImpacts || []);
    renderRecoveryCountdowns(res.recoveryCountdowns || []);
    renderSmartCheckIn(res.smartCheckIn || []);
    if (res.sleepProtocol) startSleepCountdown();
  } catch (e) {}
}

function renderSleepProtocol(sp) {
  var card = document.getElementById('sleepProtocolCard');
  var el = document.getElementById('sleepProtocol');
  if (!el || !sp) return;
  card.style.display = 'block';
  var html = '<div class="sp-card">';
  html += '<div class="sp-times">';
  html += '<div class="sp-time"><div class="sp-time-label">Bedtime</div><div class="sp-time-val" data-bedtime="' + sp.bedtime + '">' + sp.bedtime + '</div></div>';
  html += '<div class="sp-time"><div class="sp-time-label">Target</div><div class="sp-time-val">' + sp.targetHours + 'h</div></div>';
  html += '<div class="sp-time"><div class="sp-time-label">Wake</div><div class="sp-time-val">' + sp.wakeTime + '</div></div>';
  html += '</div>';
  html += '<div class="live-countdown" id="sleepCountdown"></div>';
  html += '<div class="sp-deadlines">';
  html += '<span class="sp-deadline"><span class="dl-icon">☕</span>Caffeine by ' + sp.caffeineDeadline + '</span>';
  html += '<span class="sp-deadline"><span class="dl-icon">🍽️</span>Last meal by ' + sp.lastMealBy + '</span>';
  html += '<span class="sp-deadline"><span class="dl-icon">📱</span>Screens off ' + sp.screenCutoff + '</span>';
  html += '</div>';
  if (sp.windDownSteps && sp.windDownSteps.length) {
    html += '<ul class="sp-steps">';
    sp.windDownSteps.forEach(function (s) { html += '<li>' + s + '</li>'; });
    html += '</ul>';
  }
  if (sp.alcoholAdvice) html += '<div style="font-size:12.5px;color:var(--dim);margin-top:8px;">🍷 ' + sp.alcoholAdvice + '</div>';
  if (sp.supplementSuggestion) html += '<div style="font-size:12.5px;color:var(--dim);margin-top:4px;">💊 ' + sp.supplementSuggestion + '</div>';
  if (sp.reasoning) html += '<div style="font-size:12px;color:var(--faint);margin-top:8px;">' + sp.reasoning + '</div>';
  html += '</div>';
  el.innerHTML = html;
}

function renderLifestyleImpacts(items) {
  var card = document.getElementById('lifestyleImpactsCard');
  var el = document.getElementById('lifestyleImpacts');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (li) {
    var confColor = li.confidence === 'high' ? 'var(--up)' : li.confidence === 'medium' ? 'var(--caution)' : 'var(--dim)';
    var impactsHtml = (li.impacts || []).map(function (imp) {
      var arrow = imp.direction === 'better' ? '↑' : imp.direction === 'worse' ? '↓' : '↔';
      var color = imp.direction === 'better' ? 'var(--up)' : imp.direction === 'worse' ? 'var(--down)' : 'var(--dim)';
      var dirClass = imp.direction === 'better' ? 'better' : imp.direction === 'worse' ? 'worse' : 'neutral';
      return '<div class="li-impact ' + dirClass + '">' + arrow + ' ' + Math.abs(imp.delta).toFixed(1) + imp.unit + ' ' + imp.metric + '</div>';
    }).join('');
    var borderClass = li.impacts.some(function(i){return i.direction==='worse';}) ? ' has-impact' : li.impacts.some(function(i){return i.direction==='better';}) ? ' positive-impact' : '';
    return '<div class="li-card' + borderClass + '">' +
      '<div class="li-head">' +
        '<span class="li-icon">' + li.icon + '</span>' +
        '<span class="li-name">' + li.factor + '</span>' +
        '<span class="li-conf">' + li.confidence + ' (' + li.sampleSize + ' days)</span>' +
      '</div>' +
      '<div class="li-impacts">' + impactsHtml + '</div>' +
      '<div class="li-rec">' + li.recommendation + '</div>' +
    '</div>';
  }).join('');
}

function renderRecoveryCountdowns(items) {
  var card = document.getElementById('recoveryCountdownCard');
  var el = document.getElementById('recoveryCountdowns');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (rc) {
    var pct = Math.min(rc.currentPct, 100);
    var color = pct >= 90 ? 'var(--up)' : pct >= 60 ? 'var(--caution)' : 'var(--down)';
    var readyLabel = rc.hoursUntilRecovered <= 0 ? 'Ready now' : rc.hoursUntilRecovered + 'h to go';
    return '<div class="rc-item">' +
      '<div class="rc-muscle">' + rc.muscle + '</div>' +
      '<div class="rc-bar-wrap"><div class="rc-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
      '<div class="rc-eta">' + readyLabel + '</div>' +
    '</div>';
  }).join('');
}

var SCI_ICONS = { soreness:'💪', energy:'⚡', lateMeal:'🍽', screenBeforeBed:'📱', stress:'😤', alcoholDrinks:'🍷', caffeineMg:'☕', hydrationLiters:'💧', illness:'🤒', note:'📝' };

function renderSmartCheckIn(items) {
  var el = document.getElementById('smartCheckInArea');
  if (!el || items.length === 0) return;
  el.innerHTML = items.map(function (ci) {
    var icon = SCI_ICONS[ci.field] || '📋';
    var input = '';
    if (ci.type === 'boolean') {
      input = '<div class="sci-bool">' +
        '<button class="yes" onclick="submitCheckIn(' + "'" + ci.field + "'" + ', true, this)">Yes</button>' +
        '<button class="no" onclick="submitCheckIn(' + "'" + ci.field + "'" + ', false, this)">No</button>' +
      '</div>';
    } else if (ci.type === 'number') {
      input = '<div class="sci-actions">' +
        '<input type="number" min="' + (ci.min||1) + '" max="' + (ci.max||10) + '" placeholder="' + (ci.min||1) + '–' + (ci.max||10) + '" id="sci_'+ci.field+'" />' +
        '<button class="sci-save" onclick="submitCheckIn(' + "'" + ci.field + "'" + ', Number(document.getElementById(' + "'" + 'sci_'+ci.field + "'" + ').value), this)">Save</button>' +
      '</div>';
    } else {
      input = '<div class="sci-actions">' +
        '<input type="text" placeholder="Type…" id="sci_'+ci.field+'" style="width:140px;flex:1;" />' +
        '<button class="sci-save" onclick="submitCheckIn(' + "'" + ci.field + "'" + ', document.getElementById(' + "'" + 'sci_'+ci.field + "'" + ').value, this)">Save</button>' +
      '</div>';
    }
    return '<div class="sci-card" data-field="' + ci.field + '">' +
      '<div class="sci-head">' +
        '<div class="sci-icon">' + icon + '</div>' +
        '<div class="sci-text">' +
          '<div class="sci-q">' + ci.question + '</div>' +
          '<div class="sci-reason">' + ci.reason + '</div>' +
        '</div>' +
      '</div>' +
      input +
    '</div>';
  }).join('');
}

async function submitCheckIn(field, value, btnEl) {
  try {
    var today = new Date().toISOString().slice(0, 10);
    var payload = { date: today };
    payload[field] = value;
    await authedFetch('/api/knowledge/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    var el = document.getElementById('smartCheckInArea');
    if (el) {
      var card = el.querySelector('.sci-card[data-field="' + field + '"]');
      if (card) {
        card.classList.add('sci-done');
        var icon = SCI_ICONS[field] || '📋';
        card.innerHTML = '<div class="sci-done-msg"><span>' + icon + '</span> Recorded — thank you</div>';
      }
    }
    showToast(field.replace(/([A-Z])/g, ' $1').toLowerCase() + ' logged', 'success');
  } catch (e) {}
}

// ---- Premium features ----

async function loadPremium() {
  try {
    var res = await authedFetch('/api/premium');
    renderReadinessRing(res.readiness);
    renderActivityHeatmap(res.heatmap || []);
    renderStreaks(res.streaks || []);
    renderWeeklyComparison(res.weeklyComparison || []);
    renderPersonalRecords(res.personalRecords || []);
    // Confetti for new PRs
    if (res.personalRecords && res.personalRecords.some(function(p) { return p.isNewPR; })) {
      setTimeout(function() { fireConfetti(); showToast('🏆 New personal record!', 'success'); }, 800);
    }
    // Confetti for milestone streaks
    if (res.streaks) {
      res.streaks.forEach(function(s) {
        if (s.streakActive && (s.currentStreak === 7 || s.currentStreak === 14 || s.currentStreak === 30 || s.currentStreak === 50 || s.currentStreak === 100)) {
          setTimeout(function() { fireConfetti(); showToast('🔥 ' + s.currentStreak + '-day ' + s.type + ' streak!', 'success'); }, 1200);
        }
      });
    }
  } catch (e) {}
}

function renderReadinessRing(r) {
  var card = document.getElementById('readinessCard');
  var el = document.getElementById('readinessGauge');
  if (!el || !r) return;
  card.style.display = 'block';
  var rawColor = r.score >= 80 ? '#34d399' : r.score >= 65 ? '#a3e635' : r.score >= 45 ? '#fbbf24' : '#f76b4d';
  var cssColor = r.score >= 80 ? 'var(--up)' : r.score >= 65 ? 'var(--pulse)' : r.score >= 45 ? 'var(--caution)' : 'var(--down)';
  var circ = 2 * Math.PI * 68;
  var offset = circ - (r.score / 100) * circ;
  var html = '<div class="readiness-ring-wrap">';
  html += '<svg viewBox="0 0 160 160"><circle class="rr-bg" cx="80" cy="80" r="68" />';
  html += '<circle class="rr-fill" cx="80" cy="80" r="68" stroke="' + rawColor + '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + circ.toFixed(1) + '" id="readinessArc" /></svg>';
  html += '<div class="readiness-ring-label">';
  html += '<div class="rr-num count-up" style="color:' + cssColor + ';" data-target="' + r.score + '">0</div>';
  html += '<div class="rr-text" style="color:' + cssColor + ';">' + r.label + '</div>';
  html += '</div></div>';
  html += '<div class="tr-factors">';
  (r.factors || []).forEach(function (f) {
    var barColor = f.score >= 70 ? 'var(--up)' : f.score >= 45 ? 'var(--caution)' : 'var(--down)';
    html += '<div class="tr-factor">' +
      '<span class="tr-factor-name">' + f.name + '</span>' +
      '<div class="tr-factor-bar"><div style="width:0%;background:' + barColor + ';" data-width="' + f.score + '"></div></div>' +
      '<span class="tr-factor-score">' + f.score + '</span>' +
    '</div>';
  });
  html += '</div>';
  html += '<div class="tr-rec">' + r.recommendation + '</div>';
  el.innerHTML = html;
  // Animate ring + bars after render
  requestAnimationFrame(function() {
    var arc = document.getElementById('readinessArc');
    if (arc) arc.setAttribute('stroke-dashoffset', offset.toFixed(1));
    // Animate factor bars
    el.querySelectorAll('.tr-factor-bar > div').forEach(function(bar) {
      var w = bar.getAttribute('data-width');
      requestAnimationFrame(function() { bar.style.width = w + '%'; });
    });
    // Count up the score number
    animateCountUp(el.querySelector('.count-up'));
  });
  // Update dynamic header glow
  updateHeaderGlow(r.score);
}

function renderActivityHeatmap(items) {
  var card = document.getElementById('heatmapCard');
  var el = document.getElementById('heatmapGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  var first = new Date(items[0].date + 'T12:00:00Z');
  var startDow = first.getUTCDay();
  var cells = '';
  for (var pad = 0; pad < startDow; pad++) cells += '<div class="hm-cell hm-0"></div>';
  items.forEach(function (d) {
    cells += '<div class="hm-cell hm-' + d.intensity + '" title="' + d.date + ': ' + d.tooltip + '"></div>';
  });
  var html = '<div class="hm-grid">' + cells + '</div>';
  html += '<div class="hm-legend">Less ';
  for (var i = 0; i <= 4; i++) html += '<div class="hm-legend-cell hm-' + i + '"></div>';
  html += ' More</div>';
  el.innerHTML = html;
}

function renderStreaks(items) {
  var card = document.getElementById('streakCard');
  var el = document.getElementById('streakGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (s) {
    return '<div class="streak-card' + (s.streakActive ? ' active' : '') + '">' +
      '<div class="streak-icon">' + s.icon + '</div>' +
      '<div class="streak-num">' + s.currentStreak + '</div>' +
      '<div class="streak-label">' + s.type + ' days</div>' +
      '<div class="streak-best">Best: ' + s.longestStreak + ' days</div>' +
    '</div>';
  }).join('');
}

function renderWeeklyComparison(items) {
  var card = document.getElementById('weeklyCompCard');
  var el = document.getElementById('weeklyCompGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.map(function (w) {
    var deltaStr = w.delta !== null ? (w.delta > 0 ? '+' : '') + w.delta + (w.unit ? w.unit : '') : '—';
    var pctStr = w.deltaPct !== null ? ' (' + (w.deltaPct > 0 ? '+' : '') + w.deltaPct + '%)' : '';
    return '<div class="wc-row">' +
      '<div class="wc-metric">' + w.metric + '</div>' +
      '<div class="wc-vals">' +
        '<span class="wc-val">' + (w.lastWeek !== null ? w.lastWeek : '—') + '</span>' +
        '<span style="color:var(--dim);">→</span>' +
        '<span class="wc-val">' + (w.thisWeek !== null ? w.thisWeek : '—') + '</span>' +
      '</div>' +
      '<div class="wc-delta ' + w.direction + '">' + deltaStr + pctStr + '</div>' +
    '</div>';
  }).join('');
}

function renderPersonalRecords(items) {
  var card = document.getElementById('prCard');
  var el = document.getElementById('prGrid');
  if (!el || items.length === 0) return;
  card.style.display = 'block';
  el.innerHTML = items.slice(0, 10).map(function (pr) {
    var sparkSvg = '';
    if (pr.prHistory && pr.prHistory.length >= 2) {
      var vals = pr.prHistory.map(function (h) { return h.e1rm; });
      var minV = Math.min.apply(null, vals);
      var maxV = Math.max.apply(null, vals);
      var range = maxV - minV || 1;
      var pts = vals.map(function (v, i) { return (i / (vals.length - 1)) * 56 + 2 + ',' + (22 - ((v - minV) / range) * 20 + 1); }).join(' ');
      sparkSvg = '<svg class="pr-spark" viewBox="0 0 60 24"><polyline points="' + pts + '" fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<div class="pr-card' + (pr.isNewPR ? ' new-pr' : '') + '">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="pr-name">' + pr.exercise + '</div>' +
        '<div class="pr-sub">' + (pr.isNewPR ? '🎉 New PR!' : pr.daysSincePR + ' days ago') + '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div class="pr-val">' + pr.best1RM.toFixed(1) + '<span style="font-size:12px;font-weight:400;color:var(--dim);"> kg</span></div>' +
      '</div>' +
      sparkSvg +
    '</div>';
  }).join('');
}

function toggleFab() {
  var menu = document.getElementById('fabMenu');
  if (menu) menu.classList.toggle('open');
}

// ---- Body Analysis ----

var _bodyData = null;

async function loadBody() {
  try {
    var res = await authedFetch('/api/body');
    _bodyData = res;
    renderAbScoreRing(res.bodyScore);
    renderAbHeroStats(res.bodyScore, res.composition);
    renderAbBody(res.muscleVolume);
    renderBodyComposition(res.composition);
    renderMuscleVolume(res.muscleVolume);
    renderSymmetry(res.symmetry);
    renderPhysique(res.physique);
    renderMobility(res.mobility);
    renderImbalances(res.symmetry);
    // Light up the home screen body silhouette
    lightUpHomeBody();
  } catch (e) {
    var hero = document.getElementById('abHero');
    if (hero) hero.innerHTML = '<div class="card"><div class="sub">Body data loading…</div></div>';
  }
}

function renderAbScoreRing(score) {
  if (!score) return;
  var numEl = document.getElementById('abScoreNum');
  var labelEl = document.getElementById('abScoreLabel');
  var ringEl = document.getElementById('abRingFill');
  if (!numEl || !ringEl) return;
  numEl.setAttribute('data-target', String(score.total));
  labelEl.textContent = score.label;
  var circumference = 2 * Math.PI * 88;
  var offset = circumference - (score.total / 100) * circumference;
  requestAnimationFrame(function() {
    ringEl.style.strokeDashoffset = String(offset);
    animateCountUp(numEl);
  });
}

function renderAbHeroStats(score, comp) {
  var el = document.getElementById('abHeroStats');
  if (!el) return;
  var chips = [];
  if (comp.currentWeight !== null) chips.push({ val: comp.currentWeight.toFixed(1) + ' kg', label: 'Weight' });
  if (comp.bodyFatPct !== null) chips.push({ val: (comp.bodyFatPct * 100).toFixed(1) + '%', label: 'Body fat' });
  if (comp.bmi !== null) chips.push({ val: comp.bmi, label: 'BMI' });
  if (comp.estimatedLeanMass !== null) chips.push({ val: comp.estimatedLeanMass + ' kg', label: 'Lean' });
  el.innerHTML = chips.map(function(c) {
    return '<div class="ab-hs"><div class="ab-hs-val">' + c.val + '</div><div class="ab-hs-label">' + c.label + '</div></div>';
  }).join('');
}

function renderAbBody(muscleVolume) {
  var frontEl = document.getElementById('abBodyFront');
  var backEl = document.getElementById('abBodyBack');
  if (!frontEl || !backEl) return;
  frontEl.innerHTML = BODY_FRONT_SVG;
  backEl.innerHTML = BODY_BACK_SVG;
  if (!muscleVolume) return;
  [frontEl, backEl].forEach(function(container) {
    muscleVolume.forEach(function(m) {
      var regions = container.querySelectorAll('[data-muscle="' + m.muscle + '"]');
      regions.forEach(function(r) {
        r.classList.remove('m-optimal', 'm-undertrained', 'm-neglected', 'm-overtrained');
        r.classList.add('m-' + m.status);
        r.addEventListener('click', function(e) {
          e.stopPropagation();
          showMuscleDetail(m);
        });
      });
    });
  });
}

function toggleBodyView(view) {
  var frontEl = document.getElementById('abBodyFront');
  var backEl = document.getElementById('abBodyBack');
  var btnF = document.getElementById('abToggleFront');
  var btnB = document.getElementById('abToggleBack');
  if (!frontEl || !backEl) return;
  if (view === 'front') {
    frontEl.classList.add('active');
    backEl.classList.remove('active');
    btnF.classList.add('active');
    btnB.classList.remove('active');
  } else {
    backEl.classList.add('active');
    frontEl.classList.remove('active');
    btnB.classList.add('active');
    btnF.classList.remove('active');
  }
}

function showMuscleDetail(m) {
  var panel = document.getElementById('abMuscleDetail');
  var nameEl = document.getElementById('abMdName');
  var contentEl = document.getElementById('abMdContent');
  if (!panel || !contentEl) return;
  panel.style.display = '';
  nameEl.textContent = m.displayName;
  var statusColor = m.status === 'optimal' ? 'var(--up)' : m.status === 'undertrained' ? 'var(--caution)' : m.status === 'overtrained' ? 'var(--royal)' : 'var(--down)';
  var barPct = m.optimalRange.max > 0 ? Math.min(100, Math.round(m.weeklyAvgSets / m.optimalRange.max * 100)) : 0;
  var html = '<div class="ab-md-grid">';
  html += '<div class="ab-md-stat"><div class="amd-val">' + m.weeklyAvgSets + '</div><div class="amd-label">Sets/week</div></div>';
  html += '<div class="ab-md-stat"><div class="amd-val" style="color:' + statusColor + ';">' + m.status + '</div><div class="amd-label">Status</div></div>';
  html += '<div class="ab-md-stat"><div class="amd-val">' + m.optimalRange.min + '–' + m.optimalRange.max + '</div><div class="amd-label">Optimal range</div></div>';
  html += '</div>';
  html += '<div class="ab-md-bar"><div style="width:' + barPct + '%;background:' + statusColor + ';"></div></div>';
  var reco = m.status === 'neglected' ? 'This muscle group needs attention. Add ' + m.optimalRange.min + '+ sets per week.' :
             m.status === 'undertrained' ? 'Add ' + (m.optimalRange.min - m.weeklyAvgSets) + ' more sets to reach the optimal range.' :
             m.status === 'overtrained' ? 'Consider reducing volume to avoid burnout.' :
             'Volume is in the optimal range. Maintain current training.';
  html += '<div class="ab-md-reco">' + reco + '</div>';
  contentEl.innerHTML = html;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderBodyOverviewMini(score, muscleVolume, comp) {
  var el = document.getElementById('bodyOverviewStrip');
  if (!el || !score) return;
  el.style.display = '';
  var statusCounts = { optimal: 0, undertrained: 0, neglected: 0, overtrained: 0 };
  if (muscleVolume) muscleVolume.forEach(function(m) { if (statusCounts[m.status] !== undefined) statusCounts[m.status]++; });
  var chips = '';
  if (statusCounts.optimal > 0) chips += '<span class="ab-mini-chip optimal">' + statusCounts.optimal + ' optimal</span>';
  if (statusCounts.undertrained > 0) chips += '<span class="ab-mini-chip undertrained">' + statusCounts.undertrained + ' under</span>';
  if (statusCounts.neglected > 0) chips += '<span class="ab-mini-chip neglected">' + statusCounts.neglected + ' neglected</span>';
  var miniSvg = BODY_FRONT_SVG.replace(/viewBox/, 'style="width:60px;height:auto;" viewBox');
  el.innerHTML = '<div class="ab-mini-body" onclick="showTab(' + "'body'" + ')">' +
    '<div>' + miniSvg + '</div>' +
    '<div class="ab-mini-info">' +
      '<div class="ab-mini-label">Body score</div>' +
      '<div class="ab-mini-score" style="background:linear-gradient(135deg,var(--pulse),var(--up));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">' + score.total + '</div>' +
      '<div class="ab-mini-chips">' + chips + '</div>' +
    '</div>' +
  '</div>';
  if (muscleVolume) {
    var miniContainer = el.querySelector('.ab-mini-body svg');
    if (miniContainer) {
      muscleVolume.forEach(function(m) {
        var regions = miniContainer.querySelectorAll('[data-muscle="' + m.muscle + '"]');
        regions.forEach(function(r) { r.classList.add('m-' + m.status); });
      });
    }
  }
}

function renderBodyComposition(comp) {
  var card = document.getElementById('bodyCompCard');
  var el = document.getElementById('bodyCompContent');
  if (!el || comp.currentWeight === null) return;
  card.style.display = '';
  var html = '';
  if (comp.estimatedLeanMass !== null && comp.estimatedFatMass !== null) {
    var leanPct = Math.round((1 - comp.bodyFatPct) * 100);
    var fatPct = Math.round(comp.bodyFatPct * 100);
    html += '<div class="body-comp-bars">';
    html += '<div class="bcb-lean" style="width:' + leanPct + '%">' + leanPct + '% lean</div>';
    html += '<div class="bcb-fat" style="width:' + fatPct + '%">' + fatPct + '% fat</div>';
    html += '</div>';
    html += '<div class="body-comp-legend">';
    html += '<span><span class="bcl-dot" style="background:var(--pulse);"></span>Lean ' + comp.estimatedLeanMass + ' kg</span>';
    html += '<span><span class="bcl-dot" style="background:rgba(247,107,77,.6);"></span>Fat ' + comp.estimatedFatMass + ' kg</span>';
    html += '</div>';
  }
  html += '<table class="simple-table" style="margin-top:12px;"><tbody>';
  if (comp.weight7dAvg !== null) html += '<tr><td>7-day avg</td><td>' + comp.weight7dAvg + ' kg</td></tr>';
  if (comp.weight30dAvg !== null) html += '<tr><td>30-day avg</td><td>' + comp.weight30dAvg + ' kg</td></tr>';
  if (comp.weightDelta30d !== null) html += '<tr><td>30-day change</td><td>' + (comp.weightDelta30d > 0 ? '+' : '') + comp.weightDelta30d + ' kg</td></tr>';
  html += '<tr><td>Trend</td><td>' + comp.weightTrend + '</td></tr>';
  if (comp.bmi !== null) html += '<tr><td>BMI</td><td>' + comp.bmi + ' (' + comp.bmiCategory + ')</td></tr>';
  if (comp.idealWeightRange) html += '<tr><td>Ideal range</td><td>' + comp.idealWeightRange.low + ' – ' + comp.idealWeightRange.high + ' kg</td></tr>';
  html += '</tbody></table>';
  el.innerHTML = html;
}

function renderMuscleVolume(items) {
  var card = document.getElementById('muscleVolumeCard');
  var el = document.getElementById('muscleVolumeContent');
  if (!el || !items || items.length === 0) return;
  card.style.display = '';
  el.innerHTML = '<div class="muscle-vol-grid">' + items.map(function(m) {
    var barColor = m.status === 'optimal' ? 'var(--up)' : m.status === 'undertrained' ? 'var(--caution)' : m.status === 'overtrained' ? 'var(--royal)' : 'var(--down)';
    var barWidth = m.optimalRange.max > 0 ? Math.min(100, Math.round(m.weeklyAvgSets / m.optimalRange.max * 100)) : 0;
    return '<div class="mv-card ' + m.status + '" onclick="showMuscleDetail(_bodyData && _bodyData.muscleVolume ? _bodyData.muscleVolume.find(function(x){return x.muscle===' + "'" + m.muscle + "'" + ';}) : null)" style="cursor:pointer;">' +
      '<div class="mv-name">' + m.displayName + '</div>' +
      '<div class="mv-sets">' + m.weeklyAvgSets + '<small> sets/wk</small></div>' +
      '<div class="mv-bar"><div style="width:' + barWidth + '%;background:' + barColor + ';"></div></div>' +
      '<div class="mv-status">' + m.status + ' (' + m.optimalRange.min + '–' + m.optimalRange.max + ')</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderSymmetry(sym) {
  var card = document.getElementById('symmetryCard');
  var el = document.getElementById('symmetryContent');
  if (!el || !sym) return;
  card.style.display = '';
  var html = '<div style="text-align:center;margin-bottom:12px;">';
  html += '<div style="font-family:var(--mono);font-size:48px;font-weight:900;color:' + (sym.overallScore >= 80 ? 'var(--up)' : sym.overallScore >= 60 ? 'var(--pulse)' : 'var(--caution)') + ';">' + sym.overallScore + '</div>';
  html += '<div style="font-size:12px;color:var(--dim);font-weight:700;">SYMMETRY SCORE</div>';
  html += '</div>';
  function meterRow(label, value, ideal) {
    if (value === null) return '';
    var pos = Math.min(100, Math.max(0, (value / (ideal * 2)) * 100));
    var color = Math.abs(value - ideal) < ideal * 0.2 ? 'var(--up)' : Math.abs(value - ideal) < ideal * 0.4 ? 'var(--caution)' : 'var(--down)';
    return '<div class="symmetry-meter">' +
      '<div class="sm-label">' + label + '</div>' +
      '<div class="sm-bar">' +
        '<div style="position:absolute;left:50%;top:-1px;bottom:-1px;width:1px;background:var(--faint);"></div>' +
        '<div class="sm-indicator" style="left:calc(' + pos + '% - 8px);background:' + color + ';"></div>' +
      '</div>' +
      '<div class="sm-val">' + value + '</div>' +
    '</div>';
  }
  html += meterRow('Push/Pull', sym.pushPullRatio, 1.0);
  html += meterRow('Upper/Lower', sym.upperLowerRatio, 0.7);
  html += meterRow('Front/Back', sym.anteriorPosteriorRatio, 1.0);
  el.innerHTML = html;
}

function renderPhysique(p) {
  var card = document.getElementById('physiqueCard');
  var el = document.getElementById('physiqueContent');
  if (!el || !p) return;
  card.style.display = '';
  var html = '<div class="physique-card">';
  html += '<div class="pc-main">';
  html += '<div class="pc-type">' + p.dominantType + '</div>';
  html += '<div class="pc-desc">' + p.description + '</div>';
  html += '</div>';
  if (p.strongPoints.length) {
    html += '<div><div style="font-size:12px;color:var(--up);font-weight:700;margin-bottom:4px;">STRONG</div><ul class="pc-list strong">' + p.strongPoints.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
  }
  if (p.weakPoints.length) {
    html += '<div><div style="font-size:12px;color:var(--down);font-weight:700;margin-bottom:4px;">NEEDS WORK</div><ul class="pc-list weak">' + p.weakPoints.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
  }
  html += '<div class="pc-stat"><div class="pcs-val">' + p.trainingAge.months + '</div><div class="pcs-label">Months training · ' + p.trainingAge.label + '</div></div>';
  if (p.estimatedFFMI !== null) {
    html += '<div class="pc-stat"><div class="pcs-val">' + p.estimatedFFMI + '</div><div class="pcs-label">FFMI</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function renderMobility(mob) {
  var card = document.getElementById('mobilityCard');
  var el = document.getElementById('mobilityContent');
  if (!el || !mob) return;
  card.style.display = '';
  var scoreColor = mob.total >= 80 ? 'var(--up)' : mob.total >= 60 ? 'var(--pulse)' : mob.total >= 40 ? 'var(--caution)' : 'var(--down)';
  var html = '<div style="text-align:center;margin-bottom:12px;">';
  html += '<div style="font-family:var(--mono);font-size:42px;font-weight:900;color:' + scoreColor + ';">' + mob.total + '</div>';
  html += '<div style="font-size:12px;color:var(--dim);font-weight:700;">MOBILITY SCORE</div>';
  html += '</div>';
  html += '<div class="mobility-grid">';
  function mobItem(val, label, status) {
    var stColor = status === 'Excellent' || status === 'Excellent balance' || status === 'Symmetrical' || status === 'Long stride' ? 'color:var(--up)' : status.indexOf('Below') >= 0 || status.indexOf('Notable') >= 0 || status === 'Needs work' || status === 'Short stride' ? 'color:var(--down)' : 'color:var(--caution)';
    return '<div class="mob-item"><div class="mob-val">' + (val !== null ? val : '—') + '</div><div class="mob-label">' + label + '</div><div class="mob-status" style="' + stColor + '">' + status + '</div></div>';
  }
  html += mobItem(mob.walkingSpeed.value !== null ? mob.walkingSpeed.value + ' m/s' : null, 'Walking speed', mob.walkingSpeed.percentile);
  html += mobItem(mob.stepLength.value !== null ? mob.stepLength.value + ' cm' : null, 'Step length', mob.stepLength.percentile);
  html += mobItem(mob.asymmetry.value !== null ? mob.asymmetry.value + '%' : null, 'Asymmetry', mob.asymmetry.status);
  html += mobItem(mob.doubleSupport.value !== null ? mob.doubleSupport.value + '%' : null, 'Double support', mob.doubleSupport.status);
  html += '</div>';
  el.innerHTML = html;
}

function renderImbalances(sym) {
  var card = document.getElementById('imbalanceCard');
  var el = document.getElementById('imbalanceContent');
  if (!el || !sym || !sym.imbalances || sym.imbalances.length === 0) return;
  card.style.display = '';
  el.innerHTML = sym.imbalances.map(function(im) {
    return '<div class="imbalance-item">' +
      '<span class="ib-sev ' + im.severity + '">' + im.severity + '</span>' +
      '<span class="ib-text">' + im.description + '</span>' +
    '</div>';
  }).join('');
}

// ---- Body-centric home rendering ----

function renderBodyHome(todayData) {
  var d = todayData;
  var svgEl = document.getElementById('bodyStageSvg');
  if (svgEl && !svgEl.querySelector('svg')) {
    svgEl.innerHTML = BODY_FRONT_SVG;
  }

  lightUpHomeBody();

  if (_bodyData && _bodyData.bodyScore) {
    var score = _bodyData.bodyScore;
    var numEl = document.getElementById('bsbNum');
    var fillEl = document.getElementById('bsbFill');
    if (numEl && fillEl) {
      numEl.setAttribute('data-target', String(score.total));
      var circ = 2 * Math.PI * 34;
      var off = circ - (score.total / 100) * circ;
      requestAnimationFrame(function() {
        fillEl.style.strokeDashoffset = String(off);
        animateCountUp(numEl);
      });
    }
  }

  renderQuickGlance(d);
  renderHomeStrainBudget(d);
  renderHomeWhatMoved(d);
}

function lightUpHomeBody() {
  var svgEl = document.getElementById('bodyStageSvg');
  if (!svgEl || !_bodyData || !_bodyData.muscleVolume) return;
  _bodyData.muscleVolume.forEach(function(m) {
    var regions = svgEl.querySelectorAll('[data-muscle="' + m.muscle + '"]');
    regions.forEach(function(r) {
      r.classList.remove('m-optimal', 'm-undertrained', 'm-neglected', 'm-overtrained');
      r.classList.add('m-' + m.status);
      if (!r._muscleClickBound) {
        r._muscleClickBound = true;
        r.addEventListener('click', function(e) {
          e.stopPropagation();
          // Ripple effect on muscle tap
          var svg = r.closest('svg');
          if (svg) {
            var bbox = r.getBBox();
            var cx = bbox.x + bbox.width / 2;
            var cy = bbox.y + bbox.height / 2;
            var ripple = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ripple.setAttribute('cx', String(cx));
            ripple.setAttribute('cy', String(cy));
            ripple.setAttribute('r', '0');
            ripple.setAttribute('class', 'muscle-ripple');
            svg.appendChild(ripple);
            setTimeout(function() { ripple.remove(); }, 650);
          }
          showHomeMuscle(m);
        });
      }
    });
  });
}

function renderHomeStrainBudget(d) {
  var card = document.getElementById('strainBudgetCard');
  if (!card) return;
  var strain = d && d.today && d.today.strain !== undefined ? d.today.strain : null;
  var recov = d && d.recoveryScore !== undefined ? d.recoveryScore : null;
  if (strain === null) return;
  card.style.display = '';
  var maxStrain = recov !== null && recov >= 70 ? 18 : recov !== null && recov >= 45 ? 14 : 10;
  var pct = Math.min(100, Math.round(strain / 21 * 100));
  var fill = document.getElementById('sbFill2');
  if (fill) {
    fill.style.width = pct + '%';
    fill.className = 'sb-fill' + (strain > maxStrain ? ' over' : strain > maxStrain * 0.8 ? ' high' : '');
  }
  var used = document.getElementById('sbUsed2');
  if (used) used.textContent = strain.toFixed(1);
  var max = document.getElementById('sbMax2');
  if (max) max.textContent = String(maxStrain);
  var target = document.getElementById('sbTarget2');
  if (target) target.style.left = Math.round(maxStrain / 21 * 100) + '%';
}

function renderHomeWhatMoved(d) {
  var card = document.getElementById('whatMovedCard');
  var el = document.getElementById('whatMovedList2');
  if (!card || !el || !d || !d.today) return;
  var today = d.today;
  if (!GUIDE_DAYS || GUIDE_DAYS.length < 2) return;
  var yesterday = GUIDE_DAYS[GUIDE_DAYS.length - 2];
  if (!yesterday) return;
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
    moved.push({ key: k, label: label, val: fmtMetricVal(k, today[k]), pct: pct, isUp: isUp, good: good });
  });
  moved.sort(function (a, b) { return b.pct - a.pct; });
  if (moved.length === 0) return;
  card.style.display = '';
  el.innerHTML = moved.slice(0, 5).map(function (m) {
    var arrow = m.isUp ? '&#9650;' : '&#9660;';
    var cls = m.good === true ? 'up' : m.good === false ? 'dn' : '';
    var sparkColor = m.good === true ? 'var(--up)' : m.good === false ? 'var(--down)' : 'var(--dim)';
    var hist = qgGetHistory(m.key, 7);
    var spark = miniSparkSvg(hist, sparkColor);
    return '<div class="wm-item"><span class="wm-key">' + m.label + '</span>' + spark + '<span class="wm-val">' + m.val + '</span> <span class="wm-delta ' + cls + '">' + arrow + ' ' + Math.round(m.pct * 100) + '%</span></div>';
  }).join('');
}

function miniSparkSvg(values, color) {
  if (!values || values.length < 2) return '';
  var w = 60, h = 20;
  var max = Math.max.apply(null, values) || 1;
  var min = Math.min.apply(null, values);
  var range = max - min || 1;
  var pts = values.map(function(v, i) {
    return (i / (values.length - 1) * (w - 4) + 2) + ',' + (h - 2 - ((v - min) / range) * (h - 4));
  });
  var last = pts[pts.length - 1].split(',');
  return '<svg class="qg-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2" fill="' + color + '"/></svg>';
}

function qgGetHistory(key, n) {
  if (!GUIDE_DAYS || GUIDE_DAYS.length < 2) return [];
  var days = GUIDE_DAYS.slice(-n);
  return days.map(function(d) { return typeof d[key] === 'number' ? d[key] : null; }).filter(function(v) { return v !== null; });
}

function qgDelta(key) {
  if (!GUIDE_DAYS || GUIDE_DAYS.length < 2) return null;
  var today = GUIDE_DAYS[GUIDE_DAYS.length - 1];
  var yest = GUIDE_DAYS[GUIDE_DAYS.length - 2];
  if (!today || !yest || typeof today[key] !== 'number' || typeof yest[key] !== 'number' || yest[key] === 0) return null;
  var diff = today[key] - yest[key];
  var pct = Math.round((diff / Math.abs(yest[key])) * 100);
  return { diff: diff, pct: pct };
}

function toggleQgExpand(idx) {
  var all = document.querySelectorAll('.qg-expand');
  for (var i = 0; i < all.length; i++) {
    if (i === idx) {
      all[i].classList.toggle('open');
      if (all[i].classList.contains('open')) all[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      all[i].classList.remove('open');
    }
  }
}

function renderQuickGlance(d) {
  var el = document.getElementById('quickGlanceRow');
  if (!el || !d || !d.today) return;
  var t = d.today;
  var items = [];
  var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if (t.sleepHours !== null && t.sleepHours !== undefined) {
    var sleepColor = t.sleepHours >= 7 ? 'var(--up)' : t.sleepHours >= 6 ? 'var(--caution)' : 'var(--down)';
    items.push({ icon: '🌙', name: 'Sleep', val: t.sleepHours.toFixed(1) + 'h', color: sleepColor, sub: t.sleepDeepHours ? (t.sleepDeepHours.toFixed(1) + 'h deep') : '', histKey: 'sleepHours' });
  }
  if (t.hrv !== null && t.hrv !== undefined) {
    items.push({ icon: '💓', name: 'HRV', val: Math.round(t.hrv) + 'ms', color: 'var(--ink)', sub: t.restingHeartRate ? (t.restingHeartRate + ' bpm RHR') : '', histKey: 'hrv' });
  }
  if (d.recoveryScore !== null && d.recoveryScore !== undefined) {
    var recColor = d.recoveryScore >= 67 ? 'var(--up)' : d.recoveryScore >= 34 ? 'var(--caution)' : 'var(--down)';
    items.push({ icon: '💚', name: 'Recovery', val: Math.round(d.recoveryScore) + '%', color: recColor, sub: d.recoveryLabel || '', histKey: null });
  }
  if (t.strain !== null && t.strain !== undefined) {
    items.push({ icon: '⚡', name: 'Strain', val: t.strain.toFixed(1), color: 'var(--caution)', sub: t.activeEnergy ? (Math.round(t.activeEnergy) + ' kcal') : '', histKey: 'strain' });
  }
  if (t.steps !== null && t.steps !== undefined) {
    items.push({ icon: '🚶', name: 'Steps', val: t.steps.toLocaleString(), color: 'var(--ink)', sub: t.distanceKm ? (t.distanceKm.toFixed(1) + ' km') : '', histKey: 'steps' });
  }
  if (t.activeEnergy !== null && t.activeEnergy !== undefined && !items.some(function(x){return x.name==='Strain';})) {
    items.push({ icon: '🔥', name: 'Active cal', val: Math.round(t.activeEnergy), color: 'var(--ink)', sub: '', histKey: 'activeEnergy' });
  }
  if (_bodyData && _bodyData.composition) {
    var comp = _bodyData.composition;
    if (comp.currentWeight !== null) items.push({ icon: '⚖️', name: 'Weight', val: comp.currentWeight.toFixed(1) + ' kg', color: 'var(--ink)', sub: comp.bmi ? ('BMI ' + comp.bmi) : '', histKey: null });
    if (comp.bodyFatPct !== null) items.push({ icon: '📊', name: 'Body fat', val: (comp.bodyFatPct * 100).toFixed(1) + '%', color: 'var(--ink)', sub: comp.estimatedLeanMass ? (comp.estimatedLeanMass + ' kg lean') : '', histKey: null });
  }
  el.innerHTML = items.slice(0, 8).map(function(it, idx) {
    var sparkHtml = '';
    var deltaHtml = '';
    var expandHtml = '';
    if (it.histKey) {
      var hist = qgGetHistory(it.histKey, 7);
      if (hist.length >= 2) sparkHtml = miniSparkSvg(hist, it.color === 'var(--ink)' ? '#a3e635' : it.color);
      var delta = qgDelta(it.histKey);
      if (delta) {
        var sign = delta.pct >= 0 ? '+' : '';
        deltaHtml = '<div class="qg-delta ' + (delta.pct >= 0 ? 'up' : 'down') + '">' + sign + delta.pct + '% vs yesterday</div>';
      }
      if (hist.length >= 3) {
        var last7 = GUIDE_DAYS.slice(-7);
        var daysHtml = last7.map(function(day) {
          var v = typeof day[it.histKey] === 'number' ? day[it.histKey] : null;
          var dayLabel = day.date ? dayNames[new Date(day.date).getDay()] : '';
          return '<div class="qe-day"><div class="qed-val">' + (v !== null ? (v % 1 ? v.toFixed(1) : v) : '—') + '</div><div class="qed-label">' + dayLabel + '</div></div>';
        }).join('');
        var avg = hist.reduce(function(a,b){return a+b;}, 0) / hist.length;
        expandHtml = '<div class="qg-expand" data-qg-expand="' + idx + '">' +
          '<div class="qe-days">' + daysHtml + '</div>' +
          '<div class="qe-insight">7-day avg: <strong>' + (avg % 1 ? avg.toFixed(1) : Math.round(avg)) + '</strong></div>' +
          '</div>';
      }
    }
    return '<div class="qg-card" onclick="toggleQgExpand(' + idx + ')">' +
      '<div class="qg-head"><span class="qg-icon">' + it.icon + '</span><span class="qg-name">' + it.name + '</span></div>' +
      '<div class="qg-val" style="color:' + it.color + ';">' + it.val + '</div>' +
      (it.sub ? '<div class="qg-sub">' + it.sub + '</div>' : '') +
      deltaHtml +
      sparkHtml +
    '</div>' + expandHtml;
  }).join('');
}

// Metric drawer system
function openMetricDrawer(type) {
  var map = { sleep: 'Sleep', heart: 'HRV', strain: 'Strain', recovery: 'Recovery', activity: 'Steps' };
  var name = map[type] || type;
  var cards = document.querySelectorAll('.qg-card');
  for (var i = 0; i < cards.length; i++) {
    var nameEl = cards[i].querySelector('.qg-name');
    if (nameEl && nameEl.textContent === name) {
      cards[i].click();
      cards[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
}

function _openMetricDrawerOriginal(type) {
  var bg = document.getElementById('metricDrawerBg');
  var drawer = document.getElementById('metricDrawer');
  var title = document.getElementById('mdTitle');
  var content = document.getElementById('mdContent');
  if (!bg || !drawer || !content) return;
  bg.classList.add('open');
  drawer.classList.add('open');

  var names = { sleep: 'Sleep', heart: 'Heart Rate', strain: 'Strain & Activity', recovery: 'Recovery', activity: 'Activity' };
  title.textContent = names[type] || type;

  function makeSparkSvg(values, color) {
    if (!values || values.length < 2) return '';
    var w = 240, h = 48;
    var maxV = Math.max.apply(null, values) || 1;
    var minV = Math.min.apply(null, values);
    var range = maxV - minV || 1;
    var pts = values.map(function(v, i) {
      return (i / (values.length - 1) * (w - 8) + 4) + ',' + (h - 4 - ((v - minV) / range) * (h - 8));
    });
    var last = pts[pts.length - 1].split(',');
    return '<div class="md-sparkline"><svg viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="sparkGrad_' + color.replace(/[^a-z]/g,'') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity=".2"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="4,' + h + ' ' + pts.join(' ') + ' ' + (w-4) + ',' + h + '" fill="url(#sparkGrad_' + color.replace(/[^a-z]/g,'') + ')"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="3" fill="' + color + '"/>' +
      '</svg></div>';
  }

  function trendChip(current, avg) {
    if (current === null || avg === null) return '';
    var diff = ((current - avg) / avg * 100);
    var cls = diff > 3 ? 'improving' : diff < -3 ? 'declining' : 'stable';
    var label = diff > 3 ? '↑ trending up' : diff < -3 ? '↓ trending down' : '→ stable';
    return '<div class="md-trend-row"><span class="md-trend-chip ' + cls + '">' + label + '</span></div>';
  }

  var html = '';
  if (type === 'sleep') {
    var sleepH = document.getElementById('bSleepH');
    var deepRem = document.getElementById('bDeepRem');
    var sleepVal = parseFloat(sleepH ? sleepH.textContent : '0');
    html += '<div class="md-hero-num" style="color:' + (sleepVal >= 7 ? 'var(--up)' : sleepVal >= 6 ? 'var(--caution)' : 'var(--down)') + ';">' + (sleepH ? sleepH.textContent : '—') + '</div>';
    html += '<div class="md-hero-sub">hours slept last night</div>';
    html += trendChip(sleepVal, 7.2);
    html += makeSparkSvg([6.8, 7.2, 6.5, 7.8, 6.9, 7.1, sleepVal || 7], '#818cf8');
    html += '<div class="md-stats">';
    html += '<div class="md-stat"><div class="mds-v">' + (deepRem ? deepRem.textContent : '—') + '</div><div class="mds-l">Deep+REM</div></div>';
    var quality = document.getElementById('bSleepQ');
    html += '<div class="md-stat"><div class="mds-v">' + (quality ? quality.textContent : '—') + '</div><div class="mds-l">Quality</div></div>';
    html += '<div class="md-stat"><div class="mds-v">' + (sleepVal >= 7 ? 'On track' : 'Below') + '</div><div class="mds-l">vs Goal</div></div>';
    html += '</div>';
    html += '<div class="md-insight">' + (sleepVal >= 7 ? 'Great sleep. Your recovery benefits from consistent 7+ hour nights.' : sleepVal >= 6 ? 'Slightly under target. Try getting to bed 20 min earlier tonight.' : 'Low sleep — expect reduced HRV and higher strain sensitivity today.') + '</div>';
    html += '<button class="btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="closeMetricDrawer();showTab(' + "'sleep'" + ');">View sleep details →</button>';
  } else if (type === 'heart') {
    var hrvVal = document.getElementById('bHrv');
    var rhrVal = document.getElementById('bRhr');
    var hrvNum = parseInt(hrvVal ? hrvVal.textContent : '0');
    var rhrNum = parseInt(rhrVal ? rhrVal.textContent : '0');
    html += '<div class="md-hero-num">' + (hrvVal ? hrvVal.textContent : '—') + '<span style="font-size:18px;color:var(--dim);"> ms</span></div>';
    html += '<div class="md-hero-sub">heart rate variability</div>';
    html += trendChip(hrvNum, 50);
    html += makeSparkSvg([45, 52, 48, 55, 50, 47, hrvNum || 50], '#ef4444');
    html += '<div class="md-stats">';
    html += '<div class="md-stat"><div class="mds-v">' + (rhrVal ? rhrVal.textContent : '—') + '</div><div class="mds-l">Resting HR</div></div>';
    html += '<div class="md-stat"><div class="mds-v">' + (hrvNum > 0 ? (hrvNum >= 50 ? 'Good' : 'Low') : '—') + '</div><div class="mds-l">Status</div></div>';
    html += '<div class="md-stat"><div class="mds-v">' + (rhrNum > 0 ? (rhrNum <= 60 ? 'Athletic' : 'Normal') : '—') + '</div><div class="mds-l">RHR zone</div></div>';
    html += '</div>';
    html += '<div class="md-insight">' + (hrvNum >= 50 ? 'Your autonomic nervous system is well-balanced. Good readiness for intense training.' : 'HRV is on the lower side — consider a lighter training day or active recovery.') + '</div>';
    html += '<button class="btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="closeMetricDrawer();showTab(' + "'heart'" + ');">View heart details →</button>';
  } else if (type === 'strain' || type === 'activity') {
    var usedEl = document.getElementById('sbUsed');
    var maxEl = document.getElementById('sbMax');
    var strainVal = parseFloat(usedEl ? usedEl.textContent : '0');
    html += '<div class="md-hero-num" style="color:' + (strainVal >= 14 ? 'var(--down)' : strainVal >= 8 ? 'var(--caution)' : 'var(--pulse)') + ';">' + (usedEl ? usedEl.textContent : '—') + '<span style="font-size:18px;color:var(--dim);"> / ' + (maxEl ? maxEl.textContent : '21') + '</span></div>';
    html += '<div class="md-hero-sub">strain today</div>';
    html += trendChip(strainVal, 10);
    html += makeSparkSvg([8, 12, 6, 14, 10, 9, strainVal || 8], '#fbbf24');
    html += '<div class="md-stats">';
    html += '<div class="md-stat"><div class="mds-v">' + (strainVal >= 14 ? 'High' : strainVal >= 8 ? 'Moderate' : 'Light') + '</div><div class="mds-l">Intensity</div></div>';
    html += '<div class="md-stat"><div class="mds-v">' + Math.round((strainVal / 21) * 100) + '%</div><div class="mds-l">Capacity</div></div>';
    html += '<div class="md-stat"><div class="mds-v">' + (21 - strainVal > 0 ? (21 - strainVal).toFixed(1) : '0') + '</div><div class="mds-l">Remaining</div></div>';
    html += '</div>';
    html += '<div class="md-insight">' + (strainVal >= 14 ? 'High strain day. Focus on recovery: hydrate, eat well, sleep early.' : strainVal >= 8 ? 'Moderate load. Room for a solid evening session if recovery permits.' : 'Light day so far. You can push harder if you feel ready.') + '</div>';
    html += '<button class="btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="closeMetricDrawer();showTab(' + "'activity'" + ');">View activity details →</button>';
  } else if (type === 'recovery') {
    var recovEl = document.getElementById('bRecov');
    var score = recovEl ? parseInt(recovEl.textContent) : 0;
    var recColor = score >= 67 ? 'var(--up)' : score >= 34 ? 'var(--caution)' : 'var(--down)';
    html += '<div class="md-hero-num" style="color:' + recColor + ';">' + (recovEl ? recovEl.textContent : '—') + '<span style="font-size:18px;color:var(--dim);">%</span></div>';
    html += '<div class="md-hero-sub">recovery score</div>';
    html += trendChip(score, 65);
    html += makeSparkSvg([62, 71, 58, 75, 68, 64, score || 65], '#34d399');
    var pillarsEl = document.getElementById('recoveryPillars');
    if (pillarsEl && pillarsEl.innerHTML) html += '<div style="margin-top:12px;">' + pillarsEl.innerHTML + '</div>';
    html += '<div class="md-insight">' + (score >= 67 ? 'Strong recovery. Your body is primed for performance. Go hard.' : score >= 34 ? 'Moderate recovery. Stick to your plan but listen to your body.' : 'Low recovery. Prioritize sleep, hydration, and light movement today.') + '</div>';
    html += '<button class="btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="closeMetricDrawer();showTab(' + "'heart'" + ');">View recovery details</button>';
  }
  content.innerHTML = html;
}

function closeMetricDrawer() {
  var bg = document.getElementById('metricDrawerBg');
  var drawer = document.getElementById('metricDrawer');
  if (bg) bg.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
}

// ---- Home muscle detail sheet ----

function showHomeMuscle(m) {
  var detailEl = document.getElementById('bodyInlineDetail');
  if (!detailEl) return;

  if (detailEl.style.display !== 'none' && detailEl._currentMuscle === m.muscle) {
    detailEl.style.display = 'none';
    detailEl._currentMuscle = null;
    return;
  }
  detailEl._currentMuscle = m.muscle;

  var statusRecos = {
    optimal: 'Maintain current volume. Well-trained and recovering properly.',
    undertrained: 'Add 2-3 more sets per week to bring this up.',
    neglected: 'Not trained recently. Add to your next session.',
    overtrained: 'Scale back volume. Allow 48-72h rest.'
  };
  var statusLabel = m.status.charAt(0).toUpperCase() + m.status.slice(1);
  var setsLabel = (m.setsLast7 !== undefined) ? m.setsLast7 : '—';
  var sets30 = (m.setsLast30 !== undefined) ? m.setsLast30 : '—';
  var freq = (m.frequency !== undefined) ? m.frequency + 'x' : '—';

  detailEl.innerHTML = '<div class="bid-card">' +
    '<div class="bid-head"><span class="bid-name">' + m.muscle + '</span><span class="hms-status-pill ' + m.status + '">' + statusLabel + '</span></div>' +
    '<div class="bid-stats">' +
      '<div class="bid-stat"><div class="bid-val num">' + setsLabel + '</div><div class="bid-label">sets / 7d</div></div>' +
      '<div class="bid-stat"><div class="bid-val num">' + sets30 + '</div><div class="bid-label">sets / 30d</div></div>' +
      '<div class="bid-stat"><div class="bid-val num">' + freq + '</div><div class="bid-label">frequency</div></div>' +
    '</div>' +
    '<div class="bid-reco">' + (statusRecos[m.status] || '') + '</div>' +
  '</div>';
  detailEl.style.display = '';
  detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeHomeMuscle() {
  var bg = document.getElementById('homeMuscBg');
  var sheet = document.getElementById('homeMuscSheet');
  if (bg) bg.classList.remove('open');
  if (sheet) sheet.classList.remove('open');
}

// ---- Particle system behind body ----


// ---- Premium UI systems ----

function animateCountUp(el) {
  if (!el) return;
  var target = parseInt(el.getAttribute('data-target') || '0');
  var start = 0;
  var duration = 1200;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    var current = Math.round(start + (target - start) * eased);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
    else el.classList.add('done');
  }
  requestAnimationFrame(step);
}

function fireConfetti() {
  var container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);
  var colors = ['#a3e635', '#34d399', '#fbbf24', '#d4a853', '#c9b8ff', '#f76b4d', '#ff6b9d', '#4dc9f6'];
  for (var i = 0; i < 60; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    piece.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    piece.style.width = (4 + Math.random() * 6) + 'px';
    piece.style.height = (4 + Math.random() * 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(function() { container.remove(); }, 4000);
}

var toastContainer = null;
function showToast(message, type) {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  var toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toastOut .3s ease forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

function updateHeaderGlow(readinessScore) {
  var header = document.querySelector('header.top');
  if (!header) return;
  var glow = header.querySelector('.header-glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.className = 'header-glow';
    header.style.position = 'sticky';
    header.insertBefore(glow, header.firstChild);
  }
  var color = readinessScore >= 80 ? '52,211,153' : readinessScore >= 65 ? '163,230,53' : readinessScore >= 45 ? '251,191,36' : '247,107,77';
  glow.style.background = 'radial-gradient(ellipse at 50% 100%, rgba(' + color + ',.2) 0%, transparent 70%)';
}

function switchTabAnimated(tabId) {
  var current = document.querySelector('.section.active');
  var next = document.getElementById('tab-' + tabId);
  if (!next || current === next) return;
  if (current) {
    current.classList.add('slide-out');
    current.classList.remove('active');
  }
  next.classList.add('slide-in');
  next.style.display = 'block';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      if (current) { current.style.display = 'none'; current.classList.remove('slide-out'); }
      next.classList.remove('slide-in');
      next.classList.add('active');
      // Stagger card entrances
      var cards = next.querySelectorAll('.card, .fit, .stat');
      cards.forEach(function(c, i) {
        c.style.opacity = '0';
        c.style.transform = 'translateY(16px)';
        c.style.transition = 'opacity .35s ease, transform .35s ease';
        c.style.transitionDelay = (i * 40) + 'ms';
        requestAnimationFrame(function() { c.style.opacity = '1'; c.style.transform = 'translateY(0)'; });
      });
    });
  });
}

// Live countdown timer for sleep protocol
var countdownInterval = null;
function startSleepCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(function() {
    var el = document.querySelector('.sp-time-val[data-bedtime]');
    if (!el) return;
    var bedtime = el.getAttribute('data-bedtime');
    if (!bedtime) return;
    var now = new Date();
    var parts = bedtime.split(':');
    var bedDate = new Date();
    bedDate.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    if (bedDate < now) bedDate.setDate(bedDate.getDate() + 1);
    var diff = bedDate - now;
    if (diff <= 0) return;
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var countdownEl = document.getElementById('sleepCountdown');
    if (countdownEl) {
      countdownEl.innerHTML = '<span class="cd-label">Bedtime in</span> <span class="cd-time">' + h + 'h ' + m + 'm</span>';
    }
  }, 60000);
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
  today: [['overview', 'Home'], ['body', 'Body'], ['age', 'Bio age'], ['records', 'Records'], ['plan', 'Plan'], ['settings', 'Settings']],
  trends: [['heart', 'Heart'], ['activity', 'Activity'], ['workouts', 'Workouts'], ['sleep', 'Sleep'], ['training', 'Training'], ['longview', 'Long view'], ['insights', 'Insights'], ['dayexplorer', 'Explorer'], ['allmetrics', 'All metrics'], ['more', 'Extra']],
  coach: [['directive', 'Coach'], ['ai', 'Ask AI'], ['discoveries', 'Discoveries'], ['story', 'Weekly story']],
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
  // Stagger card entrances on tab switch
  var cards = activeSection.querySelectorAll('.card, .fit');
  cards.forEach(function(c, i) {
    c.style.opacity = '0';
    c.style.transform = 'translateY(12px)';
    c.style.transition = 'opacity .3s ease, transform .3s ease';
    c.style.transitionDelay = (i * 35) + 'ms';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { c.style.opacity = '1'; c.style.transform = 'translateY(0)'; });
    });
  });
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
var C = { pulse:'#a3e635', up:'#34d399', down:'#f76b4d', caution:'#fbbf24', blue:'#60a5fa', purple:'#a78bfa', gold:'#d4a853', dim:'#8a8a8a', grid:'#1e1e1e', faint:'#555555' };

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
      emptyEl.textContent = 'This chart is waiting for its big debut — import your Apple Health export to populate it.';
      el.parentElement.insertBefore(emptyEl, el);
    }
    return;
  }
  if (emptyEl) emptyEl.remove();
  el.style.display = '';

  var chartFont = "'Barlow Condensed',-apple-system,sans-serif";
  config.options = Object.assign({ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{ legend:{ labels:{ color:C.dim, boxWidth:10, font:{size:11, family:chartFont} } },
      tooltip:{enabled:true,backgroundColor:'rgba(18,18,18,.95)',titleColor:'#8a8a8a',bodyColor:'#ffffff',borderColor:'#262626',borderWidth:1,cornerRadius:6,titleFont:{family:"'Barlow Condensed',-apple-system,sans-serif",size:11},bodyFont:{family:"'Barlow Condensed',-apple-system,sans-serif",size:13,weight:'700'},padding:{x:10,y:8},displayColors:true,boxWidth:8,boxHeight:8,boxPadding:4,caretSize:0,callbacks:{label:function(ctx){var v=ctx.parsed.y;if(v===null||v===undefined)return'';return ctx.dataset.label+': '+(v%1?v.toFixed(1):v);}}} },
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
  var latestDate = GUIDE_DAYS.length ? GUIDE_DAYS[GUIDE_DAYS.length - 1].date : null;
  var recentCutoff = latestDate ? new Date(new Date(latestDate).getTime() - 7 * 86400000) : null;
  document.getElementById('bestsGrid').innerHTML = defs.map(function (d) {
    var name = d[0], b = d[1], unit = d[2], dp = d[3];
    if (!b) return '<div class="best"><div class="label">' + name + '</div><div class="value">—</div></div>';
    var isNew = recentCutoff && new Date(b.date) >= recentCutoff;
    return '<div class="best"><div class="label">' + name + (isNew ? '<span class="new-badge">NEW</span>' : '') + '</div><div class="value">' + fmt(b.value, dp) + (unit ? ' ' + unit : '') + '</div><div class="date">' + b.date + '</div></div>';
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
  var allClosed = rings.every(function (r) { return r.goal !== undefined && r.actual !== undefined && r.actual >= r.goal; });
  el.innerHTML = '<div class="ar-wrap"><svg class="ar-svg" viewBox="0 0 ' + svgSize + ' ' + svgSize + '" width="120" height="120" style="transform:rotate(-90deg)">' +
    svgRings.map(function (r) { return r.svg; }).join('') + '</svg><div class="ar-labels">' +
    svgRings.map(function (r) { return r.row; }).join('') +
    (allClosed ? '<div class="triple-crown">\\u{1F451} Triple crown</div>' : '') + '</div></div>';
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

function currentStreak(days) {
  var streak = 0;
  for (var i = days.length - 1; i >= 0; i--) {
    var d = days[i];
    if ((d.exerciseMinutes || 0) >= 20 || (d.workoutMinutes || 0) >= 15) streak++;
    else break;
  }
  return streak;
}

function renderGreeting(days) {
  var h = new Date().getHours();
  var greet = h < 5 ? 'Burning the midnight oil' : h >= 5 && h < 7 ? 'Early bird gets the gains' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = greet;
  var lastDate = days.length ? days[days.length - 1].date : null;
  document.getElementById('greetingSub').textContent = lastDate
    ? 'Your body at a glance. Synced ' + niceDate(lastDate) + '.'
    : 'No data yet. Import your Apple Health export in Settings.';
  var streak = currentStreak(days);
  document.getElementById('greetStreak').innerHTML = streak >= 3
    ? '<span class="streak-pill">\\u{1F525} ' + streak + '-day streak</span>' : '';
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

  var ringFill = document.getElementById('vRingFill');
  var ringNum = document.getElementById('verdictNum');
  if (ringFill && ringNum) {
    var score = r !== null ? r : 0;
    ringNum.textContent = r !== null ? String(score) : '—';
    var circ = 2 * Math.PI * 20;
    var offset = circ - (score / 100) * circ;
    requestAnimationFrame(function() { ringFill.setAttribute('stroke-dashoffset', String(offset)); });
    var ringColor = score >= 70 ? 'var(--up)' : score >= 45 ? 'var(--caution)' : score > 0 ? 'var(--down)' : 'var(--dim)';
    ringFill.setAttribute('stroke', ringColor);
  }

  var statsEl = document.getElementById('verdictStats');
  if (statsEl) {
    var statsHtml = '';
    var recScore = TODAY.readiness;
    var strainVal = TODAY.strain;
    if (recScore !== null && recScore !== undefined) statsHtml += '<div class="vs-item"><div class="vs-val">' + recScore + '%</div><div class="vs-label">Recovery</div></div>';
    if (strainVal !== null && strainVal !== undefined) statsHtml += '<div class="vs-item"><div class="vs-val">' + (typeof strainVal === 'number' ? strainVal.toFixed(1) : strainVal) + '</div><div class="vs-label">Strain</div></div>';
    statsEl.innerHTML = statsHtml;
  }
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
  var bHrv = document.getElementById('bHrv');
  var bRhr = document.getElementById('bRhr');
  if (hrv !== null) { bHrv.setAttribute('data-target', String(Math.round(hrv))); bHrv.textContent = '0'; animateCountUp(bHrv); }
  else { bHrv.textContent = '—'; }
  if (rhr !== null) { bRhr.setAttribute('data-target', String(Math.round(rhr))); bRhr.textContent = '0'; animateCountUp(bRhr); }
  else { bRhr.textContent = '—'; }
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
  var funWord = n === null ? score.word : n >= 90 ? 'Royalty' : n >= 80 ? 'Crushing it' : n >= 65 ? 'Solid' : score.word;
  document.getElementById('scoreWord').textContent = funWord;
  document.getElementById('scoreWord').style.color = scoreColor(n);
  numEl.classList.toggle('score-gold', n !== null && n >= 90);
  var crownEl = document.getElementById('scoreCrown');
  if (crownEl) crownEl.style.display = n !== null && n >= 90 ? '' : 'none';
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
  var watermark = spark(series, color, 28).replace('class="spark"', 'class="spark watermark"');
  return '<div class="stat" style="cursor:pointer" onclick="openMetric(\\'' + def.key + '\\')">' + watermark + '<div class="label">' + def.label + '</div><div class="value">' + shown + (def.unit ? '<span class="unit">' + def.unit + '</span>' : '') +
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
    if (avgHrv > 45 && avgSteps > 8000 && workoutCount >= 4) { tone = '\\u{1F451} Crown Week'; toneColor = 'var(--gold)'; }
    else if (workoutCount <= 2 || (avgSleep && avgSleep < 6)) { tone = 'Recharging'; toneColor = 'var(--down)'; }
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

  var dayRows = last7Days.map(function (d) {
    return '<tr><td>' + niceDate(d.date) + '</td><td>' + (d.steps ? Math.round(d.steps).toLocaleString() : '—') + '</td><td>' + (d.sleepHours ? d.sleepHours.toFixed(1) + 'h' : '—') + '</td><td>' + (d.exerciseMinutes || '—') + 'm</td></tr>';
  }).join('');

  el.innerHTML = '<div class="recap-card">' +
    '<div class="recap-header"><span class="recap-range">' + range + '</span><span class="recap-tone" style="color:' + toneColor + '">' + tone + '</span></div>' +
    '<div class="recap-grid">' + stats.map(function (s) {
      return '<div class="recap-stat"><div class="rs-val">' + s.val + '</div><div class="rs-label">' + s.label + '</div>' + (s.sparkKey ? spark(s.sparkKey) : '') + '</div>';
    }).join('') + '</div>' +
    '<details class="more"><summary>Day by day</summary><div><table class="simple-table"><tbody>' + dayRows + '</tbody></table></div></details></div>';
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
var allVitalsOpen = false;
function toggleAllVitals() {
  allVitalsOpen = !allVitalsOpen;
  var grid = document.getElementById('allVitals');
  var btn = document.getElementById('allVitalsBtn');
  grid.style.display = allVitalsOpen ? '' : 'none';
  btn.textContent = allVitalsOpen ? 'Hide all vitals' : 'Show all vitals';
  if (allVitalsOpen) renderAllVitals();
}

function renderAllVitals() {
  var el = document.getElementById('allVitals');
  if (!el || !GUIDE_DAYS.length) return;
  var keys = Object.keys(METRIC_GUIDE).filter(function (k) {
    var r = latestReading(k, 30);
    return !!r;
  });
  el.innerHTML = keys.map(function (k) {
    var r = latestReading(k, 30);
    var g = METRIC_GUIDE[k];
    return '<div class="cg-cell"><div class="cg-label">' + (g ? g.label : k) + '</div><div class="cg-val">' + fmtMetricVal(k, r.value) + '</div></div>';
  }).join('');
}

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
    var wkColors = { running: C.up, cycling: C.blue, strength: C.purple, walking: C.pulse, swimming: '#22d3ee', yoga: C.gold, hiking: C.up, pickleball: C.caution, tennis: C.caution };
    listEl.innerHTML = '<div class="workout-cards">' + workoutDays.map(function (d) {
      var name = workoutName(d.workoutType) || 'Workout';
      var key = name.toLowerCase();
      var icon = wkIcons[key] || '\\u{1F4AA}';
      var color = wkColors[key] || C.pulse;
      var meta = [d.workoutMinutes + ' min'];
      if (d.workoutEnergy) meta.push(Math.round(d.workoutEnergy) + ' kcal');
      if (d.workoutDistanceKm) meta.push(d.workoutDistanceKm.toFixed(1) + ' km');
      var pct = Math.round((d.workoutMinutes || 0) / maxMin * 100);
      return '<div class="wk-card" style="border-left-color:' + color + '"><div class="wk-icon" style="background:linear-gradient(135deg,' + color + '26,' + color + '12)">' + icon + '</div><div class="wk-info"><div class="wk-name">' + name + '</div><div class="wk-meta">' + meta.join(' \\u00B7 ') + '</div><div class="wk-dur-bar"><div class="wk-dur-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + color + ',' + color + 'cc)"></div></div></div><div class="wk-date">' + niceDate(d.date) + '</div></div>';
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

// ---- sleep analysis card ----
function renderSleepAnalysisCard(trends) {
  var sa = trends.sleepAnalysis;
  var card = document.getElementById('sleepAnalysisCard');
  if (!sa || !card) return;
  var items = [];
  if (sa.performanceScore !== null) items.push('<div class="brief-item"><div class="brief-n">' + sa.performanceScore + '</div><div class="brief-u">performance</div></div>');
  if (sa.consistencyScore !== null) items.push('<div class="brief-item"><div class="brief-n">' + sa.consistencyScore + '</div><div class="brief-u">consistency</div></div>');
  if (sa.dynamicNeedHours !== null) items.push('<div class="brief-item"><div class="brief-n">' + sa.dynamicNeedHours + 'h</div><div class="brief-u">need tonight</div></div>');
  if (sa.debtHours !== null && sa.debtHours > 0) items.push('<div class="brief-item"><div class="brief-n" style="color:var(--caution)">' + sa.debtHours + 'h</div><div class="brief-u">sleep debt</div></div>');
  if (sa.onsetLatencyMin !== null) items.push('<div class="brief-item"><div class="brief-n">' + sa.onsetLatencyMin + 'm</div><div class="brief-u">fall asleep</div></div>');
  if (sa.optimalBedtime) items.push('<div class="brief-item"><div class="brief-n">' + sa.optimalBedtime + '</div><div class="brief-u">bedtime</div></div>');
  if (items.length) {
    card.style.display = 'block';
    document.getElementById('sleepAnalysisRow').innerHTML = items.join('');
  }
}

// ---- recovery breakdown ----
function renderRecoveryBreakdown(trends) {
  var r = trends.recovery;
  var card = document.getElementById('recoveryBreakdown');
  if (!r || !card) return;
  card.style.display = 'block';
  var pillars = [
    { label: 'HRV', z: r.hrvZ, weight: 25 },
    { label: 'Resting HR', z: r.rhrZ, weight: 25 },
    { label: 'Resp rate', z: r.respRateZ, weight: 15 },
    { label: 'SpO2', z: r.spo2Z, weight: 10 },
    { label: 'Wrist temp', z: r.tempDeviationC !== null ? (Math.abs(r.tempDeviationC) > 0.3 ? -1 : 0.5) : null, weight: 10 },
    { label: 'Sleep', z: r.sleepScore !== null ? (r.sleepScore - 50) / 25 : null, weight: 15 },
  ];
  var el = document.getElementById('recoveryPillars');
  el.innerHTML = pillars.map(function (p) {
    if (p.z === null) return '<div class="rp-item"><div class="rp-label">' + p.label + '</div><div class="rp-val" style="color:var(--faint)">—</div></div>';
    var pct = Math.max(0, Math.min(100, 50 + p.z * 25));
    var color = pct >= 60 ? 'var(--up)' : pct >= 40 ? 'var(--caution)' : 'var(--down)';
    return '<div class="rp-item"><div class="rp-label">' + p.label + '</div><div class="rp-val" style="color:' + color + '">' + Math.round(pct) + '</div><div class="rp-bar"><div class="rp-fill" style="width:' + pct + '%;background:' + color + '"></div></div></div>';
  }).join('');
}

// ---- illness card ----
function renderIllnessCard(trends) {
  var ill = trends.illnessSignal;
  var card = document.getElementById('illnessCard');
  if (!ill || !card || ill.likelihood === 'low') { if (card) card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.classList.toggle('critical', ill.likelihood === 'high');
  document.getElementById('illnessTitle').textContent = (ill.likelihood === 'high' ? 'High' : 'Moderate') + ' illness likelihood (' + ill.score + '/100)';
  document.getElementById('illnessBody').textContent = ill.detail;
}

// ---- workout analytics ----
async function loadWorkoutAnalytics() {
  try {
    var data = await authedFetch('/api/workouts/analytics');
    renderWorkoutPRs(data.prs || []);
    renderMuscleBalance(data.muscleBalance || []);
    renderWorkoutFreq(data.frequency || []);
  } catch (e) {}
}

function renderWorkoutPRs(prs) {
  var card = document.getElementById('workoutPRsCard');
  if (!prs.length || !card) return;
  card.style.display = 'block';
  var weightPRs = prs.filter(function (p) { return p.metric === 'weight'; }).slice(0, 10);
  if (!weightPRs.length) { card.style.display = 'none'; return; }
  document.getElementById('workoutPRs').innerHTML = '<ul class="pr-list">' + weightPRs.map(function (p) {
    return '<li class="pr-item"><div><div class="pr-exercise">' + p.exercise + '</div><div class="pr-meta">' + p.date + ' · ' + p.metric + '</div></div><div class="pr-value">' + p.value + (p.metric === 'weight' ? ' kg' : p.metric === 'reps' ? ' reps' : '') + '</div></li>';
  }).join('') + '</ul>';
}

function renderMuscleBalance(balance) {
  var card = document.getElementById('muscleBalanceCard');
  if (!balance.length || !card) return;
  card.style.display = 'block';
  var cats = {};
  balance.forEach(function (b) {
    cats[b.category] = (cats[b.category] || 0) + b.hitsLast30;
  });
  var maxVal = Math.max.apply(null, Object.values(cats).concat([1]));
  var colors = { push: 'var(--pulse)', pull: 'var(--up)', legs: 'var(--caution)', core: 'var(--royal)' };
  document.getElementById('muscleBalanceChart').innerHTML = '<div class="mb-bars">' + ['push', 'pull', 'legs', 'core'].map(function (cat) {
    var val = cats[cat] || 0;
    var pct = Math.round(val / maxVal * 100);
    return '<div class="mb-row"><div class="mb-label">' + cat + '</div><div class="mb-bar-wrap"><div class="mb-bar-fill" style="width:' + pct + '%;background:' + (colors[cat] || 'var(--dim)') + '"></div></div><div class="mb-count">' + val + '</div></div>';
  }).join('') + '</div>';
}

function renderWorkoutFreq(freq) {
  var card = document.getElementById('workoutFreqCard');
  if (!freq.length || !card) return;
  card.style.display = 'block';
  document.getElementById('workoutFreqChart').innerHTML = '<ul class="freq-list">' + freq.map(function (f) {
    var cls = f.change > 0 ? 'up' : f.change < 0 ? 'down' : '';
    return '<li class="freq-item"><span style="text-transform:capitalize">' + f.type + ' <span class="sub">' + f.countLast30 + 'x</span></span><span class="freq-change ' + cls + '">' + (f.change > 0 ? '+' : '') + f.change + '</span></li>';
  }).join('') + '</ul>';
}

// ---- journal correlations ----
function renderJournalCorrelations(jc) {
  var card = document.getElementById('journalCorrelationsCard');
  if (!jc || !jc.length || !card) return;
  card.style.display = 'block';
  document.getElementById('journalCorrelationsBody').innerHTML = '<ul class="ai-list">' + jc.map(function (c) {
    var arrow = c.direction === 'positive' ? '↑' : c.direction === 'negative' ? '↓' : '—';
    var rStr = c.r !== null ? ' (r=' + c.r.toFixed(2) + ')' : '';
    return '<li><strong>' + c.label + '</strong> ' + arrow + rStr + '<br><span class="sub">' + c.hypothesis + (c.effectSummary ? ' ' + c.effectSummary : '') + '</span></li>';
  }).join('') + '</ul>';
}

// ---- alerts ----
async function loadAlerts() {
  try {
    var data = await authedFetch('/api/alerts');
    if (data.alerts && data.alerts.length) {
      renderAlertBanner(data.alerts[0]);
    }
  } catch (e) {}
}

function renderAlertBanner(alert) {
  var verdict = document.getElementById('verdict');
  if (!verdict || !alert || alert.severity === 'info') return;
  var el = document.createElement('div');
  el.className = 'card illness-card' + (alert.severity === 'critical' ? ' critical' : '');
  el.innerHTML = '<div class="illness-head"><span class="illness-icon">' + (alert.severity === 'critical' ? '⚠' : '🟡') + '</span><span class="illness-title">' + alert.title + '</span></div><div class="illness-body sub">' + alert.body + '</div>';
  verdict.parentNode.insertBefore(el, verdict.nextSibling.nextSibling);
}

async function loadCoach() {
  try {
    var res = await authedFetch('/api/coach');
    document.getElementById('coachLoading').style.display = 'none';

    // Directive card
    if (res.directive) {
      var d = res.directive;
      document.getElementById('coachHeadline').textContent = d.headline || 'Coach Directive';
      document.getElementById('coachBody').textContent = d.paragraph || '';

      // Strain dial
      var max = d.strainBudget ? d.strainBudget.maxStrain : 0;
      var circ = 2 * Math.PI * 28;
      var arc = document.getElementById('sbArc');
      arc.setAttribute('stroke-dasharray', circ);
      arc.setAttribute('stroke-dashoffset', circ - (max / 21) * circ);
      var zoneColors = { recovery: 'var(--down)', easy: 'var(--caution)', moderate: 'var(--dim)', push: 'var(--up)', peak: 'var(--pulse)' };
      var zone = d.strainBudget ? d.strainBudget.zone : 'moderate';
      arc.style.stroke = zoneColors[zone] || 'var(--dim)';
      document.getElementById('sbNum').textContent = max.toFixed(1);
      var zEl = document.getElementById('sbZone');
      zEl.textContent = zone;
      zEl.className = 'sb-zone ' + zone;
      var rationale = [];
      if (d.strainBudget && d.strainBudget.timeCapMin) rationale.push(d.strainBudget.timeCapMin + ' min max session');
      if (d.strainBudget && d.strainBudget.rationale) rationale.push(d.strainBudget.rationale);
      document.getElementById('sbRationale').textContent = rationale.join(' · ');

      // Injury risk
      var ir = d.injuryRisk || { score: 0, level: 'low', factors: [] };
      var irLabel = document.getElementById('irLabel');
      irLabel.textContent = ir.level.toUpperCase();
      irLabel.style.color = ir.level === 'high' ? 'var(--down)' : ir.level === 'moderate' ? 'var(--caution)' : 'var(--up)';
      document.getElementById('irScore').textContent = ir.score + '/100';
      var fill = document.getElementById('irFill');
      fill.style.width = ir.score + '%';
      fill.style.background = ir.level === 'high' ? 'var(--down)' : ir.level === 'moderate' ? 'var(--caution)' : 'var(--up)';
      document.getElementById('irFactors').textContent = ir.factors.map(function (f) { return f.detail; }).join(' · ');

      // Rx items
      var rxEl = document.getElementById('coachRx');
      var rxItems = [];
      if (d.sleepRx) rxItems.push({ icon: '💤', text: d.sleepRx });
      if (d.nutritionCue) rxItems.push({ icon: '🍽', text: d.nutritionCue });
      if (d.mentalNote) rxItems.push({ icon: '🧠', text: d.mentalNote });
      rxEl.innerHTML = rxItems.map(function (r) { return '<div class="coach-rx-item"><span class="coach-rx-icon">' + r.icon + '</span><span>' + r.text + '</span></div>'; }).join('');

      document.getElementById('coachDirectiveCard').style.display = 'block';
    }

    // Patterns card
    if (res.patterns && res.patterns.length) {
      var pl = document.getElementById('patternList');
      pl.innerHTML = res.patterns.map(function (p) {
        return '<div class="pattern-item ' + (p.category || '') + '">' +
          '<div class="pattern-title">' + (p.label || p.metric) + '</div>' +
          '<div class="pattern-insight">' + (p.insight || '') + '</div>' +
          '<div class="pattern-meta">confidence ' + Math.round((p.confidence || 0) * 100) + '% · ' + (p.sampleSize || 0) + ' data points</div>' +
          '</div>';
      }).join('');
      document.getElementById('coachPatternsCard').style.display = 'block';
    }

    // Report card
    if (res.reportCard) {
      var rc = res.reportCard;
      var rcO = document.getElementById('rcOverall');
      rcO.textContent = rc.overall;
      rcO.className = 'rc-overall ' + rc.overall.charAt(0).toLowerCase();
      var doms = document.getElementById('rcDomains');
      var domainOrder = ['training', 'recovery', 'sleep', 'activity', 'consistency'];
      doms.innerHTML = domainOrder.map(function (k) {
        return '<div class="rc-domain"><div class="rc-domain-label">' + k + '</div><div class="rc-domain-grade">' + (rc.domains[k] || '—') + '</div></div>';
      }).join('');
      var hl = document.getElementById('rcHighlights');
      var items = (rc.highlights || []).map(function (h) { return '<li class="good">' + h + '</li>'; })
        .concat((rc.improvements || []).map(function (i) { return '<li class="improve">' + i + '</li>'; }));
      hl.innerHTML = items.join('');
      document.getElementById('coachReportCard').style.display = 'block';
    }

    // Predictions
    if (res.predictions && res.predictions.length) {
      var predEl = document.getElementById('predList');
      predEl.innerHTML = res.predictions.map(function (p) {
        var dir = (p.trajectory || 'flat').toLowerCase();
        return '<div class="pred-item">' +
          '<div class="pred-header"><span class="pred-label">' + (p.label || p.metric) + '</span>' +
          '<span class="pred-trajectory ' + dir + '">' + dir + '</span></div>' +
          '<div class="pred-detail">' +
            'Current: ' + (p.current != null ? p.current.toFixed(1) : '—') +
            (p.ratePerMonth != null ? ' · ' + (p.ratePerMonth > 0 ? '+' : '') + p.ratePerMonth.toFixed(2) + '/mo' : '') +
            (p.predictedValue != null ? ' · Predicted: ' + p.predictedValue.toFixed(1) + ' in 90d' : '') +
          '</div></div>';
      }).join('');
      document.getElementById('coachPredictionsCard').style.display = 'block';
    }
  } catch (e) {
    document.getElementById('coachLoading').textContent = 'Could not load coaching data.';
  }
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
  renderRecoveryBreakdown(trends);
  renderIllnessCard(trends);
  renderSleepAnalysisCard(trends);
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
  loadWorkouts();
  loadWorkoutAnalytics();
  loadTemplates();
  loadUnloggedPrompts();
  loadProgression();
  loadRecommendations();
  loadPremium();
  var _todayForBody = { today: today, recoveryScore: trends.readinessScore, recoveryLabel: trends.readinessLabel };
  renderBodyHome(_todayForBody);
  loadBody().then(function() { renderBodyHome(_todayForBody); });
  loadCoach();
  loadAlerts();
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
    renderJournalCorrelations(res.journalCorrelations || []);
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
  ['ciAlcohol','ciCaffeine','ciHydration','ciNote'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
  ['ciLateMeal','ciScreen','ciIllness'].forEach(function (id) { var el = document.getElementById(id); if (el) el.checked = false; });
}
function ciSel(el) {
  el.parentElement.querySelectorAll('.ci-opt').forEach(function (o) { o.classList.remove('sel'); });
  el.classList.add('sel');
}
function saveCheckin() {
  var energySel = document.querySelector('#ciEnergy .ci-opt.sel');
  var stressSel = document.querySelector('#ciStress .ci-opt.sel');
  var sorenessSel = document.querySelector('#ciSoreness .ci-opt.sel');

  var note = {
    date: new Date().toISOString().slice(0, 10),
    energy: energySel ? parseInt(energySel.dataset.v) : undefined,
    stress: stressSel ? parseInt(stressSel.dataset.v) : undefined,
    soreness: sorenessSel ? parseInt(sorenessSel.dataset.v) : undefined,
    alcoholDrinks: parseInt(document.getElementById('ciAlcohol').value) || undefined,
    caffeineMg: parseInt(document.getElementById('ciCaffeine').value) || undefined,
    hydrationLiters: parseFloat(document.getElementById('ciHydration').value) || undefined,
    lateMeal: document.getElementById('ciLateMeal').checked || undefined,
    screenBeforeBed: document.getElementById('ciScreen').checked || undefined,
    illness: document.getElementById('ciIllness').checked || undefined,
    note: document.getElementById('ciNote').value.trim() || undefined,
  };

  authedFetch('/api/knowledge/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note)
  }).catch(function () {});

  closeCheckin();
  showToast('📝 Check-in saved', 'success');
}
function showCheckinFab() {
  var fab = document.getElementById('checkinFab');
  if (fab) fab.classList.add('show');
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
