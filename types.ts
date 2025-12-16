export type Point = {
  x: number;
  y: number;
};

export type Vector = {
  x: number;
  y: number;
};

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED',
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  velocity: Vector;
}

export interface Player extends Entity {
  speed: number;
  hp: number;
  maxHp: number;
  score: number;
  weaponLevel: number;
  weaponTimer: number;
}

export interface Enemy extends Entity {
  type: 'CHASER' | 'SHOOTER' | 'TANK' | 'SWARMER';
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  angle: number; // For rotation
}

export interface Projectile extends Entity {
  damage: number;
  fromPlayer: boolean;
}

export interface Particle extends Entity {
  life: number;
  maxLife: number;
  alpha: number;
  decay: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  velocity: Vector;
  size: number;
}

export interface Orb extends Entity {
  value: number;
  pulse: number;
}