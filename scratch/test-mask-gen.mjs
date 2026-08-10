import fs from 'node:fs';

const buf = fs.readFileSync('Saket_Pokale.png');
const imgBase64 = `data:image/png;base64,${buf.toString("base64")}`;

const COLS = 85;
const ROWS = 60;
const startY = 70;
const lineHeight = 7;
const seq = "01825825SEKIRO825SAKETGENAI";

let maskText = "";
for (let r = 0; r < ROWS; r++) {
  const y = startY + r * lineHeight;
  let rowStr = "";
  for (let c = 0; c < COLS; c++) {
    rowStr += seq[(r * COLS + c) % seq.length];
  }
  maskText += `    <tspan x="32" y="${y}">${rowStr}</tspan>\n`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="610" viewBox="0 0 1180 610">
  <defs>
    <mask id="textMask">
      <rect x="0" y="0" width="1180" height="610" fill="black" />
      <text font-family="'Courier New', Consolas, monospace" font-size="7.5px" font-weight="bold" fill="white" letter-spacing="0.5px">
${maskText}
      </text>
    </mask>
  </defs>

  <rect width="1180" height="610" fill="#090D16" />
  
  <rect x="16" y="22" width="484" height="476" rx="16" fill="#030712" stroke="#1E293B" stroke-width="1.5" />
  
  <image href="${imgBase64}" x="32" y="64" width="452" height="418" preserveAspectRatio="xMidYMin slice" mask="url(#textMask)" />
</svg>`;

fs.writeFileSync('scratch/test-mask.svg', svg);
console.log('Done writing test-mask.svg');
