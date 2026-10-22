// PALE MERIDIAN: shared cue sheet for picture and score.
// 80 BPM: 1 beat = 0.75 s = 45 frames at 60 fps. Every cut sits on a whole beat.
globalThis.FILM = {
  BPM: 80,
  BEATS: 20, // 5 bars of 4/4 = 15 s

  // shots: [start beat, scene, params P, params Q]
  // scenes: 0 planet limb, 1 nebula drift, 2 eclipse + ring, 3 black with a line of light
  SHOTS: [
    [0, 0, [0.06, 0.012, 1.0, 0.18], [0, 0, 0, 0]],      // dawn on the limb of a dark world
    [4, 1, [0.32, 0.0, 0, 0], [0, 0, 0, 0]],              // drifting through the nebula toward the signal
    [8, 2, [0.9, 0.0, 0.06, 0], [0.55, 0.3, 0.0, 0]],      // the eclipse and the ring
    [12, 2, [3.6, -0.3, 0.12, 0], [0.55, 0.3, 0.4, 1]],   // flash: macro on the corona
    [13, 0, [-0.32, 0.03, 1.7, -0.08], [1, 0, 0, 0]],     // flash: the limb, sun breaking
    [14, 1, [2.6, 3.0, 0, 0], [1, 0, 0, 0]],              // flash: the jump
    [15, 3, [0, 0, 0, 0], [0, 0, 0, 0]],                  // black. one line of light.
    [16, 2, [0.72, 0.0, 0.11, 0], [0.55, 0.3, 1.0, 2]],   // title over the diamond ring
  ],

  // story lines: [text, in beat, out beat]
  LINES: [
    ["THEY SENT ONE SIGNAL", 1, 3.7],
    ["ACROSS NINE HUNDRED YEARS", 5, 7.7],
    ["SOMETHING ANSWERED", 9, 11.8],
  ],
  TITLE: "PALE MERIDIAN",
  TITLE_IN: 16,
  SUB: ["PART ONE", 18],
  FADE_OUT: [19.2, 20],

  // beats where the picture flashes (cuts with impacts)
  HITS: [0, 4, 8, 12, 13, 14, 16],
};
