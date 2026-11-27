/**
 * Synthesizes a 65-second studio-warm soothing felt-piano, music-box & cello pad
 * soundtrack in F Major (72 BPM) + synced SFX (butt-pat thumps, shutter click, soft rain)
 * in pure Node.js (48 kHz stereo PCM WAV), then mixed with the real cat purr sample via FFmpeg.
 */
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000;
const DUR = 65.0;
const N = Math.floor(SR * DUR);

const L = new Float32Array(N);
const R = new Float32Array(N);

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Deterministic PRNG for organic humanization & rain
let seed = 20261127;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Warm felt-piano / Rhodes tone with gentle hammer bloom & natural harmonic rolloff */
function addFeltNote(startSec, midi, durSec, vel = 0.22, pan = 0, bright = 0.5) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.min(N - s0, Math.floor((durSec + 1.4) * SR));
  if (s0 < 0 || len <= 0) return;

  const f0 = midiToHz(midi);
  const gL = Math.cos((pan + 1) * Math.PI * 0.25) * vel;
  const gR = Math.sin((pan + 1) * Math.PI * 0.25) * vel;
  const attack = 0.014;
  const decay = Math.max(0.6, durSec * 1.15);

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t / attack)) * Math.exp(-t / decay);
    const h2 = 0.26 * bright * Math.exp(-t * 2.2);
    const h3 = 0.09 * bright * Math.exp(-t * 3.8);
    const w = 2 * Math.PI * f0 * t;
    // Slight warm detuned chorus voice
    const sig =
      (Math.sin(w) + 0.18 * Math.sin(w * 1.0018 + 0.4) + h2 * Math.sin(w * 2) + h3 * Math.sin(w * 3)) *
      env;
    L[s0 + i] += sig * gL;
    R[s0 + i] += sig * gR;
  }
}

/** Delicate music-box / celesta bell sparkle */
function addCelesta(startSec, midi, vel = 0.10, pan = 0) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.min(N - s0, Math.floor(2.2 * SR));
  if (s0 < 0 || len <= 0) return;
  const f0 = midiToHz(midi);
  const gL = Math.cos((pan + 1) * Math.PI * 0.25) * vel;
  const gR = Math.sin((pan + 1) * Math.PI * 0.25) * vel;

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.72);
    const w = 2 * Math.PI * f0 * t;
    const sig = (Math.sin(w) + 0.14 * Math.sin(w * 2.756) * Math.exp(-t * 6)) * env;
    L[s0 + i] += sig * gL;
    R[s0 + i] += sig * gR;
  }
}

/** Warm velvet cello / string pad */
function addPadChord(startSec, durSec, midis, vel = 0.045) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.min(N - s0, Math.floor((durSec + 1.2) * SR));
  if (s0 < 0 || len <= 0) return;

  for (let mIdx = 0; mIdx < midis.length; mIdx++) {
    const f0 = midiToHz(midis[mIdx]);
    const pan = (mIdx / Math.max(1, midis.length - 1) - 0.5) * 0.65;
    const gL = Math.cos((pan + 1) * Math.PI * 0.25) * vel;
    const gR = Math.sin((pan + 1) * Math.PI * 0.25) * vel;
    const ph = rand() * Math.PI * 2;

    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const atk = Math.min(1, t / 0.85);
      const rel = t > durSec ? Math.exp(-(t - durSec) / 0.55) : 1;
      const vib = 1 + 0.0022 * Math.sin(2 * Math.PI * 4.4 * t + ph);
      const w = 2 * Math.PI * f0 * vib * t + ph;
      const sig = (Math.sin(w) + 0.28 * Math.sin(w * 2) + 0.08 * Math.sin(w * 3)) * atk * rel;
      L[s0 + i] += sig * gL;
      R[s0 + i] += sig * gR;
    }
  }
}

/** Soft cushioned bongo butt-pat thump */
function addButtPatSfx(startSec, combo = 0) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.min(N - s0, Math.floor(0.16 * SR));
  if (s0 < 0 || len <= 0) return;
  const baseHz = 94 + combo * 5;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = baseHz * (0.62 + 0.82 * Math.exp(-t / 0.032));
    phase += (2 * Math.PI * f) / SR;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.042);
    const sig = Math.sin(phase) * env * 0.22;
    L[s0 + i] += sig;
    R[s0 + i] += sig;
  }
}

/** Crisp Polaroid camera shutter click */
function addShutterSfx(startSec) {
  for (const [off, amp] of [
    [0.0, 0.24],
    [0.045, 0.18],
  ]) {
    const s0 = Math.floor((startSec + off) * SR);
    const len = Math.min(N - s0, Math.floor(0.038 * SR));
    if (s0 < 0 || len <= 0) return;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.011);
      const wn = rand() * 2 - 1;
      const hp = wn - prev * 0.72;
      prev = wn;
      const sig = hp * env * amp;
      L[s0 + i] += sig;
      R[s0 + i] += sig;
    }
  }
}

/** Cozy rainy afternoon window ASMR (56.0s -> 60.2s) */
function addRainAmbience(startSec, endSec) {
  const s0 = Math.floor(startSec * SR);
  const s1 = Math.min(N, Math.floor(endSec * SR));
  let b0 = 0, b1 = 0, b2 = 0, lp = 0;
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const fadeIn = Math.min(1, (t - startSec) / 0.9);
    const fadeOut = Math.min(1, (endSec - t) / 1.1);
    const env = Math.max(0, Math.min(fadeIn, fadeOut));
    const white = rand() * 2 - 1;
    b0 = 0.996 * b0 + white * 0.06;
    b1 = 0.985 * b1 + white * 0.09;
    b2 = 0.94 * b2 + white * 0.14;
    const pink = (b0 + b1 + b2) * 0.16;
    lp += (pink - lp) * 0.14;
    const sig = lp * env * 0.22;
    L[i] += sig * 0.95;
    R[i] += sig * 1.05;
  }
}

// ============================================================================
// Composition: 65-second Healing F-Major Felt-Piano & Music-Box Score (72 BPM)
// ============================================================================
const beat = 60 / 72; // 0.8333s per beat, 3.333s per bar (~19.5 bars total)

// 4-bar heartwarming chord cycle in F Major: Fmaj7 -> Dm9 -> Bbmaj7 -> C9sus4
const CHORDS = [
  { bass: 53, notes: [60, 64, 69, 72] }, // Fmaj7
  { bass: 50, notes: [57, 60, 64, 69] }, // Dm9
  { bass: 46, notes: [53, 57, 62, 65] }, // Bbmaj7
  { bass: 48, notes: [55, 60, 62, 67] }, // C9sus4
];

// Tender Ghibli-inspired melody phrases (MIDI notes on 8th-note grid, null = rest)
const MELODY_A = [
  77, null, 76, 72, 74, null, 69, null, // F5 E5 C5 D5 A4
  72, null, 74, 76, 72, null, null, null, // C5 D5 E5 C5
  74, null, 72, 69, 70, null, 69, 65, // D5 C5 A4 Bb4 A4 F4
  67, null, 69, 72, 67, null, null, null, // G4 A4 C5 G4
];
const MELODY_B = [
  81, null, 79, 77, 76, null, 72, null, // A5 G5 F5 E5 C5
  74, null, 76, 77, 74, null, null, null, // D5 E5 F5 D5
  77, null, 74, 72, 70, null, 69, 65, // F5 D5 C5 Bb4 A4 F4
  69, null, 72, 74, 72, null, null, null, // A4 C5 D5 C5
];

for (let bar = 0; bar < 19; bar++) {
  const barStart = bar * 4 * beat;
  if (barStart >= 62.5) break;
  const ch = CHORDS[bar % 4];
  const isAct1 = barStart < 10;
  const isAct34 = barStart >= 22 && barStart < 46;
  const isAct5 = barStart >= 46 && barStart < 56;
  const isAct6 = barStart >= 56;

  // Warm bass & broken arpeggio
  const velBase = isAct6 ? 0.14 : isAct1 ? 0.16 : isAct5 ? 0.22 : 0.19;
  addFeltNote(barStart, ch.bass, 3.2, velBase * 1.05, -0.22, 0.35);

  const arpPattern = [0, 1, 2, 3, 2, 1, 3, 2];
  for (let step = 0; step < 8; step++) {
    const tNote = barStart + step * (beat * 0.5) + (rand() - 0.5) * 0.012;
    if (tNote >= 63.2) break;
    const n = ch.notes[arpPattern[step]];
    const v = velBase * (step % 2 === 0 ? 0.72 : 0.52);
    addFeltNote(tNote, n, beat * 1.6, v, (step % 2 === 0 ? -0.15 : 0.18), 0.45);
  }

  // Warm velvet cello pad from Act 2 onwards
  if (barStart >= 9.5 && barStart < 60.5) {
    const padVel = isAct5 ? 0.044 : isAct6 ? 0.028 : 0.032;
    addPadChord(barStart, 4 * beat, [ch.bass, ch.notes[0], ch.notes[2]], padVel);
  }

  // Lyrical melody from bar 3 (10s) to bar 17
  if (bar >= 3 && bar < 18) {
    const phrase = (Math.floor((bar - 3) / 4) % 2 === 0) ? MELODY_A : MELODY_B;
    const offset = ((bar - 3) % 4) * 8;
    for (let s = 0; s < 8; s++) {
      const m = phrase[offset + s];
      if (m !== null && m !== undefined) {
        const tMel = barStart + s * (beat * 0.5) + (rand() - 0.5) * 0.01;
        if (tMel < 62.5) {
          addFeltNote(tMel, m, beat * 1.4, isAct6 ? 0.15 : 0.21, 0.14, 0.62);
          if (isAct34 || isAct6) {
            addCelesta(tMel + 0.008, m + 12, isAct6 ? 0.065 : 0.055, 0.28);
          }
        }
      }
    }
  }
}

// Gentle final resolving Fmaj9 lullaby chord at 61.5s
addFeltNote(61.5, 53, 3.3, 0.18, -0.15, 0.35);
addFeltNote(61.58, 60, 3.2, 0.14, 0.0, 0.38);
addFeltNote(61.66, 64, 3.1, 0.14, 0.12, 0.40);
addFeltNote(61.74, 67, 3.0, 0.13, 0.22, 0.42);
addCelesta(61.85, 81, 0.075, 0.25);

// Synced tactile SFX matching the real gameplay choreography!
addButtPatSfx(22.15, 0);
addButtPatSfx(23.25, 1);
addButtPatSfx(24.35, 2);
addButtPatSfx(25.45, 3);
addShutterSfx(51.05);
addRainAmbience(56.0, 60.4);

// Warm stereo multi-tap reverb + smooth master fade-in/out
const d1 = Math.floor(0.037 * SR);
const d2 = Math.floor(0.079 * SR);
const d3 = Math.floor(0.131 * SR);
const outL = new Float32Array(N);
const outR = new Float32Array(N);

for (let i = 0; i < N; i++) {
  const wetL =
    (i >= d1 ? L[i - d1] * 0.24 : 0) +
    (i >= d2 ? R[i - d2] * 0.18 : 0) +
    (i >= d3 ? L[i - d3] * 0.11 : 0);
  const wetR =
    (i >= d1 ? R[i - d1] * 0.24 : 0) +
    (i >= d2 ? L[i - d2] * 0.18 : 0) +
    (i >= d3 ? R[i - d3] * 0.11 : 0);

  const t = i / SR;
  const fadeIn = Math.min(1, t / 0.8);
  const fadeOut = Math.min(1, Math.max(0, (DUR - t) / 2.2));
  const env = fadeIn * fadeOut;

  // Soft analog tape saturation
  outL[i] = Math.tanh((L[i] + wetL) * 1.15) * 0.72 * env;
  outR[i] = Math.tanh((R[i] + wetR) * 1.15) * 0.72 * env;
}

// Write 16-bit stereo PCM WAV
const outPath = path.resolve('release/promo-bgm-raw.wav');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const dataBytes = N * 4;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // Stereo
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);

let offset = 44;
for (let i = 0; i < N; i++) {
  const il = Math.max(-32767, Math.min(32767, Math.round(outL[i] * 32767)));
  const ir = Math.max(-32767, Math.min(32767, Math.round(outR[i] * 32767)));
  buf.writeInt16LE(il, offset);
  buf.writeInt16LE(ir, offset + 2);
  offset += 4;
}
fs.writeFileSync(outPath, buf);
console.log(`Generated soothing 65s soundtrack: ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
