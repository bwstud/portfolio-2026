/* Nav buttons ("chips") and the static spark: the settings the Button Lab tunes. The site and the
   lab both apply them from here, as CSS custom properties on <html>, so a saved version changes the
   look without touching styles.css. styles.css carries the same defaults, so the page still looks
   right if this script never runs. Load button-versions.js first, in <head>, to avoid a flash. */
(function () {
  const DEFAULTS = {
    // Shape
    height: 36, padX: 16, radius: 18, border: 1, gap: 10,
    // Type
    fontSize: 14, fontWeight: 500, tracking: 0, uppercase: false,
    labelLift: 0,   // px the label sits above true centre, to centre it optically
    // Fill: the gradient runs from top to bottom colour at this angle (180 = straight down)
    angle: 180,
    topD: '#10202d', bottomD: '#0a161f', edgeD: '#2c3b46', textD: '#dae4e3',
    topL: '#fffdf7', bottomL: '#f0ebe0', edgeL: '#cfcbc3', textL: '#040a13',
    // Grain: the split-flap film grain
    grain: 0.14, grainSize: 83, grainBlend: 'normal',
    // Shadows: a stack, painted first-on-top like CSS. Each one shows in both themes, or only one.
    shadows: [],
    // States
    hoverBright: 1.18, pressY: 1, pressBright: 0.92, currentBright: 0.82, speed: 150,
    // Spark
    spark: true, sparkJump: 50, sparkLife: 200, sparkRestrike: 45, sparkJag: 0.35,
    sparkCore: 1.2, sparkGlow: 3, sparkBlur: 10,
    sparkCoreColor: '#ffffff', sparkGlowColor: '#6eaaff', sparkFlash: true,
  };

  // The site palette (styles.css --c-*). A colour that matches one is written as var(--c-name),
  // so the buttons follow the palette if it changes. Keep in step with styles.css.
  const PALETTE = {
    night: '#040a13', navy: '#132534', pine: '#212c2d', slate: '#3c4f56', graphite: '#2f2f2f',
    silver: '#b8b9b9', pewter: '#8b8b93', mist: '#dae4e3', rust: '#9f4933', umber: '#965200',
    orange: '#f18300', apricot: '#ffb078', khaki: '#a0855b', sand: '#c7b799', sage: '#a6af98',
    mocha: '#92715f', teal: '#418a8b', ochre: '#dfc06c', paper: '#f5f3ed', linen: '#f3eee7',
    frost: '#e9f3f2', foam: '#f0f6f6', cloud: '#e9edf2',
  };
  const BY_HEX = Object.fromEntries(Object.entries(PALETTE).map(([name, hex]) => [hex, name]));
  const token = hex => (BY_HEX[String(hex).toLowerCase()] ? `var(--c-${BY_HEX[String(hex).toLowerCase()]})` : hex);

  const px = v => v + 'px';
  const alpha = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  const SHADOW = { theme: 'both', inset: false, x: 0, y: 2, blur: 6, spread: 0, color: '#000000', alpha: 0.4 };
  function shadowList(list, theme) {
    const out = (list || [])
      .map(sh => ({ ...SHADOW, ...sh }))
      .filter(sh => sh.alpha > 0 && (sh.theme === 'both' || sh.theme === theme))
      .map(sh => `${sh.inset ? 'inset ' : ''}${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread}px ${alpha(sh.color, sh.alpha)}`);
    return out.join(', ') || 'none';
  }

  function vars(c) {
    return {
      '--chip-h': px(c.height), '--chip-px': px(c.padX), '--chip-radius': px(c.radius),
      '--chip-bw': px(c.border), '--chip-gap': px(c.gap),
      '--chip-fs': px(c.fontSize), '--chip-fw': String(c.fontWeight), '--chip-ls': c.tracking + 'em',
      '--chip-tt': c.uppercase ? 'uppercase' : 'none', '--chip-lift': px(c.labelLift),
      '--chip-angle': c.angle + 'deg',
      '--chip-top-d': token(c.topD), '--chip-bottom-d': token(c.bottomD), '--chip-edge-d': token(c.edgeD), '--chip-text-d': token(c.textD),
      '--chip-top-l': token(c.topL), '--chip-bottom-l': token(c.bottomL), '--chip-edge-l': token(c.edgeL), '--chip-text-l': token(c.textL),
      '--chip-grain': String(c.grain), '--chip-grain-size': px(c.grainSize), '--chip-grain-blend': c.grainBlend,
      '--chip-shadow-d': shadowList(c.shadows, 'dark'), '--chip-shadow-l': shadowList(c.shadows, 'light'),
      '--chip-hover': String(c.hoverBright), '--chip-press-y': px(c.pressY),
      '--chip-press': String(c.pressBright), '--chip-current': String(c.currentBright),
      '--chip-speed': c.speed + 'ms',
      '--spark-glow': alpha(c.sparkGlowColor, 0.8),
    };
  }

  function activeConfig() {
    const store = window.BUTTON_VERSIONS;
    const version = store && store.versions.find(v => v.id === store.active);
    return { ...DEFAULTS, ...(version ? version.config : {}) };
  }

  // spark.js reads Buttons.cfg on every move, so the lab's changes take effect at once
  const api = {
    DEFAULTS, SHADOW, PALETTE, activeConfig, cfg: activeConfig(),
    apply(c) {
      api.cfg = { ...DEFAULTS, ...c };
      const style = document.documentElement.style;
      for (const [k, v] of Object.entries(vars(api.cfg))) style.setProperty(k, v);
    },
  };
  window.Buttons = api;
  api.apply(api.cfg);
})();
