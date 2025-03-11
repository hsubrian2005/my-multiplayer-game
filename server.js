const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let players = {};
let mapObjects = [
    { type: 'tree', x: 500, y: 10, z: 200, radius: 20, color: '#00FF00' },
    { type: 'rock', x: 300, y: 7.5, z: 400, radius: 15, color: '#808080' },
    { type: 'water', x: 700, y: 0, z: 600, width: 100, height: 5, depth: 50, color: '#00BFFF' }
];

console.log('WebSocket server running on ws://localhost:8080');

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substr(2, 9);
    players[playerId] = { id: playerId, x: 400, y: 10, z: 300, color: '#FF0000', team: null, lastUpdate: Date.now() };

    ws.send(JSON.stringify({ type: 'init', id: playerId, players, mapObjects }));

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'playerJoined', player: players[playerId] }));
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
                        players[playerId].z = data.z;
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
                        console.log(`Enemy ${data.index} health: ${mapObjects[data.index].health}`);
                        if (mapObjects[data.index].health <= 0) {
                            const { x, y, z } = mapObjects[data.index];
                            mapObjects.splice(data.index, 1);
                            if (Math.random() < 0.5) {
                                mapObjects.push({ type: 'rock', x, y: 7.5, z, radius: 15, color: '#808080' });
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
                    break;
            }
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'update', players, mapObjects }));
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

// Respawn rocks
setInterval(() => {
    mapObjects.push({
        type: 'rock',
        x: Math.random() * 1800 + 100,
        y: 7.5,
        z: Math.random() * 1800 + 100,
        radius: 15,
        color: '#808080'
    });
    console.log("Rock respawned!");
}, 30000);

// Spawn enemies
setInterval(() => {
    mapObjects.push({
        type: 'enemy',
        x: Math.random() * 1800 + 100,
        y: 6,
        z: Math.random() * 1800 + 100,
        radius: 12,
        color: '#FF0000',
        speed: 2,
        health: 3
    });
    console.log("Enemy spawned!");
}, 20000);

// Update enemy positions
setInterval(() => {
    mapObjects.forEach(obj => {
        if (obj.type === 'enemy') {
            let nearestPlayer = null;
            let minDistance = Infinity;
            Object.values(players).forEach(p => {
                const dx = p.x - obj.x;
                const dz = p.z - obj.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPlayer = p;
                }
            });
            if (nearestPlayer) {
                const dx = nearestPlayer.x - obj.x;
                const dz = nearestPlayer.z - obj.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance > 0) {
                    obj.x += (dx / distance) * obj.speed;
                    obj.z += (dz / distance) * obj.speed;
                }
            }
        }
    });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'update', players, mapObjects }));
        }
    });
}, 100);