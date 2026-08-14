async function fetchRealContributions(username = "Sekiro825") {
  console.log(`Fetching live contribution graph for ${username}...`);

  // Try HTML parsing
  try {
    const res = await fetch(`https://github.com/users/${username}/contributions`, {
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
  const COLS = 53;
  const ROWS = 7;
  const STEP = 14;
  const MARGIN_LEFT = 35;
  const MARGIN_TOP = 42;

  const cellsMap = new Map();

  // Match all <td ... data-date="..." ...>
  const cellRegex = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const dateStr = m[1];
    const levelM = fullTag.match(/data-level="(\d+)"/i);
    const idM = fullTag.match(/id="contribution-day-component-(\d+)-(\d+)"/i);
    const level = levelM ? parseInt(levelM[1], 10) : 0;

    if (idM) {
      const row = parseInt(idM[1], 10); // 0..6
      const col = parseInt(idM[2], 10); // 0..52
      cellsMap.set(`${col}-${row}`, { date: dateStr, level, col, row });
    }
  }

  // Extract total contributions string
  const totalMatch = html.match(/([\d,]+)\s+contributions/i);
  const totalCountText = totalMatch ? totalMatch[1] : "265";

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

  console.log(`Successfully parsed ${grid.length} cells (${COLS}x${ROWS}) with ${activeTargets.length} active targets. Total count: ${totalCountText}`);
  return { grid, activeTargets, totalCountText, cols: COLS, rows: ROWS };
}

function generateFallbackGrid() {
  const COLS = 53;
  const ROWS = 7;
  const STEP = 14;
  const MARGIN_LEFT = 35;
  const MARGIN_TOP = 42;

  const grid = [];
  const activeTargets = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const level = (c % 5 === 0 && r % 2 === 0) ? Math.floor(Math.random() * 3) + 1 : 0;
      const cell = { col: c, row: r, x: MARGIN_LEFT + c * STEP, y: MARGIN_TOP + r * STEP, level };
      grid.push(cell);
      if (level > 0) activeTargets.push(cell);
    }
  }
  return { grid, activeTargets, totalCountText: "250", cols: COLS, rows: ROWS };
}

async function test() {
  const res = await fetchRealContributions();
  console.log("Active targets count:", res.activeTargets.length);
}

test();
