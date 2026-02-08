const go = new Go();
let mod, inst;
let canvas, ctx;
let boardSize;
let cellSize;
let padding = 30;
let gameActive = false;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('goBoard');
    ctx = canvas.getContext('2d');
    
    // Load WASM
    WebAssembly.instantiateStreaming(fetch("main.wasm"), go.importObject).then(async (result) => {
        mod = result.module;
        inst = result.instance;
        go.run(inst); // Start the Go runtime
    });

    document.getElementById('startBtn').addEventListener('click', startGame);
    canvas.addEventListener('click', handleBoardClick);
});

function startGame() {
    boardSize = parseInt(document.getElementById('boardSize').value);
    if (!window.startGame) {
        alert("WASM not loaded yet, please wait...");
        return;
    }

    window.startGame(boardSize);
    gameActive = true;
    updateStatus("Your Turn (Black)");
    
    // Resize canvas
    const maxSize = Math.min(window.innerWidth - 40, 600);
    canvas.width = maxSize;
    canvas.height = maxSize;
    
    cellSize = (canvas.width - 2 * padding) / (boardSize - 1);
    
    drawBoard([]);
}

function handleBoardClick(e) {
    if (!gameActive) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert pixel to grid coordinates
    // We need to find closest intersection.
    // x = padding + col * cellSize
    // col = (x - padding) / cellSize
    
    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);

    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
        // Send to Go (row, col)
        // Note: Go logic expects (row, col). Let's be consistent.
        
        const result = window.humanMove(row, col);
        
        if (!result.valid && !result.error && !result.gameOver) {
            // Invalid move, shake or something?
            // For now just ignore
            console.log("Invalid move");
        } else if (result.valid) {
            drawBoard(result.board);
            if (result.gameOver) {
                gameActive = false;
                updateStatus(`Game Over! Winner: ${result.winner}`);
            } else {
                updateStatus("Your Turn (Black)");
            }
        }
    }
}

function drawBoard(flatBoard) {
    // Clear
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Redraw background to clear previous stones

    // Draw Grid
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    for (let i = 0; i < boardSize; i++) {
        // Horizontal
        ctx.moveTo(padding, padding + i * cellSize);
        ctx.lineTo(canvas.width - padding, padding + i * cellSize);

        // Vertical
        ctx.moveTo(padding + i * cellSize, padding);
        ctx.lineTo(padding + i * cellSize, canvas.height - padding);
    }
    ctx.stroke();
    
    // Draw Star points (optional, maybe later)

    // Draw Stones
    if (!flatBoard || flatBoard.length === 0) return;

    for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
            const val = flatBoard[r * boardSize + c];
            if (val === 1) { // Black
                drawStone(r, c, 'black');
            } else if (val === 2) { // White
                drawStone(r, c, 'white');
            }
        }
    }
}

function drawStone(row, col, color) {
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    const radius = cellSize * 0.45;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    if (color === 'black') {
        ctx.fillStyle = '#000000';
        // Add a subtle shine
        const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
        grad.addColorStop(0, '#555');
        grad.addColorStop(1, '#000');
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = '#ffffff';
         const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, '#ddd');
        ctx.fillStyle = grad;
    }
    
    ctx.fill();
    ctx.shadowBlur = 5;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

function updateStatus(msg) {
    document.getElementById('status').innerText = msg;
}
