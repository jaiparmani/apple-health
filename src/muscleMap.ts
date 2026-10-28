/**
 * A simplified, stylized front/back body silhouette for the workout logger:
 * not anatomically precise, but legible enough to show at a glance which
 * muscle groups an exercise targets. Each region is an SVG shape tagged
 * `data-muscle="<MuscleId>"` and the shared class `muscle-region` — the
 * client JS toggles a `.lit` / `.lit-secondary` class on matching regions
 * when an exercise is selected; no server-side highlighting logic needed.
 * Styling (fill/transition/glow) lives in dashboard.ts's CSS, keyed off
 * those classes, so this module only emits structure.
 */

interface Region {
  muscle: string;
  shape: string; // raw SVG element markup
}

const FRONT_REGIONS: Region[] = [
  { muscle: "shoulders", shape: '<ellipse cx="62" cy="72" rx="16" ry="13"/>' },
  { muscle: "shoulders", shape: '<ellipse cx="138" cy="72" rx="16" ry="13"/>' },
  { muscle: "chest", shape: '<rect x="72" y="64" width="56" height="38" rx="10"/>' },
  { muscle: "biceps", shape: '<ellipse cx="50" cy="112" rx="10" ry="23"/>' },
  { muscle: "biceps", shape: '<ellipse cx="150" cy="112" rx="10" ry="23"/>' },
  { muscle: "forearms", shape: '<rect x="43" y="136" width="13" height="46" rx="6"/>' },
  { muscle: "forearms", shape: '<rect x="144" y="136" width="13" height="46" rx="6"/>' },
  { muscle: "abs", shape: '<rect x="82" y="104" width="36" height="56" rx="8"/>' },
  { muscle: "obliques", shape: '<rect x="70" y="110" width="10" height="46" rx="5"/>' },
  { muscle: "obliques", shape: '<rect x="120" y="110" width="10" height="46" rx="5"/>' },
  { muscle: "quads", shape: '<rect x="76" y="166" width="21" height="72" rx="10"/>' },
  { muscle: "quads", shape: '<rect x="103" y="166" width="21" height="72" rx="10"/>' },
  { muscle: "calves", shape: '<rect x="78" y="244" width="16" height="52" rx="8"/>' },
  { muscle: "calves", shape: '<rect x="106" y="244" width="16" height="52" rx="8"/>' },
];

const FRONT_DECOR = [
  '<circle cx="100" cy="30" r="19"/>', // head
  '<rect x="92" y="47" width="16" height="15" rx="4"/>', // neck
  '<ellipse cx="86" cy="304" rx="11" ry="6"/>', // left foot
  '<ellipse cx="114" cy="304" rx="11" ry="6"/>', // right foot
].join("");

const BACK_REGIONS: Region[] = [
  { muscle: "traps", shape: '<path d="M80 55 L120 55 L112 78 L88 78 Z"/>' },
  { muscle: "shoulders", shape: '<ellipse cx="62" cy="72" rx="16" ry="13"/>' },
  { muscle: "shoulders", shape: '<ellipse cx="138" cy="72" rx="16" ry="13"/>' },
  { muscle: "lats", shape: '<path d="M70 80 L130 80 L122 128 L100 140 L78 128 Z"/>' },
  { muscle: "triceps", shape: '<ellipse cx="50" cy="112" rx="10" ry="23"/>' },
  { muscle: "triceps", shape: '<ellipse cx="150" cy="112" rx="10" ry="23"/>' },
  { muscle: "forearms", shape: '<rect x="43" y="136" width="13" height="46" rx="6"/>' },
  { muscle: "forearms", shape: '<rect x="144" y="136" width="13" height="46" rx="6"/>' },
  { muscle: "lower_back", shape: '<rect x="85" y="128" width="30" height="26" rx="6"/>' },
  { muscle: "glutes", shape: '<rect x="76" y="158" width="48" height="34" rx="16"/>' },
  { muscle: "hamstrings", shape: '<rect x="76" y="196" width="21" height="54" rx="10"/>' },
  { muscle: "hamstrings", shape: '<rect x="103" y="196" width="21" height="54" rx="10"/>' },
  { muscle: "calves", shape: '<rect x="78" y="244" width="16" height="52" rx="8"/>' },
  { muscle: "calves", shape: '<rect x="106" y="244" width="16" height="52" rx="8"/>' },
];

const BACK_DECOR = [
  '<circle cx="100" cy="30" r="19"/>',
  '<rect x="92" y="47" width="16" height="15" rx="4"/>',
  '<ellipse cx="86" cy="304" rx="11" ry="6"/>',
  '<ellipse cx="114" cy="304" rx="11" ry="6"/>',
].join("");

function renderBody(regions: Region[], decor: string): string {
  const regionMarkup = regions
    .map((r) => r.shape.replace(/^<(\w+)/, `<$1 class="muscle-region" data-muscle="${r.muscle}"`))
    .join("");
  return `<svg viewBox="0 0 200 320" class="muscle-body">${decor}${regionMarkup}</svg>`;
}

export function renderMuscleMap(): string {
  return (
    '<div class="muscle-map">' +
    '<div class="muscle-view">' +
    renderBody(FRONT_REGIONS, FRONT_DECOR) +
    '<div class="muscle-view-label">Front</div>' +
    "</div>" +
    '<div class="muscle-view">' +
    renderBody(BACK_REGIONS, BACK_DECOR) +
    '<div class="muscle-view-label">Back</div>' +
    "</div>" +
    "</div>"
  );
}
