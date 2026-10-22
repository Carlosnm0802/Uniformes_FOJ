// src/data/api.js
// Módulo único de acceso a datos para la aplicación de Uniformes Nestlé.
// Es el único punto de contacto del front con Supabase, RPCs y Edge Functions.
// Todas las respuestas siguen la convención { data, error } con mensajes normalizados en español.

import { supabase } from './client.js';
import { guardarSesion, obtenerUsuario, borrarSesion } from './session.js';

const BITACORA_POR_PAGINA = 50;

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
 * Invoca la función PostgreSQL 'registrar_entrada' (Ticket 20), que incrementa la
 * existencia, registra el movimiento con autor y rol, y anota la acción en la
 * bitácora, todo en una sola transacción.
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

    const { data, error } = await supabase.rpc('registrar_entrada', {
      p_admin_id: usuario.id,
      p_prenda_tipo: prendaTipo,
      p_cantidad: cantNumerica,
      p_prenda_color: prendaColor || null,
      p_prenda_talla: prendaTalla || null,
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
  if (filtros.desde) {
    query = query.gte('registrado_en', new Date(`${filtros.desde}T00:00:00`).toISOString());
  }
  if (filtros.hasta) {
    query = query.lte('registrado_en', new Date(`${filtros.hasta}T23:59:59.999`).toISOString());
  }

  // Búsqueda por nombre o SAP: PostgREST no filtra de forma fiable por un
  // recurso embebido dentro de or=(), así que se resuelve en dos pasos.
  if (filtros.busqueda) {
    const { data: coincidencias, error: errorBusqueda } = await supabase
      .from('usuarios')
      .select('id')
      .or(`nombre.ilike.%${filtros.busqueda}%,sap.ilike.%${filtros.busqueda}%`);

    if (errorBusqueda) {
      return { data: null, error: formatearError(errorBusqueda) };
    }

    if (!coincidencias?.length) {
      return { data: [], error: null };
    }

    query = query.in('usuario_id', coincidencias.map((usuario) => usuario.id));
  }

  const limite = filtros.limite ?? BITACORA_POR_PAGINA;
  const pagina = filtros.pagina ?? 0;
  if (limite > 0) {
    query = query.range(pagina * limite, pagina * limite + limite - 1);
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

// ==========================================
// 6. IMPORTACIÓN DE COLABORADORES
// ==========================================

/**
 * Obtiene la lista de todos los usuarios (de cualquier rol) para los filtros
 * de la bitácora; lectura cubierta por la política RLS 'usuarios_lectura'.
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerUsuarios() {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, sap, nombre, rol')
      .order('nombre', { ascending: true });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Obtiene el censo completo de colaboradores para Administrador y RH
 * (lectura cubierta por la política RLS 'usuarios_lectura').
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export async function obtenerColaboradores() {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, sap, nombre, pin_pendiente, bloqueado')
      .eq('rol', 'colaborador')
      .order('nombre', { ascending: true });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}

/**
 * Importa un lote de colaboradores (Tickets 21) mediante la función PostgreSQL
 * 'importar_colaboradores', que valida el lote, omite SAP inválidos, duplicados
 * internos o ya existentes, crea los usuarios con PIN pendiente y registra una
 * acción de bitácora por lote, todo en una sola transacción.
 * @param {Array<{sap: string, nombre: string}>} filas - Lote leído del archivo.
 * @returns {Promise<{ data: any|null, error: Error|null }>}
 */
export async function importarColaboradores(filas) {
  try {
    const usuario = obtenerUsuario();
    if (!usuario?.id) {
      return { data: null, error: new Error('No hay sesión activa de usuario.') };
    }

    const { data, error } = await supabase.rpc('importar_colaboradores', {
      p_admin_id: usuario.id,
      p_colaboradores: filas,
    });

    if (error) {
      return { data: null, error: formatearError(error) };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: formatearError(err) };
  }
}
