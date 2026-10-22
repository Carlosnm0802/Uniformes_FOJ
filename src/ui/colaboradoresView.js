import { importarColaboradores, obtenerColaboradores } from '../data/api.js';
import { leerColaboradores } from '../data/leerColaboradores.js';
import { escapar } from './formato.js';

const FILAS_VISTA_PREVIA = 10;

function contarDuplicados(filas) {
  const vistos = new Set();
  let duplicados = 0;

  filas.forEach((fila) => {
    if (!fila.sap) return;
    if (vistos.has(fila.sap)) {
      duplicados += 1;
      return;
    }
    vistos.add(fila.sap);
  });

  return duplicados;
}

function esValida(fila) {
  return /^\d{6,9}$/.test(fila.sap) && fila.nombre !== '';
}

function parejasUnicas(filas) {
  const unicas = [];
  const vistos = new Set();

  filas.forEach((fila) => {
    if (fila.sap && !vistos.has(fila.sap)) {
      vistos.add(fila.sap);
      unicas.push(fila);
    }
  });

  return unicas;
}

function htmlPantallaInicio() {
  return `
    <form id="form-importar" novalidate>
      <label class="form-label" for="input-archivo">Archivo de colaboradores</label>
      <input
        type="file"
        class="form-input"
        id="input-archivo"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv"
      />
      <p class="texto-ayuda">
        Solo se leen las primeras dos columnas: SAP y nombre. Las demás columnas del archivo se descartan.
      </p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" id="btn-analizar" disabled>
          Analizar archivo
        </button>
      </div>
    </form>
  `;
}

function htmlVistaPrevia({ nombreArchivo, resultados, unicas, duplicados }) {
  const muestra = unicas.slice(0, FILAS_VISTA_PREVIA);
  const restantes = unicas.length - muestra.length;

  return `
    <form id="form-confirmar" novalidate>
      <section class="detalle-seccion" aria-label="Resumen del archivo">
        <h2 class="detalle-titulo">${escapar(nombreArchivo)}</h2>
        <ul class="resumen-importar">
          <li>Filas leídas: <strong>${resultados.leidas}</strong></li>
          <li>Colaboradores únicos: <strong>${unicas.length}</strong></li>
          <li>Duplicados internos a omitir: <strong>${duplicados}</strong></li>
        </ul>

        <div class="tabla-inventario-cinta">
          <table class="tabla-inventario">
            <thead>
              <tr>
                <th>SAP</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              ${muestra
                .map(
                  (fila) => `
                <tr>
                  <td>${escapar(fila.sap)}</td>
                  <td>${escapar(fila.nombre)}</td>
                </tr>
              `
                )
                .join('')}
              ${
                restantes > 0
                  ? `<tr><td colspan="2" class="fila-restantes">… ${restantes} filas más</td></tr>`
                  : ''
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="form-actions">
        <button type="button" class="btn btn-outline" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btn-confirmar-importar">
          Importar colaboradores
        </button>
      </div>
    </form>
  `;
}

function htmlFilasLista(colaboradores, filtro) {
  const filtroLimpio = filtro.trim().toLowerCase();
  return colaboradores
    .filter(
      (colaborador) =>
        !filtroLimpio ||
        colaborador.sap.includes(filtroLimpio) ||
        colaborador.nombre.toLowerCase().includes(filtroLimpio)
    )
    .map(
      (colaborador) => `
      <tr>
        <td>${escapar(colaborador.sap)}</td>
        <td>${escapar(colaborador.nombre)}</td>
        <td>
          <span class="badge-estado badge-pin-${colaborador.pin_pendiente ? 'pendiente' : 'registrada'}">
            ${colaborador.pin_pendiente ? 'PIN pendiente' : 'PIN registrado'}
          </span>
        </td>
        <td>
          ${
            colaborador.bloqueado
              ? '<span class="badge-estado badge-pin-bloqueada">Bloqueado</span>'
              : '—'
          }
        </td>
      </tr>
    `
    )
    .join('');
}

export function initColaboradoresView(container, { onVolver } = {}) {
  container.innerHTML = `
    <section class="peticion-view colaboradores-view" aria-labelledby="colaboradores-title">
      <button type="button" class="btn-volver" id="btn-volver-colaboradores">
        &lsaquo; Volver al inicio
      </button>

      <h1 class="view-title" id="colaboradores-title">Colaboradores</h1>
      <p class="view-subtitle">
        Carga del Excel de planta (SAP y nombre) para habilitar el primer acceso.
      </p>

      <div id="importar-alerta" aria-live="polite"></div>
      <div id="colaboradores-contenido"></div>

      <section class="detalle-seccion lista-colaboradores" aria-label="Colaboradores habilitados">
        <h2 class="detalle-titulo">Colaboradores habilitados</h2>
        <input
          type="search"
          class="form-input lista-colaboradores-buscador"
          id="buscar-colaboradores"
          placeholder="Buscar por SAP o nombre..."
        />
        <p class="lista-colaboradores-conteo" id="lista-colaboradores-conteo"></p>
        <div id="lista-colaboradores-contenido">
          <p class="cargando">Cargando colaboradores...</p>
        </div>
      </section>
    </section>
  `;

  container.querySelector('#btn-volver-colaboradores').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  const contenido = container.querySelector('#colaboradores-contenido');
  const alerta = container.querySelector('#importar-alerta');
  let filasValidas = null;

  alerta.innerHTML = '';

  contenido.innerHTML = htmlPantallaInicio();

  const inputArchivo = contenido.querySelector('#input-archivo');
  const botonAnalizar = contenido.querySelector('#btn-analizar');

  inputArchivo.addEventListener('change', () => {
    botonAnalizar.disabled = inputArchivo.files.length === 0;
    alerta.innerHTML = '';
  });

  async function vistaPrevia(event) {
    event.preventDefault();

    const archivo = inputArchivo.files[0];
    if (!archivo) {
      alerta.innerHTML = '<div class="alert alert-danger">Selecciona un archivo.</div>';
      return;
    }

    botonAnalizar.disabled = true;
    botonAnalizar.textContent = 'Analizando...';

    let resultados;
    try {
      resultados = await leerColaboradores(archivo);
    } catch (err) {
      botonAnalizar.disabled = false;
      botonAnalizar.textContent = 'Analizar archivo';
      alerta.innerHTML = `<div class="alert alert-danger">${escapar(err.message)}</div>`;
      return;
    }

    if (resultados.leidas === 0) {
      botonAnalizar.disabled = false;
      botonAnalizar.textContent = 'Analizar archivo';
      alerta.innerHTML =
        '<div class="alert alert-danger">El archivo no contiene filas con SAP o nombre.</div>';
      return;
    }

    const duplicados = contarDuplicados(resultados.filas);
    filasValidas = parejasUnicas(resultados.filas).filter(esValida);

    alerta.innerHTML = '';
    botonAnalizar.disabled = false;
    botonAnalizar.textContent = 'Analizar archivo';

    contenido.innerHTML = htmlVistaPrevia({
      nombreArchivo: archivo.name,
      resultados,
      unicas: filasValidas,
      duplicados,
    });

    const botonCancelar = contenido.querySelector('#btn-cancelar');
    botonCancelar.addEventListener('click', () => initColaboradoresView(container, { onVolver }));

    const formConfirmar = contenido.querySelector('#form-confirmar');
    formConfirmar.addEventListener('submit', (eventoConfirmar) => {
      eventoConfirmar.preventDefault();
      confirmar();
    });
  }

  async function confirmar() {
    const boton = contenido.querySelector('#btn-confirmar-importar');
    boton.disabled = true;
    boton.textContent = 'Importando...';

    const { data, error } = await importarColaboradores(filasValidas);

    if (error) {
      alerta.innerHTML = `
        <div class="alert alert-danger">${escapar(error.message)}</div>
        <button type="button" class="btn btn-outline btn-compacto" id="btn-reintentar-importar">
          Reintentar
        </button>
      `;
      boton.disabled = false;
      boton.textContent = 'Importar colaboradores';
      alerta.querySelector('#btn-reintentar-importar').addEventListener('click', confirmar);
      return;
    }

    alerta.innerHTML = `
      <div class="alert alert-success">
        Importación lista: <strong>${data?.creados ?? 0}</strong> creados,
        <strong>${data?.omitidos ?? 0}</strong> omitidos.
      </div>
      <button type="button" class="btn btn-primary" id="btn-importar-otro">
        Importar otro archivo
      </button>
    `;

    contenido.innerHTML = '';
    filasValidas = null;

    container.querySelector('#btn-importar-otro').addEventListener('click', () => {
      initColaboradoresView(container, { onVolver });
    });

    await pintarLista();
  }

  contenido.querySelector('#form-importar').addEventListener('submit', vistaPrevia);

  const cajaLista = container.querySelector('#lista-colaboradores-contenido');
  const conteoLista = container.querySelector('#lista-colaboradores-conteo');
  const busqueda = container.querySelector('#buscar-colaboradores');
  let colaboradores = [];

  function pintarTablaLista() {
    if (!colaboradores.length) {
      cajaLista.innerHTML = '<p class="lista-vacia">Aún no hay colaboradores en el censo.</p>';
      conteoLista.textContent = '';
      return;
    }

    const filtro = busqueda.value;
    const filtroLimpio = filtro.trim();
    const visibles = colaboradores.filter(
      (c) =>
        !filtroLimpio ||
        c.sap.indexOf(filtroLimpio) !== -1 ||
        c.nombre.toLowerCase().indexOf(filtroLimpio.toLowerCase()) !== -1
    );

    conteoLista.textContent = `Mostrando ${visibles.length} de ${colaboradores.length} colaboradores`;
    cajaLista.innerHTML = `
      <div class="tabla-inventario-cinta">
        <table class="tabla-inventario">
          <thead>
            <tr>
              <th>SAP</th>
              <th>Nombre</th>
              <th>Estado del acceso</th>
              <th>Bloqueo</th>
            </tr>
          </thead>
          <tbody>${htmlFilasLista(colaboradores, filtro)}</tbody>
        </table>
      </div>
    `;
  }

  async function pintarLista() {
    cajaLista.innerHTML = '<p class="cargando">Cargando colaboradores...</p>';

    const { data, error } = await obtenerColaboradores();
    if (error) {
      cajaLista.innerHTML = `
        <div class="alert alert-danger">${escapar(error.message)}</div>
        <button type="button" class="btn btn-outline btn-compacto" id="btn-reintentar-lista">
          Reintentar
        </button>
      `;
      conteoLista.textContent = '';
      cajaLista.querySelector('#btn-reintentar-lista').addEventListener('click', pintarLista);
      return;
    }
    colaboradores = data ?? [];
    pintarTablaLista();
  }

  busqueda.addEventListener('input', pintarTablaLista);
  pintarLista();
}
