import fs from "node:fs";

function validateSvg(filepath) {
  const content = fs.readFileSync(filepath, "utf8");
  console.log(`Validating ${filepath}... Size: ${content.length} bytes`);

  // Check keyTimes attributes
  const keyTimesRegex = /keyTimes="([^"]+)"/g;
  let match;
  let invalidCount = 0;
  let count = 0;

  while ((match = keyTimesRegex.exec(content)) !== null) {
    count++;
    const times = match[1].split(";").map(Number);
    for (let i = 1; i < times.length; i++) {
      if (times[i] <= times[i - 1]) {
        console.error(`Invalid keyTimes at match ${count}: [${times.slice(Math.max(0, i-2), i+2).join(", ")}]`);
        invalidCount++;
        break;
      }
    }
  }

  console.log(`Checked ${count} keyTimes elements. Invalid keyTimes found: ${invalidCount}`);
  if (invalidCount === 0) {
    console.log(`✅ ${filepath} is 100% valid!`);
  }
}

validateSvg("dist/github-snake-dark.svg");
validateSvg("dist/github-snake.svg");
