import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "Sekiro825";

// Grid dimensions matching standard GitHub 52-week contribution heatmap
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

  const textMatch = html.match(/([\d,]+)\s+contributions/i);
  const totalCountText = textMatch ? textMatch[1] : "68";

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
  return { grid, activeTargets, totalCountText: "68" };
}

/**
 * Actual Snake Rules Pathfinding:
 * - Snake starts at (0,0)
 * - Traverses step-by-step to the nearest uneaten contribution cell (food)
 * - When reaching food cell, eats it and length increases by 1 segment!
 */
function buildSnakePathAndGame(grid, activeTargets) {
  const remainingTargets = new Set(activeTargets.map(t => `${t.col}-${t.row}`));
  const eatenMap = new Map(); // targetKey -> step index when eaten

  let head = { col: 0, row: 0 };
  const path = [{ col: 0, row: 0 }];
  const snakeLengths = [2]; // length at each step index

  let currentLength = 2;

  function dist(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  }

  while (remainingTargets.size > 0) {
    // Find closest target
    let closestKey = null;
    let minDist = Infinity;
    let targetCoord = null;

    for (const key of remainingTargets) {
      const [tc, tr] = key.split('-').map(Number);
      const d = dist(head, { col: tc, row: tr });
      if (d < minDist) {
        minDist = d;
        closestKey = key;
        targetCoord = { col: tc, row: tr };
      }
    }

    if (!targetCoord) break;

    // Step towards targetCoord step-by-step
    while (head.col !== targetCoord.col || head.row !== targetCoord.row) {
      const possibleMoves = [
        { col: head.col + 1, row: head.row },
        { col: head.col - 1, row: head.row },
        { col: head.col, row: head.row + 1 },
        { col: head.col, row: head.row - 1 },
      ].filter(m => m.col >= 0 && m.col < COLS && m.row >= 0 && m.row < ROWS);

      // Pick move that minimizes distance to target
      possibleMoves.sort((a, b) => dist(a, targetCoord) - dist(b, targetCoord));
      head = possibleMoves[0];
      path.push({ ...head });

      const key = `${head.col}-${head.row}`;
      if (remainingTargets.has(key)) {
        remainingTargets.delete(key);
        eatenMap.set(key, path.length - 1);
        currentLength = Math.min(18, currentLength + 1); // Snake grows upon eating food!
      }

      snakeLengths.push(currentLength);
    }
  }

  // Final march to end of board
  const endTarget = { col: COLS - 1, row: ROWS - 1 };
  while (head.col !== endTarget.col || head.row !== endTarget.row) {
    const possibleMoves = [
      { col: head.col + 1, row: head.row },
      { col: head.col - 1, row: head.row },
      { col: head.col, row: head.row + 1 },
      { col: head.col, row: head.row - 1 },
    ].filter(m => m.col >= 0 && m.col < COLS && m.row >= 0 && m.row < ROWS);

    possibleMoves.sort((a, b) => dist(a, endTarget) - dist(b, endTarget));
    head = possibleMoves[0];
    path.push({ ...head });
    snakeLengths.push(currentLength);
  }

  return { path, snakeLengths, eatenMap };
}

/**
 * Generate animated SVG with Heatmap Color Snake
 */
function buildSnakeSvg({ grid, activeTargets, totalCountText }, isDark = true) {
  const { path: snakePath, snakeLengths, eatenMap } = buildSnakePathAndGame(grid, activeTargets);
  const totalSteps = snakePath.length;
  const loopDuration = 32; // Smooth 32-second loop

  const bg = isDark ? "#030712" : "#ffffff";
  const cardBorder = isDark ? "#1e293b" : "#e2e8f0";
  const hudBg = isDark ? "#090d16" : "#f8fafc";
  const hudText = isDark ? "#39d353" : "#216e39";
  const textColor = isDark ? "#94a3b8" : "#475569";

  const emptyCell = isDark ? "#161b22" : "#ebedf0";
  const levelColors = isDark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  // Heatmap Snake Colors
  const headColor = isDark ? "#39d353" : "#216e39"; // Brightest Heatmap Green
  const bodyColorsDark = ["#26a641", "#006d32", "#7ee787", "#0e4429"];
  const bodyColorsLight = ["#30a14e", "#40c463", "#9be9a8", "#216e39"];
  const bodyColors = isDark ? bodyColorsDark : bodyColorsLight;

  // Build Heatmap Grid Cells with Eating Animation
  let gridSvg = "";
  grid.forEach(c => {
    const key = `${c.col}-${c.row}`;
    const origColor = levelColors[c.level];

    if (c.level === 0 || !eatenMap.has(key)) {
      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}"/>\n`;
    } else {
      const stepIdx = eatenMap.get(key);
      const eatTime = (stepIdx / (totalSteps - 1)).toFixed(4);
      const fadeTime = (Math.min(1.0, stepIdx / (totalSteps - 1) + 0.015)).toFixed(4);

      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}">\n`;
      gridSvg += `    <animate attributeName="fill" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${fadeTime};1"\n`;
      gridSvg += `      values="${origColor};${origColor};${emptyCell};${emptyCell}"/>\n`;
      gridSvg += `    <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${fadeTime};1"\n`;
      gridSvg += `      values="1;1;0.4;0.4"/>\n`;
      gridSvg += `  </rect>\n`;
    }
  });

  // Build Snake Segments: Head at seg 0, Segments 1..MAX_SEG
  const MAX_SEG = 18;
  const keyTimesArr = snakePath.map((_, i) => (i / (totalSteps - 1)).toFixed(4));
  const keyTimesStr = keyTimesArr.join(";");

  let snakeSvg = `<g id="snake">\n`;

  for (let seg = MAX_SEG; seg >= 0; seg--) {
    const isHead = seg === 0;

    const valuesArr = [];
    const segOpacityKeyTimes = [];
    const segOpacityValues = [];

    snakePath.forEach((p, i) => {
      const t = (i / (totalSteps - 1)).toFixed(4);
      segOpacityKeyTimes.push(t);

      const shiftedIdx = Math.max(0, i - seg);
      const sp = snakePath[shiftedIdx];
      const sx = MARGIN_LEFT + sp.col * STEP;
      const sy = MARGIN_TOP + sp.row * STEP;
      valuesArr.push(`${sx},${sy}`);

      // Check if segment is active based on snake's length at step i
      const lenAtStep = snakeLengths[i] || 2;
      if (seg <= lenAtStep) {
        segOpacityValues.push("1");
      } else {
        segOpacityValues.push("0");
      }
    });

    const valuesStr = valuesArr.join(";");
    const color = isHead ? headColor : bodyColors[seg % bodyColors.length];
    const rx = isHead ? "4" : "2.5";

    snakeSvg += `  <g>\n`;
    snakeSvg += `    <rect width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${rx}" fill="${color}">\n`;
    snakeSvg += `      <animateTransform attributeName="transform" type="translate" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `        keyTimes="${keyTimesStr}" values="${valuesStr}"/>\n`;
    snakeSvg += `      <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `        keyTimes="${segOpacityKeyTimes.join(";")}" values="${segOpacityValues.join(";")}"/>\n`;

    if (isHead) {
      snakeSvg += `      <animate attributeName="filter" values="drop-shadow(0 0 6px ${headColor})" dur="1s" repeatCount="indefinite"/>\n`;
    }

    snakeSvg += `    </rect>\n`;
    snakeSvg += `  </g>\n`;
  }

  snakeSvg += `</g>\n`;

  const totalActive = activeTargets.length;

  return `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="100%" xmlns="http://www.w3.org/2000/svg">
  <style>
    .hud-title { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${hudText}; letter-spacing: 1px; }
    .hud-stats { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${headColor}; }
  </style>

  <!-- Solid Background -->
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="12" fill="${bg}" stroke="${cardBorder}" stroke-width="1.5"/>

  <!-- HUD Bar -->
  <rect x="15" y="10" width="${SVG_WIDTH - 30}" height="22" rx="6" fill="${hudBg}" stroke="${cardBorder}" stroke-width="1"/>
  
  <text x="25" y="25" class="hud-title">🐍 SEKIRO825 CONTRIBUTION SNAKE (HEATMAP COLOR)</text>
  <text x="${SVG_WIDTH - 25}" y="25" text-anchor="end" class="hud-stats">
    TOTAL: ${totalCountText} CONTRIBUTIONS | HEATMAPS EATEN: ${totalActive}
  </text>

  <!-- Contribution Heatmap Grid -->
  <g id="grid">
${gridSvg}  </g>

  <!-- Heatmap Color Snake -->
  ${snakeSvg}
</svg>`;
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

  console.log(`Updated Snake SVGs successfully with Heatmap Colors & Snake Rules:\n - ${darkPath}\n - ${lightPath}`);
}

main().catch(err => {
  console.error("Error in generate-snake.mjs:", err);
  process.exit(1);
});
