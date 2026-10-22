// Deterministic renderer: drives scene.html frame by frame and pipes PNGs into ffmpeg.
// usage: node render.mjs [out.mp4]            full render
//        node render.mjs --stills 2.0 6.5 ... write PNG stills to out/stills/
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const FPS = 60, DURATION = 30, W = 1920, H = 1080;
const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(root, "scene.html")).href);
await page.evaluate(() => window.ready);

const frame = async t => {
  await page.evaluate(t => window.renderFrame(t), t);
  return page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
};

if (args[0] === "--stills") {
  mkdirSync(path.join(root, "out/stills"), { recursive: true });
  for (const s of args.slice(1)) {
    writeFileSync(path.join(root, `out/stills/t${Number(s).toFixed(2)}.png`), await frame(Number(s)));
  }
} else {
  const out = path.resolve(args[0] || path.join(root, "out/next-word.mp4"));
  mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn("ffmpeg", [
    "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-tune", "animation",
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-r", String(FPS), "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = FPS * DURATION;
  for (let i = 0; i < total; i++) {
    const buf = await frame(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 300 === 0) console.error(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))));
  console.error("wrote " + out);
}
await browser.close();
