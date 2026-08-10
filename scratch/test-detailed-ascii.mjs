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
const ROWS = 80;
const cellW = width / COLS;
const cellH = height / ROWS;

const CHARS = ["8", "0", "9", "6", "5", "4", "2", "3", "7", "1"];

const startY = 70;
const viewportH = 418;
const lineHeight = viewportH / ROWS; // ~5.22px
const startX = 34;
const charWidth = 452 / COLS; // ~4.11px

// Inspect min and max luminance of non-background pixels
let facePixels = [];
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
    const isBgPixel = (Math.abs(avgR - avgG) < 10 && Math.abs(avgR - avgB) < 10 && avgR > 155);
    const g = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
    
    row.push({ isBgPixel, g });
    if (!isBgPixel) {
      facePixels.push(g);
    }
  }
  grid.push(row);
}

facePixels.sort((a, b) => a - b);
const minG = facePixels[0] || 0;
const maxG = facePixels[facePixels.length - 1] || 255;
console.log(`Face pixels count: ${facePixels.length}, Min G: ${minG.toFixed(1)}, Max G: ${maxG.toFixed(1)}`);

// Color mapper based on normalized luminance (0 = darkest, 1 = brightest)
function getColorAndChar(g, isBg) {
  if (isBg) return { ch: " ", color: "none", opacity: 0 };
  
  // Normalize g to 0..1 within face range
  let norm = (g - minG) / (maxG - minG);
  norm = Math.max(0, Math.min(1, norm));

  // Pick char (0 to CHARS.length - 1)
  const charIdx = Math.floor(norm * (CHARS.length - 1));
  const ch = CHARS[charIdx];

  // Pick color palette according to brightness:
  // Brightest (skin highlights, collar): #FFFFFF, opacity 1
  // Bright (skin): #38BDF8, opacity 0.95
  // Midtone (skin shadows, suit highlights): #60A5FA, opacity 0.85
  // Dark (shadows, suit): #2563EB, opacity 0.65
  // Darkest (hair, eyes, suit shadows): #1E293B or #0F172A, opacity 0.45
  
  if (norm > 0.85) return { ch, color: "#FFFFFF", opacity: 1.0 };
  if (norm > 0.65) return { ch, color: "#38BDF8", opacity: 0.95 };
  if (norm > 0.45) return { ch, color: "#60A5FA", opacity: 0.85 };
  if (norm > 0.25) return { ch, color: "#3B82F6", opacity: 0.70 };
  if (norm > 0.12) return { ch, color: "#1D4ED8", opacity: 0.50 };
  return { ch, color: "#1E293B", opacity: 0.35 };
}

// Generate column elements
let columnsSvg = "";
const TOTAL_DUR = 8; // 8 second full loop

for (let c = 0; c < COLS; c++) {
  const colX = startX + c * charWidth;
  
  // Pseudo-random delay for Tetris drop effect
  const seed = (Math.sin(c * 17.11 + 43.19) * 23421.123) % 1;
  const delay = Math.abs(seed) * 2.2; // 0s to 2.2s delay
  
  let colSpans = "";
  let hasContent = false;
  
  for (let r = 0; r < ROWS; r++) {
    const cell = grid[r][c];
    const { ch, color, opacity } = getColorAndChar(cell.g, cell.isBgPixel);
    
    if (ch !== " ") {
      hasContent = true;
      const y = startY + r * lineHeight;
      colSpans += `<tspan x="${colX.toFixed(2)}" y="${y.toFixed(1)}" fill="${color}" opacity="${opacity}">${ch}</tspan>`;
    }
  }

  if (hasContent) {
    columnsSvg += `  <g class="col-drop" style="animation-delay: ${delay.toFixed(2)}s;">\n`;
    columnsSvg += `    <text class="ascii-font">${colSpans}</text>\n`;
    columnsSvg += `  </g>\n`;
  }
}

// Read dark.svg and update visual-map-viewport
let darkSvg = fs.readFileSync('dark.svg', 'utf8');

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
      font-size: 5.0px;
      font-weight: bold;
      letter-spacing: 0.1px;
    }
    .viewport-clip {
      clip-path: url(#viewport-clip-path);
    }
`;

// Replace style block and viewport
const styleStart = darkSvg.indexOf('<style>');
const styleEnd = darkSvg.indexOf('</style>');
darkSvg = darkSvg.substring(0, styleEnd) + `${newStyles}\n  </style>` + darkSvg.substring(styleEnd + 8);

const viewportStart = darkSvg.indexOf('<g id="visual-map-viewport"');
const viewportEnd = darkSvg.indexOf('<!-- Right Panel: SYSTEM.INFO -->');

const newViewportContent = `<g id="visual-map-viewport" class="viewport-clip">
    <rect x="32" y="64" width="452" height="418" rx="12" fill="#020408" stroke="#1E293B" stroke-width="1"/>
    
    <!-- Multi-shade Detailed Face mapped to Tetris/Matrix falling numbers -->
${columnsSvg}

    <!-- Animated Scanner Line Overlay -->
    <rect x="32" y="64" width="452" height="15" fill="url(#scanner-grad)">
      <animate attributeName="y" values="64; 462; 64" dur="6s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.6; 0.2; 0.6" dur="6s" repeatCount="indefinite" />
    </rect>
  </g>

  `;

darkSvg = darkSvg.substring(0, viewportStart) + newViewportContent + darkSvg.substring(viewportEnd);

fs.writeFileSync('dark.svg', darkSvg, 'utf8');
console.log('Successfully updated dark.svg with detailed multi-shade ASCII face!');
