"""Local-only preview of the portfolio with Klim's trial Söhne Breit and Mono weights.

Serves the repo as-is, and into every HTML page injects a small weight picker plus @font-face
rules that load the trial .otf files from ~/Library/Fonts (Klim's Test fonts must be installed).
Nothing is written to the repo, and the trial fonts never ship: they are only read from this Mac.

    python3 tools/font-preview/serve.py [port]     # default 8090, then open http://127.0.0.1:8090/
    ?breit=800&mono=500 in the address sets the weights too (250 is Extraleicht).
"""
import os, sys, unicodedata
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FONTS = os.path.expanduser("~/Library/Fonts")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090

# weight -> trial file (the licensed 600 Breit and 400 Mono stay as the site has them)
BREIT = {250: "Extraleicht", 300: "Leicht", 400: "Buch", 500: "Kräftig", 700: "Dreiviertelfett", 800: "Fett", 900: "Extrafett"}
MONO = {250: "Extraleicht", 300: "Leicht", 500: "Kräftig", 600: "Halbfett", 700: "Dreiviertelfett", 800: "Fett", 900: "Extrafett"}

def nfc(s): return unicodedata.normalize("NFC", s)
ON_DISK = {nfc(b): b for b in os.listdir(FONTS)}
ALLOWED = {f"TestSöhneBreit-{n}.otf" for n in BREIT.values()} | {f"TestSöhneMono-{n}.otf" for n in MONO.values()}

def faces(family, prefix, table):
    return "".join(
        f'@font-face{{font-family:"{family}";font-weight:{w};font-style:normal;font-display:block;'
        f'src:url("/__trial/{prefix}-{name}.otf") format("opentype")}}'
        for w, name in table.items())

INJECT = ("<style>" + faces("Söhne Breit", "TestSöhneBreit", BREIT) + faces("Söhne Mono", "TestSöhneMono", MONO) + """
#trial-picker{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:grid;grid-template-columns:auto auto;gap:8px 10px;align-items:center;
  padding:12px 14px;border-radius:10px;background:rgba(14,16,20,.92);color:#e9ebef;box-shadow:0 8px 30px rgba(0,0,0,.35);
  font:400 12px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(8px)}
#trial-picker label{color:#a8adb7}
#trial-picker select{font:inherit;color:inherit;background:#23262d;border:1px solid #3a3e47;border-radius:6px;padding:4px 6px}
</style>
<div id="trial-picker" role="group" aria-label="Trial font weights">
  <label for="trial-breit">Söhne Breit</label>
  <select id="trial-breit"><option value="">As built</option><option value="250">Extraleicht 200</option><option value="300">Leicht 300</option>
    <option value="400">Buch 400</option><option value="500">Kräftig 500</option><option value="600">Halbfett 600</option>
    <option value="700">Dreiviertelfett 700</option><option value="800">Fett 800</option><option value="900">Extrafett 900</option></select>
  <label for="trial-mono">Söhne Mono</label>
  <select id="trial-mono"><option value="">As built</option><option value="250">Extraleicht 200</option><option value="300">Leicht 300</option>
    <option value="400">Buch 400</option><option value="500">Kräftig 500</option><option value="600">Halbfett 600</option>
    <option value="700">Dreiviertelfett 700</option><option value="800">Fett 800</option><option value="900">Extrafett 900</option></select>
</div>
<script>
(() => {
  const picker = document.getElementById('trial-picker');
  const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
                  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const apply = (family, weight) => {
    for (const el of document.querySelectorAll('body *')) {
      if (picker.contains(el)) continue;
      if (el.dataset.trialFamily !== family) {
        if (!getComputedStyle(el).fontFamily.replace(/["']/g, '').startsWith(family)) continue;
        el.dataset.trialFamily = family;
      }
      if (weight) el.style.setProperty('font-weight', weight, 'important');
      else el.style.removeProperty('font-weight');
    }
  };
  for (const [id, family] of [['trial-breit', 'Söhne Breit'], ['trial-mono', 'Söhne Mono']]) {
    const sel = document.getElementById(id);
    const fromUrl = new URLSearchParams(location.search).get(id.slice(6));   // ?breit=800&mono=500
    sel.value = fromUrl ?? store.get(id);
    sel.addEventListener('change', () => { store.set(id, sel.value); apply(family, sel.value); });
    if (sel.value) apply(family, sel.value);
  }
})();
</script>
""").encode()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=REPO, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        from urllib.parse import unquote
        path = unquote(path)
        if path.startswith("/__trial/"):
            name = nfc(path[len("/__trial/"):])
            if name not in ALLOWED or name not in ON_DISK: return self.send_error(404)
            data = open(os.path.join(FONTS, ON_DISK[name]), "rb").read()
            return self._send(data, "font/otf")
        local = self.translate_path(path)
        if os.path.isdir(local): local = os.path.join(local, "index.html")
        elif not os.path.exists(local) and os.path.exists(local + ".html"): local += ".html"
        if local.endswith(".html") and os.path.isfile(local):
            html = open(local, "rb").read()
            i = html.rfind(b"</body>")
            html = html[:i] + INJECT + html[i:] if i >= 0 else html + INJECT
            return self._send(html, "text/html; charset=utf-8")
        return super().do_GET()

    def _send(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a): pass

ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
