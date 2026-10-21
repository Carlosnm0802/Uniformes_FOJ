import {
  obtenerDetallePeticion,
  obtenerBitacora,
  obtenerInventario,
  cambiarEstado,
  marcarEntregada,
} from '../data/api.js';
import {
  escapar,
  formatearFecha,
  etiquetaEstado,
  describirLinea,
  aValorDatetimeLocal,
  etiquetaAccionBitacora,
} from './formato.js';

function htmlLineas(peticion) {
  return `
    <section class="detalle-seccion" aria-label="Prendas solicitadas">
      <h2 class="detalle-titulo">Prendas solicitadas</h2>
      <ul class="detalle-lineas">
        ${peticion.lineas_peticion
          .map(
            (linea) => `
            <li class="detalle-linea">
              <span>${escapar(describirLinea(linea))}</span>
              ${linea.devuelta ? '<span class="badge-devuelta">Devuelta</span>' : ''}
            </li>
          `
          )
          .join('')}
      </ul>
    </section>
  `;
}

function htmlItemBitacora(item) {
  const autor = item.usuarios ?? {};

  return `
    <li class="bitacora-item">
      <span class="bitacora-accion">${escapar(etiquetaAccionBitacora(item.tipo_accion))}</span>
      <span class="bitacora-autor">
        Por ${escapar(autor.nombre ?? '')} (${escapar(item.rol_usuario)})
      </span>
      <span class="bitacora-fecha">${formatearFecha(item.registrado_en)}</span>
    </li>
  `;
}

function htmlBotonesAccion(peticion) {
  if (peticion.estado === 'pendiente') {
    return `
      <div class="detalle-acciones">
        <button type="button" class="btn btn-primary" id="btn-aprobar-abrir">
          Aprobar
        </button>
        <button type="button" class="btn btn-outline" id="btn-rechazar-abrir">
          Rechazar
        </button>
      </div>
    `;
  }

  if (peticion.estado === 'aprobada') {
    return `
      <div class="detalle-acciones">
        <button type="button" class="btn btn-primary" id="btn-pasar-en-proceso">
          Pasar a En proceso
        </button>
      </div>
    `;
  }

  if (peticion.estado === 'en_proceso') {
    return `
      <div class="detalle-acciones">
        <button type="button" class="btn btn-primary" id="btn-marcar-entregada">
          Marcar como Entregada
        </button>
      </div>
    `;
  }

  return '';
}

function htmlPeticion(peticion) {
  const usuario = peticion.usuarios ?? {};

  return `
    <p class="detalle-datos-cabecera">
      <span class="badge-estado badge-estado--${peticion.estado}">
        ${escapar(etiquetaEstado(peticion.estado))}
      </span>
      <span class="peticion-fecha">Creada el ${formatearFecha(peticion.creada_en)}</span>
    </p>

    <section class="detalle-seccion" aria-label="Colaborador">
      <h2 class="detalle-titulo">Colaborador</h2>
      <p class="campo-fila">
        <span class="campo-etiqueta">Nombre</span>
        <span>${escapar(usuario.nombre ?? '')}</span>
      </p>
      <p class="campo-fila">
        <span class="campo-etiqueta">SAP</span>
        <span>${escapar(usuario.sap ?? '')}</span>
      </p>
    </section>

    ${
      peticion.sin_devolucion
        ? '<div class="alert alert-warning">Esta entrega no registró devolución de prendas.</div>'
        : ''
    }

    ${
      peticion.estado === 'rechazada'
        ? `<div class="alert alert-danger">Motivo del rechazo: ${escapar(peticion.motivo_rechazo ?? '')}</div>`
        : ''
    }

    ${htmlLineas(peticion)}

    <section class="detalle-seccion" aria-label="Motivo de la petición">
      <h2 class="detalle-titulo">Motivo</h2>
      <p class="campo-fila">
        <span class="campo-etiqueta">Motivo</span>
        <span>${escapar(peticion.motivo)}</span>
      </p>
    </section>

    <section class="detalle-seccion" aria-label="Ventanas de entrega">
      <h2 class="detalle-titulo">Ventanas de entrega</h2>
      <p class="campo-fila">
        <span class="campo-etiqueta">Propuesta</span>
        <span>${formatearFecha(peticion.ventana_propuesta_inicio)}</span>
      </p>
      ${
        peticion.ventana_confirmada_inicio
          ? `<p class="campo-fila">
              <span class="campo-etiqueta">Confirmada</span>
              <span>${formatearFecha(peticion.ventana_confirmada_inicio)}</span>
            </p>`
          : ''
      }
    </section>

    ${
      peticion.observaciones
        ? `<section class="detalle-seccion" aria-label="Observaciones">
            <h2 class="detalle-titulo">Observaciones</h2>
            <p class="texto-multilinea">${escapar(peticion.observaciones)}</p>
          </section>`
        : ''
    }

    ${
      peticion.estado === 'entregada' && peticion.recepcion_confirmada
        ? '<div class="alert alert-success">El colaborador confirmó la recepción.</div>'
        : ''
    }

    ${htmlBotonesAccion(peticion)}

    <details class="historial" id="detalle-historial">
      <summary>Historial de acciones</summary>
      <div id="historial-contenido">
        <p class="cargando">Cargando historial...</p>
      </div>
    </details>
  `;
}

function htmlStockLinea(linea, existencias) {
  const disponibles = existencias.find((existencia) => (
    existencia.prenda_tipo === linea.prenda_tipo &&
    (existencia.prenda_color ?? null) === (linea.prenda_color ?? null) &&
    (existencia.prenda_talla ?? null) === (linea.prenda_talla ?? null)
  ));

  const cantidad = disponibles ? disponibles.cantidad : 0;
  const alcanza = cantidad >= 1;

  return `
    <p class="campo-fila stock-fila">
      <span>${escapar(describirLinea(linea))}</span>
      <span>
        Disponibles: ${cantidad}
        <span class="${alcanza ? 'stock-alcanza' : 'stock-no-alcanza'}">
          ${alcanza ? 'Alcanza' : 'No alcanza'}
        </span>
      </span>
    </p>
  `;
}

export function initDetalleAdminView(container, { peticionId, onVolver } = {}) {
  let peticionActual = null;
  let avisoSinDevolucionMostrado = false;

  container.innerHTML = `
    <section class="peticion-view detalle-admin-view" aria-labelledby="detalle-admin-title">
      <button type="button" class="btn-volver" id="btn-volver-detalle-admin">
        &lsaquo; Volver a la lista
      </button>

      <h1 class="view-title" id="detalle-admin-title">Detalle de la petición</h1>

      <div id="detalle-admin-alerta" aria-live="polite"></div>
      <div id="detalle-admin-contenido" class="detalle-contenido">
        <p class="cargando">Cargando detalle...</p>
      </div>
    </section>

    <dialog id="dialogo-aprobar" class="dialogo">
      <div class="dialogo-contenido">
        <h2 class="dialogo-titulo">Aprobar petición</h2>
        <div id="dialogo-aprobar-alerta" aria-live="polite"></div>

        <p class="form-label">Ventana confirmada</p>
        <div class="ventana-doble">
          <input
            type="datetime-local"
            class="form-input"
            id="input-ventana-inicio"
            aria-label="Inicio de la ventana confirmada"
          />
          <input
            type="datetime-local"
            class="form-input"
            id="input-ventana-fin"
            aria-label="Fin de la ventana confirmada"
          />
        </div>
        <p class="form-hint">Viene de la propuesta del colaborador; puedes reasignarla antes de aprobar.</p>

        <p class="form-label">Stock disponible por línea</p>
        <div id="stock-contenido" class="stock-lista">
          <p class="cargando">Consultando inventario...</p>
        </div>

        <div class="dialogo-acciones">
          <button type="button" class="btn btn-outline" id="btn-aprobar-cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-aprobar-confirmar">Aprobar petición</button>
        </div>
      </div>
    </dialog>

    <dialog id="dialogo-rechazar" class="dialogo">
      <div class="dialogo-contenido">
        <h2 class="dialogo-titulo">Rechazar petición</h2>
        <div id="dialogo-rechazar-alerta" aria-live="polite"></div>

        <label class="form-label" for="input-motivo-rechazo">Motivo (obligatorio)</label>
        <textarea
          class="form-input"
          id="input-motivo-rechazo"
          rows="3"
          placeholder="Explica por qué se rechaza la petición"
        ></textarea>

        <div class="dialogo-acciones">
          <button type="button" class="btn btn-outline" id="btn-rechazar-cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-rechazar-confirmar">Rechazar petición</button>
        </div>
      </div>
    </dialog>

    <dialog id="dialogo-entrega" class="dialogo">
      <div class="dialogo-contenido">
        <h2 class="dialogo-titulo">Marcar como Entregada</h2>
        <div id="dialogo-entrega-alerta" aria-live="polite"></div>

        <p class="form-label">Devolución de prendas</p>
        <div id="entrega-lineas"></div>
        <p class="form-hint">Marca las prendas que sí regresaron. Al confirmar, el stock se descuenta.</p>

        <label class="form-label" for="input-observaciones-entrega">Observaciones (opcional)</label>
        <textarea
          class="form-input"
          id="input-observaciones-entrega"
          rows="3"
          placeholder="Comentarios sobre la entrega"
        ></textarea>

        <div class="dialogo-acciones">
          <button type="button" class="btn btn-outline" id="btn-entrega-cancelar">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-entrega-confirmar">Confirmar entrega</button>
        </div>
      </div>
    </dialog>
  `;

  container.querySelector('#btn-volver-detalle-admin').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  const contenido = container.querySelector('#detalle-admin-contenido');
  const alerta = container.querySelector('#detalle-admin-alerta');
  const dialogoAprobar = container.querySelector('#dialogo-aprobar');
  const dialogoRechazar = container.querySelector('#dialogo-rechazar');
  const dialogoEntrega = container.querySelector('#dialogo-entrega');

  function renderHistorial(carga) {
    const caja = container.querySelector('#historial-contenido');
    if (!caja) return;

    if (carga.error) {
      caja.innerHTML = `
        <div class="alert alert-danger">${escapar(carga.error.message)}</div>
        <button type="button" class="btn btn-outline btn-compacto" id="btn-reintentar-historial">
          Reintentar
        </button>
      `;
      return;
    }

    const items = carga.data ?? [];

    caja.innerHTML =
      items.length === 0
        ? '<p class="cargando">Sin acciones registradas.</p>'
        : `<ul class="bitacora-lista">${items.map(htmlItemBitacora).join('')}</ul>`;
  }

  async function recargarHistorial() {
    const caja = container.querySelector('#historial-contenido');
    if (caja) caja.innerHTML = '<p class="cargando">Cargando historial...</p>';

    renderHistorial(await obtenerBitacora({ entidadId: peticionId }));
  }

  async function cargar(mantenerAlerta = false) {
    contenido.innerHTML = '<p class="cargando">Cargando detalle...</p>';

    if (!mantenerAlerta) alerta.innerHTML = '';

    const [resultadoPeticion, resultadoBitacora] = await Promise.all([
      obtenerDetallePeticion(peticionId),
      obtenerBitacora({ entidadId: peticionId }),
    ]);

    if (resultadoPeticion.error) {
      contenido.innerHTML = `
        <div class="alert alert-danger">${escapar(resultadoPeticion.error.message)}</div>
        <button type="button" class="btn btn-outline" id="btn-reintentar-detalle">
          Reintentar
        </button>
      `;
      return;
    }

    contenido.innerHTML = htmlPeticion(resultadoPeticion.data);
    peticionActual = resultadoPeticion.data;
    renderHistorial(resultadoBitacora);
  }

  async function ejecutarTransicion(nuevoEstado, extra = {}, mensajeExito = '') {
    alerta.innerHTML = '<div class="alert alert-warning">Aplicando cambio de estado...</div>';

    const { error } = await cambiarEstado(peticionId, nuevoEstado, extra);

    if (error) {
      alerta.innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      await cargar(true);
      return;
    }

    alerta.innerHTML = `<div class="alert alert-success">${escapar(mensajeExito)}</div>`;
    await cargar(true);
  }

  function abrirDialogoAprobar(peticion) {
    container.querySelector('#input-ventana-inicio').value = aValorDatetimeLocal(
      peticion.ventana_propuesta_inicio
    );
    container.querySelector('#input-ventana-fin').value = aValorDatetimeLocal(
      peticion.ventana_propuesta_fin
    );

    container.querySelector('#dialogo-aprobar-alerta').innerHTML = '';
    container.querySelector('#stock-contenido').innerHTML =
      '<p class="cargando">Consultando inventario...</p>';

    dialogoAprobar.showModal();
    cargarStock();
  }

  async function cargarStock() {
    const caja = container.querySelector('#stock-contenido');
    const { data, error } = await obtenerInventario();

    if (error) {
      caja.innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      return;
    }

    const respuestaPeticion = await obtenerDetallePeticion(peticionId);
    if (respuestaPeticion.error) {
      caja.innerHTML = `<div class="alert alert-danger">${escapar(respuestaPeticion.error.message)}</div>`;
      return;
    }

    const lineas = respuestaPeticion.data.lineas_peticion ?? [];
    caja.innerHTML = lineas.map((linea) => htmlStockLinea(linea, data ?? [])).join('');
  }

  async function aprobar() {
    const inicio = container.querySelector('#input-ventana-inicio').value;
    const fin = container.querySelector('#input-ventana-fin').value;
    const cajaAlerta = container.querySelector('#dialogo-aprobar-alerta');

    if (!inicio || !fin) {
      cajaAlerta.innerHTML = '<div class="alert alert-danger">Debes definir inicio y fin de la ventana confirmada.</div>';
      return;
    }

    if (fin < inicio) {
      cajaAlerta.innerHTML = '<div class="alert alert-danger">El fin de la ventana no puede ser anterior al inicio.</div>';
      return;
    }

    cajaAlerta.innerHTML = '';
    dialogoAprobar.close();

    await ejecutarTransicion('aprobada', {
      ventana_confirmada_inicio: inicio,
      ventana_confirmada_fin: fin,
    }, 'Petición aprobada. La ventana quedó fijada.');
  }

  async function rechazar() {
    const motivo = container.querySelector('#input-motivo-rechazo').value.trim();
    const cajaAlerta = container.querySelector('#dialogo-rechazar-alerta');

    if (motivo === '') {
      cajaAlerta.innerHTML = '<div class="alert alert-danger">El motivo de rechazo es obligatorio.</div>';
      return;
    }

    cajaAlerta.innerHTML = '';
    dialogoRechazar.close();

    await ejecutarTransicion('rechazada', { motivo_rechazo: motivo }, 'Petición rechazada.');
  }

  function abrirDialogoEntrega(peticion) {
    container.querySelector('#entrega-lineas').innerHTML = (peticion.lineas_peticion ?? [])
      .map(
        (linea) => `
        <label class="entrega-linea">
          <input type="checkbox" data-linea-id="${linea.id}" />
          <span>¿Se devolvió? ${escapar(describirLinea(linea))}</span>
        </label>
      `
      )
      .join('');
    container.querySelector('#input-observaciones-entrega').value = '';
    container.querySelector('#dialogo-entrega-alerta').innerHTML = '';
    avisoSinDevolucionMostrado = false;

    dialogoEntrega.showModal();
  }

  async function confirmarEntrega(boton) {
    const cajaAlerta = container.querySelector('#dialogo-entrega-alerta');
    const devoluciones = Array.from(
      container.querySelectorAll('#entrega-lineas input[type="checkbox"]:checked')
    ).map((casilla) => casilla.dataset.lineaId);
    const observaciones = container
      .querySelector('#input-observaciones-entrega')
      .value
      .trim();

    if (devoluciones.length === 0 && !avisoSinDevolucionMostrado) {
      avisoSinDevolucionMostrado = true;
      cajaAlerta.innerHTML =
        '<div class="alert alert-warning">No se registrará devolución de ninguna prenda. Pulsa de nuevo para continuar.</div>';
      return;
    }

    cajaAlerta.innerHTML = '';
    boton.disabled = true;
    boton.textContent = 'Confirmando...';

    const { error } = await marcarEntregada(peticionId, devoluciones, observaciones || null);

    if (error) {
      cajaAlerta.innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      boton.disabled = false;
      boton.textContent = 'Confirmar entrega';
      return;
    }

    avisoSinDevolucionMostrado = false;
    dialogoEntrega.close();
    alerta.innerHTML =
      '<div class="alert alert-success">Entrega registrada. El stock se descontó.</div>';
    await cargar(true);
  }

  contenido.addEventListener('click', async (event) => {
    if (event.target.closest('#btn-reintentar-detalle')) {
      await cargar();
      return;
    }

    if (event.target.closest('#btn-reintentar-historial')) {
      await recargarHistorial();
      return;
    }

    const boton = event.target.closest('button');
    if (!boton) return;

    if (boton.matches('#btn-pasar-en-proceso')) {
      boton.disabled = true;
      boton.textContent = 'Cambiando...';
      await ejecutarTransicion('en_proceso', {}, 'La petición pasó a En proceso.');
      return;
    }

    if (boton.matches('#btn-marcar-entregada')) {
      if (!peticionActual) {
        alerta.innerHTML =
          '<div class="alert alert-danger">Recarga el detalle para marcar la entrega.</div>';
        return;
      }
      abrirDialogoEntrega(peticionActual);
      return;
    }

    if (boton.matches('#btn-rechazar-abrir')) {
      container.querySelector('#input-motivo-rechazo').value = '';
      container.querySelector('#dialogo-rechazar-alerta').innerHTML = '';
      dialogoRechazar.showModal();
      return;
    }

    if (!boton.matches('#btn-aprobar-abrir')) return;

    const { error, data } = await obtenerDetallePeticion(peticionId);
    if (error) {
      alerta.innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      return;
    }

    abrirDialogoAprobar(data);
  });

  dialogoAprobar.addEventListener('click', async (event) => {
    if (event.target.closest('#btn-aprobar-cancelar')) {
      dialogoAprobar.close();
      return;
    }

    if (event.target.closest('#btn-aprobar-confirmar')) {
      await aprobar();
    }
  });

  dialogoRechazar.addEventListener('click', async (event) => {
    if (event.target.closest('#btn-rechazar-cancelar')) {
      dialogoRechazar.close();
      return;
    }

    if (event.target.closest('#btn-rechazar-confirmar')) {
      await rechazar();
    }
  });

  dialogoEntrega.addEventListener('click', async (event) => {
    if (event.target.closest('#btn-entrega-cancelar')) {
      dialogoEntrega.close();
      return;
    }

    const botonConfirmar = event.target.closest('#btn-entrega-confirmar');
    if (botonConfirmar) {
      await confirmarEntrega(botonConfirmar);
    }
  });

  cargar();
}
