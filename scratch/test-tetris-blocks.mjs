import fs from 'node:fs';
import zlib from 'node:zlib';

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

const COLS = 110;
const ROWS = 76;
const cellW = width / COLS;
const cellH = height / ROWS;

const CHARS = ["8", "0", "9", "6", "5", "4", "2", "3", "7", "1"];

const startY = 70;
const viewportH = 418;
const lineHeight = viewportH / ROWS; // ~5.50px
const startX = 34;
const charWidth = 452 / COLS; // ~4.11px

// 1. First pass: sample image grid
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
    const g = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
    const isGrayscale = (Math.abs(avgR - avgG) < 12 && Math.abs(avgR - avgB) < 12);

    row.push({ avgR, avgG, avgB, g, isGrayscale });
  }
  grid.push(row);
}

// 2. Flood fill studio backdrop
const isBg = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
const queue = [];

for (let c = 0; c < COLS; c++) {
  if (grid[0][c].g > 135 && grid[0][c].isGrayscale) queue.push([0, c]);
  if (grid[ROWS - 1][c].g > 135 && grid[ROWS - 1][c].isGrayscale) queue.push([ROWS - 1, c]);
}
for (let r = 0; r < ROWS; r++) {
  if (grid[r][0].g > 135 && grid[r][0].isGrayscale) queue.push([r, 0]);
  if (grid[r][COLS - 1].g > 135 && grid[r][COLS - 1].isGrayscale) queue.push([r, COLS - 1]);
}

while (queue.length > 0) {
  const [r, c] = queue.pop();
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
  if (isBg[r][c]) continue;
  if (grid[r][c].g > 130 && grid[r][c].isGrayscale) {
    isBg[r][c] = true;
    queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
}

// 3. Subject luminance min/max
let faceLuminances = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (!isBg[r][c]) faceLuminances.push(grid[r][c].g);
  }
}
faceLuminances.sort((a, b) => a - b);
const minG = faceLuminances[0] || 0;
const maxG = faceLuminances[faceLuminances.length - 1] || 255;

function getColorAndChar(g, bgFlag) {
  if (bgFlag) return { ch: " ", color: "none", opacity: 0 };
  let norm = (g - minG) / (maxG - minG);
  norm = Math.max(0, Math.min(1, norm));

  const charIdx = Math.floor(norm * (CHARS.length - 1));
  const ch = CHARS[charIdx];

  if (norm > 0.85) return { ch, color: "#FFFFFF", opacity: 1.0 };
  if (norm > 0.68) return { ch, color: "#38BDF8", opacity: 0.95 };
  if (norm > 0.48) return { ch, color: "#60A5FA", opacity: 0.85 };
  if (norm > 0.30) return { ch, color: "#3B82F6", opacity: 0.70 };
  if (norm > 0.15) return { ch, color: "#1D4ED8", opacity: 0.50 };
  return { ch, color: "#1E293B", opacity: 0.35 };
}

// 4. Divide into Tetris Block Chunks (e.g. 5 cols wide x 4 rows high per block)
const BLOCK_W = 5; // 5 columns per block
const BLOCK_H = 4; // 4 rows per block

const NUM_BLOCK_COLS = Math.ceil(COLS / BLOCK_W);
const NUM_BLOCK_ROWS = Math.ceil(ROWS / BLOCK_H);

let tetrisBlocksSvg = "";
const TOTAL_DUR = 9; // 9 second smooth loop

for (let br = 0; br < NUM_BLOCK_ROWS; br++) {
  for (let bc = 0; bc < NUM_BLOCK_COLS; bc++) {
    const rStart = br * BLOCK_H;
    const rEnd = Math.min(ROWS, rStart + BLOCK_H);
    const cStart = bc * BLOCK_W;
    const cEnd = Math.min(COLS, cStart + BLOCK_W);

    let blockContent = "";
    let hasContent = false;

    for (let r = rStart; r < rEnd; r++) {
      for (let c = cStart; c < cEnd; c++) {
        const cell = grid[r][c];
        const { ch, color, opacity } = getColorAndChar(cell.g, isBg[r][c]);
        if (ch !== " ") {
          hasContent = true;
          const x = startX + c * charWidth;
          const y = startY + r * lineHeight;
          blockContent += `<tspan x="${x.toFixed(2)}" y="${y.toFixed(1)}" fill="${color}" opacity="${opacity}">${ch}</tspan>`;
        }
      }
    }

    if (hasContent) {
      // Tetris delay: bottom blocks land first, top blocks land after them!
      // Add pseudo-random offset so blocks in the same row don't land at the exact same instant
      const seed = (Math.sin(bc * 13.7 + br * 29.3) * 43758.5453) % 1;
      const rowProgress = (NUM_BLOCK_ROWS - 1 - br) / NUM_BLOCK_ROWS; // 0 (top) to 1 (bottom)
      // Bottom row (br = NUM_BLOCK_ROWS-1) has delay ~0s to 0.5s
      // Top row (br = 0) has delay ~2.2s to 2.7s
      const delay = (1 - rowProgress) * 2.2 + Math.abs(seed) * 0.45;

      tetrisBlocksSvg += `  <g class="tetris-block" style="animation-delay: ${delay.toFixed(2)}s;">\n`;
      tetrisBlocksSvg += `    <text class="ascii-font">${blockContent}</text>\n`;
      tetrisBlocksSvg += `  </g>\n`;
    }
  }
}

console.log(`Generated ${NUM_BLOCK_COLS * NUM_BLOCK_ROWS} Tetris block chunks.`);

// 5. Update dark.svg
let darkSvg = fs.readFileSync('dark.svg', 'utf8');

const newStyles = `
    @keyframes tetrisBlockFall {
      0% {
        transform: translateY(-460px) scale(0.9);
        opacity: 0;
      }
      12% {
        opacity: 0.9;
      }
      38% {
        transform: translateY(0px) scale(1);
        opacity: 1;
      }
      84% {
        transform: translateY(0px) scale(1);
        opacity: 1;
      }
      96% {
        transform: translateY(0px) scale(0.95);
        opacity: 0;
      }
      100% {
        transform: translateY(-460px) scale(0.9);
        opacity: 0;
      }
    }
    
    .tetris-block {
      animation: tetrisBlockFall ${TOTAL_DUR}s cubic-bezier(0.16, 1, 0.3, 1) infinite;
    }
    .ascii-font {
      font-family: 'Courier New', Consolas, monospace;
      font-size: 5.0px;
      font-weight: bold;
      letter-spacing: 0.1px;
    }
    .viewport-clip {
      clip-path: url(#viewport-clip-path);
    }
`;

const styleStart = darkSvg.indexOf('<style>');
const styleEnd = darkSvg.indexOf('</style>');
darkSvg = darkSvg.substring(0, styleEnd) + `${newStyles}\n  </style>` + darkSvg.substring(styleEnd + 8);

const viewportStart = darkSvg.indexOf('<g id="visual-map-viewport"');
const viewportEnd = darkSvg.indexOf('<!-- Right Panel: SYSTEM.INFO -->');

const newViewportContent = `<g id="visual-map-viewport" class="viewport-clip">
    <rect x="32" y="64" width="452" height="418" rx="12" fill="#020408" stroke="#1E293B" stroke-width="1"/>
    
    <!-- Tetris Block Layer-by-Layer Falling Face Assembly -->
${tetrisBlocksSvg}

    <!-- Animated Scanner Line Overlay -->
    <rect x="32" y="64" width="452" height="15" fill="url(#scanner-grad)">
      <animate attributeName="y" values="64; 462; 64" dur="6s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.6; 0.2; 0.6" dur="6s" repeatCount="indefinite" />
    </rect>
  </g>

  `;

darkSvg = darkSvg.substring(0, viewportStart) + newViewportContent + darkSvg.substring(viewportEnd);

fs.writeFileSync('dark.svg', darkSvg, 'utf8');
console.log('Successfully updated dark.svg with smooth Tetris block falling animation!');
