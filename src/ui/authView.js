// src/ui/authView.js
// Pantalla de acceso, primer acceso (crear PIN), cierre de sesión y control de conectividad.
// Ticket 13: UI colaborador y administrador (acceso y cerrar sesión).

import { login, crearPin } from '../data/api.js';
import { borrarSesion, obtenerUsuario, verificarSesion } from '../data/session.js';

/**
 * Inicializa la vista de autenticación en el contenedor especificado.
 * @param {HTMLElement} container - Contenedor principal de la app
 * @param {Function} onLoginSuccess - Callback invocado tras login exitoso: (usuario) => void
 */
export function initAuthView(container, onLoginSuccess) {
  // Manejo de estado de conectividad en tiempo real
  function actualizarEstadoConexion() {
    const offlineBanner = document.getElementById('offline-banner');
    const estaOffline = !navigator.onLine;

    if (offlineBanner) {
      if (estaOffline) {
        offlineBanner.classList.add('visible');
        offlineBanner.textContent = 'Sin conexión a internet. La aplicación requiere conexión para operar.';
      } else {
        offlineBanner.classList.remove('visible');
      }
    }

    // Bloquear o desbloquear formularios activos si no hay conexión
    const inputs = container.querySelectorAll('input, button');
    inputs.forEach((el) => {
      if (el.id !== 'btn-logout') {
        el.disabled = estaOffline;
      }
    });
  }

  window.removeEventListener('online', actualizarEstadoConexion);
  window.removeEventListener('offline', actualizarEstadoConexion);
  window.addEventListener('online', actualizarEstadoConexion);
  window.addEventListener('offline', actualizarEstadoConexion);

  // Renderizar la vista de Login estándar
  function renderLoginForm(mensajeError = null) {
    container.innerHTML = `
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-title">Control de Uniformes</h1>
          <p class="auth-subtitle">Ingresa con tu número SAP y tu PIN de 4 dígitos</p>
        </div>

        <div id="auth-alert-container">
          ${
            mensajeError
              ? `<div class="alert alert-danger" id="login-error">${mensajeError}</div>`
              : ''
          }
        </div>

        <form id="login-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="sap-input">Número SAP</label>
            <input 
              type="text" 
              id="sap-input" 
              name="sap" 
              class="form-input" 
              inputmode="numeric" 
              placeholder="Ej: 10000001" 
              autocomplete="username" 
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="pin-input">PIN de seguridad</label>
            <input 
              type="password" 
              id="pin-input" 
              name="pin" 
              class="form-input" 
              inputmode="numeric" 
              maxlength="4" 
              pattern="[0-9]{4}" 
              placeholder="••••" 
              autocomplete="current-password" 
              required
            />
            <div class="form-hint">4 dígitos numéricos</div>
          </div>

          <button type="submit" class="btn btn-primary" id="btn-submit-login">
            Ingresar
          </button>
        </form>
      </div>
    `;

    actualizarEstadoConexion();

    const form = container.querySelector('#login-form');
    const sapInput = container.querySelector('#sap-input');
    const pinInput = container.querySelector('#pin-input');
    const btnSubmit = container.querySelector('#btn-submit-login');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!navigator.onLine) {
        mostrarAlerta('Sin conexión. No se puede operar sin internet.', 'danger');
        return;
      }

      const sap = sapInput.value.trim();
      const pin = pinInput.value.trim();

      if (!sap) {
        mostrarAlerta('Ingresa tu número SAP.', 'danger');
        sapInput.focus();
        return;
      }

      if (!pin) {
        mostrarAlerta('Ingresa tu PIN de 4 dígitos.', 'danger');
        pinInput.focus();
        return;
      }

      if (!/^[0-9]{4}$/.test(pin)) {
        mostrarAlerta('El PIN debe tener exactamente 4 dígitos numéricos.', 'danger');
        pinInput.focus();
        return;
      }

      // Estado de carga en el botón
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="spinner"></span> Validando...';

      const { data, error } = await login(sap, pin);

      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Ingresar';

      if (error) {
        const errorMsg = error.message || '';
        // Mensaje visible en caso de cuenta bloqueada
        if (errorMsg.includes('bloqueada')) {
          mostrarAlerta('Tu cuenta está bloqueada. Contacta a RH o al administrador.', 'danger');
        } else {
          // Mensaje de error genérico (no revelar si el SAP existe)
          mostrarAlerta('Número SAP o PIN incorrecto.', 'danger');
        }
        return;
      }

      // Flujo de primer acceso: Crear PIN
      if (data?.pin_pendiente) {
        renderCrearPinForm(data.user || { sap });
        return;
      }

      // Login exitoso: Redirigir según rol
      if (data?.token && data?.user) {
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(data.user);
        }
      }
    });
  }

  // Renderizar la vista de Crear PIN (doble confirmación)
  function renderCrearPinForm(user) {
    container.innerHTML = `
      <div class="auth-card">
        <div class="auth-header">
          <h1 class="auth-title">Configuración de PIN</h1>
          <p class="auth-subtitle">
            ${user.nombre ? `Hola <strong>${user.nombre}</strong>. ` : ''}
            Es tu primer acceso o tu PIN fue restablecido. Por favor crea un PIN numérico de 4 dígitos.
          </p>
        </div>

        <div id="auth-alert-container"></div>

        <form id="crear-pin-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="nuevo-pin-input">Nuevo PIN</label>
            <input 
              type="password" 
              id="nuevo-pin-input" 
              name="nuevoPin" 
              class="form-input" 
              inputmode="numeric" 
              maxlength="4" 
              pattern="[0-9]{4}" 
              placeholder="••••" 
              autocomplete="new-password" 
              required
            />
            <div class="form-hint">Debe ser de 4 dígitos numéricos</div>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirmar-pin-input">Confirmar nuevo PIN</label>
            <input 
              type="password" 
              id="confirmar-pin-input" 
              name="confirmarPin" 
              class="form-input" 
              inputmode="numeric" 
              maxlength="4" 
              pattern="[0-9]{4}" 
              placeholder="••••" 
              autocomplete="new-password" 
              required
            />
          </div>

          <button type="submit" class="btn btn-primary" id="btn-submit-pin">
            Guardar PIN y Entrar
          </button>
          
          <button type="button" class="btn btn-outline" id="btn-cancelar-pin" style="margin-top: 10px;">
            Regresar a Login
          </button>
        </form>
      </div>
    `;

    actualizarEstadoConexion();

    const form = container.querySelector('#crear-pin-form');
    const nuevoPinInput = container.querySelector('#nuevo-pin-input');
    const confirmarPinInput = container.querySelector('#confirmar-pin-input');
    const btnSubmit = container.querySelector('#btn-submit-pin');
    const btnCancelar = container.querySelector('#btn-cancelar-pin');

    btnCancelar.addEventListener('click', () => {
      renderLoginForm();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!navigator.onLine) {
        mostrarAlerta('Sin conexión. No se puede operar sin internet.', 'danger');
        return;
      }

      const nuevoPin = nuevoPinInput.value.trim();
      const confirmarPin = confirmarPinInput.value.trim();

      if (!/^[0-9]{4}$/.test(nuevoPin)) {
        mostrarAlerta('El nuevo PIN debe tener exactamente 4 dígitos numéricos.', 'danger');
        nuevoPinInput.focus();
        return;
      }

      if (nuevoPin !== confirmarPin) {
        mostrarAlerta('Los PINs ingresados no coinciden. Verifícalos.', 'danger');
        confirmarPinInput.focus();
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="spinner"></span> Guardando PIN...';

      // Llamar a crearPin
      const { error: errCrear } = await crearPin(user.sap, nuevoPin);

      if (errCrear) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar PIN y Entrar';
        mostrarAlerta(errCrear.message || 'Error al configurar el PIN.', 'danger');
        return;
      }

      // Tras crear el PIN, iniciar sesión de forma automática
      const { data: dataLogin, error: errLogin } = await login(user.sap, nuevoPin);

      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Guardar PIN y Entrar';

      if (errLogin || !dataLogin?.token) {
        // Si no se inició sesión en automático, volver a la pantalla de login con aviso de éxito
        renderLoginForm('PIN configurado con éxito. Por favor ingresa con tu nuevo PIN.');
        return;
      }

      // Redirigir según rol
      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(dataLogin.user);
      }
    });
  }

  function mostrarAlerta(mensaje, tipo = 'danger') {
    const alertBox = container.querySelector('#auth-alert-container');
    if (alertBox) {
      alertBox.innerHTML = `<div class="alert alert-${tipo}" id="auth-alert">${mensaje}</div>`;
    }
  }

  // Renderizar inicialmente el login
  renderLoginForm();
}

/**
 * Cierra la sesión activa borrando sessionStorage y retornando a la pantalla de login.
 * @param {Function} onLogoutCompleted - Callback tras borrar la sesión
 */
export function cerrarSesion(onLogoutCompleted) {
  borrarSesion();
  if (typeof onLogoutCompleted === 'function') {
    onLogoutCompleted();
  }
}
