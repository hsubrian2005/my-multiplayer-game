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
        color: '#FF0000',
        team: null,
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
                case 'hitEnemy':
                    if (mapObjects[data.index] && mapObjects[data.index].type === 'enemy') {
                        mapObjects[data.index].health -= data.damage;
                        if (mapObjects[data.index].health <= 0) {
                            const enemyX = mapObjects[data.index].x;
                            const enemyY = mapObjects[data.index].y;
                            mapObjects.splice(data.index, 1);
                            if (Math.random() < 0.5) {
                                mapObjects.push({
                                    type: 'rock',
                                    x: enemyX,
                                    y: enemyY,
                                    radius: 15,
                                    color: 'gray'
                                });
                            }
                        }
                    }
                    break;
                case 'chat':
                    const chatMessage = `[${players[playerId].team || 'No Team'}] ${playerId}: ${data.text}`;
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'chat', text: chatMessage }));
                        }
                    });
                    break;
                case 'setTeam':
                    players[playerId].team = data.team;
                    players[playerId].color = data.team === 'Blue' ? '#0000FF' : '#FF0000';
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'update',
                                players: players,
                                mapObjects: mapObjects
                            }));
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

// Spawn enemies every 20 seconds
setInterval(() => {
    const newEnemy = {
        type: 'enemy',
        x: Math.random() * 1800 + 100,
        y: Math.random() * 1800 + 100,
        radius: 12,
        color: 'red',
        speed: 2,
        health: 3 // 3 hits to kill
    };
    mapObjects.push(newEnemy);
    console.log("Enemy spawned!");
}, 20000);

// Update enemy positions every 100ms
setInterval(() => {
    mapObjects.forEach(obj => {
        if (obj.type === 'enemy') {
            let nearestPlayer = null;
            let minDistance = Infinity;
            Object.values(players).forEach(p => {
                const dx = p.x - obj.x;
                const dy = p.y - obj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPlayer = p;
                }
            });
            if (nearestPlayer) {
                const dx = nearestPlayer.x - obj.x;
                const dy = nearestPlayer.y - obj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > 0) {
                    obj.x += (dx / distance) * obj.speed;
                    obj.y += (dy / distance) * obj.speed;
                }
            }
        }
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'update',
                players: players,
                mapObjects: mapObjects
            }));
        }
    });
}, 100);