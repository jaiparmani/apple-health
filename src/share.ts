import type { RecoverySnapshot } from "./types";
import type { WeeklyReportCard } from "./patterns";

function recoveryColor(score: number): string {
  if (score >= 67) return "#22c55e";
  if (score >= 34) return "#eab308";
  return "#ef4444";
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "#22c55e";
  if (grade.startsWith("B")) return "#3b82f6";
  if (grade.startsWith("C")) return "#eab308";
  return "#ef4444";
}

export function generateRecoveryCard(recovery: RecoverySnapshot, readiness: number | null): string {
  const score = recovery.score;
  const color = recoveryColor(score);
  const readinessText = readiness !== null ? `Readiness: ${readiness}/100` : "";
  const pillars: { label: string; value: string }[] = [];
  if (recovery.hrvZ !== null) pillars.push({ label: "HRV", value: `${recovery.hrvZ > 0 ? "+" : ""}${recovery.hrvZ.toFixed(1)}σ` });
  if (recovery.rhrZ !== null) pillars.push({ label: "RHR", value: `${recovery.rhrZ > 0 ? "+" : ""}${recovery.rhrZ.toFixed(1)}σ` });
  if (recovery.respRateZ !== null) pillars.push({ label: "Resp", value: `${recovery.respRateZ > 0 ? "+" : ""}${recovery.respRateZ.toFixed(1)}σ` });
  if (recovery.sleepScore !== null) pillars.push({ label: "Sleep", value: `${recovery.sleepScore}/100` });

  const pillarSvg = pillars.map((p, i) => `
    <g transform="translate(${30 + i * 90}, 180)">
      <text x="0" y="0" fill="#94a3b8" font-size="11" font-family="system-ui,sans-serif">${esc(p.label)}</text>
      <text x="0" y="18" fill="#e2e8f0" font-size="14" font-weight="600" font-family="system-ui,sans-serif">${esc(p.value)}</text>
    </g>`).join("");

  const arcEnd = (score / 100) * 240 - 120;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const cx = 200, cy = 105, r = 60;
  const x1 = cx + r * Math.cos(rad(-120));
  const y1 = cy + r * Math.sin(rad(-120));
  const x2 = cx + r * Math.cos(rad(arcEnd));
  const y2 = cy + r * Math.sin(rad(arcEnd));
  const large = score > 66.7 ? 1 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
  <rect width="400" height="240" rx="16" fill="#0f172a"/>
  <text x="30" y="35" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">RECOVERY · ${esc(recovery.date)}</text>
  <path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(rad(120))} ${cy + r * Math.sin(rad(120))}" stroke="#1e293b" stroke-width="10" fill="none" stroke-linecap="round"/>
  <path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"/>
  <text x="${cx}" y="${cy + 8}" fill="${color}" font-size="36" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">${score}</text>
  <text x="${cx}" y="${cy + 28}" fill="#64748b" font-size="12" text-anchor="middle" font-family="system-ui,sans-serif">${esc(readinessText)}</text>
  ${pillarSvg}
  <text x="370" y="228" fill="#334155" font-size="9" text-anchor="end" font-family="system-ui,sans-serif">Health Dashboard</text>
</svg>`;
}

export function generateReportCard(rc: WeeklyReportCard): string {
  const domains = [
    { label: "Training", grade: rc.domains.training },
    { label: "Recovery", grade: rc.domains.recovery },
    { label: "Sleep", grade: rc.domains.sleep },
    { label: "Activity", grade: rc.domains.activity },
    { label: "Consistency", grade: rc.domains.consistency },
  ];

  const domainSvg = domains.map((d, i) => {
    const y = 65 + i * 36;
    return `
    <text x="30" y="${y}" fill="#cbd5e1" font-size="14" font-family="system-ui,sans-serif">${d.label}</text>
    <text x="370" y="${y}" fill="${gradeColor(d.grade)}" font-size="18" font-weight="700" text-anchor="end" font-family="system-ui,sans-serif">${esc(d.grade)}</text>
    <line x1="30" y1="${y + 10}" x2="370" y2="${y + 10}" stroke="#1e293b" stroke-width="1"/>`;
  }).join("");

  const highlights = rc.highlights.slice(0, 2).map((h, i) =>
    `<text x="30" y="${260 + i * 20}" fill="#86efac" font-size="12" font-family="system-ui,sans-serif">✓ ${esc(h.slice(0, 50))}</text>`
  ).join("");

  const improvements = rc.improvements.slice(0, 1).map((h, i) =>
    `<text x="30" y="${300 + i * 20}" fill="#fbbf24" font-size="12" font-family="system-ui,sans-serif">→ ${esc(h.slice(0, 50))}</text>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="330" viewBox="0 0 400 330">
  <rect width="400" height="330" rx="16" fill="#0f172a"/>
  <text x="30" y="35" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">WEEKLY REPORT CARD</text>
  <text x="370" y="35" fill="${gradeColor(rc.overall)}" font-size="20" font-weight="700" text-anchor="end" font-family="system-ui,sans-serif">${esc(rc.overall)}</text>
  ${domainSvg}
  ${highlights}
  ${improvements}
  <text x="370" y="320" fill="#334155" font-size="9" text-anchor="end" font-family="system-ui,sans-serif">Health Dashboard</text>
</svg>`;
}

export function generateStrainCard(strain: number, date: string, budget: { maxStrain: number; zone: string } | null): string {
  const pct = Math.min(1, strain / 21);
  const barWidth = Math.round(pct * 340);
  const color = strain >= 16 ? "#ef4444" : strain >= 12 ? "#f97316" : strain >= 7 ? "#eab308" : "#22c55e";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140" viewBox="0 0 400 140">
  <rect width="400" height="140" rx="16" fill="#0f172a"/>
  <text x="30" y="35" fill="#94a3b8" font-size="12" font-family="system-ui,sans-serif">STRAIN · ${esc(date)}</text>
  <text x="30" y="70" fill="${color}" font-size="32" font-weight="700" font-family="system-ui,sans-serif">${strain.toFixed(1)}</text>
  <text x="115" y="70" fill="#64748b" font-size="16" font-family="system-ui,sans-serif">/ 21</text>
  <rect x="30" y="90" width="340" height="8" rx="4" fill="#1e293b"/>
  <rect x="30" y="90" width="${barWidth}" height="8" rx="4" fill="${color}"/>
  ${budget ? `<text x="30" y="120" fill="#64748b" font-size="11" font-family="system-ui,sans-serif">Budget: ${budget.maxStrain.toFixed(1)} · ${esc(budget.zone)} zone</text>` : ""}
  <text x="370" y="128" fill="#334155" font-size="9" text-anchor="end" font-family="system-ui,sans-serif">Health Dashboard</text>
</svg>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
