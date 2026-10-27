export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Health</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js"></script>
<style>
  :root {
    --bg:#05070a; --bg2:#0a0d12; --card:#12151b; --card2:#171b22; --border:#23272f;
    --text:#f2f3f5; --muted:#8b92a0; --faint:#565d6b;
    --heart:#ff375f; --activity:#30d158; --sleep:#5e5ce6; --mobility:#64d2ff; --ai:#bf5af2; --amber:#ffd60a;
    --good:#30d158; --bad:#ff453a; --accent:#0a84ff;
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html,body { margin:0; padding:0; }
  body {
    background:radial-gradient(ellipse 1200px 600px at 50% -10%, #141a24 0%, var(--bg) 55%);
    color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
    min-height:100vh; -webkit-font-smoothing:antialiased;
  }
  a { color:inherit; }
  .sub { color:var(--muted); font-size:13px; line-height:1.5; }
  .faint { color:var(--faint); font-size:12px; }

  /* ---- gate ---- */
  #gate { max-width:380px; margin:18vh auto; padding:32px 28px; background:var(--card); border:1px solid var(--border); border-radius:20px; text-align:center; }
  #gate .mark { font-size:34px; margin-bottom:6px; }
  #gate h1 { font-size:19px; margin:0 0 6px; font-weight:650; }
  #gate input { width:100%; padding:12px 14px; margin:14px 0 10px; border-radius:12px; border:1px solid var(--border); background:var(--bg2); color:var(--text); font-size:15px; text-align:center; }
  #gate input:focus { outline:none; border-color:var(--accent); }
  button { font:inherit; }
  .btn { padding:11px 18px; border-radius:12px; border:none; background:var(--accent); color:#fff; font-weight:600; cursor:pointer; font-size:14px; transition:opacity .15s, transform .1s; }
  .btn:hover { opacity:.88; } .btn:active { transform:scale(.97); }
  .btn:disabled { opacity:.45; cursor:default; }
  .btn-ghost { background:var(--card2); color:var(--text); border:1px solid var(--border); }
  .btn-sm { padding:7px 12px; font-size:12.5px; border-radius:9px; }
  #gate .btn { width:100%; }
  #gateError { color:var(--bad); min-height:16px; }

  /* ---- shell ---- */
  #app { display:none; max-width:1180px; margin:0 auto; padding:0 16px 60px; }
  header.top { position:sticky; top:0; z-index:20; backdrop-filter:blur(14px); background:rgba(5,7,10,.78); padding:18px 16px 12px; margin:0 -16px 18px; border-bottom:1px solid var(--border); }
  header.top .row { display:flex; align-items:baseline; justify-content:space-between; max-width:1180px; margin:0 auto; }
  header.top h1 { font-size:22px; margin:0; font-weight:700; letter-spacing:-.02em; }
  .tabs { display:flex; gap:6px; overflow-x:auto; margin-top:14px; padding-bottom:2px; max-width:1180px; margin-left:auto; margin-right:auto; scrollbar-width:none; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab { white-space:nowrap; padding:8px 14px; border-radius:999px; background:transparent; border:1px solid var(--border); color:var(--muted); cursor:pointer; font-size:13.5px; font-weight:560; }
  .tab.active { background:var(--text); color:#05070a; border-color:var(--text); }

  .section { display:none; }
  .section.active { display:block; animation:fadein .25s ease; }
  @keyframes fadein { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none; } }

  /* ---- hero ---- */
  .hero { display:grid; grid-template-columns:auto 1fr; gap:22px; background:linear-gradient(155deg,#161a22,#0e1116); border:1px solid var(--border); border-radius:22px; padding:22px; margin-bottom:16px; align-items:center; }
  .ring-wrap { position:relative; width:148px; height:148px; flex-shrink:0; }
  .ring-wrap svg { transform:rotate(-90deg); }
  .ring-label { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .ring-label .n { font-size:34px; font-weight:750; letter-spacing:-.02em; line-height:1; }
  .ring-label .u { font-size:11px; color:var(--muted); margin-top:4px; text-transform:uppercase; letter-spacing:.06em; }
  .hero-meta .delta { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:13px; font-weight:650; margin-bottom:8px; }
  .delta.good { background:rgba(48,209,88,.15); color:var(--good); }
  .delta.bad { background:rgba(255,69,58,.15); color:var(--bad); }
  .hero-meta h2 { margin:0 0 4px; font-size:16px; }
  .readiness-chip { display:inline-flex; align-items:center; gap:8px; margin-top:10px; padding:6px 12px; border-radius:12px; background:var(--card2); border:1px solid var(--border); font-size:12.5px; }
  .dot { width:8px; height:8px; border-radius:50%; }

  /* ---- grid / cards ---- */
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:16px; }
  .stat { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:14px 16px; }
  .stat .label { color:var(--muted); font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; display:flex; align-items:center; gap:6px; }
  .stat .value { font-size:21px; font-weight:700; margin-top:6px; letter-spacing:-.01em; }
  .stat .value .unit { font-size:12px; color:var(--muted); font-weight:500; margin-left:3px; }
  .stat .trend { font-size:11.5px; margin-top:4px; font-weight:600; }
  .trend.up { color:var(--good); } .trend.down { color:var(--bad); } .trend.flat { color:var(--faint); }

  .card { background:var(--card); border:1px solid var(--border); border-radius:18px; padding:18px; margin-bottom:14px; }
  .card h3 { margin:0 0 4px; font-size:14.5px; font-weight:650; display:flex; align-items:center; gap:8px; }
  .card .card-sub { color:var(--muted); font-size:12.5px; margin-bottom:12px; }
  .simple-table { width:100%; font-size:13px; border-collapse:collapse; }
  .simple-table td { padding:6px 10px 6px 0; border-bottom:1px solid #1a1e26; color:var(--text); }
  .simple-table td:first-child { color:var(--muted); white-space:nowrap; }
  canvas { max-height:240px; }

  /* ---- AI insights ---- */
  .ai-card { background:linear-gradient(155deg,#1c1427,#12151b); border:1px solid #2a2340; }
  .ai-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .ai-headline { font-size:16px; font-weight:650; margin:2px 0 10px; }
  .ai-list { margin:0 0 10px; padding-left:18px; font-size:13.5px; line-height:1.7; color:#dcdde2; }
  .ai-list.concerns li { color:#ffb4a8; }
  .ai-list.recs li { color:#c9b8ff; }
  .ai-section-title { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:12px 0 4px; }
  .ai-meta { color:var(--faint); font-size:11.5px; margin-top:8px; }
  .skeleton { height:12px; border-radius:6px; background:linear-gradient(90deg,#1f232c,#2a2f3a,#1f232c); background-size:200% 100%; animation:shimmer 1.4s infinite; margin:8px 0; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }

  /* ---- bests / markers ---- */
  .bests { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; }
  .best { background:var(--card2); border-radius:14px; padding:12px 14px; }
  .best .label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .best .value { font-size:17px; font-weight:700; margin-top:4px; }
  .best .date { color:var(--faint); font-size:11px; margin-top:2px; }

  .extra-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:8px; }
  .extra-tile { background:var(--card2); border-radius:12px; padding:10px 12px; }
  .extra-tile .label { color:var(--muted); font-size:10.5px; }
  .extra-tile .value { font-size:15px; font-weight:650; margin-top:2px; }

  .markers-list { display:flex; flex-direction:column; gap:10px; }
  .marker-row { display:flex; align-items:center; gap:10px; }
  .marker-row .mname { flex:1; font-size:13px; color:var(--muted); }
  .marker-row .mval { font-size:13px; font-weight:650; width:64px; text-align:right; }
  .marker-bar { flex:2; height:6px; background:var(--card2); border-radius:4px; overflow:hidden; }
  .marker-bar > div { height:100%; border-radius:4px; }

  /* ---- profile / import ---- */
  .profile-form, .import-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .profile-form input, .profile-form select { padding:9px 12px; border-radius:10px; border:1px solid var(--border); background:var(--bg2); color:var(--text); font-size:13.5px; }
  input[type="file"] { color:var(--muted); font-size:13px; }
  progress { width:100%; height:8px; border-radius:6px; overflow:hidden; accent-color:var(--accent); margin-top:8px; }

  footer { color:var(--faint); font-size:11.5px; text-align:center; padding:28px 0 10px; }

  @media (max-width:560px) {
    .hero { grid-template-columns:1fr; text-align:center; }
    .ring-wrap { margin:0 auto; }
    .hero-meta .delta { margin-left:auto; margin-right:auto; }
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
      <button class="tab" data-tab="heart" onclick="showTab('heart')">Heart &amp; Recovery</button>
      <button class="tab" data-tab="activity" onclick="showTab('activity')">Activity &amp; Mobility</button>
      <button class="tab" data-tab="sleep" onclick="showTab('sleep')">Sleep</button>
      <button class="tab" data-tab="age" onclick="showTab('age')">Biological Age</button>
      <button class="tab" data-tab="more" onclick="showTab('more')">Everything Else</button>
      <button class="tab" data-tab="settings" onclick="showTab('settings')">Import &amp; Settings</button>
    </nav>
  </header>

  <!-- OVERVIEW -->
  <section class="section active" id="tab-overview">
    <div class="hero">
      <div class="ring-wrap">
        <svg width="148" height="148" viewBox="0 0 148 148">
          <circle cx="74" cy="74" r="64" fill="none" stroke="#1d222b" stroke-width="12" />
          <circle id="bioRing" cx="74" cy="74" r="64" fill="none" stroke="url(#ringGrad)" stroke-width="12" stroke-linecap="round" stroke-dasharray="402" stroke-dashoffset="402" />
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#64d2ff" /><stop offset="100%" stop-color="#5e5ce6" />
            </linearGradient>
          </defs>
        </svg>
        <div class="ring-label"><div class="n" id="bioAgeNum">—</div><div class="u">bio age</div></div>
      </div>
      <div class="hero-meta">
        <div id="bioDelta" class="delta good">—</div>
        <h2 id="bioHeadline">Set your profile to see your biological age</h2>
        <div class="sub" id="bioSub"></div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <div class="readiness-chip" id="readinessChip" style="display:none;">
            <span class="dot" id="readinessDot"></span>
            <span id="readinessText">Readiness —</span>
          </div>
          <div class="readiness-chip" id="strainChip" style="display:none;">
            <span class="dot" id="strainDot" style="background:#ff9f0a;"></span>
            <span id="strainText">Strain —</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid" id="quickStats"></div>

    <div class="card ai-card">
      <div class="ai-head">
        <h3>✦ AI Insights</h3>
        <button class="btn btn-ghost btn-sm" id="aiRetryBtn" onclick="loadInsights(true)">Retry</button>
      </div>
      <div id="aiBody">
        <div class="skeleton" style="width:70%"></div>
        <div class="skeleton" style="width:90%"></div>
        <div class="skeleton" style="width:55%"></div>
      </div>
    </div>

    <div class="card">
      <h3>Personal bests</h3>
      <div class="bests" id="bestsGrid"></div>
    </div>
  </section>

  <!-- HEART & RECOVERY -->
  <section class="section" id="tab-heart">
    <div class="card"><h3>Resting heart rate &amp; HRV</h3><canvas id="heartChart"></canvas></div>
    <div class="card"><h3>Heart rate range (avg / min / max)</h3><canvas id="hrRangeChart"></canvas></div>
    <div class="card"><h3>VO2max trend</h3><canvas id="vo2Chart"></canvas></div>
    <div class="card">
      <h3>Readiness, explained</h3>
      <div class="card-sub">The score in the chip at the top blends today's HRV and resting HR against your own trailing 30-day average, plus last night's sleep vs. a 7.5h target — all relative to <em>your</em> baseline, never compared across people.</div>
    </div>
  </section>

  <!-- ACTIVITY & MOBILITY -->
  <section class="section" id="tab-activity">
    <div class="card"><h3>Steps</h3><canvas id="stepsChart"></canvas></div>
    <div class="card"><h3>Active energy &amp; exercise minutes</h3><canvas id="energyChart"></canvas></div>
    <div class="card"><h3>Stand minutes &amp; flights climbed</h3><canvas id="standChart"></canvas></div>
    <div class="card"><h3>Walking speed &amp; gait quality</h3><div class="card-sub">Gait speed is one of the better-studied single predictors of healthy aging.</div><canvas id="gaitChart"></canvas></div>
    <div class="card"><h3>Workouts</h3><canvas id="workoutChart"></canvas></div>
    <div class="card">
      <h3>Recent sessions</h3>
      <div id="workoutList" class="card-sub">No workout sessions in the imported data yet.</div>
    </div>
  </section>

  <!-- SLEEP -->
  <section class="section" id="tab-sleep">
    <div class="card"><h3>Sleep duration</h3><canvas id="sleepChart"></canvas></div>
    <div class="card"><h3>Sleep stages</h3><div class="card-sub">Core, deep, REM and awake time, where your export has stage-level detail.</div><canvas id="sleepStagesChart"></canvas></div>
    <div class="card"><h3>Weight</h3><canvas id="weightChart"></canvas></div>
  </section>

  <!-- BIOLOGICAL AGE -->
  <section class="section" id="tab-age">
    <div class="card"><h3>Biological vs chronological age</h3><canvas id="ageChart"></canvas></div>
    <div class="card">
      <h3>What's driving it</h3>
      <div class="card-sub">Each marker's "marker age" is the age at which that value is typical. Closer to the left (younger) is better.</div>
      <div class="markers-list" id="markersList"></div>
    </div>
  </section>

  <!-- EVERYTHING ELSE -->
  <section class="section" id="tab-more">
    <div class="card">
      <h3>Everything else your export contained</h3>
      <div class="card-sub">Every HealthKit type that isn't one of the named metrics elsewhere in this dashboard — captured and stored, even without a dedicated chart yet.</div>
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
      <h3>Import Apple Health export</h3>
      <p class="card-sub">iPhone: Health app → profile picture → Export All Health Data → share the .zip here. Parsing happens entirely in this browser; only the small daily summaries are sent to your Worker.</p>
      <div class="import-row">
        <input id="importFile" type="file" accept=".zip" />
        <button class="btn btn-sm" onclick="importExportZip()">Import</button>
      </div>
      <progress id="importProgress" value="0" max="100" style="display:none;"></progress>
      <p id="importStatus" class="sub"></p>
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
  boot();
}

async function authedFetch(path, opts) {
  opts = opts || {};
  var token = getToken();
  var res = await fetch(path, Object.assign({}, opts, { headers: Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + token }) }));
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('request failed: ' + res.status);
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

function showTab(id) {
  document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelector('.tab[data-tab="' + id + '"]').classList.add('active');
  try { localStorage.setItem('healthTab', id); } catch (e) {}
}

async function saveProfile(e) {
  e.preventDefault();
  var birthDate = document.getElementById('birthDate').value;
  var sex = document.getElementById('sex').value;
  var heightCm = Number(document.getElementById('heightCm').value) || undefined;
  await authedFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birthDate: birthDate, sex: sex, heightCm: heightCm }) });
  boot();
}

var charts = {};
function upsertChart(id, config) {
  var el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) charts[id].destroy();
  config.options = Object.assign({ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
    plugins:{ legend:{ labels:{ color:'#8b92a0', boxWidth:10, font:{size:11} } } },
    scales:{ x:{ ticks:{ color:'#565d6b', maxTicksLimit:8, font:{size:10} }, grid:{ color:'#1a1e26' } },
             y:{ ticks:{ color:'#565d6b', font:{size:10} }, grid:{ color:'#1a1e26' } } } }, config.options || {});
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

function statTile(label, value, unit, trend, goodWhenUp) {
  var t = trend;
  var cls = t.cls;
  if (cls !== 'flat' && goodWhenUp === false) cls = (cls === 'up') ? 'down' : 'up';
  return '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + (unit ? '<span class="unit">' + unit + '</span>' : '') + '</div>' +
    (t.text ? '<div class="trend ' + cls + '">' + t.text + ' vs last wk</div>' : '<div class="trend flat">—</div>') + '</div>';
}

function renderQuickStats(today, trends) {
  var l7 = trends.last7, p7 = trends.prev7;
  var html = '';
  html += statTile('Steps today', fmtCompact(today.steps), '', trendArrow(l7.steps, p7.steps), true);
  html += statTile('Resting HR', fmt(today.restingHeartRate, 0), 'bpm', trendArrow(l7.restingHeartRate, p7.restingHeartRate), false);
  html += statTile('HRV', fmt(today.hrv, 0), 'ms', trendArrow(l7.hrv, p7.hrv), true);
  html += statTile('VO2max', fmt(l7.vo2max, 1), '', trendArrow(l7.vo2max, p7.vo2max), true);
  html += statTile('Sleep', fmt(today.sleepHours, 1), 'hr', trendArrow(l7.sleepHours, p7.sleepHours), true);
  html += statTile('Weight', fmt(today.weightKg, 1), 'kg', trendArrow(l7.weightKg, p7.weightKg), null);
  document.getElementById('quickStats').innerHTML = html;
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

function renderReadiness(score) {
  var chip = document.getElementById('readinessChip');
  if (score === null || score === undefined) { chip.style.display = 'none'; return; }
  chip.style.display = 'inline-flex';
  var color = score >= 70 ? '#30d158' : score >= 45 ? '#ffd60a' : '#ff453a';
  document.getElementById('readinessDot').style.background = color;
  document.getElementById('readinessText').textContent = 'Readiness ' + score + '/100';
}

function renderStrain(strain) {
  var chip = document.getElementById('strainChip');
  if (strain === null || strain === undefined) { chip.style.display = 'none'; return; }
  chip.style.display = 'inline-flex';
  var color = strain >= 14 ? '#ff453a' : strain >= 8 ? '#ff9f0a' : '#30d158';
  document.getElementById('strainDot').style.background = color;
  document.getElementById('strainText').textContent = 'Strain ' + fmt(strain, 1) + '/21';
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
    return '<div class="extra-tile"><div class="label">' + k.replace(/([A-Z])/g, ' $1').trim() + '</div><div class="value">' + fmt(latest.extra[k], 2) + '</div></div>';
  }).join('') + '</div>';
}

function renderBioHero(latest, days) {
  var ring = document.getElementById('bioRing');
  var circumference = 402;
  if (!latest) {
    document.getElementById('bioAgeNum').textContent = '—';
    document.getElementById('bioHeadline').textContent = 'Set your profile in Settings to see your biological age';
    document.getElementById('bioDelta').style.display = 'none';
    ring.setAttribute('stroke-dashoffset', circumference);
    return;
  }
  document.getElementById('bioDelta').style.display = 'inline-flex';
  document.getElementById('bioAgeNum').textContent = fmt(latest.biologicalAge, 0);
  var frac = Math.max(0.04, Math.min(1, latest.biologicalAge / 100));
  ring.setAttribute('stroke-dashoffset', String(circumference * (1 - frac)));
  var delta = latest.deltaYears;
  var deltaEl = document.getElementById('bioDelta');
  deltaEl.className = 'delta ' + (delta <= 0 ? 'good' : 'bad');
  deltaEl.textContent = (delta > 0 ? '+' : '') + fmt(delta, 1) + ' yrs vs actual age ' + fmt(latest.chronologicalAge, 0);
  document.getElementById('bioHeadline').textContent = delta <= 0
    ? 'Your body is tracking younger than your years'
    : 'A few markers are pulling your estimate up';
  document.getElementById('bioSub').textContent = days.length ? ('Based on your last 7 days of data, as of ' + latest.date) : '';
}

function renderMarkers(latest) {
  var el = document.getElementById('markersList');
  if (!latest || !latest.markers.length) { el.innerHTML = '<p class="sub">No markers yet.</p>'; return; }
  var colors = ['#64d2ff', '#5e5ce6', '#ff375f', '#30d158', '#ffd60a'];
  el.innerHTML = latest.markers.map(function (m, i) {
    var pct = Math.max(4, Math.min(100, (m.markerAge / 90) * 100));
    return '<div class="marker-row"><div class="mname">' + m.marker + '</div>' +
      '<div class="marker-bar"><div style="width:' + pct + '%;background:' + colors[i % colors.length] + '"></div></div>' +
      '<div class="mval">' + fmt(m.markerAge, 0) + 'y</div></div>';
  }).join('');
}

async function loadInsights(force) {
  var btn = document.getElementById('aiRetryBtn');
  var body = document.getElementById('aiBody');
  btn.disabled = true;
  if (force) body.innerHTML = '<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:55%"></div>';
  try {
    var res = await authedFetch('/api/insights' + (force ? '?force=1' : ''));
    var ins = res.insights;
    var html = '<div class="ai-headline">' + ins.headline + '</div>';
    html += '<ul class="ai-list">' + ins.insights.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    if (ins.concerns && ins.concerns.length) {
      html += '<div class="ai-section-title">Worth a look</div><ul class="ai-list concerns">' + ins.concerns.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    }
    if (ins.recommendations && ins.recommendations.length) {
      html += '<div class="ai-section-title">Try next</div><ul class="ai-list recs">' + ins.recommendations.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    }
    html += '<div class="ai-meta">' + (res.cached ? 'Cached · generated ' + timeAgo(res.generatedAt) : 'Freshly generated') + '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<p class="sub">Couldn\\'t load AI insights (' + err.message + ').</p>';
  } finally {
    btn.disabled = false;
  }
}

function buildCharts(days, history) {
  var labels = days.map(function (d) { return d.date; });
  var pick = function (f) { return days.map(function (d) { return d[f] !== undefined ? d[f] : null; }); };

  upsertChart('heartChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Resting HR', data: pick('restingHeartRate'), borderColor: '#ff375f', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'HRV', data: pick('hrv'), borderColor: '#64d2ff', backgroundColor: 'transparent', tension: .3, pointRadius: 0, borderWidth: 1.5 },
  ]}});

  upsertChart('hrRangeChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Avg HR', data: pick('heartRateAvg'), borderColor: '#ff9f0a', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Max HR', data: pick('heartRateMax'), borderColor: '#ff453a', tension: .3, pointRadius: 0, borderWidth: 1 },
    { label: 'Min HR', data: pick('heartRateMin'), borderColor: '#30d158', tension: .3, pointRadius: 0, borderWidth: 1 },
  ]}});

  upsertChart('vo2Chart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'VO2max', data: pick('vo2max'), borderColor: '#bf5af2', tension: .3, pointRadius: 2, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('stepsChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Steps', data: pick('steps'), backgroundColor: '#30d15899' },
  ]}});

  upsertChart('energyChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Active energy (kcal)', data: pick('activeEnergy'), backgroundColor: '#ff9f0a99' },
    { label: 'Exercise (min)', data: pick('exerciseMinutes'), backgroundColor: '#64d2ff99' },
  ]}});

  upsertChart('standChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Stand minutes', data: pick('standMinutes'), backgroundColor: '#30d15899' },
    { label: 'Flights climbed', data: pick('flightsClimbed'), backgroundColor: '#ffd60a99' },
  ]}});

  upsertChart('gaitChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Walking speed (m/s)', data: pick('walkingSpeed'), borderColor: '#64d2ff', tension: .3, pointRadius: 0, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('workoutChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Workout minutes', data: pick('workoutMinutes'), backgroundColor: '#ff9f0a99' },
  ]}});

  var workoutDays = days.filter(function (d) { return d.workoutCount; }).slice(-15).reverse();
  var listEl = document.getElementById('workoutList');
  if (workoutDays.length === 0) {
    listEl.textContent = 'No workout sessions in the imported data yet.';
  } else {
    listEl.innerHTML = '<table class="simple-table"><tbody>' + workoutDays.map(function (d) {
      var parts = [d.date, d.workoutType || 'Workout', d.workoutMinutes + ' min'];
      if (d.workoutEnergy) parts.push(Math.round(d.workoutEnergy) + ' kcal');
      if (d.workoutDistanceKm) parts.push(d.workoutDistanceKm.toFixed(1) + ' km');
      return '<tr>' + parts.map(function (p) { return '<td>' + p + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
  }

  upsertChart('sleepChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Sleep hours', data: pick('sleepHours'), backgroundColor: '#5e5ce699' },
  ]}});

  upsertChart('sleepStagesChart', { type: 'bar', data: { labels: labels, datasets: [
    { label: 'Core', data: pick('sleepCoreHours'), backgroundColor: '#5e5ce6' },
    { label: 'Deep', data: pick('sleepDeepHours'), backgroundColor: '#3634a3' },
    { label: 'REM', data: pick('sleepRemHours'), backgroundColor: '#bf5af2' },
    { label: 'Awake', data: pick('sleepAwakeHours'), backgroundColor: '#ff453a' },
  ]}, options: { scales: {
    x: { stacked: true, ticks: { color: '#565d6b', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#1a1e26' } },
    y: { stacked: true, ticks: { color: '#565d6b', font: { size: 10 } }, grid: { color: '#1a1e26' } },
  } }});

  upsertChart('weightChart', { type: 'line', data: { labels: labels, datasets: [
    { label: 'Weight (kg)', data: pick('weightKg'), borderColor: '#ff9f0a', tension: .3, pointRadius: 1, borderWidth: 1.5, spanGaps: true },
  ]}});

  upsertChart('ageChart', { type: 'line', data: { labels: history.map(function (h) { return h.date; }), datasets: [
    { label: 'Biological age', data: history.map(function (h) { return h.biologicalAge; }), borderColor: '#64d2ff', tension: .3, pointRadius: 0, borderWidth: 1.5 },
    { label: 'Chronological age', data: history.map(function (h) { return h.chronologicalAge; }), borderColor: '#565d6b', borderDash: [5, 5], pointRadius: 0, borderWidth: 1 },
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
    return;
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  var days = series.days || [];
  var latestAnalytics = analytics.latest;
  var history = analytics.history || [];
  var today = days.length ? days[days.length - 1] : {};

  document.getElementById('lastUpdated').textContent = days.length ? ('Synced ' + days[days.length - 1].date) : 'No data yet';

  renderBioHero(latestAnalytics, days);
  renderMarkers(latestAnalytics);
  renderQuickStats(today, trends);
  renderBests(trends.bests);
  renderReadiness(trends.readinessScore);
  renderStrain(trends.todayStrain);
  renderExtraMetrics(days);
  buildCharts(days.slice(-180), history.slice(-180));

  var savedTab = null;
  try { savedTab = localStorage.getItem('healthTab'); } catch (e) {}
  if (savedTab) showTab(savedTab);

  loadInsights(false);
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
    var stageField = SLEEP_STAGE_MAP[value];
    if (stageField && endDate) d[stageField] += healthDurationMinutes(startDate, endDate);
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

async function importExportZip() {
  var fileInput = document.getElementById('importFile');
  var zipFile = fileInput.files && fileInput.files[0];
  var progressEl = document.getElementById('importProgress');
  if (!zipFile) { setImportStatus('Choose a file first.'); return; }

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
    setImportStatus('Done — imported ' + result.daysImported + ' days (' + result.totalDays + ' total in series).');
    boot();
  } catch (err) {
    setImportStatus('Import failed: ' + err.message);
  } finally {
    setTimeout(function () { progressEl.style.display = 'none'; }, 1500);
  }
}

if (getToken()) { boot(); }
</script>
</body>
</html>`;
}
