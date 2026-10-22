// Renders the keynote opener: synthesizes the soundtrack, drives scene.html frame by
// frame in headless Chromium, and muxes both into one MP4.
// usage: node keynote/render.mjs                      -> output/next-word-keynote.mp4
//        node keynote/render.mjs --stills 3.2 9.5 ...  -> output/stills/*.png
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 60, DURATION = 20, W = 1920, H = 1080;
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "output");
mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);

const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, "scene.html")).href);
await page.evaluate(() => window.ready);
const frame = async t => {
  await page.evaluate(t => window.renderFrame(t), t);
  return page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
};

if (args[0] === "--stills") {
  mkdirSync(path.join(outDir, "stills"), { recursive: true });
  for (const s of args.slice(1)) writeFileSync(path.join(outDir, `stills/t${Number(s).toFixed(2).padStart(5, "0")}.png`), await frame(Number(s)));
} else {
  const wav = path.join(outDir, "next-word-keynote-soundtrack.wav");
  execFileSync("node", [path.join(here, "music.mjs"), wav], { stdio: "inherit" });
  const mp4 = path.join(outDir, "next-word-keynote.mp4");
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-i", wav,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000",
    "-t", String(DURATION), "-movflags", "+faststart", mp4,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = FPS * DURATION;
  for (let i = 0; i < total; i++) {
    const buf = await frame(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 240 === 0) console.error(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  console.error("wrote " + mp4);
}
await browser.close();
