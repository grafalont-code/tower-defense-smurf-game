// Game Configuration
const CONFIG = {
    CANVAS_WIDTH: 1000,
    CANVAS_HEIGHT: 600,
    GRID_SIZE: 50,
    BASE_WAVE_ENEMIES: 5,
    WAVE_MULTIPLIER: 1.3,
    MAX_WAVES: 10,
    INITIAL_GOLD: 500,
    INITIAL_LIVES: 20
};

const TOWER_TYPES = {
    basic: {
        cost: 50,
        damage: 10,
        fireRate: 1,
        range: 120,
        color: '#3498db',
        name: 'Basic'
    },
    sniper: {
        cost: 100,
        damage: 25,
        fireRate: 0.5,
        range: 200,
        color: '#e74c3c',
        name: 'Sniper'
    },
    flame: {
        cost: 75,
        damage: 15,
        fireRate: 1.5,
        range: 100,
        color: '#f39c12',
        name: 'Flame'
    },
    ice: {
        cost: 120,
        damage: 8,
        fireRate: 1,
        range: 140,
        color: '#3498db',
        name: 'Ice',
        slowEffect: 0.5
    }
};

// Game State
let gameState = {
    gold: CONFIG.INITIAL_GOLD,
    lives: CONFIG.INITIAL_LIVES,
    wave: 1,
    kills: 0,
    totalGoldEarned: CONFIG.INITIAL_GOLD,
    waveActive: false,
    gameOver: false,
    victory: false,
    upgrades: {
        fireRate: 1,
        damage: 1
    }
};

let towers = [];
let enemies = [];
let projectiles = [];
let path = [];
let selectedTowerType = null;
let gameCanvas, gameCtx;

// Path Definition (S-curve)
function createPath() {
    path = [];
    // Top left to right
    for (let x = 50; x <= 300; x += 10) {
        path.push({ x: x, y: 100 });
    }
    // Right turn down
    for (let y = 100; y <= 300; y += 10) {
        path.push({ x: 300, y: y });
    }
    // Bottom right to left
    for (let x = 300; x <= 600; x += 10) {
        path.push({ x: x, y: 300 });
    }
    // Left turn up
    for (let y = 300; y >= 100; y -= 10) {
        path.push({ x: 600, y: y });
    }
    // Top right to exit
    for (let x = 600; x <= 900; x += 10) {
        path.push({ x: x, y: 100 });
    }
}

// Initialize Canvas
function initCanvas() {
    gameCanvas = document.getElementById('gameCanvas');
    gameCtx = gameCanvas.getContext('2d');
    gameCanvas.addEventListener('click', handleCanvasClick);
}

// Handle tower placement
function handleCanvasClick(e) {
    if (!selectedTowerType || gameState.waveActive) return;

    const rect = gameCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const towerConfig = TOWER_TYPES[selectedTowerType];
    if (gameState.gold >= towerConfig.cost && !isPathBlocked(x, y)) {
        const tower = {
            x: x,
            y: y,
            type: selectedTowerType,
            ...towerConfig,
            lastShot: 0,
            kills: 0
        };
        towers.push(tower);
        gameState.gold -= towerConfig.cost;
        updateUI();
    }
}

function isPathBlocked(x, y) {
    return path.some(p => Math.hypot(p.x - x, p.y - y) < 40);
}

// Enemy (Smurf) Class
class SmurfEnemy {
    constructor(pathData) {
        this.pathData = pathData;
        this.pathIndex = 0;
        this.x = pathData[0].x;
        this.y = pathData[0].y;
        this.radius = 8;
        this.maxHealth = 30;
        this.health = 30;
        this.speed = 1;
        this.slowDuration = 0;
        this.slowFactor = 1;
    }

    update() {
        if (this.slowDuration > 0) {
            this.slowDuration--;
            this.slowFactor = 0.5;
        } else {
            this.slowFactor = 1;
        }

        const moveDistance = this.speed * this.slowFactor;
        const targetIndex = Math.min(
            this.pathIndex + moveDistance / 10,
            this.pathData.length - 1
        );

        this.pathIndex = targetIndex;
        if (this.pathIndex >= this.pathData.length - 1) {
            return true; // Reached end
        }

        const pathPoint = this.pathData[Math.floor(this.pathIndex)];
        this.x = pathPoint.x;
        this.y = pathPoint.y;

        return false;
    }

    draw(ctx) {
        // Body (blue)
        ctx.fillStyle = '#3498db';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (white)
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(this.x - 4, this.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + 4, this.y - 2, 2, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (black)
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x - 4, this.y - 2, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(this.x + 4, this.y - 2, 1, 0, Math.PI * 2);
        ctx.fill();

        // Red pants
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 8, this.radius - 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Health bar
        if (this.health < this.maxHealth) {
            const barWidth = 16;
            const barHeight = 3;
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 8, barWidth, barHeight);
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(this.x - barWidth / 2, this.y - this.radius - 8, (barWidth * this.health) / this.maxHealth, barHeight);
        }
    }
}

// Tower Logic
function updateTowers() {
    towers.forEach(tower => {
        // Find enemies in range
        const targetsInRange = enemies.filter(e =>
            Math.hypot(e.x - tower.x, e.y - tower.y) <= tower.range
        );

        if (targetsInRange.length > 0) {
            tower.lastShot++;
            const fireRateAdjusted = tower.fireRate * gameState.upgrades.fireRate;
            if (tower.lastShot >= 60 / fireRateAdjusted) {
                const target = targetsInRange[0];
                const projectile = {
                    x: tower.x,
                    y: tower.y,
                    targetX: target.x,
                    targetY: target.y,
                    damage: tower.damage * gameState.upgrades.damage,
                    speed: 5,
                    tower: tower,
                    target: target
                };
                projectiles.push(projectile);
                tower.lastShot = 0;
            }
        }
    });
}

// Projectile Logic
function updateProjectiles() {
    projectiles = projectiles.filter(p => {
        p.x += (p.targetX - p.x) / 10;
        p.y += (p.targetY - p.y) / 10;

        const distToTarget = Math.hypot(p.x - p.targetX, p.y - p.targetY);
        if (distToTarget < 10) {
            p.target.health -= p.damage;
            if (p.tower.type === 'ice') {
                p.target.slowDuration = 300;
            }

            if (p.target.health <= 0) {
                enemies = enemies.filter(e => e !== p.target);
                gameState.kills++;
                gameState.gold += 10 + gameState.wave * 2;
                gameState.totalGoldEarned += 10 + gameState.wave * 2;
                p.tower.kills++;
                updateUI();
            }
            return false;
        }
        return true;
    });
}

// Enemy Logic
function updateEnemies() {
    enemies = enemies.filter(enemy => {
        const finished = enemy.update();
        if (finished) {
            gameState.lives--;
            updateUI();
            if (gameState.lives <= 0) {
                endGame();
            }
            return false;
        }
        return true;
    });
}

// Drawing Functions
function drawPath() {
    gameCtx.strokeStyle = '#a0a0a0';
    gameCtx.lineWidth = 3;
    gameCtx.beginPath();
    gameCtx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        gameCtx.lineTo(path[i].x, path[i].y);
    }
    gameCtx.stroke();
}

function drawGame() {
    // Clear canvas
    gameCtx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

    // Draw path
    drawPath();

    // Draw towers
    towers.forEach(tower => {
        // Draw range circle (debug)
        gameCtx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
        gameCtx.beginPath();
        gameCtx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2);
        gameCtx.stroke();

        // Draw tower base
        gameCtx.fillStyle = tower.color;
        gameCtx.beginPath();
        gameCtx.arc(tower.x, tower.y, 12, 0, Math.PI * 2);
        gameCtx.fill();

        // Draw tower top
        gameCtx.fillStyle = '#2c3e50';
        gameCtx.beginPath();
        gameCtx.arc(tower.x, tower.y, 8, 0, Math.PI * 2);
        gameCtx.fill();

        // Draw kills counter
        if (tower.kills > 0) {
            gameCtx.fillStyle = '#f39c12';
            gameCtx.font = 'bold 10px Arial';
            gameCtx.textAlign = 'center';
            gameCtx.fillText(tower.kills, tower.x, tower.y + 20);
        }
    });

    // Draw projectiles
    projectiles.forEach(projectile => {
        gameCtx.fillStyle = '#f39c12';
        gameCtx.beginPath();
        gameCtx.arc(projectile.x, projectile.y, 4, 0, Math.PI * 2);
        gameCtx.fill();
    });

    // Draw enemies (Smurfs)
    enemies.forEach(enemy => {
        enemy.draw(gameCtx);
    });
}

// Wave Management
function startWave() {
    if (gameState.waveActive || gameState.gameOver || gameState.victory) return;

    gameState.waveActive = true;
    const enemyCount = Math.floor(
        CONFIG.BASE_WAVE_ENEMIES + gameState.wave * CONFIG.WAVE_MULTIPLIER
    );

    let spawnCount = 0;
    const spawnInterval = setInterval(() => {
        if (spawnCount >= enemyCount) {
            clearInterval(spawnInterval);
            return;
        }
        enemies.push(new SmurfEnemy(path));
        spawnCount++;
    }, 400);

    // End wave when all enemies are defeated
    const waveCheckInterval = setInterval(() => {
        if (enemies.length === 0 && gameState.waveActive) {
            clearInterval(waveCheckInterval);
            gameState.waveActive = false;
            gameState.wave++;

            if (gameState.wave > CONFIG.MAX_WAVES) {
                gameState.victory = true;
                victoryScreen();
            }
            updateUI();
        }
    }, 100);
}

// UI Updates
function updateUI() {
    document.getElementById('gold').textContent = Math.floor(gameState.gold);
    document.getElementById('lives').textContent = gameState.lives;
    document.getElementById('wave').textContent = gameState.wave;
    document.getElementById('kills').textContent = gameState.kills;

    // Update tower buttons
    document.querySelectorAll('.tower-btn').forEach(btn => {
        const type = btn.dataset.type;
        const cost = TOWER_TYPES[type].cost;
        btn.disabled = gameState.gold < cost || gameState.waveActive;
    });

    // Update upgrade buttons
    document.getElementById('upgradeSpeed').disabled =
        gameState.gold < 150 || gameState.waveActive;
    document.getElementById('upgradeDamage').disabled =
        gameState.gold < 150 || gameState.waveActive;

    // Update start wave button
    document.getElementById('startWave').disabled =
        gameState.waveActive || gameState.gameOver || gameState.victory;
    document.getElementById('startWave').textContent = gameState.waveActive
        ? `Wave ${gameState.wave} Active...`
        : `Start Wave ${gameState.wave}`;

    // Update upgrade levels
    document.getElementById('speedLevel').textContent = gameState.upgrades.fireRate;
    document.getElementById('damageLevel').textContent = gameState.upgrades.damage;
}

// Event Listeners
function setupEventListeners() {
    // Tower selection
    document.querySelectorAll('.tower-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tower-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedTowerType = btn.dataset.type;
        });
    });

    // Upgrades
    document.getElementById('upgradeSpeed').addEventListener('click', () => {
        if (gameState.gold >= 150) {
            gameState.gold -= 150;
            gameState.upgrades.fireRate += 0.3;
            updateUI();
        }
    });

    document.getElementById('upgradeDamage').addEventListener('click', () => {
        if (gameState.gold >= 150) {
            gameState.gold -= 150;
            gameState.upgrades.damage += 0.5;
            updateUI();
        }
    });

    // Start wave
    document.getElementById('startWave').addEventListener('click', startWave);

    // Restart buttons
    document.getElementById('restartBtn').addEventListener('click', restartGame);
    document.getElementById('restartVictoryBtn').addEventListener('click', restartGame);
}

// Game Over
function endGame() {
    gameState.gameOver = true;
    document.getElementById('gameOverTitle').textContent = 'Game Over!';
    document.getElementById('finalWave').textContent = gameState.wave;
    document.getElementById('finalKills').textContent = gameState.kills;
    document.getElementById('finalGold').textContent = Math.floor(gameState.totalGoldEarned);
    document.getElementById('gameOverScreen').classList.remove('hidden');
}

// Victory Screen
function victoryScreen() {
    document.getElementById('victoryKills').textContent = gameState.kills;
    document.getElementById('victoryGold').textContent = Math.floor(gameState.totalGoldEarned);
    document.getElementById('victoryScreen').classList.remove('hidden');
}

// Restart Game
function restartGame() {
    gameState = {
        gold: CONFIG.INITIAL_GOLD,
        lives: CONFIG.INITIAL_LIVES,
        wave: 1,
        kills: 0,
        totalGoldEarned: CONFIG.INITIAL_GOLD,
        waveActive: false,
        gameOver: false,
        victory: false,
        upgrades: {
            fireRate: 1,
            damage: 1
        }
    };
    towers = [];
    enemies = [];
    projectiles = [];
    selectedTowerType = null;
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('victoryScreen').classList.add('hidden');
    document.querySelectorAll('.tower-btn').forEach(btn => btn.classList.remove('selected'));
    updateUI();
}

// Main Game Loop
function gameLoop() {
    if (!gameState.gameOver && !gameState.victory) {
        updateTowers();
        updateProjectiles();
        updateEnemies();
        drawGame();
    }
    requestAnimationFrame(gameLoop);
}

// Initialize Game
function init() {
    initCanvas();
    createPath();
    setupEventListeners();
    updateUI();
    gameLoop();
}

// Start the game when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
