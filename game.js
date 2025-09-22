(() => {
  console.log('[ODC] Bootstrapping…');

  class ObjectPool {
    constructor(createFn, resetFn, initialSize = 50) {
      this.createFn = createFn; this.resetFn = resetFn;
      this.pool = []; this.active = [];
      for (let i = 0; i < initialSize; i++) this.pool.push(this.createFn());
    }
    get() { let obj = this.pool.pop(); if (!obj) obj = this.createFn(); this.active.push(obj); return obj; }
    release(obj) { const idx = this.active.indexOf(obj); if (idx > -1) { this.active.splice(idx, 1); this.resetFn(obj); this.pool.push(obj); } }
    releaseAll() { while (this.active.length > 0) this.release(this.active[0]); }
  }

  class OrbitalDefenseGame {
    constructor() {
      this.canvas = document.getElementById('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.setupCanvas();

      this.gameSpeed = 1;
      this.isPaused = false;
      this.isGameOver = false;
      this.selectedUnit = null;
      this.placingUnit = null;

      this._raf = null;
      this._lastFrame = 0;

      this.projectilePool = new ObjectPool(
        () => ({ x:0, y:0, vx:0, vy:0, damage:0, color:'#fff', size:3, life:120, explosive:false, piercing:false, chainLightning:false }),
        (o) => { o.life = 120; o.explosive = o.piercing = o.chainLightning = false; }
      );
      this.particlePool = new ObjectPool(
        () => ({ x:0, y:0, vx:0, vy:0, life:30, maxLife:30, color:'#fff', size:2 }),
        (o) => { o.life = o.maxLife; }
      );

      this.wave = 1;
      this.credits = 1000;
      this.score = 0;
      this.tower = { x: 0, y: 0, maxHp: 100, hp: 100, radius: 40 };

      this.units = [];
      this.enemies = [];
      this.projectiles = [];
      this.particles = [];
      this.upgrades = { damageBoost: 0, rangeBoost: 0, fireRateBoost: 0, creditBonus: 0 };

      this.achievements = {
        firstKill:   { unlocked: false, name: "First Blood",     desc: "Destroy your first enemy" },
        wave10:      { unlocked: false, name: "Veteran",         desc: "Survive 10 waves" },
        wave25:      { unlocked: false, name: "Elite",           desc: "Survive 25 waves" },
        score10k:    { unlocked: false, name: "High Scorer",     desc: "Reach 10,000 points" },
        firstBoss:   { unlocked: false, name: "Boss Slayer",     desc: "Defeat your first boss" },
        perfectWave: { unlocked: false, name: "Perfect Defense", desc: "Complete a wave without taking damage" }
      };

      this.waveTimer = 0;
      this.waveDelay = 15000;
      this.enemiesPerWave = 8;
      this.enemySpawnDelay = 1000;
      this.lastEnemySpawn = 0;
      this.enemiesSpawned = 0;
      this.waveActive = false;
      this.waveDamage = 0;
      this.bossWave = false;

      this.unitTypes = {
        turret: { name:"PLASMA TURRET", cost:100, damage:15, range:120, fireRate:800, hp:50, color:'#00ffcc', size:20, projectileSpeed:8, unlocked:true },
        laser:  { name:"LASER CANNON",  cost:200, damage:8,  range:180, fireRate:150, hp:40, color:'#ff00ff', size:25, projectileSpeed:20, unlocked:false, unlockWave:3 },
        missile:{ name:"MISSILE SILO",  cost:350, damage:80, range:200, fireRate:2500, hp:60, color:'#ffaa00', size:30, projectileSpeed:4,  explosive:true, unlocked:false, unlockWave:5 },
        railgun:{ name:"RAILGUN",       cost:500, damage:150,range:300, fireRate:3000, hp:80, color:'#00aaff', size:35, projectileSpeed:25, piercing:true, unlocked:false, unlockWave:8 },
        tesla:  { name:"TESLA COIL",    cost:600, damage:25, range:100, fireRate:400,  hp:100,color:'#aaffff', size:28, projectileSpeed:0,  chainLightning:true, unlocked:false, unlockWave:12 }
      };

      this.enemyTypes = [
        { name:"Scout",  hp:30,  speed:1.5, damage:8,  reward:25,  color:'#ff6666', size:12 },
        { name:"Fighter",hp:60,  speed:1.2, damage:15, reward:40,  color:'#ff9966', size:16 },
        { name:"Heavy",  hp:120, speed:0.8, damage:25, reward:70,  color:'#ff66ff', size:22 },
        { name:"Elite",  hp:200, speed:1.0, damage:40, reward:120, color:'#ffff66', size:25 }
      ];

      this.mouseX = 0;
      this.mouseY = 0;

      this.setupEventListeners();
      this.loadAchievements();

      // Start immediately (no main menu)
      this.restartGame();
      this.startWave();
      this.gameLoop();

      console.log('[ODC] Game created and first wave started.');
    }

    setupCanvas() {
      const resize = () => {
        const container = document.getElementById('gameContainer');
        const sidePanel = document.getElementById('sidePanel');
        const margins = 40;
        this.canvas.width  = Math.max(200, container.offsetWidth - sidePanel.offsetWidth - margins);
        this.canvas.height = Math.max(200, container.offsetHeight - margins);
        this.tower.x = this.canvas.width / 2;
        this.tower.y = this.canvas.height / 2;
      };
      resize();
      window.addEventListener('resize', resize);
    }

    setupEventListeners() {
      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      });
      this.canvas.addEventListener('click', () => {
        if (this.placingUnit) this.placeUnit(this.mouseX, this.mouseY);
      });
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.cancelPlacement();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.cancelPlacement();
        if (e.key === ' ') { e.preventDefault(); this.togglePause(); }
      });

      // Buttons
      document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
      document.getElementById('restartBtn').addEventListener('click', () => { this.restartGame(); this.startWave(); });
      document.getElementById('saveBtn').addEventListener('click', () => this.saveGame());
      document.getElementById('loadBtn').addEventListener('click', () => this.loadGame());

      // Speed control
      document.querySelectorAll('.speed-button').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = parseInt(btn.getAttribute('data-speed'), 10);
          this.setSpeed(s);
        });
      });
    }

    restartGame() {
      this.wave = 1; this.credits = 1000; this.score = 0;
      this.tower.hp = this.tower.maxHp;

      this.units = []; this.enemies = [];
      this.projectilePool.releaseAll(); this.particlePool.releaseAll();
      this.projectiles = []; this.particles = [];

      this.upgrades = { damageBoost:0, rangeBoost:0, fireRateBoost:0, creditBonus:0 };

      this.waveTimer = 0; this.enemiesSpawned = 0; this.waveActive = false;
      this.isGameOver = false; this.isPaused = false;
      this.waveDamage = 0; this.bossWave = false;

      this.setSpeed(1);
      this.updateUI();
      this.showNotification('New mission initialized.');
      console.log('[ODC] Game reset.');
    }

    saveGame() {
      const saveData = {
        wave: this.wave, credits: this.credits, score: this.score,
        tower: { ...this.tower },
        units: this.units.map(u => ({ type: u.type, x: u.x, y: u.y, hp: u.hp })),
        upgrades: { ...this.upgrades }, timestamp: Date.now()
      };
      localStorage.setItem('orbitalDefenseSave', JSON.stringify(saveData));
      this.showNotification('Game Saved!');
    }

    loadGame() {
      const saveData = localStorage.getItem('orbitalDefenseSave');
      if (!saveData) { this.showNotification('No save found!'); return; }

      try {
        const data = JSON.parse(saveData);
        this.wave = data.wave; this.credits = data.credits; this.score = data.score;
        this.tower = { ...this.tower, hp: data.tower.hp, maxHp: data.tower.maxHp };
        this.upgrades = data.upgrades || { damageBoost:0, rangeBoost:0, fireRateBoost:0, creditBonus:0 };

        this.units = (data.units || []).map(u => {
          const unitType = this.unitTypes[u.type];
          return { ...unitType, type: u.type, x: u.x, y: u.y, hp: u.hp, maxHp: unitType.hp, lastFire: 0 };
        });

        this.enemies = []; this.projectilePool.releaseAll(); this.particlePool.releaseAll();
        this.projectiles = []; this.particles = [];
        this.waveTimer = 0; this.enemiesSpawned = 0; this.waveActive = false;
        this.isGameOver = false; this.isPaused = false; this.waveDamage = 0; this.bossWave = false;

        this.updateUI();
        this.showNotification('Game Loaded!');
        console.log('[ODC] Save loaded.');
      } catch (e) {
        console.error(e);
        this.showNotification('Save file corrupted!');
      }
    }

    togglePause() {
      if (this.isGameOver) return;
      this.isPaused = !this.isPaused;
      this.showNotification(this.isPaused ? 'Game Paused' : 'Game Resumed');
    }

    setSpeed(speed) {
      this.gameSpeed = speed;
      document.querySelectorAll('.speed-button').forEach(btn => {
        const val = parseInt(btn.getAttribute('data-speed'), 10);
        if (val === speed) btn.classList.add('active'); else btn.classList.remove('active');
      });
    }

    selectUnit(type) {
      const unitType = this.unitTypes[type];
      if (!unitType.unlocked) { this.showNotification(`Unlocks at wave ${unitType.unlockWave}`); return; }
      if (this.credits < unitType.cost) { this.showNotification('Insufficient credits!'); return; }
      this.placingUnit = type;
      document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('selected'));
      const card = document.querySelector(`[data-unit="${type}"]`);
      if (card) card.classList.add('selected');
    }

    cancelPlacement() {
      this.placingUnit = null;
      document.querySelectorAll('.unit-card').forEach(c => c.classList.remove('selected'));
    }

    placeUnit(x, y) {
      if (!this.placingUnit) return;
      const unitType = this.unitTypes[this.placingUnit];

      const distToTower = Math.hypot(x - this.tower.x, y - this.tower.y);
      if (distToTower < this.tower.radius + unitType.size + 20) { this.showNotification('Too close to tower!'); return; }

      for (let unit of this.units) {
        const d = Math.hypot(x - unit.x, y - unit.y);
        if (d < unit.size + unitType.size + 10) { this.showNotification('Too close to another unit!'); return; }
      }

      this.credits -= unitType.cost;
      this.units.push({
        ...unitType, type: this.placingUnit, x, y,
        hp: unitType.hp, maxHp: unitType.hp, lastFire: 0
      });

      this.cancelPlacement();
      this.updateUI();
      this.createParticles(x, y, unitType.color, 10);
    }

    spawnEnemy() {
      const waveMultiplier = Math.pow(1.12, this.wave - 1);
      const idx = Math.min(Math.floor(Math.random() * (1 + this.wave / 4)), this.enemyTypes.length - 1);
      const base = this.enemyTypes[idx];

      const edge = Math.random() * 4;
      let x, y;
      if (edge < 1) { x = Math.random() * this.canvas.width; y = 0; }
      else if (edge < 2) { x = this.canvas.width; y = Math.random() * this.canvas.height; }
      else if (edge < 3) { x = Math.random() * this.canvas.width; y = this.canvas.height; }
      else { x = 0; y = Math.random() * this.canvas.height; }

      this.enemies.push({
        x, y,
        hp: Math.floor(base.hp * waveMultiplier),
        maxHp: Math.floor(base.hp * waveMultiplier),
        speed: base.speed * (1 + this.wave * 0.015),
        damage: Math.floor(base.damage * waveMultiplier),
        reward: Math.floor(base.reward * (1 + this.upgrades.creditBonus * 0.1)),
        color: base.color, size: base.size, type: base.name
      });
    }

    spawnBoss() {
      const bossMultiplier = Math.pow(1.3, Math.floor(this.wave / 10));
      const x = this.canvas.width / 2, y = 0;
      this.enemies.push({
        x, y, hp: Math.floor(1000 * bossMultiplier), maxHp: Math.floor(1000 * bossMultiplier),
        speed: 0.5, damage: Math.floor(100 * bossMultiplier), reward: Math.floor(500 * bossMultiplier),
        color: '#ff0000', size: 50, type: 'Boss', isBoss: true
      });
      this.showBossWarning();
    }

    showBossWarning() {
      const warning = document.createElement('div');
      warning.className = 'boss-warning';
      warning.textContent = 'BOSS INCOMING!';
      document.body.appendChild(warning);
      setTimeout(() => document.body.removeChild(warning), 3000);
    }

    startWave() {
      this.waveActive = true;
      this.enemiesSpawned = 0;
      this.lastEnemySpawn = 0;
      this.waveDamage = 0;

      Object.keys(this.unitTypes).forEach(type => {
        const unit = this.unitTypes[type];
        if (unit.unlockWave && this.wave >= unit.unlockWave && !unit.unlocked) {
          unit.unlocked = true;
          this.showNotification(`${unit.name} unlocked!`);
        }
      });

      this.bossWave = (this.wave % 10 === 0);
      if (this.bossWave) {
        this.enemiesPerWave = 1;
        this.spawnBoss();
        this.enemiesSpawned = 1;
      } else {
        this.enemiesPerWave = Math.floor(8 + this.wave * 1.5);
        this.spawnEnemy(); // ensure action quickly on new wave
        this.enemiesSpawned++;
      }

      this.updateUI();
      console.log(`[ODC] Wave ${this.wave} started. enemiesPerWave=${this.enemiesPerWave}`);
    }

    endWave() {
      this.waveActive = false;
      this.waveTimer = 0;
      this.wave++;

      const bonus = Math.floor(50 + this.wave * 10);
      this.credits += bonus;
      this.score += bonus * 2;

      if (this.waveDamage === 0 && this.wave > 1) this.unlockAchievement('perfectWave');
      if (this.wave === 10) this.unlockAchievement('wave10');
      if (this.wave === 25) this.unlockAchievement('wave25');

      this.showNotification(`Wave ${this.wave - 1} Complete! +${bonus} credits`);
      this.updateUI();
    }

    updateGame(delta) {
      if (this.isPaused || this.isGameOver) return;
      const dt = delta * this.gameSpeed;

      if (!this.waveActive) {
        this.waveTimer += dt;
        if (this.waveTimer >= this.waveDelay) this.startWave();
      } else {
        if (!this.bossWave && this.enemiesSpawned < this.enemiesPerWave) {
          this.lastEnemySpawn += dt;
          if (this.lastEnemySpawn >= this.enemySpawnDelay) {
            this.spawnEnemy();
            this.enemiesSpawned++;
            this.lastEnemySpawn = 0;
          }
        }
        if (this.enemiesSpawned >= this.enemiesPerWave && this.enemies.length === 0) {
          this.endWave();
        }
      }

      // Move enemies
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        const dx = this.tower.x - enemy.x;
        const dy = this.tower.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > this.tower.radius + enemy.size) {
          enemy.x += (dx / dist) * enemy.speed * (dt / 16);
          enemy.y += (dy / dist) * enemy.speed * (dt / 16);
        } else {
          this.tower.hp -= enemy.damage;
          this.waveDamage += enemy.damage;
          this.createParticles(enemy.x, enemy.y, '#ff0000', 20);
          this.enemies.splice(i, 1);
          if (this.tower.hp <= 0) this.gameOver();
        }
      }

      // Units fire
      for (let unit of this.units) {
        unit.lastFire += dt;
        const effectiveFireRate = unit.fireRate * (1 - this.upgrades.fireRateBoost * 0.1);
        const effectiveRange = unit.range * (1 + this.upgrades.rangeBoost * 0.1);

        if (unit.lastFire >= effectiveFireRate) {
          let target = null;
          let minDist = effectiveRange;
          for (let enemy of this.enemies) {
            const d = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
            if (d < minDist) { target = enemy; minDist = d; }
          }
          if (target) { this.fireProjectile(unit, target); unit.lastFire = 0; }
        }
      }

      // Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.life--;
        if (p.life <= 0) { this.projectilePool.release(p); this.projectiles.splice(i, 1); continue; }

        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < e.size + p.size) {
            if (p.explosive) {
              this.handleExplosion(p.x, p.y, p.damage);
              this.projectilePool.release(p);
              this.projectiles.splice(i, 1);
            } else if (p.piercing) {
              this.damageEnemy(e, p.damage);
            } else if (p.chainLightning) {
              this.handleChainLightning(e, p.damage, 3);
              this.projectilePool.release(p);
              this.projectiles.splice(i, 1);
            } else {
              this.damageEnemy(e, p.damage);
              this.projectilePool.release(p);
              this.projectiles.splice(i, 1);
            }
            break;
          }
        }
      }

      // Particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const part = this.particles[i];
        part.x += part.vx * (dt / 16);
        part.y += part.vy * (dt / 16);
        part.life--;
        if (part.life <= 0) { this.particlePool.release(part); this.particles.splice(i, 1); }
      }

      this.updateUI();
    }

    fireProjectile(unit, target) {
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      const dist = Math.hypot(dx, dy) || 1;

      const proj = this.projectilePool.get();
      proj.x = unit.x; proj.y = unit.y;
      proj.vx = (dx / dist) * (unit.projectileSpeed || 16);
      proj.vy = (dy / dist) * (unit.projectileSpeed || 16);
      proj.damage = Math.round(unit.damage * (1 + this.upgrades.damageBoost * 0.1));
      proj.color = unit.color;
      proj.size = unit.name.includes('MISSILE') ? 6 : 3;
      proj.explosive = !!unit.explosive;
      proj.piercing = !!unit.piercing;
      proj.chainLightning = !!unit.chainLightning;
      proj.life = 120;

      this.projectiles.push(proj);
    }

    damageEnemy(enemy, damage) {
      enemy.hp -= damage;
      this.createParticles(enemy.x, enemy.y, enemy.color, 5);
      if (enemy.hp <= 0) {
        this.credits += enemy.reward;
        this.score += enemy.reward * 2;
        if (this.score >= 10000) this.unlockAchievement('score10k');
        if (enemy.isBoss) this.unlockAchievement('firstBoss');
        if (!this.achievements.firstKill.unlocked) this.unlockAchievement('firstKill');
        this.createParticles(enemy.x, enemy.y, '#ffaa00', 15);
        const idx = this.enemies.indexOf(enemy);
        if (idx > -1) this.enemies.splice(idx, 1);
      }
    }

    handleExplosion(x, y, damage) {
      this.createParticles(x, y, '#ffaa00', 25);
      for (let enemy of this.enemies) {
        const d = Math.hypot(enemy.x - x, enemy.y - y);
        if (d < 80) {
          const explosionDamage = Math.max(1, Math.round(damage * (1 - d / 80)));
          this.damageEnemy(enemy, explosionDamage);
        }
      }
    }

    handleChainLightning(startEnemy, damage, chains) {
      this.damageEnemy(startEnemy, damage);
      if (chains <= 0) return;

      let closest = null;
      let minDist = 150;
      for (let enemy of this.enemies) {
        if (enemy !== startEnemy) {
          const d = Math.hypot(enemy.x - startEnemy.x, enemy.y - startEnemy.y);
          if (d < minDist) { closest = enemy; minDist = d; }
        }
      }
      if (closest) setTimeout(() => this.handleChainLightning(closest, Math.round(damage * 0.7), chains - 1), 100);
    }

    createParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const p = this.particlePool.get();
        p.x = x; p.y = y;
        p.vx = (Math.random() - 0.5) * 8;
        p.vy = (Math.random() - 0.5) * 8;
        p.color = color;
        p.size = Math.random() * 4 + 1;
        p.life = Math.floor(Math.random() * 30 + 20);
        p.maxLife = p.life;
        this.particles.push(p);
      }
    }

    gameOver() {
      this.isGameOver = true; this.isPaused = true;
      this.showNotification('MISSION FAILED! Press RESTART to try again.');
    }

    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 100; i++) {
        const x = (i * 137.5) % this.canvas.width;
        const y = (i * 317.3) % this.canvas.height;
        ctx.fillRect(x, y, 1, 1);
      }

      // Tower
      ctx.fillStyle = this.tower.hp > 50 ? '#00ffcc' : '#ff6666';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.tower.x, this.tower.y, this.tower.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tower HP bar
      const hpPct = Math.max(0, this.tower.hp) / this.tower.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(this.tower.x - 40, this.tower.y - 60, 80, 8);
      ctx.fillStyle = hpPct > 0.5 ? '#00ff00' : hpPct > 0.25 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(this.tower.x - 40, this.tower.y - 60, 80 * hpPct, 8);

      // Units
      for (let unit of this.units) {
        ctx.fillStyle = unit.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        if (unit.name.includes('TURRET')) {
          ctx.fillRect(unit.x - unit.size/2, unit.y - unit.size/2, unit.size, unit.size);
          ctx.strokeRect(unit.x - unit.size/2, unit.y - unit.size/2, unit.size, unit.size);
        } else {
          ctx.beginPath();
          ctx.arc(unit.x, unit.y, unit.size/2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        const pct = unit.hp / unit.maxHp;
        if (pct < 1) {
          ctx.fillStyle = '#333';
          ctx.fillRect(unit.x - 15, unit.y - unit.size/2 - 8, 30, 4);
          ctx.fillStyle = pct > 0.5 ? '#00ff00' : pct > 0.25 ? '#ffaa00' : '#ff0000';
          ctx.fillRect(unit.x - 15, unit.y - unit.size/2 - 8, 30 * pct, 4);
        }

        if (this.placingUnit === unit.type || unit === this.selectedUnit) {
          ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(unit.x, unit.y, unit.range * (1 + this.upgrades.rangeBoost * 0.1), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Enemies
      for (let enemy of this.enemies) {
        ctx.fillStyle = enemy.color;
        ctx.strokeStyle = enemy.isBoss ? '#ffffff' : '#333';
        ctx.lineWidth = enemy.isBoss ? 3 : 1;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const epct = enemy.hp / enemy.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size - 8, enemy.size * 2, 4);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size - 8, enemy.size * 2 * epct, 4);

        if (enemy.isBoss) {
          ctx.fillStyle = '#ffaa00';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('BOSS', enemy.x, enemy.y - enemy.size - 15);
        }
      }

      // Projectiles
      for (let proj of this.projectiles) {
        ctx.fillStyle = proj.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Particles
      for (let particle of this.particles) {
        const alpha = particle.life / particle.maxLife;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Unit placement preview
      if (this.placingUnit) {
        const unitType = this.unitTypes[this.placingUnit];
        ctx.fillStyle = 'rgba(0, 255, 204, 0.5)';
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.mouseX, this.mouseY, unitType.size/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.mouseX, this.mouseY, unitType.range, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Game over overlay
      if (this.isGameOver) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', this.canvas.width/2, this.canvas.height/2);
        ctx.font = '24px Arial';
        ctx.fillText('Press RESTART to try again', this.canvas.width/2, this.canvas.height/2 + 60);
      }
    }

    updateUI() {
      document.getElementById('waveCount').textContent = this.wave;
      document.getElementById('credits').textContent = this.credits.toLocaleString();
      document.getElementById('score').textContent = this.score.toLocaleString();
      document.getElementById('towerHp').textContent = `${Math.max(0, Math.round(this.tower.hp))}/${this.tower.maxHp}`;

      const timer = document.getElementById('waveTimer');
      if (!this.waveActive && !this.isGameOver) {
        const remaining = Math.max(0, Math.ceil((this.waveDelay - this.waveTimer) / 1000));
        timer.textContent = `Next wave in: ${remaining}s`;
        timer.style.display = 'block';
      } else {
        timer.style.display = 'none';
      }

      this.updateUnitSelection();
      this.updateUpgrades();
      this.updateWaveInfo();
      this.updateAchievements();
    }

    updateUnitSelection() {
      const container = document.getElementById('unitSelection');
      container.innerHTML = '';
      Object.keys(this.unitTypes).forEach(type => {
        const unit = this.unitTypes[type];
        const canAfford = this.credits >= unit.cost;

        const card = document.createElement('div');
        card.className = `unit-card ${(!unit.unlocked || !canAfford) ? 'disabled' : ''}`;
        card.setAttribute('data-unit', type);
        card.addEventListener('click', () => this.selectUnit(type));

        card.innerHTML = `
          <div class="unit-name">${unit.name}</div>
          <div class="unit-stats">
            Damage: ${unit.damage} | Range: ${unit.range}<br>
            Fire Rate: ${(1000/unit.fireRate).toFixed(1)}/s | HP: ${unit.hp}
          </div>
          <div class="unit-cost">Cost: ${unit.cost} credits</div>
          ${!unit.unlocked ? `<div style="color:#ffaa00; font-size:12px;">Unlocks Wave ${unit.unlockWave}</div>` : ''}
        `;
        container.appendChild(card);
      });
    }

    updateUpgrades() {
      const container = document.getElementById('upgradesSection');
      const defs = [
        { key: 'damageBoost',   name: 'Damage Boost',   cost: 200, max: 10, desc:'+10% damage / level' },
        { key: 'rangeBoost',    name: 'Range Boost',    cost: 150, max: 10, desc:'+10% range / level' },
        { key: 'fireRateBoost', name:'Fire Rate Boost', cost: 250, max: 10, desc:'+10% fire rate / level' },
        { key: 'creditBonus',   name: 'Credit Bonus',   cost: 300, max: 5,  desc:'+10% rewards / level' }
      ];
      container.innerHTML = '';
      defs.forEach(up => {
        const level = this.upgrades[up.key] || 0;
        const cost = up.cost * (level + 1);
        const canAfford = this.credits >= cost && level < up.max;

        const card = document.createElement('div');
        card.className = `unit-card ${!canAfford ? 'disabled' : ''}`;
        const btn = document.createElement('button');
        btn.className = 'upgrade-button';
        btn.textContent = 'UPGRADE';
        btn.disabled = !canAfford;
        btn.addEventListener('click', () => this.purchaseUpgrade(up.key));

        card.innerHTML = `
          <div class="unit-name">${up.name}</div>
          <div class="unit-stats">Level: ${level}/${up.max} &nbsp; <span style="color:#8899aa">${up.desc}</span></div>
          <div class="unit-cost">Cost: ${cost} credits</div>
        `;
        card.appendChild(btn);
        container.appendChild(card);
      });
    }

    purchaseUpgrade(key) {
      const table = { damageBoost:{cost:200,max:10}, rangeBoost:{cost:150,max:10}, fireRateBoost:{cost:250,max:10}, creditBonus:{cost:300,max:5} };
      const def = table[key]; if (!def) return;
      const level = this.upgrades[key] || 0;
      if (level >= def.max) return;
      const cost = def.cost * (level + 1);
      if (this.credits < cost) { this.showNotification('Insufficient credits!'); return; }
      this.credits -= cost;
      this.upgrades[key] = level + 1;
      this.updateUI();
    }

    updateWaveInfo() {
      const container = document.getElementById('waveInfo');
      const nextWave = this.wave + (this.waveActive ? 0 : 1);
      const isBoss = nextWave % 10 === 0;
      const hpScale = Math.floor((Math.pow(1.12, nextWave - 1) - 1) * 100);
      const dmgScale = hpScale;
      const spdScale = Math.floor(nextWave * 1.5);

      container.innerHTML = `
        <div style="margin-bottom: 15px;">
          <strong>Wave ${nextWave}</strong><br>
          ${isBoss ? '<span style="color:#ff0000;font-weight:bold;">BOSS WAVE</span>' : `Enemies: ${Math.floor(8 + nextWave * 1.5)}`}
        </div>
        <div style="font-size: 14px; color: #8899aa; line-height:1.6;">
          Enemy HP: +${hpScale}%<br>
          Enemy Speed: +${spdScale}%<br>
          Enemy Damage: +${dmgScale}%<br>
          Rewards Bonus: +${Math.floor(this.upgrades.creditBonus * 10)}%
        </div>
      `;
    }

    updateAchievements() {
      const el = document.getElementById('achievementsSection');
      el.innerHTML = '';
      Object.keys(this.achievements).forEach(key => {
        const a = this.achievements[key];
        const row = document.createElement('div');
        row.className = 'high-score-item';
        row.style.opacity = a.unlocked ? '1' : '0.5';
        row.innerHTML = `<span>${a.name}</span><span>${a.unlocked ? '✓' : '—'}</span>`;
        el.appendChild(row);
      });
    }

    unlockAchievement(key) {
      const a = this.achievements[key];
      if (!a || a.unlocked) return;
      a.unlocked = true;
      this.saveAchievements();
      const toast = document.createElement('div');
      toast.className = 'achievement';
      toast.textContent = `Achievement Unlocked: ${a.name}`;
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 3000);
    }

    loadAchievements() {
      try {
        const raw = localStorage.getItem('orbitalDefenseAchievements');
        if (!raw) return;
        const saved = JSON.parse(raw);
        Object.keys(this.achievements).forEach(k => {
          if (saved[k] && saved[k].unlocked) this.achievements[k].unlocked = true;
        });
      } catch {}
    }
    saveAchievements() { try { localStorage.setItem('orbitalDefenseAchievements', JSON.stringify(this.achievements)); } catch {} }

    showNotification(message, duration = 2500) {
      const n = document.createElement('div');
      n.className = 'notification';
      n.innerHTML = `<strong>Command:</strong> ${message}`;
      document.body.appendChild(n);
      setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, duration);
    }

    gameLoop() {
      const step = (ts) => {
        if (!this._lastFrame) this._lastFrame = ts;
        const delta = Math.min(64, ts - this._lastFrame);
        this._lastFrame = ts;

        this.updateGame(delta);
        this.render();

        this._raf = requestAnimationFrame(step);
      };
      if (this._raf) cancelAnimationFrame(this._raf);
      this._lastFrame = 0;
      this._raf = requestAnimationFrame(step);
    }
  }

  // Start the game once the document is ready (works with <script defer>)
  const start = () => new OrbitalDefenseGame();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
