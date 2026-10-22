// Fully synthesized soundtrack. Oscillators, noise, filters, a Freeverb-style reverb
// and a ping-pong delay, all written here. No samples, no audio files, no plugins.
// usage: node keynote/music.mjs out.wav
import { writeFileSync } from "node:fs";
import "./cues.js";
const C = globalThis.CUES;

const SR = 48000, DUR = 20, N = SR * DUR;
const BEAT = 60 / C.BPM;
const at = b => Math.round(b * BEAT * SR); // beat -> sample index (exact: 24000 per beat)
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- deterministic noise ----------
let seed = 0x9e3779b9;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;

// ---------- buses ----------
const bus = () => [new Float32Array(N), new Float32Array(N)];
const B = { drums: bus(), bass: bus(), pad: bus(), arp: bus(), fx: bus(), rev: bus(), dly: bus() };
const put = (b, i, l, r) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
const panLR = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

// ---------- filters ----------
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set("lp", 1000, 0.707); }
  set(type, f, q) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = 2 * Math.PI * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    if (type === "lp") { b1 = 1 - cs; b0 = b2 = b1 / 2; }
    else if (type === "hp") { b1 = -(1 + cs); b0 = b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // band-pass
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// ---------- oscillators ----------
const blep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
class Saw {
  constructor(f, ph = rnd()) { this.f = f; this.ph = ph; }
  next() {
    const dt = this.f / SR;
    let v = 2 * this.ph - 1 - blep(this.ph, dt);
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
}

// ---------- instruments ----------
function kick(b, gain = 1) {
  const s = at(b), len = SR * 0.6;
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 44 + 120 * Math.exp(-t * 32) + 40 * Math.exp(-t * 200);
    ph += 2 * Math.PI * f / SR;
    let v = Math.sin(ph) * Math.exp(-t * 6.5) * Math.min(1, t * 2000);
    v += noise() * Math.exp(-t * 400) * 0.25;
    v = Math.tanh(v * 1.6) * gain * 0.9;
    put(B.drums, s + n, v, v);
  }
}

function boom(b, gain = 1, tail = 2.2) { // cinematic impact: sub drop + noise body
  const s = at(b), len = Math.floor(SR * tail);
  const lp = [new Biquad(), new Biquad()];
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 32 + 90 * Math.exp(-t * 9);
    ph += 2 * Math.PI * f / SR;
    const sub = Math.sin(ph) * Math.exp(-t * 1.8) * Math.min(1, t * 1500);
    if (n % 32 === 0) { const fc = 200 + 5000 * Math.exp(-t * 7); lp[0].set("lp", fc, 0.6); lp[1].set("lp", fc, 0.6); }
    const env = Math.exp(-t * 3.2) * Math.min(1, t * 800);
    const l = lp[0].run(noise()) * env, r = lp[1].run(noise()) * env;
    const vl = (Math.tanh(sub * 1.4) * 0.9 + l * 0.5) * gain, vr = (Math.tanh(sub * 1.4) * 0.9 + r * 0.5) * gain;
    put(B.fx, s + n, vl, vr);
    put(B.rev, s + n, l * 0.25 * gain, r * 0.25 * gain);
  }
}

function crash(b, gain = 1, tail = 2.4) {
  const s = at(b), len = Math.floor(SR * tail);
  const hp = [new Biquad(), new Biquad()]; hp[0].set("hp", 5500, 0.6); hp[1].set("hp", 5500, 0.6);
  for (let n = 0; n < len; n++) {
    const t = n / SR, env = Math.exp(-t * 2.2) * Math.min(1, t * 3000) * gain * 0.32;
    const l = hp[0].run(noise()) * env, r = hp[1].run(noise()) * env;
    put(B.drums, s + n, l, r);
    put(B.rev, s + n, l * 0.5, r * 0.5);
  }
}

function clap(b, gain = 1) {
  const s = at(b), len = SR * 0.35;
  const bp = [new Biquad(), new Biquad()]; bp[0].set("bp", 1300, 1.2); bp[1].set("bp", 1500, 1.2);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    // three quick bursts, then the tail: what makes a clap read as a clap
    let env = 0;
    for (const o of [0, 0.011, 0.022]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) * (o < 0.02 ? 180 : 14)));
    const l = bp[0].run(noise()) * env * gain * 1.6, r = bp[1].run(noise()) * env * gain * 1.6;
    put(B.drums, s + n, l, r);
    put(B.rev, s + n, l * 0.45, r * 0.45);
  }
}

function snare(b, gain = 1, pitch = 1) {
  const s = at(b), len = SR * 0.18;
  const hp = new Biquad(); hp.set("hp", 1800 * pitch, 0.7);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph += 2 * Math.PI * 190 * pitch / SR;
    const v = (hp.run(noise()) * Math.exp(-t * 26) * 0.9 + Math.sin(ph) * Math.exp(-t * 40) * 0.5) * gain;
    put(B.drums, s + n, v, v);
    put(B.rev, s + n, v * 0.3, v * 0.3);
  }
}

function hat(b, gain = 1, pan = 0.25, decay = 55) {
  const s = at(b), len = SR * 0.12;
  const hp = new Biquad(); hp.set("hp", 8000, 0.7);
  const [gl, gr] = panLR(pan);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const v = hp.run(noise()) * Math.exp(-t * decay) * gain * 0.35;
    put(B.drums, s + n, v * gl, v * gr);
  }
}

// supersaw chord: 7 detuned saws per note, spread across the stereo field
function supersaw(target, b0, b1, notes, gain, { attack = 0.01, release = 0.25, decay = 0, send = 0.2 } = {}) {
  const s0 = at(b0), s1 = at(b1), rel = Math.floor(release * SR);
  const DET = [-0.22, -0.14, -0.06, 0, 0.06, 0.14, 0.22]; // semitones
  for (const m of notes) {
    const voices = DET.map((d, k) => ({ o: new Saw(mtof(m + d)), p: panLR((k - 3) / 3 * 0.8) }));
    for (let n = s0; n < s1 + rel && n < N; n++) {
      const t = (n - s0) / SR;
      let env = Math.min(1, t / attack);
      if (decay) env *= Math.exp(-t / decay);
      if (n >= s1) env *= 1 - (n - s1) / rel;
      let l = 0, r = 0;
      for (const v of voices) { const x = v.o.next(); l += x * v.p[0]; r += x * v.p[1]; }
      const g = env * gain / 7;
      put(target, n, l * g, r * g);
      put(B.rev, n, l * g * send, r * g * send);
    }
  }
}

function pluck(b, m, gain, { len = 0.3, cut = 1800, env = 3500, pan = 0, dly = 0.25, rev = 0.15, target = B.arp } = {}) {
  const s = at(b), L = Math.floor(len * SR);
  const o1 = new Saw(mtof(m), 0), o2 = new Saw(mtof(m) * 1.003, 0.5);
  const lp = new Biquad();
  const [gl, gr] = panLR(pan);
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    if (n % 16 === 0) lp.set("lp", cut + env * Math.exp(-t / 0.05), 1.4);
    const a = Math.min(1, t * 600) * Math.exp(-t / (len * 0.35));
    const v = lp.run((o1.next() + o2.next()) * 0.5) * a * gain;
    put(target, s + n, v * gl, v * gr);
    put(B.dly, s + n, v * gl * dly, v * gr * dly);
    put(B.rev, s + n, v * gl * rev, v * gr * rev);
  }
}

// FM bell: a sine modulated by a sine, used for the attention "pings"
function bell(b, f, gain, pan = 0, dur = 1.4, ratio = 3.5, index = 2.2) {
  const s = at(b), L = Math.floor(dur * SR);
  const [gl, gr] = panLR(pan);
  let pc = 0, pm = 0;
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    pm += 2 * Math.PI * f * ratio / SR;
    pc += 2 * Math.PI * f / SR + index * Math.exp(-t * 6) * Math.sin(pm) * 2 * Math.PI * f / SR;
    const v = Math.sin(pc) * Math.exp(-t * 3.2) * Math.min(1, t * 2000) * gain;
    put(B.fx, s + n, v * gl, v * gr);
    put(B.dly, s + n, v * gl * 0.3, v * gr * 0.3);
    put(B.rev, s + n, v * gl * 0.35, v * gr * 0.35);
  }
}

function blip(b, f, gain, pan = 0) { // tiny digital tick
  const s = at(b), L = Math.floor(0.05 * SR);
  const [gl, gr] = panLR(pan);
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 90) * gain;
    put(B.fx, s + n, v * gl, v * gr);
    put(B.dly, s + n, v * gl * 0.2, v * gr * 0.2);
  }
}

function sweep(b, f0, f1, dur, gain, pan = 0) { // rising sine "bloop"
  const s = at(b), L = Math.floor(dur * SR);
  const [gl, gr] = panLR(pan);
  let ph = 0;
  for (let n = 0; n < L; n++) {
    const t = n / SR, p = t / dur;
    ph += 2 * Math.PI * (f0 * Math.pow(f1 / f0, Math.min(1, p * 3))) / SR;
    const v = Math.sin(ph) * Math.min(1, t * 400) * Math.exp(-t * 7) * gain;
    put(B.fx, s + n, v * gl, v * gr);
    put(B.rev, s + n, v * gl * 0.2, v * gr * 0.2);
  }
}

// noise riser that ends exactly on a beat (filter + level rise, then a hard stop)
function riser(b0, b1, gain, f0 = 300, f1 = 9000, q = 2) {
  const s0 = at(b0), s1 = at(b1);
  const bp = [new Biquad(), new Biquad()];
  for (let n = s0; n < s1; n++) {
    const p = (n - s0) / (s1 - s0);
    if (n % 32 === 0) { const f = f0 * Math.pow(f1 / f0, p * p); bp[0].set("bp", f, q); bp[1].set("bp", f * 1.04, q); }
    const env = Math.pow(p, 2.2) * gain * (1 - Math.pow(Math.max(0, (p - 0.985) / 0.015), 2));
    const l = bp[0].run(noise()) * env, r = bp[1].run(noise()) * env;
    put(B.fx, n, l, r);
    put(B.rev, n, l * 0.3, r * 0.3);
  }
}

function reverseCymbal(b1, beats, gain) { // swells into the downbeat and cuts dead on it
  const s1 = at(b1), s0 = s1 - Math.floor(beats * BEAT * SR);
  const hp = [new Biquad(), new Biquad()]; hp[0].set("hp", 4000, 0.6); hp[1].set("hp", 4200, 0.6);
  for (let n = s0; n < s1; n++) {
    const p = (n - s0) / (s1 - s0);
    const env = Math.pow(p, 3) * gain;
    put(B.fx, n, hp[0].run(noise()) * env, hp[1].run(noise()) * env);
  }
}

// ---------- harmony ----------
// bars: Am Am | F G | Am F | C G | F C(add9)
const BARS = [
  { pad: [57, 60, 64, 69], root: 45 }, { pad: [57, 60, 64, 69], root: 45 },
  { pad: [53, 57, 60, 64], root: 41 }, { pad: [55, 59, 62, 67], root: 43 },
  { pad: [57, 60, 64, 69], root: 45 }, { pad: [53, 57, 60, 65], root: 41 },
  { pad: [55, 60, 64, 67], root: 48 }, { pad: [55, 59, 62, 67], root: 43 },
  { pad: [53, 57, 60, 65, 72], root: 41 }, { pad: [48, 55, 60, 64, 67, 74], root: 36 },
];
const chordAt = beat => BARS[Math.min(9, Math.floor(beat / 4))];

// ---------- arrangement ----------
const S = C.SCENES;

// pad: one chord per bar. Gaps right before the big downbeats (beats 8 and 36) make them hit harder.
for (let bar = 0; bar < 10; bar++) {
  let b0 = bar * 4, b1 = b0 + 4;
  if (bar === 1) b1 = 7.75;
  if (bar === 8) b1 = 35.5;
  const final = bar === 9;
  supersaw(B.pad, b0, final ? 39.6 : b1, BARS[bar].pad, final ? 0.34 : 0.22,
    { attack: bar === 0 ? 2.5 : 0.012, release: final ? 0.4 : 0.06, send: final ? 0.5 : 0.25 });
}

// intro: impact, then one stab + tom per slammed word
boom(0, 0.9, 2.4);
bell(0, mtof(93), 0.12, 0, 2.5, 2, 1.2);
C.SLAMS.forEach((b, i) => {
  supersaw(B.fx, b, b + 0.4, [57 + [0, 0, 3, 5, 7][i], 64 + [0, 0, 0, 2, 3][i], 69], 0.3, { decay: 0.12, release: 0.05, send: 0.35 });
  kick(b, 0.55);
  boom(b, 0.22, 0.8);
});
C.ASSEMBLE.forEach((b, i) => blip(b, mtof([81, 84, 88, 91, 93][i]), 0.22, (i - 2) * 0.3));
riser(4, 7.75, 0.55);
reverseCymbal(8, 1, 0.5);

// drums from the drop (beat 8) to beat 32
for (let b = S.tokens; b < S.pick; b++) {
  kick(b, 1);
  const inRoll = b >= 28;
  if (!inRoll && (b % 4 === 1 || b % 4 === 3)) clap(b, 0.75);
  hat(b + 0.5, 0.9, 0.25);
  if (b >= S.attention) { hat(b + 0.25, 0.35, -0.35, 80); hat(b + 0.75, 0.35, -0.35, 80); }
}
// snare roll into the pick: 8ths, then 16ths, then 32nds
for (let b = 28; b < 32; b += b < 30 ? 0.5 : b < 31 ? 0.25 : 0.125) {
  const p = (b - 28) / 4;
  snare(b, 0.35 + 0.6 * p, 1 + p * 0.6);
}
for (const b of [8, 16, 24, 32, 36]) crash(b, b === 36 || b === 32 ? 1.1 : 0.85);
boom(8, 0.85); boom(24, 0.6); boom(32, 0.85); boom(36, 1.0, 3.5);

// bass: rolling 16ths on the root, sidechained to the kick below
for (let b = S.tokens; b < 35.5; b += 0.25) {
  if (b % 1 === 0) continue; // leave room for the kick
  const ch = chordAt(b);
  const m = ch.root - 12 + (b % 1 === 0.75 && Math.floor(b) % 2 ? 12 : 0);
  pluck(b, m, 0.55, { len: 0.22, cut: 260, env: 900, dly: 0, rev: 0, target: B.bass });
}
// sub sine under the bass
for (let bar = 2; bar < 9; bar++) {
  const s0 = at(bar * 4), s1 = at(Math.min(bar * 4 + 4, 35.5)), f = mtof(BARS[bar].root - 12);
  for (let n = s0; n < s1; n++) { const v = Math.sin(2 * Math.PI * f * (n - s0) / SR) * 0.28; put(B.bass, n, v, v); }
}

// arp: 16th notes over the chord, brighter as the piece builds
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
for (let b = S.tokens; b < S.pick; b += 0.25) {
  const ch = chordAt(b).pad, k = Math.round(b * 4) % 8;
  const m = ch[ARP[k] % ch.length] + 12;
  const build = (b - 8) / 24;
  const g = b >= S.attention && b < S.scores ? 0.12 : 0.17;
  pluck(b, m, g, { len: 0.25, cut: 700 + 2600 * build, env: 2500 + 3000 * build, pan: k % 2 ? 0.45 : -0.45, dly: 0.3 });
}

// tokens: chip flash + the numbers ticking in
for (let i = 0; i < 5; i++) {
  pluck(C.CHIP_FLASH(i), [69, 72, 76, 79, 81][i] + 12, 0.18, { len: 0.4, cut: 2400, env: 5000, pan: (i - 2) * 0.35, dly: 0.35 });
  for (let j = 0; j < C.NUMS_PER_CHIP; j++) blip(C.NUM_DROP(i, j), 2200 + 400 * j + 150 * i, 0.12, (i - 2) * 0.35);
}
riser(14, 15.95, 0.35, 600, 7000, 3);

// attention: a bell for every link, pitched from the chord, panned to the speaking word
C.LINKS.forEach(([from, to, b, w], k) => {
  const ch = chordAt(b).pad;
  const f = mtof(ch[k % ch.length] + 24);
  bell(b, f, 0.09 + 0.12 * w, (from - to) / 4 - 0.4 + 0.2 * from / 2, 1.6);
});
sweep(21.5, 300, 900, 1.2, 0.18);
riser(22, 23.95, 0.45, 400, 8000, 2.5);
reverseCymbal(24, 0.5, 0.45);

// scores: the reel ticks every time a row passes (same scroll curve as the scene)
{
  const eo = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
  let last = null;
  for (let n = at(24); n < at(27); n += 48) {
    const b = n / SR / BEAT;
    const S = 3200 * (1 - eo((b - 24) / 3));
    const row = Math.floor(S / 104);
    if (last !== null && row !== last) blip(b, 3200, 0.09, 0.2);
    last = row;
  }
}
C.CANDS.forEach(([w, pct], i) => {
  const b = C.BAR_GROW[i];
  if (i < 4) sweep(b, 220, 220 * Math.pow(2, pct / 30), 0.5, 0.22 - i * 0.03, (i - 1.5) * 0.3);
});
for (const b of [29, 30, 31]) bell(b, mtof(76 + 12), 0.08, 0, 0.8);

// pick: impact, the fly whoosh, and the landing
riser(32.25, 33, 0.5, 800, 10000, 1.6);
kick(33, 1.1); boom(33, 0.55, 1.6); crash(33, 0.5);
bell(33, mtof(88), 0.16, 0.1, 2.2, 2, 1.5);
bell(33, mtof(93), 0.1, -0.1, 2.2, 2, 1.0);
for (let b = 34.5; b < 35.5; b += 0.25) blip(b, 1800 + (b - 34.5) * 800, 0.07, 0.3); // the next guess, flickering
reverseCymbal(36, 0.5, 0.6);

// title
kick(36, 1.2);
kick(37, 0.9); boom(37, 0.35, 1.2);
supersaw(B.fx, 37, 37.4, [72, 76, 79, 86], 0.2, { decay: 0.25, release: 0.1, send: 0.6 });
bell(36, mtof(98), 0.08, 0, 3, 2, 1);
bell(38, mtof(91), 0.06, 0.4, 1.5); // the cursor tick

// ---------- sidechain ----------
const duck = new Float32Array(N).fill(1);
const kicks = [];
for (let b = 8; b < 32; b++) kicks.push(b);
kicks.push(32, 33, 36, 37);
for (const b of kicks) {
  const s = at(b), L = Math.floor(0.32 * SR);
  for (let n = 0; n < L && s + n < N; n++) {
    const x = n / L, g = 0.2 + 0.8 * (x * x * (3 - 2 * x));
    duck[s + n] = Math.min(duck[s + n], g);
  }
}

// ---------- pad filter automation ----------
function padCutoff(b) {
  const keys = [[0, 350], [7.7, 1400], [8, 900], [16, 1600], [24, 2200], [31.9, 6500], [32, 2600], [35.5, 4000], [36, 5200], [40, 1800]];
  for (let k = 0; k < keys.length - 1; k++) {
    const [b0, f0] = keys[k], [b1, f1] = keys[k + 1];
    if (b >= b0 && b < b1) return f0 * Math.pow(f1 / f0, (b - b0) / (b1 - b0));
  }
  return 1800;
}
{
  const lp = [new Biquad(), new Biquad()];
  for (let n = 0; n < N; n++) {
    if (n % 32 === 0) { const f = padCutoff(n / SR / BEAT); lp[0].set("lp", f, 0.8); lp[1].set("lp", f, 0.8); }
    B.pad[0][n] = lp[0].run(B.pad[0][n]);
    B.pad[1][n] = lp[1].run(B.pad[1][n]);
  }
}

// ---------- delay (ping-pong, dotted 8th) ----------
const DL = Math.floor(0.75 * BEAT * SR);
const dOut = bus();
{
  const bl = new Float32Array(DL), br = new Float32Array(DL), lp = [new Biquad(), new Biquad()];
  lp[0].set("lp", 3500, 0.7); lp[1].set("lp", 3500, 0.7);
  for (let n = 0, p = 0; n < N; n++, p = (p + 1) % DL) {
    const yl = bl[p], yr = br[p];
    dOut[0][n] = yl; dOut[1][n] = yr;
    bl[p] = B.dly[1][n] + lp[0].run(yr) * 0.42; // cross-feed = ping-pong
    br[p] = B.dly[0][n] + lp[1].run(yl) * 0.42;
  }
}

// ---------- reverb (Freeverb topology) ----------
const rOut = bus();
{
  const sc = SR / 44100;
  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], APS = [556, 441, 341, 225];
  for (let ch = 0; ch < 2; ch++) {
    const spread = ch ? 23 : 0;
    const combs = COMBS.map(l => ({ b: new Float32Array(Math.floor((l + spread) * sc)), p: 0, f: 0 }));
    const aps = APS.map(l => ({ b: new Float32Array(Math.floor((l + spread) * sc)), p: 0 }));
    const fb = 0.86, damp = 0.25, inp = B.rev[ch], out = rOut[ch];
    for (let n = 0; n < N; n++) {
      const x = inp[n] * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.b[c.p];
        c.f = o * (1 - damp) + c.f * damp;
        c.b[c.p] = x + c.f * fb;
        c.p = (c.p + 1) % c.b.length;
        y += o;
      }
      for (const a of aps) {
        const o = a.b[a.p];
        a.b[a.p] = y + o * 0.5;
        a.p = (a.p + 1) % a.b.length;
        y = o - y;
      }
      out[n] = y;
    }
  }
}

// ---------- mix + master ----------
const L = new Float32Array(N), R = new Float32Array(N);
const hp = [new Biquad(), new Biquad()]; hp[0].set("hp", 28, 0.7); hp[1].set("hp", 28, 0.7);
const MIX = { drums: 0.9, bass: 0.75, pad: 0.55, arp: 0.7, fx: 0.8, rev: 1.0, dly: 0.55 };
for (let n = 0; n < N; n++) {
  const d = duck[n];
  for (let ch = 0; ch < 2; ch++) {
    let v = B.drums[ch][n] * MIX.drums + B.bass[ch][n] * MIX.bass * d + B.pad[ch][n] * MIX.pad * (0.35 + 0.65 * d)
      + B.arp[ch][n] * MIX.arp * (0.5 + 0.5 * d) + B.fx[ch][n] * MIX.fx + rOut[ch][n] * MIX.rev * (0.6 + 0.4 * d)
      + dOut[ch][n] * MIX.dly;
    v = hp[ch].run(v);
    (ch ? R : L)[n] = v;
  }
}
// gentle peak limiter (fast attack, 120 ms release) then a soft clipper
{
  let env = 0;
  const thr = 0.7, rel = Math.exp(-1 / (0.12 * SR));
  for (let n = 0; n < N; n++) {
    const pk = Math.max(Math.abs(L[n]), Math.abs(R[n]));
    env = pk > env ? pk : env * rel + pk * (1 - rel);
    const g = env > thr ? thr / env : 1;
    L[n] = Math.tanh(L[n] * g * 1.15); R[n] = Math.tanh(R[n] * g * 1.15);
  }
}
// fade the last 0.4 s and normalise to -1 dBFS
let peak = 0;
for (let n = 0; n < N; n++) {
  const f = Math.min(1, (N - n) / (0.4 * SR));
  L[n] *= f; R[n] *= f;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const norm = Math.pow(10, -1 / 20) / peak;

// ---------- write 16-bit WAV ----------
const out = process.argv[2] || "soundtrack.wav";
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  // TPDF dither from the same seeded generator, so the file is bit-identical every run
  const dl = (rnd() - rnd()) / 32768, dr = (rnd() - rnd()) / 32768;
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((L[n] * norm + dl) * 32767))), 44 + n * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((R[n] * norm + dr) * 32767))), 46 + n * 4);
}
writeFileSync(out, buf);
console.error(`wrote ${out} (${DUR}s, ${SR} Hz, peak before norm ${peak.toFixed(3)})`);
