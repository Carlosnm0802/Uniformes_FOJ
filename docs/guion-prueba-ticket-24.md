# Guion de prueba de punta a punta — Ticket 24

Sesión de prueba **con una persona real** de RH o administrador, con **datos de ejemplo**. La persona pasa si completa ambos recorridos con ayuda de Carlos. Los hallazgos alimentan los ajustes del martes 20.

**Regla de oro:** solo datos de ejemplo. Si en cualquier captura o registro aparece un nombre o SAP real, se descarta.

---

## 1. Preparación (10 minutos antes de la sesión)

```bash
supabase start            # si estaba dormido
supabase db reset         # BD limpia: SOLO datos de ejemplo del seed
python3 -m http.server 8000
```

- Verificar accesos demo:
  - Administrador: `90000001` / PIN `9999`
  - RH: `80000001` / PIN `8888`
  - Colaborador: `10000001` / PIN `1234`
  - Colaborador 2: `10000002` / PIN `5678`
- Abrir `http://localhost:8000` en la máquina donde probará la persona (idealmente su propia computadora o celular para probar la PWA instalada).
- Anotar el inventario inicial (existencias por prenda) para verificar después de las entregas.
- NO importar `Libro9.xlsx` (datos reales); el Excel es solo desarrollo local de Carlos.
- Todo corre local (`http://127.0.0.1:54321`); no se toca ninguna instancia remota.

## 2. Reglas de la sesión para Carlos

1. **No guiar de más:** solo desbloquear cuando la persona se atasque; una consigna vale más que tres explicaciones.
2. **Fricciones literales:** anotar lo que dice la persona cuando algo le cuesta entender ("no sé qué es ventana", "este botón no se nota").
3. **Un bug = un renglón** de la tabla; nada se corrige en caliente salvo que bloquee todo el recorrido.
4. Cerrar la sesión preguntando: "¿qué te faltó? ¿qué sobró?".

---

## 3. Guion A — Recorrido colaborador (≈10 min)

| # | Paso | Qué observar |
|---|------|--------------|
| A1 | Login con SAP `10000001` + PIN `1234` | ¿Entiende el flujo de PIN? ¿El SAP se escribe con claridad? |
| A2 | "Nueva petición": escafandra (sin talla), botas (sin color), playera (M, morado) | ¿Los selects dependientes se entienden? ¿El motivo es claro? |
| A3 | Intentar escafandra con motivo "talla" | Debe validarse: motivo imposible para escafandra con mensaje visible |
| A4 | Enviar petición; ir a "Mis peticiones" | Estado "Pendiente" visible; descripción de prendas legible |
| A5 | *(Carlos, desde Admin `90000001`:)* aprobar con ventana de entrega (la pantalla muestra stock) | — |
| A6 | *(Carlos:)* pasar a "En proceso" | — |
| A7 | *(Carlos:)* marcar "Entregada" (con devolución si la escafandra no se usó) | — |
| A8 | Colaborador recarga → botón "Confirmar que recibí mis prendas" | ¿El texto es claro? ¿Entiende qué confirma? |
| A9 | Confirmar → pantalla "¡Gracias!" | ¿Sabe cómo regresar a sus peticiones? |
| A10 | Historial desplegable en el detalle | ¿Entiende el historial de acciones? |

## 4. Guion B — Recorrido admin/RH (≈20 min)

| # | Paso | Qué observar |
|---|------|--------------|
| B1 | Login RH `80000001` / `8888` | El rol RH debe ver lo mismo que Admin |
| B2 | Lista de peticiones: chips de estado, buscar por nombre/SAP, fechas desde/hasta | ¿Los filtros se comprenden? ¿La lista es legible en su pantalla? |
| B3 | Abrir un detalle; revisar el stock por línea | ¿Se entiende "Disponibles: N"? ¿Y "No alcanza"? |
| B4 | Aprobar otra petición con ventana de entrega | Stock nunca negativo; la ventana respeta que el inicio sea antes del fin |
| B5 | Rechazar SIN motivo → error; CON motivo → acepta | ¿El mensaje de motivo obligatorio es claro? |
| B6 | "En proceso" → "Entregada" con una devolución marcada + observaciones | Casillas de devolución comprensibles |
| B7 | "Entregada" sin ninguna devolución (aviso en el primer clic; segunda confirma) | ¿La advertencia se lee a tiempo? |
| B8 | Inventario: tabla agrupada por tipo, cantidades 0 destacadas | ¿Identifica a golpe de vista qué falta? |
| B9 | Registrar entrada (Pantalón, gris, L, +5) | Nueva cantidad y tabla actualizada al instante |
| B10 | Bitácora: chips de acción, filtro de usuario, fechas, buscar "Gómez" | ¿La auditoría se entiende? ¿"Más resultados" funciona? |
| B11 | Cerrar sesión; como colaborador verificar que NO aparecen los botones admin | Red de seguridad RLS (por si algo se escapara de la UI) |

## 5. Guion C — PWA (≈2 min, opcional pero recomendado)

| # | Paso | Qué observar |
|---|------|--------------|
| C1 | Chrome/Android: instalar desde el menú o el icono de instalar | Ícono correcto; nombre corto "Uniformes FOJ" |
| C2 | Abrir la app instalada (standalone, sin barra del navegador) | ¿Se siente como app? |
| C3 | DevTools > Network > Offline → operar (ej. "Mis peticiones") | Banner rojo visible; error rápido y limpio al operar; nada se cuelga |
| C4 | Volver online → reintentar | La app retoma el flujo normal |

---

## 6. Registro de bugs y fricciones

| ID | Guion/paso | Esperado | Obtenido | Severidad | Notas |
|----|-----------|----------|----------|-----------|-------|
| | | | | bloquea / molesta / cosmético | |

### Fricciones de lenguaje/UX (sin severidad)

- _(frases literales de la persona durante la sesión)_

---

## 7. Cierre y triaje (al finalizar la sesión)

1. Clasificar cada bug como "bloquea", "molesta" o "cosmético".
2. Priorizar contra el **orden de recorte del brief** (bitácora → PWA → pruebas → filtros lista → importación): los "bloquea" primero; los "molesta" solo si el martes lo permite.
3. Llenar la tabla de agendado del martes en este documento.

| ID | ¿Se arregla el martes? | Acción prevista |
|----|------------------------|-----------------|
| | sí / no | |

## 8. Pruebas extendidas por rol (opcional, no bloquean el paso del ticket)

Casos extra con datos de ejemplo para quemar más esquina del sistema. Se hacen **después** del triaje del guion A/B si quedó tiempo; se anotan en la misma tabla de bugs.

### 9a. Colaborador — casos de acceso y perfil

| # | Caso | Esperado |
|---|------|----------|
| X1 | PIN incorrecto 1 y 2 veces | Error claro "PIN incorrecto"; contador de intentos visible |
| X2 | PIN incorrecto 3 veces | Mensaje de cuenta bloqueada; no deja reintentar |
| X3 | Cerrar sesión y volver a intentar con la cuenta bloqueada | Sigue bloqueada (las cerradas de sesión no la reinician) |
| X4 | (Con SAP `10000003`, PIN pendiente) primer acceso: crear PIN de 4 dígitos; repetir distinto | Error si no coincide; éxito al coincidir |
| X5 | Crear PIN no numérico (letras) | Validación cliente; no llega a enviarse |
| X6 | Login correcto → recargar página (F5) | La sesión persiste; sigues dentro sin volver a loguear |
| X7 | Cerrar sesión → botón atrás del navegador | No reentra a la app con la sesión muerta |

### 9b. Colaborador — casos de petición

| # | Caso | Esperado |
|---|------|----------|
| X8 | Nueva petición sin ninguna línea o con línea vacía | Validación visible, no envía |
| X9 | Doble clic en el botón de enviar | Un solo envío (botón se desactiva con spinner) |
| X10 | Botas: cambiar tipo a escafandra y regresar | Los selects dependientes se reinician sin dejar combinaciones imposibles |
| X11 | Detalle de petición pendiente: no hay botón de confirmar recepción | El botón solo existe después de entregada |
| X12 | Confirmar la recepción dos veces (doble disparo rápido) | La segunda muestra el aviso de "ya confirmada" y re-consulta; sin error burdo |
| X13 | Recargar con una sesión expirada | Redirige a login con mensaje, no pantalla muerta |

### 9c. Admin/RH — permisos

| # | Caso | Esperado |
|---|------|----------|
| X14 | Login RH `80000001`; repetir acciones del guion B | RH tiene exactamente los mismos permisos que Admin |
| X15 | Con sesión de colaborador, recargar la página y buscar acceso a la gestión | No hay botones admin, ni pantallas de gestión accesibles desde la UI del colaborador |
| X16 | El header muestra nombre y rol correctos por sesión | Si cambias de usuario al recargar, el rol cambia |

### 9d. Admin/RH — estados y reglas

| # | Caso | Esperado |
|---|------|----------|
| X17 | Aprobar con ventana: hora de inicio posterior al fin | Error de ventana inválida; no guarda horario |
| X18 | Rechazar una petición ya entregada | Estado inválido: no se reabre (nunca vuelve atrás) |
| X19 | Marcar "Entregada" una petición que sigue pendiente (sin aprobar) | Estado inválido; la comprobación vive en la BD, no solo en la UI |
| X20 | Entregar una petición cuya línea pide más stock del disponible | Error identificando la prenda ("Stock insuficiente para …"); nada se descuenta |
| X21 | Petición aprobada con horario del colaborador: confirmar o reasignar la propuesta | Ambas rutas guardan la ventana final |
| X22 | Petición entregada con confirmación del colaborador | La marca queda visible en el detalle de admin (dentro de "Entregada") |

### 9e. Admin/RH — inventario y colaboradores

| # | Caso | Esperado |
|---|------|----------|
| X23 | Registrar entrada con cantidad 0, negativa o no numérica | Validación cliente; no envía |
| X24 | Registrar entrada de combinación inexistente en DB | Error "No existe la combinación…" mostrada en la pantalla, con Reintentar |
| X25 | Cargar un CSV pequeño con mezcla (1 válido + SAP corto + duplicado + vacío) | Vista previa con las cifras separadas; importación termina con resumen correcto |
| X26 | Importar el mismo archivo dos veces | Segunda vez: todo omitido; censo sin duplicados |
| X27 | Buscar en la lista de colaboradores por nombre parcial y por SAP | El filtro funciona al teclear, sin perder el foco |
| X28 | Colaborador con PIN pendiente vs registrado | Badge correcto en la tabla |

### 9f. Bitácora

| # | Caso | Esperado |
|---|------|----------|
| X29 | Fechas desde > hasta | Mensaje de error, sin romper la pantalla |
| X30 | Búsqueda sin coincidencias | Estado de "cadena vacía" legible |
| X31 | Combinación: chip de acción + usuario + fechas juntos | Los filtros se aplican todos a la vez |
| X32 | Si la bitácora lleva > 50 filas: "Más resultados" acumula páginas | Contador crece; sin duplicados entre páginas |

> Tip: con la BD recién reseteada la bitácora arranca con ~15 acciones del seed; X32 solo aplica después de una sesión larga o de una importación grande.

## 9. Limpieza después de la sesión

```bash
supabase db reset   # borra todo lo creado durante la prueba
```

- Verificar que las capturas de la sesión no contengan datos reales antes de guardarlas o publicarlas.
- Confirmar con `git status` que `Libro9.xlsx` no aparece (debe estar ignorado por `.gitignore`).
- Commits pequeños durante los ajustes del martes, uno por arreglo.

