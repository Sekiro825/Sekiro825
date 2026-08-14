import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "Sekiro825";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

// Grid dimensions matching standard GitHub 53-week contribution heatmap
const COLS = 53;
const ROWS = 7;
const CELL_SIZE = 11;
const CELL_GAP = 3;
const STEP = CELL_SIZE + CELL_GAP; // 14px
const MARGIN_LEFT = 35;
const MARGIN_TOP = 42;
const SVG_WIDTH = MARGIN_LEFT + COLS * STEP + 20; // 797px
const SVG_HEIGHT = MARGIN_TOP + ROWS * STEP + 35; // 175px

/**
 * Fetch contribution graph from GitHub GraphQL API or live HTML fallback
 */
async function fetchRealContributions() {
  console.log(`Fetching live contribution graph for ${USERNAME}...`);

  // Try GraphQL API if token is provided
  if (TOKEN) {
    try {
      console.log("Attempting GitHub GraphQL API fetch...");
      const query = `
        query($username: String!) {
          user(login: $username) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    color
                    contributionCount
                    date
                    weekday
                  }
                }
              }
            }
          }
        }
      `;
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          "Authorization": `bearer ${TOKEN}`,
          "User-Agent": "Sekiro825-Snake-Generator"
        },
        body: JSON.stringify({ query, variables: { username: USERNAME } })
      });

      if (res.ok) {
        const json = await res.json();
        const cal = json?.data?.user?.contributionsCollection?.contributionCalendar;
        if (cal && cal.weeks && cal.weeks.length > 0) {
          return parseGraphqlData(cal);
        }
      }
    } catch (e) {
      console.warn("GraphQL API fetch failed, falling back to HTML:", e.message);
    }
  }

  // Fallback to scraping GitHub public contributions HTML page
  try {
    const res = await fetch(`https://github.com/users/${USERNAME}/contributions`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    if (res.ok) {
      const html = await res.text();
      return parseGithubHtml(html);
    }
  } catch (e) {
    console.warn("HTML scrape failed, using fallback grid:", e.message);
  }

  return generateFallbackGrid();
}

function parseGraphqlData(cal) {
  const cellsMap = new Map();
  const weeks = cal.weeks;

  weeks.forEach((w, colIdx) => {
    if (colIdx >= COLS) return;
    w.contributionDays.forEach(d => {
      const rowIdx = d.weekday; // 0 = Sun, 6 = Sat
      const count = d.contributionCount;
      let level = 0;
      if (count > 0 && count <= 3) level = 1;
      else if (count > 3 && count <= 6) level = 2;
      else if (count > 6 && count <= 9) level = 3;
      else if (count > 9) level = 4;

      cellsMap.set(`${colIdx}-${rowIdx}`, { date: d.date, level, count });
    });
  });

  const totalCountText = String(cal.totalContributions || 250);
  return buildGridFromMap(cellsMap, totalCountText);
}

function parseGithubHtml(html) {
  const cellsMap = new Map();

  // Match all <td ... data-date="YYYY-MM-DD" ...>
  const cellRegex = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const dateStr = m[1];
    const levelM = fullTag.match(/data-level="(\d+)"/i);
    const idM = fullTag.match(/id="contribution-day-component-(\d+)-(\d+)"/i);
    const level = levelM ? parseInt(levelM[1], 10) : 0;

    if (idM) {
      const row = parseInt(idM[1], 10);
      const col = parseInt(idM[2], 10);
      if (col < COLS && row < ROWS) {
        cellsMap.set(`${col}-${row}`, { date: dateStr, level });
      }
    }
  }

  const totalMatch = html.match(/([\d,]+)\s+contributions/i);
  const totalCountText = totalMatch ? totalMatch[1] : "265";

  return buildGridFromMap(cellsMap, totalCountText);
}

function buildGridFromMap(cellsMap, totalCountText) {
  const grid = [];
  const activeTargets = [];

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const key = `${c}-${r}`;
      const cellData = cellsMap.get(key);
      const level = cellData ? cellData.level : 0;
      const date = cellData ? cellData.date : "";

      const cell = {
        col: c,
        row: r,
        x: MARGIN_LEFT + c * STEP,
        y: MARGIN_TOP + r * STEP,
        date,
        level
      };
      grid.push(cell);
      if (level > 0) {
        activeTargets.push(cell);
      }
    }
  }

  console.log(`Parsed ${grid.length} cells (${COLS}x${ROWS}) with ${activeTargets.length} active contribution targets! Total count: ${totalCountText}`);
  return { grid, activeTargets, totalCountText };
}

function generateFallbackGrid() {
  const grid = [];
  const activeTargets = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const level = (c % 4 === 0 && r % 2 === 0) ? Math.floor(Math.random() * 3) + 1 : 0;
      const cell = { col: c, row: r, x: MARGIN_LEFT + c * STEP, y: MARGIN_TOP + r * STEP, level };
      grid.push(cell);
      if (level > 0) activeTargets.push(cell);
    }
  }
  return { grid, activeTargets, totalCountText: "250" };
}

/**
 * Snake Rules & Pathfinder (BFS + Left-to-Right Progressive Sweeping & Directional Physics)
 */
function buildSnakePathAndGame(grid, activeTargets) {
  const remainingTargets = new Set(activeTargets.map(t => `${t.col}-${t.row}`));
  const eatenMap = new Map(); // targetKey -> step index when eaten

  let head = { col: 0, row: 0 };
  let lastDir = { dc: 1, dr: 0 };

  const path = [{ col: 0, row: 0, dir: "RIGHT" }];
  const snakeLengths = [3];
  let currentLength = 3;

  function getDirName(dc, dr) {
    if (dc === 1) return "RIGHT";
    if (dc === -1) return "LEFT";
    if (dr === 1) return "DOWN";
    if (dr === -1) return "UP";
    return "RIGHT";
  }

  function getBody(pathHistory, len) {
    const body = [];
    for (let i = 0; i < len; i++) {
      const idx = Math.max(0, pathHistory.length - 1 - i);
      body.push(pathHistory[idx]);
    }
    return body;
  }

  // BFS Shortest Path finding without U-turns or self-collisions
  function findBfsPath(start, target, currentBody) {
    const queue = [{ coord: start, path: [start], dir: lastDir }];
    const visited = new Set();
    visited.add(`${start.col}-${start.row}`);

    const bodySet = new Set(currentBody.slice(0, -1).map(b => `${b.col}-${b.row}`));

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.coord.col === target.col && curr.coord.row === target.row) {
        return curr.path.slice(1);
      }

      const neighbors = [
        { col: curr.coord.col + 1, row: curr.coord.row, dc: 1, dr: 0 },
        { col: curr.coord.col - 1, row: curr.coord.row, dc: -1, dr: 0 },
        { col: curr.coord.col, row: curr.coord.row + 1, dc: 0, dr: 1 },
        { col: curr.coord.col, row: curr.coord.row - 1, dc: 0, dr: -1 },
      ].filter(n => n.col >= 0 && n.col < COLS && n.row >= 0 && n.row < ROWS);

      const validNeighbors = neighbors.filter(n => {
        // Prevent 180 U-turn
        if (n.dc === -curr.dir.dc && n.dr === -curr.dir.dr) return false;
        // Prevent body collision
        const key = `${n.col}-${n.row}`;
        if (bodySet.has(key) && (n.col !== target.col || n.row !== target.row)) return false;
        return true;
      });

      // Directional momentum sorting: prefer continuing straight over turning
      validNeighbors.sort((a, b) => {
        const aSameDir = (a.dc === curr.dir.dc && a.dr === curr.dir.dr) ? -1 : 0;
        const bSameDir = (b.dc === curr.dir.dc && b.dr === curr.dir.dr) ? -1 : 0;
        return aSameDir - bSameDir;
      });

      for (const n of validNeighbors) {
        const key = `${n.col}-${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({
            coord: { col: n.col, row: n.row },
            path: [...curr.path, { col: n.col, row: n.row }],
            dir: { dc: n.dc, dr: n.dr }
          });
        }
      }
    }

    return null;
  }

  // Traverse through targets progressively
  while (remainingTargets.size > 0) {
    let bestTarget = null;
    let minCost = Infinity;

    for (const key of remainingTargets) {
      const [tc, tr] = key.split('-').map(Number);
      const colDiff = tc - head.col;

      let cost = Math.abs(colDiff) * 2 + Math.abs(tr - head.row);
      if (colDiff < 0) cost += 40; // penalize moving backwards

      if (cost < minCost) {
        minCost = cost;
        bestTarget = { col: tc, row: tr, key };
      }
    }

    if (!bestTarget) break;

    const body = getBody(path, currentLength);
    const moves = findBfsPath(head, bestTarget, body);

    if (moves && moves.length > 0) {
      for (const move of moves) {
        const dc = move.col - head.col;
        const dr = move.row - head.row;
        lastDir = { dc, dr };
        head = { col: move.col, row: move.row };

        const dirName = getDirName(dc, dr);
        path.push({ col: head.col, row: head.row, dir: dirName });

        const key = `${head.col}-${head.row}`;
        if (remainingTargets.has(key)) {
          remainingTargets.delete(key);
          eatenMap.set(key, path.length - 1);
          currentLength = Math.min(8, currentLength + 1);
        }
        snakeLengths.push(currentLength);
      }
    } else {
      const possibleMoves = [
        { col: head.col + 1, row: head.row, dc: 1, dr: 0 },
        { col: head.col, row: head.row + 1, dc: 0, dr: 1 },
        { col: head.col, row: head.row - 1, dc: 0, dr: -1 },
        { col: head.col - 1, row: head.row, dc: -1, dr: 0 },
      ].filter(m => m.col >= 0 && m.col < COLS && m.row >= 0 && m.row < ROWS);

      const m = possibleMoves[0];
      lastDir = { dc: m.dc, dr: m.dr };
      head = { col: m.col, row: m.row };
      path.push({ col: head.col, row: head.row, dir: getDirName(m.dc, m.dr) });

      const key = `${head.col}-${head.row}`;
      if (remainingTargets.has(key)) {
        remainingTargets.delete(key);
        eatenMap.set(key, path.length - 1);
        currentLength = Math.min(8, currentLength + 1);
      }
      snakeLengths.push(currentLength);
    }
  }

  // Final move to bottom right corner
  const endTarget = { col: COLS - 1, row: ROWS - 1 };
  const body = getBody(path, currentLength);
  const finalMoves = findBfsPath(head, endTarget, body);
  if (finalMoves) {
    for (const move of finalMoves) {
      const dc = move.col - head.col;
      const dr = move.row - head.row;
      lastDir = { dc, dr };
      head = { col: move.col, row: move.row };
      path.push({ col: head.col, row: head.row, dir: getDirName(dc, dr) });
      snakeLengths.push(currentLength);
    }
  }

  return { path, snakeLengths, eatenMap };
}

/**
 * Generate animated SVG with Snake Physics & Contribution Heatmap
 */
function buildSnakeSvg({ grid, activeTargets, totalCountText }, isDark = true) {
  const { path: snakePath, snakeLengths, eatenMap } = buildSnakePathAndGame(grid, activeTargets);
  const totalSteps = snakePath.length;
  const loopDuration = Math.max(20, Math.min(35, Math.round(totalSteps * 0.12))); // Smooth responsive duration

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
  const headColor = isDark ? "#39d353" : "#216e39";
  const eyeColor = "#ffffff";
  const pupilColor = "#030712";
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
      const eatRatio = stepIdx / (totalSteps - 1);
      const eatTime = eatRatio.toFixed(4);
      const fadeTime = Math.min(1.0, eatRatio + 0.012).toFixed(4);

      // Ensure strictly increasing keyTimes
      const kt0 = "0";
      const kt1 = eatRatio <= 0 ? "0.001" : eatTime;
      const kt2 = fadeTime <= parseFloat(kt1) ? (parseFloat(kt1) + 0.005).toFixed(4) : fadeTime;

      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}">\n`;
      gridSvg += `    <animate attributeName="fill" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="${kt0};${kt1};${kt2};1"\n`;
      gridSvg += `      values="${origColor};${origColor};${emptyCell};${emptyCell}"/>\n`;
      gridSvg += `    <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="${kt0};${kt1};${kt2};1"\n`;
      gridSvg += `      values="1;1;0.35;0.35"/>\n`;
      gridSvg += `  </rect>\n`;
    }
  });

  // Build Snake Segments
  const MAX_SEG = 8;
  const keyTimesArr = snakePath.map((_, i) => (i / (totalSteps - 1)).toFixed(4));
  const keyTimesStr = keyTimesArr.join(";");

  let snakeSvg = `<g id="snake">\n`;

  for (let seg = MAX_SEG; seg >= 0; seg--) {
    const isHead = seg === 0;

    const valuesArr = [];
    const segOpacityValues = [];

    snakePath.forEach((p, i) => {
      const shiftedIdx = Math.max(0, i - seg);
      const sp = snakePath[shiftedIdx];
      const sx = MARGIN_LEFT + sp.col * STEP;
      const sy = MARGIN_TOP + sp.row * STEP;
      valuesArr.push(`${sx},${sy}`);

      const lenAtStep = snakeLengths[i] || 3;
      if (seg <= lenAtStep) {
        segOpacityValues.push("1");
      } else {
        segOpacityValues.push("0");
      }
    });

    const valuesStr = valuesArr.join(";");
    const color = isHead ? headColor : bodyColors[seg % bodyColors.length];
    const rx = isHead ? "4" : "3";
    const segScale = isHead ? 1 : Math.max(0.75, 1 - (seg * 0.04));
    const segSize = Math.round(CELL_SIZE * segScale);
    const offset = Math.round((CELL_SIZE - segSize) / 2);

    snakeSvg += `  <g>\n`;
    snakeSvg += `    <rect x="${offset}" y="${offset}" width="${segSize}" height="${segSize}" rx="${rx}" fill="${color}">\n`;
    snakeSvg += `      <animateTransform attributeName="transform" type="translate" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `        keyTimes="${keyTimesStr}" values="${valuesStr}"/>\n`;
    snakeSvg += `      <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `        keyTimes="${keyTimesStr}" values="${segOpacityValues.join(";")}"/>\n`;

    if (isHead) {
      snakeSvg += `      <animate attributeName="filter" values="drop-shadow(0 0 4px ${headColor})" dur="1.2s" repeatCount="indefinite"/>\n`;
    }

    snakeSvg += `    </rect>\n`;

    // Render eyes on head
    if (isHead) {
      const eyeValuesArr = [];
      snakePath.forEach((p) => {
        const sx = MARGIN_LEFT + p.col * STEP;
        const sy = MARGIN_TOP + p.row * STEP;
        eyeValuesArr.push(`${sx},${sy}`);
      });
      const eyeValuesStr = eyeValuesArr.join(";");

      // Eyes group following head
      snakeSvg += `    <g>\n`;
      snakeSvg += `      <animateTransform attributeName="transform" type="translate" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      snakeSvg += `        keyTimes="${keyTimesStr}" values="${eyeValuesStr}"/>\n`;

      // Directional eyes positioning (Right/Left/Down/Up)
      // We draw 2 eye dots facing movement direction
      snakeSvg += `      <circle cx="8" cy="3" r="1.5" fill="${eyeColor}"/>\n`;
      snakeSvg += `      <circle cx="8" cy="8" r="1.5" fill="${eyeColor}"/>\n`;
      snakeSvg += `      <circle cx="8.5" cy="3" r="0.7" fill="${pupilColor}"/>\n`;
      snakeSvg += `      <circle cx="8.5" cy="8" r="0.7" fill="${pupilColor}"/>\n`;
      snakeSvg += `    </g>\n`;
    }

    snakeSvg += `  </g>\n`;
  }

  snakeSvg += `</g>\n`;

  const totalActive = activeTargets.length;

  return `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="100%" xmlns="http://www.w3.org/2000/svg">
  <style>
    .hud-title { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${hudText}; letter-spacing: 1px; }
    .hud-stats { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${headColor}; }
  </style>

  <!-- Card Frame -->
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

  <!-- Animated Heatmap Snake -->
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

  console.log(`Updated Snake SVGs successfully:\n - ${darkPath}\n - ${lightPath}`);
}

main().catch(err => {
  console.error("Error in generate-snake.mjs:", err);
  process.exit(1);
});
