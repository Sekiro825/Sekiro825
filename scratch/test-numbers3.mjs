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

const COLS = 200;
const ROWS = 145;
const cellW = width / COLS;
const cellH = height / ROWS;

// Densest to lightest numbers
const CHARS = ["8", "0", "9", "6", "5", "4", "2", "3", "7", "1", " ", " "];

let asciiRowsSvg = "";
const startY = 70;
const lineHeight = 418 / ROWS;
const startX = 34;

let minG = 255;
let maxG = 0;

// First pass: find min/max luminance excluding the background
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

// Second pass: generate text
for (let r = 0; r < ROWS; r++) {
  const y = startY + r * lineHeight;
  let rowContent = "";

  for (let c = 0; c < COLS; c++) {
    const cell = grid[r][c];
    let ch = " ";
    
    if (!cell.isBgPixel) {
      // Normalize luminance based on face min/max to maximize contrast
      let normG = (cell.g - minG) / (maxG - minG);
      normG = Math.max(0, Math.min(1, normG));
      
      // Inverse it because darker pixels should be denser characters
      let norm = 1 - normG;
      
      // Gamma correction for contrast
      norm = Math.pow(norm, 1.4);
      
      const idx = Math.floor(norm * (CHARS.length - 1));
      ch = CHARS[Math.min(idx, CHARS.length - 1)];
    }
    
    rowContent += ch;
  }
  asciiRowsSvg += `  <tspan x="${startX}" y="${y.toFixed(1)}">${rowContent}</tspan>\n`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="610" viewBox="0 0 1180 610">
  <rect width="1180" height="610" fill="#030712" />
  <rect x="32" y="64" width="452" height="418" rx="12" fill="#020408" stroke="#1E293B" />
  <text font-family="'Courier New', Consolas, monospace" font-size="${(lineHeight*0.95).toFixed(1)}px" font-weight="bold" fill="#F1F5F9" letter-spacing="0.3px">
${asciiRowsSvg}
  </text>
</svg>`;

fs.writeFileSync('scratch/test-numbers3.svg', svg);
console.log('Done');
