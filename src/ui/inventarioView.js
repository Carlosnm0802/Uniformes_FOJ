import { obtenerInventario, registrarEntrada } from '../data/api.js';
import { COLORES, TALLAS_ROPA, TALLAS_BOTAS, ETIQUETAS_COLOR } from './catalogo.js';
import { escapar } from './formato.js';

const ETIQUETAS_TIPO = {
  escafandra: 'Escafandra',
  pantalon: 'Pantalón',
  playera: 'Playera',
  botas: 'Botas',
};

const ORDEN_TIPOS = ['escafandra', 'pantalon', 'playera', 'botas'];

function htmlTabla(data) {
  const filas = ORDEN_TIPOS.map((tipo) => {
    const filasTipo = data
      .filter((existencia) => existencia.prenda_tipo === tipo)
      .map(
        (existencia) => `
        <tr>
          <td>${existencia.prenda_color ? escapar(ETIQUETAS_COLOR[existencia.prenda_color] ?? existencia.prenda_color) : '—'}</td>
          <td>${tipo === 'escafandra' ? 'Única' : (existencia.prenda_talla ? escapar(existencia.prenda_talla) : '—')}</td>
          <td class="${existencia.cantidad === 0 ? 'cantidad-cero' : ''}">${existencia.cantidad}</td>
        </tr>
      `
      )
      .join('');

    if (!filasTipo) return '';

    return `
      <tr class="grupo-tipo">
        <th colspan="3">${escapar(ETIQUETAS_TIPO[tipo] ?? tipo)}</th>
      </tr>
      ${filasTipo}
    `;
  }).join('');

  return `
    <div class="tabla-inventario-cinta">
      <table class="tabla-inventario">
        <thead>
          <tr>
            <th>Color</th>
            <th>Talla</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

export function initInventarioView(container, { onVolver } = {}) {
  container.innerHTML = `
    <section class="peticion-view inventario-view" aria-labelledby="inventario-title">
      <button type="button" class="btn-volver" id="btn-volver-inventario">
        &lsaquo; Volver al inicio
      </button>

      <h1 class="view-title" id="inventario-title">Inventario</h1>
      <p class="view-subtitle">Existencias actuales en almacén y registro de entradas.</p>

      <div id="inventario-alerta" aria-live="polite"></div>

      <section class="detalle-seccion" aria-label="Existencias">
        <h2 class="detalle-titulo">Existencias</h2>
        <div id="tabla-inventario">
          <p class="cargando">Cargando inventario...</p>
        </div>
      </section>

      <form class="inventario-form" id="form-entrada" novalidate>
        <h2 class="detalle-titulo">Registrar entrada</h2>
        <div id="form-entrada-alerta" aria-live="polite"></div>

        <div class="inventario-grid">
          <div class="form-campo">
            <label class="form-label" for="input-tipo">Tipo de prenda</label>
            <select class="form-input" id="input-tipo">
              <option value="">Selecciona el tipo</option>
              <option value="escafandra">Escafandra</option>
              <option value="pantalon">Pantalón</option>
              <option value="playera">Playera</option>
              <option value="botas">Botas</option>
            </select>
          </div>

          <div class="form-campo" id="campo-color">
            <label class="form-label" for="input-color">Color</label>
            <select class="form-input" id="input-color">
              <option value="">Selecciona el color</option>
              ${COLORES.map((color) => `<option value="${color}">${escapar(ETIQUETAS_COLOR[color])}</option>`).join('')}
            </select>
          </div>

          <div class="form-campo" id="campo-talla">
            <label class="form-label" for="input-talla">Talla</label>
            <select class="form-input" id="input-talla">
              <option value="">Selecciona la talla</option>
            </select>
          </div>

          <div class="form-campo">
            <label class="form-label" for="input-cantidad">Cantidad</label>
            <input
              type="number"
              class="form-input"
              id="input-cantidad"
              min="1"
              step="1"
              placeholder="Ej. 5"
            />
          </div>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-registrar-entrada">
            Registrar entrada
          </button>
        </div>
      </form>
    </section>
  `;

  container.querySelector('#btn-volver-inventario').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  const campoColor = container.querySelector('#campo-color');
  const campoTalla = container.querySelector('#campo-talla');
  const selectTalla = container.querySelector('#input-talla');
  const alertaForm = container.querySelector('#form-entrada-alerta');
  const botonRegistrar = container.querySelector('#btn-registrar-entrada');

  const inputTipo = container.querySelector('#input-tipo');
  const inputColor = container.querySelector('#input-color');
  const inputCantidad = container.querySelector('#input-cantidad');

  inputTipo.addEventListener('change', () => {
    const tipo = inputTipo.value;

    if (tipo === 'botas') {
      campoColor.hidden = true;
      campoTalla.hidden = false;
      selectTalla.innerHTML =
        '<option value="">Selecciona la talla</option>' +
        TALLAS_BOTAS.map((talla) => `<option value="${talla}">${talla}</option>`).join('');
      return;
    }

    if (tipo === 'escafandra') {
      campoColor.hidden = false;
      campoTalla.hidden = true;
      selectTalla.innerHTML = '';
      return;
    }

    if (tipo === 'pantalon' || tipo === 'playera') {
      campoColor.hidden = false;
      campoTalla.hidden = false;
      selectTalla.innerHTML =
        '<option value="">Selecciona la talla</option>' +
        TALLAS_ROPA.map((talla) => `<option value="${talla}">${talla}</option>`).join('');
      return;
    }

    campoColor.hidden = true;
    campoTalla.hidden = true;
    selectTalla.innerHTML = '';
  });

  async function renderTabla() {
    const caja = container.querySelector('#tabla-inventario');
    const { data, error } = await obtenerInventario();

    if (error) {
      caja.innerHTML = `
        <div class="alert alert-danger">${escapar(error.message)}</div>
        <button type="button" class="btn btn-outline btn-compacto" id="btn-reintentar-inventario">
          Reintentar
        </button>
      `;
      return;
    }

    caja.innerHTML = htmlTabla(data ?? []);
  }

  container.querySelector('#tabla-inventario').addEventListener('click', (event) => {
    if (event.target.closest('#btn-reintentar-inventario')) {
      renderTabla();
    }
  });

  async function registrar(event) {
    event.preventDefault();

    const tipo = inputTipo.value;
    const color = campoColor.hidden ? null : (inputColor.value || null);
    const talla =
      tipo === 'escafandra'
        ? 'unica'
        : (campoTalla.hidden ? null : (selectTalla.value || null));
    const cantidad = container.querySelector('#input-cantidad').value;
    const cantNumerica = parseInt(cantidad, 10);

    alertaForm.innerHTML = '';

    if (!tipo) {
      alertaForm.innerHTML = '<div class="alert alert-danger">Selecciona el tipo de prenda.</div>';
      return;
    }

    if (tipo !== 'botas' && !color) {
      alertaForm.innerHTML = '<div class="alert alert-danger">Selecciona el color.</div>';
      return;
    }

    if (tipo === 'pantalon' || tipo === 'playera' || tipo === 'botas') {
      if (!talla) {
        alertaForm.innerHTML = '<div class="alert alert-danger">Selecciona la talla.</div>';
        return;
      }
    }

    if (isNaN(cantNumerica) || cantNumerica <= 0) {
      alertaForm.innerHTML =
        '<div class="alert alert-danger">La cantidad debe ser un número entero mayor a 0.</div>';
      return;
    }

    botonRegistrar.disabled = true;
    botonRegistrar.textContent = 'Registrando...';

    const { data, error } = await registrarEntrada({
      prendaTipo: tipo,
      prendaColor: color,
      prendaTalla: talla,
      cantidad: cantNumerica,
    });

    botonRegistrar.disabled = false;
    botonRegistrar.textContent = 'Registrar entrada';

    if (error) {
      alertaForm.innerHTML = `<div class="alert alert-danger">${escapar(error.message)}</div>`;
      return;
    }

    alertaForm.innerHTML = `<div class="alert alert-success">Entrada registrada. Nueva cantidad: ${data?.nueva_cantidad ?? ''}.</div>`;
    inputColor.value = '';
    selectTalla.value = '';
    inputCantidad.value = '';

    await renderTabla();
  }

  container.querySelector('#form-entrada').addEventListener('submit', registrar);

  renderTabla();
}
