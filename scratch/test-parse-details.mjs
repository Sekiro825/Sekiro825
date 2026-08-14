async function test() {
  const res = await fetch("https://github.com/users/Sekiro825/contributions", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  
  // Method 1: regex in generate-snake.mjs
  const regexOld = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d+)"/g;
  const daysMapOld = new Map();
  let match;
  while ((match = regexOld.exec(html)) !== null) {
    daysMapOld.set(match[1], parseInt(match[2], 10));
  }

  // Method 2: robust tag/attribute parsing
  const daysMapNew = new Map();
  // Find all elements containing data-date
  const elementRegex = /<(?:td|rect|g|span)[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  let elemMatch;
  while ((elemMatch = elementRegex.exec(html)) !== null) {
    const fullTag = elemMatch[0];
    const dateStr = elemMatch[1];
    const levelMatch = fullTag.match(/data-level="(\d+)"/i);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;
    daysMapNew.set(dateStr, level);
  }

  console.log("Old regex extracted days count:", daysMapOld.size);
  let activeOld = 0;
  for (const lvl of daysMapOld.values()) if (lvl > 0) activeOld++;
  console.log("Old regex active days count:", activeOld);

  console.log("New regex extracted days count:", daysMapNew.size);
  let activeNew = 0;
  for (const lvl of daysMapNew.values()) if (lvl > 0) activeNew++;
  console.log("New regex active days count:", activeNew);

  // Print total contributions text parsing
  const totalTextMatch = html.match(/([\d,]+)\s+contributions/i);
  console.log("Total text match raw:", totalTextMatch ? totalTextMatch[0] : "None");

  // Let's print dates where level > 0 in new regex
  const activeDates = [];
  for (const [d, lvl] of daysMapNew.entries()) {
    if (lvl > 0) activeDates.push({ date: d, level: lvl });
  }
  console.log(`Active dates sample (total ${activeDates.length}):`, activeDates.slice(-10));
}

test();
