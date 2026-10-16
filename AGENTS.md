# AGENTS.md: sistema de cambio de uniformes (Nestlé)

Reglas de trabajo para cualquier agente de código en este repositorio. El contexto del producto está en `brief-contexto.md`; léelo antes de empezar. Si algo no está en el brief, **no está decidido**.

## 1. Reglas de trabajo con Carlos
1. **Un ticket a la vez.** Trabaja solo el ticket que se te pida ("implementa el ticket X"). Nunca "construye el proyecto".
2. **No toques nada fuera del ticket.** Si crees que hace falta, **detente y pregunta por qué** antes de hacerlo.
3. **No inventes requisitos.** Si hay una ambigüedad, un hueco o una contradicción, márcala como `[POR DEFINIR]`, plantea 2 o 3 opciones con su costo y espera la decisión de Carlos. No elijas por él.
4. **No rediseñes.** Las decisiones del brief son de Carlos. Puedes señalar problemas, no cambiarlas.
5. **Cambios pequeños y legibles.** Carlos lee cada diff línea por línea y reescribe al menos una parte con sus propias palabras. Explica brevemente cada decisión técnica para que pueda defenderla en una entrevista.
6. **Al terminar un ticket:** di qué hiciste, qué archivos tocaste y qué no pudiste verificar. No resumas pasos de más.
7. **Fecha límite:** funcionando el martes 20 de octubre de 2026. Si algo se atrasa, recorta según el orden del brief (sección 9), no improvises otro.

## 2. Stack y estructura
- Front: JavaScript puro con módulos ES, sin frameworks. Back: Supabase (PostgreSQL, Auth, reglas de acceso). Formato: PWA.
- **Todo acceso a Supabase pasa por un único módulo de datos** en el front. Las pantallas nunca llaman a Supabase directamente.
- **Separa lógica y dibujado:** las reglas y llamadas viven en módulos propios; las pantallas solo los usan.
- **Reglas críticas en funciones de PostgreSQL**, en una sola transacción: transiciones de estado y descuento de stock. No las dupliques en el front como única defensa.
- **Esquema en migraciones SQL versionadas** en el repositorio. Nunca cambies el esquema a mano desde el panel de Supabase sin dejar la migración.
- No añadas dependencias sin preguntar.

## 3. Reglas del dominio que no se rompen
- Estados: **Pendiente → Aprobada o Rechazada → En proceso → Entregada.** No agregues estados. La confirmación del colaborador es una marca dentro de Entregada, no un estado.
- Administrador y RH tienen los mismos permisos; **cada acción guarda id de usuario y rol** desde el inicio.
- Rechazar exige motivo (texto libre).
- Aprobar fija la ventana (confirma o reasigna la propuesta del colaborador) y muestra disponibilidad de stock.
- **El stock baja solo al marcar Entregada**, de forma transaccional. Nunca debe quedar negativo; qué hacer cuando no alcanza es un pendiente (brief, sección 11), así que pregunta a Carlos.
- La devolución es opcional y solo la registra administrador o RH; si falta, hay alerta visible.
- Catálogo: escafandra = talla única; pantalón y playera = S, M, L, XL, XXL, XXXL, 4XL; botas = 22 a 31 enteros y sin color; colores: rojo, verde, rosa, azul, morado, gris.
- El motivo "talla" no es válido para líneas de escafandra.
- El colaborador solo ve lo suyo y **nunca ve el inventario**.

## 4. Seguridad y datos
- **Identificación:** SAP + PIN de 4 dígitos. El PIN se guarda con **hash**, nunca en texto plano. Bloqueo tras 3 intentos fallidos.
- Reglas de acceso a nivel de base de datos (RLS) para cada tabla; no confíes solo en esconder botones en la interfaz.
- **No subas llaves, tokens ni datos reales al repositorio.** Solo datos de ejemplo. Los números SAP y nombres reales de empleados no van en el código, en pruebas ni en capturas.
- Mientras la planta no confirme el alojamiento de datos de empleados, se trabaja solo con datos de ejemplo.

## 5. Pruebas
- Prueba, como mínimo, la **máquina de estados** y el **descuento de stock**. Las pruebas son el contrato para un futuro refactor.
- No hagas pruebas de pantallas a menos que se pidan.
- Antes de dar un ticket por terminado, ejecuta las pruebas existentes y di cuáles corriste.

## 6. Convenciones
- Repositorio y ramas en kebab-case. Commits pequeños, uno por ticket.
- Código y nombres técnicos en inglés o español según lo que ya exista en el repo; no mezcles en un mismo módulo.
- Idioma de la interfaz: español `[POR DEFINIR: confirmar]`.
- Si Carlos pide un commit o PR, termina el mensaje con las líneas de atribución que indique el entorno.

## 7. Qué NO hacer
- Cancelar petición, pantallas Inicio y Perfil, "¿Olvidaste tu acceso?", modo sin internet y CI/CD: **fuera del primer alcance**.
- No cargar el stock inicial con una pantalla: lo carga Carlos a mano en Supabase.
- No resolver por tu cuenta los pendientes de la sección 11 del brief.
