// src/app.js
// Punto de entrada principal de la aplicación Uniformes FOJ.
// Controla el enrutamiento básico, sesiones activas, header y redirección por rol.

import { initAuthView, cerrarSesion } from './ui/authView.js';
import { initNuevaPeticionView } from './ui/nuevaPeticionView.js';
import { initMisPeticionesView } from './ui/misPeticionesView.js';
import { initDetallePeticionView } from './ui/detallePeticionView.js';
import { verificarSesion, obtenerUsuario } from './data/session.js';

const appContainer = document.getElementById('app-container');
const headerContainer = document.getElementById('header-container');

/**
 * Actualiza el encabezado global según el estado de la sesión.
 */
function renderHeader() {
  const sesionValida = verificarSesion();
  const usuario = obtenerUsuario();

  if (!sesionValida || !usuario) {
    headerContainer.innerHTML = `
      <header class="app-header">
        <div class="app-brand">
          <span>Nestlé Uniformes</span>
          <span class="brand-badge">FOJ</span>
        </div>
      </header>
    `;
    return;
  }

  headerContainer.innerHTML = `
    <header class="app-header">
      <div class="app-brand">
        <span>Nestlé Uniformes</span>
        <span class="brand-badge">${usuario.rol === 'colaborador' ? 'Colaborador' : 'Gestión'}</span>
      </div>
      <div class="user-nav">
        <div class="user-info">
          <div class="user-name">${usuario.nombre}</div>
          <div class="user-role">${usuario.rol} · SAP ${usuario.sap}</div>
        </div>
        <button class="btn btn-outline" id="btn-logout" style="min-height: 36px; padding: 6px 14px; font-size: 0.85rem; width: auto;">
          Cerrar sesión
        </button>
      </div>
    </header>
  `;

  const btnLogout = headerContainer.querySelector('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      cerrarSesion(() => {
        navegarALogin();
      });
    });
  }
}

/**
 * Renderiza la vista inicial o dashboard según el rol del usuario autenticado.
 * Módulo del colaborador conectado (Tickets 14 y 15); gestión Admin/RH conectará con los Tickets 17/18.
 */
function renderDashboard(usuario) {
  renderHeader();

  const esAdminORh = usuario.rol === 'administrador' || usuario.rol === 'rh';

  appContainer.innerHTML = `
    <div class="dashboard-view" id="dashboard-view">
      <div style="margin-bottom: 20px;">
        <span style="font-size: 3rem;">👋</span>
      </div>
      <h2 style="margin-bottom: 8px;">¡Bienvenido, ${usuario.nombre}!</h2>
      <p style="color: var(--text-muted); margin-bottom: 24px;">
        Sesión iniciada correctamente como <strong>${usuario.rol}</strong> (SAP: ${usuario.sap}).
      </p>

      <div style="background-color: var(--primary-light); padding: 16px; border-radius: 8px; margin-bottom: 24px; text-align: left;">
        <div style="font-weight: 600; color: var(--primary); margin-bottom: 6px;">
          ${esAdminORh ? 'Panel de Administración y RH' : 'Portal de Solicitudes de Colaborador'}
        </div>
        <p style="font-size: 0.9rem; color: var(--primary);">
          ${
            esAdminORh
              ? 'Módulo de gestión de solicitudes, inventario y bitácora de planta.'
              : 'Aquí podrás solicitar cambios de uniforme por desgaste o daño y revisar tus peticiones.'
          }
        </p>
      </div>

      <div class="dashboard-actions">
        ${
          !esAdminORh
            ? `<button class="btn btn-primary" id="btn-nueva-peticion">Nueva petición</button>
               <button class="btn btn-outline" id="btn-mis-peticiones">Mis peticiones</button>`
            : ''
        }
        <button class="btn btn-outline" id="btn-dashboard-logout">
          Cerrar sesión
        </button>
      </div>
    </div>
  `;

  const btnNuevaPeticion = appContainer.querySelector('#btn-nueva-peticion');
  if (btnNuevaPeticion) {
    btnNuevaPeticion.addEventListener('click', () => {
      navegarANuevaPeticion(usuario);
    });
  }

  const btnMisPeticiones = appContainer.querySelector('#btn-mis-peticiones');
  if (btnMisPeticiones) {
    btnMisPeticiones.addEventListener('click', () => {
      navegarAMisPeticiones(usuario);
    });
  }

  const btnLogout = appContainer.querySelector('#btn-dashboard-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      cerrarSesion(() => {
        navegarALogin();
      });
    });
  }
}

/**
 * Muestra el formulario de creación de una nueva petición.
 */
function navegarANuevaPeticion(usuario) {
  renderHeader();
  initNuevaPeticionView(appContainer, {
    onCancel: () => renderDashboard(usuario),
    onSuccess: () => navegarAMisPeticiones(usuario),
  });
}

/**
 * Lista "Mis peticiones" del colaborador con filtros por estado
 * y navegación al detalle de cada petición (Ticket 15).
 */
function navegarAMisPeticiones(usuario) {
  renderHeader();
  initMisPeticionesView(appContainer, {
    onVolver: () => renderDashboard(usuario),
    onNuevaPeticion: () => navegarANuevaPeticion(usuario),
    onAbrirDetalle: (peticionId) => renderDetallePeticion(peticionId),
  });
}

/**
 * Detalle de una petición del colaborador, con el botón de
 * confirmación de recepción como marcador (acción real en el Ticket 16).
 */
function renderDetallePeticion(peticionId) {
  renderHeader();
  initDetallePeticionView(appContainer, {
    peticionId,
    onVolver: () => navegarAMisPeticiones(obtenerUsuario()),
  });
}

/**
 * Muestra la pantalla de login.
 */
function navegarALogin() {
  renderHeader();
  initAuthView(appContainer, (usuario) => {
    // Login exitoso -> redirige según rol
    renderDashboard(usuario);
  });
}

/**
 * Inicializador de la aplicación web.
 */
function initApp() {
  renderHeader();

  if (verificarSesion()) {
    const usuario = obtenerUsuario();
    if (usuario) {
      renderDashboard(usuario);
      return;
    }
  }

  navegarALogin();
}

// Iniciar aplicación al cargar el DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
