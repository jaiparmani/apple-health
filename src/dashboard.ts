export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Health Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<style>
  :root { --bg:#0b0f14; --card:#131a22; --text:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --good:#3fb950; --bad:#f85149; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  header { padding:24px 20px 8px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; }
  #gate { max-width:420px; margin:80px auto; padding:24px; background:var(--card); border-radius:12px; }
  #gate input { width:100%; padding:10px; margin:8px 0; border-radius:8px; border:1px solid #30363d; background:#0d1117; color:var(--text); }
  #gate button, .profile-form button { padding:10px 16px; border-radius:8px; border:none; background:var(--accent); color:#001b33; font-weight:600; cursor:pointer; }
  #app { display:none; padding:0 20px 40px; max-width:1100px; margin:0 auto; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin:16px 0; }
  .card { background:var(--card); border-radius:12px; padding:16px; }
  .card .label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .card .value { font-size:28px; font-weight:700; margin-top:6px; }
  .card .delta-good { color:var(--good); } .card .delta-bad { color:var(--bad); }
  canvas { max-height:260px; }
  .chart-card { background:var(--card); border-radius:12px; padding:16px; margin-bottom:16px; }
  .chart-card h3 { margin:0 0 10px; font-size:14px; color:var(--muted); font-weight:500; }
  .markers { font-size:13px; color:var(--muted); line-height:1.6; }
  .profile-form input, .profile-form select { padding:8px; margin:4px 4px 4px 0; border-radius:6px; border:1px solid #30363d; background:#0d1117; color:var(--text); }
  footer { color:var(--muted); font-size:12px; text-align:center; padding:24px; }
</style>
</head>
<body>

<div id="gate">
  <h1>Enter access token</h1>
  <p class="sub">The same token your Apple Shortcut uses to post data.</p>
  <input id="tokenInput" type="password" placeholder="Access token" />
  <button onclick="saveToken()">Unlock</button>
  <p id="gateError" class="sub" style="color:#f85149;"></p>
</div>

<div id="app">
  <header>
    <h1>Health Dashboard</h1>
    <div class="sub" id="lastUpdated"></div>
  </header>

  <div class="grid" id="summaryGrid"></div>

  <div id="profileSection" class="chart-card" style="display:none;">
    <h3>Profile (set once — needed for biological age)</h3>
    <form class="profile-form" onsubmit="saveProfile(event)">
      <input id="birthDate" type="date" required />
      <select id="sex"><option value="male">Male</option><option value="female">Female</option></select>
      <input id="heightCm" type="number" placeholder="Height (cm)" />
      <button type="submit">Save profile</button>
    </form>
  </div>

  <div class="chart-card">
    <h3>Biological age markers</h3>
    <div id="markers" class="markers"></div>
  </div>

  <div class="chart-card"><h3>Biological vs chronological age</h3><canvas id="ageChart"></canvas></div>
  <div class="chart-card"><h3>Resting heart rate &amp; HRV</h3><canvas id="heartChart"></canvas></div>
  <div class="chart-card"><h3>Sleep (hours)</h3><canvas id="sleepChart"></canvas></div>
  <div class="chart-card"><h3>Steps</h3><canvas id="stepsChart"></canvas></div>

  <footer>Estimates only, not medical advice. Data lives in your GitHub repo.</footer>
</div>

<script>
function getToken() { try { return localStorage.getItem('healthToken') || ''; } catch { return ''; } }
function saveToken() {
  const t = document.getElementById('tokenInput').value.trim();
  if (!t) return;
  try { localStorage.setItem('healthToken', t); } catch {}
  init();
}

async function authedFetch(path, opts = {}) {
  const token = getToken();
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers||{}), 'Authorization': 'Bearer ' + token } });
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('request failed: ' + res.status);
  return res.json();
}

function fmt(n, d=0) { return (n === null || n === undefined) ? '—' : Number(n).toFixed(d); }

async function saveProfile(e) {
  e.preventDefault();
  const birthDate = document.getElementById('birthDate').value;
  const sex = document.getElementById('sex').value;
  const heightCm = Number(document.getElementById('heightCm').value) || undefined;
  await authedFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birthDate, sex, heightCm }) });
  init();
}

let charts = {};
function upsertChart(id, config) {
  if (charts[id]) { charts[id].destroy(); }
  charts[id] = new Chart(document.getElementById(id), config);
}

async function init() {
  document.getElementById('gateError').textContent = '';
  let series, analytics;
  try {
    [series, analytics] = await Promise.all([authedFetch('/api/series'), authedFetch('/api/analytics')]);
  } catch (err) {
    document.getElementById('gateError').textContent = 'Invalid token or server error.';
    return;
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const days = series.days || [];
  const latestAnalytics = analytics.latest;
  const history = analytics.history || [];

  if (!analytics.profileSet) {
    document.getElementById('profileSection').style.display = 'block';
  }

  const summary = document.getElementById('summaryGrid');
  const bioCard = latestAnalytics ? \`
    <div class="card">
      <div class="label">Biological age</div>
      <div class="value">\${fmt(latestAnalytics.biologicalAge,1)}</div>
      <div class="\${latestAnalytics.deltaYears <= 0 ? 'delta-good' : 'delta-bad'}">\${latestAnalytics.deltaYears > 0 ? '+' : ''}\${fmt(latestAnalytics.deltaYears,1)} yrs vs actual (\${fmt(latestAnalytics.chronologicalAge,0)})</div>
    </div>\` : '<div class="card"><div class="label">Biological age</div><div class="value">—</div><div class="sub">Set profile below</div></div>';
  summary.innerHTML = bioCard;

  if (latestAnalytics) {
    document.getElementById('markers').innerHTML = latestAnalytics.markers.map(m =>
      \`\${m.marker}: <b>\${fmt(m.value,1)}</b> → marker age \${fmt(m.markerAge,1)}\`
    ).join('<br/>');
  }

  document.getElementById('lastUpdated').textContent = days.length ? ('Latest data: ' + days[days.length-1].date) : 'No data yet';

  const labels = days.map(d => d.date);
  upsertChart('heartChart', { type:'line', data:{ labels, datasets:[
    { label:'Resting HR', data: days.map(d=>d.restingHeartRate ?? null), borderColor:'#f85149', tension:.3 },
    { label:'HRV', data: days.map(d=>d.hrv ?? null), borderColor:'#58a6ff', tension:.3 },
  ]}, options:{ responsive:true } });

  upsertChart('sleepChart', { type:'bar', data:{ labels, datasets:[{ label:'Sleep hours', data: days.map(d=>d.sleepHours ?? null), backgroundColor:'#3fb950' }]}, options:{ responsive:true } });
  upsertChart('stepsChart', { type:'bar', data:{ labels, datasets:[{ label:'Steps', data: days.map(d=>d.steps ?? null), backgroundColor:'#58a6ff' }]}, options:{ responsive:true } });

  upsertChart('ageChart', { type:'line', data:{
    labels: history.map(h=>h.date),
    datasets:[
      { label:'Biological age', data: history.map(h=>h.biologicalAge), borderColor:'#58a6ff', tension:.3 },
      { label:'Chronological age', data: history.map(h=>h.chronologicalAge), borderColor:'#8b949e', borderDash:[5,5] },
    ]}, options:{ responsive:true } });
}

if (getToken()) { init(); }
</script>
</body>
</html>`;
}
