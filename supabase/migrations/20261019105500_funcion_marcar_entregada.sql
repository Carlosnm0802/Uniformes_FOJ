-- Migración: Función atómica para marcar entregada con control transaccional de stock
-- Ticket 10: marcar_entregada(p_admin_id, p_peticion_id, p_devoluciones, p_observaciones)

CREATE OR REPLACE FUNCTION marcar_entregada(
    p_admin_id UUID,
    p_peticion_id UUID,
    p_devoluciones JSONB DEFAULT '[]'::jsonb,
    p_observaciones TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_admin RECORD;
    v_peticion RECORD;
    r_linea RECORD;
    v_existencia RECORD;
    v_elem JSONB;
    v_linea_id UUID;
    v_total_lineas INT := 0;
    v_lineas_devueltas INT := 0;
    v_sin_devolucion BOOLEAN := FALSE;
    v_ahora TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Verificar identidad y permisos del invocante (debe ser admin o RH)
    SELECT id, rol, bloqueado
    INTO v_admin
    FROM usuarios
    WHERE id = p_admin_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con ID % no registrado.', p_admin_id;
    END IF;

    IF v_admin.bloqueado THEN
        RAISE EXCEPTION 'CUENTA_BLOQUEADA: La cuenta se encuentra bloqueada.';
    END IF;

    IF v_admin.rol NOT IN ('administrador', 'rh') THEN
        RAISE EXCEPTION 'ACCESO_DENEGADO: Solo administradores o personal de RH pueden marcar peticiones como entregadas.';
    END IF;

    -- 2. Obtener y bloquear la petición; debe estar estrictamente en 'en_proceso'
    SELECT id, usuario_id, estado, observaciones
    INTO v_peticion
    FROM peticiones
    WHERE id = p_peticion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PETICION_NO_ENCONTRADA: Petición con ID % no encontrada.', p_peticion_id;
    END IF;

    IF v_peticion.estado <> 'en_proceso' THEN
        RAISE EXCEPTION 'ESTADO_INVALIDO: Solo se pueden entregar peticiones que estén en estado "en_proceso" (estado actual: %).', v_peticion.estado;
    END IF;

    -- 3. Recorrer y descontar stock transaccionalmente para cada prenda de la petición
    -- Se utiliza SELECT ... FOR UPDATE en existencias para evitar condiciones de carrera
    FOR r_linea IN 
        SELECT id, prenda_tipo, prenda_color, prenda_talla 
        FROM lineas_peticion 
        WHERE peticion_id = p_peticion_id
    LOOP
        v_total_lineas := v_total_lineas + 1;

        SELECT id, cantidad
        INTO v_existencia
        FROM existencias
        WHERE prenda_tipo = r_linea.prenda_tipo
          AND (
            (prenda_color IS NULL AND r_linea.prenda_color IS NULL) OR 
            (prenda_color = r_linea.prenda_color)
          )
          AND (
            (prenda_talla IS NULL AND r_linea.prenda_talla IS NULL) OR 
            (prenda_talla = r_linea.prenda_talla)
          )
        FOR UPDATE;

        IF NOT FOUND OR v_existencia.cantidad < 1 THEN
            RAISE EXCEPTION 'Stock insuficiente para %', CONCAT_WS(' ', r_linea.prenda_tipo, r_linea.prenda_color, r_linea.prenda_talla);
        END IF;

        -- Descontar 1 unidad en existencias
        UPDATE existencias
        SET cantidad = cantidad - 1
        WHERE id = v_existencia.id;

        -- Registrar salida en movimientos_stock
        INSERT INTO movimientos_stock (
            existencia_id,
            tipo_movimiento,
            cantidad,
            peticion_id,
            usuario_id,
            rol_usuario,
            registrado_en
        ) VALUES (
            v_existencia.id,
            'salida',
            1,
            p_peticion_id,
            p_admin_id,
            v_admin.rol::TEXT,
            v_ahora
        );
    END LOOP;

    -- Validar que la petición haya tenido al menos una línea
    IF v_total_lineas = 0 THEN
        RAISE EXCEPTION 'LINEAS_REQUERIDAS: La petición no contiene prendas para entregar.';
    END IF;

    -- 4. Registrar devoluciones en lineas_peticion
    IF p_devoluciones IS NOT NULL AND jsonb_typeof(p_devoluciones) = 'array' THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_devoluciones)
        LOOP
            IF jsonb_typeof(v_elem) = 'string' THEN
                v_linea_id := (v_elem#>>'{}')::UUID;
            ELSIF jsonb_typeof(v_elem) = 'object' THEN
                IF COALESCE((v_elem->>'devuelta')::BOOLEAN, TRUE) = TRUE THEN
                    v_linea_id := (COALESCE(v_elem->>'linea_id', v_elem->>'id'))::UUID;
                ELSE
                    v_linea_id := NULL;
                END IF;
            ELSE
                v_linea_id := NULL;
            END IF;

            IF v_linea_id IS NOT NULL THEN
                UPDATE lineas_peticion
                SET devuelta = TRUE
                WHERE id = v_linea_id AND peticion_id = p_peticion_id;
            END IF;
        END LOOP;
    END IF;

    -- 5. Contar cuántas líneas quedaron marcadas como devueltas
    SELECT count(*)
    INTO v_lineas_devueltas
    FROM lineas_peticion
    WHERE peticion_id = p_peticion_id AND devuelta = TRUE;

    -- Si no se cubrieron todas las líneas pedidas, marcar sin_devolucion = true
    IF v_lineas_devueltas < v_total_lineas THEN
        v_sin_devolucion := TRUE;
    ELSE
        v_sin_devolucion := FALSE;
    END IF;

    -- 6. Actualizar estado de la petición a 'entregada'
    UPDATE peticiones
    SET estado = 'entregada',
        observaciones = COALESCE(TRIM(p_observaciones), observaciones),
        sin_devolucion = v_sin_devolucion,
        actualizada_en = v_ahora
    WHERE id = p_peticion_id;

    -- 7. Registrar auditoría en acciones_bitacora
    INSERT INTO acciones_bitacora (
        usuario_id,
        rol_usuario,
        tipo_accion,
        entidad,
        entidad_id,
        detalle
    ) VALUES (
        p_admin_id,
        v_admin.rol::TEXT,
        'marcar_entregada',
        'peticiones',
        p_peticion_id,
        jsonb_build_object(
            'estado_anterior', 'en_proceso',
            'nuevo_estado', 'entregada',
            'total_lineas', v_total_lineas,
            'lineas_devueltas', v_lineas_devueltas,
            'sin_devolucion', v_sin_devolucion,
            'observaciones', TRIM(p_observaciones)
        )
    );

    RETURN jsonb_build_object(
        'peticion_id', p_peticion_id,
        'estado', 'entregada',
        'total_lineas', v_total_lineas,
        'lineas_devueltas', v_lineas_devueltas,
        'sin_devolucion', v_sin_devolucion,
        'actualizada_en', v_ahora
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
