// Renders compose.html frame by frame in headless Chrome and pipes the frames to ffmpeg.
//   node render.mjs <out.mp4> [fps=60] [scale=1] [crf=23]
// A quick look: node render.mjs /tmp/look.mp4 15 0.5 30
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [out, fps = '60', scale = '1', crf = '23'] = process.argv.slice(2);
const FPS = +fps, S = +scale, W = 1920, H = 1200;
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/groom-hero-render-${port}`, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await wait(250); }
await new Promise(r => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') console.error(m.params.exceptionDetails); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: S, mobile: false });
await send('Page.navigate', { url: pathToFileURL(path.join(here, 'compose.html')).href + '?render' });
await wait(1500);
await send('Runtime.evaluate', { expression: 'window.ready', awaitPromise: true });
const D = (await send('Runtime.evaluate', { expression: 'window.D', returnByValue: true })).result.result.value;   // the film's length, from compose.html
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-tune', 'animation', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const N = Math.round(D * FPS);
for (let f = 0; f < N; f++) {
  await send('Runtime.evaluate', { expression: `render(${f / FPS})` });
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  if (!ff.stdin.write(Buffer.from(r.result.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  if (f % (FPS * 5) === 0) process.stderr.write(`${(f / FPS).toFixed(0)}s `);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r));
ws.close(); chrome.kill(); console.error('\ndone', out);
