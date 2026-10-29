/**
 * Anatomically-styled front/back body silhouette for the animated body
 * visualisation. Each muscle region uses organic SVG paths (not rectangles)
 * that loosely follow real anatomy. Regions carry `data-muscle="<MuscleId>"`
 * and `class="muscle-region"` — the dashboard JS applies status classes
 * (m-optimal / m-undertrained / m-neglected / m-overtrained) and the CSS
 * handles glow, pulse, and colour transitions.
 */

interface Region {
  muscle: string;
  shapes: string[];
}

// ---------- FRONT VIEW ----------

const FRONT_REGIONS: Region[] = [
  // shoulders (deltoids)
  { muscle: "shoulders", shapes: [
    '<path d="M56,68 Q48,62 44,72 Q42,82 48,88 Q54,82 62,76 Z"/>',
    '<path d="M144,68 Q152,62 156,72 Q158,82 152,88 Q146,82 138,76 Z"/>',
  ]},
  // chest (pectorals)
  { muscle: "chest", shapes: [
    '<path d="M68,72 Q80,66 100,68 L100,98 Q86,102 72,96 Q64,90 68,72 Z"/>',
    '<path d="M132,72 Q120,66 100,68 L100,98 Q114,102 128,96 Q136,90 132,72 Z"/>',
  ]},
  // biceps
  { muscle: "biceps", shapes: [
    '<path d="M46,92 Q40,100 40,118 Q40,132 46,138 Q52,132 52,118 Q52,100 46,92 Z"/>',
    '<path d="M154,92 Q160,100 160,118 Q160,132 154,138 Q148,132 148,118 Q148,100 154,92 Z"/>',
  ]},
  // forearms
  { muscle: "forearms", shapes: [
    '<path d="M44,140 Q38,154 36,176 Q38,182 42,182 Q46,170 48,154 Q48,140 44,140 Z"/>',
    '<path d="M156,140 Q162,154 164,176 Q162,182 158,182 Q154,170 152,154 Q152,140 156,140 Z"/>',
  ]},
  // abs (rectus abdominis)
  { muscle: "abs", shapes: [
    '<path d="M88,100 Q86,120 86,148 Q86,158 100,162 Q114,158 114,148 Q114,120 112,100 Q100,96 88,100 Z"/>',
  ]},
  // obliques
  { muscle: "obliques", shapes: [
    '<path d="M72,98 Q68,116 68,142 Q68,156 78,162 Q84,156 86,142 Q86,116 88,100 Q80,96 72,98 Z"/>',
    '<path d="M128,98 Q132,116 132,142 Q132,156 122,162 Q116,156 114,142 Q114,116 112,100 Q120,96 128,98 Z"/>',
  ]},
  // quads
  { muscle: "quads", shapes: [
    '<path d="M78,168 Q74,190 72,220 Q72,240 80,242 Q88,240 90,220 Q92,194 90,168 Q84,164 78,168 Z"/>',
    '<path d="M122,168 Q126,190 128,220 Q128,240 120,242 Q112,240 110,220 Q108,194 110,168 Q116,164 122,168 Z"/>',
  ]},
  // calves
  { muscle: "calves", shapes: [
    '<path d="M74,248 Q70,262 70,280 Q72,296 78,300 Q84,296 84,280 Q84,262 80,248 Z"/>',
    '<path d="M126,248 Q130,262 130,280 Q128,296 122,300 Q116,296 116,280 Q116,262 120,248 Z"/>',
  ]},
];

const FRONT_DECO = `
  <circle cx="100" cy="28" r="18" class="body-deco"/>
  <path d="M92,44 Q92,48 94,52 L106,52 Q108,48 108,44" class="body-deco"/>
  <path d="M66,66 Q64,58 68,50 Q80,42 100,42 Q120,42 132,50 Q136,58 134,66" class="body-outline"/>
  <path d="M36,184 Q32,190 30,196" class="body-outline"/>
  <path d="M164,184 Q168,190 170,196" class="body-outline"/>
  <ellipse cx="80" cy="310" rx="10" ry="5" class="body-deco"/>
  <ellipse cx="120" cy="310" rx="10" ry="5" class="body-deco"/>
`;

// ---------- BACK VIEW ----------

const BACK_REGIONS: Region[] = [
  // traps
  { muscle: "traps", shapes: [
    '<path d="M80,52 Q90,48 100,48 Q110,48 120,52 L116,74 Q108,78 100,78 Q92,78 84,74 Z"/>',
  ]},
  // shoulders (rear deltoids)
  { muscle: "shoulders", shapes: [
    '<path d="M56,68 Q48,62 44,72 Q42,82 48,88 Q54,82 62,76 Z"/>',
    '<path d="M144,68 Q152,62 156,72 Q158,82 152,88 Q146,82 138,76 Z"/>',
  ]},
  // lats (latissimus dorsi)
  { muscle: "lats", shapes: [
    '<path d="M68,78 Q64,96 66,118 Q68,134 80,140 Q88,136 92,120 Q94,104 92,82 Q80,74 68,78 Z"/>',
    '<path d="M132,78 Q136,96 134,118 Q132,134 120,140 Q112,136 108,120 Q106,104 108,82 Q120,74 132,78 Z"/>',
  ]},
  // triceps
  { muscle: "triceps", shapes: [
    '<path d="M46,92 Q40,100 40,118 Q40,132 46,138 Q52,132 52,118 Q52,100 46,92 Z"/>',
    '<path d="M154,92 Q160,100 160,118 Q160,132 154,138 Q148,132 148,118 Q148,100 154,92 Z"/>',
  ]},
  // forearms
  { muscle: "forearms", shapes: [
    '<path d="M44,140 Q38,154 36,176 Q38,182 42,182 Q46,170 48,154 Q48,140 44,140 Z"/>',
    '<path d="M156,140 Q162,154 164,176 Q162,182 158,182 Q154,170 152,154 Q152,140 156,140 Z"/>',
  ]},
  // lower back (erector spinae)
  { muscle: "lower_back", shapes: [
    '<path d="M86,130 Q84,142 84,156 Q84,162 100,166 Q116,162 116,156 Q116,142 114,130 Q100,124 86,130 Z"/>',
  ]},
  // glutes
  { muscle: "glutes", shapes: [
    '<path d="M76,164 Q72,176 74,190 Q78,198 90,196 Q98,192 100,180 Q96,168 88,164 Z"/>',
    '<path d="M124,164 Q128,176 126,190 Q122,198 110,196 Q102,192 100,180 Q104,168 112,164 Z"/>',
  ]},
  // hamstrings
  { muscle: "hamstrings", shapes: [
    '<path d="M76,200 Q72,218 72,238 Q74,248 80,248 Q88,246 90,234 Q92,216 90,200 Q84,196 76,200 Z"/>',
    '<path d="M124,200 Q128,218 128,238 Q126,248 120,248 Q112,246 110,234 Q108,216 110,200 Q116,196 124,200 Z"/>',
  ]},
  // calves
  { muscle: "calves", shapes: [
    '<path d="M74,248 Q70,262 70,280 Q72,296 78,300 Q84,296 84,280 Q84,262 80,248 Z"/>',
    '<path d="M126,248 Q130,262 130,280 Q128,296 122,300 Q116,296 116,280 Q116,262 120,248 Z"/>',
  ]},
];

const BACK_DECO = `
  <circle cx="100" cy="28" r="18" class="body-deco"/>
  <path d="M92,44 Q92,48 94,52 L106,52 Q108,48 108,44" class="body-deco"/>
  <path d="M66,66 Q64,58 68,50 Q80,42 100,42 Q120,42 132,50 Q136,58 134,66" class="body-outline"/>
  <path d="M36,184 Q32,190 30,196" class="body-outline"/>
  <path d="M164,184 Q168,190 170,196" class="body-outline"/>
  <ellipse cx="80" cy="310" rx="10" ry="5" class="body-deco"/>
  <ellipse cx="120" cy="310" rx="10" ry="5" class="body-deco"/>
`;

function renderBody(regions: Region[], deco: string): string {
  const defs = `<defs>
    <linearGradient id="abGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="var(--pulse)"/>
      <stop offset="100%" stop-color="var(--up)"/>
    </linearGradient>
  </defs>`;
  const regionMarkup = regions
    .flatMap(r => r.shapes.map(s =>
      s.replace(/^<(\w+)/, `<$1 class="muscle-region" data-muscle="${r.muscle}"`)
    ))
    .join("");
  return `<svg viewBox="0 0 200 320" xmlns="http://www.w3.org/2000/svg">${defs}${deco}${regionMarkup}</svg>`;
}

export function renderFrontBody(): string {
  return renderBody(FRONT_REGIONS, FRONT_DECO);
}

export function renderBackBody(): string {
  return renderBody(BACK_REGIONS, BACK_DECO);
}

export function renderMuscleMap(): string {
  return (
    '<div class="muscle-map">' +
    '<div class="muscle-view">' +
    renderBody(FRONT_REGIONS, FRONT_DECO) +
    '<div class="muscle-view-label">Front</div>' +
    "</div>" +
    '<div class="muscle-view">' +
    renderBody(BACK_REGIONS, BACK_DECO) +
    '<div class="muscle-view-label">Back</div>' +
    "</div>" +
    "</div>"
  );
}
