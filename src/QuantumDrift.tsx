import React, { useEffect, useRef, useState } from 'react';

// ─── Quantum Drift ────────────────────────────────────────────────────────────
// Qubit hovers by default. Arrow Up/Down to move. Space = Quantum Leap.
// QL phases through obstacles but costs 1 charge (earned every 5 gates).
// Obstacle variety: quantum gates, energy barriers, entanglement nodes, phase walls.

// ─── Tuning ───────────────────────────────────────────────────────────────────
const QUBIT_R = 11;
const QUBIT_START_X = 100;         // starting X position of qubit
const MOVE_ACCEL = 0.7;            // acceleration when holding up/down/left/right
const FRICTION = 0.87;             // velocity damping each frame (hover feel)
const MAX_VEL = 8;
const MAX_VEL_X = 5;               // horizontal max speed (slower than vertical)
const BASE_SPEED = 2.2;            // starting obstacle scroll speed (easy!)
const SPEED_INC = 0.06;            // speed added per gate cleared (gradual)
const MAX_SPEED = 8;
const SPAWN_INTERVAL_BASE = 160;   // frames between obstacles at start (lots of room)
const SPAWN_INTERVAL_MIN = 55;     // minimum interval at high scores
const QL_COST = 1;                 // charges per quantum leap
const QL_EARN_EVERY = 5;           // gates needed to earn 1 QL charge
const QL_DURATION = 55;            // frames of phasing
const GAP_SIZE = 200;              // very generous gate gap to start

// ─── Obstacle types ───────────────────────────────────────────────────────────
type ObstacleKind = 'gate' | 'barrier' | 'orbs' | 'wall' | 'cat';

interface Obstacle {
  kind: ObstacleKind;
  x: number;
  w: number;
  scored: boolean;
  colorIdx: number;
  // gate: top/bottom gap
  gapY?: number;
  gapSize?: number;             // per-gate gap (shrinks with score)
  // barrier: horizontal beam
  beamY?: number;
  beamH?: number;
  beamDir?: number;          // oscillation direction
  beamSpeed?: number;
  // orbs: cluster of floating orbs
  orbs?: Array<{ cy: number; r: number; phase: number; speed: number }>;
  // wall: full-height wall with narrow slit
  slitY?: number;
  slitH?: number;
  // cat: Schrödinger’s cat — flickers alive/dead
  catY?: number;
  catVelY?: number;
  catPhase?: number;
  catAlive?: boolean; // current observed state
}

// ─── Glow colors ──────────────────────────────────────────────────────────────
const GLOW = [
  { r: 0, g: 163, b: 238 },   // cyan
  { r: 168, g: 85, b: 247 },  // purple
  { r: 236, g: 72, b: 153 },  // pink
  { r: 52, g: 211, b: 153 },  // emerald
  { r: 251, g: 191, b: 36 },  // amber
  { r: 99, g: 102, b: 241 },  // indigo
];
type C3 = { r: number; g: number; b: number };

function lerp(a: C3, b: C3, t: number): C3 {
  return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
}
function gc(phase: number): C3 {
  const i = ((phase % GLOW.length) + GLOW.length) % GLOW.length;
  return lerp(GLOW[Math.floor(i) % GLOW.length], GLOW[(Math.floor(i) + 1) % GLOW.length], i - Math.floor(i));
}
function rgba(c: C3, a: number) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

// ─── Stars (parallax) ─────────────────────────────────────────────────────────
interface Star { x: number; y: number; z: number; brightness: number; }
function makeStars(w: number, h: number, n: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < n; i++) {
    stars.push({ x: Math.random() * w, y: Math.random() * h, z: 0.2 + Math.random() * 0.8, brightness: 0.3 + Math.random() * 0.7 });
  }
  return stars;
}

// ─── Floating text popups ─────────────────────────────────────────────────────
interface FloatText { x: number; y: number; text: string; life: number; maxLife: number; color: C3; size: number; }

// ─── Particles ────────────────────────────────────────────────────────────────
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: C3; size: number; }

// ─── Lasers (invert controls on hit) ──────────────────────────────────────────
interface Laser {
  x: number;       // emitter X (scrolls left with obstacles)
  y: number;       // emitter Y position
  fireCountdown: number; // frames until beam fires
  firing: boolean; // true while beam is active
  fireLife: number; // frames beam stays active
  beamAngle: number; // angle of the beam (0 = horizontal left-to-right)
  colorIdx: number;
  warned: boolean;  // true once warning flash started
}
const LASER_WARN_FRAMES = 60;  // 1 sec warning before firing
const LASER_FIRE_FRAMES = 30;  // beam active for 0.5 sec
const INVERT_DURATION = 600;   // 10 seconds at 60fps

function burst(arr: Particle[], x: number, y: number, c: C3, n: number, spd = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * spd;
    arr.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 20 + Math.random() * 20, maxLife: 40, color: c, size: 1.5 + Math.random() * 2.5 });
  }
}

// ─── Quips ────────────────────────────────────────────────────────────────────
const QUIPS = [
  'WAVE FUNCTION COLLAPSED', 'DECOHERENCE DETECTED', 'ENTANGLEMENT SEVERED',
  'SUPERPOSITION FAILED', 'SCHRÖDINGER DISAPPROVES', 'HEISENBERG SAYS NO',
  'QUANTUM ERROR UNCORRECTED', 'TOPOLOGY VIOLATED',
];

// ─── Japanese Orchestral Music Engine (Web Audio) ─────────────────────────────
// Miyako-bushi / In scale patterns with koto-like arpeggios, shakuhachi-style
// lead, shamisen bass, taiko-inspired percussion, and ambient temple bells.
// Calm, contemplative, and increasingly complex with difficulty.
const N: Record<string, number> = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, Bb2: 116.54, B2: 123.47,
  C3: 130.81, Db3: 138.59, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, Db4: 277.18, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Db5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, Ab5: 830.61, A5: 880.00, Bb5: 932.33, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98,
};

// ── Melodies — In scale (E F A B C) — contemplative shakuhachi phrases ──
// SAKURA_DRIFT: gentle, floating, lots of sustained notes with rests (0 = rest)
const SAKURA_DRIFT: string[] = ['E4','0','F4','0','A4','0','B4','A4','0','0','E4','F4','0','E4','0','0',
  'B4','0','C5','B4','0','A4','0','0','F4','E4','0','0','F4','A4','0','0'];
// MOON_GARDEN: more movement, ornamental grace notes
const MOON_GARDEN: string[] = ['A4','B4','C5','0','E5','C5','B4','0','A4','F4','E4','0','F4','A4','B4','C5',
  'E5','0','C5','A4','0','B4','C5','E5','C5','B4','A4','0','F4','E4','0','0'];
// TEMPLE_WIND: faster, more intense, wider range
const TEMPLE_WIND: string[] = ['E5','C5','B4','A4','F4','E4','F4','A4','B4','C5','E5','F5','E5','C5','B4','A4',
  'E4','F4','A4','C5','E5','C5','A4','B4','C5','E5','F5','E5','C5','B4','A4','F4'];
// STORM_BLOSSOM: rapid, dramatic, full register
const STORM_BLOSSOM: string[] = ['E5','F5','E5','C5','B4','A4','B4','C5','E5','F5','E5','C5','A4','F4','E4','F4',
  'A4','C5','E5','F5','E5','C5','B4','E5','F5','E5','C5','A4','B4','C5','E5','F5',
  'E5','C5','B4','A4','F4','E4','A4','B4','C5','E5','F5','E5','C5','B4','A4','F4'];

// ── Bass — shamisen-style plucked low notes ──
const BASS_SAKURA: string[] = ['E2','0','E2','0','A2','0','A2','0','F2','0','E2','0','B2','0','A2','0'];
const BASS_MOON: string[] = ['A2','0','E2','A2','0','F2','E2','0','B2','A2','0','E2','F2','0','A2','0'];
const BASS_TEMPLE: string[] = ['E3','A2','E3','B2','A2','E3','F2','A2','E3','B2','A2','F2','E3','A2','B2','E3'];
const BASS_STORM: string[] = ['E3','F2','A2','E3','B2','A2','E3','F2','B2','E3','A2','F2','E3','A2','B2','F2',
  'E3','A2','F2','E3','B2','A2','E3','F2'];

// ── Pad roots — for sustained string drone (engine plays octave + fifth) ──
const PAD_CALM: string[] = ['E3','E3','A3','A3','F3','F3','E3','E3'];
const PAD_FLOW: string[] = ['A3','A3','E3','F3','A3','B3','A3','E3'];
const PAD_INTENSE: string[] = ['E3','F3','A3','B3','E3','A3','F3','E3'];

// ── Koto arpeggios — plucked cascading notes ──
const KOTO_CALM: string[] = ['E4','A4','B4','E5'];
const KOTO_FLOW: string[] = ['A4','C5','E5','A5','E5','C5'];
const KOTO_SWIFT: string[] = ['E4','F4','A4','B4','C5','E5','C5','B4','A4','F4'];
const KOTO_STORM: string[] = ['E5','C5','A4','F4','E4','F4','A4','C5','E5','F5','E5','C5'];

class ChiptuneEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private intervalId: number | null = null;
  private padOscs: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private step = 0;
  private bar = 0;
  private _difficulty = 0;
  private _playing = false;
  private _muted = false;

  get muted() { return this._muted; }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.14;
    // Simple reverb via convolver for spacious temple feel
    this.convolver = this.ctx.createConvolver();
    const rate = this.ctx.sampleRate;
    const len = rate * 2;
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    this.convolver.buffer = impulse;
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.25;
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.ctx.destination);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.convolver);
  }

  start() {
    if (this._playing) return;
    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    this._playing = true;
    this.step = 0;
    this.bar = 0;
    this.startPadDrone();
    this.scheduleBeat();
  }

  stop() {
    this._playing = false;
    if (this.intervalId !== null) { clearTimeout(this.intervalId); this.intervalId = null; }
    this.stopPadDrone();
  }

  setDifficulty(d: number) {
    this._difficulty = Math.max(0, Math.min(1, d));
    this.updatePad();
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this.masterGain) this.masterGain.gain.value = this._muted ? 0 : 0.14;
    if (this.reverbGain) this.reverbGain.gain.value = this._muted ? 0 : 0.25;
    return this._muted;
  }

  // ── Pad drone: sustained strings — root + octave + fifth ──────────────
  private startPadDrone() {
    if (!this.ctx || !this.masterGain) return;
    this.stopPadDrone();
    // 3 oscillators: root, octave, fifth — slow warm sine/triangle blend
    const notes = [N['E3'], N['E3'] * 2, N['B3']];
    const types: OscillatorType[] = ['sine', 'triangle', 'sine'];
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = types[i];
      osc.frequency.value = notes[i];
      gain.gain.value = i === 0 ? 0.035 : 0.02;
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      this.padOscs.push(osc);
      this.padGains.push(gain);
    }
  }

  private stopPadDrone() {
    this.padOscs.forEach(o => { try { o.stop(); } catch {} });
    this.padOscs = [];
    this.padGains = [];
  }

  private updatePad() {
    if (this.padOscs.length < 3 || !this.ctx) return;
    const d = this._difficulty;
    const pads = d < 0.3 ? PAD_CALM : d < 0.6 ? PAD_FLOW : PAD_INTENSE;
    const root = N[pads[this.bar % pads.length]] || N['E3'];
    const t = this.ctx.currentTime;
    // Slow, meditative glide between chord roots
    this.padOscs[0].frequency.exponentialRampToValueAtTime(root, t + 0.8);
    this.padOscs[1].frequency.exponentialRampToValueAtTime(root * 2, t + 0.8);
    this.padOscs[2].frequency.exponentialRampToValueAtTime(root * 1.498, t + 0.8);
    // Volume breathes gently with difficulty
    const vol = 0.025 + d * 0.025;
    this.padGains[0].gain.linearRampToValueAtTime(vol, t + 0.5);
    this.padGains[1].gain.linearRampToValueAtTime(vol * 0.6, t + 0.5);
    this.padGains[2].gain.linearRampToValueAtTime(vol * 0.5, t + 0.5);
  }

  // Shaped tone with attack-decay envelope (koto/shakuhachi feel)
  private playTone(freq: number, duration: number, type: OscillatorType, gainVal: number, detune = 0, attack = 0.01) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const t = this.ctx.currentTime;
    // Soft attack → sustain → gentle decay (no harsh cuts)
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(gainVal, t + attack);
    gain.gain.setValueAtTime(gainVal, t + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Koto pluck — sharp attack, quick decay, triangle with slight detune
  private playKotoPluck(freq: number, duration: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    // Main pluck
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + duration + 0.02);
    // Harmonic shimmer (octave + fifth partials)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(vol * 0.15, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.6);
    osc2.connect(gain2); gain2.connect(this.masterGain);
    osc2.start(t); osc2.stop(t + duration * 0.6 + 0.02);
  }

  // Taiko drum — sine thump with noise hit
  private playTaiko(freq: number, vol: number, size: 'big' | 'small') {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const dur = size === 'big' ? 0.25 : 0.12;
    // Body (sine sweep down)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(this.masterGain);
    osc.start(t); osc.stop(t + dur + 0.01);
    // Skin slap (noise)
    const bufSize = Math.floor(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = size === 'big' ? 200 : 800;
    filt.Q.value = 1;
    src.connect(filt); filt.connect(ng); ng.connect(this.masterGain);
    src.start(t); src.stop(t + 0.06);
  }

  // Temple bell — sine with slow decay + inharmonic partial
  private playBell(freq: number, vol: number) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    const partials = [1, 2.76, 4.07, 5.2]; // temple bell partials
    for (let i = 0; i < partials.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * partials[i];
      const pVol = vol / (1 + i * 1.5);
      gain.gain.setValueAtTime(pVol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0 - i * 0.3);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(t); osc.stop(t + 2.1);
    }
  }

  // 8-bit death sound — descending chromatic wail + noise burst
  playDeathSound() {
    this.init();
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    // Descending chromatic wail
    for (let i = 0; i < 8; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      const freq = 600 - i * 60;
      osc.frequency.value = freq;
      const start = t + i * 0.06;
      gain.gain.setValueAtTime(0.18 - i * 0.018, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(start); osc.stop(start + 0.09);
    }
    // Final low thud
    const thud = this.ctx.createOscillator();
    const thudG = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, t + 0.5);
    thud.frequency.exponentialRampToValueAtTime(40, t + 0.8);
    thudG.gain.setValueAtTime(0.25, t + 0.5);
    thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    thud.connect(thudG); thudG.connect(this.masterGain);
    thud.start(t + 0.5); thud.stop(t + 0.95);
    // Static burst
    const bufSize = Math.floor(this.ctx.sampleRate * 0.15);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.12, t + 0.48);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    src.connect(ng); ng.connect(this.masterGain);
    src.start(t + 0.48); src.stop(t + 0.7);
  }

  private scheduleBeat() {
    if (!this._playing) return;
    const d = this._difficulty;
    // Tempo: meditative 200ms → intense 110ms
    const tempo = 200 - d * 90;
    const noteLen = (tempo / 1000) * 1.8;
    const beatInBar = this.step % 16;

    if (beatInBar === 0) { this.bar++; this.updatePad(); }

    // ── Pick patterns by tier ──────────────────────────────────────
    let melody: string[], bass: string[], koto: string[];
    if (d < 0.2)       { melody = SAKURA_DRIFT;  bass = BASS_SAKURA; koto = KOTO_CALM; }
    else if (d < 0.45) { melody = MOON_GARDEN;   bass = BASS_MOON;   koto = KOTO_FLOW; }
    else if (d < 0.7)  { melody = TEMPLE_WIND;   bass = BASS_TEMPLE; koto = KOTO_SWIFT; }
    else               { melody = STORM_BLOSSOM; bass = BASS_STORM;  koto = KOTO_STORM; }

    // ── Shakuhachi lead — sine with slight vibrato (breathy, human feel) ──
    const melodyEvery = d < 0.25 ? 2 : 1;
    if (this.step % melodyEvery === 0) {
      const mi = (this.step / melodyEvery | 0) % melody.length;
      const note = melody[mi];
      if (note !== '0') {
        const freq = N[note];
        if (freq) {
          // Natural vibrato — slow + gentle, deepens with difficulty
          const vib = Math.sin(this.step * 0.5) * (2 + d * 4);
          this.playTone(freq, noteLen * (d < 0.3 ? 1.8 : 1.2), 'sine', 0.14 + d * 0.06, vib, 0.03);
          // Shakuhachi breath — delayed faint echo one octave up
          if (d >= 0.25 && this.step % 4 === 0) {
            setTimeout(() => {
              if (this._playing) this.playTone(freq * 2, noteLen * 0.4, 'sine', 0.025, vib + 5, 0.02);
            }, tempo * 0.6);
          }
        }
      }
    }

    // ── Shamisen bass — sharp triangle plucks ──────────────────────────
    if (this.step % 3 === 0) {
      const bi = (this.step / 3 | 0) % bass.length;
      const note = bass[bi];
      if (note !== '0') {
        const freq = N[note];
        if (freq) {
          this.playKotoPluck(freq, noteLen * 1.5, 0.2 + d * 0.08);
        }
      }
    }

    // ── Koto arpeggios — cascading plucked notes ──────────────────────
    if (d >= 0.1) {
      const kotoSpeed = d < 0.35 ? 4 : d < 0.65 ? 2 : 1;
      if (this.step % kotoSpeed === 0) {
        const ki = (this.step / kotoSpeed | 0) % koto.length;
        const freq = N[koto[ki]];
        if (freq) {
          this.playKotoPluck(freq, noteLen * 0.5, 0.06 + d * 0.03);
        }
      }
    }

    // ── Taiko percussion — sparse and powerful ─────────────────────────
    // Big taiko on downbeats
    if (beatInBar === 0) {
      this.playTaiko(60, 0.2 + d * 0.12, 'big');
    }
    // Smaller accent on 8 at medium+
    if (beatInBar === 8 && d >= 0.2) {
      this.playTaiko(90, 0.1 + d * 0.06, 'small');
    }
    // Rapid ko-daiko (small drum fills) at high difficulty
    if (d >= 0.5 && (beatInBar === 4 || beatInBar === 12)) {
      this.playTaiko(120, 0.06 + d * 0.04, 'small');
    }
    if (d >= 0.7 && beatInBar % 2 === 1 && beatInBar > 12) {
      this.playTaiko(150, 0.04, 'small');
    }
    // Woodblock — subtle tick (like mokugyo)
    if (d >= 0.15 && beatInBar % 4 === 2) {
      this.playTone(800 + d * 400, 0.03, 'triangle', 0.04 + d * 0.02);
    }

    // ── Temple bell — every 64 steps, ethereal chime ───────────────────
    if (this.step % 64 === 0) {
      const bellNotes = ['E5', 'A5', 'B5', 'E6'];
      const bn = bellNotes[Math.floor(Math.random() * bellNotes.length)];
      this.playBell(N[bn] || 659, 0.04 + d * 0.02);
    }

    // ── Wind chime — random gentle high sine at low difficulty ──────────
    if (this.step % 24 === 12 && d < 0.5) {
      const chimeFreqs = [N['E5'], N['A5'], N['C6'], N['E6']];
      const cf = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];
      if (cf) this.playTone(cf, 0.3, 'sine', 0.015 + (0.5 - d) * 0.01, Math.random() * 10 - 5, 0.05);
    }

    // ── Shakuhachi ornament — grace note bend at medium+ ───────────────
    if (d >= 0.35 && this.step % 16 === 7) {
      const ornFreq = N['A4'] || 440;
      this.playTone(ornFreq, noteLen * 0.3, 'sine', 0.06, 30, 0.005); // bent up
      setTimeout(() => {
        if (this._playing) this.playTone(ornFreq, noteLen * 0.6, 'sine', 0.08, 0, 0.01);
      }, tempo * 0.3);
    }

    this.step++;
    this.intervalId = window.setTimeout(() => this.scheduleBeat(), tempo);
  }

  cleanup() {
    this.stop();
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function QuantumDrift({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, forceRender] = useState(0);
  const musicRef = useRef<ChiptuneEngine | null>(null);

  // Cleanup music on unmount
  useEffect(() => {
    musicRef.current = new ChiptuneEngine();
    return () => { musicRef.current?.cleanup(); };
  }, []);

  // Persistent across the component lifetime
  const dimRef = useRef({ w: typeof window !== 'undefined' ? window.innerWidth : 800, h: typeof window !== 'undefined' ? window.innerHeight : 600 });

  // All mutable game state lives in a single ref to avoid stale closures
  const g = useRef({
    state: 'idle' as 'idle' | 'playing' | 'paused' | 'dead',
    qX: QUBIT_START_X,
    qY: dimRef.current.h / 2,
    qVel: 0,
    qXVel: 0,
    frame: 0,
    score: 0,
    qubits: 0,
    highQubits: 0,
    speed: BASE_SPEED,
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    catProjectiles: [] as CatProjectile[],
    lasers: [] as Laser[],
    invertTimer: 0,   // frames remaining for inverted controls
    floatTexts: [] as FloatText[],
    stars: makeStars(dimRef.current.w, dimRef.current.h, 120),
    phase: 0,        // animation phase
    cPhase: 0,       // color phase
    obsCounter: 0,   // color index counter
    // Quantum Leap
    qlCharges: 0,
    qlActive: 0,     // frames remaining
    qlCooldown: 0,   // short cooldown after QL ends
    // Combo
    combo: 0,
    comboTimer: 0,   // frames since last gate — resets combo if too long
    lastMilestone: 0,
    milestoneFlash: 0,
    // Screen shake
    shakeFrames: 0,
    shakeIntensity: 0,
    // Input
    upHeld: false,
    downHeld: false,
    leftHeld: false,
    rightHeld: false,
    // Death
    quip: QUIPS[0],
  });

  // Load high score once
  useEffect(() => {
    const s = localStorage.getItem('qdrift-highqubits');
    if (s) g.current.highQubits = parseInt(s, 10) || 0;
  }, []);

  // ── Input ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const gs = g.current;
    function down(e: KeyboardEvent) {
      if (e.code === 'Escape') {
        if (gs.state === 'playing') { gs.state = 'paused'; musicRef.current?.stop(); forceRender(n => n + 1); return; }
        if (gs.state === 'paused') { gs.state = 'playing'; musicRef.current?.start(); forceRender(n => n + 1); return; }
        onClose(); return;
      }
      if ((e.code === 'KeyP') && gs.state === 'playing') { e.preventDefault(); gs.state = 'paused'; musicRef.current?.stop(); forceRender(n => n + 1); return; }
      if ((e.code === 'KeyP' || e.code === 'Space') && gs.state === 'paused') { e.preventDefault(); gs.state = 'playing'; musicRef.current?.start(); forceRender(n => n + 1); return; }
      if (gs.state === 'idle' && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) {
        e.preventDefault();
        gs.state = 'playing';
        gs.qX = QUBIT_START_X;
        gs.qY = dimRef.current.h / 2;
        gs.qVel = 0;
        gs.qXVel = 0;
        gs.frame = 0;
        gs.score = 0;
        gs.qubits = 0;
        gs.speed = BASE_SPEED;
        gs.obstacles = [];
        gs.particles = [];
        gs.floatTexts = [];
        gs.lasers = [];
        gs.obsCounter = 0;
        gs.qlCharges = 0;
        gs.qlActive = 0;
        gs.qlCooldown = 0;
        gs.invertTimer = 0;
        gs.combo = 0; gs.comboTimer = 0; gs.lastMilestone = 0; gs.milestoneFlash = 0;
        gs.shakeFrames = 0; gs.shakeIntensity = 0;
        musicRef.current?.start();
        forceRender(n => n + 1);
        return;
      }
      if (gs.state === 'dead' && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space')) {
        e.preventDefault();
        gs.state = 'idle';
        gs.qX = QUBIT_START_X;
        gs.qY = dimRef.current.h / 2;
        gs.qVel = 0;
        gs.qXVel = 0;
        gs.obstacles = [];
        gs.particles = [];
        forceRender(n => n + 1);
        return;
      }
      if (e.code === 'KeyM' && gs.state !== 'idle') { musicRef.current?.toggleMute(); forceRender(n => n + 1); return; }
      if (e.code === 'ArrowUp') { e.preventDefault(); gs.upHeld = true; }
      if (e.code === 'ArrowDown') { e.preventDefault(); gs.downHeld = true; }
      if (e.code === 'ArrowLeft') { e.preventDefault(); gs.leftHeld = true; }
      if (e.code === 'ArrowRight') { e.preventDefault(); gs.rightHeld = true; }
      if (e.code === 'Space' && gs.state === 'playing') {
        e.preventDefault();
        // Quantum Leap
        if (gs.qlCharges >= QL_COST && gs.qlActive === 0) {
          gs.qlCharges -= QL_COST;
          gs.qlActive = QL_DURATION;
          // QL activation burst
          for (let ci = 0; ci < GLOW.length; ci++) {
            burst(gs.particles, gs.qX, gs.qY, GLOW[ci], 5, 4);
          }
        }
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code === 'ArrowUp') gs.upHeld = false;
      if (e.code === 'ArrowDown') gs.downHeld = false;
      if (e.code === 'ArrowLeft') gs.leftHeld = false;
      if (e.code === 'ArrowRight') gs.rightHeld = false;
    }
    function tap() {
      // Mobile / click: same as pressing up once briefly, or start/restart
      if (gs.state === 'idle') {
        gs.state = 'playing';
        gs.qX = QUBIT_START_X; gs.qY = dimRef.current.h / 2;
        gs.qVel = 0; gs.qXVel = 0; gs.frame = 0; gs.score = 0; gs.qubits = 0;
        gs.speed = BASE_SPEED; gs.obstacles = []; gs.particles = []; gs.floatTexts = []; gs.lasers = [];
        gs.obsCounter = 0; gs.qlCharges = 0; gs.qlActive = 0; gs.qlCooldown = 0; gs.invertTimer = 0;
        gs.combo = 0; gs.comboTimer = 0; gs.lastMilestone = 0; gs.milestoneFlash = 0;
        gs.shakeFrames = 0; gs.shakeIntensity = 0;
        musicRef.current?.start();
        forceRender(n => n + 1);
        return;
      }
      if (gs.state === 'dead') {
        gs.state = 'idle'; gs.qX = QUBIT_START_X; gs.qY = dimRef.current.h / 2;
        gs.qVel = 0; gs.qXVel = 0;
        gs.obstacles = []; gs.particles = []; gs.lasers = []; forceRender(n => n + 1);
        return;
      }
      // Apply a single upward impulse for tap gameplay (invert if timer active)
      gs.qVel = gs.invertTimer > 0 ? Math.min(gs.qVel + 3.5, MAX_VEL) : Math.max(gs.qVel - 3.5, -MAX_VEL);
    }
    function onVisChange() {
      if (document.hidden && gs.state === 'playing') {
        gs.state = 'paused'; musicRef.current?.stop(); forceRender(n => n + 1);
      }
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('blur', () => { if (gs.state === 'playing') { gs.state = 'paused'; musicRef.current?.stop(); forceRender(n => n + 1); } });
    const canvas = canvasRef.current;
    canvas?.addEventListener('click', tap);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); document.removeEventListener('visibilitychange', onVisChange); canvas?.removeEventListener('click', tap); };
  }, [onClose]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return () => {};
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    const gs = g.current;

    function resize() { const w = window.innerWidth, h = window.innerHeight; dimRef.current = { w, h }; canvas.width = w; canvas.height = h; }
    resize();
    window.addEventListener('resize', resize);

    // ── Drawing helpers ───────────────────────────────────────────────────
    function glow(x: number, y: number, r: number, c: C3, gr: number, a = 1) {
      const gd = ctx.createRadialGradient(x, y, 0, x, y, gr);
      gd.addColorStop(0, rgba(c, a));
      gd.addColorStop(0.4, rgba(c, a * 0.3));
      gd.addColorStop(1, 'transparent');
      ctx.fillStyle = gd;
      ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(c, a);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    function drawBg() {
      const W = canvas.width, H = canvas.height;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#050a15'); bg.addColorStop(0.5, '#0a0f1a'); bg.addColorStop(1, '#0d1420');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // ── Parallax starfield ───────────────────────────────────────────
      for (const star of gs.stars) {
        star.x -= gs.speed * star.z * 0.6;
        if (star.x < 0) { star.x = W; star.y = Math.random() * H; }
        const sz = star.z * 2;
        const twinkle = star.brightness * (0.6 + Math.sin(gs.phase * 2 + star.y) * 0.4);
        ctx.fillStyle = `rgba(180,200,255,${twinkle})`;
        ctx.fillRect(star.x, star.y, sz, sz);
        // Bright stars get a soft cross
        if (star.z > 0.7) {
          ctx.fillStyle = `rgba(180,200,255,${twinkle * 0.15})`;
          ctx.fillRect(star.x - 2, star.y, sz + 4, sz);
          ctx.fillRect(star.x, star.y - 2, sz, sz + 4);
        }
      }

      // Scrolling grid
      const c = gc(gs.cPhase * 0.3);
      const off = (gs.frame * gs.speed * 0.25) % 40;
      ctx.strokeStyle = rgba(c, 0.035); ctx.lineWidth = 1;
      for (let x = -off; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // ── Speed warp lines ─────────────────────────────────────────────
      if (gs.speed > 4) {
        const intensity = Math.min(1, (gs.speed - 4) / 4);
        const lineCount = Math.floor(intensity * 18);
        for (let i = 0; i < lineCount; i++) {
          const ly = ((i * 73 + gs.frame * 3.7) % H);
          const lLen = 30 + intensity * 80 + Math.random() * 40;
          const lx = ((i * 131 + gs.frame * gs.speed * 0.8) % (W + lLen)) - lLen;
          const la = intensity * (0.06 + Math.random() * 0.04);
          ctx.strokeStyle = `rgba(150,180,255,${la})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lLen, ly); ctx.stroke();
        }
      }

      // Floating symbols
      const sym = ['ψ', 'φ', '∞', '⟨0|', '|1⟩', 'H', 'X', 'Z', '†', '⊗'];
      ctx.font = '10px monospace';
      for (let i = 0; i < 12; i++) {
        const sx = ((i * 137 + gs.frame * 0.3) % (W + 100)) - 50;
        const sy = ((i * 97 + Math.sin(gs.phase + i) * 20) % H);
        ctx.fillStyle = rgba(gc(i * 0.5 + gs.cPhase * 0.2), 0.05 + Math.sin(gs.phase + i * 0.7) * 0.02);
        ctx.fillText(sym[i % sym.length], sx, sy);
      }
    }

    function drawFloatTexts() {
      gs.floatTexts = gs.floatTexts.filter(ft => {
        ft.life--; ft.y -= 0.6;
        if (ft.life <= 0) return false;
        const a = Math.min(1, ft.life / (ft.maxLife * 0.4));
        ctx.font = `bold ${ft.size}px monospace`; ctx.textAlign = 'center';
        ctx.fillStyle = rgba(ft.color, a);
        ctx.shadowColor = rgba(ft.color, a * 0.5); ctx.shadowBlur = 8;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
        return true;
      });
    }

    function drawParticles() {
      gs.particles = gs.particles.filter(p => {
        p.life--; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95;
        if (p.life <= 0) return false;
        const a = (p.life / p.maxLife) * 0.8;
        ctx.fillStyle = rgba(p.color, a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2); ctx.fill();
        return true;
      });
    }

    // ── Pixel-art cat sprite ──────────────────────────────────────────────
    // 9×9 pixel cat drawn at 3x scale (27×27 px)
    const CAT_PIXELS = [
      '..X...X..',
      '.X.X.X.X.',
      '.XXXXXXX.',
      'XX.X.X.XX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..X...X..',
      '.XX...XX.',
      '.X.....X.',
    ];
    function drawCatSprite(cx: number, cy: number, color: C3, alpha: number) {
      const px = 3; // pixel scale
      const ox = cx - (9 * px) / 2;
      const oy = cy - (9 * px) / 2;
      ctx.fillStyle = rgba(color, alpha);
      for (let r = 0; r < CAT_PIXELS.length; r++) {
        for (let col = 0; col < CAT_PIXELS[r].length; col++) {
          if (CAT_PIXELS[r][col] === 'X') {
            ctx.fillRect(ox + col * px, oy + r * px, px, px);
          }
        }
      }
    }

    // ── Obstacle drawing ──────────────────────────────────────────────────
    function drawObs(o: Obstacle) {
      const c = gc(o.colorIdx * 0.7);
      const pulse = Math.sin(gs.phase * 2 + o.colorIdx) * 0.12;
      const H = canvas.height;

      if (o.kind === 'gate') {
        const gap = o.gapSize ?? GAP_SIZE;
        const half = gap / 2;
        const topH = (o.gapY ?? H / 2) - half;
        const botY = (o.gapY ?? H / 2) + half;
        // Top
        if (topH > 0) {
          const tg = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
          tg.addColorStop(0, rgba(c, 0.1 + pulse)); tg.addColorStop(0.5, '#0d1117'); tg.addColorStop(1, rgba(c, 0.1 + pulse));
          ctx.fillStyle = tg; ctx.fillRect(o.x, 0, o.w, topH);
          // Circuit detail
          ctx.strokeStyle = rgba(c, 0.2); ctx.lineWidth = 1;
          for (let y = 10; y < topH - 5; y += 16) {
            ctx.strokeRect(o.x + 5, y, o.w - 10, 10);
            ctx.fillStyle = rgba(c, 0.3 + Math.sin(gs.phase * 3 + y * 0.1) * 0.2);
            ctx.beginPath(); ctx.arc(o.x + 10, y + 5, 2, 0, Math.PI * 2); ctx.fill();
          }
          // Edge glow
          const eg = ctx.createLinearGradient(o.x, topH - 6, o.x, topH);
          eg.addColorStop(0, 'transparent'); eg.addColorStop(1, rgba(c, 0.6 + pulse));
          ctx.fillStyle = eg; ctx.fillRect(o.x, topH - 6, o.w, 6);
          glow(o.x + o.w / 2, topH, 3, c, 10, 0.5);
        }
        // Bottom
        const botH = H - botY;
        if (botH > 0) {
          const bg2 = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
          bg2.addColorStop(0, rgba(c, 0.1 + pulse)); bg2.addColorStop(0.5, '#0d1117'); bg2.addColorStop(1, rgba(c, 0.1 + pulse));
          ctx.fillStyle = bg2; ctx.fillRect(o.x, botY, o.w, botH);
          ctx.strokeStyle = rgba(c, 0.2); ctx.lineWidth = 1;
          for (let y = botY + 10; y < H - 5; y += 16) {
            ctx.strokeRect(o.x + 5, y, o.w - 10, 10);
            ctx.fillStyle = rgba(c, 0.3 + Math.sin(gs.phase * 3 + y * 0.1) * 0.2);
            ctx.beginPath(); ctx.arc(o.x + 10, y + 5, 2, 0, Math.PI * 2); ctx.fill();
          }
          const eg = ctx.createLinearGradient(o.x, botY, o.x, botY + 6);
          eg.addColorStop(0, rgba(c, 0.6 + pulse)); eg.addColorStop(1, 'transparent');
          ctx.fillStyle = eg; ctx.fillRect(o.x, botY, o.w, 6);
          glow(o.x + o.w / 2, botY, 3, c, 10, 0.5);
        }
      }

      if (o.kind === 'barrier') {
        // Horizontal energy beam that oscillates up/down
        const by = o.beamY ?? H / 2;
        const bh = o.beamH ?? 24;
        // Beam body
        const bg2 = ctx.createLinearGradient(o.x, by - bh / 2, o.x, by + bh / 2);
        bg2.addColorStop(0, rgba(c, 0.05)); bg2.addColorStop(0.5, rgba(c, 0.35 + pulse)); bg2.addColorStop(1, rgba(c, 0.05));
        ctx.fillStyle = bg2; ctx.fillRect(o.x, by - bh / 2, o.w, bh);
        // Glow edge lines
        ctx.strokeStyle = rgba(c, 0.6); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o.x, by - bh / 2); ctx.lineTo(o.x + o.w, by - bh / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.x, by + bh / 2); ctx.lineTo(o.x + o.w, by + bh / 2); ctx.stroke();
        // Pulsing dots along beam
        for (let bx = o.x + 8; bx < o.x + o.w - 4; bx += 14) {
          glow(bx, by, 2, c, 6, 0.4 + Math.sin(gs.phase * 4 + bx * 0.05) * 0.2);
        }
        // Warning symbol
        ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = rgba(c, 0.5);
        ctx.fillText('⚡', o.x + o.w / 2, by + 4);
      }

      if (o.kind === 'orbs') {
        // Cluster of floating orbs with sine-wave motion
        for (const orb of (o.orbs ?? [])) {
          const oy = orb.cy + Math.sin(gs.phase * orb.speed + orb.phase) * 40;
          glow(o.x + o.w / 2, oy, orb.r, c, orb.r * 3, 0.7);
          // Orbital ring
          ctx.strokeStyle = rgba(c, 0.15 + Math.sin(gs.phase * 3 + orb.phase) * 0.08);
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(o.x + o.w / 2, oy, orb.r + 5, 0, Math.PI * 2); ctx.stroke();
          // Label
          ctx.font = '7px monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = rgba(c, 0.25);
          ctx.fillText('⊗', o.x + o.w / 2, oy + 2);
        }
      }

      if (o.kind === 'wall') {
        // Full-height wall with narrow slit
        const sy = o.slitY ?? H / 2;
        const sh = o.slitH ?? 80;
        // Top section
        const tg = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        tg.addColorStop(0, rgba(c, 0.08 + pulse)); tg.addColorStop(0.5, rgba(c, 0.2 + pulse)); tg.addColorStop(1, rgba(c, 0.08 + pulse));
        ctx.fillStyle = tg;
        ctx.fillRect(o.x, 0, o.w, sy - sh / 2);
        ctx.fillRect(o.x, sy + sh / 2, o.w, H - (sy + sh / 2));
        // Edge glows
        ctx.fillStyle = rgba(c, 0.5 + pulse);
        ctx.fillRect(o.x, sy - sh / 2 - 2, o.w, 2);
        ctx.fillRect(o.x, sy + sh / 2, o.w, 2);
        // Vertical scan lines
        ctx.strokeStyle = rgba(c, 0.1); ctx.lineWidth = 1;
        for (let wx = o.x + 4; wx < o.x + o.w; wx += 6) {
          ctx.beginPath(); ctx.moveTo(wx, 0); ctx.lineTo(wx, sy - sh / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx, sy + sh / 2); ctx.lineTo(wx, H); ctx.stroke();
        }
        // Slit indicator diamonds
        glow(o.x + o.w / 2, sy - sh / 2, 2, c, 8, 0.6);
        glow(o.x + o.w / 2, sy + sh / 2, 2, c, 8, 0.6);
      }

      // ── Schrödinger’s Cat ─────────────────────────────────────────────
      if (o.kind === 'cat') {
        const cy = o.catY ?? H / 2;
        const alive = o.catAlive ?? true;
        const cx = o.x + o.w / 2;
        const flicker = Math.sin(gs.phase * 8 + (o.catPhase ?? 0)) > 0;
        const catC = alive ? { r: 52, g: 211, b: 153 } : { r: 239, g: 68, b: 68 };
        const ghostA = 0.5 + Math.sin(gs.phase * 4) * 0.2;

        // Superposition ghost (opposite state, translucent)
        const ghostC = alive ? { r: 239, g: 68, b: 68 } : { r: 52, g: 211, b: 153 };
        if (flicker) {
          ctx.globalAlpha = 0.2;
          drawCatSprite(cx + 4, cy + 4, ghostC, 1.0);
          ctx.globalAlpha = 1.0;
        }

        // Main cat sprite
        drawCatSprite(cx, cy, catC, ghostA + 0.3);

        // "Observe?" label
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = rgba(catC, 0.5 + Math.sin(gs.phase * 3) * 0.2);
        ctx.fillText(alive ? '🐱 ALIVE?' : '💀 DEAD?', cx, cy - 28);

        // Box outline
        ctx.strokeStyle = rgba(catC, 0.3 + pulse); ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(cx - 18, cy - 22, 36, 44);
        ctx.setLineDash([]);

        // Quantum uncertainty particles
        if (gs.frame % 6 === 0) {
          const pc = flicker ? catC : ghostC;
          burst(gs.particles, cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 20, pc, 1, 1.5);
        }

        // Glow aura
        glow(cx, cy, 20, catC, 35, 0.15 + pulse * 0.5);
      }
    }

    // ── Collision ─────────────────────────────────────────────────────────
    function hits(o: Obstacle): boolean {
      const qx = gs.qX, qy = gs.qY, r = QUBIT_R;
      const H = canvas.height;
      if (qx + r < o.x || qx - r > o.x + o.w) return false;
      if (o.kind === 'gate') {
        const gap = o.gapSize ?? GAP_SIZE;
        const half = gap / 2;
        const gy = o.gapY ?? H / 2;
        return qy - r < gy - half || qy + r > gy + half;
      }
      if (o.kind === 'barrier') {
        const by = o.beamY ?? H / 2;
        const bh = o.beamH ?? 24;
        return qy + r > by - bh / 2 && qy - r < by + bh / 2;
      }
      if (o.kind === 'orbs') {
        for (const orb of (o.orbs ?? [])) {
          const oy = orb.cy + Math.sin(gs.phase * orb.speed + orb.phase) * 40;
          const dx = gs.qX - (o.x + o.w / 2);
          const dy = gs.qY - oy;
          if (Math.sqrt(dx * dx + dy * dy) < r + orb.r) return true;
        }
        return false;
      }
      if (o.kind === 'wall') {
        const sy = o.slitY ?? H / 2;
        const sh = o.slitH ?? 80;
        return qy - r < sy - sh / 2 || qy + r > sy + sh / 2;
      }
      if (o.kind === 'cat') {
        const cy = o.catY ?? H / 2;
        const cx = o.x + o.w / 2;
        const dx = qx - cx;
        const dy = qy - cy;
        return Math.sqrt(dx * dx + dy * dy) < r + 16; // 16px hit radius
      }
      return false;
    }

    // ── QL shockwave drawing ──────────────────────────────────────────────
    function drawQLEffect() {
      if (gs.qlActive <= 0) return;
      const progress = 1 - gs.qlActive / QL_DURATION;
      // Expanding rainbow rings
      for (let i = 0; i < 3; i++) {
        const ringProgress = (progress * 3 + i) % 1;
        const ringR = QUBIT_R + ringProgress * 60;
        const ringA = (1 - ringProgress) * 0.35;
        const rc = gc(gs.cPhase + i * 1.5);
        ctx.strokeStyle = rgba(rc, ringA);
        ctx.lineWidth = 2 - ringProgress * 1.5;
        ctx.beginPath(); ctx.arc(gs.qX, gs.qY, ringR, 0, Math.PI * 2); ctx.stroke();
      }
      // Horizontal phase streak
      const streakW = 200 + progress * 300;
      const streakH = 4 + Math.sin(gs.phase * 8) * 2;
      const sg = ctx.createLinearGradient(gs.qX, gs.qY, gs.qX - streakW, gs.qY);
      sg.addColorStop(0, rgba(gc(gs.cPhase), 0.5));
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.fillRect(gs.qX - streakW, gs.qY - streakH / 2, streakW, streakH);
      // Screen edge vignette
      ctx.fillStyle = rgba(gc(gs.cPhase + 2), 0.03 + Math.sin(gs.phase * 6) * 0.02);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ── Spawn an obstacle ─────────────────────────────────────────────────
    function spawnObs() {
      const H = canvas.height;
      const kinds: ObstacleKind[] = ['gate', 'barrier', 'orbs', 'wall'];
      // Easy start: only simple gates early. Mix in others gradually.
      let kind: ObstacleKind;
      const roll = Math.random();
      if (gs.score < 5) {
        kind = 'gate'; // first 5 are always easy gates
      } else if (gs.score < 12) {
        kind = roll < 0.6 ? 'gate' : roll < 0.85 ? 'barrier' : 'wall';
      } else if (gs.score < 20) {
        // Cats start appearing at score 15, rare (~8%)
        if (gs.score >= 15 && roll > 0.92) { kind = 'cat'; }
        else if (roll < 0.4) { kind = 'gate'; }
        else if (roll < 0.65) { kind = 'barrier'; }
        else if (roll < 0.85) { kind = 'wall'; }
        else { kind = 'orbs'; }
      } else {
        // After 20: cats ~12%, rest split evenly
        if (roll > 0.88) { kind = 'cat'; }
        else { kind = kinds[Math.floor((roll / 0.88) * kinds.length)]; }
      }

      gs.obsCounter++;
      const ci = gs.obsCounter;
      const baseObs: Obstacle = { kind, x: canvas.width + 10, w: 52, scored: false, colorIdx: ci };

      if (kind === 'gate') {
        // Gap shrinks with score: starts huge (GAP_SIZE), shrinks to ~130 at score 30+
        const shrink = Math.min(70, gs.score * 2.3);
        const gap = GAP_SIZE - shrink;
        baseObs.gapSize = gap; // store actual gap for this gate
        const margin = gap / 2 + 30;
        baseObs.gapY = margin + Math.random() * (H - margin * 2);
      }
      if (kind === 'barrier') {
        // Barrier width & height grow with score
        const diff = Math.min(1, gs.score / 30);
        baseObs.w = 120 + diff * 100 + Math.random() * 80;
        baseObs.beamY = 80 + Math.random() * (H - 160);
        baseObs.beamH = 14 + diff * 14 + Math.random() * 10;
        baseObs.beamDir = Math.random() > 0.5 ? 1 : -1;
        baseObs.beamSpeed = 0.4 + diff * 1.0 + Math.random() * 0.6;
      }
      if (kind === 'orbs') {
        baseObs.w = 30;
        const diff = Math.min(1, gs.score / 30);
        const orbCount = 2 + Math.floor(diff * 3 + Math.random() * 2);
        baseObs.orbs = [];
        for (let i = 0; i < orbCount; i++) {
          baseObs.orbs.push({
            cy: 60 + Math.random() * (H - 120),
            r: 6 + diff * 4 + Math.random() * 4,
            phase: Math.random() * Math.PI * 2,
            speed: 1.0 + diff * 1.5 + Math.random() * 1,
          });
        }
      }
      if (kind === 'wall') {
        baseObs.w = 24;
        // Slit starts very wide, shrinks with score
        const diff = Math.min(1, gs.score / 30);
        baseObs.slitH = 160 - diff * 70 + Math.random() * 30; // 160→~90
        baseObs.slitY = baseObs.slitH / 2 + 30 + Math.random() * (H - baseObs.slitH - 60);
      }
      if (kind === 'cat') {
        baseObs.w = 36;
        baseObs.catY = 80 + Math.random() * (H - 160);
        baseObs.catVelY = 0;
        baseObs.catPhase = Math.random() * Math.PI * 2;
        baseObs.catAlive = Math.random() > 0.5;
      }

      gs.obstacles.push(baseObs);
    }

    // ═══════════════════════════════════════════════════════════════════════
    function loop() {
      gs.phase += 0.05;
      gs.cPhase += 0.012;

      // Screen shake — always save/restore for clean frame
      let shaking = false;
      if (gs.shakeFrames > 0) {
        gs.shakeFrames--;
        shaking = true;
        const sx = (Math.random() - 0.5) * gs.shakeIntensity;
        const sy = (Math.random() - 0.5) * gs.shakeIntensity;
        gs.shakeIntensity *= 0.9; // decay
        ctx.save();
        ctx.translate(sx, sy);
      }
      // Milestone flash overlay countdown
      if (gs.milestoneFlash > 0) gs.milestoneFlash--;

      drawBg();
      const mainC = gc(gs.cPhase);
      const H = canvas.height;

      // ── Idle ────────────────────────────────────────────────────────────
      if (gs.state === 'idle') {
        const bobY = H / 2 + Math.sin(gs.phase * 1.5) * 18;
        // Orbiting dots
        for (let i = 0; i < 3; i++) {
          const a = gs.phase * 2 + (i * Math.PI * 2) / 3;
          const or2 = 22 + Math.sin(gs.phase * 0.5 + i) * 4;
          glow(QUBIT_START_X + Math.cos(a) * or2, bobY + Math.sin(a) * or2 * 0.6, 2, gc(gs.cPhase + i * 0.8), 6, 0.5);
        }
        glow(QUBIT_START_X, bobY, QUBIT_R, mainC, 24);
        // Rings
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = rgba(gc(gs.cPhase + i * 1.5), 0.18);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(QUBIT_START_X, bobY, QUBIT_R + 8 + i * 7 + Math.sin(gs.phase * (2 + i)) * 3, 0, Math.PI * 2); ctx.stroke();
        }
        // Title
        ctx.font = 'bold 32px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = rgba(mainC, 1); ctx.shadowColor = rgba(mainC, 0.8); ctx.shadowBlur = 25;
        ctx.fillText('QUANTUM DRIFT', canvas.width / 2, H / 2 - 60);
        ctx.shadowBlur = 0;
        // Controls
        ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.7)';
        ctx.fillText('← ↑ ↓ →  Move    SPACE  Quantum Leap', canvas.width / 2, H / 2 + 30);
        if (Math.sin(gs.phase * 3) > 0) {
          ctx.fillStyle = rgba(gc(gs.cPhase + 1), 0.8);
          ctx.fillText('[ Press any key to start ]', canvas.width / 2, H / 2 + 55);
        }
        if (gs.highQubits > 0) {
          ctx.font = '12px monospace'; ctx.fillStyle = rgba(gc(gs.cPhase + 2), 0.6);
          ctx.fillText(`BEST: ⟨Ψ⟩ ${gs.highQubits}`, canvas.width / 2, H / 2 + 85);
        }
        drawParticles();
        animId = requestAnimationFrame(loop);
        return;
      }

      // ── Paused ──────────────────────────────────────────────────────────
      if (gs.state === 'paused') {
        // Draw frozen game scene
        for (const o of gs.obstacles) drawObs(o);
        glow(gs.qX, gs.qY, QUBIT_R, mainC, 24);
        drawParticles();
        // Dim overlay
        ctx.fillStyle = 'rgba(5,10,21,0.65)';
        ctx.fillRect(0, 0, canvas.width, H);
        // Pause text
        ctx.textAlign = 'center';
        ctx.font = 'bold 28px monospace';
        ctx.fillStyle = rgba(mainC, 0.9); ctx.shadowColor = rgba(mainC, 0.6); ctx.shadowBlur = 20;
        ctx.fillText('PAUSED', canvas.width / 2, H / 2 - 20);
        ctx.shadowBlur = 0;
        ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.6)';
        ctx.fillText('P / SPACE / ESC  to resume', canvas.width / 2, H / 2 + 15);
        // Still show HUD
        ctx.textAlign = 'left'; ctx.font = 'bold 16px monospace';
        ctx.fillStyle = rgba(mainC, 0.5);
        ctx.fillText(`⟨Ψ⟩ ${gs.qubits}`, 16, 30);
        ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.3)';
        ctx.fillText(`GATES: ${gs.score}  ·  SPEED: ${gs.speed.toFixed(1)}x`, 16, 48);
        drawFloatTexts();
        if (shaking) ctx.restore();
        animId = requestAnimationFrame(loop);
        return;
      }

      // ── Playing ─────────────────────────────────────────────────────────
      if (gs.state === 'playing') {
        gs.frame++;

        // Movement: hover by default, arrows to move in all directions
        // Invert controls when invertTimer active
        const inv = gs.invertTimer > 0;
        if ((inv ? gs.downHeld : gs.upHeld)) gs.qVel -= MOVE_ACCEL;
        if ((inv ? gs.upHeld : gs.downHeld)) gs.qVel += MOVE_ACCEL;
        if ((inv ? gs.rightHeld : gs.leftHeld)) gs.qXVel -= MOVE_ACCEL * 0.7;
        if ((inv ? gs.leftHeld : gs.rightHeld)) gs.qXVel += MOVE_ACCEL * 0.7;
        gs.qVel = Math.max(-MAX_VEL, Math.min(MAX_VEL, gs.qVel));
        gs.qXVel = Math.max(-MAX_VEL_X, Math.min(MAX_VEL_X, gs.qXVel));
        gs.qVel *= FRICTION;
        gs.qXVel *= FRICTION;
        gs.qY += gs.qVel;
        gs.qX += gs.qXVel;
        // Clamp
        gs.qY = Math.max(QUBIT_R + 2, Math.min(H - QUBIT_R - 2, gs.qY));
        gs.qX = Math.max(QUBIT_R + 2, Math.min(canvas.width - QUBIT_R - 2, gs.qX));

        // Speed
        gs.speed = Math.min(MAX_SPEED, BASE_SPEED + gs.score * SPEED_INC);
        // Update music difficulty to match game speed
        musicRef.current?.setDifficulty((gs.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));

        // QL tick
        if (gs.qlActive > 0) gs.qlActive--;
        if (gs.qlActive === 0 && gs.qlCooldown > 0) gs.qlCooldown--;
        // Invert timer tick
        if (gs.invertTimer > 0) gs.invertTimer--;
        // QL trail particles
        if (gs.qlActive > 0 && gs.frame % 2 === 0) {
          burst(gs.particles, gs.qX - 8, gs.qY, gc(gs.cPhase + Math.random() * 3), 2, 2);
        }

        // Combo decay — if no gate passed in 180 frames, combo resets
        gs.comboTimer++;
        if (gs.comboTimer > 180 && gs.combo > 0) { gs.combo = 0; }

        // Qubit accumulation: +1 every 3 frames (combo multiplied), bonus when passing gates
        if (gs.frame % 3 === 0) gs.qubits += 1 + Math.floor(gs.combo * 0.5);

        // Spawn — wide gap early, tightens slowly
        const interval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - gs.score * 3);
        if (gs.frame % Math.round(interval) === 0) spawnObs();

        // ── Spawn lasers — start appearing at score 8, chance increases ──
        if (gs.score >= 8 && gs.frame % 90 === 0) {
          const laserChance = Math.min(0.35, 0.08 + gs.score * 0.006);
          if (Math.random() < laserChance) {
            gs.lasers.push({
              x: canvas.width + 20,
              y: 50 + Math.random() * (H - 100),
              fireCountdown: LASER_WARN_FRAMES,
              firing: false,
              fireLife: LASER_FIRE_FRAMES,
              beamAngle: 0, // horizontal beam
              colorIdx: gs.obsCounter++,
              warned: false,
            });
          }
        }

        // Move obstacles & oscillate barriers
        for (const o of gs.obstacles) {
          o.x -= gs.speed;
          if (o.kind === 'barrier' && o.beamY !== undefined) {
            o.beamY += (o.beamDir ?? 1) * (o.beamSpeed ?? 1);
            if (o.beamY < 60 || o.beamY > H - 60) o.beamDir = -(o.beamDir ?? 1);
          }
          // Cat: bob vertically + randomly flip alive/dead state (superposition!)
          if (o.kind === 'cat' && o.catY !== undefined) {
            o.catY += (o.catVelY ?? 0);
            o.catVelY = (o.catVelY ?? 0) + Math.sin(gs.phase * 1.5 + (o.catPhase ?? 0)) * 0.15;
            o.catVelY = (o.catVelY ?? 0) * 0.95;
            o.catY = Math.max(40, Math.min(H - 40, o.catY));
            // Quantum state flip — every ~45 frames
            if (gs.frame % 45 === 0 && Math.random() < 0.5) {
              o.catAlive = !o.catAlive;
              burst(gs.particles, o.x + o.w / 2, o.catY, o.catAlive ? { r: 52, g: 211, b: 153 } : { r: 239, g: 68, b: 68 }, 4, 2);
            }
          }
          if (!o.scored && o.x + o.w < gs.qX) {
            o.scored = true;
            gs.score++;
            // Combo system
            if (gs.comboTimer < 120) { gs.combo = Math.min(gs.combo + 1, 10); } else { gs.combo = 1; }
            gs.comboTimer = 0;
            const comboMult = 1 + gs.combo * 0.3;
            const earned = Math.round((10 + gs.score * 2) * comboMult);
            gs.qubits += earned;
            // Float text popup
            const popY = o.gapY ?? o.beamY ?? o.slitY ?? o.catY ?? H / 2;
            gs.floatTexts.push({ x: o.x + o.w, y: popY, text: `+${earned}`, life: 80, maxLife: 80, color: gc(o.colorIdx * 0.7), size: 14 });
            if (gs.combo >= 3) {
              gs.floatTexts.push({ x: o.x + o.w, y: popY - 18, text: `×${gs.combo} COMBO`, life: 90, maxLife: 90, color: { r: 251, g: 191, b: 36 }, size: 11 });
            }
            // Milestone celebration every 10 gates
            if (gs.score % 10 === 0 && gs.score > gs.lastMilestone) {
              gs.lastMilestone = gs.score;
              gs.milestoneFlash = 30;
              for (let ci = 0; ci < GLOW.length; ci++) burst(gs.particles, canvas.width / 2, H / 2, GLOW[ci], 6, 6);
              gs.floatTexts.push({ x: canvas.width / 2, y: H / 2 - 30, text: `⟨${gs.score} GATES⟩ ENTANGLED`, life: 120, maxLife: 120, color: { r: 52, g: 211, b: 153 }, size: 20 });
            }
            forceRender(n => n + 1);
            // QL charge earned?
            if (gs.score % QL_EARN_EVERY === 0) {
              gs.qlCharges++;
              burst(gs.particles, gs.qX, gs.qY, { r: 255, g: 255, b: 255 }, 8, 3);
            }
            burst(gs.particles, o.x + o.w, o.gapY ?? o.beamY ?? o.slitY ?? H / 2, gc(o.colorIdx * 0.7), 8);
          }
        }
        gs.obstacles = gs.obstacles.filter(o => o.x + o.w > -20);

        // ── Update & draw lasers ──────────────────────────────────────
        for (const las of gs.lasers) {
          las.x -= gs.speed;
          if (las.fireCountdown > 0) {
            las.fireCountdown--;
            // Warning phase: pulsing red marker at emitter position
            const warnA = 0.3 + Math.sin(gs.phase * 12) * 0.4;
            const warnC: C3 = { r: 255, g: 60, b: 60 };
            glow(las.x, las.y, 4, warnC, 18, warnA);
            // Warning line — thin dashed preview
            ctx.strokeStyle = rgba(warnC, warnA * 0.4);
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 8]);
            ctx.beginPath(); ctx.moveTo(las.x, las.y); ctx.lineTo(0, las.y); ctx.stroke();
            ctx.setLineDash([]);
            // "!" warning text
            ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
            ctx.fillStyle = rgba(warnC, warnA);
            ctx.fillText('!', las.x, las.y - 14);
          } else if (!las.firing) {
            las.firing = true;
          }
          if (las.firing) {
            las.fireLife--;
            const beamC: C3 = { r: 255, g: 40, b: 40 };
            const beamA = Math.min(1, las.fireLife / 8); // fade out at end
            // Beam: thick red line from emitter to left edge
            const beamW = 4 + Math.sin(gs.phase * 16) * 1.5;
            ctx.shadowColor = rgba(beamC, 0.8); ctx.shadowBlur = 12;
            ctx.strokeStyle = rgba(beamC, beamA * 0.9);
            ctx.lineWidth = beamW;
            ctx.beginPath(); ctx.moveTo(las.x, las.y); ctx.lineTo(0, las.y); ctx.stroke();
            ctx.shadowBlur = 0;
            // Core white line
            ctx.strokeStyle = `rgba(255,255,255,${beamA * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(las.x, las.y); ctx.lineTo(0, las.y); ctx.stroke();
            // Emitter glow
            glow(las.x, las.y, 6, beamC, 20, beamA * 0.7);
            // Sparks along beam
            if (gs.frame % 3 === 0) {
              const sparkX = Math.random() * las.x;
              burst(gs.particles, sparkX, las.y + (Math.random() - 0.5) * 4, beamC, 1, 1.5);
            }
            // Collision with player (ignored during QL)
            if (gs.qlActive === 0 && gs.invertTimer === 0) {
              const dy = Math.abs(gs.qY - las.y);
              if (dy < QUBIT_R + beamW / 2 + 2 && gs.qX < las.x) {
                gs.invertTimer = INVERT_DURATION;
                gs.shakeFrames = 10;
                gs.shakeIntensity = 6;
                burst(gs.particles, gs.qX, gs.qY, { r: 255, g: 60, b: 60 }, 12, 4);
                gs.floatTexts.push({ x: gs.qX, y: gs.qY - 30, text: 'INVERTED!', life: 120, maxLife: 120, color: { r: 255, g: 60, b: 60 }, size: 16 });
                las.fireLife = 0; // consume laser
              }
            }
          }
        }
        gs.lasers = gs.lasers.filter(l => l.x > -10 && (l.fireCountdown > 0 || l.fireLife > 0));

        // Draw obstacles
        for (const o of gs.obstacles) drawObs(o);

        // QL effect
        drawQLEffect();

        // Draw qubit — if QL active, make it flicker/phase
        const qlAlpha = gs.qlActive > 0 ? (0.3 + Math.sin(gs.phase * 12) * 0.3) : 1;

        // ── Qubit — matching idle screen style ──
        const speedFactor = Math.min(1, (gs.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));
        const sx = gs.qX, sy = gs.qY;

        // Energy wisps trailing behind at speed
        if (gs.frame % 2 === 0) {
          const exN = 1 + Math.floor(speedFactor * 2);
          for (let ei = 0; ei < exN; ei++) {
            const spread = 3 + speedFactor * 5;
            gs.particles.push({
              x: sx - QUBIT_R - 4, y: sy + (Math.random() - 0.5) * spread,
              vx: -1.5 - Math.random() * (1 + speedFactor * 3),
              vy: (Math.random() - 0.5) * 1.2,
              life: 10 + Math.random() * 12, maxLife: 22,
              color: gc(gs.cPhase + Math.random()), size: 1 + Math.random() * 2,
            });
          }
        }

        // Orbiting dots
        for (let i = 0; i < 3; i++) {
          const a = gs.phase * 2 + (i * Math.PI * 2) / 3;
          const or2 = 22 + Math.sin(gs.phase * 0.5 + i) * 4;
          glow(sx + Math.cos(a) * or2, sy + Math.sin(a) * or2 * 0.6, 2, gc(gs.cPhase + i * 0.8), 6, 0.5 * qlAlpha);
        }
        // Main orb
        const pr = 24 + Math.sin(gs.phase * 3) * 4;
        glow(sx, sy, QUBIT_R, mainC, pr, qlAlpha);
        // Core
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + Math.sin(gs.phase * 4) * 0.15) * qlAlpha})`;
        ctx.beginPath(); ctx.arc(sx, sy, QUBIT_R * 0.4, 0, Math.PI * 2); ctx.fill();
        // Rings
        for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = rgba(gc(gs.cPhase + i * 1.5), (0.18 - i * 0.05) * qlAlpha);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(sx, sy, QUBIT_R + 8 + i * 7 + Math.sin(gs.phase * (2 + i)) * 3, 0, Math.PI * 2); ctx.stroke();
        }

        drawParticles();

        // Collision (ignored during QL)
        if (gs.qlActive === 0) {
          for (const o of gs.obstacles) {
            if (hits(o)) {
              gs.state = 'dead';
              gs.quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
              if (gs.qubits > gs.highQubits) {
                gs.highQubits = gs.qubits;
                localStorage.setItem('qdrift-highqubits', String(gs.qubits));
              }
              // Death explosion + screen shake
              for (let ci = 0; ci < GLOW.length; ci++) burst(gs.particles, gs.qX, gs.qY, GLOW[ci], 8, 6);
              gs.shakeFrames = 20;
              gs.shakeIntensity = 12;
              gs.combo = 0;
              musicRef.current?.stop();
              musicRef.current?.playDeathSound();
              forceRender(n => n + 1);
              break;
            }
          }
        }

        // HUD ─────────────────────────────────────────────────────────────
        ctx.textAlign = 'left';
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = rgba(mainC, 0.9); ctx.shadowColor = rgba(mainC, 0.5); ctx.shadowBlur = 8;
        ctx.fillText(`⟨Ψ⟩ ${gs.qubits}`, 16, 30);
        ctx.shadowBlur = 0;
        ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.5)';
        ctx.fillText(`GATES: ${gs.score}  ·  SPEED: ${gs.speed.toFixed(1)}x`, 16, 48);
        // QL charges — drawn on top-left below score (ESC button is top-right)
        const qlC = gs.qlActive > 0 ? gc(gs.cPhase) : { r: 168, g: 85, b: 247 };
        ctx.textAlign = 'left';
        ctx.font = 'bold 13px monospace';
        ctx.fillStyle = rgba(qlC, gs.qlCharges > 0 || gs.qlActive > 0 ? 0.9 : 0.35);
        ctx.shadowColor = rgba(qlC, 0.4); ctx.shadowBlur = gs.qlActive > 0 ? 12 : 0;
        const qlText = gs.qlActive > 0 ? '◈ QUANTUM LEAP ACTIVE' : `◈ QL ×${gs.qlCharges}`;
        ctx.fillText(qlText, 16, 68);
        ctx.shadowBlur = 0;
        // Next QL progress bar
        if (gs.qlActive === 0) {
          const prog = (gs.score % QL_EARN_EVERY) / QL_EARN_EVERY;
          const barW = 80;
          ctx.fillStyle = 'rgba(100,100,120,0.25)';
          ctx.fillRect(16, 76, barW, 5);
          ctx.fillStyle = rgba(qlC, 0.5);
          ctx.fillRect(16, 76, barW * prog, 5);
        }
        // Combo indicator
        if (gs.combo >= 2) {
          const comboC = gs.combo >= 7 ? { r: 251, g: 191, b: 36 } : gs.combo >= 4 ? { r: 52, g: 211, b: 153 } : { r: 148, g: 163, b: 184 };
          ctx.font = `bold ${12 + Math.min(gs.combo, 8)}px monospace`; ctx.textAlign = 'left';
          ctx.fillStyle = rgba(comboC, 0.8 + Math.sin(gs.phase * 6) * 0.2);
          ctx.shadowColor = rgba(comboC, 0.5); ctx.shadowBlur = gs.combo >= 5 ? 10 : 0;
          ctx.fillText(`×${gs.combo} COMBO`, 16, 98);
          ctx.shadowBlur = 0;
        }
        // Invert controls HUD warning
        if (gs.invertTimer > 0) {
          const invSec = Math.ceil(gs.invertTimer / 60);
          const invPulse = 0.6 + Math.sin(gs.phase * 8) * 0.4;
          const invC: C3 = { r: 255, g: 60, b: 60 };
          ctx.textAlign = 'right';
          ctx.font = 'bold 14px monospace';
          ctx.fillStyle = rgba(invC, invPulse);
          ctx.shadowColor = rgba(invC, 0.6); ctx.shadowBlur = 10;
          ctx.fillText(`⟨INVERTED⟩ ${invSec}s`, canvas.width - 16, 30);
          ctx.shadowBlur = 0;
          // Subtle red border vignette
          ctx.strokeStyle = rgba(invC, 0.08 + Math.sin(gs.phase * 6) * 0.04);
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, canvas.width - 4, H - 4);
        }
        // Milestone flash overlay
        if (gs.milestoneFlash > 0) {
          const fa = (gs.milestoneFlash / 30) * 0.08;
          ctx.fillStyle = `rgba(52,211,153,${fa})`;
          ctx.fillRect(0, 0, canvas.width, H);
        }
        drawFloatTexts();
      }

      // ── Dead ────────────────────────────────────────────────────────────
      if (gs.state === 'dead') {
        for (const o of gs.obstacles) drawObs(o);
        const dc: C3 = { r: 239, g: 68, b: 68 };
        glow(gs.qX, gs.qY, QUBIT_R, dc, 30);
        drawParticles();
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px monospace'; ctx.fillStyle = rgba(dc, 1);
        ctx.shadowColor = rgba(dc, 0.8); ctx.shadowBlur = 20;
        ctx.fillText(gs.quip, canvas.width / 2, H / 2 - 40);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 16px monospace'; ctx.fillStyle = rgba(gc(gs.cPhase), 1);
        ctx.fillText(`⟨Ψ⟩ ${gs.qubits} QUBITS`, canvas.width / 2, H / 2 + 5);
        ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(148,163,184,0.7)';
        ctx.fillText(`${gs.score} gates  ·  ${gs.speed.toFixed(1)}x`, canvas.width / 2, H / 2 + 28);
        if (gs.qubits >= gs.highQubits && gs.qubits > 0) {
          ctx.font = '12px monospace'; ctx.fillStyle = '#059669';
          ctx.shadowColor = 'rgba(5,150,105,0.5)'; ctx.shadowBlur = 10;
          ctx.fillText('★ NEW RECORD ★', canvas.width / 2, H / 2 + 55);
          ctx.shadowBlur = 0;
        }
        if (Math.sin(gs.phase * 3) > 0) {
          ctx.font = '13px monospace'; ctx.fillStyle = rgba(gc(gs.cPhase + 1), 0.7);
          ctx.fillText('[ TAP / any key to re-initialize ]', canvas.width / 2, H / 2 + 80);
        }
      }

      drawFloatTexts();
      if (shaking) ctx.restore();
      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#000' }}>
      <canvas
        ref={canvasRef}
        width={dimRef.current.w}
        height={dimRef.current.h}
        style={{ display: 'block', width: '100vw', height: '100vh', cursor: 'pointer' }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'fixed', top: 16, right: 16,
          padding: '6px 14px', borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(100,100,120,0.3)',
          color: 'rgba(148,163,184,0.6)',
          fontFamily: 'monospace', fontSize: 11,
          cursor: 'pointer', zIndex: 10000,
        }}
      >
        ESC ✕
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); musicRef.current?.toggleMute(); forceRender(n => n + 1); }}
        style={{
          position: 'fixed', top: 16, right: 90,
          padding: '6px 14px', borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(100,100,120,0.3)',
          color: 'rgba(148,163,184,0.6)',
          fontFamily: 'monospace', fontSize: 11,
          cursor: 'pointer', zIndex: 10000,
        }}
      >
        {musicRef.current?.muted ? '🔇 MUTED' : '🔊 M'}
      </button>
    </div>
  );
}
