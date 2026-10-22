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
