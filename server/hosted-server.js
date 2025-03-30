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

// Store connected players
const players = new Map();

io.on('connection', (socket) => {
    console.log('A player connected from:', socket.handshake.address);

    // Assign player number (1 or 2)
    const playerNumber = players.size + 1;
    players.set(socket.id, {
        number: playerNumber,
        position: { x: playerNumber === 1 ? -5 : 5, y: 0, z: 0 },
        health: 100,
        isDead: false
    });

    // Send player number to the client
    socket.emit('playerNumber', playerNumber);

    // Send current game state to new player
    socket.emit('gameState', Array.from(players.values()));

    // Handle player movement
    socket.on('playerMove', (position) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = position;
            io.emit('playerMoved', {
                id: socket.id,
                position: position
            });
        }
    });

    // Handle player shooting
    socket.on('playerShot', (targetId) => {
        const target = players.get(targetId);
        if (target && !target.isDead) {
            target.health -= 10;
            if (target.health <= 0) {
                target.health = 0;
                target.isDead = true;
                io.emit('playerDied', targetId);
                
                // Respawn after 3 seconds
                setTimeout(() => {
                    target.health = 100;
                    target.isDead = false;
                    target.position = { 
                        x: target.number === 1 ? -5 : 5, 
                        y: 0, 
                        z: 0 
                    };
                    io.emit('playerRespawned', {
                        id: targetId,
                        position: target.position
                    });
                }, 3000);
            }
            io.emit('playerHealthUpdate', {
                id: targetId,
                health: target.health
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('A player disconnected:', socket.handshake.address);
        players.delete(socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Static files being served from: ${__dirname + '/..'}`);
}); 