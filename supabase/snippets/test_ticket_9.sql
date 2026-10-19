-- Prueba automatizada para Ticket 9: Función cambiar_estado
DO $$
DECLARE
    v_colaborador_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- Juan Pérez Demo
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000099';       -- Carlos Admin Demo
    v_rh_id UUID := 'a0000000-0000-0000-0000-000000000088';          -- Ana RH Demo
    v_peticion_id UUID;
    v_peticion_rec RECORD;
    v_conteo_bitacora INT;
    v_error_atrapado BOOLEAN;
    v_res JSONB;
BEGIN
    RAISE NOTICE '=== INICIANDO PRUEBAS TICKET 9: cambiar_estado ===';

    -- Crear una petición de prueba para el flujo
    v_peticion_id := crear_peticion(
        v_colaborador_id,
        'Desgaste regular',
        now() + INTERVAL '1 day',
        now() + INTERVAL '1 day 2 hours',
        jsonb_build_array(
            jsonb_build_object('prenda_tipo', 'pantalon', 'prenda_color', 'azul', 'prenda_talla', 'L')
        )
    );

    -- -------------------------------------------------------------
    -- PRUEBA 1: Solo Admin/RH pueden cambiar estado (Colaborador denegado)
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM cambiar_estado(
            v_colaborador_id,
            v_peticion_id,
            'aprobada',
            jsonb_build_object(
                'ventana_confirmada_inicio', now() + INTERVAL '1 day',
                'ventana_confirmada_fin', now() + INTERVAL '1 day 2 hours'
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ACCESO_DENEGADO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 1 PASÓ: Se bloqueó intento de cambio de estado por colaborador (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 1 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 1 FALLÓ: No lanzó error al intentar cambiar estado como colaborador.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 2: pendiente -> aprobada exige ventana_confirmada
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM cambiar_estado(
            v_admin_id,
            v_peticion_id,
            'aprobada',
            '{}'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%VENTANA_CONFIRMADA_REQUERIDA%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 2 PASÓ: Exige ventana confirmada para aprobar (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Permitió aprobar sin ventana confirmada.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 3: pendiente -> rechazada exige motivo_rechazo no vacío
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM cambiar_estado(
            v_admin_id,
            v_peticion_id,
            'rechazada',
            jsonb_build_object('motivo_rechazo', '   ')
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%MOTIVO_RECHAZO_REQUERIDO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 3 PASÓ: Exige motivo de rechazo no vacío (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 3 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 3 FALLÓ: Permitió rechazar sin motivo.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 4: Transición no permitida (pendiente -> en_proceso directo)
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM cambiar_estado(
            v_admin_id,
            v_peticion_id,
            'en_proceso',
            '{}'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Transición no permitida: pendiente → en_proceso' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 4 PASÓ: Bloqueó transición inválida (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Mensaje no coincide con el formato esperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Permitió salto inválido a en_proceso desde pendiente.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 5: Transición válida pendiente -> aprobada por RH
    -- -------------------------------------------------------------
    v_res := cambiar_estado(
        v_rh_id,
        v_peticion_id,
        'aprobada',
        jsonb_build_object(
            'ventana_confirmada_inicio', '2026-10-21T08:00:00Z'::timestamptz,
            'ventana_confirmada_fin', '2026-10-21T09:30:00Z'::timestamptz
        )
    );

    SELECT estado, ventana_confirmada_inicio, ventana_confirmada_fin, actualizada_en
    INTO v_peticion_rec
    FROM peticiones
    WHERE id = v_peticion_id;

    IF v_peticion_rec.estado <> 'aprobada' THEN
        RAISE EXCEPTION 'PRUEBA 5 FALLÓ: El estado no cambió a aprobada';
    END IF;

    IF v_peticion_rec.ventana_confirmada_inicio IS NULL OR v_peticion_rec.ventana_confirmada_fin IS NULL THEN
        RAISE EXCEPTION 'PRUEBA 5 FALLÓ: No se guardó la ventana confirmada';
    END IF;

    RAISE NOTICE '✓ PRUEBA 5 PASÓ: Transición pendiente → aprobada exitosa por RH con ventana guardada.';

    -- -------------------------------------------------------------
    -- PRUEBA 6: Transición válida aprobada -> en_proceso por Administrador
    -- -------------------------------------------------------------
    v_res := cambiar_estado(
        v_admin_id,
        v_peticion_id,
        'en_proceso',
        '{}'::jsonb
    );

    SELECT estado, actualizada_en INTO v_peticion_rec FROM peticiones WHERE id = v_peticion_id;
    IF v_peticion_rec.estado <> 'en_proceso' THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: El estado no cambió a en_proceso';
    END IF;

    RAISE NOTICE '✓ PRUEBA 6 PASÓ: Transición aprobada → en_proceso exitosa por Administrador.';

    -- -------------------------------------------------------------
    -- PRUEBA 7: Transición rechazada (con una nueva petición pendiente)
    -- -------------------------------------------------------------
    DECLARE
        v_pet_rechazada_id UUID;
    BEGIN
        v_pet_rechazada_id := crear_peticion(
            v_colaborador_id,
            'Prenda rota',
            now() + INTERVAL '2 days',
            now() + INTERVAL '2 days 1 hour',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'playera', 'prenda_color', 'gris', 'prenda_talla', 'XL')
            )
        );

        v_res := cambiar_estado(
            v_admin_id,
            v_pet_rechazada_id,
            'rechazada',
            jsonb_build_object('motivo_rechazo', 'No corresponde al ciclo de cambio solicitado.')
        );

        SELECT estado, motivo_rechazo INTO v_peticion_rec FROM peticiones WHERE id = v_pet_rechazada_id;
        IF v_peticion_rec.estado <> 'rechazada' OR v_peticion_rec.motivo_rechazo IS NULL THEN
            RAISE EXCEPTION 'PRUEBA 7 FALLÓ: No se guardó el rechazo con su motivo.';
        END IF;

        RAISE NOTICE '✓ PRUEBA 7 PASÓ: Transición pendiente → rechazada con motivo guardado exitosamente.';
    END;

    -- -------------------------------------------------------------
    -- PRUEBA 8: Verificación de bitácora
    -- -------------------------------------------------------------
    SELECT count(*) INTO v_conteo_bitacora
    FROM acciones_bitacora
    WHERE entidad = 'peticiones'
      AND entidad_id = v_peticion_id
      AND tipo_accion = 'cambiar_estado';

    IF v_conteo_bitacora < 2 THEN
        RAISE EXCEPTION 'PRUEBA 8 FALLÓ: Se esperaban al menos 2 registros en bitácora para la petición principal, se encontraron %', v_conteo_bitacora;
    END IF;

    RAISE NOTICE '✓ PRUEBA 8 PASÓ: Se verificaron los registros de trazabilidad en acciones_bitacora.';
    RAISE NOTICE '=== TODAS LAS PRUEBAS DEL TICKET 9 PASARON EXITOSAMENTE ===';
END $$;
