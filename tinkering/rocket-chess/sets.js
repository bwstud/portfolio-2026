import { starship, saturnV, n1, shuttle, soyuz } from './rockets.js';
import { sputnik, explorer1, telstar, dongFangHong, aryabhata, voyager, hubble, jwst } from './satellites.js';

/* Set definitions. The major pieces share one scale so their heights compare honestly;
   the order of real heights is the order of a Staunton set (K > Q > B > N > R).
   Pawns are satellites, each scaled to fit a pawn. */

export const REAL = {
  id: 'real',
  name: 'Real craft',
  scale: 1250,
  pieces: {
    king: {
      build: starship, name: 'Starship', role: 'King', flag: 'USA · SpaceX', year: '2026 (Block 3)',
      height: 124.4, width: 9,
      sum: 'The tallest and most powerful rocket ever flown.',
      about: 'Super Heavy booster (72.3 m, 33 Raptor 3) under the Ship (52.1 m, 6 Raptors). Stainless steel throughout, with about 18,000 hexagonal heat-shield tiles on the windward side. Fully reusable by design: the booster is caught by the launch tower.',
      notes: 'Block 3 as first flown in May 2026: three larger grid fins with none on the leeward side, the hot-staging ring built into the booster, forward flaps set back toward the leeward side. Flap and grid-fin sizes are estimated from photographs; heights are SpaceX’s figures.',
    },
    queen: {
      build: saturnV, name: 'Saturn V', role: 'Queen', flag: 'USA · NASA', year: '1967–1973',
      height: 110.6, width: 10.1,
      sum: 'The Apollo Moon rocket. Thirteen flights, no payload lost.',
      about: 'Three stages: the S-IC with five F-1 engines, the S-II with five J-2s and the S-IVB with one. On top sit the Instrument Unit, the adapter holding the lunar module, the service module, and the command module under its boost cover. The escape tower is at the very top.',
      notes: 'Painted as SA-506, Apollo 11: the roll pattern on the lower third of the first stage, the checkered S-II/S-IVB interstage and the black Instrument Unit. The placement of the flag and lettering follows photographs, and fin span is 19.2 m (63 ft) tip to tip.',
    },
    bishop: {
      build: n1, name: 'N1', role: 'Bishop', flag: 'USSR', year: '1969–1972',
      height: 105.3, width: 17,
      sum: 'The Soviet Moon rocket. Four launches, four failures.',
      about: 'Thirty NK-15 engines in the first stage, still the most ever flown on one stage. Its spherical tanks sit inside a single long cone, so the rocket tapers from 17 m at the base. Open truss interstages let the upper stages fire before separation. The L3 lunar complex rode under the shroud at the top.',
      notes: 'Painted as vehicle 3L (February 1969): Blocks A and B grey, Block V half grey and half white, the L3 section white. Stage heights vary between sources, so the overall profile is fitted to the 105.3 m height and 17 m base.',
    },
    knight: {
      build: shuttle, name: 'Space Shuttle', role: 'Knight', flag: 'USA · NASA', year: '1981–2011',
      height: 56.1, width: 23.8,
      sum: 'The asymmetric stack. The orbiter juts out like a knight’s head.',
      about: 'Orbiter Discovery (37.2 m long, 23.8 m wingspan) on the orange External Tank (46.9 m × 8.4 m), flanked by two Solid Rocket Boosters (45.5 m × 3.7 m). Discovery flew 39 missions, more than any other orbiter.',
      notes: 'Late-programme livery: unpainted foam tank, NASA insignia and name on the fuselage. Orbiter cross-sections and wing planform are fitted to the published length, span and height. Tile patterns are simplified to the black-and-white regions.',
    },
    rook: {
      build: soyuz, name: 'Soyuz', role: 'Rook', flag: 'Russia · Roscosmos', year: '1966– (2.1a since 2004)',
      height: 46.3, width: 10.3,
      sum: 'The most-flown crew rocket. Its four flared boosters make a castle.',
      about: 'A direct descendant of Korolev’s R-7, which launched Sputnik. Four strap-on boosters (19.6 m) wrap the core’s narrow waist. A truss carries the third stage, and the crew Soyuz rides under the fairing with its escape tower and four folded grid fins.',
      notes: 'Soyuz-2.1a with a Soyuz MS crew vehicle. The fairing and escape-tower lengths are fitted to the 46.3 m total; the widest point is 10.3 m across the air rudders.',
    },
  },
  // files a–h, in launch order
  pawns: [
    { build: sputnik, name: 'Sputnik 1', flag: 'USSR', year: '1957', size: '0.58 m sphere, 2.4–2.9 m antennas',
      about: 'The first artificial satellite. A polished aluminium sphere that beeped on 20 and 40 MHz for 21 days.' },
    { build: explorer1, name: 'Explorer 1', flag: 'USA', year: '1958', size: '2.03 m × 0.15 m',
      about: 'America’s first satellite. Its cosmic-ray detector found the Van Allen radiation belts.' },
    { build: telstar, name: 'Telstar 1', flag: 'USA · AT&T', year: '1962', size: '0.88 m, 72 facets',
      about: 'Relayed the first live transatlantic television. 3,600 solar cells on a faceted ball.' },
    { build: dongFangHong, name: 'Dong Fang Hong 1', flag: 'China', year: '1970', size: '1 m, 72 facets',
      about: 'China’s first satellite. It played “The East Is Red” from orbit.' },
    { build: aryabhata, name: 'Aryabhata', flag: 'India · ISRO', year: '1975', size: '1.4 m, 26 faces',
      about: 'India’s first satellite, a 26-sided polyhedron launched on a Soviet rocket.' },
    { build: voyager, name: 'Voyager', flag: 'USA · NASA/JPL', year: '1977', size: '3.66 m dish, 13 m boom',
      about: 'Grand tour of the outer planets, now in interstellar space. Carries the Golden Record.' },
    { build: hubble, name: 'Hubble', flag: 'NASA · ESA', year: '1990', size: '13.2 m × 4.2 m',
      about: 'The telescope that measured the age of the universe. Shown after its final servicing in 2009.' },
    { build: jwst, name: 'James Webb', flag: 'NASA · ESA · CSA', year: '2021', size: '21.2 m × 14.2 m sunshield',
      about: 'A 6.5 m gold mirror behind a five-layer sunshield, a million miles out at L2.' },
  ],
};

export const SETS = [REAL];
