// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement); // Ensure renderer is added to body

// Ground
const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x90EE90 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Player
const playerGeometry = new THREE.CylinderGeometry(5, 5, 20, 32);
let player = null;
let playerId = null;
const otherPlayers = {};

// Game state
const map = { objects: [] };
let inventory = { rocks: 0 };

// Controls
const keys = {};
document.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// WebSocket
const socket = new WebSocket('ws://localhost:8080');
socket.onopen = () => console.log("Connected to server");
socket.onerror = (error) => console.error("WebSocket error:", error);
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Received message:", data); // Debug log
    switch (data.type) {
        case 'init':
            playerId = data.id;
            player = createStickman(data.players[playerId]);
            scene.add(player);
            updatePlayers(data.players);
            if (data.mapObjects) updateMapObjects(data.mapObjects);
            if (!data.players[playerId].team) showTeamButtons();
            break;
        case 'playerJoined':
            otherPlayers[data.player.id] = createStickman(data.player);
            scene.add(otherPlayers[data.player.id]);
            break;
        case 'playerLeft':
            scene.remove(otherPlayers[data.id]);
            delete otherPlayers[data.id];
            break;
        case 'update':
            updatePlayers(data.players);
            if (data.mapObjects) updateMapObjects(data.mapObjects);
            break;
        case 'chat':
            messages.innerHTML += `<p>${data.text}</p>`;
            messages.scrollTop = messages.scrollHeight;
            break;
    }
};

// Helper functions
function createStickman(data) {
    const material = new THREE.MeshBasicMaterial({ color: parseInt(data.color.slice(1), 16) });
    const mesh = new THREE.Mesh(playerGeometry, material);
    mesh.position.set(data.x, 10, data.z || 0);
    return mesh;
}

function updatePlayers(playersData) {
    Object.entries(playersData).forEach(([id, p]) => {
        if (id === playerId) {
            player.material.color.setHex(parseInt(p.color.slice(1), 16));
            document.getElementById('team').textContent = p.team || 'None';
        } else if (otherPlayers[id]) {
            otherPlayers[id].position.set(p.x, 10, p.z || 0);
            otherPlayers[id].material.color.setHex(parseInt(p.color.slice(1), 16));
        }
    });
}

function updateMapObjects(objects) {
    map.objects.forEach(obj => scene.remove(obj));
    map.objects = objects.map(obj => {
        let geometry, material;
        if (obj.type === 'rock' || obj.type === 'enemy') {
            geometry = new THREE.SphereGeometry(obj.radius, 32, 32);
            material = new THREE.MeshBasicMaterial({ color: parseInt(obj.color.slice(1), 16) });
        } else {
            geometry = new THREE.BoxGeometry(obj.width, obj.height, obj.depth || obj.height);
            material = new THREE.MeshBasicMaterial({ color: parseInt(obj.color.slice(1), 16) });
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(obj.x, (obj.height || obj.radius) / 2, obj.z || 0);
        scene.add(mesh);
        return mesh;
    });
}

function showTeamButtons() {
    const teamDiv = document.createElement('div');
    teamDiv.style.cssText = 'position:absolute;top:100px;left:10px;background:rgba(255,255,255,0.8);padding:10px;';
    ['Red', 'Blue'].forEach(team => {
        const btn = document.createElement('button');
        btn.textContent = `Join ${team} Team`;
        btn.style.cssText = `background:${team === 'Red' ? '#FF0000' : '#0000FF'};color:white;margin:0 5px;`;
        btn.onclick = () => {
            socket.send(JSON.stringify({ type: 'setTeam', team }));
            document.body.removeChild(teamDiv);
        };
        teamDiv.appendChild(btn);
    });
    document.body.appendChild(teamDiv);
}

// Crafting
document.getElementById('craftWall').addEventListener('click', () => {
    if (inventory.rocks >= 3) {
        inventory.rocks -= 3;
        document.getElementById('rocks').textContent = inventory.rocks;
        socket.send(JSON.stringify({
            type: 'craft',
            object: { type: 'wall', x: player.position.x + 20, y: 10, z: player.position.z, width: 40, height: 20, color: '#' + player.material.color.getHex().toString(16) }
        }));
    }
});

document.getElementById('craftTower').addEventListener('click', () => {
    if (inventory.rocks >= 5) {
        inventory.rocks -= 5;
        document.getElementById('rocks').textContent = inventory.rocks;
        socket.send(JSON.stringify({
            type: 'craft',
            object: { type: 'tower', x: player.position.x + 20, y: 15, z: player.position.z, width: 30, height: 30, color: '#' + player.material.color.getHex().toString(16) }
        }));
    }
});

// Game loop
function update() {
    if (player) {
        const speed = 5;
        if (keys['w']) player.position.z -= speed;
        if (keys['s']) player.position.z += speed;
        if (keys['a']) player.position.x -= speed;
        if (keys['d']) player.position.x += speed;

        player.position.x = Math.max(0, Math.min(2000, player.position.x));
        player.position.z = Math.max(0, Math.min(2000, player.position.z));

        camera.position.set(player.position.x, 100, player.position.z - 100);
        camera.lookAt(player.position);

        checkCollisions();

        socket.send(JSON.stringify({ type: 'move', x: player.position.x, y: player.position.y, z: player.position.z }));
    }
    renderer.render(scene, camera);
    requestAnimationFrame(update);
}

function checkCollisions() {
    map.objects.forEach((obj, index) => {
        const dx = player.position.x - obj.position.x;
        const dz = player.position.z - obj.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (obj.type === 'rock' && distance < 15) {
            inventory.rocks += 1;
            document.getElementById('rocks').textContent = inventory.rocks;
            socket.send(JSON.stringify({ type: 'collect', index }));
        }
        if (obj.type === 'enemy' && distance < 17) {
            socket.send(JSON.stringify({ type: 'hitEnemy', index, damage: 1 }));
        }
    });
}

update();

// Chat
const chatInput = document.getElementById('chatInput');
const messages = document.getElementById('messages');
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.send(JSON.stringify({ type: 'chat', text: chatInput.value }));
        chatInput.value = '';
    }
});