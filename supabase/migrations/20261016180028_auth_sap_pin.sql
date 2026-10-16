-- Migración: Funciones de autenticación SAP + PIN
-- Ticket 4: verificar_pin y crear_pin con hash blowfish

-- 1. Función para verificar credenciales de acceso (SAP + PIN)
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
        RAISE EXCEPTION 'CREDENCIALES_INVALIDAS: Credenciales no válidas.';
    END IF;

    -- Validar si la cuenta ya está bloqueada
    IF v_usuario.bloqueado THEN
        RAISE EXCEPTION 'CUENTA_BLOQUEADA: Tu cuenta está bloqueada tras 3 intentos fallidos.';
    END IF;

    -- Caso primer acceso: el usuario aún no tiene PIN configurado
    IF v_usuario.pin_pendiente THEN
        RETURN jsonb_build_object(
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
                    jsonb_build_object('motivo', '3_intentos_fallidos_pin'));

            RAISE EXCEPTION 'CUENTA_BLOQUEADA: Tu cuenta ha sido bloqueada tras 3 intentos fallidos.';
        ELSE
            UPDATE usuarios 
            SET intentos_fallidos = v_intentos 
            WHERE id = v_usuario.id;

            RAISE EXCEPTION 'PIN_INCORRECTO: PIN incorrecto. Intentos restantes: %', (3 - v_intentos);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wrapper que retorna UUID directamente (para compatibilidad de firma esperada)
CREATE OR REPLACE FUNCTION verificar_pin_uuid(
    p_sap TEXT,
    p_pin TEXT
) RETURNS UUID AS $$
BEGIN
    RETURN (verificar_pin(p_sap, p_pin)->>'usuario_id')::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Función para crear PIN en primer acceso (o tras restablecimiento)
CREATE OR REPLACE FUNCTION crear_pin(
    p_sap TEXT,
    p_pin_nuevo TEXT
) RETURNS JSONB AS $$
DECLARE
    v_usuario RECORD;
    v_hash TEXT;
BEGIN
    -- Validar que el PIN tenga exactamente 4 dígitos numéricos
    IF p_pin_nuevo IS NULL OR p_pin_nuevo !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'FORMATO_INVALIDO: El PIN debe tener exactamente 4 dígitos numéricos.';
    END IF;

    -- Buscar usuario por SAP
    SELECT id, sap, nombre, rol, bloqueado, pin_pendiente
    INTO v_usuario
    FROM usuarios
    WHERE sap = p_sap;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con SAP % no registrado.', p_sap;
    END IF;

    IF v_usuario.bloqueado THEN
        RAISE EXCEPTION 'CUENTA_BLOQUEADA: La cuenta se encuentra bloqueada. Contacta a RH o Administrador.';
    END IF;

    IF NOT v_usuario.pin_pendiente THEN
        RAISE EXCEPTION 'PIN_YA_CONFIGURADO: Esta cuenta ya tiene un PIN activo. Solicita un restablecimiento.';
    END IF;

    -- Hashear PIN con blowfish (pgcrypto)
    v_hash := crypt(p_pin_nuevo, gen_salt('bf'));

    -- Actualizar usuario: guardar hash, desactivar pin_pendiente y limpiar intentos
    UPDATE usuarios
    SET pin_hash = v_hash,
        pin_pendiente = FALSE,
        intentos_fallidos = 0
    WHERE id = v_usuario.id;

    -- Registrar evento en bitácora
    INSERT INTO acciones_bitacora (usuario_id, rol_usuario, tipo_accion, entidad, entidad_id, detalle)
    VALUES (v_usuario.id, v_usuario.rol::text, 'crear_pin', 'usuarios', v_usuario.id, 
            jsonb_build_object('resultado', 'pin_creado_exitosamente'));

    RETURN jsonb_build_object(
        'usuario_id', v_usuario.id,
        'sap', v_usuario.sap,
        'nombre', v_usuario.nombre,
        'rol', v_usuario.rol,
        'pin_pendiente', FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
