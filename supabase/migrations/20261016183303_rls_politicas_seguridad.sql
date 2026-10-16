-- Migración: Row Level Security (RLS) y Políticas de Acceso por Rol
-- Ticket 6: Seguridad a nivel de base de datos basada en los claims del JWT

-- 1. Permisos base para roles de Supabase (anon y authenticated)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- 2. Funciones auxiliares para extraer identidad y rol desde los claims del JWT
CREATE OR REPLACE FUNCTION uid_from_jwt() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION rol_from_jwt() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'rol', '');
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION es_admin_o_rh() RETURNS BOOLEAN AS $$
BEGIN
    RETURN rol_from_jwt() IN ('administrador', 'rh');
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Habilitar RLS en todas las tablas del sistema
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE peticiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_peticion ENABLE ROW LEVEL SECURITY;
ALTER TABLE existencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_bitacora ENABLE ROW LEVEL SECURITY;

-- 4. Políticas para tabla 'usuarios'
-- Colaborador solo ve su propio perfil; Admin y RH ven a todos los usuarios
CREATE POLICY "usuarios_lectura" ON usuarios
FOR SELECT
USING (
    id = uid_from_jwt() OR es_admin_o_rh()
);

-- Modificación/creación directa en 'usuarios' exclusiva para Admin/RH
CREATE POLICY "usuarios_admin_gestion" ON usuarios
FOR ALL
USING (es_admin_o_rh())
WITH CHECK (es_admin_o_rh());

-- 5. Políticas para tabla 'peticiones'
-- Colaborador solo ve sus propias peticiones; Admin y RH ven todas
CREATE POLICY "peticiones_lectura" ON peticiones
FOR SELECT
USING (
    usuario_id = uid_from_jwt() OR es_admin_o_rh()
);

-- Gestión y transiciones directas exclusivas para Admin/RH
CREATE POLICY "peticiones_admin_gestion" ON peticiones
FOR ALL
USING (es_admin_o_rh())
WITH CHECK (es_admin_o_rh());

-- 6. Políticas para tabla 'lineas_peticion'
-- Colaborador solo ve líneas pertenecientes a sus propias peticiones
CREATE POLICY "lineas_peticion_lectura" ON lineas_peticion
FOR SELECT
USING (
    peticion_id IN (
        SELECT id FROM peticiones WHERE usuario_id = uid_from_jwt()
    ) OR es_admin_o_rh()
);

-- Gestión directa exclusiva para Admin/RH
CREATE POLICY "lineas_peticion_admin_gestion" ON lineas_peticion
FOR ALL
USING (es_admin_o_rh())
WITH CHECK (es_admin_o_rh());

-- 7. Políticas para tabla 'existencias'
-- Regla de negocio inmutable: El colaborador NUNCA tiene acceso a existencias (inventario)
-- Solo Admin y RH pueden consultar y actualizar stock
CREATE POLICY "existencias_admin_lectura" ON existencias
FOR SELECT
USING (es_admin_o_rh());

CREATE POLICY "existencias_admin_actualizacion" ON existencias
FOR UPDATE
USING (es_admin_o_rh())
WITH CHECK (es_admin_o_rh());

-- 8. Políticas para tabla 'movimientos_stock'
-- Solo Admin y RH pueden consultar la trazabilidad del stock
CREATE POLICY "movimientos_stock_admin_lectura" ON movimientos_stock
FOR SELECT
USING (es_admin_o_rh());

-- 9. Políticas para tabla 'acciones_bitacora'
-- Solo Admin y RH pueden consultar la bitácora de auditoría
CREATE POLICY "acciones_bitacora_admin_lectura" ON acciones_bitacora
FOR SELECT
USING (es_admin_o_rh());
