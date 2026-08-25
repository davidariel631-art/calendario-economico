/* KRAX PWA — shell del rediseño con Firebase Messaging en segundo plano. */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAt_aHKSiMSZKQUkWDwVRuGG1LsyPKiejE",
  authDomain: "economia-8333c.firebaseapp.com",
  projectId: "economia-8333c",
  storageBucket: "economia-8333c.firebasestorage.app",
  messagingSenderId: "592136842311",
  appId: "1:592136842311:web:f9314e5106c21e09e75562"
});

try {
  firebase.messaging().onBackgroundMessage((payload) => {
    self.registration.showNotification(payload.notification?.title || "KRAX", {
      body: payload.notification?.body || "Hay una actualización económica disponible.",
      icon: "/calendario-economico/legacy/assets/icons/icon-192.png",
      badge: "/calendario-economico/legacy/assets/icons/icon-192.png"
    });
  });
} catch (error) {
  console.warn("Firebase Messaging no se pudo inicializar en el Service Worker:", error);
}

const CACHE = "krax-editorial-v2";
const SHELL = ["/calendario-economico/", "/calendario-economico/manifest.json", "/calendario-economico/legacy/assets/icons/icon-192.png", "/calendario-economico/legacy/assets/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached);
    return event.request.destination === "document" ? network : cached || network;
  }));
});

