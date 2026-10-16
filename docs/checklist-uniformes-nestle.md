# Checklist de Proyecto de Portafolio: cambio de uniformes (Nestlé)

> Misma estructura que `checklist-proyecto-portafolio.md`, llenada con lo acordado en la entrevista de planeación (13 al 15 de octubre de 2026).

## 0. Ficha del proyecto

- **Nombre del proyecto:** Uniformes FOJ
- **Repo (kebab-case):** Uniformes_FOJ
- **Problema que resuelve:** Los cambios de uniforme en la planta de Nestlé se piden caminando a las oficinas y se anotan en un cuaderno, sin historial digital ni inventario real. Quien entrega atiende en demasiados momentos del día.
- **Quién lo usaría:** colaboradores (unos 300), administradores y RH de la planta. Además, es pieza de portafolio de Carlos.
- **Stack a usar:** JavaScript puro (módulos ES) + Supabase (PostgreSQL, Auth, reglas de acceso) + PWA.
- **Criterio de "terminado":** el martes 20 de octubre de 2026, el colaborador crea una petición, ve su estado y confirma la recepción; administrador y RH ven la lista, aprueban o rechazan, pasan a En proceso, marcan Entregada con devolución, ven el inventario y registran entradas. Lo prueba una persona real de RH o un administrador el lunes 19, con datos de ejemplo, completando el recorrido con ayuda de Carlos.

---

## Fase 1: Define solo, sin LLM

- [x] Escribí a mano/en doc el problema y quién lo usa
- [ ] Dibujé un borrador (feo está bien) de arquitectura o flujo de pantallas
  > El boceto de pantallas lo generó Claude y Carlos lo adoptó. **Pendiente:** redibujarlo o anotarlo a mano para poder explicarlo (regla de oro).
- [x] Listé las tecnologías que quiero aprender/demostrar (máquina de estados, stock transaccional, PWA, autenticación con roles y bitácora, pruebas mínimas)
- [x] Definí criterios de éxito (ver ficha)

---

## Fase 2: LLM de planificación como auditor (no diseñador)

- [x] Usé este prompt (o similar): entrevista de procesos con hallazgos de auditor; Claude señaló ambigüedades y Carlos decidió cada una
- [ ] Ajusté mi borrador con el feedback (sin dejar que el LLM rediseñe todo)
  > Parcial: Carlos adoptó una propuesta de pantallas hecha por Claude. Revisar que cada pantalla la pueda explicar.

---

## Fase 3: Desglose en tickets (30 a 60 min c/u)

> **Generado el 16 de octubre de 2026.** El orden sigue las dependencias. Entre corchetes, el orden de recorte si el tiempo aprieta (1 se recorta primero; 5 último).  
> Decisiones críticas incorporadas: **Auth → tabla propia + Edge Function**, **stock insuficiente → bloquear entrega**, **datos de empleados → solo SAP + nombre**.

### Resumen rápido

| # | Ticket | Hecho |
|---|--------|-------|
| 1 | Migraciones base (esquema completo) | [x] |
| 2 | Catálogo de prendas, colores y tallas | [ ] |
| 3 | Datos de ejemplo (seed) | [ ] |
| 4 | Auth SAP + PIN: primer acceso, hash | [ ] |
| 5 | Bloqueo a 3 intentos, restablecer y desbloquear | [ ] |
| 6 | Roles y RLS (reglas de acceso) | [ ] |
| 7 | Módulo único de acceso a datos en el front | [ ] |
| 8 | Función BD: crear petición | [ ] |
| 9 | Función BD: transiciones de estado | [ ] |
| 10 | Función BD: marcar Entregada (stock transaccional) | [ ] |
| 11 | Función BD: confirmación de recepción | [ ] |
| 12 | Pruebas mínimas: máquina de estados y stock `[recorte 3]` | [ ] |
| 13 | UI colaborador: acceso y cerrar sesión | [ ] |
| 14 | UI colaborador: nueva petición | [ ] |
| 15 | UI colaborador: mis peticiones y detalle | [ ] |
| 16 | UI colaborador: confirmar recepción y "¡Gracias!" | [ ] |
| 17 | UI admin: lista de peticiones, alertas, filtros `[recorte 4]` | [ ] |
| 18 | UI admin: detalle de petición | [ ] |
| 19 | UI admin: entrega (devolución + observaciones) | [ ] |
| 20 | UI admin: inventario y registrar entrada | [ ] |
| 21 | Importación de colaboradores desde Excel `[recorte 5]` | [ ] |
| 22 | Pantalla de bitácora con filtros `[recorte 1]` | [ ] |
| 23 | PWA: manifiesto, service worker, aviso sin conexión `[recorte 2]` | [ ] |
| 24 | Prueba de punta a punta con persona de RH (lunes 19) | [ ] |

### Grafo de dependencias

```
1 → 2 → 3
1 → 4 → 5
1, 4 → 6
1, 4, 6 → 7
1, 2, 6 → 8
1, 6 → 9
1, 2, 8, 9 → 10
1, 10 → 11
8, 9, 10, 11 → 12
4, 5, 7 → 13
7, 8, 13 → 14
7, 11, 13 → 15
11, 13, 15 → 16
7, 13 → 17
7, 9, 17 → 18
10, 17, 18 → 19
1, 2, 7, 13 → 20
1, 6, 7 → 21
7, 13 → 22
todos los UI → 23
todos → 24
```

---

### Ticket 1 — Migraciones base

**Descripción**  
Crear el proyecto en Supabase y las migraciones SQL versionadas que definen el esquema completo: tablas, tipos, restricciones y relaciones. Nada de esquema manual desde el panel; todo queda en archivos `.sql` en el repo.

**Criterios de aceptación**
- [x] Carpeta `supabase/migrations/` con al menos un archivo `<timestamp>_init.sql`.
- [x] Tabla `usuarios`: `id` (uuid PK), `sap` (text único), `nombre` (text), `rol` (enum: `colaborador`, `administrador`, `rh`), `pin_hash` (text nullable), `intentos_fallidos` (int default 0), `bloqueado` (bool default false), `pin_pendiente` (bool default true), `creado_en`, `creado_por` (FK).
- [x] Tabla `peticiones`: `id`, `usuario_id` (FK), `estado` (enum: `pendiente`, `aprobada`, `rechazada`, `en_proceso`, `entregada`), `motivo`, `ventana_propuesta_inicio/fin`, `ventana_confirmada_inicio/fin`, `motivo_rechazo` (nullable), `observaciones` (nullable), `sin_devolucion` (bool default false), `recepcion_confirmada` (bool default false), `creada_en`, `actualizada_en`.
- [x] Tabla `lineas_peticion`: `id`, `peticion_id` (FK), `prenda_tipo` (enum), `prenda_color` (nullable), `prenda_talla` (nullable), `devuelta` (bool default false).
- [x] Tabla `existencias`: `id`, `prenda_tipo`, `prenda_color` (nullable), `prenda_talla` (nullable), `cantidad` (int ≥ 0). Constraint único por (tipo, color, talla).
- [x] Tabla `movimientos_stock`: `id`, `existencia_id` (FK), `tipo_movimiento` (enum: `entrada`, `salida`), `cantidad`, `peticion_id` (FK nullable), `usuario_id` (FK), `rol_usuario`, `registrado_en`.
- [x] Tabla `acciones_bitacora`: `id`, `usuario_id` (FK), `rol_usuario`, `tipo_accion`, `entidad`, `entidad_id`, `detalle` (jsonb nullable), `registrado_en`.
- [x] Migraciones corren sin error. RLS **no** habilitado aquí (va en ticket 6).

**Notas técnicas**  
`pin_hash = null` hasta el primer acceso. El color `null` para botas y `talla = 'unica'` para escafandra son los valores canónicos en `existencias`.

**Dependencias:** ninguna.

---

### Ticket 2 — Catálogo de prendas

**Descripción**  
Migración que carga las 100 combinaciones válidas en `existencias` con `cantidad = 0`, y función de validación de combinaciones.

**Criterios de aceptación**
- [ ] 100 filas insertadas: escafandra × 6 colores (6), pantalón × 6 × 7 (42), playera × 6 × 7 (42), botas × 10 tallas (10).
- [ ] Función `es_combinacion_valida(tipo, color, talla) RETURNS bool` que rechaza: talla distinta de `'unica'` en escafandra, color no nulo en botas, talla fuera de 22–31 en botas, talla inválida en pantalón/playera.
- [ ] Tallas de botas guardadas como texto (`'22'`…`'31'`).

**Dependencias:** Ticket 1.

---

### Ticket 3 — Datos de ejemplo (seed)

**Descripción**  
Archivo `supabase/seed.sql` con usuarios, peticiones en todos los estados y stock de ejemplo. Sin datos reales.

**Criterios de aceptación**
- [ ] Al menos 3 colaboradores, 1 administrador, 1 RH (SAP y nombres ficticios).
- [ ] Peticiones en cada estado: `pendiente`, `aprobada`, `rechazada`, `en_proceso`, `entregada` (con y sin devolución).
- [ ] Stock > 0 en al menos 10 combinaciones.
- [ ] Ejecutable múltiples veces sin error (`ON CONFLICT DO NOTHING`).
- [ ] PINs hasheados con la misma función del ticket 4; SAP y PINs de ejemplo documentados en comentario al inicio del archivo.
- [ ] **Ningún SAP ni nombre real.**

**Dependencias:** Tickets 1 y 2.

---

### Ticket 4 — Auth SAP + PIN

**Descripción**  
Autenticación propia: función `verificar_pin()`, función `crear_pin()` y Supabase Edge Function `auth-login` que genera JWT.

**Criterios de aceptación**
- [ ] `verificar_pin(p_sap, p_pin) RETURNS uuid`: verifica bloqueo → compara hash con `crypt()` → resetea intentos si correcto → incrementa y bloquea si incorrecto.
- [ ] `crear_pin(p_sap, p_pin_nuevo)`: solo si `pin_pendiente = true`, valida 4 dígitos numéricos, guarda `crypt(pin, gen_salt('bf'))`, pone `pin_pendiente = false`.
- [ ] Edge Function `supabase/functions/auth-login/index.ts`: recibe `{ sap, pin }`, llama a `verificar_pin` via RPC, retorna JWT firmado con `{ sub, rol, sap, exp }` o 401 genérico.
- [ ] JWT firmado con secreto en variable de entorno `JWT_SECRET` (no hardcodeado).
- [ ] Extensión `pgcrypto` habilitada en migración.

**Dependencias:** Ticket 1.

---

### Ticket 5 — Bloqueo, restablecer y desbloquear PIN

**Descripción**  
Funciones de administración de acceso para administrador/RH.

**Criterios de aceptación**
- [ ] `restablecer_pin(p_admin_id, p_sap_objetivo)`: verifica rol admin/RH del invocante → pone `pin_hash = null`, `pin_pendiente = true`, `intentos_fallidos = 0`, `bloqueado = false` → registra en bitácora.
- [ ] `desbloquear_cuenta(p_admin_id, p_sap_objetivo)`: verifica rol → pone `intentos_fallidos = 0`, `bloqueado = false` (no toca el PIN) → registra en bitácora.
- [ ] Ambas lanzan error si el invocante no es admin/RH.

**Dependencias:** Tickets 1 y 4.

---

### Ticket 6 — Roles y RLS

**Descripción**  
Habilitar Row Level Security en todas las tablas con políticas por rol. El JWT del ticket 4 es el mecanismo de identificación.

**Criterios de aceptación**
- [ ] RLS habilitado en: `usuarios`, `peticiones`, `lineas_peticion`, `existencias`, `movimientos_stock`, `acciones_bitacora`.
- [ ] Colaborador: SELECT en `peticiones` solo donde `usuario_id = uid_from_jwt()`. SELECT en `lineas_peticion` solo de sus peticiones. **Sin acceso** a `existencias`.
- [ ] Admin/RH: acceso total a todas las tablas.
- [ ] Solo funciones `SECURITY DEFINER` escriben en `movimientos_stock` y `acciones_bitacora`.
- [ ] Función auxiliar `uid_from_jwt()` que lee `current_setting('request.jwt.claims', true)`.
- [ ] Migraciones de RLS en archivo separado `..._rls.sql`.

**Dependencias:** Tickets 1, 3 y 4.

---

### Ticket 7 — Módulo único de acceso a datos

**Descripción**  
Módulo `src/data/api.js`: el único punto del front que habla con Supabase. Ninguna pantalla importa el cliente directamente.

**Criterios de aceptación**
- [ ] `src/data/client.js`: instancia única del cliente Supabase.
- [ ] `src/data/session.js`: gestiona JWT en `sessionStorage` (guardar, leer, borrar, verificar).
- [ ] `src/data/api.js` exporta: `login`, `crearPin`, `obtenerPeticionesColaborador`, `obtenerTodasLasPeticiones`, `obtenerDetallePeticion`, `crearPeticion`, `cambiarEstado`, `marcarEntregada`, `confirmarRecepcion`, `obtenerInventario`, `registrarEntrada`, `obtenerBitacora`.
- [ ] No existe `import { supabase }` fuera de `src/data/`.
- [ ] Errores en español; las pantallas muestran solo `error.message`.
- [ ] URL y clave anónima en `.env` (no en el repo); variables documentadas en `README.md`.

**Dependencias:** Tickets 1, 4 y 6.

---

### Ticket 8 — Función BD: crear petición

**Descripción**  
Función `crear_peticion(p_usuario_id, p_motivo, p_ventana_inicio, p_ventana_fin, p_lineas jsonb) RETURNS uuid` atómica con validaciones de dominio.

**Criterios de aceptación**
- [ ] Verifica que el usuario sea colaborador.
- [ ] Valida cada línea con `es_combinacion_valida()`.
- [ ] Bloquea motivo `'talla'` si alguna línea es `escafandra` (error descriptivo).
- [ ] Inserta petición en `pendiente` + todas las líneas en una sola transacción.
- [ ] Registra acción en bitácora con tipo `'crear_peticion'`.
- [ ] `SECURITY DEFINER`.

**Dependencias:** Tickets 1, 2 y 6.

---

### Ticket 9 — Función BD: transiciones de estado

**Descripción**  
Función `cambiar_estado(p_admin_id, p_peticion_id, p_nuevo_estado, p_extra jsonb)` para transiciones `pendiente → aprobada/rechazada → en_proceso`.

**Criterios de aceptación**
- [ ] `pendiente → aprobada`: solo admin/RH; fija `ventana_confirmada` desde `p_extra` (obligatoria).
- [ ] `pendiente → rechazada`: solo admin/RH; requiere `motivo_rechazo` en `p_extra` (no vacío).
- [ ] `aprobada → en_proceso`: solo admin/RH.
- [ ] Cualquier otra transición lanza error `'Transición no permitida: X → Y'`.
- [ ] Registra en bitácora con usuario, rol y detalle.
- [ ] Actualiza `actualizada_en`. `SECURITY DEFINER`.

> La transición `en_proceso → entregada` va en el ticket 10 (tiene lógica de stock).

**Dependencias:** Tickets 1 y 6.

---

### Ticket 10 — Función BD: marcar Entregada (stock transaccional)

**Descripción**  
Función `marcar_entregada(p_admin_id, p_peticion_id, p_devoluciones jsonb, p_observaciones text)`. Si no hay stock, lanza error y revierte todo.

**Criterios de aceptación**
- [ ] Verifica que sea admin/RH y que la petición esté en `en_proceso`.
- [ ] Para cada línea: `SELECT … FOR UPDATE` en `existencias`; si `cantidad < 1` → lanza error `'Stock insuficiente para [tipo] [color] [talla]'` y revierte.
- [ ] Descuenta 1 unidad por línea e inserta en `movimientos_stock`.
- [ ] Marca `devuelta = true` en las líneas de `p_devoluciones`.
- [ ] Si `p_devoluciones` no cubre todas las líneas → `sin_devolucion = true` en la petición.
- [ ] Pone estado en `entregada`. Registra en bitácora. Todo en una sola transacción. `SECURITY DEFINER`.

**[POR DEFINIR]:** Estado de la prenda devuelta (pendiente 5 del brief). Por ahora: solo booleano por línea.

**Dependencias:** Tickets 1, 2, 8 y 9.

---

### Ticket 11 — Función BD: confirmación de recepción

**Descripción**  
Función `confirmar_recepcion(p_usuario_id, p_peticion_id)` que marca la recepción dentro del estado `entregada`.

**Criterios de aceptación**
- [ ] Verifica que el usuario sea el dueño de la petición y que esté en `entregada`.
- [ ] Pone `recepcion_confirmada = true`.
- [ ] Si ya estaba confirmada → error `'Recepción ya confirmada'`.
- [ ] Registra en bitácora. `SECURITY DEFINER`.

**[POR DEFINIR]:** Qué pasa si el colaborador dice que no recibió todo (pendiente 7 del brief).

**Dependencias:** Tickets 1 y 10.

---

### Ticket 12 — Pruebas mínimas `[recorte 3]`

**Descripción**  
Pruebas automáticas sobre la máquina de estados y el descuento de stock. Son el contrato para un futuro refactor.

**Criterios de aceptación**
- [ ] Pruebas de máquina de estados: transiciones válidas (`pendiente → aprobada`, `aprobada → en_proceso`, `en_proceso → entregada`), transición inválida (`pendiente → entregada`) lanza error, rechazar sin motivo lanza error.
- [ ] Pruebas de stock: stock > 0 descuenta correctamente; stock = 0 lanza error y no modifica nada.
- [ ] Corren con un comando documentado (ej: `npm test`).

**Dependencias:** Tickets 8, 9, 10 y 11.

---

### Ticket 13 — UI colaborador: acceso y cerrar sesión

**Descripción**  
Pantalla de login (colaborador, admin y RH). Flujo de primer acceso (crear PIN) y mensaje de cuenta bloqueada.

**Criterios de aceptación**
- [ ] Campos SAP y PIN (`type="password"`, 4 dígitos numéricos).
- [ ] Login exitoso → guarda sesión → redirige según rol.
- [ ] `pin_pendiente = true` → pantalla de crear PIN (doble confirmación) → redirige.
- [ ] Cuenta bloqueada → mensaje `'Tu cuenta está bloqueada. Contacta a RH o al administrador.'`
- [ ] Sin conexión → aviso visible y formulario bloqueado.
- [ ] Cerrar sesión borra `sessionStorage` y regresa a login.
- [ ] Mensaje de error genérico (no revela si el SAP existe).

**Dependencias:** Tickets 4, 5 y 7.

---

### Ticket 14 — UI colaborador: nueva petición

**Descripción**  
Pantalla para crear petición con líneas múltiples, motivo y ventana propuesta.

**Criterios de aceptación**
- [ ] Añadir/eliminar líneas; selectores adaptativos (escafandra oculta talla; botas oculta color).
- [ ] Motivo: selector (suciedad, daño, talla, otro). Si motivo = `talla` + hay línea de escafandra → bloquea envío con advertencia visible.
- [ ] Ventana: date-time picker amigable en móvil.
- [ ] Al enviar: llama a `crearPeticion()`; errores de servidor visibles; éxito → redirige a Mis peticiones.

**[POR DEFINIR]:** Color por día de la semana (pendiente 8). Por ahora el colaborador elige libremente.

**Dependencias:** Tickets 7, 8 y 13.

---

### Ticket 15 — UI colaborador: mis peticiones y detalle

**Descripción**  
Lista de peticiones del colaborador y pantalla de detalle.

**Criterios de aceptación**
- [ ] Lista: estado, fecha, resumen de prendas, ventanas, marca de alerta si `sin_devolucion = true`.
- [ ] Filtros por estado.
- [ ] Detalle: estado, líneas, motivo, ventanas, motivo de rechazo (si aplica), observaciones (si aplica).
- [ ] Botón "Confirmar recepción" visible solo si `estado = entregada` y `recepcion_confirmada = false`.

**Dependencias:** Tickets 7, 11 y 13.

---

### Ticket 16 — UI colaborador: confirmar recepción y "¡Gracias!"

**Descripción**  
Flujo de confirmación y pantalla de éxito.

**Criterios de aceptación**
- [ ] Botón "Confirmar que recibí mis prendas" en el detalle (condición del ticket 15).
- [ ] Éxito → redirige a pantalla "¡Gracias!" con botón para volver a Mis peticiones.
- [ ] Si ya confirmada → botón no aparece.

**Dependencias:** Tickets 11, 13 y 15.

---

### Ticket 17 — UI admin: lista de peticiones `[recorte 4]`

**Descripción**  
Vista principal del administrador/RH con lista, filtros, búsqueda y alertas.

**Criterios de aceptación**
- [ ] Lista: nombre, SAP, estado, fecha, resumen de prendas, marca de alerta si `sin_devolucion = true`.
- [ ] Filtros por estado y por rango de fechas.
- [ ] Búsqueda por nombre o SAP.
- [ ] Clic en fila → abre detalle (ticket 18).

**Dependencias:** Tickets 7 y 13.

---

### Ticket 18 — UI admin: detalle de petición

**Descripción**  
Pantalla de detalle para admin/RH con historial, disponibilidad de stock y controles de transición.

**Criterios de aceptación**
- [ ] Datos del colaborador, estado, líneas, motivos, ventanas, observaciones.
- [ ] Historial desplegable: acciones de bitácora ordenadas por fecha con autor y rol.
- [ ] Si `pendiente`: botones Aprobar (modal con ventana + stock disponible por línea) y Rechazar (modal con motivo obligatorio).
- [ ] Si `aprobada`: botón "Pasar a En proceso".
- [ ] Si `en_proceso`: botón "Marcar como Entregada" (lleva a ticket 19).
- [ ] Alerta visible si `sin_devolucion = true`.

**Dependencias:** Tickets 7, 9 y 17.

---

### Ticket 19 — UI admin: entrega (devolución + observaciones)

**Descripción**  
Pantalla o modal de entrega desde el detalle cuando la petición está en `en_proceso`.

**Criterios de aceptación**
- [ ] Casilla "¿Se devolvió?" por cada línea de prenda.
- [ ] Campo de observaciones (opcional).
- [ ] Botón "Confirmar entrega" → llama a `marcarEntregada()`.
- [ ] Error de stock insuficiente → muestra qué prenda falta, sin navegar.
- [ ] Sin prendas marcadas como devueltas → avisa pero no bloquea.
- [ ] Éxito → regresa al detalle con estado actualizado.

**[POR DEFINIR]:** Estado de la prenda devuelta (pendiente 5). Por ahora solo checkbox.

**Dependencias:** Tickets 10, 17 y 18.

---

### Ticket 20 — UI admin: inventario y registrar entrada

**Descripción**  
Pantalla de inventario con tabla de existencias y formulario de entrada de stock.

**Criterios de aceptación**
- [ ] Tabla agrupada por tipo; muestra color, talla y cantidad. Cantidades en 0 destacadas.
- [ ] Formulario "Registrar entrada": tipo, color, talla, cantidad → llama a `registrarEntrada()`.
- [ ] Entrada: `existencias.cantidad += cantidad`; inserta en `movimientos_stock`.
- [ ] Tabla se actualiza tras registrar.

**Dependencias:** Tickets 1, 2, 7 y 13.

---

### Ticket 21 — Importación de colaboradores desde Excel `[recorte 5]`

**Descripción**  
Pantalla para cargar un Excel con SAP y nombres de colaboradores y habilitarlos para su primer acceso.

**Criterios de aceptación**
- [ ] Input de archivo `.xlsx` o `.csv` con vista previa antes de confirmar.
- [ ] Inserta usuarios con `rol = colaborador`, `pin_pendiente = true`, `pin_hash = null`.
- [ ] SAP duplicados → omitidos; resumen de insertados y omitidos.

**[POR DEFINIR]:** Columnas del Excel más allá de SAP y nombre, qué pasa con bajas (pendiente 3 del brief). **Ticket parcialmente bloqueado.**

**Dependencias:** Tickets 1, 6 y 7.

---

### Ticket 22 — Pantalla de bitácora `[recorte 1]`

**Descripción**  
Vista de bitácora para admin/RH: todas las acciones de `acciones_bitacora` con filtros y búsqueda.

**Criterios de aceptación**
- [ ] Lista: fecha, tipo de acción, usuario, rol, entidad afectada.
- [ ] Filtros: por tipo de acción, por usuario, por rango de fechas.
- [ ] Búsqueda por nombre o SAP.
- [ ] Paginación o scroll infinito.

> Aunque no haya pantalla, la bitácora **siempre se guarda** (está en los tickets 4–11).

**Dependencias:** Tickets 7 y 13.

---

### Ticket 23 — PWA `[recorte 2]`

**Descripción**  
Convertir la app en PWA instalable: manifiesto, service worker y aviso sin conexión.

**Criterios de aceptación**
- [ ] `manifest.json` con nombre, íconos (192×192 y 512×512), colores y `display: standalone`.
- [ ] Service worker que cachea assets estáticos (shell de la app).
- [ ] Sin conexión → banner visible + operaciones bloqueadas (no es modo offline).
- [ ] Instalable en Android y desktop Chrome.

**Dependencias:** Todos los tickets de UI completados.

---

### Ticket 24 — Prueba de punta a punta (lunes 19)

**Descripción**  
Sesión de prueba con persona real de RH o administrador, datos de ejemplo, con ayuda de Carlos.

**Criterios de aceptación**
- [ ] Persona completa recorrido colaborador: crear petición → ver estado → confirmar recepción.
- [ ] Persona completa recorrido admin/RH: ver lista → aprobar → en proceso → entregar con devolución → inventario → registrar entrada.
- [ ] Se registran bugs y fricciones para ajustar el martes 20.
- [ ] Solo datos de ejemplo. **Ningún dato real.**

**Dependencias:** Todos los tickets anteriores (o el subconjunto mínimo funcional).

---

## Fase 4: Agente de código, un ticket a la vez

Repite por cada ticket:

- [ ] Pedí "implementa el ticket X" (nunca "construye el proyecto")
- [ ] Si el agente propuso tocar algo fuera del ticket, pregunté por qué antes de aceptar
- [ ] Leí el diff línea por línea (no "aceptar todo")
- [ ] Reescribí al menos una parte con mis propias palabras

---

## Fase 5: Revisión crítica

- [ ] Usé este prompt (o similar):
  > Aquí está mi implementación de [X]: [código]. Actúa como un senior dev revisando mi PR. Dame feedback sobre seguridad, rendimiento y legibilidad, con ejemplos concretos.
- [ ] Apliqué los cambios entendiéndolos, no copiándolos a ciegas
- [ ] Revisé en especial: hash del PIN, reglas de acceso por rol, y que el stock nunca quede negativo

---

## Fase 6: Documentación

- [ ] README explica: qué hace, por qué lo construí, qué decisiones técnicas tomé
- [ ] Incluí retos encontrados y cómo los resolví
- [ ] Agregué diagrama de arquitectura o flujo de datos (incluye la máquina de estados)
- [ ] Separé datos reales de datos de ejemplo antes de publicar el repositorio

---

## Fase 7: Entrevista simulada (checkpoint final antes del CV)

- [ ] Usé este prompt (o similar):
  > Actúa como un entrevistador técnico senior. Voy a entrevistarte como si hubiera construido este proyecto: [descripción]. Hazme 5 preguntas técnicas desafiantes sobre decisiones de diseño e implementación.
- [ ] Pude responder todo sin necesidad de ver el código
- [ ] Practiqué explicar cualquier decisión de arquitectura en menos de 2 minutos
- [ ] Subido a GitHub con nombre kebab-case y agregado al CV/LinkedIn

---

## Pendientes de decisión (ver sección 11 del brief)

| # | Pendiente | Estado |
|---|-----------|--------|
| 1 | Datos de empleados en Supabase | ✅ **Decidido:** solo SAP + nombre |
| 2 | Probar desde la red de Nestlé que no bloquee Supabase | ⏳ Pendiente |
| 3 | Columnas del Excel más allá de SAP y nombre, SAP repetidos y bajas | ⏳ Pendiente (ticket 21 bloqueado parcialmente) |
| 4 | Implementación SAP + PIN con Supabase Auth | ✅ **Decidido:** tabla propia + `verificar_pin()` + Edge Function JWT |
| 5 | Estado de la prenda devuelta y qué pasa si falta o es distinta | ⏳ Pendiente (por ahora: solo booleano por línea) |
| 6 | Qué pasa si al marcar Entregada no hay stock suficiente | ✅ **Decidido:** bloquear la entrega con error; nunca queda negativo |
| 7 | Qué pasa si el colaborador dice que no recibió todo | ⏳ Pendiente (confirmación es binaria por ahora) |
| 8 | Color que corresponde a cada día de la semana | ⏳ Pendiente (el colaborador elige libremente por ahora) |
| 9 | Visibilidad del repositorio y nombre del proyecto | ⏳ Pendiente |
| 10 | Idioma de la interfaz | ⏳ Se asume español |
| 11 | Boceto de pantallas redibujado o anotado por Carlos | ⏳ Pendiente (regla de oro del portafolio) |

---

## Regla de oro

**Si no lo puedes explicar en una entrevista, no lo pusiste tú.**
