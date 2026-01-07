const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- Route: จัดการเส้นทางหน้าเว็บ ---
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });       // หน้าเมนู
app.get('/snake', (req, res) => { res.sendFile(__dirname + '/snake.html'); });   // หน้าเกมงู
app.get('/clicker', (req, res) => { res.sendFile(__dirname + '/clicker.html'); }); // หน้าเกมคลิก
app.get('/xo', (req, res) => { res.sendFile(__dirname + '/xo.html'); });
app.get('/checkers', (req, res) => { res.sendFile(__dirname + '/checkers.html'); });
app.get('/typing', (req, res) => { res.sendFile(__dirname + '/typing.html'); });
app.get('/2048', (req, res) => { res.sendFile(__dirname + '/2048.html'); });
app.get('/breakout', (req, res) => { res.sendFile(__dirname + '/breakout.html'); });
app.get('/hangman', (req, res) => { res.sendFile(__dirname + '/hangman.html'); });
app.get('/ragdoll', (req, res) => { res.sendFile(__dirname + '/ragdoll.html'); });

// ==========================================
// 🐍 โซนเกมบันไดงู (Namespace: /snake)
// ==========================================
const snakeIO = io.of('/snake'); // *** สร้างห้องแยก ***

// ตัวแปรของเกมงู (ย้ายมาไว้ในนี้ หรือแยกไฟล์ก็ได้)
let snakePlayers = [];
let snakeGameStarted = false;
let snakeTurnIndex = 0;
const jumps = { 2: 23, 8: 12, 17: 93, 29: 54, 32: 51, 39: 80, 70: 89, 75: 96, 99: 4, 92: 76, 85: 6, 73: 15, 61: 18, 55: 24, 42: 10 };
const colors = ['#ff3838', '#ff9f43', '#f368e0', '#0abde3', '#10ac84', '#5f27cd'];

snakeIO.on('connection', (socket) => {
    // *** ก๊อปปี้ Logic เกมงูเดิมมาใส่ตรงนี้ ***
    // *** แต่เปลี่ยนจาก io.emit เป็น snakeIO.emit ***

    socket.on('joinGame', (playerName) => {
        if (snakeGameStarted) return socket.emit('notification', 'เกมเริ่มไปแล้ว!');
        const newPlayer = {
            id: socket.id,
            color: colors[snakePlayers.length % colors.length],
            pos: 1,
            name: playerName || `ผู้เล่น ${snakePlayers.length + 1}`
        };
        snakePlayers.push(newPlayer);
        socket.emit('loginSuccess');
        snakeIO.emit('lobbyUpdate', { players: snakePlayers, hostId: snakePlayers[0]?.id });
    });

    socket.on('startGame', () => {
        if (snakePlayers.length >= 2 && socket.id === snakePlayers[0].id) {
            snakeGameStarted = true;
            snakeIO.emit('gameStarted');
            snakeIO.emit('updateState', { players: snakePlayers, currentTurn: snakePlayers[0].id, movingPlayerId: null });
        }
    });

    socket.on('rollDice', () => {
        const currentPlayer = snakePlayers[snakeTurnIndex];
        if (!currentPlayer || socket.id !== currentPlayer.id) return;

        const dice = Math.floor(Math.random() * 6) + 1;
        const startPos = currentPlayer.pos;
        let midPos = startPos + dice;
        let finalPos = midPos;
        let jumpType = null;

        if (midPos >= 100) { midPos = 100; finalPos = 100; }
        else if (jumps[midPos]) { finalPos = jumps[midPos]; jumpType = finalPos > midPos ? 'ladder' : 'snake'; }

        let msg = `${currentPlayer.name} ทอยได้ ${dice}` + (jumpType === 'ladder' ? ' (บันได!)' : (jumpType === 'snake' ? ' (งู!)' : ''));

        snakeIO.emit('animateTurn', { playerId: currentPlayer.id, dice, startPos, midPos, finalPos, jumpType, msg });

        setTimeout(() => {
            currentPlayer.pos = finalPos;
            if (finalPos === 100) {
                snakeIO.emit('gameOver', { winner: currentPlayer.name });
                resetSnakeGame();
            } else {
                snakeTurnIndex = (snakeTurnIndex + 1) % snakePlayers.length;
                snakeIO.emit('updateState', { players: snakePlayers, currentTurn: snakePlayers[snakeTurnIndex].id, movingPlayerId: currentPlayer.id });
            }
        }, jumpType ? 1500 : 800);
    });

    socket.on('disconnect', () => {
        snakePlayers = snakePlayers.filter(p => p.id !== socket.id);
        if (snakePlayers.length === 0) resetSnakeGame();
        else if (!snakeGameStarted) snakeIO.emit('lobbyUpdate', { players: snakePlayers, hostId: snakePlayers[0]?.id });
    });

    function resetSnakeGame() {
        snakeGameStarted = false;
        snakePlayers.forEach(p => p.pos = 1);
        snakeTurnIndex = 0;
        snakeIO.emit('gameReset');
    }
});

// ==========================================
// 🔥 โซนเกม Clicker (Namespace: /clicker)
// ==========================================
const clickerIO = io.of('/clicker');
let clickerPlayers = {};

clickerIO.on('connection', (socket) => {
    clickerPlayers[socket.id] = { score: 0 };
    clickerIO.emit('update', clickerPlayers);

    socket.on('click', () => {
        if (clickerPlayers[socket.id]) {
            clickerPlayers[socket.id].score++;
            clickerIO.emit('update', clickerPlayers);
        }
    });

    socket.on('disconnect', () => {
        delete clickerPlayers[socket.id];
        clickerIO.emit('update', clickerPlayers);
    });
});


// ==========================================
// ❌⭕ โซนเกม XO (Namespace: /xo)
// ==========================================
const xoIO = io.of('/xo');

let xoState = {
    board: Array(9).fill(null), // กระดาน 9 ช่อง
    turn: 'X',                 // X เริ่มก่อนเสมอ
    players: {},               // เก็บ socket.id -> 'X' หรือ 'O'
    xId: null,                 // ID ของคนเล่น X
    oId: null                  // ID ของคนเล่น O
};

xoIO.on('connection', (socket) => {
    // 1. ระบบจับคู่ (คนแรกเป็น X คนสองเป็น O)
    let role = 'spectator';
    if (!xoState.xId) {
        xoState.xId = socket.id;
        role = 'X';
    } else if (!xoState.oId) {
        xoState.oId = socket.id;
        role = 'O';
    }
    xoState.players[socket.id] = role;
    socket.emit('assignRole', role);

    // ส่งสถานะปัจจุบันให้คนมาใหม่
    socket.emit('updateBoard', xoState);

    // 2. เมื่อผู้เล่นเดินหมาก
    socket.on('makeMove', (index) => {
        const playerRole = xoState.players[socket.id];

        // กฎ: ต้องเป็นตาเรา + ช่องต้องว่าง + ต้องไม่ใช่คนดู
        if (playerRole === xoState.turn && xoState.board[index] === null && playerRole !== 'spectator') {

            xoState.board[index] = playerRole;

            // เช็คผู้ชนะ
            if (checkWin(xoState.board)) {
                xoIO.emit('updateBoard', xoState);
                xoIO.emit('gameOver', { winner: playerRole });
            } else if (!xoState.board.includes(null)) {
                // ถ้ากระดานเต็ม = เสมอ
                xoIO.emit('updateBoard', xoState);
                xoIO.emit('gameOver', { draw: true });
            } else {
                // สลับตา
                xoState.turn = xoState.turn === 'X' ? 'O' : 'X';
                xoIO.emit('updateBoard', xoState);
            }
        }
    });

    // 3. รีเซ็ตเกม
    socket.on('resetGame', () => {
        xoState.board = Array(9).fill(null);
        xoState.turn = 'X';
        xoIO.emit('gameReset');
        xoIO.emit('updateBoard', xoState);
    });

    // 4. คนออกจากเกม
    socket.on('disconnect', () => {
        if (socket.id === xoState.xId) xoState.xId = null;
        if (socket.id === xoState.oId) xoState.oId = null;
        delete xoState.players[socket.id];
        // (ทางเลือก: จะรีเซ็ตเกมเลยก็ได้ถ้าคนเล่นออก)
    });
});

// ฟังก์ชันเช็คชนะ (8 วิธีชนะ)
function checkWin(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // แนวนอน
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // แนวตั้ง
        [0, 4, 8], [2, 4, 6]             // ทแยง
    ];
    return winPatterns.some(pattern => {
        const [a, b, c] = pattern;
        return board[a] && board[a] === board[b] && board[a] === board[c];
    });
}


// ==========================================
// ♚ โซนเกมหมากฮอส (Namespace: /checkers)
// ==========================================
const checkersIO = io.of('/checkers');

let chkState = {
    board: Array(64).fill(null), // 8x8
    turn: 'red', // แดงเริ่มก่อน
    players: {},
    redId: null,
    whiteId: null
};

// ฟังก์ชันเริ่มกระดานใหม่
function initCheckers() {
    chkState.board.fill(null);
    for (let i = 0; i < 64; i++) {
        const row = Math.floor(i / 8);
        const col = i % 8;
        if ((row + col) % 2 === 1) { // วางเฉพาะช่องดำ
            if (row < 3) chkState.board[i] = { color: 'white', isKing: false }; // ขาวอยู่บน
            if (row > 4) chkState.board[i] = { color: 'red', isKing: false };   // แดงอยู่ล่าง
        }
    }
    chkState.turn = 'red';
}
initCheckers(); // รันครั้งแรก

checkersIO.on('connection', (socket) => {
    // 1. จับคู่
    let role = 'spectator';
    if (!chkState.redId) { chkState.redId = socket.id; role = 'red'; }
    else if (!chkState.whiteId) { chkState.whiteId = socket.id; role = 'white'; }
    chkState.players[socket.id] = role;

    socket.emit('assignRole', role);
    socket.emit('updateBoard', chkState);

    // 2. เมื่อผู้เล่น "เลือก" ตัวหมาก
    socket.on('selectPiece', (index) => {
        const role = chkState.players[socket.id];
        if (role !== chkState.turn) return; // ไม่ใช่ตาเรา
        const piece = chkState.board[index];
        if (piece && piece.color === role) {
            socket.emit('pieceSelected', index); // บอก Client ว่าเลือกได้
        }
    });

    // 3. เมื่อผู้เล่น "เดิน" หมาก
    socket.on('makeMove', ({ from, to }) => {
        const role = chkState.players[socket.id];
        if (role !== chkState.turn) return;

        // ถ้ากดเลือกตัวเดิม หรือตัวพวกเดียวกัน -> ให้เปลี่ยน selection แทน
        const target = chkState.board[to];
        if (target && target.color === role) {
            socket.emit('pieceSelected', to);
            return;
        }

        // --- Logic การเดิน (Simplified) ---
        // 1. ตรวจสอบว่าเป็นช่องว่างไหม
        if (chkState.board[to] !== null) return;

        const piece = chkState.board[from];
        if (!piece) return;

        const fromRow = Math.floor(from / 8);
        const toRow = Math.floor(to / 8);
        const diffRow = toRow - fromRow;     // ผลต่างแถว
        const diffIndex = to - from;         // ผลต่าง index

        // เช็คทิศทาง (แดงต้องเดินขึ้น -Row, ขาวเดินลง +Row, ฮอสเดินได้หมด)
        const isForward = (piece.color === 'red' && diffRow < 0) || (piece.color === 'white' && diffRow > 0);
        if (!piece.isKing && !isForward) return; // ถ้าไม่ใช่ฮอส ห้ามเดินถอยหลัง

        // --- กรณีเดินปกติ (1 ช่อง) ---
        if (Math.abs(diffRow) === 1 && Math.abs(diffIndex % 8) !== 0) { // เดินเฉียง 1 แถว
            // ย้ายตัว
            chkState.board[to] = piece;
            chkState.board[from] = null;
            endTurn(to);
            return;
        }

        // --- กรณีเดินกิน (2 ช่อง) ---
        if (Math.abs(diffRow) === 2 && Math.abs(diffIndex % 8) !== 0) {
            const midIndex = (from + to) / 2; // หา index ของตัวตรงกลาง
            const midPiece = chkState.board[midIndex];

            // ต้องมีตัวตรงกลาง และต้องเป็นศัตรู
            if (midPiece && midPiece.color !== piece.color) {
                // กิน!
                chkState.board[to] = piece;
                chkState.board[from] = null;
                chkState.board[midIndex] = null; // ลบตัวที่ถูกกิน
                endTurn(to);
            }
        }

        function endTurn(finalIndex) {
            // เช็คเข้าฮอส (King)
            const p = chkState.board[finalIndex];
            const r = Math.floor(finalIndex / 8);
            if ((p.color === 'red' && r === 0) || (p.color === 'white' && r === 7)) {
                p.isKing = true;
            }

            // สลับตา
            chkState.turn = chkState.turn === 'red' ? 'white' : 'red';
            checkersIO.emit('updateBoard', chkState);

            // เช็คชนะ (นับจำนวนตัวที่เหลือ)
            const reds = chkState.board.filter(p => p && p.color === 'red').length;
            const whites = chkState.board.filter(p => p && p.color === 'white').length;
            if (reds === 0) checkersIO.emit('gameOver', { winner: 'white' });
            if (whites === 0) checkersIO.emit('gameOver', { winner: 'red' });
        }
    });

    socket.on('resetGame', () => {
        initCheckers();
        checkersIO.emit('updateBoard', chkState);
    });

    socket.on('disconnect', () => {
        if (socket.id === chkState.redId) chkState.redId = null;
        if (socket.id === chkState.whiteId) chkState.whiteId = null;
        delete chkState.players[socket.id];
    });
});

// ==========================================
// ⌨️ โซนเกม Typing (Namespace: /typing)
// ==========================================
const typingIO = io.of('/typing');
let typingScores = {};

typingIO.on('connection', (socket) => {
    // เก็บชื่อผู้เล่น (ในที่นี้ใช้ ID ไปก่อน หรือจะให้ส่งชื่อมาก็ได้)
    typingScores[socket.id] = 0;

    // ส่ง Leaderboard ให้ทุกคนทันทีที่เข้ามา
    typingIO.emit('updateLeaderboard', typingScores);

    socket.on('updateScore', (score) => {
        typingScores[socket.id] = score;
        // Broadcast บอกทุกคนว่าคะแนนเปลี่ยนแล้ว
        typingIO.emit('updateLeaderboard', typingScores);
    });

    socket.on('disconnect', () => {
        delete typingScores[socket.id];
        typingIO.emit('updateLeaderboard', typingScores);
    });
});


// ==========================================
// 🔢 โซนเกม 2048 (Namespace: /2048)
// ==========================================
const io2048 = io.of('/2048');
let scores2048 = {};

io2048.on('connection', (socket) => {
    scores2048[socket.id] = 0;
    io2048.emit('updateLeaderboard', scores2048);

    socket.on('updateScore', (score) => {
        // อัปเดตเฉพาะถ้าคะแนนเยอะกว่าเดิม
        if (score > scores2048[socket.id]) {
            scores2048[socket.id] = score;
            io2048.emit('updateLeaderboard', scores2048);
        }
    });

    socket.on('disconnect', () => {
        delete scores2048[socket.id];
        io2048.emit('updateLeaderboard', scores2048);
    });
});

// ==========================================
// 🧱 โซนเกม Breakout (Namespace: /breakout)
// ==========================================
const breakoutIO = io.of('/breakout');
let scoresBreakout = {};

breakoutIO.on('connection', (socket) => {
    scoresBreakout[socket.id] = 0;
    breakoutIO.emit('updateLeaderboard', scoresBreakout);

    socket.on('updateScore', (score) => {
        if (score > scoresBreakout[socket.id]) {
            scoresBreakout[socket.id] = score;
            breakoutIO.emit('updateLeaderboard', scoresBreakout);
        }
    });

    socket.on('disconnect', () => {
        delete scoresBreakout[socket.id];
        breakoutIO.emit('updateLeaderboard', scoresBreakout);
    });
});

// ==========================================
// 😵 โซนเกม Hangman (Namespace: /hangman)
// ==========================================
const hangmanIO = io.of('/hangman');

const words = [
    { word: "JAVASCRIPT", cat: "Coding" },
    { word: "PYTHON", cat: "Coding" },
    { word: "AIRPLANE", cat: "Vehicle" },
    { word: "BANANA", cat: "Fruit" },
    { word: "THAILAND", cat: "Country" },
    { word: "FACEBOOK", cat: "App" },
    { word: "DOCKER", cat: "Tech" },
    { word: "GITHUB", cat: "Tech" },
    { word: "NETFLIX", cat: "App" },
    { word: "CROWN", cat: "Symbol" }
];

// เก็บสถานะเกมของผู้เล่นแต่ละคน (แยกกันเล่น)
let hangmanGames = {};

hangmanIO.on('connection', (socket) => {
    // 1. เริ่มเกมใหม่ให้ผู้เล่นคนนี้
    startNewGame(socket.id);

    // 2. เมื่อผู้เล่นทาย
    socket.on('guess', (letter) => {
        const game = hangmanGames[socket.id];
        if (!game || game.isGameOver) return;

        letter = letter.toUpperCase();

        // เช็คว่ามีตัวอักษรนี้ไหม
        if (game.word.includes(letter)) {
            // ทายถูก
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter) game.guessed[i] = letter;
            }
            socket.emit('guessResult', { letter, correct: true });
        } else {
            // ทายผิด
            game.wrongGuesses++;
            socket.emit('guessResult', { letter, correct: false });
        }

        // เช็คจบเกม
        checkGameOver(socket);
    });

    socket.on('disconnect', () => {
        delete hangmanGames[socket.id];
    });

    function startNewGame(id) {
        const pick = words[Math.floor(Math.random() * words.length)];
        hangmanGames[id] = {
            word: pick.word,
            category: pick.cat,
            guessed: Array(pick.word.length).fill('_'),
            wrongGuesses: 0,
            maxLives: 6,
            isGameOver: false
        };
        sendUpdate(id);
    }

    function checkGameOver(socket) {
        const game = hangmanGames[socket.id];
        const isWin = !game.guessed.includes('_');
        const isLose = game.wrongGuesses >= game.maxLives;

        if (isWin || isLose) {
            game.isGameOver = true;
            sendUpdate(socket.id, isWin);
        } else {
            sendUpdate(socket.id);
        }
    }

    function sendUpdate(id, win = false) {
        const game = hangmanGames[id];
        socket.emit('updateGame', {
            displayWord: game.guessed.join(' '),
            wrongGuesses: game.wrongGuesses,
            maxLives: game.maxLives,
            category: game.category,
            isGameOver: game.isGameOver,
            win: win,
            fullWord: game.word
        });
    }
});


// ==========================================
// 🤸‍♂️ โซนเกม Ragdoll (Namespace: /ragdoll)
// ==========================================
const ragdollIO = io.of('/ragdoll');
let ragdollScores = {};

ragdollIO.on('connection', (socket) => {
    ragdollScores[socket.id] = 1; // เริ่มที่ Level 1
    ragdollIO.emit('updateLeaderboard', ragdollScores);

    socket.on('updateLevel', (level) => {
        if (level > (ragdollScores[socket.id] || 1)) {
            ragdollScores[socket.id] = level;
            ragdollIO.emit('updateLeaderboard', ragdollScores);
        }
    });

    socket.on('disconnect', () => {
        delete ragdollScores[socket.id];
        ragdollIO.emit('updateLeaderboard', ragdollScores);
    });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));