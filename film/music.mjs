// PALE MERIDIAN: original score, synthesized from nothing but math.
// Brass "braams" from filtered detuned saws, a formant-filtered synth choir, synthesized
// taiko, a Shepard riser, FM metal hits and a Freeverb-style hall. No samples, no plugins.
// usage: node film/music.mjs out.wav
import { writeFileSync } from "node:fs";
import "./cues.js";
const F = globalThis.FILM;

const SR = 48000, DUR = 15, N = SR * DUR;
const BEAT = 60 / F.BPM;                      // 0.75 s
const at = b => Math.round(b * BEAT * SR);    // 36000 samples per beat, exact
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// ---------- deterministic noise ----------
let seed = 0x5eed1e55;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;

// ---------- buses ----------
const bus = () => [new Float32Array(N), new Float32Array(N)];
const B = { low: bus(), mid: bus(), drums: bus(), hi: bus(), rev: bus(), dly: bus() };
const put = (b, i, l, r) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
const panLR = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

class Biquad {
  constructor(type = "lp", f = 1000, q = 0.707) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q); }
  set(type, f, q) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = 2 * Math.PI * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    if (type === "lp") { b1 = 1 - cs; b0 = b2 = b1 / 2; }
    else if (type === "hp") { b1 = -(1 + cs); b0 = b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}
const blep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
class Saw {
  constructor(f, ph = rnd()) { this.f = f; this.ph = ph; }
  next(fm = 1) {
    const dt = this.f * fm / SR;
    const v = 2 * this.ph - 1 - blep(this.ph, dt);
    this.ph += dt; if (this.ph >= 1) this.ph -= 1;
    return v;
  }
}

// ---------- instruments ----------

// BRAAAM: stacked detuned saws, a filter that tears open then closes, and saturation
function braam(b, notes, gain, dur = 3.2, { bright = 2600, send = 0.45 } = {}) {
  const s = at(b), L = Math.floor(dur * SR);
  const DET = [-0.12, -0.05, 0, 0.05, 0.12];
  const vs = [];
  for (const m of notes) DET.forEach((d, k) => vs.push({ o: new Saw(mtof(m + d)), p: panLR((k - 2) / 2 * 0.7) }));
  const lp = [new Biquad(), new Biquad()];
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    if (n % 32 === 0) {
      const env = Math.min(1, t / 0.06) * Math.exp(-t / 0.9);
      const fc = 70 + bright * env + 220 * Math.exp(-t / 2.5);
      lp[0].set("lp", fc, 1.1); lp[1].set("lp", fc * 1.02, 1.1);
    }
    const bend = 1 - 0.012 * Math.exp(-t * 9); // brass "scoop" into pitch
    let l = 0, r = 0;
    for (const v of vs) { const x = v.o.next(bend); l += x * v.p[0]; r += x * v.p[1]; }
    const amp = Math.min(1, t / 0.025) * Math.exp(-t / (dur * 0.42)) * (1 - Math.max(0, (t - dur + 0.3) / 0.3));
    const g = gain * amp / Math.sqrt(vs.length);
    const yl = Math.tanh(lp[0].run(l) * 2.2) * g, yr = Math.tanh(lp[1].run(r) * 2.2) * g;
    put(B.low, s + n, yl, yr);
    put(B.rev, s + n, yl * send, yr * send);
  }
}

function sub(b, gain, dur = 2.5, f0 = 70, f1 = 29) { // sub-bass drop
  const s = at(b), L = Math.floor(dur * SR);
  let ph = 0;
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    ph += 2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 3)) / SR;
    const v = Math.sin(ph) * Math.min(1, t * 400) * Math.exp(-t / (dur * 0.4)) * gain;
    put(B.low, s + n, v, v);
  }
}

// taiko: pitched skin + noise thump, big room
function taiko(b, gain, pitch = 1, pan = 0) {
  const s = at(b), L = Math.floor(1.1 * SR);
  const lp = new Biquad("lp", 900, 0.8);
  const [gl, gr] = panLR(pan);
  let ph = 0;
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    ph += 2 * Math.PI * (55 * pitch + 95 * pitch * Math.exp(-t * 28)) / SR;
    const skin = Math.sin(ph) * Math.exp(-t * 5.5);
    const thump = lp.run(noise()) * Math.exp(-t * 30) * 0.9;
    const v = Math.tanh((skin + thump) * 1.8) * gain * Math.min(1, t * 3000);
    put(B.drums, s + n, v * gl, v * gr);
    put(B.rev, s + n, v * gl * 0.35, v * gr * 0.35);
  }
}

// metallic FM hit: inharmonic ratio, like struck steel
function metal(b, f, gain, dur = 2.6, pan = 0) {
  const s = at(b), L = Math.floor(dur * SR);
  const [gl, gr] = panLR(pan);
  let pc = 0, pm = 0, pm2 = 0;
  const hp = new Biquad("hp", 300, 0.7);
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    pm += 2 * Math.PI * f * 1.414 / SR; pm2 += 2 * Math.PI * f * 2.76 / SR;
    pc += 2 * Math.PI * f / SR + (3.5 * Math.exp(-t * 2) * Math.sin(pm) + 1.2 * Math.exp(-t * 5) * Math.sin(pm2)) * 2 * Math.PI * f / SR;
    const v = hp.run(Math.sin(pc)) * Math.exp(-t * 1.6) * Math.min(1, t * 4000) * gain;
    put(B.hi, s + n, v * gl, v * gr);
    put(B.rev, s + n, v * gl * 0.6, v * gr * 0.6);
  }
}

// noise impact body (the "air" of a cut)
function whoomp(b, gain, dur = 1.6) {
  const s = at(b), L = Math.floor(dur * SR);
  const lp = [new Biquad(), new Biquad()];
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    if (n % 32 === 0) { const fc = 120 + 7000 * Math.exp(-t * 6); lp[0].set("lp", fc, 0.6); lp[1].set("lp", fc * 1.05, 0.6); }
    const env = Math.exp(-t * 2.6) * Math.min(1, t * 2500) * gain;
    const l = lp[0].run(noise()) * env, r = lp[1].run(noise()) * env;
    put(B.mid, s + n, l, r);
    put(B.rev, s + n, l * 0.5, r * 0.5);
  }
}

// synth choir: saws through three vowel formants ("ah"), slow breath and vibrato
function choir(b0, b1, notes, gain, { attack = 0.8, release = 0.6, send = 0.7 } = {}) {
  const s0 = at(b0), s1 = at(b1), rel = Math.floor(release * SR);
  const FORM = [[800, 1, 6], [1150, 0.5, 7], [2900, 0.18, 9]];
  for (const [ni, m] of notes.entries()) {
    const vo = [0, 1, 2].map(k => ({ o: new Saw(mtof(m) * (1 + (k - 1) * 0.004)), vib: 4.6 + k * 0.37 + ni * 0.21, p: panLR(((ni % 2 ? 1 : -1) * 0.25) + (k - 1) * 0.35) }));
    const fl = FORM.map(([f, , q]) => [new Biquad("bp", f, q), new Biquad("bp", f * 1.02, q)]);
    for (let n = s0; n < s1 + rel && n < N; n++) {
      const t = (n - s0) / SR;
      let env = Math.min(1, t / attack);
      if (n >= s1) env *= 1 - (n - s1) / rel;
      env = env * env * (3 - 2 * env);
      let l = 0, r = 0;
      for (const v of vo) { const x = v.o.next(1 + 0.006 * Math.sin(2 * Math.PI * v.vib * t) * Math.min(1, t)); l += x * v.p[0]; r += x * v.p[1]; }
      let yl = 0, yr = 0;
      FORM.forEach(([, g], k) => { yl += fl[k][0].run(l) * g; yr += fl[k][1].run(r) * g; });
      const g = env * gain;
      put(B.mid, n, yl * g, yr * g);
      put(B.rev, n, yl * g * send, yr * g * send);
    }
  }
}

// the "signal": a clean sine ping with an FM glint, echoing
function signal(b, m, gain, pan = 0, dur = 1.6) {
  const s = at(b), L = Math.floor(dur * SR), f = mtof(m);
  const [gl, gr] = panLR(pan);
  let pc = 0, pm = 0;
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    pm += 2 * Math.PI * f * 3 / SR;
    pc += 2 * Math.PI * f / SR + 0.8 * Math.exp(-t * 12) * Math.sin(pm) * 2 * Math.PI * f / SR;
    const v = Math.sin(pc) * Math.exp(-t * 2.4 * 1.6 / dur) * Math.min(1, t * 1500) * Math.min(1, (L - n) / (0.02 * SR)) * gain;
    put(B.hi, s + n, v * gl, v * gr);
    put(B.dly, s + n, v * gl * 0.5, v * gr * 0.5);
    put(B.rev, s + n, v * gl * 0.4, v * gr * 0.4);
  }
}

function tick(b, gain, pan = 0.3) { // clock-like tension tick
  const s = at(b), L = Math.floor(0.03 * SR);
  const bp = new Biquad("bp", 5200, 4);
  const [gl, gr] = panLR(pan);
  for (let n = 0; n < L; n++) { const v = bp.run(noise()) * Math.exp(-n / SR * 180) * gain; put(B.hi, s + n, v * gl, v * gr); }
}

// ostinato: 16th-note pulse, filter opening across the build
function pulse(b, m, gain, cut) {
  const s = at(b), L = Math.floor(0.17 * SR);
  const o1 = new Saw(mtof(m), 0), o2 = new Saw(mtof(m) * 1.004, 0.3), o3 = new Saw(mtof(m + 12) * 0.998, 0.6);
  const lp = new Biquad();
  for (let n = 0; n < L; n++) {
    const t = n / SR;
    if (n % 16 === 0) lp.set("lp", cut * (0.6 + 1.4 * Math.exp(-t / 0.03)), 2.2);
    const v = lp.run(o1.next() + o2.next() + o3.next() * 0.5) * Math.min(1, t * 900) * Math.exp(-t / 0.07) * gain;
    put(B.mid, s + n, v * 0.9, v);
    put(B.dly, s + n, v * 0.12, v * 0.12);
  }
}

// Shepard riser: octave-spaced sines climbing forever under a fixed bell curve
function shepard(b0, b1, gain) {
  const s0 = at(b0), s1 = at(b1), K = 7, base = 55;
  const ph = new Float64Array(K);
  for (let n = s0; n < s1; n++) {
    const p = (n - s0) / (s1 - s0);
    const climb = p * 1.6; // octaves climbed over the riser
    let v = 0;
    for (let k = 0; k < K; k++) {
      const oct = ((k + climb) % K);
      const f = base * Math.pow(2, oct);
      const w = Math.exp(-Math.pow((oct - K / 2) / 1.3, 2));
      ph[k] += 2 * Math.PI * f / SR;
      v += Math.sin(ph[k]) * w;
    }
    const env = Math.pow(p, 1.6) * gain;
    put(B.mid, n, v * env * 0.9, v * env);
    put(B.rev, n, v * env * 0.3, v * env * 0.3);
  }
}

// reverse swell: grows exponentially and stops dead on the downbeat
function swell(b1, beats, gain) {
  const s1 = at(b1), s0 = s1 - Math.floor(beats * BEAT * SR);
  const bp = [new Biquad(), new Biquad()];
  const saws = [50, 57, 62, 65].map(m => new Saw(mtof(m)));
  for (let n = s0; n < s1; n++) {
    const p = (n - s0) / (s1 - s0);
    if (n % 32 === 0) { const f = 400 * Math.pow(20, p); bp[0].set("bp", f, 1.4); bp[1].set("bp", f * 1.06, 1.4); }
    const env = Math.pow(p, 3.2) * gain;
    let ch = 0; for (const o of saws) ch += o.next();
    const l = (bp[0].run(noise()) + ch * 0.05) * env, r = (bp[1].run(noise()) + ch * 0.05) * env;
    put(B.mid, n, l, r);
  }
}

// low drone: the planet's hum
function drone(b0, b1, gain) {
  const s0 = at(b0), s1 = at(b1);
  const o = [new Saw(mtof(38)), new Saw(mtof(38) * 1.003), new Saw(mtof(45) * 0.998)];
  const lp = [new Biquad(), new Biquad()];
  let ph = 0;
  for (let n = s0; n < s1; n++) {
    const t = (n - s0) / SR, p = (n - s0) / (s1 - s0);
    if (n % 32 === 0) { const f = 120 + 520 * p * p + 40 * Math.sin(t * 1.3); lp[0].set("lp", f, 0.9); lp[1].set("lp", f * 1.05, 0.9); }
    ph += 2 * Math.PI * mtof(26) / SR;
    const env = Math.min(1, t / 1.8) * (0.55 + 0.45 * p) * Math.min(1, (s1 - n) / (0.01 * SR)) * gain;
    const x = o[0].next() + o[1].next() * 0.8 + o[2].next() * 0.4;
    const subv = Math.sin(ph) * 0.9;
    put(B.low, n, (lp[0].run(x) * 0.35 + subv) * env, (lp[1].run(x) * 0.35 + subv) * env);
  }
}

// ---------- the cue ----------
// harmony: Dm | Dm | Bb Gm | A | Dm(add9)
drone(0, 15, 0.32);
braam(0, [26, 38, 45, 50], 0.85, 3.6, { bright: 1800 });
sub(0, 0.7, 3);
whoomp(0, 0.35, 2);
// the signal, three times, like a call
signal(1, 86, 0.16, 0.3); signal(1.5, 81, 0.12, -0.3); signal(2, 86, 0.1, 0.4);
choir(1.5, 4.2, [62, 65, 69], 0.06, { attack: 1.5, release: 0.8 });

// shot 2: the nebula. the beacon pulses on every beat; the pulse starts
for (let b = 4; b < 8; b++) signal(b, 93, 0.07, 0, 0.45);
for (let b = 4; b < 15; b += 0.25) {
  const prog = (b - 4) / 11;
  const m = b >= 12 ? 45 : b >= 10 ? 43 : b >= 8 ? 46 : 50;
  const acc = [1, 0.45, 0.7, 0.45][Math.round((b % 1) * 4)];
  pulse(b, m - 12 + (Math.round(b * 4) % 8 === 6 ? 12 : 0), (0.1 + 0.18 * prog) * acc, 380 + 2600 * prog * prog);
}
sub(4, 0.5, 1.8); whoomp(4, 0.4); metal(4, 210, 0.11, 2.4, -0.2);
for (let b = 4; b < 15; b += 0.5) tick(b, b < 8 ? 0.12 : 0.2, (b * 2) % 2 ? 0.35 : -0.35);

// shot 3: the eclipse. second braam, the choir arrives, taiko begin
braam(8, [22, 34, 41, 46], 0.8, 3.2, { bright: 2200 }); // Bb
sub(8, 0.65, 2.4); whoomp(8, 0.45); metal(8, 160, 0.13, 3);
choir(8, 10, [58, 62, 65, 70], 0.075, { attack: 0.5, release: 0.4 });  // Bb
choir(10, 12, [55, 62, 67, 70], 0.08, { attack: 0.3, release: 0.3 });  // Gm
choir(12, 15, [57, 61, 64, 69], 0.095, { attack: 0.2, release: 0.05 }); // A: the question
for (let b = 8; b < 12; b++) taiko(b, b % 2 ? 0.5 : 0.75, 1, b % 2 ? 0.25 : -0.25);
shepard(8, 15, 0.12);

// the flashes: a hit on every cut, taiko in 8ths, a 16th fill into the black
for (const b of [12, 13, 14]) { braam(b, [33, 45, 52], 0.55, 1.1, { bright: 3200, send: 0.3 }); sub(b, 0.55, 1.2, 90, 35); metal(b, 180 + (b - 12) * 40, 0.12, 1.6, (b - 13) * 0.5); }
for (let b = 12; b < 15; b += 0.5) taiko(b, b % 1 ? 0.5 : 0.85, b % 1 ? 1.25 : 1, b % 1 ? 0.3 : -0.3);
for (const b of [14.5, 14.625, 14.75, 14.875]) taiko(b, 0.45 + (b - 14.5), 1.4, 0);

// beat 15: silence. only the swell, pulling toward the title
swell(16, 1, 0.55);

// beat 16: PALE MERIDIAN
braam(16, [26, 38, 45, 50, 53], 1.0, 4.2, { bright: 3000, send: 0.6 });
sub(16, 0.85, 3.2, 80, 27);
whoomp(16, 0.55, 2.6);
metal(16, 146.8, 0.16, 3.2, 0);
taiko(16, 1.0, 0.9, 0);
choir(16, 19.5, [50, 57, 62, 64, 65, 69], 0.08, { attack: 0.08, release: 0.5, send: 0.9 }); // Dm add9
signal(18, 86, 0.1, 0.25); signal(18.5, 81, 0.08, -0.25); // the call, answered

// ---------- delay (dotted 8th ping-pong) ----------
const DL = Math.floor(0.75 * BEAT * SR);
const dOut = bus();
{
  const bl = new Float32Array(DL), br = new Float32Array(DL), lp = [new Biquad("lp", 3200), new Biquad("lp", 3200)];
  for (let n = 0, p = 0; n < N; n++, p = (p + 1) % DL) {
    const yl = bl[p], yr = br[p];
    dOut[0][n] = yl; dOut[1][n] = yr;
    bl[p] = B.dly[1][n] + lp[0].run(yr) * 0.45;
    br[p] = B.dly[0][n] + lp[1].run(yl) * 0.45;
  }
}

// ---------- hall reverb (Freeverb topology, long) ----------
const rOut = bus();
{
  const sc = SR / 44100;
  const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], APS = [556, 441, 341, 225];
  const pre = Math.floor(0.025 * SR);
  for (let ch = 0; ch < 2; ch++) {
    const spread = ch ? 23 : 0;
    const combs = COMBS.map(l => ({ b: new Float32Array(Math.floor((l + spread) * sc * 1.3)), p: 0, f: 0 }));
    const aps = APS.map(l => ({ b: new Float32Array(Math.floor((l + spread) * sc)), p: 0 }));
    const fb = 0.91, damp = 0.3, inp = B.rev[ch], out = rOut[ch];
    for (let n = 0; n < N; n++) {
      const x = (n >= pre ? inp[n - pre] : 0) * 0.015;
      let y = 0;
      for (const c of combs) {
        const o = c.b[c.p];
        c.f = o * (1 - damp) + c.f * damp;
        c.b[c.p] = x + c.f * fb;
        c.p = (c.p + 1) % c.b.length;
        y += o;
      }
      for (const a of aps) { const o = a.b[a.p]; a.b[a.p] = y + o * 0.5; a.p = (a.p + 1) % a.b.length; y = o - y; }
      out[n] = y;
    }
  }
}

// ---------- mix + master ----------
const L = new Float32Array(N), R = new Float32Array(N);
const hp = [new Biquad("hp", 22, 0.7), new Biquad("hp", 22, 0.7)];
const MIX = { low: 0.8, mid: 0.85, drums: 0.9, hi: 0.8, rev: 1.0, dly: 0.5 };
// the silent beat: everything except the swell (in mid) and the reverb tail ducks hard
const gapGain = n => { const b = n / SR / BEAT; return b >= 15 && b < 16 ? Math.max(0.0, 1 - (b - 15) * 6) : 1; };
for (let n = 0; n < N; n++) {
  const gg = gapGain(n);
  for (let ch = 0; ch < 2; ch++) {
    let v = B.low[ch][n] * MIX.low * gg + B.mid[ch][n] * MIX.mid + B.drums[ch][n] * MIX.drums * gg + B.hi[ch][n] * MIX.hi * gg
      + rOut[ch][n] * MIX.rev * (0.35 + 0.65 * gg) + dOut[ch][n] * MIX.dly * gg;
    (ch ? R : L)[n] = hp[ch].run(v);
  }
}
{
  let env = 0;
  const thr = 0.75, rel = Math.exp(-1 / (0.15 * SR));
  for (let n = 0; n < N; n++) {
    const pk = Math.max(Math.abs(L[n]), Math.abs(R[n]));
    env = pk > env ? pk : env * rel + pk * (1 - rel);
    const g = env > thr ? thr / env : 1;
    L[n] = Math.tanh(L[n] * g * 1.1); R[n] = Math.tanh(R[n] * g * 1.1);
  }
}
// fade with the picture
const f0 = at(F.FADE_OUT[0]), f1 = at(F.FADE_OUT[1]);
let peak = 0;
for (let n = 0; n < N; n++) {
  if (n > f0) { const p = Math.min(1, (n - f0) / (f1 - f0)); const g = Math.cos(p * Math.PI / 2); L[n] *= g; R[n] *= g; }
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const norm = Math.pow(10, -1 / 20) / peak;

const out = process.argv[2] || "score.wav";
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const dl = (rnd() - rnd()) / 32768, dr = (rnd() - rnd()) / 32768;
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((L[n] * norm + dl) * 32767))), 44 + n * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((R[n] * norm + dr) * 32767))), 46 + n * 4);
}
writeFileSync(out, buf);
console.error(`wrote ${out} (${DUR}s, ${SR} Hz)`);
