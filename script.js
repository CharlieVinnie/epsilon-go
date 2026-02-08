const go = new Go();
let mod, inst;
let canvas, ctx;
let boardSize;
let cellSize;
let padding = 50; // Increased padding for margins
let gameActive = false;
let userColor = 1; // 1=Black, 2=White

let fireworkEffect;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('goBoard');
    ctx = canvas.getContext('2d');
    
    // Init fireworks
    const fCanvas = document.getElementById('fireworksCanvas');
    fCanvas.width = window.innerWidth;
    fCanvas.height = window.innerHeight;
    const fCtx = fCanvas.getContext('2d');
    fireworkEffect = new Firework(fCtx, fCanvas.width, fCanvas.height);

    window.addEventListener('resize', () => {
        fCanvas.width = window.innerWidth;
        fCanvas.height = window.innerHeight;
        fireworkEffect.width = fCanvas.width;
        fireworkEffect.height = fCanvas.height;
    });
    
    // Load WASM
    WebAssembly.instantiateStreaming(fetch("main.wasm"), go.importObject).then(async (result) => {
        mod = result.module;
        inst = result.instance;
        go.run(inst); // Start the Go runtime
    });

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('restartBtn').addEventListener('click', () => {
        document.getElementById('gameOverOverlay').classList.remove('visible');
        fireworkEffect.stop();
        // Clear fireworks canvas
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        startGame();
    });
    canvas.addEventListener('click', handleBoardClick);
});

function startGame() {
    boardSize = parseInt(document.getElementById('boardSize').value);
    userColor = parseInt(document.getElementById('userColor').value);
    
    if (!window.startGame) {
        alert("WASM not loaded yet, please wait...");
        return;
    }

    const result = window.startGame(boardSize, userColor);
    gameActive = true;
    
    let statusMsg = "Your Turn (Black)";
    if (userColor === 2) {
        statusMsg = "Your Turn (White) - Bot moved first";
    }
    updateStatus(statusMsg);
    
    const minSize = 400;
    const maxSize = Math.min(window.innerWidth - 60, 800);
    const size = Math.max(minSize, maxSize);
    
    canvas.width = size;
    canvas.height = size;
    
    cellSize = (canvas.width - 2 * padding) / (boardSize - 1);
    
    let lastMove = null;
    if (result.lastMove && result.lastMove.length === 2) {
        lastMove = { r: result.lastMove[0], c: result.lastMove[1] };
    }
    drawBoard(result.board, lastMove);
}

function handleBoardClick(e) {
    if (!gameActive) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.round((x - padding) / cellSize);
    const row = Math.round((y - padding) / cellSize);

    const clickX = padding + col * cellSize;
    const clickY = padding + row * cellSize;
    const dist = Math.sqrt((x-clickX)**2 + (y-clickY)**2);
    
    if (dist > cellSize / 2) {
        return; 
    }

    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
        // 1. Human Move
        const result = window.resolveHumanMove(row, col, userColor);
        
        if (!result.valid && !result.error && !result.gameOver) {
            console.log("Invalid move");
        } else if (result.valid) {
            let lastMove = null;
            if (result.lastMove) lastMove = { r: result.lastMove[0], c: result.lastMove[1] };
            
            drawBoard(result.board, lastMove);
            
            if (result.gameOver) {
                endGame(result.winner);
            } else if (result.botTurn) {
                updateStatus("Bot Thinking...");
                // 2. Delay then Bot Move
                setTimeout(() => {
                   const botResult = window.resolveBotMove(userColor);
                   
                   let botLastMove = null;
                   if (botResult.lastMove) botLastMove = { r: botResult.lastMove[0], c: botResult.lastMove[1] };

                   drawBoard(botResult.board, botLastMove);
                   
                   if (botResult.gameOver) {
                       endGame(botResult.winner);
                   } else {
                       updateStatus(`Your Turn (${userColor === 1 ? 'Black' : 'White'})`);
                   }
                }, 500); // 500ms delay
            }
        }
    }
}

function endGame(winnerName) {
    gameActive = false;
    const overlay = document.getElementById('gameOverOverlay');
    const msg = document.getElementById('endMessage');
    
    overlay.classList.add('visible');
    
    // Determine if Bot Won
    // Bot is Black (1) if User is White (2)
    // Bot is White (2) if User is Black (1)
    
    let botWon = false;
    if (userColor === 1 && winnerName.includes("White")) botWon = true; 
    if (userColor === 2 && winnerName.includes("Black")) botWon = true;

    if (botWon) {
        msg.innerText = "Congratulations!";
        msg.className = "message win";
        fireworkEffect.start();
    } else {
        msg.innerText = "Defeat";
        msg.className = "message loss";
    }
}

function drawBoard(flatBoard, lastMove = null) {
    // Clear
    ctx.fillStyle = '#dcb35c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
    
    // Draw Star points (classic positions 3, 9, 15 etc depending on board size)
    // Simplified for now: Center dot for odd sizes
    if (boardSize % 2 !== 0) {
        const center = (boardSize - 1) / 2;
        drawDot(center, center);
    }
    
    // Draw Stones
    if (!flatBoard || flatBoard.length === 0) return;

    for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
            const val = flatBoard[r * boardSize + c];
            const isLastMove = lastMove && lastMove.r === r && lastMove.c === c;
            
            if (val === 1) { // Black
                drawStone(r, c, 'black', isLastMove);
            } else if (val === 2) { // White
                drawStone(r, c, 'white', isLastMove);
            }
        }
    }
}

function drawDot(row, col) {
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#000000';
    ctx.fill();
}

function drawStone(row, col, color, isLastMove = false) {
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    const radius = cellSize * 0.45;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    
    if (color === 'black') {
        const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
        grad.addColorStop(0, '#555');
        grad.addColorStop(1, '#000');
        ctx.fillStyle = grad;
    } else {
         const grad = ctx.createRadialGradient(x - radius/3, y - radius/3, radius/10, x, y, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, '#ddd');
        ctx.fillStyle = grad;
    }
    
    ctx.fill();
    
    // Shadow
    ctx.shadowBlur = 4;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.stroke(); // border
    
    ctx.shadowBlur = 0; 
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw last move marker
    if (isLastMove) {
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.3, 0, 2 * Math.PI);
        ctx.fillStyle = color === 'black' ? '#ff3333' : '#cc0000'; // Red dot
        ctx.fill();
    }
}

function updateStatus(msg) {
    document.getElementById('status').innerText = msg;
}
