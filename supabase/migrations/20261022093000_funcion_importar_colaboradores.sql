-- Migración: Función transaccional para importar colaboradores desde lote
-- Ticket 21: importar_colaboradores(p_admin_id, p_colaboradores)
-- Inserta usuarios con rol colaborador y PIN pendiente. Omite SAP inválidos,
-- duplicados dentro del lote o ya existentes en la base. No ejecuta bajas
-- (pendiente 3 del brief, [POR DEFINIR]).

CREATE OR REPLACE FUNCTION importar_colaboradores(
    p_admin_id UUID,
    p_colaboradores JSONB
) RETURNS JSONB AS $$
DECLARE
    v_admin RECORD;
    v_fila JSONB;
    v_sap TEXT;
    v_nombre TEXT;
    v_total INTEGER := 0;
    v_creados INTEGER := 0;
    v_omitidos INTEGER := 0;
    v_vistos TEXT[] := ARRAY[]::TEXT[];
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
        RAISE EXCEPTION 'ACCESO_DENEGADO: Solo administradores o personal de RH pueden importar colaboradores.';
    END IF;

    -- 2. Validar estructura del lote
    IF jsonb_typeof(p_colaboradores) <> 'array' THEN
        RAISE EXCEPTION 'LOTE_INVALIDO: El lote de colaboradores debe ser una lista.';
    END IF;

    IF jsonb_array_length(p_colaboradores) = 0 THEN
        RAISE EXCEPTION 'LOTE_INVALIDO: El lote de colaboradores está vacío.';
    END IF;

    SELECT COUNT(*)
    INTO v_total
    FROM jsonb_array_elements(p_colaboradores);

    IF v_total > 5000 THEN
        RAISE EXCEPTION 'LOTE_INVALIDO: El lote excede el máximo de 5000 filas por importación.';
    END IF;

    -- 3. Procesar fila por fila
    FOR v_fila IN SELECT * FROM jsonb_array_elements(p_colaboradores) LOOP
        v_sap := v_fila->>'sap';
        v_nombre := v_fila->>'nombre';

        IF v_sap IS NOT NULL THEN
            v_sap := btrim(v_sap);
        END IF;

        IF v_nombre IS NOT NULL THEN
            v_nombre := btrim(v_nombre);
        END IF;

        IF v_sap IS NULL OR v_sap !~ '^[0-9]{6,9}$' OR v_nombre IS NULL OR v_nombre = '' THEN
            v_omitidos := v_omitidos + 1;
            CONTINUE;
        END IF;

        IF v_sap = ANY(v_vistos) THEN
            v_omitidos := v_omitidos + 1;
            CONTINUE;
        END IF;

        v_vistos := array_append(v_vistos, v_sap);

        -- 4. Alta del colaborador; si otro proceso creó el mismo SAP a la vez,
        --    la restricción UNIQUE lo convierte en omitido sin romper el lote.
        BEGIN
            INSERT INTO usuarios (
                sap,
                nombre,
                rol,
                pin_pendiente,
                pin_hash,
                intentos_fallidos,
                bloqueado,
                creado_por
            ) VALUES (
                v_sap,
                v_nombre,
                'colaborador',
                TRUE,
                NULL,
                0,
                FALSE,
                p_admin_id
            );
            v_creados := v_creados + 1;
        EXCEPTION WHEN unique_violation THEN
            v_omitidos := v_omitidos + 1;
        END;
    END LOOP;

    -- 5. Registrar la acción del lote en la bitácora con autor y rol
    INSERT INTO acciones_bitacora (
        usuario_id,
        rol_usuario,
        tipo_accion,
        entidad,
        detalle
    ) VALUES (
        p_admin_id,
        v_admin.rol::TEXT,
        'importar_colaboradores',
        'usuarios',
        jsonb_build_object(
            'total_lote', v_total,
            'creados', v_creados,
            'omitidos', v_omitidos
        )
    );

    RETURN jsonb_build_object(
        'creados', v_creados,
        'omitidos', v_omitidos
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
