// src/data/api.js
// Módulo único de acceso a datos para la aplicación de Uniformes Nestlé.
// Es el único punto de contacto del front con Supabase, RPCs y Edge Functions.
// Todas las respuestas siguen la convención { data, error } con mensajes normalizados en español.

import { supabase } from './client.js';
import { guardarSesion, obtenerUsuario, borrarSesion } from './session.js';

/**
 * Normaliza y traduce errores técnicos de PostgreSQL, Supabase o red
 * a mensajes claros y comprensibles en español para la interfaz de usuario.
 * @param {Error|object|string} err 
 * @returns {Error} Error estándar con mensaje amigable en español en error.message
 */
function formatearError(err) {
  if (!err) return new Error('Ha ocurrido un error inesperado.');
  
  const rawMsg = (err.message || err.error_description || (typeof err === 'string' ? err : '')) || '';
  
  if (rawMsg.includes('CUENTA_BLOQUEADA')) {
    return new Error('Tu cuenta está bloqueada tras 3 intentos fallidos. Contacta a RH o al administrador.');
  }
  if (rawMsg.includes('CREDENCIALES_INVALIDAS') || rawMsg.includes('Número SAP o PIN incorrecto')) {
    return new Error('Número SAP o PIN incorrecto.');
  }
  if (rawMsg.includes('FORMATO_INVALIDO')) {
    return new Error('El PIN debe tener exactamente 4 dígitos numéricos.');
  }
  if (rawMsg.includes('PIN_YA_CONFIGURADO')) {
    return new Error('Esta cuenta ya tiene un PIN activo. Solicita un restablecimiento a RH o al Administrador.');
  }
  if (rawMsg.includes('PIN_INCORRECTO')) {
    return new Error(rawMsg.replace('PIN_INCORRECTO:', '').trim() || 'PIN incorrecto.');
  }
  if (rawMsg.includes('Stock insuficiente') || rawMsg.includes('STOCK_INSUFICIENTE')) {
    return new Error(rawMsg.replace('STOCK_INSUFICIENTE:', '').trim());
  }
  if (rawMsg.includes('Transición no permitida')) {
    return new Error(rawMsg.trim());
  }
  if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || rawMsg.includes('TypeError: fetch failed')) {
    return new Error('Sin conexión. No se pudo conectar con el servidor. Revisa tu conexión a internet.');
  }
  if (rawMsg.includes('JWT expired') || rawMsg.includes('invalid claim')) {
    borrarSesion();
    return new Error('Tu sesión ha expirado. Por favor ingresa nuevamente con tu SAP y PIN.');
  }

  // Limpiar prefijos de códigos de error de BD (ej: MOTIVO_INVALIDO: texto -> texto)
  const mensajeLimpio = rawMsg.replace(/^[A-Z_]+:\s*/, '').trim();
  return new Error(mensajeLimpio || 'Ocurrió un error al procesar la solicitud.');
}

// ==========================================
// 1. AUTENTICACIÓN Y SEGURIDAD
// ==========================================

/**
 * Inicia sesión usando número SAP y PIN de 4 dígitos.
 * Llama a la Edge Function auth-login.
 * Si es primer acceso (pin_pendiente), retorna los datos para configurar el PIN.
 * Si las credenciales son válidas, guarda el JWT en sessionStorage.
 * @param {string} sap - Número SAP del colaborador o administrador
 * @param {string} pin - PIN de 4 dígitos
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function login(sap, pin) {
  try {
    const { data, error } = await supabase.functions.invoke('auth-login', {
      body: {
        sap: String(sap).trim(),
        pin: pin ? String(pin).trim() : null,
      },
    });

    if (error) {
      // Manejar respuestas con código de estado HTTP (401, 403, 500)
      let detalleError = error.message;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const bodyJson = await error.context.json();
          detalleError = bodyJson.error || detalleError;
        } catch {
          // Ignorar fallo de parseo
        }
      }
      return { data: null, error: formatearError(detalleError) };
    }

    if (!data) {
      return { data: null, error: new Error('Respuesta vacía del servidor de autenticación.') };
    }

    // Caso: Primer acceso con PIN pendiente de creación
    if (data.pin_pendiente) {
      return {
        data: {
          pin_pendiente: true,
          user: data.user,
        },
        error: null,
      };
    }

    // Caso: Login exitoso, guardar JWT y datos del usuario en sessionStorage
    if (data.token && data.user) {
      guardarSesion(data.token, data.user);
      return {
        data: {
          pin_pendiente: false,
          user: data.user,
          token: data.token,
        },
        error: null,
      };
    }

    return { data: null, error: new Error('Respuesta de autenticación incompleta.') };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Crea el PIN de 4 dígitos para un usuario en su primer acceso o tras restablecimiento.
 * @param {string} sap - Número SAP
 * @param {string} pinNuevo - Nuevo PIN de 4 dígitos numéricos
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function crearPin(sap, pinNuevo) {
  try {
    const { data, error } = await supabase.rpc('crear_pin', {
      p_sap: String(sap).trim(),
      p_pin_nuevo: String(pinNuevo).trim(),
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

// ==========================================
// 2. PETICIONES (CONSULTAS Y DETALLE)
// ==========================================

/**
 * Obtiene las peticiones del colaborador activo junto con sus prendas pedidas.
 * Las políticas RLS en PostgreSQL garantizan que solo retorne las del usuario autenticado.
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerPeticionesColaborador() {
  try {
    const { data, error } = await supabase
      .from('peticiones')
      .select(`
        id,
        usuario_id,
        estado,
        motivo,
        ventana_propuesta_inicio,
        ventana_propuesta_fin,
        ventana_confirmada_inicio,
        ventana_confirmada_fin,
        motivo_rechazo,
        observaciones,
        sin_devolucion,
        recepcion_confirmada,
        creada_en,
        actualizada_en,
        lineas_peticion (
          id,
          prenda_tipo,
          prenda_color,
          prenda_talla,
          devuelta
        )
      `)
      .order('creada_en', { ascending: false });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Obtiene la lista completa de peticiones para Administrador y RH, con filtros opcionales.
 * @param {object} filtros - Filtros opcionales { estado, sinDevolucion }
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerTodasLasPeticiones(filtros = {}) {
  try {
    let query = supabase
      .from('peticiones')
      .select(`
        id,
        usuario_id,
        estado,
        motivo,
        ventana_propuesta_inicio,
        ventana_propuesta_fin,
        ventana_confirmada_inicio,
        ventana_confirmada_fin,
        motivo_rechazo,
        observaciones,
        sin_devolucion,
        recepcion_confirmada,
        creada_en,
        actualizada_en,
        usuarios (
          sap,
          nombre,
          rol
        ),
        lineas_peticion (
          id,
          prenda_tipo,
          prenda_color,
          prenda_talla,
          devuelta
        )
      `)
      .order('creada_en', { ascending: false });

    if (filtros.estado) {
      query = query.eq('estado', filtros.estado);
    }
    if (filtros.sinDevolucion !== undefined) {
      query = query.eq('sin_devolucion', Boolean(filtros.sinDevolucion));
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Obtiene el detalle completo de una petición por su ID.
 * @param {string} peticionId - UUID de la petición
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export async function obtenerDetallePeticion(peticionId) {
  try {
    const { data, error } = await supabase
      .from('peticiones')
      .select(`
        id,
        usuario_id,
        estado,
        motivo,
        ventana_propuesta_inicio,
        ventana_propuesta_fin,
        ventana_confirmada_inicio,
        ventana_confirmada_fin,
        motivo_rechazo,
        observaciones,
        sin_devolucion,
        recepcion_confirmada,
        creada_en,
        actualizada_en,
        usuarios (
          sap,
          nombre,
          rol
        ),
        lineas_peticion (
          id,
          prenda_tipo,
          prenda_color,
          prenda_talla,
          devuelta
        )
      `)
      .eq('id', peticionId)
      .single();

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

// ==========================================
// 3. OPERACIONES Y TRANSICIONES DE PETICIONES
// ==========================================

/**
 * Crea una nueva petición con sus líneas de prendas.
 * Invoca la función PostgreSQL 'crear_peticion' (definida en el Ticket 8).
 * @param {object} datos - { motivo, ventanaInicio, ventanaFin, lineas }
 * @returns {Promise<{ data: string|null, error: Error|null }>} UUID de la nueva petición
 */
export async function crearPeticion(datos) {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const { data, error } = await supabase.rpc('crear_peticion', {
      p_usuario_id: usuario.id,
      p_motivo: datos.motivo,
      p_ventana_inicio: datos.ventanaInicio,
      p_ventana_fin: datos.ventanaFin,
      p_lineas: datos.lineas,
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Ejecuta una transición de estado en una petición (aprobar, rechazar, pasar a en_proceso).
 * Invoca la función PostgreSQL 'cambiar_estado' (definida en el Ticket 9).
 * @param {string} peticionId - UUID de la petición
 * @param {string} nuevoEstado - 'aprobada', 'rechazada' o 'en_proceso'
 * @param {object} extra - Datos adicionales como ventana confirmada o motivo_rechazo
 * @returns {Promise<{ data: any|null, error: Error|null }>}
 */
export async function cambiarEstado(peticionId, nuevoEstado, extra = {}) {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const { data, error } = await supabase.rpc('cambiar_estado', {
      p_admin_id: usuario.id,
      p_peticion_id: peticionId,
      p_nuevo_estado: nuevoEstado,
      p_extra: extra,
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Marca una petición como entregada, registra devoluciones y descuenta stock transaccionalmente.
 * Invoca la función PostgreSQL 'marcar_entregada' (definida en el Ticket 10).
 * @param {string} peticionId - UUID de la petición
 * @param {Array<string>} devoluciones - IDs de líneas devueltas
 * @param {string} observaciones - Observaciones opcionales de la entrega
 * @returns {Promise<{ data: any|null, error: Error|null }>}
 */
export async function marcarEntregada(peticionId, devoluciones = [], observaciones = '') {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const { data, error } = await supabase.rpc('marcar_entregada', {
      p_admin_id: usuario.id,
      p_peticion_id: peticionId,
      p_devoluciones: devoluciones,
      p_observaciones: observaciones || null,
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Marca la confirmación de recepción física por parte del colaborador solicitante.
 * Invoca la función PostgreSQL 'confirmar_recepcion' (definida en el Ticket 11).
 * @param {string} peticionId - UUID de la petición
 * @returns {Promise<{ data: any|null, error: Error|null }>}
 */
export async function confirmarRecepcion(peticionId) {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const { data, error } = await supabase.rpc('confirmar_recepcion', {
      p_usuario_id: usuario.id,
      p_peticion_id: peticionId,
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

// ==========================================
// 4. INVENTARIO Y ENTRADAS DE STOCK
// ==========================================

/**
 * Consulta el catálogo de existencias y cantidad actual en almacén (exclusivo Admin/RH).
 * El colaborador no tiene permisos en RLS para acceder a esta información.
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerInventario() {
  try {
    const { data, error } = await supabase
      .from('existencias')
      .select('id, prenda_tipo, prenda_color, prenda_talla, cantidad')
      .order('prenda_tipo', { ascending: true })
      .order('prenda_color', { ascending: true, nullsFirst: false })
      .order('prenda_talla', { ascending: true });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Registra una entrada manual de stock al almacén por parte de Administrador o RH.
 * Incrementa la existencia y crea el registro correspondiente en movimientos_stock.
 * @param {object} datos - { prendaTipo, prendaColor, prendaTalla, cantidad }
 * @returns {Promise<{ data: any|null, error: Error|null }>}
 */
export async function registrarEntrada({ prendaTipo, prendaColor, prendaTalla, cantidad }) {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const cantNumerica = parseInt(cantidad, 10);
    if (isNaN(cantNumerica) || cantNumerica <= 0) {
      return { data: null, error: new Error('La cantidad a registrar debe ser un número entero mayor a 0.') };
    }

    // 1. Obtener la fila de existencia correspondiente
    let queryExistencia = supabase
      .from('existencias')
      .select('id, cantidad')
      .eq('prenda_tipo', prendaTipo);

    if (prendaColor) {
      queryExistencia = queryExistencia.eq('prenda_color', prendaColor);
    } else {
      queryExistencia = queryExistencia.is('prenda_color', null);
    }

    if (prendaTalla) {
      queryExistencia = queryExistencia.eq('prenda_talla', prendaTalla);
    } else {
      queryExistencia = queryExistencia.is('prenda_talla', null);
    }

    const { data: existencia, error: errExistencia } = await queryExistencia.single();
    if (errExistencia || !existencia) {
      return { data: null, error: formatearError(errExistencia || 'No se encontró la combinación de prenda especificada.') };
    }

    const nuevaCantidad = existencia.cantidad + cantNumerica;

    // 2. Actualizar existencias
    const { error: errUpdate } = await supabase
      .from('existencias')
      .update({ cantidad: nuevaCantidad })
      .eq('id', existencia.id);

    if (errUpdate) {
      return { data: null, error: formatearError(errUpdate) };
    }

    // 3. Registrar movimiento en la bitácora de stock
    const { error: errMovimiento } = await supabase
      .from('movimientos_stock')
      .insert({
        existencia_id: existencia.id,
        tipo_movimiento: 'entrada',
        cantidad: cantNumerica,
        usuario_id: usuario.id,
        rol_usuario: usuario.rol,
      });

    if (errMovimiento) {
      return { data: null, error: formatearError(errMovimiento) };
    }

    return { data: { existencia_id: existencia.id, nuevaCantidad }, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

// ==========================================
// 5. BITÁCORA DE ACCIONES
// ==========================================

/**
 * Obtiene el historial de acciones y auditoría registradas en el sistema (exclusivo Admin/RH).
 * @param {object} filtros - Filtros opcionales { tipoAccion, usuarioId }
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerBitacora(filtros = {}) {
  try {
    let query = supabase
      .from('acciones_bitacora')
      .select(`
        id,
        usuario_id,
        rol_usuario,
        tipo_accion,
        entidad,
        entidad_id,
        detalle,
        registrado_en,
        usuarios (
          sap,
          nombre
        )
      `)
      .order('registrado_en', { ascending: false });

  if (filtros.tipoAccion) {
    query = query.eq('tipo_accion', filtros.tipoAccion);
  }
  if (filtros.usuarioId) {
    query = query.eq('usuario_id', filtros.usuarioId);
  }
  if (filtros.entidadId) {
    query = query.eq('entidad_id', filtros.entidadId);
  }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}
