#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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
  let offset = 8;
  let width, height;
  const idatChunks = [];

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

function generateAsciiMatrix(pixels, width, height, isDark = true) {
  const COLS = 72;
  const ROWS = 50;

  // Characters palette consisting of numbers and developer text symbols
  const CHARS = "01825825SEKIRO825SAKETGENAI#@$%&*+=-:. ";

  const cellW = width / COLS;
  const cellH = height / ROWS;

  const rows = [];

  for (let r = 0; r < ROWS; r++) {
    const rowChars = [];
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

          let gray = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
          if (aVal < 100) gray = isDark ? 0 : 255; // transparent bg
          sumBrightness += gray;
          count++;
        }
      }

      const avg = count > 0 ? sumBrightness / count : 0;
      // Brightness fraction (0 to 1)
      const bFrac = isDark ? (avg / 255) : (1 - avg / 255);
      const charIdx = Math.floor((1 - bFrac) * (CHARS.length - 1));
      const char = CHARS[Math.min(CHARS.length - 1, Math.max(0, charIdx))];

      rowChars.push({ char, bFrac });
    }
    rows.push(rowChars);
  }

  return { COLS, ROWS, rows };
}

function buildHeaderSvg(asciiData, isDark = true) {
  const bg = isDark ? "#030712" : "#ffffff";
  const titlebarBg = isDark ? "#090D16" : "#f1f5f9";
  const cardBg = isDark ? "#090D16" : "#f8fafc";
  const cardBorder = isDark ? "#1E293B" : "#e2e8f0";
  const keyColor = isDark ? "#38BDF8" : "#0284C7";
  const valColor = isDark ? "#F1F5F9" : "#0f172a";
  const ccColor = isDark ? "#475569" : "#94a3b8";
  const headColor = isDark ? "#C084FC" : "#7c3aed";
  const accentColor = isDark ? "#34D399" : "#059669";
  const termLabel = isDark ? "#94A3B8" : "#475569";
  const panelTitle = isDark ? "#38BDF8" : "#0284C7";

  const { COLS, ROWS, rows } = asciiData;

  // Render SVG tspan rows for ASCII portrait
  let asciiTextSvg = "";
  const startY = 82;
  const lineHeight = 7.6;
  const startX = 35;

  rows.forEach((row, rIdx) => {
    const y = startY + rIdx * lineHeight;
    let rowContent = "";

    row.forEach(item => {
      // Escape HTML/XML entities
      let ch = item.char;
      if (ch === '&') ch = '&amp;';
      else if (ch === '<') ch = '&lt;';
      else if (ch === '>') ch = '&gt;';
      else if (ch === '"') ch = '&quot;';

      // Pick color based on brightness fraction and theme
      let col;
      if (isDark) {
        if (item.bFrac > 0.75) col = "#f0f9ff"; // highlight white
        else if (item.bFrac > 0.55) col = "#38bdf8"; // bright cyan
        else if (item.bFrac > 0.35) col = "#34d399"; // emerald green
        else if (item.bFrac > 0.20) col = "#818cf8"; // indigo
        else col = "#1e293b"; // dark background
      } else {
        if (item.bFrac > 0.75) col = "#0284c7";
        else if (item.bFrac > 0.55) col = "#0369a1";
        else if (item.bFrac > 0.35) col = "#059669";
        else if (item.bFrac > 0.20) col = "#4f46e5";
        else col = "#cbd5e1";
      }

      rowContent += `<tspan fill="${col}">${ch}</tspan>`;
    });

    asciiTextSvg += `  <tspan x="${startX}" y="${y.toFixed(1)}">${rowContent}</tspan>\n`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="610" viewBox="0 0 1180 610">
<defs>
  <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#38BDF8"/>
    <stop offset="50%" stop-color="#818CF8"/>
    <stop offset="100%" stop-color="#34D399"/>
  </linearGradient>
  <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="${keyColor}" opacity="0.03"/>
  </pattern>
  <style>
    .key    { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${keyColor}; font-weight: bold; }
    .value  { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${valColor}; }
    .cc     { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${ccColor}; }
    .head   { font-family: 'Courier New', Consolas, monospace; font-size: 16px; fill: ${headColor}; font-weight: bold; }
    .accent { font-family: 'Courier New', Consolas, monospace; font-size: 14px; fill: ${accentColor}; font-weight: bold; }
    text, tspan { white-space: pre; }
    .term-label { font-family: 'Courier New', Consolas, monospace; font-size: 12px; fill: ${termLabel}; letter-spacing: 0.5px; }
    .scan-label { font-family: 'Courier New', Consolas, monospace; font-size: 10px; fill: #F87171; letter-spacing: 1px; }
    .panel-title { font-family: 'Courier New', Consolas, monospace; font-size: 11px; fill: ${panelTitle}; letter-spacing: 2px; opacity: 0.9; font-weight: bold; }
    .ascii-text { font-family: 'Courier New', Consolas, monospace; font-size: 7.2px; font-weight: bold; letter-spacing: 0.6px; }
  </style>
</defs>

<!-- Card Background -->
<rect width="1180" height="610" rx="16" fill="${bg}"/>
<rect width="1180" height="610" rx="16" fill="url(#scanlines)"/>

<!-- Titlebar -->
<g id="titlebar">
  <rect x="3" y="3" width="1174" height="36" rx="14" fill="${titlebarBg}"/>
  <circle cx="24" cy="21" r="5.5" fill="#EF4444"/>
  <circle cx="42" cy="21" r="5.5" fill="#F59E0B"/>
  <circle cx="60" cy="21" r="5.5" fill="#10B981"/>
  <text x="590" y="25" text-anchor="middle" class="term-label">saket@devos ~ % ./profile.sh --live</text>
  <circle cx="1122" cy="21" r="4" fill="#F87171">
    <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <text x="1132" y="25" class="scan-label">LIVE</text>
</g>

<g transform="translate(0,38)">
  <!-- Left Panel: VISUAL.MAP Frame & Character/Number Matrix Portrait -->
  <rect x="16" y="22" width="484" height="476" rx="16" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5"/>
  <text x="32" y="44" class="panel-title">VISUAL.MAP // CHARACTER_MATRIX</text>

  <!-- Cyber Badge Overlay -->
  <rect x="32" y="58" width="135" height="20" rx="4" fill="#030712" opacity="0.8" stroke="${cardBorder}" stroke-width="1"/>
  <text x="40" y="72" class="term-label" font-size="9px" fill="${accentColor}">IDENTITY :: SAKET (ASCII)</text>
  
  <!-- ASCII / Character Portrait Render -->
  <text class="ascii-text">
${asciiTextSvg}  </text>

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

  console.log("Generating ASCII character matrix from Saket_Pokale.png...");
  const asciiDark = generateAsciiMatrix(pixels, width, height, true);
  const asciiLight = generateAsciiMatrix(pixels, width, height, false);

  const darkSvg = buildHeaderSvg(asciiDark, true);
  const lightSvg = buildHeaderSvg(asciiLight, false);

  fs.writeFileSync("dark.svg", darkSvg, "utf8");
  fs.writeFileSync("light.svg", lightSvg, "utf8");

  console.log("Updated dark.svg and light.svg successfully with character & number matrix portrait!");
}

main().catch(err => {
  console.error("Error generating header SVGs:", err);
  process.exit(1);
});
