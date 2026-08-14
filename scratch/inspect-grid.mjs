async function inspectGithubGrid() {
  const res = await fetch("https://github.com/users/Sekiro825/contributions", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();

  // Inspect td elements
  const cellRegex = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  const cells = [];
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const dateStr = m[1];
    const levelM = fullTag.match(/data-level="(\d+)"/i);
    const colM = fullTag.match(/id="contribution-day-component-(\d+)-(\d+)"/i); // note: is it row-col or col-row?
    const level = levelM ? parseInt(levelM[1], 10) : 0;
    cells.push({ date: dateStr, level, fullTag, id: colM ? colM[0] : null });
  }

  console.log("Total td cells:", cells.length);
  if (cells.length > 0) {
    console.log("First 5 cells:", cells.slice(0, 5));
    console.log("Last 5 cells:", cells.slice(-5));
  }
}

inspectGithubGrid();
