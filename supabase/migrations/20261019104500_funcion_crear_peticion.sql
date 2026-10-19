-- Migración: Función para crear petición atómica con validaciones de dominio
-- Ticket 8: crear_peticion(p_usuario_id, p_motivo, p_ventana_inicio, p_ventana_fin, p_lineas)

CREATE OR REPLACE FUNCTION crear_peticion(
    p_usuario_id UUID,
    p_motivo TEXT,
    p_ventana_inicio TIMESTAMPTZ,
    p_ventana_fin TIMESTAMPTZ,
    p_lineas JSONB
) RETURNS UUID AS $$
DECLARE
    v_usuario RECORD;
    v_peticion_id UUID;
    v_linea JSONB;
    v_tipo tipo_prenda;
    v_color TEXT;
    v_talla TEXT;
    v_motivo_normalizado TEXT;
BEGIN
    -- 1. Validar que el usuario exista y no esté bloqueado
    SELECT id, sap, nombre, rol, bloqueado
    INTO v_usuario
    FROM usuarios
    WHERE id = p_usuario_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO: Usuario con ID % no registrado.', p_usuario_id;
    END IF;

    IF v_usuario.bloqueado THEN
        RAISE EXCEPTION 'CUENTA_BLOQUEADA: La cuenta se encuentra bloqueada tras 3 intentos fallidos.';
    END IF;

    -- 2. Regla de dominio: Solo los colaboradores pueden crear peticiones
    IF v_usuario.rol <> 'colaborador' THEN
        RAISE EXCEPTION 'SOLO_COLABORADORES: Solo los colaboradores pueden crear peticiones de uniforme.';
    END IF;

    -- 3. Validar motivo
    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RAISE EXCEPTION 'MOTIVO_REQUERIDO: El motivo de la petición es obligatorio.';
    END IF;

    v_motivo_normalizado := LOWER(TRIM(p_motivo));

    -- 4. Validar ventana de fecha/hora propuesta
    IF p_ventana_inicio IS NULL OR p_ventana_fin IS NULL THEN
        RAISE EXCEPTION 'VENTANA_REQUERIDA: La ventana propuesta de inicio y fin es obligatoria.';
    END IF;

    IF p_ventana_fin < p_ventana_inicio THEN
        RAISE EXCEPTION 'VENTANA_INVALIDA: La fecha y hora de fin de la ventana propuesta no puede ser anterior a la de inicio.';
    END IF;

    -- 5. Validar que la lista de prendas contenga al menos una línea
    IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
        RAISE EXCEPTION 'LINEAS_REQUERIDAS: La petición debe contener al menos una prenda.';
    END IF;

    -- 6. Validar cada línea antes de insertar cualquier registro
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
    LOOP
        -- Extraer tipo, color y talla soportando claves tanto en snake_case como estándar
        BEGIN
            v_tipo := (COALESCE(v_linea->>'prenda_tipo', v_linea->>'tipo'))::tipo_prenda;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'TIPO_PRENDA_INVALIDO: El tipo de prenda "%" no es válido.', COALESCE(v_linea->>'prenda_tipo', v_linea->>'tipo');
        END;

        v_color := COALESCE(v_linea->>'prenda_color', v_linea->>'color');
        v_talla := COALESCE(v_linea->>'prenda_talla', v_linea->>'talla');

        -- Regla de negocio crítica: Escafandra es talla única, no admite motivo 'talla'
        IF v_motivo_normalizado = 'talla' AND v_tipo = 'escafandra' THEN
            RAISE EXCEPTION 'MOTIVO_INVALIDO: El motivo "talla" no es válido para escafandra (es talla única).';
        END IF;

        -- Validar la combinación con el catálogo oficial (función de Ticket 2)
        IF NOT es_combinacion_valida(v_tipo, v_color, v_talla) THEN
            RAISE EXCEPTION 'COMBINACION_INVALIDA: La combinación (tipo: %, color: %, talla: %) no es válida según el catálogo.',
                v_tipo, COALESCE(v_color, 'sin color'), COALESCE(v_talla, 'sin talla');
        END IF;
    END LOOP;

    -- 7. Insertar cabecera de la petición en estado 'pendiente'
    INSERT INTO peticiones (
        usuario_id,
        estado,
        motivo,
        ventana_propuesta_inicio,
        ventana_propuesta_fin,
        sin_devolucion,
        recepcion_confirmada
    ) VALUES (
        p_usuario_id,
        'pendiente',
        TRIM(p_motivo),
        p_ventana_inicio,
        p_ventana_fin,
        FALSE,
        FALSE
    ) RETURNING id INTO v_peticion_id;

    -- 8. Insertar todas las líneas asociadas a la petición
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
    LOOP
        v_tipo := (COALESCE(v_linea->>'prenda_tipo', v_linea->>'tipo'))::tipo_prenda;
        v_color := COALESCE(v_linea->>'prenda_color', v_linea->>'color');
        v_talla := COALESCE(v_linea->>'prenda_talla', v_linea->>'talla');

        INSERT INTO lineas_peticion (
            peticion_id,
            prenda_tipo,
            prenda_color,
            prenda_talla,
            devuelta
        ) VALUES (
            v_peticion_id,
            v_tipo,
            v_color,
            v_talla,
            FALSE
        );
    END LOOP;

    -- 9. Registrar la creación en la bitácora de auditoría
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
        'crear_peticion',
        'peticiones',
        v_peticion_id,
        jsonb_build_object(
            'motivo', TRIM(p_motivo),
            'total_lineas', jsonb_array_length(p_lineas),
            'lineas', p_lineas,
            'ventana_propuesta_inicio', p_ventana_inicio,
            'ventana_propuesta_fin', p_ventana_fin
        )
    );

    RETURN v_peticion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
