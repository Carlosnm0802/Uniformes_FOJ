-- Migración: Función para transiciones de estado de peticiones
-- Ticket 9: cambiar_estado(p_admin_id, p_peticion_id, p_nuevo_estado, p_extra)

CREATE OR REPLACE FUNCTION cambiar_estado(
    p_admin_id UUID,
    p_peticion_id UUID,
    p_nuevo_estado estado_peticion,
    p_extra JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_admin RECORD;
    v_peticion RECORD;
    v_ventana_inicio TIMESTAMPTZ;
    v_ventana_fin TIMESTAMPTZ;
    v_motivo_rechazo TEXT;
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
        RAISE EXCEPTION 'ACCESO_DENEGADO: Solo administradores o personal de RH pueden gestionar transiciones de peticiones.';
    END IF;

    -- 2. Obtener y bloquear para actualización la petición correspondiente
    SELECT id, usuario_id, estado, motivo, observaciones
    INTO v_peticion
    FROM peticiones
    WHERE id = p_peticion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PETICION_NO_ENCONTRADA: Petición con ID % no encontrada.', p_peticion_id;
    END IF;

    -- 3. Validar máquina de estados para Ticket 9
    -- Transición A: pendiente -> aprobada
    IF v_peticion.estado = 'pendiente' AND p_nuevo_estado = 'aprobada' THEN
        -- Requiere ventana_confirmada obligatoria en p_extra
        v_ventana_inicio := COALESCE(
            p_extra->>'ventana_confirmada_inicio',
            p_extra->'ventana_confirmada'->>'inicio'
        )::TIMESTAMPTZ;

        v_ventana_fin := COALESCE(
            p_extra->>'ventana_confirmada_fin',
            p_extra->'ventana_confirmada'->>'fin'
        )::TIMESTAMPTZ;

        IF v_ventana_inicio IS NULL OR v_ventana_fin IS NULL THEN
            RAISE EXCEPTION 'VENTANA_CONFIRMADA_REQUERIDA: La ventana confirmada (inicio y fin) es obligatoria para aprobar la petición.';
        END IF;

        IF v_ventana_fin < v_ventana_inicio THEN
            RAISE EXCEPTION 'VENTANA_INVALIDA: La fecha y hora de fin de la ventana confirmada no puede ser anterior a la de inicio.';
        END IF;

        UPDATE peticiones
        SET estado = 'aprobada',
            ventana_confirmada_inicio = v_ventana_inicio,
            ventana_confirmada_fin = v_ventana_fin,
            actualizada_en = v_ahora
        WHERE id = p_peticion_id;

    -- Transición B: pendiente -> rechazada
    ELSIF v_peticion.estado = 'pendiente' AND p_nuevo_estado = 'rechazada' THEN
        v_motivo_rechazo := TRIM(COALESCE(p_extra->>'motivo_rechazo', ''));

        IF v_motivo_rechazo = '' THEN
            RAISE EXCEPTION 'MOTIVO_RECHAZO_REQUERIDO: El motivo de rechazo es obligatorio.';
        END IF;

        UPDATE peticiones
        SET estado = 'rechazada',
            motivo_rechazo = v_motivo_rechazo,
            actualizada_en = v_ahora
        WHERE id = p_peticion_id;

    -- Transición C: aprobada -> en_proceso
    ELSIF v_peticion.estado = 'aprobada' AND p_nuevo_estado = 'en_proceso' THEN
        UPDATE peticiones
        SET estado = 'en_proceso',
            actualizada_en = v_ahora
        WHERE id = p_peticion_id;

    -- Cualquier otra transición no está permitida en este flujo
    ELSE
        RAISE EXCEPTION 'Transición no permitida: % → %', v_peticion.estado, p_nuevo_estado;
    END IF;

    -- 4. Registrar acción en la bitácora de auditoría
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
        'cambiar_estado',
        'peticiones',
        p_peticion_id,
        jsonb_build_object(
            'estado_anterior', v_peticion.estado,
            'nuevo_estado', p_nuevo_estado,
            'extra', p_extra
        )
    );

    RETURN jsonb_build_object(
        'peticion_id', p_peticion_id,
        'estado_anterior', v_peticion.estado,
        'nuevo_estado', p_nuevo_estado,
        'actualizada_en', v_ahora
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
