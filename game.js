// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Player object
const player = { x: 400, y: 300, speed: 5, color: '#FF0000', team: null };
let playerId = null;
let otherPlayers = {};

// Map with objects
const map = {
    width: 2000,
    height: 2000,
    objects: [
        { type: 'tree', x: 500, y: 200, radius: 20, color: 'green' },
        { type: 'rock', x: 300, y: 400, radius: 15, color: 'gray' },
        { type: 'water', x: 700, y: 600, width: 100, height: 50, color: '#00BFFF' }
    ]
};

// Camera
const camera = { x: 0, y: 0 };

// Inventory
let inventory = { rocks: 0 };

// Movement controls
const keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});
document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// WebSocket connection
const socket = new WebSocket('ws://localhost:8080');
socket.onopen = () => {
    console.log("Connected to server");
};
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'init':
            playerId = data.id;
            player.color = data.players[playerId].color;
            player.team = data.players[playerId].team;
            otherPlayers = { ...data.players };
            delete otherPlayers[playerId];
            if (data.mapObjects) {
                map.objects = data.mapObjects;
            }
            // Prompt for team after init ensures playerId exists
            if (!player.team) {
                const team = prompt("Choose a team: Red or Blue").toLowerCase();
                socket.send(JSON.stringify({ type: 'setTeam', team: team === 'blue' ? 'Blue' : 'Red' }));
            }
            break;
        case 'playerJoined':
            otherPlayers[data.player.id] = data.player;
            break;
        case 'playerLeft':
            delete otherPlayers[data.id];
            break;
        case 'update':
            otherPlayers = { ...data.players };
            delete otherPlayers[playerId];
            if (data.players[playerId]) {
                player.color = data.players[playerId].color;
                player.team = data.players[playerId].team;
            }
            if (data.mapObjects) {
                map.objects = data.mapObjects;
            }
            break;
        case 'chat':
            messages.innerHTML += `<p>${data.text}</p>`;
            messages.scrollTop = messages.scrollHeight;
            break;
    }
};

function checkCollisions() {
    if (Array.isArray(map.objects)) {
        map.objects.forEach((obj, index) => {
            if (obj.type === 'rock') {
                const dx = player.x - obj.x;
                const dy = player.y - obj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 10 + obj.radius) {
                    inventory.rocks += 1;
                    map.objects.splice(index, 1);
                    socket.send(JSON.stringify({ type: 'collect', index: index }));
                    console.log(`Collected a rock! Rocks: ${inventory.rocks}`);
                }
            }
            if (obj.type === 'enemy') {
                const dx = player.x - obj.x;
                const dy = player.y - obj.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 10 + obj.radius) {
                    socket.send(JSON.stringify({ type: 'hitEnemy', index: index, damage: 1 }));
                    console.log("Hit an enemy!");
                }
            }
        });
    }
}

function craftWall() {
    if (inventory.rocks >= 3) {
        inventory.rocks -= 3;
        const newWall = {
            type: 'wall',
            x: player.x + 20,
            y: player.y,
            width: 40,
            height: 20,
            color: player.team === 'Blue' ? '#0000FF' : '#FF0000'
        };
        map.objects.push(newWall);
        socket.send(JSON.stringify({ type: 'craft', object: newWall }));
        console.log("Crafted a wall!");
    } else {
        console.log("Need 3 rocks to craft a wall!");
    }
}

function update() {
    if (keys['w'] || keys['arrowup']) player.y -= player.speed;
    if (keys['s'] || keys['arrowdown']) player.y += player.speed;
    if (keys['a'] || keys['arrowleft']) player.x -= player.speed;
    if (keys['d'] || keys['arrowright']) player.x += player.speed;

    player.x = Math.max(0, Math.min(map.width - 20, player.x));
    player.y = Math.max(0, Math.min(map.height - 20, player.y));

    camera.x = player.x - canvas.width / 2;
    camera.y = player.y - canvas.height / 2;
    camera.x = Math.max(0, Math.min(map.width - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(map.height - canvas.height, camera.y));

    checkCollisions();

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'move', x: player.x, y: player.y }));
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (Array.isArray(map.objects)) {
        map.objects.forEach(obj => {
            ctx.fillStyle = obj.color;
            if (obj.type === 'water' || obj.type === 'wall') {
                ctx.fillRect(obj.x - camera.x, obj.y - camera.y, obj.width, obj.height);
            } else {
                ctx.beginPath();
                ctx.arc(obj.x - camera.x, obj.y - camera.y, obj.radius, 0, Math.PI * 2);
                ctx.fill();
                // Show enemy health
                if (obj.type === 'enemy' && obj.health) {
                    ctx.fillStyle = 'black';
                    ctx.font = '12px Arial';
                    ctx.fillText(obj.health, obj.x - camera.x - 5, obj.y - camera.y - 15);
                }
            }
        });
    }

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x - camera.x, player.y - camera.y, 10, 0, Math.PI * 2);
    ctx.fill();

    Object.values(otherPlayers).forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x - camera.x, p.y - camera.y, 10, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText(`Team: ${player.team || 'None'}`, 10, 20);
    ctx.fillText(`Rocks: ${inventory.rocks}`, 10, 40);
}

const craftButton = document.createElement('button');
craftButton.textContent = 'Craft Wall (3 Rocks)';
craftButton.style.position = 'absolute';
craftButton.style.left = '10px';
craftButton.style.top = '60px';
craftButton.addEventListener('click', craftWall);
document.body.appendChild(craftButton);

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
gameLoop();

// Chat functionality
const chatInput = document.getElementById('chatInput');
const messages = document.getElementById('messages');
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.send(JSON.stringify({ type: 'chat', text: chatInput.value }));
        chatInput.value = '';
    }
});