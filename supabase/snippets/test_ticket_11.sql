-- Prueba automatizada para Ticket 11: Función confirmar_recepcion
DO $$
DECLARE
    v_colaborador_1 UUID := 'a0000000-0000-0000-0000-000000000001'; -- Juan Pérez Demo
    v_colaborador_2 UUID := 'a0000000-0000-0000-0000-000000000002'; -- María Gómez Demo
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000099';       -- Carlos Admin Demo
    
    v_pet_id UUID;
    v_pet_rec RECORD;
    v_conteo_bitacora INT;
    v_error_atrapado BOOLEAN;
    v_res JSONB;
BEGIN
    RAISE NOTICE '=== INICIANDO PRUEBAS TICKET 11: confirmar_recepcion ===';

    -- -------------------------------------------------------------
    -- PREPARACIÓN: Crear petición para colaborador 1
    -- -------------------------------------------------------------
    v_pet_id := crear_peticion(
        v_colaborador_1,
        'Renovación anual',
        now() + INTERVAL '1 day',
        now() + INTERVAL '1 day 2 hours',
        jsonb_build_array(
            jsonb_build_object('prenda_tipo', 'playera', 'prenda_color', 'azul', 'prenda_talla', 'L')
        )
    );

    -- -------------------------------------------------------------
    -- PRUEBA 1: Solo se puede confirmar si está en estado 'entregada'
    -- (Actualmente está en 'pendiente')
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM confirmar_recepcion(v_colaborador_1, v_pet_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ESTADO_INVALIDO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 1 PASÓ: Rechazó confirmación en estado pendiente (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 1 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 1 FALLÓ: Permitió confirmar en estado pendiente.';
    END IF;

    -- Pasamos a aprobada y en_proceso
    PERFORM cambiar_estado(
        v_admin_id, 
        v_pet_id, 
        'aprobada', 
        jsonb_build_object('ventana_confirmada_inicio', now(), 'ventana_confirmada_fin', now() + INTERVAL '1 hour')
    );
    PERFORM cambiar_estado(v_admin_id, v_pet_id, 'en_proceso', '{}'::jsonb);

    -- Marcamos como entregada (Ticket 10)
    PERFORM marcar_entregada(v_admin_id, v_pet_id, '[]'::jsonb, 'Entrega en ventanilla');

    -- -------------------------------------------------------------
    -- PRUEBA 2: Solo el dueño puede confirmar (colaborador 2 denegado)
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM confirmar_recepcion(v_colaborador_2, v_pet_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ACCESO_DENEGADO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 2 PASÓ: Bloqueó confirmación por usuario distinto al solicitante (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Permitió que otro colaborador confirmara.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 3: Confirmación exitosa por el colaborador solicitante
    -- -------------------------------------------------------------
    v_res := confirmar_recepcion(v_colaborador_1, v_pet_id);

    SELECT estado, recepcion_confirmada INTO v_pet_rec FROM peticiones WHERE id = v_pet_id;

    IF v_pet_rec.estado <> 'entregada' THEN
        RAISE EXCEPTION 'PRUEBA 3 FALLÓ: El estado de la petición cambió (esperado: entregada, obtenido: %)', v_pet_rec.estado;
    END IF;

    IF v_pet_rec.recepcion_confirmada <> TRUE THEN
        RAISE EXCEPTION 'PRUEBA 3 FALLÓ: recepcion_confirmada no se marcó como TRUE';
    END IF;

    RAISE NOTICE '✓ PRUEBA 3 PASÓ: Confirmación de recepción exitosa (recepcion_confirmada = true, estado = entregada).';

    -- -------------------------------------------------------------
    -- PRUEBA 4: Error al intentar confirmar de nuevo ('Recepción ya confirmada')
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM confirmar_recepcion(v_colaborador_1, v_pet_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Recepción ya confirmada' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 4 PASÓ: Bloqueó doble confirmación con mensaje exacto (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Mensaje no coincide con el esperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Permitió doble confirmación.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 5: Registro en bitácora de auditoría
    -- -------------------------------------------------------------
    SELECT count(*) INTO v_conteo_bitacora
    FROM acciones_bitacora
    WHERE entidad = 'peticiones'
      AND entidad_id = v_pet_id
      AND tipo_accion = 'confirmar_recepcion'
      AND usuario_id = v_colaborador_1;

    IF v_conteo_bitacora <> 1 THEN
        RAISE EXCEPTION 'PRUEBA 5 FALLÓ: No se encontró registro en bitácora para la confirmación de recepción';
    END IF;

    RAISE NOTICE '✓ PRUEBA 5 PASÓ: Bitácora registrada correctamente para confirmar_recepcion.';
    RAISE NOTICE '=== TODAS LAS PRUEBAS DEL TICKET 11 PASARON EXITOSAMENTE ===';
END $$;
