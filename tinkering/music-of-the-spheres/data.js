/* The planets Kepler knew, from the J2000 mean elements (JPL, Standish's approximate elements, valid 1800–2050) and
   the measured sidereal periods (NASA planetary fact sheets). a in AU, angles in degrees, P in Julian years. */
export const PLANETS = [
  { name: 'Mercury', a: 0.38710, e: 0.20563, varpi: 77.458, L: 252.251, P: 0.2408467, color: 0xb8afa3, size: 0.028 },
  { name: 'Venus',   a: 0.72333, e: 0.00677, varpi: 131.602, L: 181.980, P: 0.6151973, color: 0xe8cf98, size: 0.042 },
  { name: 'Earth',   a: 1.00000, e: 0.01671, varpi: 102.937, L: 100.464, P: 1.0000174, color: 0x7fb0dc, size: 0.044 },
  { name: 'Mars',    a: 1.52368, e: 0.09340, varpi: 336.041, L: 355.453, P: 1.8808476, color: 0xd9825a, size: 0.034 },
  { name: 'Jupiter', a: 5.20260, e: 0.04849, varpi: 14.331,  L: 34.351,  P: 11.862615, color: 0xd8b892, size: 0.085 },
  { name: 'Saturn',  a: 9.53707, e: 0.05551, varpi: 92.432,  L: 50.078,  P: 29.447498, color: 0xe6d6a2, size: 0.075 },
];

/* Years since J2000.0 (2000 January 1, 12:00 TT), now. */
export function yearsSinceJ2000(date = new Date()) {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000);
}

/* TRAPPIST-1's seven planets, periods in days (Agol et al. 2021), with a in units of planet b's orbit. */
export const TRAPPIST = [1.51088, 2.42180, 4.04961, 6.09950, 9.20659, 12.35281, 18.77294];

/* Io, Europa, Ganymede: periods in days. */
export const GALILEAN = [1.769138, 3.551181, 7.154553];
