const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the root directory
app.use(express.static(__dirname + '/..'));
console.log('Serving static files from:', __dirname + '/..');

// Game state
let players = new Map();
let gameState = {
    player1Health: 100,
    player2Health: 100,
    gameStarted: false,
    gameMode: 'pvp'
};

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle player join
    socket.on('joinGame', () => {
        if (players.size < 2) {
            const playerNumber = players.size + 1;
            players.set(socket.id, {
                number: playerNumber,
                position: { x: 0, y: 0, z: 0 },
                health: 100
            });
            
            // Send player number to client
            socket.emit('playerNumber', playerNumber);
            
            // Broadcast updated player count
            io.emit('playerCount', players.size);
            
            // If we have 2 players, start the game
            if (players.size === 2) {
                io.emit('gameStart', gameState);
            }
        } else {
            socket.emit('gameFull');
        }
    });

    // Handle player movement
    socket.on('playerMove', (position) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = position;
            // Broadcast position to all other players
            socket.broadcast.emit('playerMoved', {
                playerNumber: player.number,
                position: position
            });
        }
    });

    // Handle player hit
    socket.on('playerHit', (data) => {
        const { targetPlayerNumber } = data;
        const targetPlayer = Array.from(players.values()).find(p => p.number === targetPlayerNumber);
        
        if (targetPlayer) {
            targetPlayer.health -= 10; // Damage amount
            if (targetPlayer.health <= 0) {
                targetPlayer.health = 0;
            }
            
            // Update game state
            if (targetPlayerNumber === 1) {
                gameState.player1Health = targetPlayer.health;
            } else {
                gameState.player2Health = targetPlayer.health;
            }
            
            // Broadcast health update
            io.emit('healthUpdate', gameState);
            
            // Check for game over
            if (gameState.player1Health <= 0 || gameState.player2Health <= 0) {
                io.emit('gameOver', {
                    winner: gameState.player1Health <= 0 ? 2 : 1
                });
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            players.delete(socket.id);
            io.emit('playerLeft', player.number);
            io.emit('playerCount', players.size);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 