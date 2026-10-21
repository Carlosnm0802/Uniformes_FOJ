import { crearPeticion } from '../data/api.js';

const MOTIVOS = [
  { valor: 'suciedad', etiqueta: 'Suciedad' },
  { valor: 'daño', etiqueta: 'Daño' },
  { valor: 'talla', etiqueta: 'Talla' },
  { valor: 'otro', etiqueta: 'Otro' },
];

const TIPOS = [
  { valor: 'escafandra', etiqueta: 'Escafandra' },
  { valor: 'pantalon', etiqueta: 'Pantalón' },
  { valor: 'playera', etiqueta: 'Playera' },
  { valor: 'botas', etiqueta: 'Botas' },
];

const COLORES = ['rojo', 'verde', 'rosa', 'azul', 'morado', 'gris'];
const TALLAS_ROPA = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'];
const TALLAS_BOTAS = ['22', '23', '24', '25', '26', '27', '28', '29', '30', '31'];

const ETIQUETAS_COLOR = {
  rojo: 'Rojo',
  verde: 'Verde',
  rosa: 'Rosa',
  azul: 'Azul',
  morado: 'Morado',
  gris: 'Gris',
};

function opciones(items, seleccionado) {
  return items
    .map((item) => {
      const valor = typeof item === 'string' ? item : item.valor;
      const etiqueta = typeof item === 'string' ? ETIQUETAS_COLOR[item] || item : item.etiqueta;
      return `<option value="${valor}" ${valor === seleccionado ? 'selected' : ''}>${etiqueta}</option>`;
    })
    .join('');
}

export function initNuevaPeticionView(container, { onCancel, onSuccess } = {}) {
  let contador = 0;
  const lineas = [];

  function nuevaLinea() {
    contador += 1;
    return { id: contador, tipo: 'playera', color: 'rojo', talla: 'M' };
  }

  function normalizarLinea(linea) {
    if (linea.tipo === 'escafandra') {
      linea.talla = 'unica';
      if (!COLORES.includes(linea.color)) linea.color = 'rojo';
    } else if (linea.tipo === 'botas') {
      linea.color = null;
      if (!TALLAS_BOTAS.includes(linea.talla)) linea.talla = '22';
    } else {
      if (!COLORES.includes(linea.color)) linea.color = 'rojo';
      if (!TALLAS_ROPA.includes(linea.talla)) linea.talla = 'M';
    }
  }

  function htmlLinea(linea, index) {
    const mostrarColor = linea.tipo !== 'botas';
    const mostrarTalla = linea.tipo !== 'escafandra';
    const tallas = linea.tipo === 'botas' ? TALLAS_BOTAS : TALLAS_ROPA;

    return `
      <div class="linea-card" data-linea-id="${linea.id}">
        <div class="linea-header">
          <span class="linea-title">Prenda ${index + 1}</span>
          <button
            type="button"
            class="btn-eliminar-linea"
            data-accion="eliminar"
            ${lineas.length === 1 ? 'disabled' : ''}
          >
            Eliminar
          </button>
        </div>

        <div class="linea-grid">
          <div class="form-group">
            <label class="form-label" for="tipo-${linea.id}">Tipo</label>
            <select id="tipo-${linea.id}" class="form-input" data-campo="tipo">
              ${opciones(TIPOS, linea.tipo)}
            </select>
          </div>

          ${
            mostrarColor
              ? `
            <div class="form-group">
              <label class="form-label" for="color-${linea.id}">Color</label>
              <select id="color-${linea.id}" class="form-input" data-campo="color">
                ${opciones(COLORES, linea.color)}
              </select>
            </div>
          `
              : `
            <div class="form-group">
              <span class="form-label">Color</span>
              <div class="form-static">Sin color</div>
            </div>
          `
          }

          ${
            mostrarTalla
              ? `
            <div class="form-group">
              <label class="form-label" for="talla-${linea.id}">Talla</label>
              <select id="talla-${linea.id}" class="form-input" data-campo="talla">
                ${opciones(tallas, linea.talla)}
              </select>
            </div>
          `
              : `
            <div class="form-group">
              <span class="form-label">Talla</span>
              <div class="form-static">Única</div>
            </div>
          `
          }
        </div>
      </div>
    `;
  }

  function mostrarAlerta(boxId, mensaje, tipo) {
    const box = container.querySelector(`#${boxId}`);
    if (!box) return;

    box.innerHTML = '';
    if (!mensaje) return;

    const alerta = document.createElement('div');
    alerta.className = `alert alert-${tipo}`;
    alerta.textContent = mensaje;
    box.appendChild(alerta);
  }

  function actualizarAdvertencia() {
    const motivo = container.querySelector('#motivo-select').value;
    const hayEscafandra = lineas.some((linea) => linea.tipo === 'escafandra');
    const bloquea = motivo === 'talla' && hayEscafandra;

    mostrarAlerta(
      'form-warning',
      bloquea
        ? 'El motivo "Talla" no aplica a la escafandra porque es de talla única. Cambia el motivo o elimina esa prenda.'
        : '',
      'warning'
    );

    return bloquea;
  }

  function renderLineas() {
    const contenedor = container.querySelector('#lineas-container');
    if (!contenedor) return;
    contenedor.innerHTML = lineas.map(htmlLinea).join('');
  }

  function renderFormulario() {
    container.innerHTML = `
      <section class="peticion-view" aria-labelledby="nueva-peticion-title">
        <div class="view-header">
          <h1 class="view-title" id="nueva-peticion-title">Nueva petición</h1>
          <p class="view-subtitle">
            Elige las prendas, el motivo y la ventana en la que puedes acudir a recogerlas.
          </p>
        </div>

        <div id="form-warning" aria-live="polite"></div>
        <div id="form-error" aria-live="assertive"></div>

        <form id="peticion-form" novalidate>
          <div class="form-grid">
            <div class="form-group form-group-full">
              <label class="form-label" for="motivo-select">Motivo</label>
              <select id="motivo-select" class="form-input" required>
                ${opciones(MOTIVOS, 'suciedad')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="ventana-inicio">Inicio de la ventana</label>
              <input type="datetime-local" id="ventana-inicio" class="form-input" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="ventana-fin">Fin de la ventana</label>
              <input type="datetime-local" id="ventana-fin" class="form-input" required />
            </div>
          </div>

          <div class="seccion-lineas">
            <div class="seccion-lineas-header">
              <h2 class="seccion-titulo">Prendas</h2>
              <button type="button" class="btn-agregar-linea" id="btn-agregar-linea">
                + Añadir prenda
              </button>
            </div>
            <div id="lineas-container" class="lineas-container"></div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" id="btn-crear-peticion">
              Enviar petición
            </button>
            <button type="button" class="btn btn-outline" id="btn-cancelar-peticion">
              Cancelar
            </button>
          </div>
        </form>
      </section>
    `;
  }

  function conectarEventos() {
    const lineasContainer = container.querySelector('#lineas-container');

    container.querySelector('#motivo-select').addEventListener('change', () => {
      mostrarAlerta('form-error', '', 'danger');
      actualizarAdvertencia();
    });

    container.querySelector('#btn-agregar-linea').addEventListener('click', () => {
      lineas.push(nuevaLinea());
      renderLineas();
      actualizarAdvertencia();
      mostrarAlerta('form-error', '', 'danger');

      const ultimoTipo = lineasContainer.querySelector(
        '.linea-card:last-child select[data-campo="tipo"]'
      );
      if (ultimoTipo) ultimoTipo.focus();
    });

    lineasContainer.addEventListener('change', (event) => {
      const select = event.target.closest('select[data-campo]');
      if (!select) return;

      const card = select.closest('[data-linea-id]');
      const linea = lineas.find((item) => item.id === Number(card.dataset.lineaId));
      if (!linea) return;

      const campo = select.dataset.campo;

      if (campo === 'tipo') {
        linea.tipo = select.value;
        normalizarLinea(linea);
      } else if (campo === 'color') {
        linea.color = select.value;
      } else if (campo === 'talla') {
        linea.talla = select.value;
      }

      mostrarAlerta('form-error', '', 'danger');
      renderLineas();
      actualizarAdvertencia();
    });

    lineasContainer.addEventListener('click', (event) => {
      const boton = event.target.closest('[data-accion="eliminar"]');
      if (!boton || lineas.length === 1) return;

      const card = boton.closest('[data-linea-id]');
      const indice = lineas.findIndex((item) => item.id === Number(card.dataset.lineaId));
      if (indice < 0) return;

      lineas.splice(indice, 1);
      mostrarAlerta('form-error', '', 'danger');
      renderLineas();
      actualizarAdvertencia();
    });

    container.querySelector('#btn-cancelar-peticion').addEventListener('click', () => {
      if (typeof onCancel === 'function') onCancel();
    });

    container.querySelector('#peticion-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      mostrarAlerta('form-error', '', 'danger');

      if (actualizarAdvertencia()) return;

      const motivo = container.querySelector('#motivo-select').value;
      const inicioValor = container.querySelector('#ventana-inicio').value;
      const finValor = container.querySelector('#ventana-fin').value;

      if (!inicioValor || !finValor) {
        mostrarAlerta('form-error', 'Indica la fecha y hora de inicio y fin de la ventana.', 'danger');
        return;
      }

      const inicio = new Date(inicioValor);
      const fin = new Date(finValor);

      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
        mostrarAlerta('form-error', 'La ventana indicada no es válida.', 'danger');
        return;
      }

      if (fin < inicio) {
        mostrarAlerta('form-error', 'La fecha de fin no puede ser anterior a la de inicio.', 'danger');
        return;
      }

      if (lineas.length === 0) {
        mostrarAlerta('form-error', 'Añade al menos una prenda a la petición.', 'danger');
        return;
      }

      const lineasPayload = lineas.map((linea) => ({
        prenda_tipo: linea.tipo,
        prenda_color: linea.tipo === 'botas' ? null : linea.color,
        prenda_talla: linea.tipo === 'escafandra' ? 'unica' : linea.talla,
      }));

      const boton = container.querySelector('#btn-crear-peticion');
      boton.disabled = true;
      boton.innerHTML = '<span class="spinner"></span> Enviando...';

      const { data, error } = await crearPeticion({
        motivo,
        ventanaInicio: inicio.toISOString(),
        ventanaFin: fin.toISOString(),
        lineas: lineasPayload,
      });

      boton.disabled = false;
      boton.textContent = 'Enviar petición';

      if (error) {
        mostrarAlerta('form-error', error.message, 'danger');
        return;
      }

      if (typeof onSuccess === 'function') onSuccess(data);
    });
  }

  lineas.push(nuevaLinea());
  renderFormulario();
  renderLineas();
  conectarEventos();
  actualizarAdvertencia();
}
