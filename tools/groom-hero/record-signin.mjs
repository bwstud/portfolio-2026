// Records the Groom Lake prototype's sign-in page for the opening of the hero film: framed on the card at 16:10, a
// cursor glides to Single Sign On and presses it, and the recording stops on the press (before the page changes).
//   node record-signin.mjs <out.mp4>
// Chrome's clock is stepped a frame at a time (virtual time), so the button's hover and press run at an even 60 fps
// however long each screenshot takes. The background's dot field (praxis-dotfield.js) times itself from
// requestAnimationFrame's timestamps, which follow the real clock even under virtual time: left alone, its slow wave
// raced past every few frames. So the page's requestAnimationFrame still runs on Chrome's frames (a screenshot waits
// for one), but hands its callbacks the recording's own time, and the wave starts from behind the card as the
// recording starts. The cursor is drawn into the
// page; real mouse events go with it, so the button reacts as it does under a real pointer.
import { spawn } from 'node:child_process';
const [out] = process.argv.slice(2);
const URL = 'https://groom-lake.vercel.app/login.html';
const FPS = 60, VW = 1710, VH = 1280, DPR = 2;
// the frame, in page px: 800 × 500 about the card and the Messages pill, which at 2x is the film's 1600 × 1000
const FRAME = { x: 455, y: 392, width: 800, height: 500 };
// the cursor's path (page px) and the beats, in seconds
const FROM = [1170, 860], TO = [985, 640];
const MOVE = [0.45, 1.75], PRESS = 2.3, END = 2.5;

const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/groom-signin-${port}`, 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await wait(250); }
await new Promise(r => (ws.onopen = r));
let id = 0; const pend = new Map(), waiters = [];
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method) waiters.filter(w => w.method === m.method).forEach(w => { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const once = method => new Promise(resolve => waiters.push({ method, resolve }));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let now = 0;
  window.requestAnimationFrame = cb => raf(() => cb(now));
  window.__tick = t => { now = t; };
})()` });
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: false });
const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url: URL }); await loaded;
await wait(2500);   // fonts and the page's own entrance settle in real time
// the cursor: macOS's arrow, and its pointing hand over anything that takes a click
await send('Runtime.evaluate', { expression: `(() => {
  const c = document.createElement('div'); c.id = 'rec-cursor';
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, width: '32px', height: '32px', zIndex: 2147483647, pointerEvents: 'none' });
  c.innerHTML = '<svg data-k="arrow" width="32" height="32" viewBox="0 0 32 32"><path d="M4 2 L4 24 L9.5 18.8 L13.2 27.4 L16.8 25.9 L13.2 17.4 L20.6 17.4 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    + '<svg data-k="hand" width="32" height="32" viewBox="0 0 32 32" style="display:none;position:absolute;left:-9px;top:-2px"><path d="M12 3.5c1.3 0 2.2 1 2.2 2.2v8.1l.6-.1V10c0-1.2 1-2.1 2.2-2.1s2.1.9 2.1 2.1v4.2l.6-.1v-2.8c0-1.2 1-2.1 2.2-2.1s2.1.9 2.1 2.1v3.6l.5-.1v-1.3c0-1.2 1-2.1 2.1-2.1 1.2 0 2.1.9 2.1 2.1v6.7c0 4.6-3.2 8.3-8.4 8.3h-1.6c-2.6 0-4.4-1-6-3l-5.3-6.7c-.8-1-.6-2.4.4-3.1 1-.7 2.3-.5 3.1.4l1.3 1.6V5.7c0-1.2 1-2.2 2.2-2.2z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.append(c);
  window.__cursor = (x, y) => { c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const el = document.elementFromPoint(x, y), hand = !!el && getComputedStyle(el).cursor === 'pointer';
    c.children[0].style.display = hand ? 'none' : ''; c.children[1].style.display = hand ? '' : 'none'; };
})()` });
await send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const ease = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
let pressed = false;
for (let f = 0; f < Math.round(END * FPS); f++) {
  const t = f / FPS, p = ease(Math.min(1, Math.max(0, (t - MOVE[0]) / (MOVE[1] - MOVE[0]))));
  // a slight arc, as a hand moves, rather than a ruler-straight line
  const x = FROM[0] + (TO[0] - FROM[0]) * p + Math.sin(p * Math.PI) * 18, y = FROM[1] + (TO[1] - FROM[1]) * p;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (!pressed && t >= PRESS) { pressed = true; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); }
  await send('Runtime.evaluate', { expression: `__cursor(${x}, ${y}); __tick(${(1000 * t).toFixed(3)})` });
  const done = once('Emulation.virtualTimeBudgetExpired');
  await send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / FPS }); await done;
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...FRAME, scale: 1 } });
  if (!ff.stdin.write(Buffer.from(r.result.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
}
ff.stdin.end(); await new Promise(r => ff.on('close', r));
ws.close(); chrome.kill(); console.error('done', out);
