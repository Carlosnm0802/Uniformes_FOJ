-- Migración: Función para confirmación de recepción de uniforme por el colaborador
-- Ticket 11: confirmar_recepcion(p_usuario_id, p_peticion_id)

CREATE OR REPLACE FUNCTION confirmar_recepcion(
    p_usuario_id UUID,
    p_peticion_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_usuario RECORD;
    v_peticion RECORD;
    v_ahora TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Validar que el usuario exista y no esté bloqueado
    SELECT id, rol, bloqueado
    INTO v_usuario
    FROM usuarios
    WHERE id = p_usuario_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con ID % no registrado.', p_usuario_id;
    END IF;

    IF v_usuario.bloqueado THEN
        RAISE EXCEPTION 'CUENTA_BLOQUEADA: La cuenta se encuentra bloqueada.';
    END IF;

    -- 2. Buscar y bloquear la petición para actualización
    SELECT id, usuario_id, estado, recepcion_confirmada
    INTO v_peticion
    FROM peticiones
    WHERE id = p_peticion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PETICION_NO_ENCONTRADA: Petición con ID % no encontrada.', p_peticion_id;
    END IF;

    -- 3. Verificar que el usuario sea el dueño de la petición
    IF v_peticion.usuario_id <> p_usuario_id THEN
        RAISE EXCEPTION 'ACCESO_DENEGADO: Solo el colaborador solicitante puede confirmar la recepción de su uniforme.';
    END IF;

    -- 4. Verificar que la petición esté en estado 'entregada'
    IF v_peticion.estado <> 'entregada' THEN
        RAISE EXCEPTION 'ESTADO_INVALIDO: Solo se puede confirmar la recepción cuando la petición ha sido entregada (estado actual: %).', v_peticion.estado;
    END IF;

    -- 5. Verificar que no haya sido confirmada previamente
    IF v_peticion.recepcion_confirmada = TRUE THEN
        RAISE EXCEPTION 'Recepción ya confirmada';
    END IF;

    -- 6. Actualizar campo recepcion_confirmada dentro del estado 'entregada'
    UPDATE peticiones
    SET recepcion_confirmada = TRUE,
        actualizada_en = v_ahora
    WHERE id = p_peticion_id;

    -- 7. Registrar acción en la bitácora de auditoría
    INSERT INTO acciones_bitacora (
        usuario_id,
        rol_usuario,
        tipo_accion,
        entidad,
        entidad_id,
        detalle
    ) VALUES (
        p_usuario_id,
        v_usuario.rol::TEXT,
        'confirmar_recepcion',
        'peticiones',
        p_peticion_id,
        jsonb_build_object(
            'recepcion_confirmada', TRUE,
            'estado', 'entregada'
        )
    );

    RETURN jsonb_build_object(
        'peticion_id', p_peticion_id,
        'recepcion_confirmada', TRUE,
        'actualizada_en', v_ahora
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
