import fs from "node:fs";

async function fetchRealContributions(username = "Sekiro825") {
  const res = await fetch(`https://github.com/users/${username}/contributions`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await res.text();
  const cellRegex = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*>/gi;
  const cellsMap = new Map();
  let m;
  while ((m = cellRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const dateStr = m[1];
    const levelM = fullTag.match(/data-level="(\d+)"/i);
    const idM = fullTag.match(/id="contribution-day-component-(\d+)-(\d+)"/i);
    const level = levelM ? parseInt(levelM[1], 10) : 0;
    if (idM) {
      const row = parseInt(idM[1], 10);
      const col = parseInt(idM[2], 10);
      cellsMap.set(`${col}-${row}`, { date: dateStr, level, col, row });
    }
  }
  const activeTargets = [];
  for (const c of cellsMap.values()) {
    if (c.level > 0) activeTargets.push(c);
  }
  return activeTargets;
}

function buildSnakePathAndGame(activeTargets, cols = 53, rows = 7) {
  const remainingTargets = new Set(activeTargets.map(t => `${t.col}-${t.row}`));
  const eatenMap = new Map(); // key -> step index when eaten

  let head = { col: 0, row: 0 };
  let lastDir = { dc: 1, dr: 0 };

  const path = [{ col: 0, row: 0, dir: "RIGHT" }];
  const snakeLengths = [3];
  let currentLength = 3;

  function getDirName(dc, dr) {
    if (dc === 1) return "RIGHT";
    if (dc === -1) return "LEFT";
    if (dr === 1) return "DOWN";
    if (dr === -1) return "UP";
    return "RIGHT";
  }

  function getBody(pathHistory, len) {
    const body = [];
    for (let i = 0; i < len; i++) {
      const idx = Math.max(0, pathHistory.length - 1 - i);
      body.push(pathHistory[idx]);
    }
    return body;
  }

  function findBfsPath(start, target, currentBody) {
    const queue = [{ coord: start, path: [start], dir: lastDir }];
    const visited = new Set();
    visited.add(`${start.col}-${start.row}`);

    const bodySet = new Set(currentBody.slice(0, -1).map(b => `${b.col}-${b.row}`));

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.coord.col === target.col && curr.coord.row === target.row) {
        return curr.path.slice(1);
      }

      const neighbors = [
        { col: curr.coord.col + 1, row: curr.coord.row, dc: 1, dr: 0 },
        { col: curr.coord.col - 1, row: curr.coord.row, dc: -1, dr: 0 },
        { col: curr.coord.col, row: curr.coord.row + 1, dc: 0, dr: 1 },
        { col: curr.coord.col, row: curr.coord.row - 1, dc: 0, dr: -1 },
      ].filter(n => n.col >= 0 && n.col < cols && n.row >= 0 && n.row < rows);

      const validNeighbors = neighbors.filter(n => {
        if (n.dc === -curr.dir.dc && n.dr === -curr.dir.dr) return false;
        const key = `${n.col}-${n.row}`;
        if (bodySet.has(key) && (n.col !== target.col || n.row !== target.row)) return false;
        return true;
      });

      validNeighbors.sort((a, b) => {
        const aSameDir = (a.dc === curr.dir.dc && a.dr === curr.dir.dr) ? -1 : 0;
        const bSameDir = (b.dc === curr.dir.dc && b.dr === curr.dir.dr) ? -1 : 0;
        return aSameDir - bSameDir;
      });

      for (const n of validNeighbors) {
        const key = `${n.col}-${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({
            coord: { col: n.col, row: n.row },
            path: [...curr.path, { col: n.col, row: n.row }],
            dir: { dc: n.dc, dr: n.dr }
          });
        }
      }
    }

    return null;
  }

  while (remainingTargets.size > 0) {
    let bestTarget = null;
    let minCost = Infinity;

    for (const key of remainingTargets) {
      const [tc, tr] = key.split('-').map(Number);
      const colDiff = tc - head.col;
      
      let cost = Math.abs(colDiff) * 2 + Math.abs(tr - head.row);
      if (colDiff < 0) cost += 40; // strongly penalize moving backwards

      if (cost < minCost) {
        minCost = cost;
        bestTarget = { col: tc, row: tr, key };
      }
    }

    if (!bestTarget) break;

    const body = getBody(path, currentLength);
    const moves = findBfsPath(head, bestTarget, body);

    if (moves && moves.length > 0) {
      for (const move of moves) {
        const dc = move.col - head.col;
        const dr = move.row - head.row;
        lastDir = { dc, dr };
        head = { col: move.col, row: move.row };

        const dirName = getDirName(dc, dr);
        path.push({ col: head.col, row: head.row, dir: dirName });

        const key = `${head.col}-${head.row}`;
        if (remainingTargets.has(key)) {
          remainingTargets.delete(key);
          eatenMap.set(key, path.length - 1);
          currentLength = Math.min(8, currentLength + 1);
        }
        snakeLengths.push(currentLength);
      }
    } else {
      // Step towards closest unblocked cell
      const possibleMoves = [
        { col: head.col + 1, row: head.row, dc: 1, dr: 0 },
        { col: head.col, row: head.row + 1, dc: 0, dr: 1 },
        { col: head.col, row: head.row - 1, dc: 0, dr: -1 },
        { col: head.col - 1, row: head.row, dc: -1, dr: 0 },
      ].filter(m => m.col >= 0 && m.col < cols && m.row >= 0 && m.row < rows);

      const m = possibleMoves[0];
      lastDir = { dc: m.dc, dr: m.dr };
      head = { col: m.col, row: m.row };
      path.push({ col: head.col, row: head.row, dir: getDirName(m.dc, m.dr) });

      const key = `${head.col}-${head.row}`;
      if (remainingTargets.has(key)) {
        remainingTargets.delete(key);
        eatenMap.set(key, path.length - 1);
        currentLength = Math.min(8, currentLength + 1);
      }
      snakeLengths.push(currentLength);
    }
  }

  // Final move to bottom right corner
  const endTarget = { col: cols - 1, row: rows - 1 };
  const body = getBody(path, currentLength);
  const finalMoves = findBfsPath(head, endTarget, body);
  if (finalMoves) {
    for (const move of finalMoves) {
      const dc = move.col - head.col;
      const dr = move.row - head.row;
      lastDir = { dc, dr };
      head = { col: move.col, row: move.row };
      path.push({ col: head.col, row: head.row, dir: getDirName(dc, dr) });
      snakeLengths.push(currentLength);
    }
  }

  return { path, snakeLengths, eatenMap };
}

async function test() {
  const targets = await fetchRealContributions();
  console.log(`Fetched ${targets.length} active contribution targets.`);
  const game = buildSnakePathAndGame(targets);
  console.log(`Path generated! Total steps: ${game.path.length}.`);
  console.log(`All targets eaten? ${game.eatenMap.size} out of ${targets.length}`);
}

test();
