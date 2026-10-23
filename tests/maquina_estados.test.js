// tests/maquina_estados.test.js
// Pruebas automáticas del Ticket 12: Contrato de la máquina de estados de peticiones.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { invocarRpc, consultarAdmin, obtenerTokenAdmin } from './helpers.js';

describe('Máquina de Estados de Peticiones', () => {
  const COLABORADOR_ID = 'a0000000-0000-0000-0000-000000000001'; // Juan Pérez Demo
  let adminId;
  let adminToken;

  before(async () => {
    adminToken = await obtenerTokenAdmin();
    const adminData = await consultarAdmin('usuarios', 'sap=eq.90000001&select=id');
    adminId = adminData[0].id;
    assert.ok(adminId, 'Se obtuvo el ID del administrador');
  });

  test('Transición válida: ciclo completo (pendiente → aprobada → en_proceso → entregada)', async () => {
    // 1. Crear petición en estado pendiente
    const resCrear = await invocarRpc('crear_peticion', {
      p_usuario_id: COLABORADOR_ID,
      p_motivo: 'Prueba ciclo completo máquina de estados',
      p_ventana_inicio: '2026-10-22T08:00:00-06:00',
      p_ventana_fin: '2026-10-22T10:00:00-06:00',
      p_lineas: [
        { prenda_tipo: 'playera', prenda_color: 'azul', prenda_talla: 'M' }
      ]
    });

    assert.equal(resCrear.ok, true, 'Creación de petición exitosa');
    const peticionId = resCrear.data;
    assert.ok(peticionId, 'Retornó UUID de petición');

    // Verificar estado inicial pendiente
    let [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'pendiente');

    // 2. Transición pendiente → aprobada (fijando ventana confirmada)
    const ventanaConfirmadaInicio = '2026-10-22T08:30:00-06:00';
    const ventanaConfirmadaFin = '2026-10-22T09:30:00-06:00';

    const resAprobar = await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'aprobada',
      p_extra: {
        ventana_confirmada_inicio: ventanaConfirmadaInicio,
        ventana_confirmada_fin: ventanaConfirmadaFin
      }
    });

    assert.equal(resAprobar.ok, true, 'Aprobación exitosa');
    [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'aprobada');
    assert.ok(peticion.ventana_confirmada_inicio, 'Ventana confirmada de inicio guardada');
    assert.ok(peticion.ventana_confirmada_fin, 'Ventana confirmada de fin guardada');

    // 3. Transición aprobada → en_proceso
    const resEnProceso = await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'en_proceso',
      p_extra: {}
    });

    assert.equal(resEnProceso.ok, true, 'Paso a en_proceso exitoso');
    [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'en_proceso');

    // 4. Transición en_proceso → entregada (marcar_entregada)
    const resEntregada = await invocarRpc('marcar_entregada', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_devoluciones: [],
      p_observaciones: 'Entrega en ventanilla'
    });

    assert.equal(resEntregada.ok, true, 'Entrega exitosa');
    [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'entregada');
  });

  test('Transición inválida: salto directo pendiente → entregada lanza error', async () => {
    // 1. Crear petición pendiente
    const resCrear = await invocarRpc('crear_peticion', {
      p_usuario_id: COLABORADOR_ID,
      p_motivo: 'Intento de entrega directa inválida',
      p_ventana_inicio: '2026-10-22T08:00:00-06:00',
      p_ventana_fin: '2026-10-22T10:00:00-06:00',
      p_lineas: [
        { prenda_tipo: 'playera', prenda_color: 'azul', prenda_talla: 'M' }
      ]
    });

    const peticionId = resCrear.data;

    // Intentar marcar entregada directamente desde pendiente
    const resEntregar = await invocarRpc('marcar_entregada', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_devoluciones: []
    });

    assert.equal(resEntregar.ok, false, 'Entrega directa debe fallar');
    assert.match(
      resEntregar.error.message,
      /ESTADO_INVALIDO|Solo se pueden entregar peticiones que estén en estado "en_proceso"/i,
      'Mensaje de error debe indicar estado inválido'
    );

    // Verificar que la petición sigue en pendiente (no se modificó)
    const [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'pendiente');
  });

  test('Transición rechazada sin motivo lanza error', async () => {
    // 1. Crear petición pendiente
    const resCrear = await invocarRpc('crear_peticion', {
      p_usuario_id: COLABORADOR_ID,
      p_motivo: 'Petición a rechazar',
      p_ventana_inicio: '2026-10-22T08:00:00-06:00',
      p_ventana_fin: '2026-10-22T10:00:00-06:00',
      p_lineas: [
        { prenda_tipo: 'playera', prenda_color: 'azul', prenda_talla: 'M' }
      ]
    });

    const peticionId = resCrear.data;

    // 2. Intentar rechazar con motivo_rechazo vacío
    const resRechazar = await invocarRpc('cambiar_estado', {
      p_admin_id: adminId,
      p_peticion_id: peticionId,
      p_nuevo_estado: 'rechazada',
      p_extra: { motivo_rechazo: '   ' }
    });

    assert.equal(resRechazar.ok, false, 'Rechazo sin motivo debe fallar');
    assert.match(
      resRechazar.error.message,
      /MOTIVO_RECHAZO_REQUERIDO|El motivo de rechazo es obligatorio/i,
      'Mensaje de error debe exigir motivo de rechazo'
    );

    // Verificar que la petición se mantuvo en estado pendiente
    const [peticion] = await consultarAdmin('peticiones', `id=eq.${peticionId}`);
    assert.equal(peticion.estado, 'pendiente');
  });
});
