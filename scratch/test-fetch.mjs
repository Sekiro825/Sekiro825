async function test() {
  const res = await fetch("https://github.com/users/Sekiro825/contributions", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  // Let's search for data-date or tooltips or rect elements or td elements
  const dates = [];
  const regex = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    dates.push(m[0]);
  }
  console.log("Total elements with data-date:", dates.length);
  if (dates.length > 0) {
    console.log("First 3:", dates.slice(0, 3));
    console.log("Last 3:", dates.slice(-3));
  }

  // Let's check how levels/counts are stored on modern GitHub contribution HTML
  // Often it's <td ... data-date="2026-08-13" data-level="2" ...> or tooltips or rects or td elements with id="contribution-day-component-..."
  const levelRegex = /data-level="(\d+)"/g;
  const levels = [];
  while ((m = levelRegex.exec(html)) !== null) {
    levels.push(m[1]);
  }
  console.log("Total levels found:", levels.length);

  const textMatch = html.match(/([\d,]+)\s+contributions\s+in/i) || html.match(/([\d,]+)\s+contributions/i);
  console.log("Contribution text match:", textMatch ? textMatch[0] : "None");
}

test();
