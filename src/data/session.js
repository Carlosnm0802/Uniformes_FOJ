// src/data/session.js
// Manejo de sesión y almacenamiento seguro de JWT en sessionStorage.
// Provee persistencia volátil por pestaña para colaborador, administrador y RH.

const STORAGE_KEY_TOKEN = 'uniformes_jwt_token';
const STORAGE_KEY_USER = 'uniformes_usuario_sesion';

/**
 * Decodifica el payload de un token JWT sin dependencias externas.
 * @param {string} token - Token JWT en formato Header.Payload.Signature
 * @returns {object|null} Payload decodificado o null si el token es inválido.
 */
export function decodificarToken(token) {
  if (!token || typeof token !== 'string') return null;
  
  try {
    const partes = token.split('.');
    if (partes.length !== 3) return null;
    
    // Normalizar base64url a base64 estándar
    const base64Url = partes[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.warn('Error al decodificar token JWT:', error);
    return null;
  }
}

/**
 * Guarda el token JWT y los datos del usuario en sessionStorage.
 * @param {string} token - Token JWT firmado por la Edge Function
 * @param {object} usuario - Datos del usuario autenticado ({ id, sap, nombre, rol })
 */
export function guardarSesion(token, usuario) {
  if (!token) return;
  sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
  if (usuario) {
    sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(usuario));
  }
}

/**
 * Obtiene el token JWT actual de la sesión.
 * @returns {string|null} Token JWT o null si no existe.
 */
export function obtenerToken() {
  return sessionStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Obtiene los datos del usuario actualmente autenticado.
 * @returns {object|null} Usuario en sesión o null si no existe.
 */
export function obtenerUsuario() {
  const usuarioRaw = sessionStorage.getItem(STORAGE_KEY_USER);
  if (!usuarioRaw) return null;
  try {
    return JSON.parse(usuarioRaw);
  } catch {
    return null;
  }
}

/**
 * Elimina las credenciales de la sesión actual (logout).
 */
export function borrarSesion() {
  sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  sessionStorage.removeItem(STORAGE_KEY_USER);
}

/**
 * Verifica si existe una sesión activa y si el token aún no ha expirado.
 * Si el token ha expirado, limpia la sesión automáticamente.
 * @returns {boolean} True si la sesión es válida y no ha expirado.
 */
export function verificarSesion() {
  const token = obtenerToken();
  if (!token) return false;

  const payload = decodificarToken(token);
  if (!payload) {
    borrarSesion();
    return false;
  }

  // Validar fecha de expiración ('exp' en segundos)
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    borrarSesion();
    return false;
  }

  return true;
}
