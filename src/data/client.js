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
 */
const customFetch = (url, options = {}) => {
  const token = obtenerToken();
  const headers = new Headers(options.headers || {});

  // Si hay un JWT de sesión activo, lo enviamos como Bearer token
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
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
