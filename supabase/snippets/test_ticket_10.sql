-- Prueba automatizada para Ticket 10: Función marcar_entregada con stock transaccional
DO $$
DECLARE
    v_colaborador_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- Juan Pérez Demo
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000099';       -- Carlos Admin Demo
    v_rh_id UUID := 'a0000000-0000-0000-0000-000000000088';          -- Ana RH Demo
    
    v_pet_id UUID;
    v_linea_1 UUID;
    v_linea_2 UUID;
    v_stock_antes INT;
    v_stock_despues INT;
    v_movimientos_count INT;
    v_bitacora_count INT;
    v_pet_rec RECORD;
    v_error_atrapado BOOLEAN;
    v_res JSONB;
BEGIN
    RAISE NOTICE '=== INICIANDO PRUEBAS TICKET 10: marcar_entregada ===';

    -- -------------------------------------------------------------
    -- PREPARACIÓN: Petición con prendas con stock disponible (azul M)
    -- -------------------------------------------------------------
    v_pet_id := crear_peticion(
        v_colaborador_id,
        'Cambio periódico',
        now() + INTERVAL '1 day',
        now() + INTERVAL '1 day 2 hours',
        jsonb_build_array(
            jsonb_build_object('prenda_tipo', 'escafandra', 'prenda_color', 'azul', 'prenda_talla', 'unica'),
            jsonb_build_object('prenda_tipo', 'pantalon', 'prenda_color', 'azul', 'prenda_talla', 'M')
        )
    );

    SELECT id INTO v_linea_1 FROM lineas_peticion WHERE peticion_id = v_pet_id AND prenda_tipo = 'escafandra';
    SELECT id INTO v_linea_2 FROM lineas_peticion WHERE peticion_id = v_pet_id AND prenda_tipo = 'pantalon';

    -- -------------------------------------------------------------
    -- PRUEBA 1: Solo Admin/RH pueden marcar entregada (Colaborador denegado)
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM marcar_entregada(v_colaborador_id, v_pet_id, '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ACCESO_DENEGADO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 1 PASÓ: Se bloqueó intento por colaborador (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 1 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 1 FALLÓ: No validó rol para marcar entregada.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 2: Solo peticiones en 'en_proceso' pueden entregarse
    -- (v_pet_id está actualmente en 'pendiente')
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM marcar_entregada(v_admin_id, v_pet_id, '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%ESTADO_INVALIDO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 2 PASÓ: Bloqueó entrega de petición en estado pendiente (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Permitió entregar sin estar en_proceso.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 3: Stock insuficiente bloquea la entrega y revierte todo
    -- Creamos petición con prenda sin existencias (cantidad = 0)
    -- -------------------------------------------------------------
    DECLARE
        v_pet_sin_stock UUID;
    BEGIN
        -- Aseguramos que pantalon verde 4XL tenga stock = 0
        UPDATE existencias SET cantidad = 0 
        WHERE prenda_tipo = 'pantalon' AND prenda_color = 'verde' AND prenda_talla = '4XL';

        v_pet_sin_stock := crear_peticion(
            v_colaborador_id,
            'Talla grande',
            now() + INTERVAL '1 day',
            now() + INTERVAL '1 day 2 hours',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'pantalon', 'prenda_color', 'verde', 'prenda_talla', '4XL')
            )
        );

        -- Transición: pendiente -> aprobada -> en_proceso
        PERFORM cambiar_estado(
            v_admin_id, 
            v_pet_sin_stock, 
            'aprobada', 
            jsonb_build_object('ventana_confirmada_inicio', now(), 'ventana_confirmada_fin', now() + INTERVAL '1 hour')
        );
        PERFORM cambiar_estado(v_admin_id, v_pet_sin_stock, 'en_proceso', '{}'::jsonb);

        -- Intentar entregar: DEBE fallar por stock insuficiente
        v_error_atrapado := FALSE;
        BEGIN
            PERFORM marcar_entregada(v_admin_id, v_pet_sin_stock, '[]'::jsonb);
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%Stock insuficiente para pantalon verde 4XL%' THEN
                v_error_atrapado := TRUE;
                RAISE NOTICE '✓ PRUEBA 3 PASÓ: Se bloqueó entrega por falta de stock: (%s)', SQLERRM;
            ELSE
                RAISE EXCEPTION 'PRUEBA 3 FALLÓ: Mensaje no esperado: %', SQLERRM;
            END IF;
        END;
        IF NOT v_error_atrapado THEN
            RAISE EXCEPTION 'PRUEBA 3 FALLÓ: Permitió entrega sin existencias disponibles.';
        END IF;

        -- Verificar que la petición sigue en 'en_proceso' (reversión atómica)
        SELECT estado INTO v_pet_rec FROM peticiones WHERE id = v_pet_sin_stock;
        IF v_pet_rec.estado <> 'en_proceso' THEN
            RAISE EXCEPTION 'PRUEBA 3 FALLÓ: La petición no mantuvo estado en_proceso tras rollback';
        END IF;
    END;

    -- -------------------------------------------------------------
    -- PRUEBA 4: Entrega exitosa con devolución parcial (sin_devolucion = true)
    -- y descuento de stock transaccional
    -- -------------------------------------------------------------
    -- Pasamos la petición v_pet_id a aprobada y luego a en_proceso
    PERFORM cambiar_estado(
        v_rh_id, 
        v_pet_id, 
        'aprobada', 
        jsonb_build_object('ventana_confirmada_inicio', now(), 'ventana_confirmada_fin', now() + INTERVAL '2 hours')
    );
    PERFORM cambiar_estado(v_rh_id, v_pet_id, 'en_proceso', '{}'::jsonb);

    -- Consultar stock previo de escafandra azul
    SELECT cantidad INTO v_stock_antes 
    FROM existencias 
    WHERE prenda_tipo = 'escafandra' AND prenda_color = 'azul' AND prenda_talla = 'unica';

    -- Solo se devuelve la línea 1 (escafandra), no la 2 (pantalon)
    v_res := marcar_entregada(
        v_rh_id,
        v_pet_id,
        jsonb_build_array(v_linea_1),
        'Entrega realizada en ventanilla. Faltó devolver pantalón.'
    );

    -- Verificar que el estado cambió a 'entregada' y sin_devolucion = true
    SELECT estado, sin_devolucion, observaciones INTO v_pet_rec 
    FROM peticiones 
    WHERE id = v_pet_id;

    IF v_pet_rec.estado <> 'entregada' THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: El estado no es entregada (es %)', v_pet_rec.estado;
    END IF;

    IF v_pet_rec.sin_devolucion <> TRUE THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Se esperaba sin_devolucion = TRUE al no devolver todas las prendas';
    END IF;

    -- Verificar que escafandra quedó con devuelta = TRUE y pantalon con devuelta = FALSE
    IF (SELECT devuelta FROM lineas_peticion WHERE id = v_linea_1) <> TRUE THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: La línea devuelta no se marcó correctamente.';
    END IF;
    IF (SELECT devuelta FROM lineas_peticion WHERE id = v_linea_2) <> FALSE THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: La línea no devuelta se marcó erróneamente.';
    END IF;

    -- Verificar que el stock de escafandra azul bajó exactamente en 1 unidad
    SELECT cantidad INTO v_stock_despues 
    FROM existencias 
    WHERE prenda_tipo = 'escafandra' AND prenda_color = 'azul' AND prenda_talla = 'unica';

    IF v_stock_despues <> (v_stock_antes - 1) THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: El stock no bajó en 1 unidad (antes: %, despues: %)', v_stock_antes, v_stock_despues;
    END IF;

    -- Verificar que se crearon los registros en movimientos_stock
    SELECT count(*) INTO v_movimientos_count
    FROM movimientos_stock
    WHERE peticion_id = v_pet_id AND tipo_movimiento = 'salida';

    IF v_movimientos_count <> 2 THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Se esperaban 2 salidas en movimientos_stock, se encontraron %', v_movimientos_count;
    END IF;

    RAISE NOTICE '✓ PRUEBA 4 PASÓ: Entrega con devolución parcial y descuento de stock exitosos.';

    -- -------------------------------------------------------------
    -- PRUEBA 5: Entrega con devolución total (sin_devolucion = false)
    -- -------------------------------------------------------------
    DECLARE
        v_pet_completa UUID;
        v_linea_unica UUID;
    BEGIN
        v_pet_completa := crear_peticion(
            v_colaborador_id,
            'Suciedad extrema',
            now() + INTERVAL '1 day',
            now() + INTERVAL '1 day 2 hours',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'playera', 'prenda_color', 'azul', 'prenda_talla', 'M')
            )
        );

        SELECT id INTO v_linea_unica FROM lineas_peticion WHERE peticion_id = v_pet_completa;

        PERFORM cambiar_estado(
            v_admin_id, 
            v_pet_completa, 
            'aprobada', 
            jsonb_build_object('ventana_confirmada_inicio', now(), 'ventana_confirmada_fin', now() + INTERVAL '1 hour')
        );
        PERFORM cambiar_estado(v_admin_id, v_pet_completa, 'en_proceso', '{}'::jsonb);

        -- Entregar devolviendo la prenda
        PERFORM marcar_entregada(
            v_admin_id,
            v_pet_completa,
            jsonb_build_array(v_linea_unica),
            'Entrega completa con prenda sucia devuelta.'
        );

        SELECT estado, sin_devolucion INTO v_pet_rec FROM peticiones WHERE id = v_pet_completa;

        IF v_pet_rec.sin_devolucion <> FALSE THEN
            RAISE EXCEPTION 'PRUEBA 5 FALLÓ: Se esperaba sin_devolucion = FALSE cuando se devuelven todas las prendas';
        END IF;

        RAISE NOTICE '✓ PRUEBA 5 PASÓ: Entrega con devolución total marcó sin_devolucion = false.';
    END;

    -- -------------------------------------------------------------
    -- PRUEBA 6: Registro en bitácora
    -- -------------------------------------------------------------
    SELECT count(*) INTO v_bitacora_count
    FROM acciones_bitacora
    WHERE entidad = 'peticiones'
      AND entidad_id = v_pet_id
      AND tipo_accion = 'marcar_entregada';

    IF v_bitacora_count <> 1 THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: No se encontró registro en acciones_bitacora para la entrega';
    END IF;

    RAISE NOTICE '✓ PRUEBA 6 PASÓ: Bitácora registrada correctamente con autor, rol y detalle.';
    RAISE NOTICE '=== TODAS LAS PRUEBAS DEL TICKET 10 PASARON EXITOSAMENTE ===';
END $$;
