-- Migración: Función transaccional para registrar entradas de stock
-- Ticket 20: registrar_entrada(p_admin_id, p_prenda_tipo, p_prenda_color, p_prenda_talla, p_cantidad)
-- Reemplaza el flujo de 3 pasos del cliente, cuyo INSERT en movimientos_stock
-- fallaba por RLS y dejaba el stock incrementado sin movimiento ni autor.

CREATE OR REPLACE FUNCTION registrar_entrada(
    p_admin_id UUID,
    p_prenda_tipo TEXT,
    p_cantidad INTEGER,
    p_prenda_color TEXT DEFAULT NULL,
    p_prenda_talla TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_admin RECORD;
    v_existencia RECORD;
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
        RAISE EXCEPTION 'ACCESO_DENEGADO: Solo administradores o personal de RH pueden registrar entradas de stock.';
    END IF;

    -- 2. Validar cantidad
    IF p_cantidad IS NULL OR p_cantidad < 1 THEN
        RAISE EXCEPTION 'CANTIDAD_INVALIDA: La cantidad debe ser un número entero mayor a 0.';
    END IF;

    -- 3. Localizar y bloquear la existencia correspondiente (combinación exacta)
    SELECT id, cantidad
    INTO v_existencia
    FROM existencias
    WHERE prenda_tipo::TEXT = p_prenda_tipo
      AND (
        (prenda_color IS NULL AND p_prenda_color IS NULL) OR
        (prenda_color = p_prenda_color)
      )
      AND (
        (prenda_talla IS NULL AND p_prenda_talla IS NULL) OR
        (prenda_talla = p_prenda_talla)
      )
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXISTENCIA_NO_ENCONTRADA: No existe la combinación de prenda especificada: %', CONCAT_WS(' ', p_prenda_tipo, p_prenda_color, p_prenda_talla);
    END IF;

    -- 4. Incrementar cantidad
    UPDATE existencias
    SET cantidad = cantidad + p_cantidad
    WHERE id = v_existencia.id;

    -- 5. Registrar el movimiento de entrada con autor y rol
    INSERT INTO movimientos_stock (
        existencia_id,
        tipo_movimiento,
        cantidad,
        usuario_id,
        rol_usuario
    ) VALUES (
        v_existencia.id,
        'entrada',
        p_cantidad,
        p_admin_id,
        v_admin.rol::TEXT
    );

    -- 6. Registrar acción en la bitácora
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
        'registrar_entrada',
        'existencias',
        v_existencia.id,
        jsonb_build_object(
            'prenda_tipo', p_prenda_tipo,
            'prenda_color', p_prenda_color,
            'prenda_talla', p_prenda_talla,
            'cantidad', p_cantidad,
            'nueva_cantidad', v_existencia.cantidad + p_cantidad
        )
    );

    RETURN jsonb_build_object(
        'existencia_id', v_existencia.id,
        'nueva_cantidad', v_existencia.cantidad + p_cantidad
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
