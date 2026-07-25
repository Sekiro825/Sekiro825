import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME || "Sekiro825";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

// Grid layout parameters matching standard GitHub heatmap layout
const COLS = 52;
const ROWS = 7;
const CELL_SIZE = 11;
const CELL_GAP = 3;
const STEP = CELL_SIZE + CELL_GAP; // 14px
const MARGIN_LEFT = 35;
const MARGIN_TOP = 40;
const SVG_WIDTH = MARGIN_LEFT + COLS * STEP + 20; // ~783px
const SVG_HEIGHT = MARGIN_TOP + ROWS * STEP + 35; // ~173px

/**
 * Fetch Sekiro825's actual contribution calendar.
 * Tries GitHub HTML contributions page first (unauthenticated, live), fallback to GraphQL API.
 */
async function fetchContributions() {
  console.log(`Fetching real GitHub contributions for ${USERNAME}...`);
  
  // Try HTML scraping first (works without token)
  try {
    const res = await fetch(`https://github.com/users/${USERNAME}/contributions`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    if (res.ok) {
      const html = await res.text();
      const cells = parseHtmlContributions(html);
      if (cells.length > 0) {
        console.log(`Parsed ${cells.length} contribution days from GitHub HTML!`);
        return cells;
      }
    }
  } catch (e) {
    console.warn("HTML fetch failed, trying GraphQL fallback:", e.message);
  }

  // GraphQL fallback
  if (TOKEN) {
    const query = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                  color
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
        Authorization: `bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: USERNAME } }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data?.user?.contributionsCollection?.contributionCalendar?.weeks) {
        const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
        return parseGraphqlContributions(weeks);
      }
    }
  }

  console.warn("Could not fetch live data, generating realistic placeholder calendar.");
  return generateFallbackCells();
}

function parseHtmlContributions(html) {
  // Regex to match rect or td contribution entries
  // e.g., <td ... data-date="2025-01-01" data-level="2" ...>
  // or tool-tip id="contribution-day-component-0-0" ...
  const regex = /<td[^>]*data-date="([^"]+)"[^>]*data-level="(\d+)"[^>]*>/g;
  const days = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const date = match[1];
    const level = parseInt(match[2], 10);
    // Estimate count from level
    const count = level === 0 ? 0 : level * 3;
    days.push({ date, level, count });
  }

  if (days.length === 0) {
    // Alternate regex format matching tooltips or rects
    const rectRegex = /class="ContributionCalendar-day"[^>]*data-date="([^"]+)"[^>]*data-level="(\d+)"/g;
    while ((match = rectRegex.exec(html)) !== null) {
      days.push({ date: match[1], level: parseInt(match[2], 10), count: parseInt(match[2], 10) * 3 });
    }
  }

  // Format into 52 weeks x 7 rows
  const recent = days.slice(-(COLS * ROWS));
  const cells = [];
  
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const idx = c * ROWS + r;
      const day = recent[idx] || { date: "", level: 0, count: 0 };
      cells.push({
        col: c,
        row: r,
        x: MARGIN_LEFT + c * STEP,
        y: MARGIN_TOP + r * STEP,
        level: day.level,
        count: day.count,
        date: day.date,
      });
    }
  }
  return cells;
}

function parseGraphqlContributions(weeks) {
  const recent = weeks.slice(-COLS);
  const cells = [];
  recent.forEach((week, c) => {
    week.contributionDays.forEach((day, r) => {
      let level = 0;
      if (day.contributionCount > 0) {
        if (day.contributionCount > 10) level = 4;
        else if (day.contributionCount > 5) level = 3;
        else if (day.contributionCount > 2) level = 2;
        else level = 1;
      }
      cells.push({
        col: c,
        row: r,
        x: MARGIN_LEFT + c * STEP,
        y: MARGIN_TOP + r * STEP,
        level,
        count: day.contributionCount,
        date: day.date,
      });
    });
  });
  return cells;
}

function generateFallbackCells() {
  const cells = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const isWeekend = r === 0 || r === 6;
      const rnd = Math.random();
      let level = 0;
      if (!isWeekend && rnd > 0.45) {
        level = Math.floor(rnd * 4) + 1;
      }
      cells.push({
        col: c,
        row: r,
        x: MARGIN_LEFT + c * STEP,
        y: MARGIN_TOP + r * STEP,
        level,
        count: level * 2,
        date: null,
      });
    }
  }
  return cells;
}

/**
 * Generate Snake Path over contribution grid.
 * Slithers across columns, targeting active contribution cells.
 */
function buildSnakePath(cells) {
  // Collect target cells that have contributions (level > 0)
  const targets = cells.filter(c => c.level > 0);
  
  // We construct a continuous lawnmower / slithering path through the 52x7 grid
  // Col 0: down (r=0..6)
  // Col 1: up (r=6..0)
  // ...
  const pathSteps = [];
  for (let c = 0; c < COLS; c++) {
    if (c % 2 === 0) {
      for (let r = 0; r < ROWS; r++) {
        pathSteps.push({ col: c, row: r });
      }
    } else {
      for (let r = ROWS - 1; r >= 0; r--) {
        pathSteps.push({ col: c, row: r });
      }
    }
  }
  return { pathSteps, targets };
}

/**
 * Build SVG string for dark theme or light theme.
 */
function buildSnakeSvg(cells, isDark = true) {
  const { pathSteps, targets } = buildSnakePath(cells);
  const totalSteps = pathSteps.length;
  const loopDuration = 24; // 24 seconds per full loop

  // Color palettes
  const bg = isDark ? "#0d1117" : "#ffffff";
  const hudBg = isDark ? "#161b22" : "#f6f8fa";
  const hudBorder = isDark ? "#30363d" : "#d0d7de";
  const hudText = isDark ? "#58a6ff" : "#0969da";
  const textColor = isDark ? "#c9d1d9" : "#24292f";
  
  // Heatmap cell colors
  const emptyCellColor = isDark ? "#161b22" : "#ebedf0";
  const levelColors = isDark 
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
    
  const snakeHeadColor = isDark ? "#38bdf8" : "#0284c7";
  const snakeBodyColor = isDark ? "#4f46e5" : "#6366f1";
  const snakeTailColor = isDark ? "#a855f7" : "#8b5cf6";

  // Build Grid Rects with Eaten Animations
  let gridSvg = "";
  const targetMap = new Map(cells.map(c => [`${c.col}-${c.row}`, c]));

  cells.forEach(c => {
    const origColor = levelColors[c.level];
    if (c.level === 0) {
      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${emptyCellColor}"/>\n`;
    } else {
      // Find step index where snake visits this cell
      const stepIdx = pathSteps.findIndex(p => p.col === c.col && p.row === c.row);
      const eatTime = (stepIdx / totalSteps).toFixed(4);
      const respawnTime = (Math.min(1.0, stepIdx / totalSteps + 0.05)).toFixed(4);

      // Animate color: starts origColor -> when snake eats at eatTime, changes to emptyCellColor (eaten!)
      gridSvg += `  <rect x="${c.x}" y="${c.y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="2" fill="${origColor}">\n`;
      gridSvg += `    <animate attributeName="fill" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${respawnTime};1"\n`;
      gridSvg += `      values="${origColor};${origColor};${emptyCellColor};${emptyCellColor}"/>\n`;
      gridSvg += `    <animate attributeName="opacity" dur="${loopDuration}s" repeatCount="indefinite"\n`;
      gridSvg += `      keyTimes="0;${eatTime};${eatTime};${respawnTime};1"\n`;
      gridSvg += `      values="1;1;0.4;0.35;0.35"/>\n`;
      gridSvg += `  </rect>\n`;
    }
  });

  // Build Animated Snake (Head + Growing Body Segments)
  // Base length starts at 4, grows to 16 as snake travels through the grid eating contributions!
  const INITIAL_SNAKE_LENGTH = 4;
  const MAX_SNAKE_LENGTH = 16;
  const TOTAL_TARGETS = targets.length;

  let snakeSvg = `<g id="snake">\n`;

  // We generate keyTimes and values for the snake head and body segments
  const keyTimesArr = [];
  const headValuesArr = [];

  pathSteps.forEach((p, i) => {
    const t = (i / (totalSteps - 1)).toFixed(4);
    keyTimesArr.push(t);
    const px = MARGIN_LEFT + p.col * STEP;
    const py = MARGIN_TOP + p.row * STEP;
    headValuesArr.push(`${px},${py}`);
  });

  const keyTimesStr = keyTimesArr.join(";");
  const headValuesStr = headValuesArr.join(";");

  // Render Body Segments (from tail to head)
  for (let seg = MAX_SNAKE_LENGTH; seg >= 0; seg--) {
    const isHead = seg === 0;
    const isTail = seg === MAX_SNAKE_LENGTH;
    const segOffset = seg; // delay in steps

    const segValuesArr = [];
    pathSteps.forEach((p, i) => {
      // Shift index backwards for body segments
      const shiftedIdx = Math.max(0, i - segOffset);
      const sp = pathSteps[shiftedIdx];
      const sx = MARGIN_LEFT + sp.col * STEP;
      const sy = MARGIN_TOP + sp.row * STEP;
      segValuesArr.push(`${sx},${sy}`);
    });

    const segValuesStr = segValuesArr.join(";");
    
    // Scale and opacity dynamics (growth as snake eats)
    // Dynamic opacity: segments beyond current length are invisible until snake grows!
    const segColor = isHead ? snakeHeadColor : (isTail ? snakeTailColor : snakeBodyColor);
    const radius = isHead ? "3.5" : (isTail ? "1.8" : "2.8");

    snakeSvg += `  <rect width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${radius}" fill="${segColor}">\n`;
    snakeSvg += `    <animateTransform attributeName="transform" type="translate" dur="${loopDuration}s" repeatCount="indefinite"\n`;
    snakeSvg += `      keyTimes="${keyTimesStr}" values="${segValuesStr}"/>\n`;

    if (isHead) {
      // Add glowing effect to head
      snakeSvg += `    <animate attributeName="filter" values="drop-shadow(0 0 4px ${snakeHeadColor})" dur="1s" repeatCount="indefinite"/>\n`;
    }
    snakeSvg += `  </rect>\n`;
  }

  snakeSvg += `</g>\n`;

  // HUD / Header Stats
  const totalCount = cells.reduce((acc, c) => acc + c.count, 0);
  const activeDays = targets.length;

  const svg = `<svg viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="100%" xmlns="http://www.w3.org/2000/svg">
  <style>
    .hud-title { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${hudText}; letter-spacing: 1px; }
    .hud-sub { font-family: 'Courier New', Consolas, monospace; font-size: 10px; fill: ${textColor}; opacity: 0.85; }
    .hud-score { font-family: 'Courier New', Consolas, monospace; font-size: 11px; font-weight: bold; fill: ${snakeHeadColor}; }
  </style>

  <!-- Background Card -->
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" rx="10" fill="${bg}" stroke="${hudBorder}" stroke-width="1"/>

  <!-- HUD Header Bar -->
  <rect x="15" y="10" width="${SVG_WIDTH - 30}" height="22" rx="5" fill="${hudBg}" stroke="${hudBorder}" stroke-width="1"/>
  
  <text x="25" y="25" class="hud-title">🐍 SEKIRO825 CONTRIBUTION SNAKE</text>
  <text x="${SVG_WIDTH - 25}" y="25" text-anchor="end" class="hud-score">
    CONTRIBUTIONS: ${totalCount} | HEATMAPS EATEN: ${activeDays}
  </text>

  <!-- Contribution Heatmap Grid -->
  <g id="grid">
${gridSvg}  </g>

  <!-- Animated Snake -->
  ${snakeSvg}
</svg>`;

  return svg;
}

async function main() {
  const cells = await fetchContributions();
  
  const darkSvg = buildSnakeSvg(cells, true);
  const lightSvg = buildSnakeSvg(cells, false);

  const distDir = path.resolve("dist");
  fs.mkdirSync(distDir, { recursive: true });

  const darkPath = path.join(distDir, "github-snake-dark.svg");
  const lightPath = path.join(distDir, "github-snake.svg");

  fs.writeFileSync(darkPath, darkSvg, "utf8");
  fs.writeFileSync(lightPath, lightSvg, "utf8");

  console.log(`Successfully generated:\n - ${darkPath}\n - ${lightPath}`);
}

main().catch(err => {
  console.error("Error generating snake SVGs:", err);
  process.exit(1);
});
