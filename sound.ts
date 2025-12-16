// Web Audio API Sound Manager
// Generates retro arcade sounds procedurally without external assets

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  public muted: boolean = false;

  constructor() {
    this.muted = localStorage.getItem('ablo_muted') === 'true';
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.updateMuteState();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('ablo_muted', this.muted.toString());
    this.updateMuteState();
    return this.muted;
  }

  private updateMuteState() {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.3, this.ctx?.currentTime || 0);
    }
    if (this.muted) {
      this.stopDrone();
    } else {
      // If we are supposed to be playing (logic handled in game), drone might restart
      // But usually drone is controlled by game state.
    }
  }

  // --- SFX Generators ---

  playShoot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(t + 0.1);
  }

  playExplosion(size: 'small' | 'large' = 'small') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const duration = size === 'large' ? 0.4 : 0.2;

    // Noise buffer
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to make it sound like an explosion
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(size === 'large' ? 0.8 : 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain!);
    noise.start();
  }

  playDamage() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(50, t + 0.1);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(t + 0.15);
  }

  playPowerup() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(1760, t + 0.3);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(t + 0.3);
  }

  playGameStart() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    
    // Simple chord
    [440, 554, 659].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.1 + i*0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start();
      osc.stop(t + 1.5);
    });
  }

  playGameOver() {
    if (!this.ctx || this.muted) return;
    this.stopDrone();
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 1.0);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 1.0);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    osc.stop(t + 1.0);
  }

  // --- Ambience ---

  startDrone() {
    if (!this.ctx || this.muted || this.droneOsc) return;
    
    this.droneOsc = this.ctx.createOscillator();
    this.droneGain = this.ctx.createGain();
    
    this.droneOsc.type = 'triangle';
    this.droneOsc.frequency.value = 55; // Low A
    
    // LFO for pulsing effect
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);

    this.droneGain.gain.value = 0.1;

    this.droneOsc.connect(this.droneGain);
    this.droneGain.connect(this.masterGain!);
    
    this.droneOsc.start();
    lfo.start();
  }

  stopDrone() {
    if (this.droneOsc) {
      try {
        this.droneOsc.stop();
        this.droneOsc.disconnect();
      } catch (e) {}
      this.droneOsc = null;
    }
  }
}

export const soundManager = new SoundManager();