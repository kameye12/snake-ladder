const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// --- ตัวแปรระบบ ---
let players = [];
let isGameStarted = false;
let currentTurnIndex = 0;

// --- แผนที่ งู และ บันได (เพิ่มจุดให้เยอะขึ้น!) ---
const jumps = {
    // บันได (ขึ้น)
    2: 23, 8: 12, 17: 93, 29: 54, 32: 51, 39: 80, 70: 89, 75: 96,
    // งู (ลง)
    99: 4, 92: 76, 85: 6, 73: 15, 61: 18, 55: 24, 42: 10
};

const colors = ['#ff3838', '#ff9f43', '#f368e0', '#0abde3', '#10ac84', '#5f27cd'];

io.on('connection', (socket) => {
    // ... (ส่วน Login และ Start Game เหมือนเดิม ไม่ต้องแก้) ...
    // เพื่อความสั้น ผมขอละส่วน Login ไว้ (ใช้โค้ดเดิมได้เลย) 
    // แต่ให้ก๊อปปี้ส่วน rollDice ไปทับ เพราะต้องใช้ตัวแปร jumps ใหม่

    socket.on('joinGame', (playerName) => {
        if (isGameStarted) return socket.emit('notification', 'เกมเริ่มไปแล้ว!');
        const newPlayer = {
            id: socket.id,
            color: colors[players.length % colors.length],
            pos: 1,
            name: playerName || `ผู้เล่น ${players.length + 1}`
        };
        players.push(newPlayer);
        socket.emit('loginSuccess');
        io.emit('lobbyUpdate', { players, hostId: players[0]?.id });
    });

    socket.on('startGame', () => {
        if (players.length >= 2 && socket.id === players[0].id) {
            isGameStarted = true;
            io.emit('gameStarted');
            io.emit('updateState', { players, currentTurn: players[0].id, movingPlayerId: null });
        }
    });

    socket.on('rollDice', () => {
        const currentPlayer = players[currentTurnIndex];
        if (!currentPlayer || socket.id !== currentPlayer.id) return;

        const dice = Math.floor(Math.random() * 6) + 1;
        const startPos = currentPlayer.pos;
        let midPos = startPos + dice;
        let finalPos = midPos;
        let jumpType = null;

        if (midPos >= 100) {
            midPos = 100;
            finalPos = 100;
        } else if (jumps[midPos]) {
            finalPos = jumps[midPos];
            jumpType = finalPos > midPos ? 'ladder' : 'snake';
        }

        let msg = `${currentPlayer.name} ทอยได้ ${dice}`;
        if (jumpType === 'ladder') msg += ' (เจอ 🪜 บันได!)';
        if (jumpType === 'snake') msg += ' (เจอ 🐍 งู!)';

        io.emit('animateTurn', {
            playerId: currentPlayer.id,
            dice,
            startPos,
            midPos,
            finalPos,
            jumpType,
            msg
        });

        setTimeout(() => {
            currentPlayer.pos = finalPos;
            if (finalPos === 100) {
                io.emit('gameOver', { winner: currentPlayer.name });
                resetGame();
            } else {
                currentTurnIndex = (currentTurnIndex + 1) % players.length;
                io.emit('updateState', { players, currentTurn: players[currentTurnIndex].id, movingPlayerId: currentPlayer.id });
            }
        }, jumpType ? 1500 : 800);
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        if (players.length === 0) resetGame();
        else if (!isGameStarted) io.emit('lobbyUpdate', { players, hostId: players[0]?.id });
    });

    function resetGame() {
        isGameStarted = false;
        players.forEach(p => p.pos = 1);
        currentTurnIndex = 0;
        io.emit('gameReset');
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});