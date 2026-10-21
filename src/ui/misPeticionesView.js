import { obtenerPeticionesColaborador } from '../data/api.js';
import { escapar, formatearFecha, etiquetaEstado, resumenPrendas } from './formato.js';

const FILTROS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'aprobada', etiqueta: 'Aprobada' },
  { valor: 'rechazada', etiqueta: 'Rechazada' },
  { valor: 'en_proceso', etiqueta: 'En proceso' },
  { valor: 'entregada', etiqueta: 'Entregada' },
];

export function initMisPeticionesView(container, { onVolver, onNuevaPeticion, onAbrirDetalle } = {}) {
  let filtroEstado = 'todas';
  let peticiones = [];

  function renderEstructura() {
    container.innerHTML = `
      <section class="peticion-view mis-peticiones-view" aria-labelledby="mis-peticiones-title">
        <button type="button" class="btn-volver" id="btn-volver-mis-peticiones">
          &lsaquo; Volver al inicio
        </button>

        <div class="view-header view-header-fila">
          <div>
            <h1 class="view-title" id="mis-peticiones-title">Mis peticiones</h1>
            <p class="view-subtitle">Estado y avance de cada solicitud que has creado.</p>
          </div>
          <button type="button" class="btn btn-primary btn-compacto" id="btn-mas-peticion">
            + Nueva petición
          </button>
        </div>

        <div class="filtros-chips" id="filtros-chips" role="group" aria-label="Filtrar por estado">
          ${FILTROS.map((filtro) => `
            <button
              type="button"
              class="chip ${filtro.valor === filtroEstado ? 'chip--activo' : ''}"
              data-estado="${filtro.valor}"
            >
              ${filtro.etiqueta}
            </button>
          `).join('')}
        </div>

        <div id="lista-peticiones" class="lista-peticiones"></div>
      </section>
    `;
  }

  function htmlPeticion(peticion) {
    const ventanaConfirmada = Boolean(peticion.ventana_confirmada_inicio);

    return `
      <article
        class="peticion-card"
        role="button"
        tabindex="0"
        data-id="${peticion.id}"
        aria-label="Ver detalle de la petición de ${escapar(resumenPrendas(peticion.lineas_peticion))}"
      >
        <div class="peticion-card-header">
          <span class="badge-estado badge-estado--${peticion.estado}">
            ${escapar(etiquetaEstado(peticion.estado))}
          </span>
          <span class="peticion-fecha">Creada el ${formatearFecha(peticion.creada_en)}</span>
        </div>

        <p class="peticion-prendas">${escapar(resumenPrendas(peticion.lineas_peticion))}</p>

        <div class="peticion-ventanas">
          <div class="campo-fila">
            <span class="campo-etiqueta">Propuesta</span>
            <span>${formatearFecha(peticion.ventana_propuesta_inicio)}</span>
          </div>
          ${
            ventanaConfirmada
              ? `<div class="campo-fila">
                  <span class="campo-etiqueta">Confirmada</span>
                  <span>${formatearFecha(peticion.ventana_confirmada_inicio)}</span>
                </div>`
              : ''
          }
        </div>

        ${
          peticion.sin_devolucion
            ? '<div class="alert alert-warning peticion-alerta">Sin devolución registrada</div>'
            : ''
        }
      </article>
    `;
  }

  function mostrarCargando() {
    container.querySelector('#lista-peticiones').innerHTML =
      '<p class="cargando">Cargando tus peticiones...</p>';
  }

  function mostrarErrorLista(mensaje) {
    container.querySelector('#lista-peticiones').innerHTML = `
      <div class="alert alert-danger">${escapar(mensaje)}</div>
      <button type="button" class="btn btn-outline" id="btn-reintentar">Reintentar</button>
    `;
  }

  function renderLista() {
    const lista = container.querySelector('#lista-peticiones');

    if (peticiones.length === 0) {
      lista.innerHTML = `
        <div class="lista-vacia">
          <p>Aún no tienes peticiones. Crea la primera para solicitar un cambio de uniforme.</p>
          <button type="button" class="btn btn-primary" id="btn-crear-primera">
            Crear mi primera petición
          </button>
        </div>
      `;
      return;
    }

    const visibles =
      filtroEstado === 'todas'
        ? peticiones
        : peticiones.filter((peticion) => peticion.estado === filtroEstado);

    if (visibles.length === 0) {
      lista.innerHTML = '<p class="cargando">No tienes peticiones con este estado.</p>';
      return;
    }

    lista.innerHTML = visibles.map(htmlPeticion).join('');
  }

  async function cargarPeticiones() {
    mostrarCargando();

    const { data, error } = await obtenerPeticionesColaborador();

    if (error) {
      mostrarErrorLista(error.message);
      return;
    }

    peticiones = data ?? [];
    renderLista();
  }

  renderEstructura();

  container.querySelector('#btn-volver-mis-peticiones').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  container.querySelector('#btn-mas-peticion').addEventListener('click', () => {
    if (typeof onNuevaPeticion === 'function') onNuevaPeticion();
  });

  container.querySelector('#filtros-chips').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    filtroEstado = chip.dataset.estado;
    container.querySelectorAll('#filtros-chips .chip').forEach((chipRender) => {
      chipRender.classList.toggle('chip--activo', chipRender.dataset.estado === filtroEstado);
    });
    renderLista();
  });

  const lista = container.querySelector('#lista-peticiones');

  lista.addEventListener('click', (event) => {
    if (event.target.closest('#btn-reintentar')) {
      cargarPeticiones();
      return;
    }

    if (event.target.closest('#btn-crear-primera')) {
      if (typeof onNuevaPeticion === 'function') onNuevaPeticion();
      return;
    }

    const tarjeta = event.target.closest('.peticion-card');
    if (tarjeta && typeof onAbrirDetalle === 'function') {
      onAbrirDetalle(tarjeta.dataset.id);
    }
  });

  lista.addEventListener('keydown', (event) => {
    const tarjeta = event.target.closest('.peticion-card');
    if (!tarjeta || (event.key !== 'Enter' && event.key !== ' ')) return;

    event.preventDefault();
    if (typeof onAbrirDetalle === 'function') onAbrirDetalle(tarjeta.dataset.id);
  });

  cargarPeticiones();
}
