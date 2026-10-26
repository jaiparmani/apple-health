export function renderDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Health Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/fflate/0.8.2/fflate.min.js"></script>
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
    <h3>Import Apple Health export</h3>
    <p class="sub">On iPhone: Health app → profile picture → Export All Health Data → share the export.zip here (AirDrop/Files/email to yourself, then upload below). Parsing happens entirely in this browser — the zip is never uploaded anywhere except the small daily summaries sent to your own Worker.</p>
    <input id="importFile" type="file" accept=".zip" />
    <button onclick="importExportZip()">Import</button>
    <p id="importStatus" class="sub"></p>
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

var HEALTH_RECORD_TYPES = [
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierBloodGlucose',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

function healthAttr(line, name) {
  var m = line.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : undefined;
}
function healthParseNaive(ts) {
  var m = ts.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
function healthDurationHours(startDate, endDate) {
  return (healthParseNaive(endDate) - healthParseNaive(startDate)) / 3600000;
}
function healthNewDayAcc() {
  return {
    restingHeartRate: [], hrv: [], vo2max: [], steps: 0, activeEnergy: 0, exerciseMinutes: 0,
    weightKg: [], bodyFatPct: [], bloodPressureSystolic: [], bloodPressureDiastolic: [],
    bloodGlucose: [], respiratoryRate: [], oxygenSaturation: [], bodyTemperature: [], sleepHours: 0,
  };
}
function healthAvg(arr) { return arr.length ? arr.reduce(function(a,b){return a+b;},0) / arr.length : undefined; }
function healthLast(arr) { return arr.length ? arr[arr.length-1] : undefined; }
function healthRound(n, dp) {
  if (n === undefined) return undefined;
  var f = Math.pow(10, dp || 0);
  return Math.round(n * f) / f;
}

function healthProcessLine(days, line) {
  var type = null;
  for (var i = 0; i < HEALTH_RECORD_TYPES.length; i++) {
    if (line.indexOf(HEALTH_RECORD_TYPES[i] + '"') !== -1) { type = HEALTH_RECORD_TYPES[i]; break; }
  }
  if (!type) return;
  var startDate = healthAttr(line, 'startDate');
  var endDate = healthAttr(line, 'endDate');
  var value = healthAttr(line, 'value');
  if (!startDate) return;
  var date = startDate.slice(0, 10);
  if (!days.has(date)) days.set(date, healthNewDayAcc());
  var d = days.get(date);
  var num = Number(value);
  switch (type) {
    case 'HKQuantityTypeIdentifierRestingHeartRate': d.restingHeartRate.push(num); break;
    case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': d.hrv.push(num); break;
    case 'HKQuantityTypeIdentifierVO2Max': d.vo2max.push(num); break;
    case 'HKQuantityTypeIdentifierStepCount': d.steps += num || 0; break;
    case 'HKQuantityTypeIdentifierActiveEnergyBurned': d.activeEnergy += num || 0; break;
    case 'HKQuantityTypeIdentifierAppleExerciseTime': d.exerciseMinutes += num || 0; break;
    case 'HKQuantityTypeIdentifierBodyMass': d.weightKg.push(num); break;
    case 'HKQuantityTypeIdentifierBodyFatPercentage': d.bodyFatPct.push(num <= 1 ? num * 100 : num); break;
    case 'HKQuantityTypeIdentifierBloodPressureSystolic': d.bloodPressureSystolic.push(num); break;
    case 'HKQuantityTypeIdentifierBloodPressureDiastolic': d.bloodPressureDiastolic.push(num); break;
    case 'HKQuantityTypeIdentifierBloodGlucose': d.bloodGlucose.push(num); break;
    case 'HKQuantityTypeIdentifierRespiratoryRate': d.respiratoryRate.push(num); break;
    case 'HKQuantityTypeIdentifierOxygenSaturation': d.oxygenSaturation.push(num); break;
    case 'HKQuantityTypeIdentifierBodyTemperature': d.bodyTemperature.push(num); break;
    case 'HKCategoryTypeIdentifierSleepAnalysis':
      if (value && value.indexOf('Asleep') !== -1 && endDate) d.sleepHours += healthDurationHours(startDate, endDate);
      break;
  }
}

function healthFinalizeDays(days) {
  var result = [];
  days.forEach(function (d, date) {
    var rec = { date: date, source: 'health-export-import' };
    var rhr = healthRound(healthAvg(d.restingHeartRate), 1);
    var hrv = healthRound(healthAvg(d.hrv), 1);
    var vo2max = healthRound(healthAvg(d.vo2max), 1);
    var weightKg = healthRound(healthLast(d.weightKg), 1);
    var bodyFatPct = healthRound(healthLast(d.bodyFatPct), 1);
    var sysBp = healthRound(healthAvg(d.bloodPressureSystolic), 0);
    var diaBp = healthRound(healthAvg(d.bloodPressureDiastolic), 0);
    var glucose = healthRound(healthAvg(d.bloodGlucose), 1);
    var resp = healthRound(healthAvg(d.respiratoryRate), 1);
    var spo2 = healthRound(healthAvg(d.oxygenSaturation), 3);
    var temp = healthRound(healthAvg(d.bodyTemperature), 2);
    if (rhr !== undefined) rec.restingHeartRate = rhr;
    if (hrv !== undefined) rec.hrv = hrv;
    if (vo2max !== undefined) rec.vo2max = vo2max;
    if (d.steps > 0) rec.steps = Math.round(d.steps);
    if (d.activeEnergy > 0) rec.activeEnergy = Math.round(d.activeEnergy);
    if (d.exerciseMinutes > 0) rec.exerciseMinutes = Math.round(d.exerciseMinutes);
    if (weightKg !== undefined) rec.weightKg = weightKg;
    if (bodyFatPct !== undefined) rec.bodyFatPct = bodyFatPct;
    if (sysBp !== undefined) rec.bloodPressureSystolic = sysBp;
    if (diaBp !== undefined) rec.bloodPressureDiastolic = diaBp;
    if (glucose !== undefined) rec.bloodGlucose = glucose;
    if (resp !== undefined) rec.respiratoryRate = resp;
    if (spo2 !== undefined) rec.oxygenSaturation = spo2;
    if (temp !== undefined) rec.bodyTemperature = temp;
    if (d.sleepHours > 0) rec.sleepHours = healthRound(d.sleepHours, 2);
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
  if (!zipFile) { setImportStatus('Choose a file first.'); return; }

  var days = new Map();
  var leftover = '';
  var bytesSeen = 0;
  var decoder = new TextDecoder();
  var foundExportXml = false;

  function handleChunkText(text, final) {
    leftover += text;
    var lines = leftover.split('\n');
    leftover = final ? '' : lines.pop();
    for (var i = 0; i < lines.length; i++) healthProcessLine(days, lines[i]);
  }

  try {
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
        setImportStatus('Parsing export.xml... ' + Math.round(bytesSeen / 1e6) + ' MB read, ' + days.size + ' days found');
      };
      file.start();
    };

    var reader = zipFile.stream().getReader();
    while (true) {
      var res = await reader.read();
      if (res.done) { unzipper.push(new Uint8Array(0), true); break; }
      unzipper.push(res.value, false);
    }

    if (!foundExportXml) { setImportStatus('No export.xml found in that zip — is it an Apple Health export?'); return; }

    var dayRecords = healthFinalizeDays(days);
    if (dayRecords.length === 0) { setImportStatus('No recognizable health records found.'); return; }

    setImportStatus('Uploading ' + dayRecords.length + ' days to your repo...');
    var result = await authedFetch('/import-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: dayRecords }) });
    setImportStatus('Done — imported ' + result.daysImported + ' days (' + result.totalDays + ' total in series).');
    init();
  } catch (err) {
    setImportStatus('Import failed: ' + err.message);
  }
}

if (getToken()) { init(); }
</script>
</body>
</html>`;
}
