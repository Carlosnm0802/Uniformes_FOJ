// tests/helpers.js
// Utilidades para ejecutar las pruebas automáticas contra Supabase local sin dependencias externas.

export const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let adminTokenCache = null;

/**
 * Obtiene el token JWT del usuario Administrador mediante la Edge Function auth-login.
 */
export async function obtenerTokenAdmin() {
  if (adminTokenCache) return adminTokenCache;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sap: '90000001', pin: '9999' })
  });

  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Fallo al autenticar Administrador para pruebas: ${JSON.stringify(data)}`);
  }

  adminTokenCache = data.token;
  return adminTokenCache;
}

/**
 * Invoca una función RPC en PostgreSQL a través de la API REST de Supabase.
 */
export async function invocarRpc(nombreFuncion, parametros, token = null) {
  const headers = {
    'apikey': ANON_KEY,
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombreFuncion}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(parametros)
  });

  const body = await res.json().catch(() => null);

  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? body : null,
    error: !res.ok ? body : null
  };
}

/**
 * Realiza una consulta GET sobre una tabla usando el token de Administrador para cumplir RLS.
 */
export async function consultarAdmin(tabla, queryParams = '') {
  const token = await obtenerTokenAdmin();
  const url = `${SUPABASE_URL}/rest/v1/${tabla}${queryParams ? '?' + queryParams : ''}`;

  const res = await fetch(url, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  return await res.json();
}
