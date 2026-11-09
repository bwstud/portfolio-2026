/* Pictures to look at: the starter gallery, and the visitor's own photos and videos.
   Uploads never leave the browser: files are read into an object URL and drawn from there. */

export const GALLERY = [
  {
    id: 'great-wave', title: 'The Great Wave off Kanagawa', by: 'Katsushika Hokusai', year: 'c. 1831',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg',
  },
  {
    id: 'starry-night', title: 'The Starry Night', by: 'Vincent van Gogh', year: '1889',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
  },
  {
    id: 'pillars-of-creation', title: 'Pillars of Creation', by: 'NASA, ESA and the Hubble Heritage Team', year: '2014',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg',
  },
  {
    id: 'haeckel-jellyfish', title: 'Discomedusae, Kunstformen der Natur plate 8', by: 'Ernst Haeckel', year: '1904',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Haeckel_Discomedusae_8.jpg',
  },
  {
    id: 'the-kiss', title: 'The Kiss', by: 'Gustav Klimt', year: '1907–08',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Gustav_Klimt_016.jpg',
  },
  {
    id: 'water-lilies', title: 'Water Lilies', by: 'Claude Monet', year: '1906',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg',
  },
  {
    id: 'peacock', title: 'Peacock plumage, Sultanpur National Park', by: 'Jatin Sindhu', year: '2015',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Peacock_Plumage.jpg',
  },
  {
    id: 'haeckel-hummingbirds', title: 'Trochilidae, Kunstformen der Natur plate 99', by: 'Ernst Haeckel', year: '1904',
    license: 'Public domain', source: 'https://commons.wikimedia.org/wiki/File:Haeckel_Trochilidae.jpg',
  },
  {
    id: 'tulip-fields', title: 'Red tulip fields, Bollenstreek, Hillegom', by: 'acediscovery', year: '2017',
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://commons.wikimedia.org/wiki/File:Red-Tulip_Fields-Bollenstreek_Hillegom.jpg',
  },
  {
    id: 'kashmir-shawl', title: 'Motif from a Kashmir shawl: pheerozee (turquoise), no. 2', by: 'Anonymous, India', year: '19th century',
    license: 'CC0 (The Met open access)', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'https://www.metmuseum.org/art/collection/search/359318',
  },
].map(g => ({ ...g, kind: 'image' }));

export const galleryUrl = (base, g) => `${base}gallery/${g.id}.jpg`;
export const thumbUrl = (base, g) => `${base}gallery/thumbs/${g.id}.jpg`;

const MAX_SIDE = 2560;

/* An image drawn into a canvas, scaled down if it's very large. A canvas is what the
   renderer uploads, and what the lab draws the object cell over. */
function toCanvas(img, w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(toCanvas(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => reject(new Error('That picture could not be opened.'));
    img.src = url;
  });
}

export function loadVideoUrl(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => { v.play().catch(() => {}); resolve(v); };
    v.onerror = () => reject(new Error('That video could not be played in this browser. MP4 (H.264) and WebM work almost everywhere.'));
    v.src = url;
  });
}

/* A file the visitor chose or dropped. Returns { el, kind, title, url } */
export async function loadFile(file) {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv)$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(file.name);
  if (!isVideo && !isImage) {
    URL.revokeObjectURL(url);
    throw new Error('Choose a photo or a video.');
  }
  try {
    const el = isVideo ? await loadVideoUrl(url) : await loadImageUrl(url);
    return { el, kind: isVideo ? 'video' : 'image', title: file.name, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    if (/\.hei[cf]$/i.test(file.name)) throw new Error('HEIC photos only open in Safari. Export it as JPEG first.');
    throw e;
  }
}

export function creditLine(g) {
  return `${g.title}, ${g.by}, ${g.year}. ${g.license}.`;
}
