/* Rochester, NY: the sun, the local clock and the season.
   The clock is real time. For testing, ?at=2026-12-24T20:00 jumps to a moment (Rochester time)
   and ?speed=600 runs time 600× faster. */
export const ROCHESTER = { lat: 43.1566, lon: -77.6088, tz: 'America/New_York' };
const RAD = Math.PI / 180;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ROCHESTER.tz, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
});
const params = new URLSearchParams(location.search);
const speed = Math.max(0, Number(params.get('speed')) || 1);
const realStart = Date.now();
let simStart = realStart;
if (params.get('at')) {
  const parsed = parseRochester(params.get('at'));
  if (Number.isFinite(parsed)) simStart = parsed;
}
export const clock = {
  speed,
  debug: params.has('at') || params.has('speed'),
  now: () => simStart + (Date.now() - realStart) * speed,
};

export function localParts(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { year: +o.year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, second: +o.second, weekday: o.weekday };
}
/* Epoch ms of local midnight that starts the day containing ms */
export function localMidnight(ms) {
  const p = localParts(ms);
  return ms - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - (ms % 1000);
}
/* "2026-12-24T20:00" read as Rochester wall time */
function parseRochester(s) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?$/.exec(s);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
  // shift by the zone offset at that moment (EST/EDT)
  const p = localParts(guess);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return guess + (guess - asUTC);
}

/* Solar altitude and azimuth (degrees; azimuth from north, clockwise) */
export function sunPosition(ms, lat = ROCHESTER.lat, lon = ROCHESTER.lon) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
}

/* Sunrise and sunset for the local day containing ms */
const dayCache = new Map();
export function sunTimes(ms) {
  const mid = localMidnight(ms);
  if (dayCache.has(mid)) return dayCache.get(mid);
  const h0 = -0.833;
  const f = t => sunPosition(t).alt - h0;
  const crossings = [];
  const step = 10 * 60000;
  for (let t = mid; t < mid + 86400000; t += step) {
    const a = f(t), b = f(t + step);
    if ((a < 0) !== (b < 0)) {
      let lo = t, hi = t + step;
      for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if ((f(lo) < 0) === (f(m) < 0)) lo = m; else hi = m; }
      crossings.push({ t: (lo + hi) / 2, rising: a < 0 });
    }
  }
  const out = {
    midnight: mid,
    sunrise: crossings.find(c => c.rising)?.t ?? null,
    sunset: crossings.find(c => !c.rising)?.t ?? null,
  };
  dayCache.set(mid, out);
  return out;
}

export function fireIsLit(ms) {
  const { sunset } = sunTimes(ms);
  return sunset != null && ms >= sunset;   // sunset until local midnight, when the day rolls over
}

/* The season runs from the first visit to January 1 (local midnight) */
export function seasonEnd(startMs) {
  const p = localParts(startMs);
  return parseRochester(`${p.year + 1}-01-01T00:00`);
}

export const timeLabel = ms => new Date(ms).toLocaleTimeString('en-US', { timeZone: ROCHESTER.tz, hour: 'numeric', minute: '2-digit' });
export const dateLabel = ms => new Date(ms).toLocaleDateString('en-US', { timeZone: ROCHESTER.tz, weekday: 'long', month: 'long', day: 'numeric' });

/* Lot hours (Troop 31, East Avenue): weekdays 11–9, Saturday 9–9, Sunday noon–8 */
export function lotHours(ms) {
  const { weekday } = localParts(ms);
  if (weekday === 'Sat') return [9, 21];
  if (weekday === 'Sun') return [12, 20];
  return [11, 21];
}
