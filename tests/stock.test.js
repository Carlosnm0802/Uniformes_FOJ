// tests/stock.test.js
// Pruebas automáticas del Ticket 12: Contrato de descuento de stock transaccional.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { invocarRpc, consultarAdmin, obtenerTokenAdmin } from './helpers.js';

describe('Control Transaccional de Stock', () => {
  const COLABORADOR_ID = 'a0000000-0000-0000-0000-000000000001'; // Juan Pérez Demo
  let adminId;

  before(async () => {
    await obtenerTokenAdmin();
    const adminData = await consultarAdmin('usuarios', 'sap=eq.90000001&select=id');
    adminId = adminData[0].id;
    assert.ok(adminId, 'Se obtuvo el ID del administrador');
  });

  test('Stock > 0: Descuenta exactamente 1 unidad por prenda e inserta en movimientos_stock', async () => {
    // 1. Consultar existencia previa de playera azul M
    const [existenciaAntes] = await consultarAdmin(
      'existencias',
      'prenda_tipo=eq.playera&prenda_color=eq.azul&prenda_talla=eq.M'
    );
    assert.ok(existenciaAntes, 'Existencia de playera azul M encontrada');
    const cantidadInicial = existenciaAntes.cantidad;
    assert.ok(cantidadInicial > 0, 'La cantidad inicial debe ser mayor a 0');

    // 2. Crear petición con 1 playera azul M
    const resCrear = await invocarRpc('crear_peticion', {
      p_usuario_id: COLABORADOR_ID,
      p_motivo: 'Prueba descuento de stock',
      p_ventana_inicio: '2026-10-22T08:00:00Z',
      p_ventana_fin: '2026-10-22T10:00:00Z',
      p_lineas: [
        { prenda_tipo: 'playera', prenda_color: 'azul', prenda_talla: 'M' }
      ]
    });

    const peticionId = resCrear.data;

    // Transición: pendiente -> aprobada -> en_proceso
    await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'aprobada',
      p_extra: {
        ventana_confirmada_inicio: '2026-10-22T08:00:00Z',
        ventana_confirmada_fin: '2026-10-22T09:00:00Z'
      }
    });

    await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'en_proceso',
      p_extra: {}
    });

    // 3. Marcar entregada
    const resEntrega = await invocarRpc('marcar_entregada', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_devoluciones: [],
      p_observaciones: 'Entrega para prueba de stock'
    });

    assert.equal(resEntrega.ok, true, 'La entrega debe completarse exitosamente');

    // 4. Verificar que el stock en existencias disminuyó exactamente en 1 unidad
    const [existenciaDespues] = await consultarAdmin(
      'existencias',
      'prenda_tipo=eq.playera&prenda_color=eq.azul&prenda_talla=eq.M'
    );
    assert.equal(
      existenciaDespues.cantidad,
      cantidadInicial - 1,
      'El stock debe reducirse en exactamente 1 unidad'
    );

    // 5. Verificar que se registró la salida en movimientos_stock
    const movimientos = await consultarAdmin(
      'movimientos_stock',
      `peticion_id=eq.${peticionId}&tipo_movimiento=eq.salida`
    );
    assert.equal(movimientos.length, 1, 'Debe registrarse 1 movimiento de salida');
    assert.equal(movimientos[0].cantidad, 1, 'La cantidad del movimiento debe ser 1');
  });

  test('Stock = 0: Lanza error y no modifica nada (reversión transaccional completa)', async () => {
    // 1. Usar una combinación con stock en 0: botas talla 22
    const [existenciaCero] = await consultarAdmin(
      'existencias',
      'prenda_tipo=eq.botas&prenda_talla=eq.22'
    );
    assert.ok(existenciaCero, 'Existencia de botas 22 encontrada');
    assert.equal(existenciaCero.cantidad, 0, 'El stock inicial debe ser 0');

    // 2. Crear petición con botas talla 22 (color null)
    const resCrear = await invocarRpc('crear_peticion', {
      p_usuario_id: COLABORADOR_ID,
      p_motivo: 'Intento de entrega sin stock',
      p_ventana_inicio: '2026-10-22T08:00:00Z',
      p_ventana_fin: '2026-10-22T10:00:00Z',
      p_lineas: [
        { prenda_tipo: 'botas', prenda_color: null, prenda_talla: '22' }
      ]
    });

    const peticionId = resCrear.data;

    // Pasar a aprobada y luego a en_proceso
    await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'aprobada',
      p_extra: {
        ventana_confirmada_inicio: '2026-10-22T08:00:00Z',
        ventana_confirmada_fin: '2026-10-22T09:00:00Z'
      }
    });

    await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'en_proceso',
      p_extra: {}
    });

    // 3. Intentar entregar: debe fallar con error 'Stock insuficiente para botas 22'
    const resEntrega = await invocarRpc('marcar_entregada', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_devoluciones: []
    });

    assert.equal(resEntrega.ok, false, 'La entrega sin stock debe fallar');
    assert.match(
      resEntrega.error.message,
      /Stock insuficiente para botas 22/i,
      'El mensaje de error debe indicar stock insuficiente para botas 22'
    );

    // 4. Verificar que el stock sigue en 0 (no bajó a negativo)
    const [existenciaDespues] = await consultarAdmin(
      'existencias',
      'prenda_tipo=eq.botas&prenda_talla=eq.22'
    );
    assert.equal(existenciaDespues.cantidad, 0, 'El stock debe mantenerse en 0');

    // 5. Verificar que la petición se mantuvo en estado 'en_proceso' (rollback atómico)
    const [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'en_proceso', 'La petición no debe cambiar a entregada');

    // 6. Verificar que NO se crearon registros de salida en movimientos_stock
    const movimientos = await consultarAdmin(
      'movimientos_stock',
      `peticion_id=eq.${peticionId}`
    );
    assert.equal(movimientos.length, 0, 'No debe existir ningún movimiento de stock');
  });
});
