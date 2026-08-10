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

const COLS = 130;
const ROWS = 100;
const cellW = width / COLS;
const cellH = height / ROWS;

// Use dense characters for dark pixels (to let less image color through) and light/blocky for light pixels?
// Actually, if we use mask: white lets the image through, black blocks it.
// If the image is dark in a spot, making the mask dense will let that dark color through, but if the character has thin strokes, it might be too dark.
// Wait, classic colored ASCII uses characters to form the shape.
const CHARS_DARK = ["@", "#", "8", "B", "W", "M", "$", "&", "S", "E", "K", "I", "R", "O", "8", "2", "5", "0", "1", "+", "=", "-", ":", ".", " "];
// Another approach: Just use a repeated sequence of letters/numbers for the entire image!
const TEXT_SEQ = "SAKET825SEKIRO";

let asciiRowsSvg = "";
const startY = 82; // Start Y in the SVG
const viewportW = 452;
const viewportH = 418;

const charW = viewportW / COLS;
const charH = viewportH / ROWS;

let seqIdx = 0;

for (let r = 0; r < ROWS; r++) {
  const y = startY + r * charH;
  let rowContent = "";

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
    
    // Pick character based on brightness to preserve the "ASCII art" feel
    const norm = Math.max(0, Math.min(1, (255 - g) / 255));
    const idx = Math.floor(norm * (CHARS_DARK.length - 1));
    let ch = CHARS_DARK[idx];

    // Alternatively, just use the sequence, but map brightness to font-weight or leave it uniform
    // If the user wants "made with numbers or letters", mapping density to brightness looks better.
    // Let's use the sequence, but drop characters if it's too bright?
    // Actually, mapping to CHARS_DARK gives the best shape representation.
    
    if (ch === '&') ch = '&amp;';
    else if (ch === '<') ch = '&lt;';
    else if (ch === '>') ch = '&gt;';
    else if (ch === '"') ch = '&quot;';

    rowContent += ch;
  }

  asciiRowsSvg += `  <tspan x="32" y="${y.toFixed(1)}">${rowContent}</tspan>\n`;
}

console.log('SVG rows generated, length:', asciiRowsSvg.length);
