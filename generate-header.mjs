#!/usr/bin/env node
import fs from "node:fs";
import zlib from "node:zlib";

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

function generateHighResNumberMatrix(pixels, width, height) {
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

  for (let r = 0; r < ROWS; r++) {
    const y = startY + r * lineHeight;
    let rowContent = "";

    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      let ch = " ";
      
      if (!cell.isBgPixel) {
        let normG = (cell.g - minG) / (maxG - minG);
        normG = Math.max(0, Math.min(1, normG));
        
        let norm = 1 - normG;
        norm = Math.pow(norm, 1.4); 
        
        const idx = Math.floor(norm * (CHARS.length - 1));
        ch = CHARS[Math.min(idx, CHARS.length - 1)];
      }
      
      rowContent += ch;
    }
    asciiRowsSvg += `  <tspan x="${startX}" y="${y.toFixed(1)}">${rowContent}</tspan>\n`;
  }
  
  return asciiRowsSvg;
}

function buildHeaderSvg(pixels, width, height, isDark = true) {
  const bg = isDark ? "#030712" : "#ffffff";
  const titlebarBg = isDark ? "#090D16" : "#f1f5f9";
  const cardBg = isDark ? "#090D16" : "#f8fafc";
  const cardBorder = isDark ? "#1E293B" : "#cbd5e1";
  const keyColor = isDark ? "#38BDF8" : "#0284C7";
  const valColor = isDark ? "#F1F5F9" : "#0f172a";
  const ccColor = isDark ? "#475569" : "#94a3b8";
  const headColor = isDark ? "#C084FC" : "#7c3aed";
  const accentColor = isDark ? "#34D399" : "#059669";
  const termLabel = isDark ? "#94A3B8" : "#475569";
  const panelTitle = isDark ? "#38BDF8" : "#0284C7";
  const hudGlow = isDark ? "#34D399" : "#059669";
  const matrixFill = isDark ? "#F1F5F9" : "#0F172A";

  const asciiTextSvg = generateHighResNumberMatrix(pixels, width, height);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="610" viewBox="0 0 1180 610">
<defs>
  <style>
    .key        { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${keyColor}; font-weight: bold; }
    .value      { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${valColor}; }
    .cc         { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${ccColor}; }
    .head       { font-family: 'Courier New', Consolas, monospace; font-size: 16px; fill: ${headColor}; font-weight: bold; }
    .accent     { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${accentColor}; font-weight: bold; }
    text, tspan { white-space: pre; }
    .term-label { font-family: 'Courier New', Consolas, monospace; font-size: 12px; fill: ${termLabel}; letter-spacing: 0.5px; }
    .scan-label { font-family: 'Courier New', Consolas, monospace; font-size: 10px; fill: ${accentColor}; letter-spacing: 1px; font-weight: bold; }
    .panel-title{ font-family: 'Courier New', Consolas, monospace; font-size: 11px; fill: ${panelTitle}; letter-spacing: 2px; opacity: 0.9; font-weight: bold; }
    .ascii-text { font-family: 'Courier New', Consolas, monospace; font-size: 2.7px; font-weight: bold; letter-spacing: 0.3px; fill: ${matrixFill}; }
  </style>
</defs>

<!-- Main Container Card Background -->
<rect width="1180" height="610" rx="16" fill="${bg}"/>

<!-- Top Titlebar -->
<g id="titlebar">
  <rect x="3" y="3" width="1174" height="36" rx="14" fill="${titlebarBg}"/>
  <circle cx="24" cy="21" r="5.5" fill="#EF4444"/>
  <circle cx="42" cy="21" r="5.5" fill="#F59E0B"/>
  <circle cx="60" cy="21" r="5.5" fill="#10B981"/>
  <text x="590" y="25" text-anchor="middle" class="term-label">saket@devos ~ % ./profile.sh</text>
  <circle cx="1122" cy="21" r="4" fill="${accentColor}"></circle>
  <text x="1132" y="25" class="scan-label">READY</text>
</g>

<g transform="translate(0,38)">
  <!-- Left Panel: VISUAL.MAP Frame -->
  <rect x="16" y="22" width="484" height="476" rx="16" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5"/>
  <text x="32" y="44" class="panel-title">VISUAL.MAP // NUMBER_MATRIX</text>

  <!-- Cyber Badge Overlay -->
  <rect x="32" y="54" width="165" height="20" rx="4" fill="${bg}" opacity="0.85" stroke="${cardBorder}" stroke-width="1"/>
  <circle cx="42" cy="64" r="3.5" fill="${hudGlow}"></circle>
  <text x="52" y="68" class="term-label" font-size="9px" fill="${accentColor}">ID :: SAKET (STATIC MATRIX)</text>
  
  <!-- Visual Map Viewport -->
  <g id="visual-map-viewport">
    <rect x="32" y="64" width="452" height="418" rx="12" fill="${isDark ? '#020408' : '#f1f5f9'}" stroke="${cardBorder}" stroke-width="1"/>
    
    <!-- Face details from photo mapped strictly to a high-res monochrome number matrix -->
    <text class="ascii-text">
${asciiTextSvg}    </text>
  </g>

  <!-- Right Panel: SYSTEM.INFO -->
  <rect x="516" y="22" width="648" height="476" rx="16" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5"/>
  <text x="536" y="44" class="panel-title">SYSTEM.INFO</text>
  
  <!-- Content Lines -->
  <g transform="translate(536,76)">
    <text y="0"   class="head">saket@devos</text>
    <text y="20"  class="cc">----------------------------------------------------</text>
    
    <text y="44"  class="key">. Subject:</text>
    <text x="150" y="44"  class="value">Saket Sanjay Pokale</text>
    
    <text y="68"  class="key">. Role:</text>
    <text x="150" y="68"  class="value">Product Engineer Trainee · GenAI &amp; Security</text>
    
    <text y="92"  class="key">. Origin:</text>
    <text x="150" y="92"  class="value">Mumbai, India</text>
    
    <text y="116" class="key">. Education:</text>
    <text x="150" y="116" class="value">BE CS &amp; Honors Cyber Security, CRCE</text>
    
    <text y="140" class="key">. Status:</text>
    <text x="150" y="140" class="accent">Building Enterprise AI &amp; Security Systems</text>
    
    <text y="164" class="key">. ToolChain:</text>
    <text x="150" y="164" class="value">Python, React, Next.js, PyTorch, Docker</text>
    
    <text y="196" class="cc">----------------------------------------------------</text>
    
    <text y="220" class="key">. Core.Lang:</text>
    <text x="150" y="220" class="value">Python, JavaScript, TypeScript, Node.js, C/C++</text>
    
    <text y="244" class="key">. Core.AI/ML:</text>
    <text x="150" y="244" class="value">PyTorch, TensorFlow, OpenCV, RAG, ChromaDB</text>
    
    <text y="268" class="key">. Core.Frontend:</text>
    <text x="150" y="268" class="value">React, Next.js, React Native, Tailwind</text>
    
    <text y="292" class="key">. Core.Backend:</text>
    <text x="150" y="292" class="value">Express.js, REST APIs, Supabase, Firebase</text>
    
    <text y="316" class="key">. Core.Security:</text>
    <text x="150" y="316" class="value">Cyber Security, Ethical Hacking, PII Filters</text>
    
    <text y="348" class="cc">----------------------------------------------------</text>
    
    <text y="372" class="key">. Grid.Mail:</text>
    <text x="150" y="372" class="value">saket82005@gmail.com</text>
    
    <text y="396" class="key">. Grid.LinkedIn:</text>
    <text x="150" y="396" class="value">saket-pokale-2778471b0</text>

    <text y="420" class="key">. Grid.Github:</text>
    <text x="150" y="420" class="value">Sekiro825</text>
  </g>
</g>
</svg>`;
}

async function main() {
  const buf = fs.readFileSync("Saket_Pokale.png");
  const { width, height, pixels } = decodePNG(buf);

  console.log("Generating high-res monochrome number matrix portrait SVGs...");
  const darkSvg = buildHeaderSvg(pixels, width, height, true);
  const lightSvg = buildHeaderSvg(pixels, width, height, false);

  fs.writeFileSync("dark.svg", darkSvg, "utf8");
  fs.writeFileSync("light.svg", lightSvg, "utf8");

  console.log("Updated dark.svg and light.svg successfully!");
}

main().catch(err => {
  console.error("Error generating header SVGs:", err);
  process.exit(1);
});
