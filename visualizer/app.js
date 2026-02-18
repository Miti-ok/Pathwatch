document.addEventListener("DOMContentLoaded", () => {

    // ================================
    // CONFIG
    // ================================
    const GRID_SIZE = 80;

    const gridEl = document.getElementById("grid");
    const obstacleLimitText = document.getElementById("obstacleLimitText");
    const brushSizeInput = document.getElementById("brushSize");
    const brushSizeValue = document.getElementById("brushSizeValue");
    const brushSizeValueMirror = document.getElementById("brushSizeValueMirror");
    const confirmBtn = document.getElementById("confirmBtn");
    const resetBtn = document.getElementById("resetBtn");

    if (!gridEl || !obstacleLimitText || !brushSizeInput || !brushSizeValue || !brushSizeValueMirror || !confirmBtn) {
        console.error("Required DOM elements not found. Check HTML IDs.");
        return;
    }

    obstacleLimitText.textContent = "No obstacle placement limit.";

    // ================================
    // STATE
    // ================================
    let gridState = [];
    let startPos = [GRID_SIZE - 1, 0];
    let endPos = [0, GRID_SIZE - 1];
    let dragging = null;
    let paintingObstacles = false;
    let activePointerId = null;
    let brushSize = Number(brushSizeInput.value) || 1;

    function applyGridSizing() {
        if (GRID_SIZE >= 80) {
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 390;
            const horizontalPadding = viewportWidth <= 640 ? 20 : 40;
            const available = Math.max(220, viewportWidth - horizontalPadding);

            let gap = 1;
            let cellSize = Math.floor((available - 28 - gap * (GRID_SIZE - 1)) / GRID_SIZE);
            if (cellSize < 4) {
                gap = 0;
                cellSize = Math.floor((available - 28) / GRID_SIZE);
            }

            cellSize = Math.max(2, Math.min(5, cellSize));
            gridEl.style.setProperty("--grid-cell-size", `${cellSize}px`);
            gridEl.style.setProperty("--grid-cell-gap", `${gap}px`);
            gridEl.style.setProperty("--hex-row-step", `${Math.max(2, cellSize * 0.78)}px`);
            return;
        }

        gridEl.style.setProperty("--grid-cell-size", "48px");
        gridEl.style.setProperty("--grid-cell-gap", "6px");
        gridEl.style.setProperty("--hex-row-step", `${48 * 0.78}px`);
    }

    // ================================
    // INIT GRID
    // ================================
    function initGrid() {
        gridEl.innerHTML = "";
        gridState = [];
        applyGridSizing();
        gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, var(--grid-cell-size, var(--cell-size)))`;
        gridEl.style.gridTemplateRows = `repeat(${GRID_SIZE}, var(--hex-row-step, var(--grid-cell-size, var(--cell-size))))`;

        for (let r = 0; r < GRID_SIZE; r++) {
            gridState[r] = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                gridState[r][c] = "empty";

                const cell = document.createElement("div");
                cell.className = "cell";
                if (r % 2 === 1) cell.classList.add("odd-row");
                cell.dataset.row = r;
                cell.dataset.col = c;

                gridEl.appendChild(cell);
            }
        }

        placeStartEnd();
        render();
    }

    function placeStartEnd() {
        gridState[startPos[0]][startPos[1]] = "start";
        gridState[endPos[0]][endPos[1]] = "end";
    }

    // ================================
    // INTERACTION
    // ================================
    function onCellPointerDown(r, c, pointerId) {
        const type = gridState[r][c];

        if (type === "start" || type === "end") {
            dragging = type;
            activePointerId = pointerId;
            return;
        }

        activePointerId = pointerId;

        if (type === "empty") {
            paintingObstacles = true;
            paintObstacleArea(r, c);
            return;
        }

        if (type === "obstacle") {
            // Keep single-click remove behavior.
            gridState[r][c] = "empty";
            render();
        }
    }

    function onCellDragMove(r, c) {
        if (!dragging) return;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return;
        if (gridState[r][c] !== "empty") return;

        if (dragging === "start") {
            if (startPos[0] === r && startPos[1] === c) return;
            gridState[startPos[0]][startPos[1]] = "empty";
            startPos = [r, c];
            gridState[r][c] = "start";
        }

        if (dragging === "end") {
            if (endPos[0] === r && endPos[1] === c) return;
            gridState[endPos[0]][endPos[1]] = "empty";
            endPos = [r, c];
            gridState[r][c] = "end";
        }

        render();
    }

    function clearDragging(pointerId = null) {
        if (pointerId !== null && activePointerId !== pointerId) return;
        dragging = null;
        paintingObstacles = false;
        activePointerId = null;
    }

    function getCellFromPointer(clientX, clientY) {
        const rect = gridEl.getBoundingClientRect();
        if (
            clientX < rect.left || clientX > rect.right ||
            clientY < rect.top || clientY > rect.bottom
        ) {
            return null;
        }

        const style = getComputedStyle(gridEl);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const cellW = parseFloat(style.getPropertyValue("--grid-cell-size")) || 0;
        const gap = parseFloat(style.getPropertyValue("--grid-cell-gap")) || 0;
        const rowStep = parseFloat(style.getPropertyValue("--hex-row-step")) || 0;
        const cellH = cellW * 0.9;
        const colStep = cellW + gap;
        if (cellW <= 0 || rowStep <= 0 || colStep <= 0) return null;

        const x = clientX - rect.left - paddingLeft;
        const y = clientY - rect.top - paddingTop;
        if (x < 0 || y < 0) return null;

        // Hex centers for odd-r offset layout.
        const roughRow = Math.round((y - cellH * 0.5) / rowStep);
        let best = null;

        for (let r = roughRow - 1; r <= roughRow + 1; r++) {
            if (r < 0 || r >= GRID_SIZE) continue;
            const rowOffset = (r % 2 === 1) ? colStep * 0.5 : 0;
            const roughCol = Math.round((x - rowOffset - cellW * 0.5) / colStep);

            for (let c = roughCol - 1; c <= roughCol + 1; c++) {
                if (c < 0 || c >= GRID_SIZE) continue;

                const cx = rowOffset + c * colStep + cellW * 0.5;
                const cy = r * rowStep + cellH * 0.5;
                const dx = Math.abs(x - cx) / (cellW * 0.58);
                const dy = Math.abs(y - cy) / (cellH * 0.72);
                const score = dx + dy;

                if (!best || score < best.score) {
                    best = { r, c, score };
                }
            }
        }

        if (!best) return null;
        // Always snap to nearest hex center while pointer is inside grid bounds.
        // This makes painting continuous across tiny visual gaps.
        return { r: best.r, c: best.c };
    }

    function onGridPointerDown(e) {
        e.preventDefault();
        const pos = getCellFromPointer(e.clientX, e.clientY);
        if (!pos) return;
        onCellPointerDown(pos.r, pos.c, e.pointerId);
    }

    function onGridPointerMove(e) {
        if (activePointerId !== e.pointerId) return;
        if (!dragging && !paintingObstacles) return;
        e.preventDefault();
        const pos = getCellFromPointer(e.clientX, e.clientY);
        if (!pos) return;
        if (dragging) {
            onCellDragMove(pos.r, pos.c);
            return;
        }

        if (paintingObstacles) {
            paintObstacleArea(pos.r, pos.c);
        }
    }

    function paintObstacleArea(centerR, centerC) {
        const startR = centerR - Math.floor((brushSize - 1) / 2);
        const startC = centerC - Math.floor((brushSize - 1) / 2);
        let changed = false;

        for (let r = startR; r < startR + brushSize; r++) {
            for (let c = startC; c < startC + brushSize; c++) {
                if (r < 0 || c < 0 || r >= GRID_SIZE || c >= GRID_SIZE) continue;

                const type = gridState[r][c];
                if (type === "start" || type === "end") continue;
                if (type === "empty") {
                    gridState[r][c] = "obstacle";
                    changed = true;
                }
            }
        }

        if (changed) render();
    }


    // ================================
    // RENDER
    // ================================
    function render() {
        document.querySelectorAll(".cell").forEach(cell => {
            const r = Number(cell.dataset.row);
            const c = Number(cell.dataset.col);

            cell.className = "cell";
            if (r % 2 === 1) cell.classList.add("odd-row");
            if (gridState[r][c] === "start") cell.classList.add("start");
            if (gridState[r][c] === "end") cell.classList.add("end");
            if (gridState[r][c] === "obstacle") cell.classList.add("obstacle");
        });
    }

    function countObstacles() {
        return gridState.flat().filter(v => v === "obstacle").length;
    }

    // ================================
    // BFS VALIDATION
    // ================================
    function pathExists(start, end) {
        const queue = [start];
        const visited = new Set([start.join(",")]);

        while (queue.length) {
            const [r, c] = queue.shift();
            if (r === end[0] && c === end[1]) return true;

            for (const [nr, nc] of getHexNeighbors(r, c)) {
                const key = `${nr},${nc}`;

                if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
                if (visited.has(key)) continue;
                if (gridState[nr][nc] === "obstacle") continue;

                visited.add(key);
                queue.push([nr, nc]);
            }
        }
        return false;
    }

    function getHexNeighbors(r, c) {
        const evenRow = r % 2 === 0;
        const dirs = evenRow
            ? [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]]
            : [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
        return dirs.map(([dr, dc]) => [r + dr, c + dc]);
    }

    // ================================
    // EXPORT
    // ================================
    function exportMap() {
        const obstacles = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (gridState[r][c] === "obstacle") obstacles.push([r, c]);
            }
        }

        return {
            width: GRID_SIZE,
            height: GRID_SIZE,
            start: startPos,
            end: endPos,
            obstacles
        };
    }

    // ================================
    // CONTROLS
    // ================================
    confirmBtn.addEventListener("click", () => {
        if (countObstacles() === 0) {
            alert("Place at least one obstacle before confirming the map.");
            return;
        }

        if (!pathExists(startPos, endPos)) {
            alert("Invalid map: no path exists.");
            return;
        }

        const map = exportMap();

        // Save map into browser memory
        localStorage.setItem("gridMap", JSON.stringify(map));

        // Move to gameplay page
        window.location.href = "gameplay.html";
    });

    resetBtn?.addEventListener("click", initGrid);
    brushSizeInput.addEventListener("input", () => {
        brushSize = Number(brushSizeInput.value) || 1;
        brushSizeValue.textContent = String(brushSize);
        brushSizeValueMirror.textContent = String(brushSize);
    });
    gridEl.addEventListener("pointerdown", onGridPointerDown);
    gridEl.addEventListener("pointermove", onGridPointerMove);
    gridEl.addEventListener("dragstart", (e) => e.preventDefault());
    window.addEventListener("pointerup", (e) => clearDragging(e.pointerId));
    window.addEventListener("pointercancel", (e) => clearDragging(e.pointerId));
    window.addEventListener("resize", () => {
        applyGridSizing();
    });
    window.addEventListener("orientationchange", () => {
        applyGridSizing();
    });

    // ================================
    // START
    // ================================
    brushSizeValue.textContent = String(brushSize);
    brushSizeValueMirror.textContent = String(brushSize);
    initGrid();

});
