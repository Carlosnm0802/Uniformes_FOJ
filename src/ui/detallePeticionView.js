import { obtenerDetallePeticion } from '../data/api.js';
import { escapar, formatearFecha, etiquetaEstado, describirLinea } from './formato.js';

function htmlPeticion(peticion) {
  const confirmada = Boolean(peticion.recepcion_confirmada);

  return `
    <p class="detalle-datos-cabecera">
      <span class="badge-estado badge-estado--${peticion.estado}">
        ${escapar(etiquetaEstado(peticion.estado))}
      </span>
      <span class="peticion-fecha">Creada el ${formatearFecha(peticion.creada_en)}</span>
    </p>

    ${
      peticion.estado === 'entregada' && peticion.sin_devolucion
        ? '<div class="alert alert-warning">Esta entrega no registró devolución de prendas.</div>'
        : ''
    }

    ${
      peticion.estado === 'rechazada'
        ? `<div class="alert alert-danger">Motivo del rechazo: ${escapar(peticion.motivo_rechazo ?? '')}</div>`
        : ''
    }

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
      confirmada
        ? '<div class="alert alert-success">Confirmaste la recepción de esta entrega.</div>'
        : ''
    }

    ${
      peticion.estado === 'entregada' && !confirmada
        ? `<div class="detalle-acciones">
            <button type="button" class="btn btn-primary" id="btn-confirmar-recepcion">
              Confirmar recepción
            </button>
          </div>`
        : ''
    }
  `;
}

export function initDetallePeticionView(container, { peticionId, onVolver } = {}) {
  container.innerHTML = `
    <section class="peticion-view detalle-peticion-view" aria-labelledby="detalle-title">
      <button type="button" class="btn-volver" id="btn-volver-detalle">
        &lsaquo; Volver a Mis peticiones
      </button>

      <h1 class="view-title" id="detalle-title">Detalle de la petición</h1>

      <div id="detalle-alerta" aria-live="polite"></div>
      <div id="detalle-contenido" class="detalle-contenido">
        <p class="cargando">Cargando detalle...</p>
      </div>
    </section>
  `;

  container.querySelector('#btn-volver-detalle').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });

  function render() {
    const contenido = container.querySelector('#detalle-contenido');
    const alerta = container.querySelector('#detalle-alerta');

    async function cargar() {
      contenido.innerHTML = '<p class="cargando">Cargando detalle...</p>';
      alerta.innerHTML = '';

      const { data, error } = await obtenerDetallePeticion(peticionId);

      if (error) {
        contenido.innerHTML = `
          <div class="alert alert-danger">${escapar(error.message)}</div>
          <button type="button" class="btn btn-outline" id="btn-reintentar-detalle">
            Reintentar
          </button>
        `;
        return;
      }

      contenido.innerHTML = htmlPeticion(data);
    }

    contenido.addEventListener('click', async (event) => {
      if (event.target.closest('#btn-reintentar-detalle')) {
        await cargar();
        return;
      }

      if (event.target.closest('#btn-confirmar-recepcion')) {
        alerta.innerHTML =
          '<div class="alert alert-warning">La confirmación de recepción estará disponible próximamente.</div>';
      }
    });

    return cargar();
  }

  render();
}
