// src/data/config.js
// Configuración centralizada de Supabase para la aplicación web.
// Prioriza window.__ENV__ (si se inyecta desde HTML/script) y permite fallback a variables de desarrollo.

const globalEnv = (typeof window !== 'undefined' && window.__ENV__) || {};

export const SUPABASE_URL = 
  globalEnv.SUPABASE_URL || 
  'http://127.0.0.1:54321';

export const SUPABASE_ANON_KEY = 
  globalEnv.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODMxOTM2MDB9.placeholder';

export const API_CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
};
