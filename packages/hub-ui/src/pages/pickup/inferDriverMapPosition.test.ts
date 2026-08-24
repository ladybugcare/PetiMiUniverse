import { describe, expect, it } from 'vitest';
import { inferDriverMapPosition, type InferMapStop } from './inferDriverMapPosition';

const start = { start_lat: -23.55, start_lng: -46.63, start_address: 'Clínica' };

function stop(
  partial: Partial<InferMapStop> & Pick<InferMapStop, 'id' | 'sequence' | 'status' | 'direction'>,
): InferMapStop {
  return {
    address_snapshot: { lat: -23.56 - partial.sequence * 0.01, lng: -46.64 },
    pet: { name: `Pet ${partial.sequence + 1}` },
    ...partial,
  };
}

describe('inferDriverMapPosition', () => {
  it('retorna null sem coords nem paradas', () => {
    expect(inferDriverMapPosition({}, [])).toBeNull();
  });

  it('rota sem paradas usa ponto de saída', () => {
    const r = inferDriverMapPosition(start, []);
    expect(r).toMatchObject({
      lat: -23.55,
      lng: -46.63,
      mode: 'not_started',
      label: 'Ainda não saiu',
    });
  });

  it('planned com todas pending: ainda não saiu', () => {
    const stops = [
      stop({ id: 'a', sequence: 0, status: 'pending', direction: 'pickup' }),
      stop({ id: 'b', sequence: 1, status: 'pending', direction: 'pickup' }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'planned' }, stops);
    expect(r?.mode).toBe('not_started');
    expect(r?.lat).toBe(-23.55);
    expect(r?.destinationStopId).toBe('a');
  });

  it('en_route: posição no último confirmado / saída, destino = ativa', () => {
    const stops = [
      stop({ id: 'a', sequence: 0, status: 'completed', direction: 'pickup' }),
      stop({ id: 'b', sequence: 1, status: 'en_route', direction: 'pickup' }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'in_progress' }, stops);
    expect(r?.mode).toBe('en_route');
    expect(r?.activeStopId).toBe('b');
    expect(r?.destinationStopId).toBe('b');
    expect(r?.lat).toBeCloseTo(-23.56, 5); // coords da parada a concluída
    expect(r?.label).toContain('A caminho');
  });

  it('arrived: no endereço da ativa', () => {
    const stops = [
      stop({
        id: 'a',
        sequence: 0,
        status: 'arrived',
        direction: 'pickup',
        address_snapshot: { lat: -23.5, lng: -46.5 },
        pet: { name: 'Thor' },
      }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'in_progress' }, stops);
    expect(r).toMatchObject({
      mode: 'at_stop',
      lat: -23.5,
      lng: -46.5,
      activeStopId: 'a',
    });
    expect(r?.label).toContain('Thor');
  });

  it('in_transit: no endereço da coleta; destino = próxima parada', () => {
    const stops = [
      stop({
        id: 'a',
        sequence: 0,
        status: 'in_transit',
        direction: 'pickup',
        address_snapshot: { lat: -23.4, lng: -46.4 },
        pet: { name: 'Luna' },
      }),
      stop({
        id: 'b',
        sequence: 1,
        status: 'pending',
        direction: 'clinic_return',
        address_snapshot: { label: 'Clínica' },
      }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'in_progress' }, stops);
    expect(r?.mode).toBe('in_transit');
    expect(r?.lat).toBe(-23.4);
    expect(r?.destinationStopId).toBe('b');
    expect(r?.label).toContain('Pet a bordo');
    expect(r?.label).toContain('retorno à clínica');
  });

  it('clinic_return en_route usa fallback do start no destino e posição no último ponto', () => {
    const stops = [
      stop({
        id: 'a',
        sequence: 0,
        status: 'completed',
        direction: 'pickup',
        address_snapshot: { lat: -23.4, lng: -46.4 },
      }),
      stop({
        id: 'cr',
        sequence: 1,
        status: 'en_route',
        direction: 'clinic_return',
        address_snapshot: { label: 'Clínica', address: 'Rua X' },
      }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'in_progress' }, stops);
    expect(r?.mode).toBe('returning');
    expect(r?.activeStopId).toBe('cr');
    expect(r?.lat).toBe(-23.4);
  });

  it('todas concluídas: rota concluída', () => {
    const stops = [
      stop({ id: 'a', sequence: 0, status: 'completed', direction: 'pickup' }),
      stop({
        id: 'cr',
        sequence: 1,
        status: 'completed',
        direction: 'clinic_return',
        address_snapshot: { lat: -23.55, lng: -46.63 },
      }),
    ];
    const r = inferDriverMapPosition({ ...start, status: 'done' }, stops);
    expect(r?.mode).toBe('done');
    expect(r?.label).toBe('Rota concluída');
  });
});
