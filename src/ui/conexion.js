// src/ui/conexion.js
// Aviso sin conexión (Ticket 23): enciende/apaga el banner del documento
// según los eventos online/offline del navegador. No implementa modo
// offline: solo informa, el bloqueo de operaciones vive en client.js.

const MENSAJE = 'Sin conexión a internet. La aplicación requiere conexión para operar.';

export function initAvisoConexion() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  function pintar() {
    banner.classList.toggle('visible', !navigator.onLine);
  }

  window.addEventListener('online', pintar);
  window.addEventListener('offline', pintar);
  pintar();
}
