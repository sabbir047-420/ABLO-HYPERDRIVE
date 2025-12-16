import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Player, Enemy, Particle, Orb, Projectile, FloatingText, Vector } from '../types';
import { COLORS, GAME_CONFIG, STORAGE_KEY_HIGHSCORE } from '../constants';
import { Play, RotateCcw, Crosshair, Zap, Shield, Trophy } from 'lucide-react';
import { Button } from './Button';

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [currentScore, setCurrentScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [healthPercent, setHealthPercent] = useState(100);

  // --- Game State Refs ---
  // Using refs for everything in the loop for performance
  const playerRef = useRef<Player>({
    id: 'player',
    x: 0, y: 0,
    radius: 15,
    color: COLORS.player,
    velocity: { x: 0, y: 0 },
    speed: 0.8,
    hp: 100,
    maxHp: 100,
    score: 0,
    weaponLevel: 1,
    weaponTimer: 0,
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const orbsRef = useRef<Orb[]>([]);
  const textsRef = useRef<FloatingText[]>([]);
  
  const mouseRef = useRef<Vector>({ x: 0, y: 0 });
  const shakeRef = useRef(0);
  const frameRef = useRef(0);
  const requestRef = useRef<number>();

  // --- Utils ---
  const generateId = () => Math.random().toString(36).substr(2, 9);
  const getDistance = (e1: { x: number; y: number }, e2: { x: number; y: number }) => Math.hypot(e1.x - e2.x, e1.y - e2.y);
  
  // Haptic feedback helper
  const vibrate = (ms: number) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const addShake = (amount: number, vibrationMs: number = 0) => {
    shakeRef.current = Math.min(shakeRef.current + amount, 30);
    if (vibrationMs > 0) vibrate(vibrationMs);
  };

  const spawnText = (x: number, y: number, text: string, color: string, size: number = 16) => {
    textsRef.current.push({
      id: generateId(),
      x, y,
      text,
      color,
      life: 1.0,
      velocity: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() },
      size
    });
  };

  const createExplosion = (x: number, y: number, color: string, count: number, speed: number = 5) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = Math.random() * speed;
      particlesRef.current.push({
        id: generateId(),
        x, y,
        radius: Math.random() * 3 + 1,
        color: color,
        velocity: {
          x: Math.cos(angle) * v,
          y: Math.sin(angle) * v
        },
        life: 1.0,
        maxLife: 1.0,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.03
      });
    }
  };

  // --- Core Mechanics ---

  const spawnEnemy = (w: number, h: number, difficulty: number) => {
    // Spawn mostly outside screen
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    const padding = 60;
    
    switch (edge) {
      case 0: x = Math.random() * w; y = -padding; break;
      case 1: x = w + padding; y = Math.random() * h; break;
      case 2: x = Math.random() * w; y = h + padding; break;
      case 3: x = -padding; y = Math.random() * h; break;
    }

    const roll = Math.random();
    let type: Enemy['type'] = 'CHASER';
    let hp = 20;
    let radius = 18;
    let speed = 2 + difficulty * 0.1;
    let color = COLORS.enemyChaser;
    
    // Enemy Types
    if (roll > 0.85) {
      type = 'TANK';
      hp = 80 + difficulty * 5;
      radius = 28;
      speed = 1.0;
      color = COLORS.enemyTank;
    } else if (roll > 0.6) {
      type = 'SWARMER';
      hp = 10;
      radius = 12;
      speed = 3.5 + difficulty * 0.2;
      color = COLORS.enemySwarmer;
    }

    enemiesRef.current.push({
      id: generateId(),
      x, y, radius, color, type, hp, maxHp: hp, speed,
      damage: 10,
      velocity: { x: 0, y: 0 },
      angle: 0
    });
  };

  const fireWeapon = () => {
    const p = playerRef.current;
    if (p.weaponTimer > 0) {
      p.weaponTimer--;
      return;
    }

    // Auto-aim logic: Find nearest enemy
    let target: Enemy | null = null;
    let minDist = 600; // Range

    for (const enemy of enemiesRef.current) {
      const d = getDistance(p, enemy);
      if (d < minDist) {
        minDist = d;
        target = enemy;
      }
    }

    if (target) {
      const angle = Math.atan2(target.y - p.y, target.x - p.x);
      // Fire!
      projectilesRef.current.push({
        id: generateId(),
        x: p.x + Math.cos(angle) * p.radius,
        y: p.y + Math.sin(angle) * p.radius,
        radius: 4,
        color: COLORS.projectile,
        velocity: {
          x: Math.cos(angle) * 15,
          y: Math.sin(angle) * 15
        },
        damage: 10 + (p.weaponLevel * 2), // Damage scales with level
        fromPlayer: true
      });
      
      // Knockback player slightly
      p.velocity.x -= Math.cos(angle) * 1;
      p.velocity.y -= Math.sin(angle) * 1;
      
      p.weaponTimer = Math.max(5, GAME_CONFIG.playerFireRate - p.weaponLevel);
    }
  };

  // --- Main Update Loop ---
  const update = (w: number, h: number) => {
    frameRef.current++;
    const difficulty = Math.floor(playerRef.current.score / 100);
    const p = playerRef.current;

    // 1. Player Movement (Mouse Follow with Lerp)
    const dx = mouseRef.current.x - p.x;
    const dy = mouseRef.current.y - p.y;
    // Apply force based on distance, but cap it
    p.velocity.x += dx * 0.005 * p.speed;
    p.velocity.y += dy * 0.005 * p.speed;
    
    // Friction
    p.velocity.x *= GAME_CONFIG.friction;
    p.velocity.y *= GAME_CONFIG.friction;
    
    p.x += p.velocity.x;
    p.y += p.velocity.y;

    // Bound Player
    if (p.x < p.radius) p.x = p.radius;
    if (p.x > w - p.radius) p.x = w - p.radius;
    if (p.y < p.radius) p.y = p.radius;
    if (p.y > h - p.radius) p.y = h - p.radius;

    // 2. Weapon
    fireWeapon();

    // 3. Projectiles
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const proj = projectilesRef.current[i];
      proj.x += proj.velocity.x;
      proj.y += proj.velocity.y;

      // Remove if off screen
      if (proj.x < -50 || proj.x > w + 50 || proj.y < -50 || proj.y > h + 50) {
        projectilesRef.current.splice(i, 1);
        continue;
      }

      // Hit Detection
      if (proj.fromPlayer) {
        let hit = false;
        for (const enemy of enemiesRef.current) {
          if (getDistance(proj, enemy) < enemy.radius + proj.radius) {
            // HIT!
            enemy.hp -= proj.damage;
            enemy.velocity.x += proj.velocity.x * 0.2; // Knockback
            enemy.velocity.y += proj.velocity.y * 0.2;
            
            spawnText(enemy.x, enemy.y, Math.floor(proj.damage).toString(), COLORS.damageText, 12);
            createExplosion(proj.x, proj.y, COLORS.projectile, 3, 3);
            
            hit = true;
            break; 
          }
        }
        if (hit) projectilesRef.current.splice(i, 1);
      }
    }

    // 4. Enemies
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const e = enemiesRef.current[i];
      
      // Move towards player
      const angle = Math.atan2(p.y - e.y, p.x - e.x);
      
      // Rotation visual
      e.angle = angle;

      // AI Movement
      const moveSpeed = e.speed;
      e.velocity.x += Math.cos(angle) * 0.2;
      e.velocity.y += Math.sin(angle) * 0.2;
      
      // Cap velocity
      const currentSpeed = Math.hypot(e.velocity.x, e.velocity.y);
      if (currentSpeed > moveSpeed) {
         e.velocity.x = (e.velocity.x / currentSpeed) * moveSpeed;
         e.velocity.y = (e.velocity.y / currentSpeed) * moveSpeed;
      }
      
      // Soft collision between enemies (avoid stacking)
      for (let j = 0; j < enemiesRef.current.length; j++) {
        if (i === j) continue;
        const other = enemiesRef.current[j];
        const dist = getDistance(e, other);
        const minDist = e.radius + other.radius;
        if (dist < minDist) {
           const pushAngle = Math.atan2(e.y - other.y, e.x - other.x);
           e.velocity.x += Math.cos(pushAngle) * 0.1;
           e.velocity.y += Math.sin(pushAngle) * 0.1;
        }
      }

      e.x += e.velocity.x;
      e.y += e.velocity.y;

      // Player Collision
      const distToPlayer = getDistance(e, p);
      if (distToPlayer < e.radius + p.radius) {
        // Damage Player
        p.hp -= 1; // Drain fast if touching
        addShake(5, 50); // Heavy shake + Vibration
        if (frameRef.current % 10 === 0) {
           spawnText(p.x, p.y, "-HP", '#ef4444', 20);
           createExplosion((p.x + e.x)/2, (p.y + e.y)/2, '#ef4444', 5);
        }
        
        // Push back enemy
        e.velocity.x *= -1;
        e.velocity.y *= -1;
      }

      // Death
      if (e.hp <= 0) {
        addShake(8, 10); // Light shake + Vibration on kill
        createExplosion(e.x, e.y, e.color, 15, 6);
        spawnText(e.x, e.y, "+100", COLORS.scoreText, 16);
        
        // Drop Orb chance
        if (Math.random() > 0.5) {
           orbsRef.current.push({
             id: generateId(), x: e.x, y: e.y, radius: 6, color: COLORS.orb, velocity: {x:0, y:0}, value: 5, pulse: 0
           });
        }
        
        p.score += 100;
        setCurrentScore(p.score);
        enemiesRef.current.splice(i, 1);
      }
    }

    // 5. Orbs (XP/Score)
    for (let i = orbsRef.current.length - 1; i >= 0; i--) {
      const orb = orbsRef.current[i];
      orb.pulse += 0.1;
      const d = getDistance(orb, p);
      
      // Magnet
      if (d < 150) {
        orb.x += (p.x - orb.x) * 0.1;
        orb.y += (p.y - orb.y) * 0.1;
      }
      
      if (d < p.radius + orb.radius) {
        p.score += 25;
        p.weaponLevel = Math.min(20, 1 + Math.floor(p.score / 500)); // Level up weapon
        p.hp = Math.min(p.maxHp, p.hp + 2); // Heal slightly
        setCurrentScore(p.score);
        spawnText(p.x, p.y, "UPGRADE", COLORS.orb, 10);
        orbsRef.current.splice(i, 1);
        vibrate(5); // Tiny vibration on collect
      }
    }

    // 6. Spawning
    const spawnRate = Math.max(10, GAME_CONFIG.enemyBaseSpawnRate - difficulty);
    if (frameRef.current % spawnRate === 0) {
      spawnEnemy(w, h, difficulty);
    }

    // 7. Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const part = particlesRef.current[i];
      part.x += part.velocity.x;
      part.y += part.velocity.y;
      part.life -= part.decay;
      part.alpha = part.life;
      if (part.life <= 0) particlesRef.current.splice(i, 1);
    }

    // 8. Floating Texts
    for (let i = textsRef.current.length - 1; i >= 0; i--) {
      const t = textsRef.current[i];
      t.x += t.velocity.x;
      t.y += t.velocity.y;
      t.life -= 0.02;
      if (t.life <= 0) textsRef.current.splice(i, 1);
    }

    // 9. Screen Shake Decay
    if (shakeRef.current > 0) shakeRef.current *= 0.9;
    if (shakeRef.current < 0.5) shakeRef.current = 0;

    // Check Game Over
    if (p.hp <= 0) {
      vibrate(200); // Long vibration on death
      setGameState(GameState.GAME_OVER);
    }
    setHealthPercent((p.hp / p.maxHp) * 100);
  };

  // --- Render ---
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Fill background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    // Apply Shake
    ctx.save();
    if (shakeRef.current > 0) {
      const dx = (Math.random() - 0.5) * shakeRef.current;
      const dy = (Math.random() - 0.5) * shakeRef.current;
      ctx.translate(dx, dy);
    }

    // Grid with parallax (based on player position)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx = -(playerRef.current.x * 0.2) % 50;
    const gy = -(playerRef.current.y * 0.2) % 50;
    for (let x = gx; x < w; x+=50) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = gy; y < h; y+=50) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // Orbs
    orbsRef.current.forEach(orb => {
       ctx.fillStyle = orb.color;
       ctx.shadowBlur = 10;
       ctx.shadowColor = orb.color;
       ctx.beginPath();
       const r = orb.radius + Math.sin(orb.pulse)*2;
       ctx.arc(orb.x, orb.y, r, 0, Math.PI*2);
       ctx.fill();
       ctx.shadowBlur = 0;
    });

    // Particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Projectiles
    projectilesRef.current.forEach(p => {
       ctx.fillStyle = '#fff';
       ctx.shadowBlur = 15;
       ctx.shadowColor = p.color;
       ctx.beginPath();
       ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
       ctx.fill();
       ctx.shadowBlur = 0;
    });

    // Enemies
    enemiesRef.current.forEach(e => {
       ctx.save();
       ctx.translate(e.x, e.y);
       ctx.rotate(e.angle);
       
       ctx.fillStyle = e.color;
       ctx.shadowBlur = 10;
       ctx.shadowColor = e.color;
       
       // Draw shapes based on type
       ctx.beginPath();
       if (e.type === 'CHASER') {
         ctx.rect(-e.radius, -e.radius, e.radius*2, e.radius*2);
       } else if (e.type === 'TANK') {
         // Octagon
         for(let i=0; i<8; i++) {
           const a = (Math.PI*2/8)*i;
           const px = Math.cos(a)*e.radius;
           const py = Math.sin(a)*e.radius;
           if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
         }
         ctx.closePath();
       } else {
         // Triangle
         ctx.moveTo(e.radius, 0);
         ctx.lineTo(-e.radius, e.radius);
         ctx.lineTo(-e.radius, -e.radius);
         ctx.closePath();
       }
       ctx.fill();
       
       // HP Bar for tank enemies
       if (e.type === 'TANK' && e.hp < e.maxHp) {
         ctx.rotate(-e.angle); // Un-rotate
         ctx.fillStyle = '#333';
         ctx.fillRect(-20, -40, 40, 6);
         ctx.fillStyle = '#f00';
         ctx.fillRect(-20, -40, 40 * (e.hp/e.maxHp), 6);
       }

       ctx.restore();
    });

    // Player
    const p = playerRef.current;
    ctx.shadowBlur = 20;
    ctx.shadowColor = COLORS.playerGlow;
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Player direction indicator
    const aimAngle = Math.atan2(mouseRef.current.y - p.y, mouseRef.current.x - p.x);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(aimAngle)*(p.radius+10), p.y + Math.sin(aimAngle)*(p.radius+10));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Floating Texts
    textsRef.current.forEach(t => {
      ctx.globalAlpha = t.life;
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px Orbitron`;
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    });

    ctx.restore(); // End shake
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState === GameState.PLAYING) {
      update(canvas.width, canvas.height);
    }
    draw(ctx, canvas.width, canvas.height);
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [gameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameLoop]);

  // --- Handlers ---
  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if ('touches' in e) {
       // Touch logic
       if(e.touches.length > 0) {
         x = e.touches[0].clientX;
         y = e.touches[0].clientY;
       } else {
         return;
       }
    } else {
       // Mouse logic
       x = (e as React.MouseEvent).clientX;
       y = (e as React.MouseEvent).clientY;
    }
    mouseRef.current = { x: x - rect.left, y: y - rect.top };
  };

  const startGame = () => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    
    // Trigger audio/vibration context unlock if needed
    vibrate(50);
    
    // Reset
    playerRef.current = {
      ...playerRef.current,
      x: canvas.width/2, y: canvas.height/2,
      velocity: {x:0, y:0},
      hp: 100, maxHp: 100, score: 0,
      weaponLevel: 1
    };
    enemiesRef.current = [];
    projectilesRef.current = [];
    particlesRef.current = [];
    orbsRef.current = [];
    textsRef.current = [];
    setCurrentScore(0);
    setHealthPercent(100);
    setGameState(GameState.PLAYING);
  };

  // Resize handler
  useEffect(() => {
     const resize = () => {
       if(canvasRef.current) {
         canvasRef.current.width = window.innerWidth;
         canvasRef.current.height = window.innerHeight;
       }
     };
     window.addEventListener('resize', resize);
     resize();
     return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
     const s = localStorage.getItem(STORAGE_KEY_HIGHSCORE);
     if(s) setHighScore(parseInt(s));
  }, []);

  useEffect(() => {
     if(gameState === GameState.GAME_OVER) {
       if(currentScore > highScore) {
         setHighScore(currentScore);
         localStorage.setItem(STORAGE_KEY_HIGHSCORE, currentScore.toString());
       }
     }
  }, [gameState, currentScore, highScore]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 cursor-crosshair touch-none select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none"
        onMouseMove={handleMouseMove}
        onTouchMove={handleMouseMove}
        onTouchStart={handleMouseMove}
      />

      {/* HUD Layer */}
      <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
         {/* Top Bar */}
         <div className="flex justify-between items-start">
            <div>
               <h1 className="text-3xl font-display font-bold text-white italic tracking-tighter drop-shadow-lg">ABLO<span className="text-cyan-400">HYPER</span></h1>
               <div className="text-3xl font-mono text-yellow-400 drop-shadow-md mt-1">{currentScore.toLocaleString()}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex items-center gap-2 text-slate-400 font-mono text-sm">
                  <Trophy size={14} /> HI: {highScore.toLocaleString()}
               </div>
            </div>
         </div>
         
         {/* Bottom Bar (Health) */}
         <div className="w-full max-w-md mx-auto mb-4">
             <div className="flex justify-between text-cyan-400 font-bold mb-1 font-display tracking-widest text-sm">
                <span>SHIELD INTEGRITY</span>
                <span>{Math.ceil(healthPercent)}%</span>
             </div>
             <div className="h-3 w-full bg-slate-800/80 rounded-full border border-slate-700 overflow-hidden relative">
                 <div 
                   className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-200"
                   style={{ width: `${healthPercent}%` }}
                 />
                 <div className="absolute inset-0 bg-white/10 animate-[shimmer_2s_infinite]"></div>
             </div>
         </div>
      </div>

      {/* Menu Screen */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
           <div className="relative mb-12 animate-float">
              <div className="absolute -inset-8 bg-cyan-500/20 blur-3xl rounded-full"></div>
              <h1 className="text-7xl md:text-9xl font-display font-black italic text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-2xl text-center select-none">
                 ABLO
                 <span className="block text-4xl md:text-5xl text-white not-italic tracking-[0.2em] mt-2">HYPERDRIVE</span>
              </h1>
           </div>
           
           <Button onClick={startGame} icon={<Play size={24} />} className="mb-6 scale-125 touch-manipulation">
             INITIATE SEQUENCE
           </Button>
           
           <div className="flex gap-8 text-slate-400 text-sm font-mono mt-8 border-t border-slate-800 pt-8">
              <div className="flex flex-col items-center gap-2">
                 <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><Crosshair /></div>
                 <span>AUTO-AIM ACTIVE</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                 <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700"><Zap /></div>
                 <span>UPGRADE CORE</span>
              </div>
           </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-md">
           <h2 className="text-6xl font-display font-bold text-red-500 mb-2 tracking-tighter text-center">CRITICAL FAILURE</h2>
           <div className="text-8xl font-mono font-bold text-white mb-8 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
              {currentScore.toLocaleString()}
           </div>
           
           <Button variant="danger" onClick={startGame} icon={<RotateCcw size={24} />} className="touch-manipulation">
              RESTART MISSION
           </Button>
        </div>
      )}
    </div>
  );
};