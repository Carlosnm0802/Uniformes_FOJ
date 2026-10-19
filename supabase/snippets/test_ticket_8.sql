-- Prueba automatizada para Ticket 8: Función crear_peticion
DO $$
DECLARE
    v_colaborador_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- Juan Pérez Demo
    v_admin_id UUID := 'a0000000-0000-0000-0000-000000000099';       -- Carlos Admin Demo
    v_peticion_id UUID;
    v_conteo_lineas INT;
    v_conteo_bitacora INT;
    v_estado_creado estado_peticion;
    v_error_atrapado BOOLEAN;
BEGIN
    RAISE NOTICE '=== INICIANDO PRUEBAS TICKET 8: crear_peticion ===';

    -- -------------------------------------------------------------
    -- PRUEBA 1: Solo los colaboradores pueden crear peticiones
    -- Intentar crear con ID de un Administrador debe fallar
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM crear_peticion(
            v_admin_id,
            'Cambio por suciedad',
            now(),
            now() + INTERVAL '2 hours',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'playera', 'prenda_color', 'azul', 'prenda_talla', 'M')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%SOLO_COLABORADORES%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 1 PASÓ: Se bloqueó creación por usuario que no es colaborador (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 1 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 1 FALLÓ: No lanzó error al pasar un admin.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 2: Bloquea motivo 'talla' si alguna línea es 'escafandra'
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM crear_peticion(
            v_colaborador_id,
            'talla',
            now(),
            now() + INTERVAL '2 hours',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'escafandra', 'prenda_color', 'azul', 'prenda_talla', 'unica')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%MOTIVO_INVALIDO%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 2 PASÓ: Se bloqueó motivo talla con escafandra (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 2 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 2 FALLÓ: No bloqueó motivo talla para escafandra.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 3: Valida cada línea con es_combinacion_valida()
    -- Combinación inválida: botas con color
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM crear_peticion(
            v_colaborador_id,
            'daño',
            now(),
            now() + INTERVAL '2 hours',
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'botas', 'prenda_color', 'rojo', 'prenda_talla', '27')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%COMBINACION_INVALIDA%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 3 PASÓ: Rechazó combinación inválida en prendas (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 3 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 3 FALLÓ: No validó combinación inválida.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 4: Petición sin prendas debe fallar
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM crear_peticion(
            v_colaborador_id,
            'daño',
            now(),
            now() + INTERVAL '2 hours',
            '[]'::jsonb
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%LINEAS_REQUERIDAS%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 4 PASÓ: Rechazó petición sin líneas (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 4 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 4 FALLÓ: No validó array de líneas vacío.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 5: Ventana de tiempo inválida (fin < inicio) debe fallar
    -- -------------------------------------------------------------
    v_error_atrapado := FALSE;
    BEGIN
        PERFORM crear_peticion(
            v_colaborador_id,
            'daño',
            now() + INTERVAL '5 hours',
            now(),
            jsonb_build_array(
                jsonb_build_object('prenda_tipo', 'playera', 'prenda_color', 'azul', 'prenda_talla', 'L')
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%VENTANA_INVALIDA%' THEN
            v_error_atrapado := TRUE;
            RAISE NOTICE '✓ PRUEBA 5 PASÓ: Rechazó ventana con fin menor a inicio (%s)', SQLERRM;
        ELSE
            RAISE EXCEPTION 'PRUEBA 5 FALLÓ: Error inesperado: %', SQLERRM;
        END IF;
    END;
    IF NOT v_error_atrapado THEN
        RAISE EXCEPTION 'PRUEBA 5 FALLÓ: No validó ventana inválida.';
    END IF;

    -- -------------------------------------------------------------
    -- PRUEBA 6: Creación exitosa atómica (petición + líneas + bitácora)
    -- -------------------------------------------------------------
    v_peticion_id := crear_peticion(
        v_colaborador_id,
        'Desgaste natural de uso',
        now() + INTERVAL '1 hour',
        now() + INTERVAL '3 hours',
        jsonb_build_array(
            jsonb_build_object('prenda_tipo', 'escafandra', 'prenda_color', 'azul', 'prenda_talla', 'unica'),
            jsonb_build_object('prenda_tipo', 'pantalon', 'prenda_color', 'gris', 'prenda_talla', 'M')
        )
    );

    IF v_peticion_id IS NULL THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: v_peticion_id regresó NULL';
    END IF;

    -- Verificar estado en tabla peticiones
    SELECT estado INTO v_estado_creado FROM peticiones WHERE id = v_peticion_id;
    IF v_estado_creado <> 'pendiente' THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: La petición no se creó en estado pendiente (estado: %)', v_estado_creado;
    END IF;

    -- Verificar inserción de líneas de petición
    SELECT count(*) INTO v_conteo_lineas FROM lineas_peticion WHERE peticion_id = v_peticion_id;
    IF v_conteo_lineas <> 2 THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: Se esperaban 2 líneas insertadas, se encontraron %', v_conteo_lineas;
    END IF;

    -- Verificar registro en bitácora
    SELECT count(*) INTO v_conteo_bitacora 
    FROM acciones_bitacora 
    WHERE entidad = 'peticiones' 
      AND entidad_id = v_peticion_id 
      AND tipo_accion = 'crear_peticion';

    IF v_conteo_bitacora <> 1 THEN
        RAISE EXCEPTION 'PRUEBA 6 FALLÓ: No se encontró registro en acciones_bitacora para la petición';
    END IF;

    RAISE NOTICE '✓ PRUEBA 6 PASÓ: Petición % creada exitosamente en estado pendiente con 2 líneas y bitácora registrada.', v_peticion_id;
    RAISE NOTICE '=== TODAS LAS PRUEBAS DEL TICKET 8 PASARON EXITOSAMENTE ===';
END $$;
