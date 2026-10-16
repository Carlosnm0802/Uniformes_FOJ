-- Migración: Gestión de bloqueo, restablecimiento y desbloqueo de cuentas
-- Ticket 5: Garantiza persistencia atómica de intentos fallidos y funciones exclusivas para admin/rh

-- 1. Actualizar verificar_pin para persistir intentos fallidos y bloqueo sin rollback transaccional
CREATE OR REPLACE FUNCTION verificar_pin(
    p_sap TEXT,
    p_pin TEXT
) RETURNS JSONB AS $$
DECLARE
    v_usuario RECORD;
    v_intentos INTEGER;
BEGIN
    -- Buscar usuario por número SAP
    SELECT id, sap, nombre, rol, pin_hash, intentos_fallidos, bloqueado, pin_pendiente
    INTO v_usuario
    FROM usuarios
    WHERE sap = p_sap;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CREDENCIALES_INVALIDAS',
            'mensaje', 'Credenciales no válidas.'
        );
    END IF;

    -- Validar si la cuenta ya está bloqueada
    IF v_usuario.bloqueado THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CUENTA_BLOQUEADA',
            'bloqueado', TRUE,
            'mensaje', 'Tu cuenta está bloqueada tras 3 intentos fallidos.'
        );
    END IF;

    -- Caso primer acceso: el usuario aún no tiene PIN configurado
    IF v_usuario.pin_pendiente THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'usuario_id', v_usuario.id,
            'sap', v_usuario.sap,
            'nombre', v_usuario.nombre,
            'rol', v_usuario.rol,
            'pin_pendiente', TRUE
        );
    END IF;

    -- Validar hash del PIN usando crypt (pgcrypto con salt blowfish)
    IF v_usuario.pin_hash = crypt(p_pin, v_usuario.pin_hash) THEN
        -- PIN correcto: reiniciar contador de intentos fallidos
        UPDATE usuarios 
        SET intentos_fallidos = 0 
        WHERE id = v_usuario.id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'usuario_id', v_usuario.id,
            'sap', v_usuario.sap,
            'nombre', v_usuario.nombre,
            'rol', v_usuario.rol,
            'pin_pendiente', FALSE
        );
    ELSE
        -- PIN incorrecto: incrementar intentos fallidos
        v_intentos := v_usuario.intentos_fallidos + 1;
        
        IF v_intentos >= 3 THEN
            -- Bloqueo automático al 3er intento fallido
            UPDATE usuarios 
            SET intentos_fallidos = v_intentos,
                bloqueado = TRUE 
            WHERE id = v_usuario.id;

            -- Registrar en bitácora el bloqueo por seguridad
            INSERT INTO acciones_bitacora (usuario_id, rol_usuario, tipo_accion, entidad, entidad_id, detalle)
            VALUES (v_usuario.id, v_usuario.rol::text, 'bloqueo_cuenta', 'usuarios', v_usuario.id, 
                    jsonb_build_object('motivo', '3_intentos_fallidos_pin', 'intentos', v_intentos));

            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'CUENTA_BLOQUEADA',
                'bloqueado', TRUE,
                'intentos', v_intentos,
                'mensaje', 'Tu cuenta ha sido bloqueada tras 3 intentos fallidos.'
            );
        ELSE
            UPDATE usuarios 
            SET intentos_fallidos = v_intentos 
            WHERE id = v_usuario.id;

            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'PIN_INCORRECTO',
                'bloqueado', FALSE,
                'intentos', v_intentos,
                'intentos_restantes', (3 - v_intentos),
                'mensaje', 'PIN incorrecto.'
            );
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función para restablecer el PIN de un colaborador (exclusiva Admin / RH)
CREATE OR REPLACE FUNCTION restablecer_pin(
    p_admin_id UUID,
    p_sap_objetivo TEXT
) RETURNS VOID AS $$
DECLARE
    v_admin RECORD;
    v_objetivo RECORD;
BEGIN
    -- Validar que el invocante exista y tenga rol administrador o rh
    SELECT id, sap, nombre, rol
    INTO v_admin
    FROM usuarios
    WHERE id = p_admin_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_NO_ENCONTRADO: Administrador no identificado.';
    END IF;

    IF v_admin.rol NOT IN ('administrador', 'rh') THEN
        RAISE EXCEPTION 'PERMISOS_INSUFICIENTES: Solo Administrador o RH pueden restablecer el PIN.';
    END IF;

    -- Buscar al usuario objetivo por su número SAP
    SELECT id, sap, nombre, rol
    INTO v_objetivo
    FROM usuarios
    WHERE sap = p_sap_objetivo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con SAP % no registrado.', p_sap_objetivo;
    END IF;

    -- Restablecer credenciales: requiere nuevo PIN en el siguiente acceso
    UPDATE usuarios
    SET pin_hash = NULL,
        pin_pendiente = TRUE,
        intentos_fallidos = 0,
        bloqueado = FALSE
    WHERE id = v_objetivo.id;

    -- Registrar evento en bitácora con autor y rol
    INSERT INTO acciones_bitacora (usuario_id, rol_usuario, tipo_accion, entidad, entidad_id, detalle)
    VALUES (
        v_admin.id,
        v_admin.rol::text,
        'restablecer_pin',
        'usuarios',
        v_objetivo.id,
        jsonb_build_object(
            'sap_afectado', v_objetivo.sap,
            'nombre_afectado', v_objetivo.nombre,
            'motivo', 'restablecimiento_administrativo'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función para desbloquear la cuenta de un colaborador (exclusiva Admin / RH)
CREATE OR REPLACE FUNCTION desbloquear_cuenta(
    p_admin_id UUID,
    p_sap_objetivo TEXT
) RETURNS VOID AS $$
DECLARE
    v_admin RECORD;
    v_objetivo RECORD;
BEGIN
    -- Validar que el invocante exista y tenga rol administrador o rh
    SELECT id, sap, nombre, rol
    INTO v_admin
    FROM usuarios
    WHERE id = p_admin_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ADMIN_NO_ENCONTRADO: Administrador no identificado.';
    END IF;

    IF v_admin.rol NOT IN ('administrador', 'rh') THEN
        RAISE EXCEPTION 'PERMISOS_INSUFICIENTES: Solo Administrador o RH pueden desbloquear cuentas.';
    END IF;

    -- Buscar al usuario objetivo por su número SAP
    SELECT id, sap, nombre, rol, intentos_fallidos, bloqueado
    INTO v_objetivo
    FROM usuarios
    WHERE sap = p_sap_objetivo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con SAP % no registrado.', p_sap_objetivo;
    END IF;

    -- Desbloquear cuenta manteniendo el PIN previo
    UPDATE usuarios
    SET intentos_fallidos = 0,
        bloqueado = FALSE
    WHERE id = v_objetivo.id;

    -- Registrar evento en bitácora con autor y rol
    INSERT INTO acciones_bitacora (usuario_id, rol_usuario, tipo_accion, entidad, entidad_id, detalle)
    VALUES (
        v_admin.id,
        v_admin.rol::text,
        'desbloquear_cuenta',
        'usuarios',
        v_objetivo.id,
        jsonb_build_object(
            'sap_afectado', v_objetivo.sap,
            'nombre_afectado', v_objetivo.nombre,
            'intentos_previos', v_objetivo.intentos_fallidos,
            'estaba_bloqueado', v_objetivo.bloqueado
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
