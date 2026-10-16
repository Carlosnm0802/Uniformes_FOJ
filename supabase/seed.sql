-- ============================================================================
-- Uniformes FOJ - Datos de Ejemplo (Seed)
-- ============================================================================
-- IMPORTANTE: Todos los datos son completamente ficticios (ningún dato real).
-- Credenciales de prueba:
-- ----------------------------------------------------------------------------
-- Rol          | SAP       | Nombre                | PIN      | Estado
-- ----------------------------------------------------------------------------
-- Colaborador  | 10000001  | Juan Pérez Demo       | 1234     | Activo
-- Colaborador  | 10000002  | María Gómez Demo      | 5678     | Activo
-- Colaborador  | 10000003  | Pedro López Demo      | [Ninguno]| PIN Pendiente (1er acceso)
-- Administrador| 90000001  | Carlos Admin Demo     | 9999     | Activo
-- RH           | 80000001  | Ana RH Demo           | 8888     | Activo
-- ============================================================================

-- 1. Usuarios de ejemplo
INSERT INTO usuarios (id, sap, nombre, rol, pin_hash, intentos_fallidos, bloqueado, pin_pendiente, creado_en)
VALUES
    ('a0000000-0000-0000-0000-000000000001', '10000001', 'Juan Pérez Demo', 'colaborador', crypt('1234', gen_salt('bf')), 0, FALSE, FALSE, now() - INTERVAL '10 days'),
    ('a0000000-0000-0000-0000-000000000002', '10000002', 'María Gómez Demo', 'colaborador', crypt('5678', gen_salt('bf')), 0, FALSE, FALSE, now() - INTERVAL '8 days'),
    ('a0000000-0000-0000-0000-000000000003', '10000003', 'Pedro López Demo', 'colaborador', NULL, 0, FALSE, TRUE, now() - INTERVAL '1 day'),
    ('a0000000-0000-0000-0000-000000000099', '90000001', 'Carlos Admin Demo', 'administrador', crypt('9999', gen_salt('bf')), 0, FALSE, FALSE, now() - INTERVAL '30 days'),
    ('a0000000-0000-0000-0000-000000000088', '80000001', 'Ana RH Demo', 'rh', crypt('8888', gen_salt('bf')), 0, FALSE, FALSE, now() - INTERVAL '30 days')
ON CONFLICT (sap) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol,
    pin_hash = EXCLUDED.pin_hash,
    intentos_fallidos = EXCLUDED.intentos_fallidos,
    bloqueado = EXCLUDED.bloqueado,
    pin_pendiente = EXCLUDED.pin_pendiente;

-- 2. Stock inicial en existencias (> 0 en más de 10 combinaciones)
-- Actualizamos existencias existentes y registramos entrada en movimientos_stock
DO $$
DECLARE
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000088'; -- Ana RH
    r RECORD;
BEGIN
    -- Escafandras (rojo, azul, gris) -> 25 c/u
    UPDATE existencias SET cantidad = 25 
    WHERE prenda_tipo = 'escafandra' AND prenda_color IN ('rojo', 'azul', 'gris');

    -- Pantalones (azul y gris, tallas M, L, XL) -> 20 c/u
    UPDATE existencias SET cantidad = 20 
    WHERE prenda_tipo = 'pantalon' AND prenda_color IN ('azul', 'gris') AND prenda_talla IN ('M', 'L', 'XL');

    -- Playeras (azul y gris, tallas M, L, XL) -> 20 c/u
    UPDATE existencias SET cantidad = 20 
    WHERE prenda_tipo = 'playera' AND prenda_color IN ('azul', 'gris') AND prenda_talla IN ('M', 'L', 'XL');

    -- Botas (tallas 26, 27, 28) -> 10 c/u
    UPDATE existencias SET cantidad = 10 
    WHERE prenda_tipo = 'botas' AND prenda_talla IN ('26', '27', '28');

    -- Registrar entradas iniciales en movimientos_stock para trazabilidad
    FOR r IN 
        SELECT id, cantidad FROM existencias WHERE cantidad > 0
    LOOP
        INSERT INTO movimientos_stock (existencia_id, tipo_movimiento, cantidad, peticion_id, usuario_id, rol_usuario, registrado_en)
        SELECT r.id, 'entrada', r.cantidad, NULL, v_admin_id, 'rh', now() - INTERVAL '15 days'
        WHERE NOT EXISTS (
            SELECT 1 FROM movimientos_stock 
            WHERE existencia_id = r.id AND tipo_movimiento = 'entrada' AND peticion_id IS NULL
        );
    END LOOP;
END $$;

-- 3. Peticiones de ejemplo en cada estado

-- 3.1 Petición PENDIENTE (Juan Pérez pide pantalón y playera por suciedad)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'pendiente',
    'suciedad',
    now() + INTERVAL '1 day' + INTERVAL '9 hours',
    now() + INTERVAL '1 day' + INTERVAL '11 hours',
    now() - INTERVAL '2 hours',
    now() - INTERVAL '2 hours'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'pantalon', 'azul', 'M', FALSE),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'playera', 'azul', 'M', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3.2 Petición APROBADA (María Gómez pide escafandra por daño; RH aprobó y confirmó ventana)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, ventana_confirmada_inicio, ventana_confirmada_fin, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'aprobada',
    'daño',
    now() + INTERVAL '1 day' + INTERVAL '14 hours',
    now() + INTERVAL '1 day' + INTERVAL '16 hours',
    now() + INTERVAL '1 day' + INTERVAL '14 hours',
    now() + INTERVAL '1 day' + INTERVAL '15 hours',
    now() - INTERVAL '1 day',
    now() - INTERVAL '18 hours'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'escafandra', 'rojo', 'unica', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3.3 Petición RECHAZADA (Juan Pérez pidió botas por motivo 'otro'; rechazada con motivo obligatorio)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, motivo_rechazo, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'rechazada',
    'otro',
    now() - INTERVAL '2 days',
    now() - INTERVAL '2 days' + INTERVAL '2 hours',
    'El colaborador ya cuenta con dotación completa vigente según revisión de supervisor.',
    now() - INTERVAL '3 days',
    now() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'botas', NULL, '27', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3.4 Petición EN PROCESO (María Gómez pide pantalón y playera; aprobada y en preparación)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, ventana_confirmada_inicio, ventana_confirmada_fin, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000002',
    'en_proceso',
    'suciedad',
    now() + INTERVAL '4 hours',
    now() + INTERVAL '6 hours',
    now() + INTERVAL '4 hours',
    now() + INTERVAL '5 hours',
    now() - INTERVAL '6 hours',
    now() - INTERVAL '1 hour'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'pantalon', 'gris', 'L', FALSE),
    ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'playera', 'gris', 'L', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3.5 Petición ENTREGADA CON DEVOLUCIÓN (Juan Pérez recibió playera y entregó la dañada; recepción confirmada)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, ventana_confirmada_inicio, ventana_confirmada_fin, observaciones, sin_devolucion, recepcion_confirmada, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'entregada',
    'daño',
    now() - INTERVAL '4 days',
    now() - INTERVAL '4 days' + INTERVAL '2 hours',
    now() - INTERVAL '4 days',
    now() - INTERVAL '4 days' + INTERVAL '1 hour',
    'Prenda entregada en buen estado. Se recibió prenda rota para desecho.',
    FALSE,
    TRUE,
    now() - INTERVAL '5 days',
    now() - INTERVAL '4 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000005', 'playera', 'azul', 'M', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3.6 Petición ENTREGADA SIN DEVOLUCIÓN (María Gómez recibió botas, pero no entregó las viejas; alerta visible)
INSERT INTO peticiones (id, usuario_id, estado, motivo, ventana_propuesta_inicio, ventana_propuesta_fin, ventana_confirmada_inicio, ventana_confirmada_fin, observaciones, sin_devolucion, recepcion_confirmada, creada_en, actualizada_en)
VALUES (
    'b0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000002',
    'entregada',
    'desgaste',
    now() - INTERVAL '2 days',
    now() - INTERVAL '2 days' + INTERVAL '2 hours',
    now() - INTERVAL '2 days',
    now() - INTERVAL '2 days' + INTERVAL '1 hour',
    'Colaboradora indica que olvidó las botas en su casillero; queda pendiente devolución.',
    TRUE,
    FALSE,
    now() - INTERVAL '3 days',
    now() - INTERVAL '2 days'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO lineas_peticion (id, peticion_id, prenda_tipo, prenda_color, prenda_talla, devuelta)
VALUES 
    ('c0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000006', 'botas', NULL, '26', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 4. Acciones en bitácora para trazabilidad de los ejemplos
INSERT INTO acciones_bitacora (id, usuario_id, rol_usuario, tipo_accion, entidad, entidad_id, detalle, registrado_en)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'colaborador', 'crear_peticion', 'peticiones', 'b0000000-0000-0000-0000-000000000001', '{"motivo": "suciedad"}'::jsonb, now() - INTERVAL '2 hours'),
    ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000088', 'rh', 'aprobar_peticion', 'peticiones', 'b0000000-0000-0000-0000-000000000002', '{"ventana": "confirmada"}'::jsonb, now() - INTERVAL '18 hours'),
    ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000099', 'administrador', 'rechazar_peticion', 'peticiones', 'b0000000-0000-0000-0000-000000000003', '{"motivo_rechazo": "Dotación vigente"}'::jsonb, now() - INTERVAL '2 days'),
    ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000099', 'administrador', 'entregar_peticion', 'peticiones', 'b0000000-0000-0000-0000-000000000005', '{"devolucion": true}'::jsonb, now() - INTERVAL '4 days'),
    ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000088', 'rh', 'entregar_peticion', 'peticiones', 'b0000000-0000-0000-0000-000000000006', '{"devolucion": false, "alerta": true}'::jsonb, now() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;
