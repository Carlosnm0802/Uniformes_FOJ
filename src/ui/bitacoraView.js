import { obtenerBitacora, obtenerUsuarios } from '../data/api.js';
import { escapar, formatearFecha, etiquetaAccionBitacora } from './formato.js';

const POR_PAGINA = 50;

const TIPOS_ACCION = [
  'crear_peticion',
  'cambiar_estado',
  'marcar_entregada',
  'confirmar_recepcion',
  'registrar_entrada',
  'importar_colaboradores',
];

function htmlEntidad(fila) {
  if (fila.entidad === 'peticiones') return 'Petición';
  if (fila.entidad === 'existencias') return 'Inventario';
  if (fila.entidad === 'usuarios') return 'Colaboradores';

  return '—';
}

function htmlDetalleResumido(fila) {
  const detalle = fila.detalle;
  if (!detalle) return '—';

  const piezas = Object.entries(detalle)
    .filter(([, valor]) => valor !== null && valor !== undefined)
    .slice(0, 4)
    .map(([clave, valor]) => `${clave}: ${valor}`);

  return piezas.length ? piezas.join(' · ') : '—';
}

function htmlTabla(fila) {
  const usuario = fila.usuarios ?? {};

  return `
    <tr>
      <td class="bitacora-fecha">${formatearFecha(fila.registrado_en)}</td>
      <td>${escapar(etiquetaAccionBitacora(fila.tipo_accion))}</td>
      <td>${escapar(usuario.nombre ?? '—')}${usuario.sap ? `<br/><span class="bitacora-sap">SAP ${escapar(usuario.sap)}</span>` : ''}</td>
      <td><code class="bitacora-rol">${escapar(fila.rol_usuario ?? '')}</code></td>
      <td>${htmlEntidad(fila)}</td>
      <td class="bitacora-detalle">${escapar(htmlDetalleResumido(fila))}</td>
    </tr>
  `;
}

function htmlFilaVaciaNuevo(columnas) {
  return `
    <tr><td colspan="${columnas}" class="lista-vacia">No hay acciones que coincidan con los filtros.</td></tr>
  `;
}

export function initBitacoraView(container, { onVolver } = {}) {
  container.innerHTML = `
    <section class="peticion-view bitacora-view" aria-labelledby="bitacora-title">
      <button type="button" class="btn-volver" id="btn-volver-bitacora">
        &lsaquo; Volver al inicio
      </button>

      <h1 class="view-title" id="bitacora-title">Bitácora de acciones</h1>
      <p class="view-subtitle">Historial de auditoría de todas las acciones del sistema.</p>

      <div id="bitacora-alerta" aria-live="polite"></div>

      <section class="detalle-seccion" aria-label="Filtros de bitácora">
        <div class="filtros-chips" id="chips-tipo">
          <button type="button" class="chip chip--activo" data-tipo="">Todo</button>
          ${TIPOS_ACCION.map(
            (tipo) =>
              `<button type="button" class="chip" data-tipo="${tipo}">${escapar(etiquetaAccionBitacora(tipo))}</button>`
          ).join('')}
        </div>

        <div class="bitacora-filtros">
          <div class="form-campo">
            <label class="form-label" for="filtro-usuario">Usuario</label>
            <select class="form-input" id="filtro-usuario">
              <option value="">Todos</option>
            </select>
          </div>

          <div class="form-campo">
            <label class="form-label" for="filtro-desde">Desde</label>
            <input type="date" class="form-input" id="filtro-desde" />
          </div>

          <div class="form-campo">
            <label class="form-label" for="filtro-hasta">Hasta</label>
            <input type="date" class="form-input" id="filtro-hasta" />
          </div>

          <div class="form-campo">
            <label class="form-label" for="filtro-busqueda">Buscar</label>
            <input
              type="search"
              class="form-input"
              id="filtro-busqueda"
              placeholder="Nombre o SAP del usuario..."
            />
          </div>
        </div>
      </section>

      <section class="detalle-seccion" aria-label="Registro de acciones">
        <p class="lista-colaboradores-conteo" id="bitacora-conteo"></p>
        <div class="tabla-inventario-cinta">
          <table class="tabla-inventario">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody id="bitacora-tbody">
              <tr><td colspan="6" class="cargando">Cargando bitácora...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="bitacora-paginacion">
          <button type="button" class="btn btn-outline btn-compacto" id="btn-mas-bitacora" hidden>
            Más resultados
          </button>
        </div>
      </section>
    </section>
  `;

  container.querySelector('#btn-volver-bitacora').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  const tbody = container.querySelector('#bitacora-tbody');
  const conteo = container.querySelector('#bitacora-conteo');
  const botonMas = container.querySelector('#btn-mas-bitacora');
  const alerta = container.querySelector('#bitacora-alerta');
  const selectUsuario = container.querySelector('#filtro-usuario');

  let pagina = 0;
  let acumuladas = [];
  let hayMas = false;
  let temporizadorBusqueda = null;

  function leerFiltros() {
    return {
      tipoAccion: container.querySelector('.chip--activo')?.dataset.tipo || '',
      usuarioId: selectUsuario.value,
      desde: container.querySelector('#filtro-desde').value,
      hasta: container.querySelector('#filtro-hasta').value,
      busqueda: container.querySelector('#filtro-busqueda').value.trim(),
    };
  }

  function pintarTabla() {
    if (!acumuladas.length) {
      tbody.innerHTML = htmlFilaVaciaNuevo(6);
      conteo.textContent = '';
      botonMas.hidden = true;
      return;
    }

    tbody.innerHTML = acumuladas.map(htmlTabla).join('');
    conteo.textContent = `Mostrando ${acumuladas.length} acciones`;
    botonMas.hidden = !hayMas;
  }

  async function cargarPagina() {
    alerta.innerHTML = '';
    acumuladas = [];
    pagina = 0;

    await cargarPaginaNueva();
  }

  async function cargarPaginaNueva() {
    const filtros = leerFiltros();

    if (filtros.busqueda.length > 0 && filtros.busqueda.length < 2) {
      alerta.innerHTML =
        '<div class="alert alert-danger">La búsqueda requiere al menos 2 caracteres.</div>';
      return;
    }

    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      alerta.innerHTML =
        '<div class="alert alert-danger">La fecha "desde" no puede ser posterior a "hasta".</div>';
      return;
    }

    const { data, error } = await obtenerBitacora({ ...filtros, pagina });
    if (error) {
      alerta.innerHTML = `
        <div class="alert alert-danger">${escapar(error.message)}</div>
        <button type="button" class="btn btn-outline btn-compacto" id="btn-reintentar-bitacora">
          Reintentar
        </button>
      `;
      alerta.querySelector('#btn-reintentar-bitacora').addEventListener('click', cargarPagina);
      return;
    }

    hayMas = (data?.length ?? 0) >= POR_PAGINA;
    acumuladas = acumuladas.concat(data ?? []);
    pintarTabla();
  }

  container.querySelector('#chips-tipo').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;

    container.querySelectorAll('.chip').forEach((elemento) => elemento.classList.remove('chip--activo'));
    chip.classList.add('chip--activo');
    cargarPagina();
  });

  selectUsuario.addEventListener('change', () => {
    cargarPagina();
  });

  container.querySelector('#filtro-desde').addEventListener('change', () => {
    cargarPagina();
  });

  container.querySelector('#filtro-hasta').addEventListener('change', () => {
    cargarPagina();
  });

  container.querySelector('#filtro-busqueda').addEventListener('input', (evento) => {
    clearTimeout(temporizadorBusqueda);
    const valor = evento.target.value;
    temporizadorBusqueda = setTimeout(() => {
      if (valor.trim() === container.querySelector('#filtro-busqueda').value.trim()) {
        cargarPagina();
      }
    }, 400);
  });

  botonMas.addEventListener('click', async () => {
    botonMas.disabled = true;
    botonMas.textContent = 'Cargando...';
    pagina += 1;
    await cargarPaginaNueva();
    botonMas.disabled = false;
    botonMas.textContent = 'Más resultados';
  });

  async function cargarUsuarios() {
    const { data, error } = await obtenerUsuarios();
    if (error) {
      container.querySelector('#bitacora-alerta').innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      return;
    }
    selectUsuario.innerHTML = `<option value="">Todos</option>${(data ?? [])
      .map(
        (usuario) =>
          `<option value="${escapar(usuario.id)}">${escapar(usuario.nombre)} (SAP ${escapar(usuario.sap)})</option>`
      )
      .join('')}`;
  }

  cargarUsuarios()
    .then(() => cargarPagina())
    .catch((err) => {
      alerta.innerHTML = `<div class="alert alert-danger">${escapar(err.message)}</div>`;
    });
}
