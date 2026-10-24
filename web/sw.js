/* Điểm danh – Từ BV TLS – by Dr Huy - BV TLS */
const CACHE = 'diemdanh-v1.1.1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './config.js', './manifest.webmanifest',
  './lib/face-api.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './models/tiny_face_detector_model-weights_manifest.json', './models/tiny_face_detector_model.bin',
  './models/face_landmark_68_model-weights_manifest.json', './models/face_landmark_68_model.bin',
  './models/face_recognition_model-weights_manifest.json', './models/face_recognition_model.bin'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // không bao giờ cache API
  const network = ['/app.js', '/config.js', '/index.html', '/'].some(p => u.pathname.endsWith(p));
  if (network) {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
