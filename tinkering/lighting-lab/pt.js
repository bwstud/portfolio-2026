/* A thin wrapper around three-gpu-pathtracer for the lessons that compare raster and path traced.
   It owns the split-screen compare: path traced fills the canvas, then raster is drawn over the left
   part with a scissor. The tracer is created on first use (sync), so raster-only visits never pay for it. */
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export function makePathTracer(ctx, { bounces = 6, maxSamples = 2000 } = {}) {
  const { renderer, scene, controls, split } = ctx;
  let pt = null;
  let nBounces = bounces;

  function create() {
    pt = new WebGLPathTracer(renderer);
    pt.bounces = nBounces;
    pt.transmissiveBounces = 8;
    pt.minSamples = 1;
    pt.renderDelay = 0;
    pt.fadeDuration = 0;
    pt.rasterizeScene = false;
    pt.dynamicLowRes = true;     // a quick low-res preview while the camera moves
    pt.lowResScale = 0.25;
    pt.filterGlossyFactor = 0.5;
    pt.tiles.set(2, 2);
  }

  const api = {
    get pt() { return pt; },
    mode: 'raster',     // 'raster' | 'pt' | 'compare'
    maxSamples,
    /* lets the lesson swap lights/objects to the path-traced setup while the tracer reads the scene */
    beforeSync: null, afterSync: null,
    ready: false,
    async sync() {
      // let the "building" hint paint first: the BVH build blocks the main thread for a moment
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      if (!ctx.alive) return;
      if (!pt) create();
      api.beforeSync?.();
      pt.setScene(scene, ctx.camera);
      api.afterSync?.();
      api.ready = true;
    },
    setBounces(n) { nBounces = n; if (pt) pt.bounces = n; },
    updateCamera() { pt?.updateCamera(); },
    updateMaterials() { if (!pt) return; api.beforeSync?.(); pt.updateMaterials(); api.afterSync?.(); },
    updateLights() { if (!pt) return; api.beforeSync?.(); pt.updateLights(); api.afterSync?.(); },
    updateEnvironment() { pt?.updateEnvironment(); },
    reset() { pt?.reset(); },
    setMode(m) {
      api.mode = m;
      if (m === 'compare') split.enable('raster', 'path traced'); else split.disable();
    },
    render() {
      const w = ctx.size.w, h = ctx.size.h;
      if (api.mode === 'raster' || !api.ready) {
        renderer.render(scene, ctx.camera);
        ctx.badge(api.mode === 'raster' ? 'raster' : 'building BVH…');
        return;
      }
      if (pt.samples < api.maxSamples) pt.renderSample();
      else pt.renderToCanvasCallback(pt.target, renderer, pt._quad);   // converged: just redisplay
      if (api.mode === 'compare') {
        api.afterSync?.();
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, Math.round(w * split.value), h);
        renderer.render(scene, ctx.camera);
        renderer.setScissorTest(false);
      }
      ctx.badge(`${Math.floor(pt.samples)} samples${pt.samples >= api.maxSamples ? ' · done' : ''}`);
    },
  };
  ctx.listen(controls, 'change', () => pt?.updateCamera());
  ctx.onResize(() => pt?.updateCamera());
  ctx.cleanup(() => pt?.dispose());
  return api;
}
