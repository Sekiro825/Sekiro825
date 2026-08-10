import fs from 'fs';

const svg = fs.readFileSync('dark.svg', 'utf8');

// Extract the ascii-text block
const startIdx = svg.indexOf('<text class="ascii-text">');
const endIdx = svg.indexOf('</text>', startIdx);
const asciiBlock = svg.substring(startIdx, endIdx);

// Extract all tspan lines
const lines = [];
const regex = /<tspan[^>]*>(.*?)<\/tspan>/g;
let match;
while ((match = regex.exec(asciiBlock)) !== null) {
    lines.push(match[1]);
}

console.log('Extracted lines:', lines.length);
if (lines.length > 0) {
    console.log('Line length:', lines[0].length);
}
