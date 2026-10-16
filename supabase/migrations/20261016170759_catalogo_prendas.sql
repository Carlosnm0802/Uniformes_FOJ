-- Migración: Catálogo de prendas y función de validación de combinaciones
-- Ticket 2: 100 combinaciones oficiales en existencias con stock = 0

-- 1. Función de base de datos para validar combinaciones tipo / color / talla
CREATE OR REPLACE FUNCTION es_combinacion_valida(
    p_tipo tipo_prenda,
    p_color TEXT,
    p_talla TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_colores_validos TEXT[] := ARRAY['rojo', 'verde', 'rosa', 'azul', 'morado', 'gris'];
    v_tallas_ropa TEXT[] := ARRAY['S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'];
    v_tallas_botas TEXT[] := ARRAY['22', '23', '24', '25', '26', '27', '28', '29', '30', '31'];
BEGIN
    CASE p_tipo
        WHEN 'escafandra' THEN
            -- Escafandra: 6 colores, talla única obligatoria
            RETURN (p_color = ANY(v_colores_validos)) AND (p_talla = 'unica');
            
        WHEN 'pantalon', 'playera' THEN
            -- Pantalón y playera: 6 colores y 7 tallas (S a 4XL)
            RETURN (p_color = ANY(v_colores_validos)) AND (p_talla = ANY(v_tallas_ropa));
            
        WHEN 'botas' THEN
            -- Botas: sin color (NULL) y tallas enteras 22 a 31
            RETURN (p_color IS NULL) AND (p_talla = ANY(v_tallas_botas));
            
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Carga del catálogo oficial en existencias con cantidad inicial = 0

-- Escafandras (6 combinaciones: 6 colores x talla única)
INSERT INTO existencias (prenda_tipo, prenda_color, prenda_talla, cantidad)
SELECT 'escafandra'::tipo_prenda, color, 'unica', 0
FROM unnest(ARRAY['rojo', 'verde', 'rosa', 'azul', 'morado', 'gris']) AS color
ON CONFLICT (prenda_tipo, prenda_color, prenda_talla) DO NOTHING;

-- Pantalones (42 combinaciones: 6 colores x 7 tallas)
INSERT INTO existencias (prenda_tipo, prenda_color, prenda_talla, cantidad)
SELECT 'pantalon'::tipo_prenda, color, talla, 0
FROM unnest(ARRAY['rojo', 'verde', 'rosa', 'azul', 'morado', 'gris']) AS color
CROSS JOIN unnest(ARRAY['S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL']) AS talla
ON CONFLICT (prenda_tipo, prenda_color, prenda_talla) DO NOTHING;

-- Playeras (42 combinaciones: 6 colores x 7 tallas)
INSERT INTO existencias (prenda_tipo, prenda_color, prenda_talla, cantidad)
SELECT 'playera'::tipo_prenda, color, talla, 0
FROM unnest(ARRAY['rojo', 'verde', 'rosa', 'azul', 'morado', 'gris']) AS color
CROSS JOIN unnest(ARRAY['S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL']) AS talla
ON CONFLICT (prenda_tipo, prenda_color, prenda_talla) DO NOTHING;

-- Botas (10 combinaciones: sin color x 10 tallas)
INSERT INTO existencias (prenda_tipo, prenda_color, prenda_talla, cantidad)
SELECT 'botas'::tipo_prenda, NULL, talla, 0
FROM unnest(ARRAY['22', '23', '24', '25', '26', '27', '28', '29', '30', '31']) AS talla
ON CONFLICT (prenda_tipo, prenda_color, prenda_talla) DO NOTHING;
