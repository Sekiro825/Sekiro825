import fs from 'node:fs';

const buf = fs.readFileSync('Saket_Pokale.png');
const imgBase64 = `data:image/png;base64,${buf.toString("base64")}`;

const COLS = 130;
const ROWS = 95;
const startY = 70;
const lineHeight = 4.4;
const seq = "8096542371";

let maskText = "";
for (let r = 0; r < ROWS; r++) {
  const y = startY + r * lineHeight;
  let rowStr = "";
  for (let c = 0; c < COLS; c++) {
    rowStr += seq[(r * COLS + c) % seq.length];
  }
  maskText += `    <tspan x="32" y="${y.toFixed(1)}">${rowStr}</tspan>\n`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="610" viewBox="0 0 1180 610">
  <defs>
    <!-- Text Mask -->
    <mask id="textMask">
      <rect x="0" y="0" width="1180" height="610" fill="black" />
      <text font-family="'Courier New', Consolas, monospace" font-size="4.5px" font-weight="bold" fill="white" letter-spacing="1px">
${maskText}
      </text>
    </mask>

    <!-- Contrast filter to make luminance mask punchier -->
    <filter id="contrast">
      <!-- Convert to grayscale -->
      <feColorMatrix type="matrix" values="
        0.2126 0.7152 0.0722 0 0
        0.2126 0.7152 0.0722 0 0
        0.2126 0.7152 0.0722 0 0
        0 0 0 1 0" />
      <!-- Boost contrast -->
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.5" intercept="-0.2" />
        <feFuncG type="linear" slope="1.5" intercept="-0.2" />
        <feFuncB type="linear" slope="1.5" intercept="-0.2" />
      </feComponentTransfer>
    </filter>

    <!-- Luminance mask from the image -->
    <mask id="faceMask">
      <!-- White background for the mask -->
      <rect x="32" y="64" width="452" height="418" fill="#111" />
      <image href="${imgBase64}" x="32" y="64" width="452" height="418" preserveAspectRatio="xMidYMin slice" filter="url(#contrast)" />
    </mask>
  </defs>

  <rect width="1180" height="610" fill="#030712" />
  
  <rect x="16" y="22" width="484" height="476" rx="16" fill="#020408" stroke="#1E293B" stroke-width="1.5" />
  
  <g mask="url(#textMask)">
    <!-- The exact image luminance, but colored with a single solid color -->
    <rect x="32" y="64" width="452" height="418" fill="#38BDF8" mask="url(#faceMask)" />
  </g>
</svg>`;

fs.writeFileSync('scratch/test-mask-mono.svg', svg);
console.log('Done writing test-mask-mono.svg');
