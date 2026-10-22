const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  en_proceso: 'En proceso',
  entregada: 'Entregada',
};

const ETIQUETAS_PRENDA = {
  escafandra: 'Escafandra',
  pantalon: 'Pantalón',
  playera: 'Playera',
  botas: 'Botas',
};

export function escapar(texto) {
  if (texto === null || texto === undefined) return '';

  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

export function formatearFecha(valor) {
  if (!valor) return '';

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';

  return fecha.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function etiquetaEstado(estado) {
  return ETIQUETAS_ESTADO[estado] ?? estado;
}

export function describirLinea(linea) {
  const tipo = ETIQUETAS_PRENDA[linea.prenda_tipo] || linea.prenda_tipo;

  if (linea.prenda_tipo === 'botas') {
    return `${tipo} ${linea.prenda_talla ?? ''}`.trim();
  }

  if (linea.prenda_tipo === 'escafandra') {
    return `${tipo} ${linea.prenda_color ?? ''}`.trim();
  }

  return `${tipo} ${linea.prenda_color ?? ''} ${linea.prenda_talla ?? ''}`.trim();
}

const ETIQUETAS_ACCION_BITACORA = {
  crear_peticion: 'Creó la petición',
  cambiar_estado: 'Cambió el estado',
  marcar_entregada: 'Marcó la entrega',
  confirmar_recepcion: 'Confirmó la recepción',
  registrar_entrada: 'Registró entrada de stock',
  importar_colaboradores: 'Importó colaboradores',
};

export function aValorDatetimeLocal(valor) {
  if (!valor) return '';

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';

  const dosDigitos = (numero) => String(numero).padStart(2, '0');

  return [
    fecha.getFullYear(),
    dosDigitos(fecha.getMonth() + 1),
    dosDigitos(fecha.getDate()),
  ].join('-') + 'T' + [
    dosDigitos(fecha.getHours()),
    dosDigitos(fecha.getMinutes()),
  ].join(':');
}

export function etiquetaAccionBitacora(tipo) {
  return ETIQUETAS_ACCION_BITACORA[tipo] ?? tipo;
}

export function resumenPrendas(lineas = []) {
  const total = lineas.length;
  const nombres = lineas.slice(0, 3).map(describirLinea);
  const palabra = total === 1 ? 'prenda' : 'prendas';

  return `${total} ${palabra}: ${nombres.join(', ')}${total > 3 ? ` y ${total - 3} más` : ''}`;
}
