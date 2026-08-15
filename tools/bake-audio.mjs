/**
 * Bake short WAV samples for PumpRun (no runtime oscillator beeps).
 * Soft envelopes, no clipping. Drop Kenney/Pixabay files over these names to replace.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');
fs.mkdirSync(outDir, { recursive: true });

const SR = 22050;

function clamp(v) {
  return Math.max(-0.92, Math.min(0.92, v));
}

function env(t, a, d, s, r, dur) {
  if (t < a) return t / Math.max(a, 1e-4);
  if (t < a + d) return 1 - (1 - s) * ((t - a) / Math.max(d, 1e-4));
  if (t < dur - r) return s;
  if (t < dur) return s * (1 - (t - (dur - r)) / Math.max(r, 1e-4));
  return 0;
}

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  }
  const dest = path.join(outDir, name);
  fs.writeFileSync(dest, buf);
  console.log('  ', name, (buf.length / 1024).toFixed(1), 'KB');
}

function render(seconds, fn) {
  const n = Math.floor(SR * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = fn(i / SR, i);
  return out;
}

function noise() {
  return Math.random() * 2 - 1;
}

// Soft coin ding
writeWav(
  'coin.wav',
  render(0.16, (t) => {
    const e = env(t, 0.004, 0.04, 0.25, 0.08, 0.16);
    return e * 0.28 * (Math.sin(2 * Math.PI * 1046 * t) + 0.45 * Math.sin(2 * Math.PI * 1568 * t));
  }),
);

// Jump whoosh
writeWav(
  'jump.wav',
  render(0.18, (t) => {
    const e = env(t, 0.01, 0.05, 0.3, 0.1, 0.18);
    const f = 280 + t * 900;
    return e * 0.22 * (0.55 * noise() + 0.45 * Math.sin(2 * Math.PI * f * t));
  }),
);

// Landing tap
writeWav(
  'land.wav',
  render(0.09, (t) => {
    const e = env(t, 0.002, 0.02, 0.2, 0.05, 0.09);
    return e * 0.2 * (Math.sin(2 * Math.PI * 72 * t) + 0.25 * noise());
  }),
);

// Crash / rugged
writeWav(
  'crash.wav',
  render(0.42, (t) => {
    const e = env(t, 0.004, 0.08, 0.35, 0.22, 0.42);
    return e * 0.32 * (0.7 * noise() + 0.4 * Math.sin(2 * Math.PI * 52 * t) + 0.2 * Math.sin(2 * Math.PI * 38 * t));
  }),
);

// Magnet — rising whoosh + sparkle
writeWav(
  'power_magnet.wav',
  render(0.28, (t) => {
    const e = env(t, 0.01, 0.08, 0.4, 0.12, 0.28);
    const f = 360 + t * 720;
    return e * 0.24 * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t) + 0.15 * noise());
  }),
);

// Shield — glassy triad
writeWav(
  'power_shield.wav',
  render(0.32, (t) => {
    const e = env(t, 0.012, 0.07, 0.35, 0.16, 0.32);
    return (
      e *
      0.2 *
      (Math.sin(2 * Math.PI * 523 * t) + 0.7 * Math.sin(2 * Math.PI * 659 * t) + 0.5 * Math.sin(2 * Math.PI * 784 * t))
    );
  }),
);

// Quiet foot tap
writeWav(
  'step.wav',
  render(0.06, (t) => {
    const e = env(t, 0.002, 0.015, 0.15, 0.03, 0.06);
    return e * 0.09 * (0.6 * noise() + 0.4 * Math.sin(2 * Math.PI * 90 * t));
  }),
);

// 8-bar synthwave-ish loop, quiet
const bpm = 100;
const beat = 60 / bpm;
const musicDur = 8 * 4 * beat;
const chords = [
  [110, 164.81, 220],
  [130.81, 196, 261.63],
  [146.83, 220, 293.66],
  [123.47, 185, 246.94],
];
writeWav(
  'music.wav',
  render(musicDur, (t) => {
    const bar = Math.floor(t / (4 * beat)) % 4;
    const [b, m, h] = chords[bar];
    const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * (1 / beat) * t);
    const pad =
      0.12 * Math.sin(2 * Math.PI * b * t) +
      0.08 * Math.sin(2 * Math.PI * m * t) +
      0.06 * Math.sin(2 * Math.PI * h * t);
    const bass = 0.16 * Math.sin(2 * Math.PI * (b / 2) * t) * pulse;
    const arpN = Math.floor((t / (beat / 4)) % 3);
    const arpF = [m, h, b * 2][arpN];
    const arp = 0.045 * Math.sin(2 * Math.PI * arpF * t) * env((t % (beat / 4)) / (beat / 4), 0.05, 0.2, 0.4, 0.3, 1);
    return (pad + bass + arp) * 0.55;
  }),
);

console.log('baked', outDir);
