/* The curriculum. Text lives here so the lesson list loads without any 3D code;
   each lesson's scene is a separate module loaded on demand. */

export const PARTS = {
  intro: '',
  direct: 'Part 1 · Direct light',
  image: 'Part 2 · From light to pixels',
  indirect: 'Part 3 · Indirect light',
  rays: 'Part 4 · Ray tracing',
  blender: 'Part 5 · Blender',
};

export const LESSONS = [
  {
    id: 'start', part: 'intro', short: 'Start here', sub: 'The one equation',
    kicker: 'Lesson 0 · orientation',
    title: 'Every renderer is solving the same equation',
    load: () => import('./start.js'),
    body: `
      <p>Light leaves a source, bounces around the scene, and some of it ends up in the camera. A pixel's colour is how much light arrives at it from one direction. Every lighting technique you'll meet, from a 1990s Phong highlight to a film path tracer, is an approximation of one equation:</p>
      <div class="formula">L<sub>o</sub>(x, ω<sub>o</sub>) = L<sub>e</sub> + ∫ f(ω<sub>i</sub>, ω<sub>o</sub>) · L<sub>i</sub>(x, ω<sub>i</sub>) · cos θ<sub>i</sub> dω<sub>i</sub></div>
      <p>In words: the light leaving a point toward you (<strong>L<sub>o</sub></strong>) is whatever the point emits (<strong>L<sub>e</sub></strong>), plus all the light arriving from every direction (<strong>L<sub>i</sub></strong>), weighted by how the material redirects it (<strong>f</strong>, the BRDF) and by the angle it arrives at (<strong>cos θ</strong>).</p>
      <p>The hard part is that L<sub>i</sub> is itself the light leaving some <em>other</em> point, which has its own integral. Light is recursive. That's why there are so many techniques:</p>
      <p class="aside"><b>Rasterising</b> (three.js by default) solves only the first bounce exactly, from a handful of lights, and fakes the rest with environment maps, ambient terms and baked textures. Fast enough for 60 fps.<br><br><b>Path tracing</b> (Cycles, Arnold, the last lessons here) estimates the whole integral by following random rays through many bounces and averaging. Slow, noisy at first, and correct.</p>
      <p>Photorealism comes from getting five things right: <strong>plausible light quantities</strong>, <strong>physically based materials</strong>, <strong>shadows and occlusion</strong>, <strong>indirect light</strong>, and a <strong>camera-like image pipeline</strong> (exposure, tone mapping). The lessons go through them in that order, then move into ray tracing and Blender.</p>
      <p>The scene on the left uses most of what you'll learn. By the end you'll know why each part of it looks the way it does, and which parts are cheats.</p>`,
    tasks: [
      'Orbit the scene (drag), zoom (scroll or pinch) and pan (right-drag or two fingers).',
      'Turn the environment light off, then the lamp. Notice how much of the look comes from each.',
      'Read the equation aloud in your own words. If you can explain it to someone else, you are ready for lesson 1.',
    ],
    questions: [
      ['Why is the rendering equation hard to solve directly?', 'Because the incoming light L<sub>i</sub> at one point is the outgoing light L<sub>o</sub> of another point. Each point depends on every other point it can see, so the equation is recursive (an integral equation), with no closed-form answer for real scenes.'],
      ['What does a rasteriser give up to run at 60 fps?', 'Mostly indirect light (light that has bounced off other surfaces) and accurate visibility for anything other than a few lights. It computes direct lighting from listed lights per pixel and approximates the rest.'],
    ],
    ask: [
      '"Quiz me on the rendering equation. Ask one question at a time."',
      '"What does a BRDF actually look like for chalk, plastic and chrome?"',
    ],
  },

  {
    id: 'falloff', part: 'direct', short: 'Light and distance', sub: 'Inverse square, cosine law',
    kicker: 'Lesson 1 · direct light',
    title: 'Light spreads out, and arrives at an angle',
    load: () => import('./falloff.js'),
    body: `
      <p>A small bulb sends its light out in every direction. At distance d that light is spread over a sphere of area 4πd², so doubling the distance spreads it over four times the area. This is the <strong>inverse-square law</strong>.</p>
      <p>Light also arrives at an angle. A beam hitting a surface at a slant covers a larger patch than one hitting it head on, so each square metre gets less. That's <strong>Lambert's cosine law</strong>. Together they give the light arriving at a point, called <strong>illuminance</strong> E:</p>
      <div class="formula">E = I · cos θ / d²     (lux = candela · cos θ / metres²)</div>
      <p><strong>I</strong> is the bulb's luminous intensity in candela, d is the distance in metres, and θ is the angle between the incoming light and the surface normal. three.js uses these physical units: a <code>PointLight</code>'s intensity is in candela, and its <code>decay</code> of 2 is the inverse-square law. Setting decay to 0 or 1 is not physical. Older tutorials do it because it was easier to tune.</p>
      <p>A matte white surface reflects a fraction ρ (its albedo) of E, spread evenly over the hemisphere above it. What the camera sees is its <strong>luminance</strong>, L = ρ · E / π. The π comes from spreading the light over that hemisphere, and it turns up in every lighting formula from here on.</p>
      <p class="aside">Some reference points. A candle is about 1 cd. A 60 W-equivalent bulb (800 lm) is about 65 cd in every direction. A living room is lit to 50–150 lux, an office to around 500, an overcast day gives about 10,000 lux and direct sun about 100,000.</p>
      <p>Switch the view to <b>false colour</b>. That's E itself, mapped to colours on a log scale, before any material or camera gets involved. Click anywhere on the floor or the wall to probe that point.</p>`,
    tasks: [
      'Probe the floor right under the bulb, then 2 m away. Predict E before you look, using E = I cos θ / d².',
      'Double the height. Under the bulb, does E halve or quarter? Check it with the probe.',
      'Probe the wall at the same distance as a floor point. Why is it dimmer? (Look at θ in the readout.)',
      'Set decay to 0 and look at the false colour. Why does the light never fade? Why does that look wrong in render view?',
      'Set the bulb to 65 cd (a household bulb) at 2.4 m, about a ceiling light. You get roughly 10 lux on the floor. Real rooms use several lights and a lot of bounce light. That\'s lesson 6.',
    ],
    questions: [
      ['A light at 1 m gives 200 lux. What does it give at 3 m, straight on?', '200 / 3² ≈ 22 lux.'],
      ['Same light, same 1 m, but the surface is tilted 60° away from the light. What now?', 'cos 60° = 0.5, so 100 lux.'],
      ['Why does a white floor at 100 lux appear blown out unless you lower the exposure?', 'Its luminance is ρE/π ≈ 0.8 × 100 / π ≈ 25 cd/m². three.js passes that number to the screen, which can only show 0 to 1 before tone mapping. A camera solves this with exposure, and so do we. That\'s lesson 4.'],
    ],
    ask: [
      '"Derive the inverse-square law from the area of a sphere."',
      '"What\'s the difference between lumens, candela, lux and nits?"',
    ],
  },

  {
    id: 'surfaces', part: 'direct', short: 'Surfaces', sub: 'Diffuse, specular, Fresnel',
    kicker: 'Lesson 2 · materials',
    title: 'What a surface does with the light it gets',
    load: () => import('./surfaces.js'),
    body: `
      <p>When light hits a surface, two things happen.</p>
      <p><strong>Specular reflection</strong> happens right at the boundary. Some light bounces off like a mirror. On a rough surface, microscopic facets point in slightly different directions, so the reflection blurs into a highlight. <code>roughness</code> controls how much the facets spread.</p>
      <p><strong>Diffuse reflection</strong> is light that gets into the material, scatters around among pigment particles, and comes back out in random directions, coloured by the material. That's where "the colour of the object" comes from. Metals have free electrons that absorb any light that gets in, so they have <em>no</em> diffuse at all. Their colour is in the specular reflection. That's what <code>metalness</code> means.</p>
      <p>The amount reflected at the boundary depends on angle. That's the <strong>Fresnel effect</strong>. Head on, most non-metals (plastic, wood, skin, water) reflect only about 4%, but at a grazing angle every surface becomes a mirror. Look across a table top toward a window and you'll see it.</p>
      <div class="formula">F(θ) ≈ F₀ + (1 − F₀)(1 − cos θ)⁵     F₀ ≈ 0.04 for non-metals</div>
      <p>A physically based (PBR) material is a BRDF built from those pieces: a diffuse lobe ρ/π, plus a microfacet specular lobe D·F·G/(4 cos θ<sub>l</sub> cos θ<sub>v</sub>), where D is the facet distribution (GGX), F is Fresnel and G is self-shadowing between facets. It also keeps <strong>energy conservation</strong>: light that is reflected specularly isn't also available for diffuse, and a rough highlight gets dimmer as it gets wider.</p>
      <p>The point of all this is that a PBR material looks right under <em>any</em> lighting, because its parameters describe the surface, not the look.</p>`,
    tasks: [
      'Switch to the roughness row. Watch the highlight get wider and dimmer from left to right. That\'s energy conservation.',
      'Set part to "specular only" on a red plastic sphere. The highlight is white. Non-metal reflections are not coloured.',
      'Now set metalness to 1. "Diffuse only" goes black, and the reflection takes the base colour.',
      'Turn on the glossy black floor and orbit down until you\'re nearly level with it. Watch the reflection strengthen. That\'s Fresnel.',
      'Switch the light to the studio environment. Notice how much better smooth and metal surfaces look with something to reflect.',
    ],
    questions: [
      ['Why does a perfect chrome ball look black under a single point light in an empty scene?', 'A mirror only shows what it reflects. With one tiny light it reflects a single bright dot and otherwise the empty black world. Metals need an environment.'],
      ['Gold and copper reflect coloured light. What colour is the highlight on red plastic, and why?', 'White, or the light\'s colour. Dielectric specular happens at the surface before light reaches the pigment, so it isn\'t tinted.'],
      ['Why do rough highlights get dimmer as they widen?', 'The same reflected energy is spread over a larger solid angle, so each direction gets less. That\'s energy conservation.'],
    ],
    ask: [
      '"Walk me through GGX: what are D, F and G physically?"',
      '"Why do so many PBR materials use F₀ = 0.04?"',
    ],
  },

  {
    id: 'shadows', part: 'direct', short: 'Shadows', sub: 'Shadow maps and their artefacts',
    kicker: 'Lesson 3 · visibility',
    title: 'Shadows are a visibility question',
    load: () => import('./shadows.js'),
    body: `
      <p>The rendering equation needs to know whether a light can <em>see</em> each point. A ray tracer just asks, by firing a ray toward the light. A rasteriser can't fire rays, so it uses a <strong>shadow map</strong>: render the scene once from the light's point of view, storing only depth, then for each pixel on screen ask "is this point farther from the light than what the light saw?" If so, something is in the way.</p>
      <p>Every shadow-map artefact comes from that comparison being made on a grid of finite texels:</p>
      <p class="aside"><b>Acne:</b> stripy self-shadowing, because a texel covers an area and the surface is compared against itself. Fixed with <b>bias</b> (and normal bias), which pushes the comparison back a little.<br><br><b>Peter-panning:</b> too much bias and shadows detach from their objects, which seem to float.<br><br><b>Aliasing:</b> blocky edges when one texel covers several centimetres. Fixed with more resolution, or a tighter frustum around what matters.</p>
      <p>Real shadows are soft because real lights have size. Points near the edge of a shadow can see part of the light (the <strong>penumbra</strong>). The width depends on how big the light is and how far the shadow falls from the object that casts it: crisp where an object touches the floor, softer farther away. Shadow maps fake softness with a uniform blur (PCF or VSM), so they miss that contact hardening. Path tracers get it for free.</p>
      <div class="formula">penumbra width ≈ light size × (receiver distance − blocker distance) / blocker distance</div>`,
    tasks: [
      'Set bias and normal bias to 0. Find the acne on the tilted board and the sphere.',
      'Now push bias up until the pole\'s shadow detaches from its foot. That\'s peter-panning. Find a value that avoids both.',
      'Drop the map to 256 and turn on "show the light\'s view". Shrink the frustum until edges sharpen. What\'s the trade-off?',
      'Compare hard, PCF and VSM with a large blur radius. Does any of them get crisp near the contact point and softer further away?',
      'Switch to a spot light. Why does its shadow camera look different from the sun\'s?',
    ],
    questions: [
      ['Why does a directional light use an orthographic shadow camera, and a spot light a perspective one?', 'A directional light\'s rays are parallel (the sun is effectively infinitely far), so its view has no perspective. A spot light radiates from a point, which is a perspective projection.'],
      ['Your shadow is blocky. List three fixes in order of cost.', 'Tighten the shadow camera frustum to what\'s on screen (free), add filtering (PCF/VSM, cheap), raise the map resolution (memory and fill cost). Engines also split the frustum into cascades.'],
      ['What physical property makes shadows soft?', 'The size of the light source as seen from the receiving point. A bigger or closer light gives a wider penumbra.'],
    ],
    ask: [
      '"How do cascaded shadow maps work, and why do games need them?"',
      '"Explain PCSS, which does contact-hardening soft shadows with shadow maps."',
    ],
  },

  {
    id: 'exposure', part: 'image', short: 'Exposure and tone', sub: 'HDR, tone mapping, sRGB',
    kicker: 'Lesson 4 · the image pipeline',
    title: 'Turning light into pixels, like a camera does',
    load: () => import('./exposure.js'),
    body: `
      <p>A renderer computes <strong>radiance</strong>: real, unbounded, linear amounts of light. A sunlit window might be 10,000 times brighter than the shadow under a sofa. That range is about 13 <strong>stops</strong> (each stop is a doubling). A screen can show roughly 0 to 1, a range of maybe 8–10 stops. Getting from one to the other takes three steps, the same ones a camera takes.</p>
      <p><strong>1. Exposure.</strong> Multiply everything by one number so the important part of the scene lands in a useful range. Adding one EV doubles the image's brightness. This is the camera's shutter, aperture and ISO.</p>
      <p><strong>2. Tone mapping.</strong> Squeeze the remaining highlights into 0–1 smoothly instead of clipping them to flat white. Operators differ in contrast and in how they handle very bright, saturated colour. ACES shifts hues (bright blue lights turn purple). AgX, the default in Blender, fades brights toward white the way film does. Khronos Neutral keeps mid-tone colours faithful, which product shots need.</p>
      <p><strong>3. Output encoding.</strong> Screens expect sRGB-encoded values, roughly linear<sup>1/2.2</sup>. Light maths must happen in linear values and be encoded only at the very end. Doing maths on encoded values, or forgetting to encode, is the classic "gamma bug". It makes lighting look harsh and fake.</p>
      <div class="formula">pixel = encode( tonemap( radiance × 2<sup>EV</sup> ) )</div>
      <p>The <b>false colour</b> view shows stops relative to middle grey (18% reflectance, the green band). Cinematographers use it to judge exposure without being fooled by the monitor.</p>`,
    tasks: [
      'With tone mapping set to none, raise the exposure until the room looks right. The window clips to flat white and loses all detail.',
      'Switch through Reinhard, ACES, AgX and Neutral at the same exposure. Watch the window, the blue lamp and the red sphere\'s highlight.',
      'Turn the blue lamp up to 2,000 nits under ACES, then AgX. Which hue holds?',
      'Set encoding to "forgot to encode" and then "encoded twice". Describe what each does to the shadows.',
      'In false colour, find an exposure where the grey sphere sits in the green band. That\'s a "correct" exposure.',
    ],
    questions: [
      ['If a renderer outputs 0.18 for a mid-grey card, what sRGB value should the pixel get with no tone mapping?', 'About 0.46 (118 out of 255). sRGB encoding lifts the darks, so linear 0.18 appears as mid-grey on screen.'],
      ['Why not just tone map in sRGB space?', 'Tone curves and colour maths assume linear light, where adding two lights adds their values. In encoded space, 0.5 + 0.5 isn\'t twice as much light, so blends, blurs and bloom come out wrong.'],
      ['Why do ACES-tone-mapped blue lights turn purple?', 'ACES applies its curve to each RGB channel separately, in a wide gamut. Extremely saturated values run into the channels\' limits at different rates and the hue rotates. AgX desaturates toward white first to avoid that.'],
    ],
    ask: [
      '"What\'s the difference between scene-referred and display-referred?"',
      '"Explain filmic tone mapping: where did the S-curve come from?"',
    ],
  },

  {
    id: 'environment', part: 'indirect', short: 'Light from everywhere', sub: 'HDRIs and IBL',
    kicker: 'Lesson 5 · image-based lighting',
    title: 'Light from every direction at once',
    load: () => import('./environment.js'),
    body: `
      <p>Outdoors, the sun is one light, but the whole sky is another: a huge, soft, blue one. Indoors, every wall and window is a light source. Listing all of those as lights is impossible, so we photograph them.</p>
      <p>An <strong>HDRI</strong> is a 360° photograph of the light arriving at one point, stored with real values. A sun pixel can be 100,000 times the sky's value instead of being clipped to white. Using it as the light is called <strong>image-based lighting</strong> (IBL).</p>
      <p>For a <strong>diffuse</strong> surface, the integral over the hemisphere averages the HDRI so much that it's effectively a blur of the whole half-sphere. A <strong>rough</strong> specular surface averages a cone, wider as roughness rises. three.js precomputes all of that into a <code>PMREM</code> (prefiltered mipmapped radiance environment map), with one blur level per roughness, so lookups are instant.</p>
      <p>IBL has two big gaps in a rasteriser:</p>
      <p class="aside"><b>No occlusion.</b> The environment lights the inside of a cup as brightly as the outside, because nothing checks whether the cup itself blocks the sky. Ambient occlusion maps fake it.<br><br><b>No shadows from the HDRI.</b> The sun in the image lights things but casts nothing. The usual fix is to find the sun in the HDRI and add a matching directional light with a shadow map.</p>
      <p>The readout shows the dynamic range we measured in the loaded image: how many stops lie between its average and its brightest pixel.</p>`,
    tasks: [
      'Switch between the three HDRIs. Look at the colour cast each one puts on the white sphere.',
      'Set the background to "blur to roughness" and drag roughness. You\'re seeing roughly what that material reflects.',
      'Look inside the bowl. It\'s lit as if it weren\'t there. Now add the matching sun on the outdoor HDRI: you get a shadow, but the bowl\'s inside is still too bright.',
      'Rotate the environment. The highlights and shading move with it, because the lighting is the picture.',
      'Turn the environment intensity down to 0.1 and the background off. That\'s what a scene with no ambient light looks like.',
    ],
    questions: [
      ['Why can\'t an 8-bit JPEG panorama light a scene properly?', 'It clips everything bright to 255, so the sun becomes no brighter than a white cloud. The lighting loses its direction and contrast. HDR formats keep the real ratios.'],
      ['Why is a PMREM needed instead of just sampling the HDRI?', 'A rough surface reflects light from a wide cone, and integrating that cone per pixel per frame would need thousands of samples. Prefiltering does that integral once per roughness level, ahead of time.'],
      ['What does an ambient occlusion map approximate?', 'How much of the sky (the hemisphere above each point) is blocked by nearby geometry. It\'s visibility for environment light.'],
    ],
    ask: [
      '"How are HDRIs shot? Bracketing, chrome balls, and so on."',
      '"What are spherical harmonics and why do engines use them for diffuse light?"',
    ],
  },

  {
    id: 'bounce', part: 'indirect', short: 'Bounce light', sub: 'Global illumination, Cornell box',
    kicker: 'Lesson 6 · global illumination',
    title: 'Light that bounces is most of the light',
    load: () => import('./bounce.js'),
    body: `
      <p>So far, light has made one trip: source → surface → camera. Real light keeps going. A white ceiling lit by a lamp becomes a big soft light for the room. A red wall lights a white floor next to it red. That's <strong>colour bleeding</strong>. Light that has bounced at least once is <strong>indirect light</strong>, and together with direct light it's called <strong>global illumination</strong> (GI).</p>
      <p>This is the <strong>Cornell box</strong>, a real box built at Cornell in 1984 to compare renders against photographs. It's still the standard test, because the coloured walls make bounce light easy to see.</p>
      <p>The raster version can only light the box directly. Its fill options are the usual cheats. A flat ambient term adds the same light everywhere, with no direction, no bleeding and no occlusion. A hemisphere light adds sky-from-above and ground-from-below, which is a bit better. Engines go further with baked lightmaps, light probes, screen-space GI and, recently, hardware ray tracing (Unreal's Lumen, for example).</p>
      <p>Switch to <b>path traced</b>. The same scene and light are now solved with three-gpu-pathtracer, which follows rays through several bounces. Set bounces to 1 and you get direct light only, with correct soft shadows. Each extra bounce adds the light that has bounced one more time.</p>
      <p class="aside">The raster point light uses the area light's power, so the two match. A flat emitter of luminance L and area A has an intensity of about L·A candela straight down.</p>`,
    tasks: [
      'In raster, compare "direct only", "flat ambient" and "hemisphere". Which one is least wrong in the corners?',
      'Switch to path traced, bounces 1. Compare it to raster direct only. Same light, different shadows. Why?',
      'Step bounces 1 → 2 → 3 → 8. Where does the red appear first? When does the image stop changing?',
      'Turn on compare and drag the split across the ceiling. Raster has the ceiling nearly black. Why is it lit in the path-traced half?',
      'Make the light small and then large. Watch the shadow edges in path traced.',
    ],
    questions: [
      ['The ceiling is lit only by bounce light. Why?', 'The light faces down, so no direct light reaches the ceiling. Everything up there has bounced off the floor, the walls and the boxes first.'],
      ['Why does each extra bounce add less?', 'Each bounce multiplies by the surface albedo (well under 1). After a few bounces, the remaining energy is small.'],
      ['What does a lightmap store, and what\'s its main limitation?', 'Precomputed lighting (often including GI) baked into a texture per surface. It can\'t change when lights or objects move.'],
    ],
    ask: [
      '"How does Lumen get real-time GI?"',
      '"What are irradiance probes and how do games place them?"',
    ],
  },

  {
    id: 'raytracer', part: 'rays', short: 'Write a path tracer', sub: 'The whole thing in one shader',
    kicker: 'Lesson 7 · from scratch',
    title: 'A complete path tracer you can read in one sitting',
    load: () => import('./raytracer.js'),
    body: `
      <p>This lesson uses no library: the image is made by about 170 lines of GLSL that you can read below. It's the rendering equation from lesson 0, estimated the most direct way possible.</p>
      <p>For each pixel, every frame: shoot a ray from the camera. Find the nearest thing it hits. At that point, choose <em>one</em> random direction to continue in, multiply a running <strong>throughput</strong> by the surface colour, and repeat. If the path hits the light, add the light's brightness × throughput to the pixel. Average thousands of these random paths and the noise converges to the correct image. This is <strong>Monte Carlo integration</strong>.</p>
      <div class="formula">pixel ≈ (1/N) Σ  f · L<sub>i</sub> · cos θ / pdf(ω)</div>
      <p>Two refinements make it practical. <strong>Cosine-weighted sampling</strong> sends more rays where cos θ is large, so f · cos θ / pdf simplifies to just the albedo. <strong>Next event estimation</strong> (NEE) does more for noise: at every diffuse bounce, also fire a ray straight at the light, instead of hoping a random direction finds it. Turn it off and see how long a small light takes to resolve.</p>
      <p>Mirror and glass are "delta" materials, with only one possible outgoing direction, so they skip NEE. That's why the light seen <em>through</em> glass (a caustic) resolves slowly. Caustics are the hard case for all path tracers.</p>`,
    tasks: [
      'Step the view through "normals", "albedo" and "path traced". The first two are what a ray sees on its first hit.',
      'Bounces 1 with NEE on is direct lighting only. With NEE off, bounces 1 shows only the light itself. Why?',
      'Turn NEE off at 8 bounces and watch the sample count. How many samples does the image need compared to NEE on?',
      'Shrink the light. Noise without NEE gets much worse. Small lights are the hardest case for naive path tracing.',
      'Find the caustic under the glass sphere. Which mode resolves it, and why so slowly?',
      'Read the shader below. Find the four lines that are the rendering equation.',
    ],
    questions: [
      ['Why is there noise at all?', 'Each pixel is an average of random samples. With few samples the average varies between neighbours. Noise falls with the square root of the sample count, so halving it takes 4× the samples.'],
      ['With cosine-weighted sampling, why does the throughput update become just "× albedo"?', 'The Lambert BRDF is albedo/π and the sampling pdf is cos θ/π. So f · cos θ / pdf = (albedo/π) · cos θ / (cos θ/π) = albedo.'],
      ['Why must we skip adding light on a hit if NEE already sampled it at the previous diffuse bounce?', 'We\'d count the light twice. NEE already accounted for the direct path to the light from that point. MIS (multiple importance sampling) blends the two strategies instead of choosing one.'],
    ],
    ask: [
      '"Help me add a new material to the shader: rough metal with GGX."',
      '"Explain Russian roulette and why it\'s unbiased."',
      '"Show me how multiple importance sampling would change this code."',
    ],
    more: '<p>The shader source is below the controls. Peter Shirley\'s free <a href="https://raytracing.github.io/" target="_blank" rel="noopener">Ray Tracing in One Weekend</a> series builds the same thing in C++, step by step. <a href="https://pbr-book.org/" target="_blank" rel="noopener">Physically Based Rendering</a> (free online) is the full reference.</p>',
  },

  {
    id: 'pathtracer', part: 'rays', short: 'Photoreal', sub: 'A production path tracer',
    kicker: 'Lesson 8 · putting it together',
    title: 'Near photorealism in a browser',
    load: () => import('./pathtracer.js'),
    body: `
      <p>three-gpu-pathtracer does what your shader in lesson 7 did, but for any three.js scene. It builds a BVH, a tree of bounding boxes that makes ray hits fast on millions of triangles, then samples full PBR materials: GGX specular, transmission, clearcoat, sheen, and importance-sampled HDRIs.</p>
      <p>This still life puts everything from the earlier lessons together: physical light units, PBR materials, an HDRI with its sun, glass, and a curved studio backdrop (called a cyc), which photographers use so there's no horizon line. Drag the split to compare it with the best a rasteriser can do on the same scene.</p>
      <p>Look for what the raster side is missing. It has no <strong>contact shadows</strong>, the darkening where objects meet the floor. Glass has <strong>no refraction</strong> of the scene behind it. There are <strong>no caustics</strong>: the bright light the glass focuses onto the floor. Gold doesn't reflect the other objects (<strong>inter-reflection</strong>). And the gaps and crevices lack <strong>occlusion</strong>.</p>
      <p>The camera counts as well. Real photos have <strong>depth of field</strong>. Turn the aperture up and the path tracer gives a physically correct blur, with bokeh shaped by the aperture blades.</p>`,
    tasks: [
      'Let it converge (watch the sample count), then drag the split slowly across the glass and its shadow.',
      'Lower bounces to 2 and watch the glass. Why does it go dark? How many bounces does a ray need to pass through a glass sphere?',
      'Turn on depth of field. Focus on the teapot, then on the gold ring.',
      'Switch to the outdoor HDRI. Which shadows go sharp, and why?',
      'Set the floor to glossy and look for the Fresnel reflections from lesson 2.',
    ],
    questions: [
      ['Glass needs at least how many bounces to show what\'s behind a solid sphere?', 'Two transmission events (in, then out), plus one for whatever it hits behind. So 3 or more, and more for multiple glass objects or internal reflections.'],
      ['What is a BVH for?', 'Finding the nearest triangle a ray hits without testing all of them. A ray only descends into boxes it actually passes through, which makes each test roughly logarithmic in the triangle count.'],
      ['Why does a real photo have depth of field and a basic renderer doesn\'t?', 'A real lens has an aperture with an area, so rays from a point arrive from slightly different positions and only one distance focuses sharply. A pinhole camera model has no aperture, so everything is sharp.'],
    ],
    ask: [
      '"What would I need to add to my lesson-7 shader to render this scene?"',
      '"How do production renderers denoise?"',
    ],
  },

  {
    id: 'blender', part: 'blender', short: 'Bring in Blender', sub: 'glTF, live link, Cycles',
    kicker: 'Lesson 9 · Blender',
    title: 'Blender as your modelling tool and your reference',
    load: () => import('./blender.js'),
    body: `
      <p>Blender gives you two things this lab can't. A <strong>modelling and layout tool</strong>, and <strong>Cycles</strong>, a production path tracer that serves as ground truth. When you wonder whether something looks wrong because of a cheat, render it in Cycles.</p>
      <p><strong>Getting a scene in.</strong> Export with File → Export → glTF 2.0 (.glb). Under Data → Lighting, set the mode to <b>Standard</b> so watts become physical candela and lux. Principled BSDF materials map directly onto three.js's physical material. Drop the .glb on the viewport. If it contains a camera, the lab uses it, so you can match a Cycles render exactly.</p>
      <p><strong>Live link.</strong> With the dev server running (<code>npm run dev</code>), open <code>tools/blender/live_link.py</code> in Blender's Scripting tab and run it. Every time you save the .blend, it exports to <code>lighting-lab/scenes/live.glb</code>, and this page reloads it within a couple of seconds.</p>
      <p><strong>Ground truth.</strong> <code>tools/blender/cornell.py</code> builds the lesson 6 Cornell box in Blender, with the same size, colours, light and camera. It renders it with Cycles and exports a .glb. Drop the PNG on the viewport and it becomes the left side of the split.</p>
      <p><strong>Baking.</strong> Blender can also bake Cycles' global illumination into textures (lightmaps), which is how games and many three.js sites get GI cheaply in real time. That's a natural next project.</p>`,
    tasks: [
      'Install Blender (free, blender.org) and run cornell.py. See the steps under "Go deeper".',
      'Drop the exported cornell.glb here, then its PNG. Drag the split. Where do the lab\'s raster and path-traced versions differ from Cycles?',
      'Model something simple, give it a Principled BSDF, export it, and compare raster with path traced.',
      'Try the live link: change a material colour in Blender, save, and watch it update here.',
    ],
    questions: [
      ['Why match the camera exactly when comparing renders?', 'So any difference you see is from lighting and materials, not framing. Then you can drag a split across them like an A/B test.'],
      ['What doesn\'t survive the trip from Blender to glTF?', 'Procedural node setups (they need baking to textures), most Cycles-only shader nodes, volumes, world shaders other than a plain colour, and light types or sizes glTF can\'t describe. Area lights, for example, are exported as points.'],
    ],
    ask: [
      '"Set up Blender MCP so you can drive Blender for me."',
      '"Walk me through baking a lightmap in Cycles for three.js."',
    ],
    more: `<p><b>Running the Cornell script</b>, after installing Blender:</p>
      <pre class="code">/Applications/Blender.app/Contents/MacOS/Blender -b \\
  -P tools/blender/cornell.py</pre>
      <p>It writes <code>experiments/lighting-lab/reference/cornell-cycles.png</code> and <code>experiments/lighting-lab/scenes/cornell.glb</code>. Run it from the repo root.</p>`,
  },
];
