# Brief de contexto: sistema de cambio de uniformes (planta Nestlé)

> Documento de contexto para el proyecto de Claude. Resume lo acordado en la entrevista de planeación (13 al 15 de octubre de 2026). Todo lo que no está aquí no fue decidido. Lo no decidido aparece como **[POR DEFINIR]** en la sección 11; no lo resuelvas por tu cuenta, plantea opciones y deja que Carlos decida.

## 1. Qué es
Una PWA (web instalable en celular o computadora, sin tiendas de apps) para digitalizar las peticiones de cambio de uniforme y el inventario de uniformes en la fábrica de Nestlé. Es un **proyecto real** que además será pieza de portafolio de Carlos.

- **Nombre del proyecto / repo (kebab-case):** [POR DEFINIR]
- **Fecha objetivo:** funcionando el **martes 20 de octubre de 2026**.
- **Prueba con persona real:** lunes 19 de octubre de 2026 (ver sección 9).

## 2. Problema
Hoy el colaborador sale del área de producción, camina a las oficinas, pide el cambio y, si hay stock, se lo entregan en ese momento. Quien entrega atiende cambios en muchos momentos del día, lo cual le resulta tedioso. Los cambios se anotan en un cuaderno (número SAP o de empleado, nombre, fecha, hora, motivo, prendas a cambiar). No hay registro digital ni inventario real.

**Dolor doble:** el colaborador pierde tiempo caminando y quien entrega atiende en demasiados momentos del día. Se busca un equilibrio entre ambos y llevar control de los cambios.

## 3. Usuarios y roles (todos con cuenta)
| Rol | Qué hace |
|---|---|
| **Colaborador** (unos 300) | Crea peticiones, ve el estado de las suyas, confirma la recepción. No ve el inventario. |
| **Administrador** | Ve y gestiona peticiones, aprueba o rechaza, entrega, ve el inventario y registra entradas, ve la bitácora, habilita altas y restablece o desbloquea PIN. |
| **RH** | Mismos permisos funcionales que el administrador. Se diferencian por trazabilidad: cada acción guarda el **id de usuario y el rol** de quien la ejecutó (por ejemplo "Aprobada por Carlos (RH)"). |

No existen otros roles en el sistema (el supervisor y el almacén no tienen cuenta).

## 4. Dotación y catálogo de prendas
Cada colaborador tiene: 6 escafandras, 6 pantalones, 6 playeras y 1 par de botas. Pantalones, playeras y escafandras tienen un color por día de trabajo (se trabajan máximo 6 días a la semana). A todos se les entregan los 6 aunque no trabajen los 6 días. Las botas siguen el mismo flujo que el resto de las prendas.

| Prenda | Color | Talla |
|---|---|---|
| Escafandra | rojo, verde, rosa, azul, morado, gris | **talla única** |
| Pantalón | los mismos 6 colores | S, M, L, XL, XXL, XXXL, 4XL |
| Playera | los mismos 6 colores | S, M, L, XL, XXL, XXXL, 4XL |
| Botas (1 par) | sin color | **22 a 31, solo enteros** |

Combinaciones de stock: 6 (escafandra) + 42 (pantalón) + 42 (playera) + 10 (botas) = 100.

## 5. Flujo de una petición
Una **petición** contiene varias **líneas de prenda** (tipo, color, talla). El historial de un colaborador es la suma de sus peticiones.

1. El colaborador crea la petición: líneas de prenda, **motivo** (suciedad, daño, talla u otro) y **ventana propuesta** (rango de fecha y hora, sin restricciones).
2. Estados oficiales: **Pendiente → Aprobada o Rechazada → En proceso → Entregada.**
3. Administrador o RH pueden cambiar cualquier estado.
4. Al **aprobar**, el administrador o RH confirma o reasigna la ventana y la **fecha queda fijada dentro de Aprobada** (no existe un estado "Agendada"). Al aprobar se muestra la **disponibilidad de stock** de las prendas pedidas.
5. Al **rechazar**, el motivo es obligatorio (texto libre).
6. Al **marcar Entregada** (acto físico de entrega): se registra la devolución de prendas (opcional, casilla por prenda, solo administrador o RH) y observaciones opcionales. El **stock baja en ese momento**.
7. El colaborador **confirma la recepción** dentro del estado Entregada. La petición queda en Entregada hasta que confirme, sin vencimiento (no es un estado nuevo).
8. Si no se registró devolución, se muestra una **alerta visible** en el detalle de la petición y una marca en la lista de peticiones junto al estado.

**Cambio de prenda:** el colaborador devuelve la prenda sucia, rota o dañada y recibe una limpia; la prenda devuelta va a desechos.

## 6. Reglas de negocio
- El motivo "talla" **no aplica a líneas de escafandra** (talla única); el sistema lo bloquea.
- No hay reglas de antigüedad ni de cuota para pedir cambios.
- El inventario registra **entradas y salidas**. Una entrada captura tipo, color, talla y cantidad; fecha y usuario son automáticos.
- El stock baja solo cuando un administrador o RH marca Entregada.
- Cada acción (aprobar, rechazar, entregar, entradas, cambios de PIN, etc.) guarda id de usuario y rol desde el inicio, aunque la pantalla de bitácora pueda recortarse.

## 7. Acceso
- Identificación con **número SAP + PIN de 4 dígitos**, para colaborador, administrador y RH por igual.
- RH o un administrador **habilita cada alta** mediante carga masiva de un Excel con números SAP y nombres. El colaborador solo puede crear su PIN si ya está habilitado, en su primer acceso.
- Si olvida el PIN, administrador o RH lo restablece y el colaborador crea uno nuevo en su siguiente acceso.
- **Bloqueo tras 3 intentos fallidos**; lo desbloquea administrador o RH.
- Los primeros administradores (y los administradores nuevos) los da de alta Carlos directamente en Supabase.
- La app solo funciona con internet (avisa si no hay conexión y no deja operar). En la planta sí hay conexión: datos móviles o red de Nestlé.

## 8. Pantallas acordadas
**Colaborador (prioridad móvil):** acceso, mis peticiones (filtros por estado), nueva petición (varias líneas, motivo, ventana), detalle (estado, prendas, motivo, ventana propuesta y confirmada, motivo del rechazo si aplica), confirmar recepción, pantalla de "¡Gracias!", cerrar sesión.

**Administrador y RH (prioridad laptop):** acceso, lista de peticiones (filtros, búsqueda, marca de alerta sin devolución), detalle (historial desplegable, disponibilidad de stock, aprobar, rechazar con motivo, reasignar ventana, pasar a En proceso, marcar Entregada), entrega (devolución por prenda, observaciones), inventario (existencias por tipo, color y talla), registrar entrada, bitácora (acciones por usuario y rol; movimientos de stock; filtros y búsqueda), importación de colaboradores desde Excel, menú lateral, cerrar sesión.

**Fuera del primer alcance:** cancelar petición (posible versión posterior; solo en Pendiente), pantallas Inicio y Perfil, "¿Olvidaste tu acceso?", CI/CD y despliegue automatizado, funcionamiento sin internet, que el colaborador vea el inventario.

## 9. Criterio de "terminado" y plan de prueba
**Terminado (martes 20 de octubre de 2026):**
- Colaborador: crea una petición, ve su estado y confirma la recepción.
- Administrador y RH: ven la lista, aprueban o rechazan, pasan a En proceso, marcan Entregada con devolución, ven el inventario y registran entradas.
- Entran también: historial desplegable, observaciones al entregar, bitácora, filtros y búsqueda de la lista y de la bitácora.

**Prueba:** una persona real de RH o un administrador la hace el **lunes 19 de octubre**, con **datos de ejemplo**. Pasa si completa todo el recorrido **con ayuda de Carlos**. El martes queda para ajustes.

**Orden de recorte si el tiempo aprieta** (se recorta primero lo de arriba):
1. Pantalla de bitácora y sus filtros (el autor de cada acción se guarda igual).
2. PWA instalable (queda como web adaptable).
3. Pruebas automáticas mínimas.
4. Filtros y búsqueda de la lista de peticiones.
5. Pantalla de importación de colaboradores (Carlos los cargaría directo en Supabase).

## 10. Tecnología
- **Front:** JavaScript puro con módulos ES. **Back:** Supabase (PostgreSQL, Auth, reglas de acceso). **Formato:** PWA.
- **Piezas técnicas a demostrar:** máquina de estados de la petición, stock transaccional, PWA instalable, autenticación con roles y bitácora, pruebas mínimas sobre la máquina de estados y el stock.
- **Diseño para un refactor futuro** (posible backend en C# / ASP.NET Core y front en Angular):
  1. Reglas críticas (transiciones de estado y descuento de stock) en funciones de PostgreSQL, en una sola transacción.
  2. Esquema en migraciones SQL versionadas en el repositorio.
  3. Un solo módulo de acceso a datos en el front, el único que habla con Supabase.
  4. Lógica separada del dibujado de pantallas.
  5. Pruebas sobre las reglas, no sobre las pantallas.
- **Entidades implícitas** (conceptual, no es un esquema definitivo): usuario/colaborador, petición, línea de petición, prenda (tipo, color, talla), existencia, movimiento de stock, acción de bitácora.

## 11. Pendientes (no decididos)
1. **Alojamiento de datos de empleados:** Carlos lo consulta con la planta (RH o sistemas). Mientras tanto se construye con datos de ejemplo. Si la respuesta es "no", se mantiene Supabase solo con datos mínimos: número SAP y nombre.
2. **Red de Nestlé:** probar desde ella que no bloquee el dominio de Supabase.
3. **Columnas del Excel de colaboradores** (más allá de SAP y nombre), y qué pasa con SAP repetidos y con bajas.
4. **Implementación del acceso SAP + PIN con Supabase Auth:** opciones por decidir (SAP como correo técnico y PIN como contraseña, o tabla propia con función de verificación). Verificar si Supabase exige una longitud mínima de contraseña mayor a 4.
5. **Datos de la devolución:** solo está acordada una casilla por prenda. Falta decidir si se captura el estado de la prenda (sucia, rota, dañada) y qué pasa si se devuelve algo distinto de lo pedido o no se devuelve.
6. **Si al marcar Entregada no hay stock suficiente:** qué debe pasar (propuesta de Claude: bloquear la entrega; no confirmada por Carlos).
7. **Si el colaborador dice que no recibió todo** al confirmar: no hay regla definida.
8. **Qué color corresponde a cada día de la semana.**
9. **Visibilidad del repositorio** y cómo separar datos reales de datos de ejemplo para el portafolio.
10. **Idioma de la interfaz** (se asume español; no confirmado).
11. **Boceto a mano:** Carlos pidió generar el boceto con IA. Pendiente que él lo redibuje o anote para poder explicarlo en una entrevista.

## 12. Decisiones que cambiaron en la planeación (para no confundirse)
- Primero se dijo que administrador, entregador y RH eran lo mismo; después se decidió tres roles con cuenta (colaborador, administrador, RH) donde administrador y RH tienen los mismos permisos.
- Las ventanas fijas fueron la idea inicial de "equilibrio"; se decidió que el colaborador propone un rango libre y el administrador lo confirma o reasigna.
- Dos nombres por estado (Pendiente/Solicitada, En proceso/Preparación, Aprobada/aceptada): el oficial es el primero de cada par, y "Aprobada".
- El stock inicial se iba a cargar con una pantalla; la decisión final es que Carlos lo carga a mano en Supabase la primera vez.
- Se descartó un estado "Agendada" y cancelar petición para la primera versión.
