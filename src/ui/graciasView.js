export function initGraciasView(container, { onVolver } = {}) {
  container.innerHTML = `
    <section class="gracias-view" aria-labelledby="gracias-title">
      <span class="gracias-check" aria-hidden="true">&#10003;</span>
      <h1 class="gracias-title" id="gracias-title">¡Gracias!</h1>
      <p class="gracias-subtitulo">
        Recepción confirmada. Tu petición quedó registrada como <strong>Entregada</strong>.
      </p>
      <button type="button" class="btn btn-primary gracias-volver">
        Volver a Mis peticiones
      </button>
    </section>
  `;

  container.querySelector('.gracias-volver').addEventListener('click', () => {
    if (typeof onVolver === 'function') onVolver();
  });
}
