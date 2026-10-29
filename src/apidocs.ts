export function renderApiDocs(): string {
  const endpoints = [
    { method: "POST", path: "/ingest", auth: true, desc: "Ingest daily health metrics from Apple Shortcuts. Body: JSON with metric fields (case-insensitive aliases accepted)." },
    { method: "POST", path: "/import-bulk", auth: true, desc: "Bulk import from Apple Health export. Body: { days: [...] }." },
    { method: "GET", path: "/api/series", auth: true, desc: "Full time series of all daily metrics." },
    { method: "GET", path: "/api/analytics", auth: true, desc: "Biological age estimate, history, and profile status." },
    { method: "GET", path: "/api/trends", auth: true, desc: "Recovery score, sleep analysis, illness signals, strain." },
    { method: "GET", path: "/api/overview", auth: true, desc: "Health score, highlights, weekly ring, monthly summaries, sparklines." },
    { method: "GET", path: "/api/fitness", auth: true, desc: "Training load, form (CTL/ATL/TSB), ACWR, VO2max class, action items." },
    { method: "GET", path: "/api/insights?domain=&lt;domain&gt;&amp;force=0|1", auth: true, desc: "AI-generated review. Domains: overview, today, weekly, longterm, training, recovery, activity, sleep, body, discoveries." },
    { method: "POST", path: "/api/warm", auth: true, desc: "Pre-generate all AI reviews." },
    { method: "GET", path: "/api/goals", auth: true, desc: "Goal progress for all active goals." },
    { method: "POST", path: "/api/goals", auth: true, desc: "Create a goal. Body: { metric, target, deadline, title? }." },
    { method: "DELETE", path: "/api/goals?id=&lt;id&gt;", auth: true, desc: "Delete a goal." },
    { method: "GET", path: "/api/plan", auth: true, desc: "This week's training plan with today's adjustment." },
    { method: "POST", path: "/api/plan", auth: true, desc: "Regenerate this week's training plan." },
    { method: "POST", path: "/api/plan/done?date=&lt;date&gt;", auth: true, desc: "Toggle a plan day as done/undone." },
    { method: "GET", path: "/api/baselines", auth: true, desc: "Rolling baselines (7/30/90 day) for all metrics." },
    { method: "GET", path: "/api/coverage", auth: true, desc: "Per-metric data coverage and staleness." },
    { method: "GET", path: "/api/discoveries", auth: true, desc: "Correlations, journal correlations, and anomalies." },
    { method: "GET", path: "/api/report?period=week|month&amp;end=&lt;date&gt;", auth: true, desc: "Period comparison report (this vs last week/month)." },
    { method: "GET", path: "/api/export", auth: true, desc: "Download all data as CSV." },
    { method: "POST", path: "/api/ask", auth: true, desc: "Natural language health Q&amp;A. Body: { question }." },
    { method: "POST", path: "/api/chart", auth: true, desc: "Generate a chart from natural language. Body: { question }." },
    { method: "GET", path: "/api/knowledge", auth: true, desc: "User knowledge store (goals, preferences, journal notes)." },
    { method: "PUT", path: "/api/knowledge", auth: true, desc: "Update goals/preferences/sleep target." },
    { method: "POST", path: "/api/knowledge/notes", auth: true, desc: "Log/update a journal note. Body: { date, energy?, soreness?, alcoholDrinks?, caffeineMg?, stress?, illness?, lateMeal?, screenBeforeBed?, supplements?, hydrationLiters?, sauna?, coldPlunge?, nap?, napMinutes?, travel?, meditation?, meditationMinutes?, preWorkout?, note? }." },
    { method: "DELETE", path: "/api/knowledge/notes?date=&lt;date&gt;", auth: true, desc: "Delete a journal note." },
    { method: "GET", path: "/api/experiments", auth: true, desc: "All experiments with before/after results." },
    { method: "POST", path: "/api/experiments", auth: true, desc: "Create an experiment. Body: { title, metric, startDate }." },
    { method: "POST", path: "/api/experiments/adherence?id=&lt;id&gt;&amp;date=&lt;date&gt;", auth: true, desc: "Toggle adherence for an experiment day." },
    { method: "DELETE", path: "/api/experiments?id=&lt;id&gt;", auth: true, desc: "Delete an experiment." },
    { method: "GET", path: "/api/workouts?date=&lt;date&gt;", auth: true, desc: "Manual workouts, optionally filtered by date." },
    { method: "GET", path: "/api/workouts/analytics", auth: true, desc: "PRs, muscle balance, workout frequency." },
    { method: "POST", path: "/api/workouts", auth: true, desc: "Log a manual workout with exercises/sets/reps/weight." },
    { method: "DELETE", path: "/api/workouts?id=&lt;id&gt;", auth: true, desc: "Delete a workout." },
    { method: "GET", path: "/api/workout-templates", auth: true, desc: "Saved workout templates." },
    { method: "POST", path: "/api/workout-templates", auth: true, desc: "Create/update a workout template." },
    { method: "DELETE", path: "/api/workout-templates?id=&lt;id&gt;", auth: true, desc: "Delete a template." },
    { method: "POST", path: "/api/workout-templates/use", auth: true, desc: "Use a template (increments counter, returns exercises). Body: { id }." },
    { method: "GET", path: "/api/workouts/unlogged", auth: true, desc: "Apple Watch strength sessions without manual logs." },
    { method: "GET", path: "/api/progression", auth: true, desc: "1RM tracking, muscle recovery, session prescription, periodization, momentum." },
    { method: "GET", path: "/api/recommendations", auth: true, desc: "Sleep protocol, lifestyle impacts, recovery countdowns, smart check-in." },
    { method: "GET", path: "/api/premium", auth: true, desc: "Personal records, streaks, weekly comparison, training readiness, heatmap." },
    { method: "GET", path: "/api/body", auth: true, desc: "Body composition, muscle volume, symmetry, body score, physique, mobility." },
    { method: "GET", path: "/api/alerts", auth: true, desc: "Active alerts (illness, recovery, anomalies, strain, stale data, goals)." },
    { method: "GET", path: "/api/coach", auth: true, desc: "Coach directive, personal patterns, report card, predictions." },
    { method: "PUT", path: "/api/profile", auth: true, desc: "Set user profile. Body: { birthDate, sex, heightCm? }." },
    { method: "GET", path: "/api/measurements", auth: true, desc: "Body measurements history with analysis." },
    { method: "POST", path: "/api/measurements", auth: true, desc: "Log body measurements. Body: { date, waistCm?, chestCm?, hipsCm?, leftArmCm?, rightArmCm?, leftThighCm?, rightThighCm?, neckCm?, shouldersCm?, calvesLCm?, calvesRCm? }." },
    { method: "DELETE", path: "/api/measurements?date=&lt;date&gt;", auth: true, desc: "Delete measurements for a date." },
    { method: "GET", path: "/api/checkin", auth: true, desc: "Mid-day check-in summary (strain, steps, hydration reminder)." },
    { method: "GET", path: "/api/share/recovery", auth: true, desc: "Shareable recovery score SVG card." },
    { method: "GET", path: "/api/share/report-card", auth: true, desc: "Shareable weekly report card SVG." },
    { method: "GET", path: "/api/share/strain", auth: true, desc: "Shareable daily strain SVG card." },
    { method: "GET", path: "/api/hr-zones", auth: true, desc: "HR zone time distribution and summary." },
    { method: "POST", path: "/telegram/brief", auth: true, desc: "Morning Telegram brief (MarkdownV2). Called by brain-chat." },
    { method: "POST", path: "/telegram/evening", auth: true, desc: "Evening Telegram brief (bedtime Rx, tomorrow's plan, journal prompts)." },
    { method: "GET", path: "/", auth: false, desc: "Interactive web dashboard (PWA-enabled)." },
    { method: "GET", path: "/docs", auth: false, desc: "This API documentation page." },
  ];

  const methodColor: Record<string, string> = {
    GET: "#22c55e",
    POST: "#3b82f6",
    PUT: "#eab308",
    DELETE: "#ef4444",
  };

  const rows = endpoints.map((ep) => {
    const color = methodColor[ep.method] || "#94a3b8";
    return `<tr>
      <td><span style="color:${color};font-weight:700;font-size:13px">${ep.method}</span></td>
      <td><code>${ep.path}</code></td>
      <td>${ep.auth ? '<span style="color:#f59e0b">🔒</span>' : '<span style="color:#22c55e">🌐</span>'}</td>
      <td>${ep.desc}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Health API Documentation</title>
<style>
  :root { --bg: #0a0a0a; --card: #111; --border: #222; --text: #e2e8f0; --muted: #64748b; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: system-ui,-apple-system,sans-serif; background: var(--bg); color: var(--text); padding: 24px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .subtitle { color: var(--muted); margin-bottom: 24px; font-size: 14px; }
  .auth-note { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #94a3b8; }
  .auth-note code { background: #222; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: top; }
  td code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; white-space: nowrap; }
  tr:hover { background: #111827; }
</style>
</head>
<body>
<h1>Health API</h1>
<p class="subtitle">${endpoints.length} endpoints · Cloudflare Worker · GitHub-backed storage</p>
<div class="auth-note">
  🔒 endpoints require <code>Authorization: Bearer &lt;INGEST_TOKEN&gt;</code><br>
  🌐 endpoints are public
</div>
<table>
<thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Description</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}
