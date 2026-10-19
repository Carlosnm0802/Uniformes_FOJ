# Uniformes FOJ — Sistema de Gestión y Cambio de Uniformes (Nestlé)

Aplicación web progresiva (PWA) para digitalizar las peticiones de cambio de uniforme, trazabilidad de solicitudes y control de inventario en la fábrica de Nestlé.

---

## Estructura de Acceso a Datos en el Front (`src/data/`)

Siguiendo las reglas de arquitectura del proyecto, todo acceso a Supabase, base de datos y Edge Functions está centralizado en un único módulo desacoplado. Las pantallas de la interfaz nunca importan directamente el cliente de Supabase.

- **`src/data/config.js`**: Configuración centralizada de Supabase. Obtiene las credenciales de `window.__ENV__` o variables por defecto de desarrollo local.
- **`src/data/session.js`**: Gestión segura del JWT en `sessionStorage`. Almacena, lee, borra y valida la expiración de la sesión activa por pestaña, además de decodificar claims de identidad (`sub`, `rol`, `sap`, `nombre`).
- **`src/data/client.js`**: Instancia única (*Singleton*) de `@supabase/supabase-js`. Implementa un `customFetch` que adjunta automáticamente el token JWT en el encabezado `Authorization: Bearer <token>` para cumplir con las políticas RLS a nivel de PostgreSQL.
- **`src/data/api.js`**: Única interfaz de datos expuesta al resto de la aplicación. Todas las funciones retornan `{ data, error }` con errores en español normalizados listos para mostrar como `error.message`.

### Funciones disponibles en `src/data/api.js`

1. `login(sap, pin)`
2. `crearPin(sap, pinNuevo)`
3. `obtenerPeticionesColaborador()`
4. `obtenerTodasLasPeticiones(filtros)`
5. `obtenerDetallePeticion(peticionId)`
6. `crearPeticion(datos)`
7. `cambiarEstado(peticionId, nuevoEstado, extra)`
8. `marcarEntregada(peticionId, devoluciones, observaciones)`
9. `confirmarRecepcion(peticionId)`
10. `obtenerInventario()`
11. `registrarEntrada(datos)`
12. `obtenerBitacora(filtros)`

---

## Variables de Entorno

Las credenciales no deben ser subidas al repositorio.

### Archivo `.env` (o `.env.example`)
Copia `.env.example` a `.env` para desarrollo con Supabase CLI o despliegues:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=tu-clave-anonima-de-supabase
```

### Configuración en Front (Vanilla JS)
Para ejecutar directamente en el navegador con módulos ES nativos:
1. Puedes inyectar `window.__ENV__` en el `index.html`, o
2. Copiar `src/data/env.example.js` a `src/data/env.js` (ignorado en `.gitignore`).
