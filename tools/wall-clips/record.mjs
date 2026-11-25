// Records short, seamless loops of real prototype interactions for the drift walls (no cursor: headless Chrome draws none).
//   node record.mjs <clips module> <out dir> [name ...]
// The clips module exports { base, prepare(ctx), clips: [{ name, url, theme, act(page, h) }] }.
// Each clip is filmed with Chrome's screencast (lossless frames, true timestamps), then made a constant 30 fps loop at
// 720x468 by encode.sh. act() must leave the page as it found it, so the last frame matches the first.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', process.env.PW_PATH].filter(Boolean)) { try { pw = require(p); break; } catch {} }
if (!pw) throw new Error('playwright not found: set PW_PATH to a node_modules/playwright folder');

const [, , mod, OUT, ...only] = process.argv;
const spec = (await import(path.resolve(mod))).default;
const [W, H] = spec.viewport || [1440, 936];   // the tile's 720x468 shape; encode.sh scales it down
const browser = await pw.chromium.launch({ args: ['--hide-scrollbars'] });

const helpers = page => ({
  wait: ms => page.waitForTimeout(ms),
  // a pointer that moves the way a hand does, in steps, so hover states play; nothing draws it
  async glide(x, y, ms = 400) { const n = Math.max(2, Math.round(ms / 16)); await page.mouse.move(x, y, { steps: n }); },
  async at(sel) { const b = await page.locator(sel).first().boundingBox({ timeout: 5000 }).catch(() => null); if (!b) throw new Error('not found: ' + sel); return [b.x + b.width / 2, b.y + b.height / 2]; },
  async press(sel, ms = 350) { const [x, y] = await this.at(sel); await this.glide(x, y, ms); await page.waitForTimeout(90); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); },
  // a step that may not exist on every page or person: tried, and skipped if it isn't there
  async try(fn) { try { await fn(); } catch (e) { console.warn('    (skipped a step: ' + e.message.split('\n')[0].slice(0, 80) + ')'); } },
  // a hand on the wheel: small notches, about 60 a second, so the page glides rather than jumps
  async scroll(dy, ms = 1200) {   // keeps to its time however slow each notch is, easing in and out like a hand
    const t0 = Date.now(); let done = 0;
    while (true) {
      const k = Math.min(1, (Date.now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const step = dy * e - done; if (Math.abs(step) >= 1) { await page.mouse.wheel(0, step); done += step; }
      if (k >= 1) break; await page.waitForTimeout(12);
    }
  },
  async type(text, cps = 22) { for (const ch of text) { await page.keyboard.type(ch); await page.waitForTimeout(1000 / cps * (0.6 + Math.random() * 0.8)); } },
});

const posters = [];
for (const clip of spec.clips) {
  if (only.length && !only.includes(clip.name)) continue;
  const rawDone = path.join(OUT, 'raw', clip.name + '.mp4');
  if (process.env.ENCODE_ONLY) { if (fs.existsSync(rawDone)) { finish(rawDone, clip); console.log(`${clip.name}: encoded`); } else console.warn(`${clip.name}: no raw recording`); continue; }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  if (spec.prepare) await spec.prepare(ctx, clip);
  if (spec.css) await ctx.addInitScript(css => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }), spec.css);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.warn(`  [${clip.name}] page error: ${e.message}`));
  await page.goto(spec.base + clip.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.mouse.move(W - 2, H - 2);
  await page.waitForTimeout(clip.settle ?? 2500);
  const h = helpers(page);
  if (clip.setup) { await clip.setup(page, h); await page.waitForTimeout(800); }

  const dir = path.join(OUT, 'frames', clip.name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = path.join(dir, String(frames.length).padStart(5, '0') + '.png');
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch {}
  });
  // nudge a repaint so the first frame arrives at once
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await page.evaluate(() => { const d = document.createElement('i'); d.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01'; document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.remove())); });
  const t0 = Date.now() / 1000;
  await page.waitForTimeout(clip.lead ?? 500);
  try { await clip.act(page, h); } catch (e) { console.warn(`  [${clip.name}] FAILED: ${e.message.split('\n')[0]}`); await cdp.send('Page.stopScreencast').catch(() => {}); await ctx.close(); continue; }
  await page.mouse.move(W - 2, H - 2, { steps: 12 });   // back where it started, so no hover is left lit
  await page.waitForTimeout(clip.tail ?? 500);
  const t1 = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(150);
  await ctx.close();

  // a concat list holding each frame for as long as it was on screen, so the timing is true
  const first = frames[0].t;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((fr, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : first + (t1 - t0);
    lines.push(`file '${path.resolve(fr.f)}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  lines.push(`file '${path.resolve(frames[frames.length - 1].f)}'`);
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const raw = path.join(OUT, 'raw', clip.name + '.mp4');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', raw]);
  finish(raw, clip);
  console.log(`${clip.name}: ${frames.length} frames, ${(t1 - t0).toFixed(1)}s -> ${raw}`);
}
await webp(posters);
await browser.close();

// ffmpeg here has no WebP encoder, so Chrome makes the posters (same quality as the wall's stills)
async function webp(list) {
  if (!list.length) return;
  const page = await browser.newPage();
  for (const png of list) {
    const url = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
    const data = await page.evaluate(async u => { const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/webp', 0.82); }, url);
    fs.writeFileSync(png.replace(/\.png$/, '.webp'), Buffer.from(data.split(',')[1], 'base64'));
    fs.rmSync(png);
  }
  await page.close();
}

// The tile's clip: 720x468, H.264, no sound, starting on its poster. With seam: 'fade', the end dissolves into the
// opening (for interactions that can't be undone), so the loop still has no cut.
function finish(raw, clip) {
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString());
  const out = path.join(OUT, 'clips', clip.name + '.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // 24 frames a second is plenty for interface motion, and a quarter fewer frames to store
  const scale = 'scale=720:468:flags=lanczos,setsar=1,fps=24';
  const F = clip.fade ?? 0.5;
  const vf = clip.seam === 'fade'
    ? `[0]${scale},split[x][y];[x]trim=start=${F},setpts=PTS-STARTPTS[a];[y]trim=end=${F},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${F}:offset=${(dur - 2 * F).toFixed(3)}[v]`
    : `[0]${scale}[v]`;
  const enc = (file, codec) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-filter_complex', vf, '-map', '[v]', '-an', ...codec, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['ignore', 'ignore', 'inherit'] });
  // Two encodes; the wall picks one (drift-wall.js). AV1 is the smaller by about half, for browsers that decode it in
  // hardware; H.264 is for the rest (older Safari, and machines that would have to decode AV1 in software).
  enc(out, ['-c:v', 'libx264', '-profile:v', 'high', '-crf', String(clip.crf ?? 30), '-preset', 'veryslow', '-tune', 'animation']);
  const av1 = out.replace(/\.mp4$/, '.av1.mp4');
  enc(av1, ['-c:v', 'libsvtav1', '-crf', String(clip.av1crf ?? 60), '-preset', '4', '-svtav1-params', 'tune=0:enable-overlays=1']);
  const png = out.replace(/\.mp4$/, '.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', out, '-frames:v', '1', png]);
  posters.push(png);
  console.log(`  -> ${path.basename(out)} ${Math.round(fs.statSync(out).size / 1024)} KB, AV1 ${Math.round(fs.statSync(av1).size / 1024)} KB`);
}
