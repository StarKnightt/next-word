# next-word

A 30-second kinetic-typography explainer: how an AI picks its next word.
1920×1080, 60 fps, H.264. Output: [`out/next-word.mp4`](out/next-word.mp4).

Every frame is a pure function of time. `scene.html` exposes `renderFrame(t)`, and `render.mjs`
drives it in headless Chromium (Playwright), takes a screenshot of each of the 1800 frames and pipes them into ffmpeg.
There are no CSS animations or clocks, so the same code always renders the same video.

```sh
npm install          # playwright 1.56.1 (uses an existing Chromium install)
npm run render       # → out/next-word.mp4
npm run stills       # a few PNG frames → out/stills/
```

Beats: typing → tokens → numbers → attention → candidates (mat 62%, floor 14%, couch 9%, bed 6%) → "that's it. one word at a time."
The percentages are illustrative, not output from a real model.

Fonts: Inter / Inter Display (SIL OFL 1.1), bundled in `fonts/`.

## Keynote opener (20 s, with original soundtrack)

[`output/next-word-keynote.mp4`](output/next-word-keynote.mp4): 1920×1080, 60 fps, H.264 + AAC 320k.

```sh
npm run keynote          # synthesizes the music, renders 1200 frames, muxes → output/next-word-keynote.mp4
npm run keynote:music    # soundtrack only → output/next-word-keynote-soundtrack.wav
```

- `keynote/cues.js`: the single cue sheet both the picture and the music read. 120 BPM, so one beat is exactly 30 frames and every cut sits on a whole frame.
- `keynote/scene.html`: canvas renderer with 6-sample motion blur (180° shutter), grain and vignette.
- `keynote/music.mjs`: the soundtrack, synthesized from scratch: polyBLEP supersaws, FM bells, a sine kick, noise claps/hats/risers, a biquad filter, a Freeverb-style reverb, a ping-pong delay, sidechain and a limiter. No samples or plugins. The noise and dither use a fixed seed, so the WAV comes out bit-identical on every run.

Story, in four chapters on the beat: split into tokens → attention (causal: each word only looks back) → scores become probabilities → pick one and go again.
