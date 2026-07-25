import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "Sekiro825";

// Grid dimensions matching standard GitHub heatmap layout
const COLS = 52;
const ROWS = 7;
const CELL_SIZE = 11;
const CELL_GAP = 3;
const STEP = CELL_SIZE + CELL_GAP; // 14px
const MARGIN_LEFT = 35;
const MARGIN_TOP = 42;
const SVG_WIDTH = MARGIN_LEFT + COLS * STEP + 20; // ~783px
const SVG_HEIGHT = MARGIN_TOP + ROWS * STEP + 35; // ~175px

/**
 * Fetch exact contribution calendar from GitHub HTML for USERNAME
 */
async function fetchRealContributions() {
  console.log(`Fetching live contribution graph for ${USERNAME}...`);
  try {
    const res = await fetch(`https://github.com/users/${USERNAME}/contributions`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    if (res.ok) {
      const html = await res.text();
      return parseGithubHtml(html);
    }
  } catch (e) {
    console.warn("Fetch error, using fallback grid:", e.message);
  }
  return generateFallbackGrid();
}

function parseGithubHtml(html) {
  const daysMap = new Map();
  const regex = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    daysMap.set(match[1], parseInt(match[2], 10));
  }

  // Extract total contributions text if available
  const textMatch = html.match(/([\d,]+)\s+contributions/i);
  const totalCountText = textMatch ? textMatch[1] : "56";

  // Calculate 52-week calendar dates (Ending on current week's Saturday)
  const sortedDates = Array.from(daysMap.keys()).sort();
  const lastDateStr = sortedDates[sortedDates.length - 1] || "2026-07-25";
  const lastDate = new Date(lastDateStr + "T00:00:00Z");

  const lastDayOfWeek = lastDate.getUTCDay(); // 0 = Sun, 6 = Sat
  const endDate = new Date(lastDate);
  endDate.setUTCDate(lastDate.getUTCDate() + (6 - lastDayOfWeek));

  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - 363);

  const grid = [];
  const activeTargets = [];

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const d = new Date(startDate);
      d.setUTCDate(startDate.getUTCDate() + (c * 7 + r));
      const dateStr = d.toISOString().slice(0, 10);
      const level = daysMap.get(dateStr) || 0;

      const cell = {
        col: c,
        row: r,
        x: MARGIN_LEFT + c * STEP,
        y: MARGIN_TOP + r * STEP,
        date: dateStr,
        level,
      };
      grid.push(cell);
      if (level > 0) {
        activeTargets.push(cell);
      }
    }
  }

  console.log(`Parsed ${grid.length} cells with ${activeTargets.length} active contribution targets! Total count: ${totalCountText}`);
  return { grid, activeTargets, totalCountText };
}

function generateFallbackGrid() {
  const grid = [];
  const activeTargets = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const level = (c % 7 === 0 && r % 3 === 0) ? Math.floor(Math.random() * 3) + 1 : 0;
      const cell = { col: c, row: r, x: MARGIN_LEFT + c * STEP, y: MARGIN_TOP + r * STEP, level };
      grid.push(cell);
      if (level > 0) activeTargets.push(cell);
    }
  }
  return { grid, activeTargets, totalCountText: "41" };
}

/**
 * Generate randomized, organic slithering path that visits active contribution cells
 */
function buildOrganicSnakePath(grid, activeTargets) {
  // Sort targets chronologically by column and row with slight randomness
  const targets = [...activeTargets].sort((a, b) => a.col - b.col || a.row - b.row);
  
  const path = [{ col: 0, row: 0 }];
  const eatenMap = new Map(); // targetKey -> step index when eaten

  let curr = { col: 0, row: 0 };

  // Helper to step towards a coordinate
  function stepTowards(target) {
    while (curr.col !== target.col || curr.row !== target.row) {
      const moves = [];
      if (curr.col < target.col) moves.push({ col: curr.col + 1, row: curr.row });
      if (curr.col > target.col) moves.push({ col: curr.col - 1, row: curr.row });
      if (curr.row < target.row) moves.push({ col: curr.col, row: curr.row + 1 });
      if (curr.row > target.row) moves.push({ col: curr.col, row: curr.row - 1 });

      // Pick move closest to target or randomized slight turn
      moves.sort((a, b) => {
        const distA = Math.abs(a.col - target.col) + Math.abs(a.row - target.row);
        const distB = Math.abs(b.col - target.col) + Math.abs(b.row - target.row);
        return distA - distB;
      });

      curr = moves[0];
      path.push({ ...curr });

      // Check if we hit a target
      const key = `${curr.col}-${curr.row}`;
      if (!eatenMap.has(key)) {
        const isTarget = targets.some(t => t.col === curr.col && t.row === curr.row);
        if (isTarget) {
          eatenMap.set(key, path.length - 1);
        }
      }
    }
  }

  // Visit all active targets sequentially
  for (const t of targets) {
    stepTowards(t);
  }

  // Complete path to end of board
  stepTowards({ col: COLS - 1, row: ROWS - 1 });

  return { path, eatenMap };
}

/**
 * Generate animated SVG (Dark theme or Light theme)
 */
function buildSnakeSvg({ grid, activeTargets, totalCountText }, isDark = true) {
  const { path: snakePath, eatenMap } = buildOrganicSnakePath(grid, activeTargets);
  const totalSteps = snakePath.length;
  const loopDuration = 32; // Smooth slow arcade pacing (32 seconds)

  // Styling & colors
  const bg = isDark ? "#030712" : "#ffffff";
  const cardBorder = isDark ? "#1e293b" : "#e2e8f0";
  const hudBg = isDark ? "#090d16" : "#f8fafc";
  const hudText = isDark ? "#38bdf8" : "#0284c7";
  const textColor = isDark ? "#94a3b8" : "#475569";

  const emptyCell = isDark ? "#161b22" : "#ebedf0";
  const levelColors = isDark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  const headColor = isDark ? "#38bdf8" : "#0284c7";
  const bodyColor = isDark ? "#818cf8" : "#4f46e5";

  // Build Heatmap Cells with Eating Dissolve Animation
  let gridSvg = "";
  grid.forEach(c => {
    const key = `${c.col}-${c.row}`;
    const origColor = levelColors[c.level];

    if (c.level === 0 || !eatenMap.has(key)) {
      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}"/>\n`;
    } else {
      const stepIdx = eatenMap.get(key);
      const eatTime = (stepIdx / (totalSteps - 1)).toFixed(4);
      const fadeTime = (Math.min(1.0, stepIdx / (totalSteps - 1) + 0.02)).toFixed(4);

      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}">\n`;
      gridSvg += `    <animate attributeName="fill" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${fadeTime};1"\n`;
      gridSvg += `      values="${origColor};${origColor};${emptyCell};${emptyCell}"/>\n`;
      gridSvg += `    <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${fadeTime};1"\n`;
      gridSvg += `      values="1;1;0.35;0.35"/>\n`;
      gridSvg += `  </rect>\n`;
    }
  });

  // Build Snake with Dynamic Growth (starts small length=3, grows up to length=14)
  const MAX_LENGTH = 14;
  const keyTimesArr = [];
  const headValuesArr = [];

  snakePath.forEach((p, i) => {
    const t = (i / (totalSteps - 1)).toFixed(4);
    keyTimesArr.push(t);
    const px = MARGIN_LEFT + p.col * STEP;
    const py = MARGIN_TOP + p.row * STEP;
    headValuesArr.push(`${px},${py}`);
  });

  const keyTimesStr = keyTimesArr.join(";");

  let snakeSvg = `<g id="snake">\n`;

  // Render Segments: Tail to Head
  for (let seg = MAX_LENGTH; seg >= 0; seg--) {
    const isHead = seg === 0;
    const segOffset = seg;

    const valuesArr = [];
    snakePath.forEach((p, i) => {
      const shiftedIdx = Math.max(0, i - segOffset);
      const sp = snakePath[shiftedIdx];
      const sx = MARGIN_LEFT + sp.col * STEP;
      const sy = MARGIN_TOP + sp.row * STEP;
      valuesArr.push(`${sx},${sy}`);
    });

    const valuesStr = valuesArr.join(";");

    // Growth calculation: snake starts small (length=3) and grows as it progresses along path
    const segOpacityKeyTimes = [];
    const segOpacityValues = [];

    snakePath.forEach((p, i) => {
      const t = (i / (totalSteps - 1)).toFixed(4);
      segOpacityKeyTimes.push(t);

      // Current progress fraction (0.0 to 1.0)
      const progress = i / totalSteps;
      // Max length allowed at this stage of progress (starts at 3, reaches 14 at progress=0.8)
      const currentAllowedLength = 3 + Math.floor(progress * (MAX_LENGTH - 3));

      if (seg <= currentAllowedLength) {
        segOpacityValues.push("1");
      } else {
        segOpacityValues.push("0");
      }
    });

    const color = isHead ? headColor : bodyColor;
    const rx = isHead ? "3.5" : "2.5";

    snakeSvg += `  <rect width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${rx}" fill="${color}">\n`;
    snakeSvg += `    <animateTransform attributeName="transform" type="translate" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `      keyTimes="${keyTimesStr}" values="${valuesStr}"/>\n`;
    snakeSvg += `    <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `      keyTimes="${segOpacityKeyTimes.join(";")}" values="${segOpacityValues.join(";")}"/>\n`;
    
    if (isHead) {
      snakeSvg += `    <animate attributeName="filter" values="drop-shadow(0 0 5px ${headColor})" dur="1.2s" repeatCount="indefinite"/>\n`;
    }
    snakeSvg += `  </rect>\n`;
  }

  snakeSvg += `</g>\n`;

  const totalActive = activeTargets.length;

  const svg = `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="100%" xmlns="http://www.w3.org/2000/svg">
  <style>
    .hud-title { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${hudText}; letter-spacing: 1px; }
    .hud-stats { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${headColor}; }
  </style>

  <!-- Solid Background -->
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="${bg}" stroke="${cardBorder}" stroke-width="1.5"/>

  <!-- HUD Bar -->
  <rect x="15" y="10" width="${SVG_WIDTH - 30}" height="22" rx="6" fill="${hudBg}" stroke="${cardBorder}" stroke-width="1"/>
  
  <text x="25" y="25" class="hud-title">🐍 SEKIRO825 CONTRIBUTION SNAKE</text>
  <text x="${SVG_WIDTH - 25}" y="25" text-anchor="end" class="hud-stats">
    TOTAL: ${totalCountText} CONTRIBUTIONS | HEATMAPS EATEN: ${totalActive}
  </text>

  <!-- Exact Contribution Calendar Grid -->
  <g id="grid">
${gridSvg}  </g>

  <!-- Dynamic Organic Growing Snake -->
  ${snakeSvg}
</svg>`;

  return svg;
}

async function main() {
  const contribData = await fetchRealContributions();

  const darkSvg = buildSnakeSvg(contribData, true);
  const lightSvg = buildSnakeSvg(contribData, false);

  const distDir = path.resolve("dist");
  fs.mkdirSync(distDir, { recursive: true });

  const darkPath = path.join(distDir, "github-snake-dark.svg");
  const lightPath = path.join(distDir, "github-snake.svg");

  fs.writeFileSync(darkPath, darkSvg, "utf8");
  fs.writeFileSync(lightPath, lightSvg, "utf8");

  console.log(`Updated SVGs successfully:\n - ${darkPath}\n - ${lightPath}`);
}

main().catch(err => {
  console.error("Error in generate-snake.mjs:", err);
  process.exit(1);
});
