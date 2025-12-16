export const COLORS = {
  background: '#020617', // Slate 950 (Darker)
  player: '#0ea5e9', // Sky 500
  playerGlow: '#38bdf8', // Sky 400
  projectile: '#fde047', // Yellow 300
  enemyChaser: '#ef4444', // Red 500
  enemyTank: '#a855f7', // Purple 500
  enemySwarmer: '#f97316', // Orange 500
  orb: '#10b981', // Emerald 500
  text: '#f8fafc', // Slate 50
  grid: '#1e293b', // Slate 800
  damageText: '#ffffff',
  scoreText: '#fbbf24',
};

export const GAME_CONFIG = {
  fps: 60,
  friction: 0.90,
  enemyBaseSpawnRate: 45,
  difficultyScaling: 0.05, // How much harder it gets per 100 score
  playerStartHp: 100,
  playerFireRate: 15, // Frames between shots (lower is faster)
};

export const STORAGE_KEY_HIGHSCORE = 'ablo_hyperdrive_highscore_v2';