// Service Worker simple: cachea el "shell" de la app (HTML/CSS/JS propios)
// para que abra rápido y no quede en blanco sin internet. Los datos en
// vivo (Firestore) siguen necesitando conexión — esto solo evita que la
// app en sí no cargue.
//
// También maneja notificaciones push en segundo plano (app cerrada) vía
// Firebase Cloud Messaging.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAt_aHKSiMSZKQUkWDwVRuGG1LsyPKiejE",
  authDomain: "economia-8333c.firebaseapp.com",
  projectId: "economia-8333c",
  storageBucket: "economia-8333c.firebasestorage.app",
  messagingSenderId: "592136842311",
  appId: "1:592136842311:web:f9314e5106c21e09e75562",
});

try{
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const titulo = payload.notification?.title || 'Economía Argentina';
    const opciones = {
      body: payload.notification?.body || '',
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
    };
    self.registration.showNotification(titulo, opciones);
  });
}catch(e){
  console.warn('Firebase Messaging no se pudo inicializar en el Service Worker:', e);
}

const CACHE_NAME = 'economia-arg-v1';
const ARCHIVOS_SHELL = [
  './',
  './index.html',
  './transporte.html',
  './consumo.html',
  './hogar.html',
  './finanzas.html',
  './calendario.html',
  './glosario.html',
  './faq.html',
  './assets/css/base.css',
  './assets/js/common.js',
  './assets/js/argly.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_SHELL).catch(()=>{/* si algún archivo no existe en este deploy, no rompemos la instalación */}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Solo cacheamos pedidos GET a nuestro propio origen (el shell de la
  // app). Todo lo demás (Firestore, Firebase Auth, APIs externas) va
  // directo a la red, sin pasar por el Service Worker.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const redFetch = fetch(event.request).then((respuestaRed) => {
        if (respuestaRed && respuestaRed.status === 200) {
          const copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuestaRed;
      }).catch(() => cacheado); // sin internet -> lo que haya en caché

      // Network-first para HTML (siempre lo más nuevo si hay conexión);
      // cache-first para el resto (CSS/JS no cambian tan seguido).
      if (event.request.destination === 'document') return redFetch;
      return cacheado || redFetch;
    })
  );
});
