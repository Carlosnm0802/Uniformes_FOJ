// src/sw.js (raíz del proyecto)
// Service worker de la PWA Uniformes FOJ (Ticket 23).
// SOLO cachea el shell de la app (assets estáticos same-origin) y rechaza
// todo lo externo: la app requiere conexión para operar, no es modo offline.

const VERSION = 'uniformes-foj-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/nestle-logo-horizontal.png',
  './assets/nestle-logo-vertical.png',
  './src/app.js',
  './src/data/api.js',
  './src/data/client.js',
  './src/data/config.js',
  './src/data/session.js',
  './src/data/leerColaboradores.js',
  './src/data/env.example.js',
  './src/ui/authView.js',
  './src/ui/bitacoraView.js',
  './src/ui/catalogo.js',
  './src/ui/colaboradoresView.js',
  './src/ui/conexion.js',
  './src/ui/detalleAdminView.js',
  './src/ui/detallePeticionView.js',
  './src/ui/formato.js',
  './src/ui/graciasView.js',
  './src/ui/inventarioView.js',
  './src/ui/listaAdminView.js',
  './src/ui/misPeticionesView.js',
  './src/ui/nuevaPeticionView.js',
  './src/styles/main.css',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(
      SHELL.map((ruta) => new Request(ruta, { cache: 'reload' }))
    )).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== VERSION).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cacheado = await cache.match(peticion);

      // Network-first: con internet siempre entrega LS CÓDIGO ACTUAL (`no-store`
      // evita que la caché HTTP del navegador devuelva archivos viejos) y
      // renueva la caché con cada respuesta. Sin internet, usa lo cacheado.
      const red = fetch(peticion, { cache: 'no-store' })
        .then((respuesta) => {
          if (respuesta.ok) cache.put(peticion, respuesta.clone());
          return respuesta;
        })
        .catch(() => cacheado);

      return red;
    })
  );
});
