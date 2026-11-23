/* Powers of Watts — the numbers, with where they come from. */

export const BODY = 97;                 // W: 2,000 kcal a day, the body's whole budget (we round to 100 in prose)
export const RIDER = 75;                // W: what an ordinary adult can hold at the pedals for an hour
export const PEOPLE = 8.2e9;            // alive in 2024 (UN World Population Prospects)
export const TODAY = 18.8e12;           // W: 592 EJ of primary energy in 2024 (Energy Institute, Statistical Review 2025)
export const TODAY_YEAR = 2024;         // the year of the energy figure
export const SUNLIGHT_ON_EARTH = 1.74e17;   // W: 1361 W/m² × π R²
export const SUN = 3.828e26;            // W: IAU nominal solar luminosity
export const MILKY_WAY = 4e36;          // W: about; estimates run 10³⁶ to 10³⁷
export const TYPE = { 1: 1e16, 2: 1e26, 3: 1e36 };   // Sagan's interpolation of Kardashev's three types

/* K from power. The interpolation is Sagan's idea (1973); this exact formula became standard later. */
export const kOf = P => (Math.log10(P) - 6) / 10;
export const pOfK = K => Math.pow(10, K * 10 + 6);

/* Total energy supply per person, kW, latest year (Our World in Data, from the Energy Institute and EIA).
   It counts commercial energy only: firewood and dung, a large share in the poorest countries, are left out. */
export const COUNTRIES = [
  { name: 'Iceland', kw: 23.6 },
  { name: 'Qatar', kw: 22.7 },
  { name: 'Canada', kw: 9.52 },
  { name: 'United States', kw: 8.56 },
  { name: 'Russia', kw: 6.86 },
  { name: 'Japan', kw: 4.24 },
  { name: 'Germany', kw: 3.79 },
  { name: 'China', kw: 3.63 },
  { name: 'United Kingdom', kw: 2.87 },
  { name: 'World average', kw: 2.31 },
  { name: 'Brazil', kw: 1.67 },
  { name: 'India', kw: 0.85 },
  { name: 'Nigeria', kw: 0.25 },
  { name: 'Ethiopia', kw: 0.08 },
];

/* Format a power in watts, the way a meter would print it. */
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = n => String(n).split('').map(c => SUP[c] ?? c).join('');
export function sci(v, digits = 1) {
  if (!isFinite(v) || v <= 0) return '0';
  const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
  const ms = m.toFixed(digits);
  if (ms === (10).toFixed(digits)) return `1 × 10${sup(e + 1)}`;
  return `${ms} × 10${sup(e)}`;
}
export function watts(v) {
  if (v < 1e3) return `${v < 10 ? v.toFixed(1) : Math.round(v)} W`;
  if (v < 1e6) return `${(v / 1e3).toFixed(v < 1e4 ? 2 : 1)} kW`;
  if (v < 1e9) return `${(v / 1e6).toFixed(v < 1e7 ? 2 : 1)} MW`;
  if (v < 1e12) return `${(v / 1e9).toFixed(v < 1e10 ? 2 : 1)} GW`;
  if (v < 1e15) return `${(v / 1e12).toFixed(v < 1e13 ? 2 : 1)} TW`;
  return `${sci(v)} W`;
}
export function years(y) {
  if (!isFinite(y)) return 'never';
  if (y < 1000) return `${Math.round(y)} years`;
  if (y < 1e6) return `${(y / 1e3).toFixed(y < 1e4 ? 1 : 0)} thousand years`;
  if (y < 1e9) return `${(y / 1e6).toFixed(y < 1e7 ? 1 : 0)} million years`;
  return `${(y / 1e9).toFixed(1)} billion years`;
}

const PLAIN = { '⁻': '−', '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
/* Printed superscripts (10¹³) become real ones in HTML, so figures keep one size. */
export const supHTML = s => s.replace(/10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, x) => `10<sup>${[...x].map(c => PLAIN[c]).join('')}</sup>`);
