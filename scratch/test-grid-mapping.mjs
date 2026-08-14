async function testGridMapping() {
  const res = await fetch("https://github.com/users/Sekiro825/contributions", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();

  const cellRegex = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  const cellsMap = new Map();
  let maxCol = 0;
  let maxRow = 0;

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
      if (col > maxCol) maxCol = col;
      if (row > maxRow) maxRow = row;
      cellsMap.set(`${col}-${row}`, { col, row, date: dateStr, level });
    }
  }

  console.log(`Grid dimensions detected: ${maxCol + 1} cols x ${maxRow + 1} rows`);
  console.log(`Total mapped cells: ${cellsMap.size}`);

  // Count active cells
  let activeCount = 0;
  for (const cell of cellsMap.values()) {
    if (cell.level > 0) activeCount++;
  }
  console.log(`Total active contribution cells: ${activeCount}`);

  // Print total contributions string
  const totalMatch = html.match(/([\d,]+)\s+contributions/i);
  console.log("Total contribution string:", totalMatch ? totalMatch[0].trim() : "Not found");
}

testGridMapping();
