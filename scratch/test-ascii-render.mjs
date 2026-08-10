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
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
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

const COLS = 76;
const ROWS = 54;

const cellW = width / COLS;
const cellH = height / ROWS;

// Create grayscale map
const grayGrid = [];
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let sum = 0, count = 0;
    const startX = Math.floor(c * cellW);
    const endX = Math.floor((c + 1) * cellW);
    const startY = Math.floor(r * cellH);
    const endY = Math.floor((r + 1) * cellH);
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * 4;
        const g = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        sum += g;
        count++;
      }
    }
    row.push(sum / count);
  }
  grayGrid.push(row);
}

// Background flood detection: studio background is light gray at the top/left/right border (g > 165)
const isBg = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

// Flood fill from borders
const queue = [];
for (let c = 0; c < COLS; c++) {
  if (grayGrid[0][c] > 140) queue.push([0, c]);
  if (grayGrid[ROWS - 1][c] > 140) queue.push([ROWS - 1, c]);
}
for (let r = 0; r < ROWS; r++) {
  if (grayGrid[r][0] > 140) queue.push([0, r]);
  if (grayGrid[r][COLS - 1] > 140) queue.push([r, COLS - 1]);
}

while (queue.length > 0) {
  const [r, c] = queue.pop();
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
  if (isBg[r][c]) continue;
  if (grayGrid[r][c] > 135) { // Studio backdrop brightness threshold
    isBg[r][c] = true;
    queue.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
  }
}

// Palettes for ASCII mapping (dense to sparse)
const CHARS_DARK = ["@", "#", "8", "B", "W", "M", "$", "&", "8", "2", "5", "S", "E", "K", "I", "R", "O", "0", "1", "+", "=", "-", ":", ".", " "];

let out = "";
for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) {
    if (isBg[r][c]) {
      line += " ";
    } else {
      const g = grayGrid[r][c]; // 0 (dark) to 255 (bright)
      // invert for dark background: dark pixels (hair, glasses, suit) should be dense characters
      const norm = Math.max(0, Math.min(1, (255 - g) / 255));
      const idx = Math.floor(norm * (CHARS_DARK.length - 1));
      line += CHARS_DARK[idx];
    }
  }
  out += line + "\n";
}

console.log(out);
