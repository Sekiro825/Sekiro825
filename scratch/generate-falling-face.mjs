import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buffer) {
  let offset = 8, width, height, idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR") {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4, stride = width * bpp, pixels = Buffer.alloc(width * height * bpp);
  let rawIdx = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawIdx++], lineStart = y * stride, prevLineStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const current = raw[rawIdx++];
      let left = x >= bpp ? pixels[lineStart + x - bpp] : 0;
      let up = y > 0 ? pixels[prevLineStart + x] : 0;
      let upLeft = (y > 0 && x >= bpp) ? pixels[prevLineStart + x - bpp] : 0;
      let val = current;
      if (filterType === 1) val = (current + left) & 0xff;
      else if (filterType === 2) val = (current + up) & 0xff;
      else if (filterType === 3) val = (current + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) val = (current + paethPredictor(left, up, upLeft)) & 0xff;
      pixels[lineStart + x] = val;
    }
  }
  return { width, height, pixels };
}

const buf = fs.readFileSync('Saket_Pokale.png');
const { width, height, pixels } = decodePNG(buf);

const COLS = 95;
const ROWS = 68;
const cellW = width / COLS;
const cellH = height / ROWS;

// Densest to lightest numbers
const CHARS = ["8", "0", "9", "6", "5", "4", "2", "3", "7", "1", " ", " "];

const startY = 70;
const viewportY = 64;
const viewportH = 418;
const lineHeight = viewportH / ROWS; // ~6.14px
const startX = 34;
const charWidth = 452 / COLS; // ~4.75px

let minG = 255;
let maxG = 0;

const grid = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    const startXPixel = Math.floor(c * cellW);
    const endXPixel = Math.floor((c + 1) * cellW);
    const startYPixel = Math.floor(r * cellH);
    const endYPixel = Math.floor((r + 1) * cellH);

    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let py = startYPixel; py < endYPixel; py++) {
      for (let px = startXPixel; px < endXPixel; px++) {
        const idx = (py * width + px) * 4;
        sumR += pixels[idx];
        sumG += pixels[idx + 1];
        sumB += pixels[idx + 2];
        count++;
      }
    }

    const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
    // Studio backdrop check (light gray)
    const isBgPixel = (Math.abs(avgR - avgG) < 8 && Math.abs(avgR - avgB) < 8 && avgR > 165);
    
    let g = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
    row.push({ isBgPixel, g });
    
    if (!isBgPixel) {
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
    }
  }
  grid.push(row);
}

// Generate column elements
let columnsSvg = "";
const TOTAL_DUR = 8; // 8 second full loop

// Pseudo-random pseudo-tetris delays for each column
for (let c = 0; c < COLS; c++) {
  const colX = startX + c * charWidth;
  
  // Staggered delays: pseudo random distribution so columns fall like Tetris / Matrix rain
  // Pseudo-random function based on col index:
  const seed = (Math.sin(c * 12.9898 + 78.233) * 43758.5453) % 1;
  const delay = Math.abs(seed) * 2.2; // 0s to 2.2s delay
  
  let colSpans = "";
  let hasNonSpace = false;
  
  for (let r = 0; r < ROWS; r++) {
    const cell = grid[r][c];
    let ch = " ";
    if (!cell.isBgPixel) {
      let normG = (cell.g - minG) / (maxG - minG);
      normG = Math.max(0, Math.min(1, normG));
      let norm = 1 - normG;
      norm = Math.pow(norm, 1.35); // Contrast enhancement
      const idx = Math.floor(norm * (CHARS.length - 1));
      ch = CHARS[Math.min(idx, CHARS.length - 1)];
    }
    if (ch !== " ") hasNonSpace = true;
    
    const y = startY + r * lineHeight;
    colSpans += `<tspan x="${colX.toFixed(2)}" y="${y.toFixed(1)}">${ch}</tspan>`;
  }

  // Only render columns that have content or random matrix drops
  if (hasNonSpace) {
    columnsSvg += `  <g class="col-drop" style="animation-delay: ${delay.toFixed(2)}s;">\n`;
    columnsSvg += `    <text class="ascii-font">${colSpans}</text>\n`;
    columnsSvg += `  </g>\n`;
  }
}

console.log(`Generated ${COLS} columns SVG elements.`);

// Now read existing dark.svg and replace visual-map-viewport content
const darkSvgPath = 'dark.svg';
let darkSvg = fs.readFileSync(darkSvgPath, 'utf8');

// Insert new CSS for tetris/matrix animation
const newStyles = `
    @keyframes tetrisFall {
      0% { transform: translateY(-440px); opacity: 0; }
      15% { opacity: 1; }
      40% { transform: translateY(0px); opacity: 1; }
      85% { transform: translateY(0px); opacity: 1; }
      98% { transform: translateY(0px); opacity: 0; }
      100% { transform: translateY(-440px); opacity: 0; }
    }
    
    .col-drop {
      animation: tetrisFall ${TOTAL_DUR}s cubic-bezier(0.25, 1, 0.5, 1) infinite;
    }
    .ascii-font {
      font-family: 'Courier New', Consolas, monospace;
      font-size: 5.6px;
      font-weight: bold;
      fill: #38BDF8;
      letter-spacing: 0.2px;
    }
    .viewport-clip {
      clip-path: url(#viewport-clip-path);
    }
`;

// Build clip path to keep falling numbers cleanly inside the viewport frame
const clipDef = `
  <clipPath id="viewport-clip-path">
    <rect x="32" y="64" width="452" height="418" rx="12" />
  </clipPath>
`;

// Modify style block
darkSvg = darkSvg.replace('</style>', `${newStyles}\n  </style>\n  ${clipDef}`);

// Replace the content inside visual-map-viewport
const viewportStart = darkSvg.indexOf('<g id="visual-map-viewport">');
const viewportEnd = darkSvg.indexOf('</g>', darkSvg.indexOf('<!-- Right Panel: SYSTEM.INFO -->') - 100);

const newViewportContent = `<g id="visual-map-viewport" class="viewport-clip">
    <rect x="32" y="64" width="452" height="418" rx="12" fill="#020408" stroke="#1E293B" stroke-width="1"/>
    
    <!-- Face mapped to smooth Tetris/Matrix falling numbers -->
${columnsSvg}

    <!-- Animated Scanner Line Overlay -->
    <rect x="32" y="64" width="452" height="15" fill="url(#scanner-grad)">
      <animate attributeName="y" values="64; 462; 64" dur="6s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.6; 0.2; 0.6" dur="6s" repeatCount="indefinite" />
    </rect>
  </g>`;

darkSvg = darkSvg.substring(0, viewportStart) + newViewportContent + darkSvg.substring(darkSvg.indexOf('<!-- Right Panel: SYSTEM.INFO -->'));

fs.writeFileSync('dark.svg', darkSvg, 'utf8');
console.log('Successfully updated dark.svg with falling Tetris numbers face!');
