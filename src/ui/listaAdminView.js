import { obtenerTodasLasPeticiones } from '../data/api.js';
import { escapar, formatearFecha, etiquetaEstado, resumenPrendas } from './formato.js';

const FILTROS = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'pendiente', etiqueta: 'Pendiente' },
  { valor: 'aprobada', etiqueta: 'Aprobada' },
  { valor: 'rechazada', etiqueta: 'Rechazada' },
  { valor: 'en_proceso', etiqueta: 'En proceso' },
  { valor: 'entregada', etiqueta: 'Entregada' },
];

function coincideFecha(fecha, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!fecha) return false;

  const momento = new Date(fecha);
  if (Number.isNaN(momento.getTime())) return false;

  if (desde) {
    const desdeMinimo = new Date(desde.getTime());
    desdeMinimo.setHours(0, 0, 0, 0);
    if (momento < desdeMinimo) return false;
  }

  if (hasta) {
    const hastaMaximo = new Date(hasta.getTime());
    hastaMaximo.setHours(23, 59, 59, 999);
    if (momento > hastaMaximo) return false;
  }

  return true;
}

export function initListaAdminView(container, { onVolver, onAbrirDetalle } = {}) {
  let peticiones = [];
  let filtroEstado = 'todas';
  let textoBusqueda = '';
  let fechaDesde = null;
  let fechaHasta = null;

  function renderEstructura() {
    container.innerHTML = `
      <section class="peticion-view lista-admin-view" aria-labelledby="lista-admin-title">
        <button type="button" class="btn-volver" id="btn-volver-lista-admin">
          &lsaquo; Volver al inicio
        </button>

        <div class="view-header view-header-fila">
          <div>
            <h1 class="view-title" id="lista-admin-title">Lista de peticiones</h1>
            <p class="view-subtitle">Solicitudes de cambio de uniforme de todos los colaboradores.</p>
          </div>
        </div>

        <div class="filtros-bar">
          <div class="filtros-inputs">
            <input
              type="search"
              class="form-input input-busqueda"
              id="input-busqueda-admin"
              placeholder="Buscar por nombre o SAP"
              aria-label="Buscar por nombre o SAP"
            />
            <input
              type="date"
              class="form-input input-fecha"
              id="input-fecha-desde"
              aria-label="Fecha desde"
            />
            <input
              type="date"
              class="form-input input-fecha"
              id="input-fecha-hasta"
              aria-label="Fecha hasta"
            />
          </div>

          <div class="filtros-chips" id="filtros-chips-admin" role="group" aria-label="Filtrar por estado">
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
        </div>

        <div id="lista-admin" class="lista-peticiones"></div>
      </section>
    `;
  }

  function htmlPeticion(peticion) {
    const usuario = peticion.usuarios ?? {};

    return `
      <article
        class="peticion-card peticion-card--admin"
        role="button"
        tabindex="0"
        data-id="${peticion.id}"
        aria-label="Detalle de la petición de ${escapar(usuario.nombre ?? '')}"
      >
        <div class="peticion-card-header">
          <span class="peticion-nombre">${escapar(usuario.nombre ?? '')}</span>
          <span class="badge-estado badge-estado--${peticion.estado}">
            ${escapar(etiquetaEstado(peticion.estado))}
          </span>
        </div>
        <p class="peticion-sap">SAP ${escapar(usuario.sap ?? '')}</p>
        <p class="peticion-fecha">Creada el ${formatearFecha(peticion.creada_en)}</p>
        <p class="peticion-prendas">${escapar(resumenPrendas(peticion.lineas_peticion))}</p>

        ${
          peticion.sin_devolucion
            ? '<div class="alert alert-warning peticion-alerta">Sin devolución registrada</div>'
            : ''
        }
      </article>
    `;
  }

  function renderLista() {
    const lista = container.querySelector('#lista-admin');

    if (peticiones.length === 0) {
      lista.innerHTML = `
        <div class="lista-vacia">
          <p>No hay peticiones registradas todavía.</p>
        </div>
      `;
      return;
    }

    const filtro = textoBusqueda.trim().toLowerCase();

    const visibles = peticiones.filter((peticion) => {
      if (filtroEstado !== 'todas' && peticion.estado !== filtroEstado) return false;
      if (!coincideFecha(
        peticion.creada_en ? new Date(peticion.creada_en) : null,
        fechaDesde,
        fechaHasta
      )) {
        return false;
      }

      if (filtro) {
        const usuario = peticion.usuarios ?? {};
        const nombre = String(usuario.nombre ?? '').toLowerCase();
        const sap = String(usuario.sap ?? '');
        return nombre.includes(filtro) || sap.includes(filtro);
      }

      return true;
    });

    if (visibles.length === 0) {
      lista.innerHTML = '<p class="cargando">Ninguna petición coincide con los filtros aplicados.</p>';
      return;
    }

    lista.innerHTML = visibles.map(htmlPeticion).join('');
  }

  function mostrarCargando() {
    container.querySelector('#lista-admin').innerHTML =
      '<p class="cargando">Cargando peticiones...</p>';
  }

  function mostrarErrorLista(mensaje) {
    container.querySelector('#lista-admin').innerHTML = `
      <div class="alert alert-danger">${escapar(mensaje)}</div>
      <button type="button" class="btn btn-outline" id="btn-reintentar-admin">Reintentar</button>
    `;
  }

  async function cargarPeticiones() {
    mostrarCargando();

    const { data, error } = await obtenerTodasLasPeticiones();

    if (error) {
      mostrarErrorLista(error.message);
      return;
    }

    peticiones = data ?? [];
    renderLista();
  }

  renderEstructura();

  container.querySelector('#btn-volver-lista-admin').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  container.querySelector('#input-busqueda-admin').addEventListener('input', (event) => {
    textoBusqueda = event.target.value;
    renderLista();
  });

  container.querySelector('#input-fecha-desde').addEventListener('change', (event) => {
    fechaDesde = event.target.value ? new Date(`${event.target.value}T00:00:00`) : null;
    renderLista();
  });

  container.querySelector('#input-fecha-hasta').addEventListener('change', (event) => {
    fechaHasta = event.target.value ? new Date(`${event.target.value}T00:00:00`) : null;
    renderLista();
  });

  container.querySelector('#filtros-chips-admin').addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    filtroEstado = chip.dataset.estado;
    container.querySelectorAll('#filtros-chips-admin .chip').forEach((chipRender) => {
      chipRender.classList.toggle('chip--activo', chipRender.dataset.estado === filtroEstado);
    });
    renderLista();
  });

  const lista = container.querySelector('#lista-admin');

  lista.addEventListener('click', (event) => {
    if (event.target.closest('#btn-reintentar-admin')) {
      cargarPeticiones();
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
