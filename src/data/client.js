// src/data/client.js
// Instancia única (Singleton) del cliente Supabase para el front.
// Implementa un customFetch para inyectar dinámicamente el JWT de la sesión activa
// asegurando que todas las consultas cumplan con las políticas de RLS en PostgreSQL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { obtenerToken } from './session.js';

/**
 * Función fetch personalizada que intercepta cada llamada de Supabase
 * para adjuntar el token JWT de la sesión activa en el header Authorization.
 * Ticket 23: si el navegador no tiene conexión, rechaza de inmediato con un
 * mensaje amistoso en lugar de esperar un timeout de red; cada pantalla ya
 * muestra ese error en su casilla de alerta.
 */
const customFetch = (url, options = {}) => {
  if (!navigator.onLine) {
    return Promise.reject(
      new Error('Sin conexión a internet. Las operaciones requieren estar en línea.')
    );
  }

  const token = obtenerToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    // Con sesión activa: JWT firmado por la Edge Function en Authorization
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    // Sin sesión (ej. crear PIN en el primer acceso): supabase-js inyecta por
    // defecto "Authorization: Bearer <apikey>", pero esa JWT de demo no tiene
    // firma real y PostgREST la rechaza con "No suitable key or wrong key
    // type". Sin Authorization, la llamada usa solo el apikey y funciona.
    headers.delete('Authorization');
  }

  return fetch(url, {
    ...options,
    headers,
  });
};

/**
 * Instancia única del cliente Supabase.
 * Solo debe ser utilizada internamente por src/data/api.js.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch,
  },
});
