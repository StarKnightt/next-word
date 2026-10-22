// Shared cue sheet. Loaded by the scene (browser) and the synth (node), so every
// visual hit and every sound sit on the same beat. 120 BPM: 1 beat = 0.5 s = 30 frames.
globalThis.CUES = {
  BPM: 120,
  BEATS: 40, // 10 bars of 4/4 = 20 s

  // scene boundaries, in beats (every cut lands on one of these)
  SCENES: { intro: 0, tokens: 8, attention: 16, scores: 24, pick: 32, title: 36, end: 40 },

  WORDS: ["the", "cat", "sat", "on", "the"],

  // intro: one word slams in per beat
  SLAMS: [1, 2, 3, 4, 5],
  // words re-enter the sentence on 16th notes from beat 6
  ASSEMBLE: [6, 6.25, 6.5, 6.75, 7],

  // tokens: each chip flashes on an 8th note, then its numbers drop in on 16ths
  CHIP_FLASH: i => 10 + i * 0.5,
  NUM_DROP: (i, j) => 10 + i * 0.5 + 0.25 + j * 0.25,
  NUMS_PER_CHIP: 4,

  // attention: causal, so a word only ever looks back at earlier words. [from, to, beat, weight]
  LINKS: [
    [1, 0, 17.0, 0.4], [2, 1, 17.5, 0.6], [2, 0, 18.0, 0.3],
    [3, 2, 18.5, 0.5], [3, 1, 19.0, 0.3], [4, 3, 19.5, 0.35],
    [4, 2, 20.0, 0.75], [4, 1, 20.5, 1.0], [4, 0, 21.0, 0.2],
  ],

  // scores: bars grow on these beats
  CANDS: [["mat", 62], ["floor", 14], ["couch", 9], ["bed", 6], ["rug", 3], ["chair", 2]],
  BAR_GROW: [27, 27.5, 28, 28.5, 29, 29],

  // pick
  FLY_START: 32.25,
  LAND: 33,
  TITLE_LINES: [36, 37],
};
