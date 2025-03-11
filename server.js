const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let mapObjects = [
    { type: 'tree', x: 500, y: 200, radius: 20, color: 'green' },
    { type: 'rock', x: 300, y: 400, radius: 15, color: 'gray' },
    { type: 'water', x: 700, y: 600, width: 100, height: 50, color: '#00BFFF' }
];

console.log('WebSocket server running on ws://localhost:8080');

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    players[playerId] = {
        id: playerId,
        x: 400,
        y: 300,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        lastUpdate: Date.now()
    };

    ws.send(JSON.stringify({
        type: 'init',
        id: playerId,
        players: players,
        mapObjects: mapObjects
    }));

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'playerJoined',
                player: players[playerId]
            }));
        }
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'move':
                    if (players[playerId]) {
                        players[playerId].x = data.x;
                        players[playerId].y = data.y;
                        players[playerId].lastUpdate = Date.now();
                    }
                    break;
                case 'collect':
                    mapObjects.splice(data.index, 1);
                    break;
                case 'craft':
                    mapObjects.push(data.object);
                    break;
                case 'chat':
                    const chatMessage = `${playerId}: ${data.text}`;
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'chat', text: chatMessage }));
                        }
                    });
                    break;
            }
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'update',
                        players: players,
                        mapObjects: mapObjects
                    }));
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    });

    ws.on('close', () => {
        delete players[playerId];
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'playerLeft', id: playerId }));
            }
        });
    });
});

// Respawn rocks every 30 seconds
setInterval(() => {
    const newRock = {
        type: 'rock',
        x: Math.random() * 1800 + 100,
        y: Math.random() * 1800 + 100,
        radius: 15,
        color: 'gray'
    };
    mapObjects.push(newRock);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'update',
                players: players,
                mapObjects: mapObjects
            }));
        }
    });
    console.log("Rock respawned!");
}, 30000);