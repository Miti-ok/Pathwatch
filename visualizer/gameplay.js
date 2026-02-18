let mapData = null;
let gridEl = null;
let algoSelectEl = null;
let speedRangeEl = null;
let runBtnEl = null;
let clearBtnEl = null;
let compareBtnEl = null;
let statusTextEl = null;
let comparePanelEl = null;
let chartExploredEl = null;
let chartPathEl = null;
let chartTimeEl = null;
let pauseBtnEl = null;
let timelineRangeEl = null;
let timelineInfoEl = null;

let rows = 0;
let cols = 0;
let totalCells = 0;
let startIndex = -1;
let endIndex = -1;
let cellEls = [];
let isAnimating = false;
let obstacleSet = new Set();
let blocked = null;
let freeIndices = [];
let playback = {
    events: [],
    position: 0,
    total: 0,
    playing: false,
    rafId: null,
};

const ALGORITHMS = [
    { key: "bfs", label: "BFS", color: "#22d3ee" },
    { key: "astar", label: "A*", color: "#34d399" },
    { key: "greedy", label: "Greedy Best-First", color: "#f97316" },
];

document.addEventListener("DOMContentLoaded", () => {
    gridEl = document.getElementById("grid");
    algoSelectEl = document.getElementById("algoSelect");
    speedRangeEl = document.getElementById("speedRange");
    runBtnEl = document.getElementById("runBtn");
    clearBtnEl = document.getElementById("clearBtn");
    compareBtnEl = document.getElementById("compareBtn");
    statusTextEl = document.getElementById("statusText");
    comparePanelEl = document.getElementById("comparePanel");
    chartExploredEl = document.getElementById("chartExplored");
    chartPathEl = document.getElementById("chartPath");
    chartTimeEl = document.getElementById("chartTime");
    pauseBtnEl = document.getElementById("pauseBtn");
    timelineRangeEl = document.getElementById("timelineRange");
    timelineInfoEl = document.getElementById("timelineInfo");

    populateAlgorithmSelect();

    mapData = JSON.parse(localStorage.getItem("gridMap"));
    if (!mapData) {
        alert("No map found. Please create a map first.");
        return;
    }

    rows = mapData.height;
    cols = mapData.width;
    totalCells = rows * cols;
    startIndex = toIndex(mapData.start[0], mapData.start[1]);
    endIndex = toIndex(mapData.end[0], mapData.end[1]);
    obstacleSet = new Set(mapData.obstacles.map(([r, c]) => keyOf(r, c)));

    blocked = new Uint8Array(totalCells);
    for (const [r, c] of mapData.obstacles) blocked[toIndex(r, c)] = 1;
    for (let i = 0; i < totalCells; i++) {
        if (!blocked[i] || i === startIndex || i === endIndex) freeIndices.push(i);
    }

    buildGrid();
    window.addEventListener("resize", updateGridLayoutOnly);
    window.addEventListener("orientationchange", updateGridLayoutOnly);

    runBtnEl.addEventListener("click", runVisualization);
    compareBtnEl.addEventListener("click", onCompareClick);
    pauseBtnEl.addEventListener("click", onPauseResumeClick);
    timelineRangeEl.addEventListener("input", onTimelineInput);
    clearBtnEl.addEventListener("click", () => {
        stopPlayback();
        clearRunVisuals();
        resetTimelineUI();
        statusTextEl.textContent = "Cleared. Choose an algorithm and click Visualize.";
    });
    resetTimelineUI();
});

function populateAlgorithmSelect() {
    algoSelectEl.innerHTML = "";
    for (const algo of ALGORITHMS) {
        const option = document.createElement("option");
        option.value = algo.key;
        option.textContent = algo.label;
        algoSelectEl.appendChild(option);
    }
    algoSelectEl.value = "astar";
}

function onCompareClick() {
    if (isAnimating) return;
    if (!comparePanelEl.hidden) {
        comparePanelEl.hidden = true;
        statusTextEl.textContent = "Comparison panel closed.";
        return;
    }
    compareAllAlgorithms();
}

function keyOf(r, c) { return `${r},${c}`; }
function toIndex(r, c) { return r * cols + c; }
function fromIndex(index) { return [Math.floor(index / cols), index % cols]; }
function inBoundsRC(r, c) { return r >= 0 && c >= 0 && r < rows && c < cols; }
function isBlockedRC(r, c) { return !inBoundsRC(r, c) || blocked[toIndex(r, c)] === 1; }
function isFreeIndex(index) { return blocked[index] !== 1 || index === startIndex || index === endIndex; }
function getAlgorithmMeta(key) { return ALGORITHMS.find(a => a.key === key) || ALGORITHMS[0]; }

function manhattan(indexA, indexB) {
    const [ar, ac] = fromIndex(indexA);
    const [br, bc] = fromIndex(indexB);
    const dr = ar - br;
    const dc = ac - bc;
    return Math.sqrt(dr * dr + dc * dc);
}

function euclidean(indexA, indexB) {
    const [ar, ac] = fromIndex(indexA);
    const [br, bc] = fromIndex(indexB);
    const dr = ar - br;
    const dc = ac - bc;
    return Math.sqrt(dr * dr + dc * dc);
}

function getNeighbors(index) {
    const [r, c] = fromIndex(index);
    const evenRow = r % 2 === 0;
    const next = evenRow
        ? [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c]]
        : [[r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
    const out = [];
    for (const [nr, nc] of next) {
        if (!inBoundsRC(nr, nc)) continue;
        const nb = toIndex(nr, nc);
        if (!isFreeIndex(nb)) continue;
        out.push(nb);
    }
    return out;
}

function oddRToCube(r, c) {
    const x = c - (r - (r & 1)) / 2;
    const z = r;
    const y = -x - z;
    return [x, y, z];
}

function hexDistance(r1, c1, r2, c2) {
    const [x1, y1, z1] = oddRToCube(r1, c1);
    const [x2, y2, z2] = oddRToCube(r2, c2);
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

function applyGridSizing() {
    const largeGrid = rows >= 80 || cols >= 80;
    if (largeGrid) {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 390;
        const horizontalPadding = viewportWidth <= 640 ? 20 : 40;
        const available = Math.max(220, viewportWidth - horizontalPadding);
        const maxGrid = Math.max(rows, cols);

        let gap = 1;
        let cellSize = Math.floor((available - 28 - gap * (maxGrid - 1)) / maxGrid);
        if (cellSize < 4) {
            gap = 0;
            cellSize = Math.floor((available - 28) / maxGrid);
        }

        cellSize = Math.max(2, Math.min(5, cellSize));
        gridEl.style.setProperty("--grid-cell-size", `${cellSize}px`);
        gridEl.style.setProperty("--grid-cell-gap", `${gap}px`);
        gridEl.style.setProperty("--hex-row-step", `${Math.max(2, cellSize * 0.78)}px`);
    } else {
        gridEl.style.setProperty("--grid-cell-size", "48px");
        gridEl.style.setProperty("--grid-cell-gap", "6px");
        gridEl.style.setProperty("--hex-row-step", `${48 * 0.78}px`);
    }
}

function updateGridLayoutOnly() {
    if (!gridEl || rows <= 0 || cols <= 0) return;
    applyGridSizing();
    gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--grid-cell-size, var(--cell-size)))`;
    gridEl.style.gridTemplateRows = `repeat(${rows}, var(--hex-row-step, var(--grid-cell-size, var(--cell-size))))`;
}

function buildGrid() {
    gridEl.innerHTML = "";
    cellEls = [];
    updateGridLayoutOnly();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            if (r % 2 === 1) cell.classList.add("odd-row");
            const idx = toIndex(r, c);
            if (idx === startIndex) cell.classList.add("start");
            else if (idx === endIndex) cell.classList.add("end");
            else if (obstacleSet.has(keyOf(r, c))) cell.classList.add("obstacle");
            cellEls.push(cell);
            gridEl.appendChild(cell);
        }
    }
}

function clearRunVisuals() {
    for (let i = 0; i < cellEls.length; i++) cellEls[i].classList.remove("explored", "path");
}

function resetTimelineUI() {
    playback.events = [];
    playback.position = 0;
    playback.total = 0;
    playback.playing = false;
    if (playback.rafId) {
        cancelAnimationFrame(playback.rafId);
        playback.rafId = null;
    }
    if (timelineRangeEl) {
        timelineRangeEl.min = "0";
        timelineRangeEl.max = "0";
        timelineRangeEl.value = "0";
        timelineRangeEl.disabled = true;
    }
    if (pauseBtnEl) {
        pauseBtnEl.disabled = true;
        pauseBtnEl.textContent = "Pause";
    }
    if (timelineInfoEl) {
        timelineInfoEl.textContent = "0 / 0";
    }
}

function applyEventAt(index) {
    const event = playback.events[index];
    if (!event) return;
    const cell = cellEls[event.idx];
    if (!cell) return;
    cell.classList.add(event.cls);
}

function renderToPosition(target) {
    const clamped = Math.max(0, Math.min(playback.total, target));
    clearRunVisuals();
    for (let i = 0; i < clamped; i++) applyEventAt(i);
    playback.position = clamped;
    timelineRangeEl.value = String(clamped);
    timelineInfoEl.textContent = `${clamped} / ${playback.total}`;
}

function stopPlayback() {
    playback.playing = false;
    if (playback.rafId) {
        cancelAnimationFrame(playback.rafId);
        playback.rafId = null;
    }
    isAnimating = false;
    runBtnEl.disabled = false;
    clearBtnEl.disabled = false;
    compareBtnEl.disabled = false;
    algoSelectEl.disabled = false;
}

function onPauseResumeClick() {
    if (playback.total === 0) return;
    if (playback.position >= playback.total) {
        renderToPosition(0);
        playback.playing = true;
        pauseBtnEl.textContent = "Pause";
        isAnimating = true;
        playLoop();
        return;
    }
    playback.playing = !playback.playing;
    pauseBtnEl.textContent = playback.playing ? "Pause" : "Play";
    if (playback.playing) {
        isAnimating = true;
        playLoop();
    } else {
        isAnimating = false;
    }
}

function onTimelineInput() {
    if (playback.total === 0) return;
    playback.playing = false;
    pauseBtnEl.textContent = "Play";
    renderToPosition(Number(timelineRangeEl.value) || 0);
}

function playLoop() {
    if (!playback.playing) return;
    const batch = Math.max(1, Number(speedRangeEl.value) || 8);
    const next = Math.min(playback.total, playback.position + batch);
    for (let i = playback.position; i < next; i++) applyEventAt(i);
    playback.position = next;
    timelineRangeEl.value = String(playback.position);
    timelineInfoEl.textContent = `${playback.position} / ${playback.total}`;

    if (playback.position >= playback.total) {
        playback.playing = false;
        isAnimating = false;
        pauseBtnEl.textContent = "Replay";
        runBtnEl.disabled = false;
        clearBtnEl.disabled = false;
        compareBtnEl.disabled = false;
        algoSelectEl.disabled = false;
        return;
    }
    playback.rafId = requestAnimationFrame(playLoop);
}

class MinHeap {
    constructor() { this.data = []; }
    push(item) { this.data.push(item); this._bubbleUp(this.data.length - 1); }
    pop() {
        if (this.data.length === 0) return null;
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0 && last) { this.data[0] = last; this._bubbleDown(0); }
        return top;
    }
    get size() { return this.data.length; }
    _bubbleUp(i) {
        while (i > 0) {
            const p = Math.floor((i - 1) / 2);
            if (this.data[p].priority <= this.data[i].priority) break;
            [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
            i = p;
        }
    }
    _bubbleDown(i) {
        const n = this.data.length;
        while (true) {
            let s = i;
            const l = i * 2 + 1;
            const r = i * 2 + 2;
            if (l < n && this.data[l].priority < this.data[s].priority) s = l;
            if (r < n && this.data[r].priority < this.data[s].priority) s = r;
            if (s === i) break;
            [this.data[i], this.data[s]] = [this.data[s], this.data[i]];
            i = s;
        }
    }
}

function reconstructPath(cameFrom, endIdx, startIdx) {
    if (startIdx === endIdx) return [startIdx];
    if (cameFrom[endIdx] === -1) return [];
    const path = [endIdx];
    let cur = endIdx;
    let guard = 0;
    while (cur !== startIdx && guard < totalCells + 5) {
        const prev = cameFrom[cur];
        if (prev === -1) return [];
        cur = prev;
        path.push(cur);
        guard++;
    }
    if (path[path.length - 1] !== startIdx) return [];
    path.reverse();
    return path;
}

function lineOfSight(indexA, indexB) {
    let [x0, y0] = fromIndex(indexA);
    const [x1, y1] = fromIndex(indexB);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
        const idx = toIndex(x0, y0);
        if (idx !== indexA && idx !== indexB && blocked[idx]) return false;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return true;
}

function pathLength(path) { return path.length > 0 ? path.length - 1 : 0; }

function runBfs() {
    const cameFrom = new Int32Array(totalCells).fill(-1);
    const visited = new Uint8Array(totalCells);
    const expanded = [];
    const queue = [startIndex];
    let head = 0;
    visited[startIndex] = 1;
    while (head < queue.length) {
        const cur = queue[head++];
        expanded.push(cur);
        if (cur === endIndex) break;
        for (const nb of getNeighbors(cur)) {
            if (visited[nb]) continue;
            visited[nb] = 1;
            cameFrom[nb] = cur;
            queue.push(nb);
        }
    }
    return { expanded, path: reconstructPath(cameFrom, endIndex, startIndex) };
}

function runBidirectionalBfs() {
    const parentF = new Int32Array(totalCells).fill(-1);
    const parentB = new Int32Array(totalCells).fill(-1);
    const visF = new Uint8Array(totalCells);
    const visB = new Uint8Array(totalCells);
    const qF = [startIndex];
    const qB = [endIndex];
    let hF = 0;
    let hB = 0;
    visF[startIndex] = 1;
    visB[endIndex] = 1;
    const expanded = [];
    let meet = -1;
    while (hF < qF.length && hB < qB.length && meet === -1) {
        const curF = qF[hF++];
        expanded.push(curF);
        if (visB[curF]) { meet = curF; break; }
        for (const nb of getNeighbors(curF)) {
            if (visF[nb]) continue;
            visF[nb] = 1;
            parentF[nb] = curF;
            qF.push(nb);
            if (visB[nb]) { meet = nb; break; }
        }
        if (meet !== -1) break;

        const curB = qB[hB++];
        expanded.push(curB);
        if (visF[curB]) { meet = curB; break; }
        for (const nb of getNeighbors(curB)) {
            if (visB[nb]) continue;
            visB[nb] = 1;
            parentB[nb] = curB;
            qB.push(nb);
            if (visF[nb]) { meet = nb; break; }
        }
    }
    if (meet === -1) return { expanded, path: [] };

    const left = [];
    let cur = meet;
    left.push(cur);
    while (cur !== startIndex) {
        cur = parentF[cur];
        if (cur === -1) return { expanded, path: [] };
        left.push(cur);
    }
    left.reverse();
    const right = [];
    cur = meet;
    while (cur !== endIndex) {
        cur = parentB[cur];
        if (cur === -1) return { expanded, path: [] };
        right.push(cur);
    }
    return { expanded, path: left.concat(right) };
}

function runAStarCore(weight) {
    const cameFrom = new Int32Array(totalCells).fill(-1);
    const gScore = new Float64Array(totalCells).fill(Infinity);
    const closed = new Uint8Array(totalCells);
    const expanded = [];
    const heap = new MinHeap();
    gScore[startIndex] = 0;
    heap.push({ index: startIndex, priority: weight * manhattan(startIndex, endIndex) });
    while (heap.size > 0) {
        const node = heap.pop();
        if (!node) break;
        const cur = node.index;
        if (closed[cur]) continue;
        closed[cur] = 1;
        expanded.push(cur);
        if (cur === endIndex) break;
        for (const nb of getNeighbors(cur)) {
            if (closed[nb]) continue;
            const tentative = gScore[cur] + 1;
            if (tentative < gScore[nb]) {
                gScore[nb] = tentative;
                cameFrom[nb] = cur;
                const f = tentative + weight * manhattan(nb, endIndex);
                heap.push({ index: nb, priority: f });
            }
        }
    }
    return { expanded, path: reconstructPath(cameFrom, endIndex, startIndex) };
}

function runDijkstra() { return runAStarCore(0); }
function runAStar() { return runAStarCore(1); }
function runWeightedAStar() { return runAStarCore(1.8); }

function runGreedyBestFirst() {
    const cameFrom = new Int32Array(totalCells).fill(-1);
    const visited = new Uint8Array(totalCells);
    const expanded = [];
    const heap = new MinHeap();
    heap.push({ index: startIndex, priority: manhattan(startIndex, endIndex) });
    visited[startIndex] = 1;
    while (heap.size > 0) {
        const node = heap.pop();
        if (!node) break;
        const cur = node.index;
        expanded.push(cur);
        if (cur === endIndex) break;
        for (const nb of getNeighbors(cur)) {
            if (visited[nb]) continue;
            visited[nb] = 1;
            cameFrom[nb] = cur;
            heap.push({ index: nb, priority: manhattan(nb, endIndex) });
        }
    }
    return { expanded, path: reconstructPath(cameFrom, endIndex, startIndex) };
}

function runThetaStar() {
    const parent = new Int32Array(totalCells).fill(-1);
    const gScore = new Float64Array(totalCells).fill(Infinity);
    const closed = new Uint8Array(totalCells);
    const expanded = [];
    const heap = new MinHeap();
    parent[startIndex] = startIndex;
    gScore[startIndex] = 0;
    heap.push({ index: startIndex, priority: manhattan(startIndex, endIndex) });

    while (heap.size > 0) {
        const node = heap.pop();
        if (!node) break;
        const cur = node.index;
        if (closed[cur]) continue;
        closed[cur] = 1;
        expanded.push(cur);
        if (cur === endIndex) break;

        for (const nb of getNeighbors(cur)) {
            if (closed[nb]) continue;
            let bestParent = cur;
            let bestCost = gScore[cur] + 1;
            if (parent[cur] !== -1 && parent[cur] !== cur && lineOfSight(parent[cur], nb)) {
                const losCost = gScore[parent[cur]] + euclidean(parent[cur], nb);
                if (losCost < bestCost) {
                    bestCost = losCost;
                    bestParent = parent[cur];
                }
            }
            if (bestCost < gScore[nb]) {
                gScore[nb] = bestCost;
                parent[nb] = bestParent;
                heap.push({ index: nb, priority: bestCost + manhattan(nb, endIndex) });
            }
        }
    }

    return { expanded, path: reconstructPath(parent, endIndex, startIndex) };
}

function densifyJumpPath(path) {
    if (path.length <= 1) return path;
    const dense = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
        const [r1, c1] = fromIndex(path[i]);
        const [r2, c2] = fromIndex(path[i + 1]);
        const dr = Math.sign(r2 - r1);
        const dc = Math.sign(c2 - c1);
        let r = r1;
        let c = c1;
        while (r !== r2 || c !== c2) {
            r += dr;
            c += dc;
            dense.push(toIndex(r, c));
        }
    }
    return dense;
}

function runJumpPointSearch() {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const cameFrom = new Int32Array(totalCells).fill(-1);
    const gScore = new Float64Array(totalCells).fill(Infinity);
    const closed = new Uint8Array(totalCells);
    const expanded = [];
    const heap = new MinHeap();
    gScore[startIndex] = 0;
    heap.push({ index: startIndex, priority: manhattan(startIndex, endIndex) });

    function hasForcedNeighbor(r, c, dr, dc) {
        if (dr === 0 && dc !== 0) {
            return (
                (isBlockedRC(r - 1, c) && !isBlockedRC(r - 1, c + dc)) ||
                (isBlockedRC(r + 1, c) && !isBlockedRC(r + 1, c + dc))
            );
        }
        if (dc === 0 && dr !== 0) {
            return (
                (isBlockedRC(r, c - 1) && !isBlockedRC(r + dr, c - 1)) ||
                (isBlockedRC(r, c + 1) && !isBlockedRC(r + dr, c + 1))
            );
        }
        return false;
    }

    function jump(r, c, dr, dc) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBoundsRC(nr, nc) && !isBlockedRC(nr, nc)) {
            const idx = toIndex(nr, nc);
            if (idx === endIndex) return idx;
            if (hasForcedNeighbor(nr, nc, dr, dc)) return idx;
            nr += dr;
            nc += dc;
        }
        return -1;
    }

    while (heap.size > 0) {
        const node = heap.pop();
        if (!node) break;
        const cur = node.index;
        if (closed[cur]) continue;
        closed[cur] = 1;
        expanded.push(cur);
        if (cur === endIndex) break;
        const [r, c] = fromIndex(cur);
        for (const [dr, dc] of dirs) {
            const jp = jump(r, c, dr, dc);
            if (jp === -1 || closed[jp]) continue;
            const tentative = gScore[cur] + manhattan(cur, jp);
            if (tentative < gScore[jp]) {
                gScore[jp] = tentative;
                cameFrom[jp] = cur;
                heap.push({ index: jp, priority: tentative + manhattan(jp, endIndex) });
            }
        }
    }

    const jumpPath = reconstructPath(cameFrom, endIndex, startIndex);
    return { expanded, path: densifyJumpPath(jumpPath) };
}

function runIDAStar() {
    const expanded = [];
    const foundPath = [];
    const maxExpanded = Math.max(50000, totalCells * 30);
    let threshold = manhattan(startIndex, endIndex);

    function dfs(node, g, bound, pathSet, pathStack) {
        const f = g + manhattan(node, endIndex);
        if (f > bound) return f;
        expanded.push(node);
        if (expanded.length > maxExpanded) return Infinity;
        if (node === endIndex) {
            foundPath.push(...pathStack);
            return "FOUND";
        }
        let min = Infinity;
        const nbrs = getNeighbors(node).sort((a, b) => manhattan(a, endIndex) - manhattan(b, endIndex));
        for (const nb of nbrs) {
            if (pathSet.has(nb)) continue;
            pathSet.add(nb);
            pathStack.push(nb);
            const t = dfs(nb, g + 1, bound, pathSet, pathStack);
            if (t === "FOUND") return "FOUND";
            if (t < min) min = t;
            pathStack.pop();
            pathSet.delete(nb);
        }
        return min;
    }

    while (threshold < Infinity) {
        const pathSet = new Set([startIndex]);
        const pathStack = [startIndex];
        const result = dfs(startIndex, 0, threshold, pathSet, pathStack);
        if (result === "FOUND") return { expanded, path: foundPath.slice() };
        if (!Number.isFinite(result)) break;
        threshold = result;
    }
    return { expanded, path: [] };
}

function runDStarLiteStatic() {
    const result = runAStar();
    result.note = "Static map mode: D* Lite behaves close to A* without dynamic updates.";
    return result;
}

function hashSeed(input) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function makeRng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function obstacleRepulsion(index, radius = 3) {
    const [r, c] = fromIndex(index);
    let repulsion = 0;
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (!inBoundsRC(nr, nc)) continue;
            if (!isBlockedRC(nr, nc)) continue;
            const dist2 = dr * dr + dc * dc;
            if (dist2 === 0) continue;
            repulsion += 5 / dist2;
        }
    }
    return repulsion;
}

function runPotentialFields(rng) {
    const expanded = [];
    const path = [startIndex];
    const seen = new Set([startIndex]);
    let current = startIndex;
    const maxSteps = totalCells * 6;
    for (let step = 0; step < maxSteps; step++) {
        expanded.push(current);
        if (current === endIndex) break;
        const neighbors = getNeighbors(current);
        if (neighbors.length === 0) break;
        let bestScore = Infinity;
        let best = [];
        for (const nb of neighbors) {
            const score = manhattan(nb, endIndex) + obstacleRepulsion(nb, 3) + (seen.has(nb) ? 2 : 0);
            if (score < bestScore - 1e-9) {
                bestScore = score;
                best = [nb];
            } else if (Math.abs(score - bestScore) < 1e-9) {
                best.push(nb);
            }
        }
        const currentScore = manhattan(current, endIndex) + obstacleRepulsion(current, 3);
        let nextNode = best[Math.floor(rng() * best.length)];
        if (bestScore >= currentScore) {
            const unvisited = neighbors.filter(n => !seen.has(n));
            if (unvisited.length === 0) break;
            nextNode = unvisited[Math.floor(rng() * unvisited.length)];
        }
        path.push(nextNode);
        seen.add(nextNode);
        current = nextNode;
    }
    if (path[path.length - 1] !== endIndex) return { expanded, path: [] };
    return { expanded, path };
}

function nearestNode(nodes, target) {
    let best = nodes[0];
    let bestDist = euclidean(best, target);
    for (let i = 1; i < nodes.length; i++) {
        const d = euclidean(nodes[i], target);
        if (d < bestDist) {
            bestDist = d;
            best = nodes[i];
        }
    }
    return best;
}

function steerIndex(fromIdx, toIdx, stepSize = 2) {
    const [r1, c1] = fromIndex(fromIdx);
    const [r2, c2] = fromIndex(toIdx);
    const dr = r2 - r1;
    const dc = c2 - c1;
    const len = Math.sqrt(dr * dr + dc * dc);
    if (len < 1e-9) return fromIdx;
    const scale = Math.min(1, stepSize / len);
    const nr = Math.round(r1 + dr * scale);
    const nc = Math.round(c1 + dc * scale);
    if (!inBoundsRC(nr, nc)) return fromIdx;
    return toIndex(nr, nc);
}

function randomFreeIndex(rng) {
    return freeIndices[Math.floor(rng() * freeIndices.length)];
}

function runRRT(rng) {
    const expanded = [];
    const parent = new Int32Array(totalCells).fill(-1);
    const inTree = new Uint8Array(totalCells);
    const nodes = [startIndex];
    inTree[startIndex] = 1;
    const maxIter = Math.max(2500, totalCells * 2);

    for (let i = 0; i < maxIter; i++) {
        const sample = rng() < 0.12 ? endIndex : randomFreeIndex(rng);
        const nearest = nearestNode(nodes, sample);
        const newNode = steerIndex(nearest, sample, 2);
        if (newNode === nearest) continue;
        if (!isFreeIndex(newNode)) continue;
        if (!lineOfSight(nearest, newNode)) continue;
        if (inTree[newNode]) continue;
        inTree[newNode] = 1;
        parent[newNode] = nearest;
        nodes.push(newNode);
        expanded.push(newNode);
        if (manhattan(newNode, endIndex) <= 2 && lineOfSight(newNode, endIndex)) {
            parent[endIndex] = newNode;
            expanded.push(endIndex);
            return { expanded, path: reconstructPath(parent, endIndex, startIndex) };
        }
    }
    return { expanded, path: reconstructPath(parent, endIndex, startIndex) };
}

function runRRTStar(rng) {
    const expanded = [];
    const parent = new Int32Array(totalCells).fill(-1);
    const inTree = new Uint8Array(totalCells);
    const cost = new Float64Array(totalCells).fill(Infinity);
    const nodes = [startIndex];
    inTree[startIndex] = 1;
    cost[startIndex] = 0;
    const radius = 6;
    const maxIter = Math.max(2800, totalCells * 2);

    for (let i = 0; i < maxIter; i++) {
        const sample = rng() < 0.14 ? endIndex : randomFreeIndex(rng);
        const nearest = nearestNode(nodes, sample);
        const newNode = steerIndex(nearest, sample, 2);
        if (newNode === nearest || !isFreeIndex(newNode) || !lineOfSight(nearest, newNode) || inTree[newNode]) continue;

        const nearNodes = [];
        for (const n of nodes) {
            if (euclidean(n, newNode) <= radius && lineOfSight(n, newNode)) nearNodes.push(n);
        }
        let bestParent = nearest;
        let bestCost = cost[nearest] + euclidean(nearest, newNode);
        for (const n of nearNodes) {
            const c = cost[n] + euclidean(n, newNode);
            if (c < bestCost) {
                bestCost = c;
                bestParent = n;
            }
        }

        inTree[newNode] = 1;
        parent[newNode] = bestParent;
        cost[newNode] = bestCost;
        nodes.push(newNode);
        expanded.push(newNode);

        for (const n of nearNodes) {
            const rewired = cost[newNode] + euclidean(newNode, n);
            if (rewired + 1e-9 < cost[n] && lineOfSight(newNode, n) && n !== startIndex) {
                parent[n] = newNode;
                cost[n] = rewired;
            }
        }

        if (manhattan(newNode, endIndex) <= 2 && lineOfSight(newNode, endIndex)) {
            parent[endIndex] = newNode;
            cost[endIndex] = cost[newNode] + euclidean(newNode, endIndex);
        }
    }

    if (parent[endIndex] === -1) {
        let best = -1;
        let bestF = Infinity;
        for (const n of nodes) {
            if (!lineOfSight(n, endIndex)) continue;
            const score = cost[n] + euclidean(n, endIndex);
            if (score < bestF) {
                best = n;
                bestF = score;
            }
        }
        if (best !== -1) parent[endIndex] = best;
    }
    return { expanded, path: reconstructPath(parent, endIndex, startIndex) };
}

function runPRM(rng) {
    const expanded = [];
    const nodes = [startIndex, endIndex];
    const used = new Uint8Array(totalCells);
    used[startIndex] = 1;
    used[endIndex] = 1;
    const sampleCount = Math.min(900, Math.max(260, Math.floor(totalCells * 0.1)));
    for (let i = 0; i < sampleCount; i++) {
        const idx = randomFreeIndex(rng);
        if (used[idx]) continue;
        used[idx] = 1;
        nodes.push(idx);
        expanded.push(idx);
    }

    const k = 12;
    const graph = Array.from({ length: nodes.length }, () => []);
    for (let i = 0; i < nodes.length; i++) {
        const distances = [];
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;
            distances.push({ j, d: euclidean(nodes[i], nodes[j]) });
        }
        distances.sort((a, b) => a.d - b.d);
        let connected = 0;
        for (const item of distances) {
            if (connected >= k) break;
            const a = nodes[i];
            const b = nodes[item.j];
            if (!lineOfSight(a, b)) continue;
            graph[i].push({ to: item.j, w: item.d });
            connected++;
        }
    }

    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const visited = new Uint8Array(nodes.length);
    const heap = new MinHeap();
    dist[0] = 0;
    heap.push({ index: 0, priority: 0 });
    while (heap.size > 0) {
        const node = heap.pop();
        if (!node) break;
        const cur = node.index;
        if (visited[cur]) continue;
        visited[cur] = 1;
        if (cur === 1) break;
        for (const edge of graph[cur]) {
            const nd = dist[cur] + edge.w;
            if (nd < dist[edge.to]) {
                dist[edge.to] = nd;
                prev[edge.to] = cur;
                heap.push({ index: edge.to, priority: nd });
            }
        }
    }
    if (prev[1] === -1) return { expanded, path: [] };
    const nodePath = [];
    let cur = 1;
    while (cur !== -1) {
        nodePath.push(nodes[cur]);
        cur = prev[cur];
    }
    nodePath.reverse();
    return { expanded, path: densifyJumpPath(nodePath) };
}

function runAlgorithm(key) {
    if (key === "bfs") return runBfs();
    if (key === "astar") return runAStar();
    if (key === "greedy") return runGreedyBestFirst();
    return runAStar();
}

function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

function estimateComputeMs(algo, runs = 5) {
    const samples = [];
    runAlgorithm(algo);
    for (let i = 0; i < runs; i++) {
        const t0 = performance.now();
        runAlgorithm(algo);
        const t1 = performance.now();
        samples.push(t1 - t0);
    }
    return median(samples);
}

function renderBarChart(container, data, valueFormatter) {
    container.innerHTML = "";
    const maxVal = Math.max(1, ...data.map(d => d.value));
    for (const item of data) {
        const row = document.createElement("div");
        row.className = "bar-row";
        const label = document.createElement("div");
        label.className = "bar-label";
        label.textContent = item.label;
        const barWrap = document.createElement("div");
        barWrap.className = "bar-wrap";
        const bar = document.createElement("div");
        bar.className = "bar-fill";
        bar.style.width = `${Math.max(3, (item.value / maxVal) * 100)}%`;
        bar.style.background = item.color;
        const value = document.createElement("div");
        value.className = "bar-value";
        value.textContent = valueFormatter(item.value);
        barWrap.appendChild(bar);
        row.appendChild(label);
        row.appendChild(barWrap);
        row.appendChild(value);
        container.appendChild(row);
    }
}

async function compareAllAlgorithms() {
    if (isAnimating) return;
    stopPlayback();
    resetTimelineUI();
    isAnimating = true;
    runBtnEl.disabled = true;
    clearBtnEl.disabled = true;
    compareBtnEl.disabled = true;
    algoSelectEl.disabled = true;
    statusTextEl.textContent = `Comparing ${ALGORITHMS.length} algorithms...`;

    const metrics = [];
    for (let i = 0; i < ALGORITHMS.length; i++) {
        const algo = ALGORITHMS[i];
        const result = runAlgorithm(algo.key);
        metrics.push({
            label: algo.label,
            color: algo.color,
            explored: result.expanded.length,
            pathLength: pathLength(result.path),
            timeMs: estimateComputeMs(algo.key, 5),
        });
        if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }

    renderBarChart(chartExploredEl, metrics.map(m => ({ label: m.label, value: m.explored, color: m.color })), v => String(Math.round(v)));
    renderBarChart(chartPathEl, metrics.map(m => ({ label: m.label, value: m.pathLength, color: m.color })), v => String(Math.round(v)));
    renderBarChart(chartTimeEl, metrics.map(m => ({ label: m.label, value: m.timeMs, color: m.color })), v => `${v.toFixed(2)} ms`);

    comparePanelEl.hidden = false;
    statusTextEl.textContent = "Comparison complete.";
    isAnimating = false;
    runBtnEl.disabled = false;
    clearBtnEl.disabled = false;
    compareBtnEl.disabled = false;
    algoSelectEl.disabled = false;
}

function animateIndices(indices, className, skipSpecial = true) {
    return new Promise((resolve) => {
        let i = 0;
        function step() {
            const batch = Math.max(1, Number(speedRangeEl.value) || 8);
            const end = Math.min(indices.length, i + batch);
            for (; i < end; i++) {
                const idx = indices[i];
                if (skipSpecial && (idx === startIndex || idx === endIndex)) continue;
                const cell = cellEls[idx];
                if (!cell) continue;
                cell.classList.add(className);
            }
            if (i < indices.length) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

function buildPlaybackEvents(result) {
    const events = [];
    for (const idx of result.expanded) {
        if (idx === startIndex || idx === endIndex) continue;
        events.push({ idx, cls: "explored" });
    }
    for (const idx of result.path) {
        if (idx === startIndex || idx === endIndex) continue;
        events.push({ idx, cls: "path" });
    }
    return events;
}

async function runVisualization() {
    if (isAnimating && playback.playing) return;
    stopPlayback();
    resetTimelineUI();
    isAnimating = true;
    runBtnEl.disabled = true;
    clearBtnEl.disabled = true;
    compareBtnEl.disabled = true;
    algoSelectEl.disabled = true;
    clearRunVisuals();

    const algoKey = algoSelectEl.value;
    const meta = getAlgorithmMeta(algoKey);
    statusTextEl.textContent = `Running ${meta.label}...`;
    const t0 = performance.now();
    const result = runAlgorithm(algoKey);
    const t1 = performance.now();

    playback.events = buildPlaybackEvents(result);
    playback.total = playback.events.length;
    playback.position = 0;
    timelineRangeEl.min = "0";
    timelineRangeEl.max = String(playback.total);
    timelineRangeEl.value = "0";
    timelineRangeEl.disabled = playback.total === 0;
    pauseBtnEl.disabled = playback.total === 0;
    pauseBtnEl.textContent = "Pause";
    timelineInfoEl.textContent = `0 / ${playback.total}`;

    let msg = result.path.length > 0
        ? `${meta.label} finished. Explored ${result.expanded.length} nodes, path length ${pathLength(result.path)}. Compute ${Math.round(t1 - t0)} ms.`
        : `${meta.label} finished. No path found after exploring ${result.expanded.length} nodes. Compute ${Math.round(t1 - t0)} ms.`;
    if (result.note) msg += ` ${result.note}`;
    statusTextEl.textContent = msg;

    if (playback.total === 0) {
        stopPlayback();
        return;
    }

    playback.playing = true;
    playLoop();
}
