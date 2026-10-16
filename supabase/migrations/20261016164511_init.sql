-- Migración inicial: Esquema base de Uniformes FOJ
-- Tablas: usuarios, peticiones, lineas_peticion, existencias, movimientos_stock, acciones_bitacora

-- 1. Habilitar extensión para funciones criptográficas (hash blowfish para PIN)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Enums del dominio
CREATE TYPE rol_usuario AS ENUM ('colaborador', 'administrador', 'rh');
CREATE TYPE estado_peticion AS ENUM ('pendiente', 'aprobada', 'rechazada', 'en_proceso', 'entregada');
CREATE TYPE tipo_prenda AS ENUM ('escafandra', 'pantalon', 'playera', 'botas');
CREATE TYPE tipo_movimiento_stock AS ENUM ('entrada', 'salida');

-- 3. Tabla usuarios (autenticación propia por SAP + PIN)
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sap TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    rol rol_usuario NOT NULL,
    pin_hash TEXT,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
    pin_pendiente BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

-- 4. Tabla peticiones (ciclo de vida del uniforme)
CREATE TABLE peticiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    estado estado_peticion NOT NULL DEFAULT 'pendiente',
    motivo TEXT NOT NULL,
    ventana_propuesta_inicio TIMESTAMPTZ NOT NULL,
    ventana_propuesta_fin TIMESTAMPTZ NOT NULL,
    ventana_confirmada_inicio TIMESTAMPTZ,
    ventana_confirmada_fin TIMESTAMPTZ,
    motivo_rechazo TEXT,
    observaciones TEXT,
    sin_devolucion BOOLEAN NOT NULL DEFAULT FALSE,
    recepcion_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
    creada_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    actualizada_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Tabla lineas_peticion (prendas específicas dentro de una petición)
CREATE TABLE lineas_peticion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peticion_id UUID NOT NULL REFERENCES peticiones(id) ON DELETE CASCADE,
    prenda_tipo tipo_prenda NOT NULL,
    prenda_color TEXT,
    prenda_talla TEXT,
    devuelta BOOLEAN NOT NULL DEFAULT FALSE
);

-- 6. Tabla existencias (inventario actual por combinación)
CREATE TABLE existencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prenda_tipo tipo_prenda NOT NULL,
    prenda_color TEXT,
    prenda_talla TEXT,
    cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    CONSTRAINT uq_existencias_combinacion UNIQUE NULLS NOT DISTINCT (prenda_tipo, prenda_color, prenda_talla)
);

-- 7. Tabla movimientos_stock (trazabilidad de entradas y salidas)
CREATE TABLE movimientos_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    existencia_id UUID NOT NULL REFERENCES existencias(id) ON DELETE RESTRICT,
    tipo_movimiento tipo_movimiento_stock NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    peticion_id UUID REFERENCES peticiones(id) ON DELETE SET NULL,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    rol_usuario TEXT NOT NULL,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Tabla acciones_bitacora (auditoría general por usuario y rol)
CREATE TABLE acciones_bitacora (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    rol_usuario TEXT NOT NULL,
    tipo_accion TEXT NOT NULL,
    entidad TEXT NOT NULL,
    entidad_id UUID,
    detalle JSONB,
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX idx_peticiones_usuario_id ON peticiones(usuario_id);
CREATE INDEX idx_peticiones_estado ON peticiones(estado);
CREATE INDEX idx_lineas_peticion_peticion_id ON lineas_peticion(peticion_id);
CREATE INDEX idx_movimientos_stock_existencia_id ON movimientos_stock(existencia_id);
CREATE INDEX idx_acciones_bitacora_usuario_id ON acciones_bitacora(usuario_id);
