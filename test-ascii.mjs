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
  let offset = 8;
  let width, height;
  const idatChunks = [];

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
  const bpp = 4; // RGBA
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);

  let rawIdx = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawIdx++];
    const lineStart = y * stride;
    const prevLineStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const current = raw[rawIdx++];
      const left = x >= bpp ? pixels[lineStart + x - bpp] : 0;
      const up = y > 0 ? pixels[prevLineStart + x] : 0;
      const upLeft = (y > 0 && x >= bpp) ? pixels[prevLineStart + x - bpp] : 0;

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

// Sample down to a grid (e.g. 70 columns x 50 rows)
const COLS = 75;
const ROWS = 55;
// ASCII characters from dark to light / numbers
const CHARS = "01825825SEKIRO825SAKETGENAI#@$%&*+=-:. ";

const cellW = width / COLS;
const cellH = height / ROWS;

let asciiArt = [];
for (let r = 0; r < ROWS; r++) {
  let line = "";
  for (let c = 0; c < COLS; c++) {
    let sumBrightness = 0;
    let count = 0;
    const startX = Math.floor(c * cellW);
    const endX = Math.floor((c + 1) * cellW);
    const startY = Math.floor(r * cellH);
    const endY = Math.floor((r + 1) * cellH);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * 4;
        const rVal = pixels[idx];
        const gVal = pixels[idx + 1];
        const bVal = pixels[idx + 2];
        const aVal = pixels[idx + 3];
        // If transparent background, count as dark/bg or light depending on theme
        let gray = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
        if (aVal < 128) gray = 0; // dark background
        sumBrightness += gray;
        count++;
      }
    }
    const avg = count > 0 ? sumBrightness / count : 0;
    // Map avg (0..255) to character
    const charIdx = Math.floor((1 - avg / 255) * (CHARS.length - 1));
    line += CHARS[Math.min(CHARS.length - 1, Math.max(0, charIdx))];
  }
  asciiArt.push(line);
}

console.log(asciiArt.join('\n'));
