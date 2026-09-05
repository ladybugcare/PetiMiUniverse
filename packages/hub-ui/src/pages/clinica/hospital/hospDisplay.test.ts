import { describe, expect, it } from 'vitest';
import { buildHospAdmitReason, hospEventFacts, hospEventHasContent, hospEventView } from './hospDisplay';
import type { HubHospitalizationEvent } from '../../../api/hubClinicalApi';

function ev(partial: Partial<HubHospitalizationEvent> & Pick<HubHospitalizationEvent, 'kind' | 'payload'>): HubHospitalizationEvent {
  return {
    id: 'e1',
    hospitalization_id: 'h1',
    recorded_at: '2026-09-05T12:00:00.000Z',
    created_at: '2026-09-05T12:00:00.000Z',
    ...partial,
  };
}

describe('hospEventFacts', () => {
  it('formata sinais vitais sem JSON cru', () => {
    const { facts, note } = hospEventFacts(
      ev({
        kind: 'vital',
        payload: { heart_rate: '90', temperature_c: '38.2', notes: 'estável' },
      }),
    );
    expect(facts).toEqual([
      { label: 'FC (bpm)', value: '90' },
      { label: 'Temperatura (°C)', value: '38.2' },
    ]);
    expect(note).toBe('estável');
  });

  it('usa o texto da nota como observação', () => {
    const { facts, note } = hospEventFacts(ev({ kind: 'note', payload: { text: 'Dormiu bem' } }));
    expect(facts).toEqual([]);
    expect(note).toBe('Dormiu bem');
  });

  it('traduz chips do atendimento no histórico', () => {
    const { facts } = hospEventFacts(
      ev({
        kind: 'vital',
        payload: { crt: 'lt2', hydration: 'leve', pain: 'mild' },
      }),
    );
    expect(facts).toEqual([
      { label: 'TPC', value: '< 2 s' },
      { label: 'Hidratação', value: 'Desidratação leve' },
      { label: 'Dor', value: 'Leve' },
    ]);
  });

  it('lista alimentos pelos chips da anamnese', () => {
    const { facts } = hospEventFacts(
      ev({
        kind: 'feeding',
        payload: { food_types: ['racao_seca', 'dieta_caseira'], accepted: 'partial' },
      }),
    );
    expect(facts).toEqual([
      { label: 'Alimento', value: 'Ração seca, Dieta caseira' },
      { label: 'Aceitação', value: 'Parcial' },
    ]);
  });
});

describe('hospEventView', () => {
  it('mostra medicação como título e resumo, sem caixinhas soltas', () => {
    const view = hospEventView(
      ev({
        kind: 'medication',
        payload: {
          route: 'Oral',
          dosage: '0,5',
          presentation: 'Comprimido',
          medication_name: 'Bombinha Aerolin',
        },
      }),
    );
    expect(view.title).toBe('Bombinha Aerolin');
    expect(view.summary).toBe('Comprimido · Oral · 0,5');
    expect(view.metrics).toEqual([]);
  });

  it('agrupa vitais em métricas e chips na ordem do exame', () => {
    const view = hospEventView(
      ev({
        kind: 'vital',
        payload: {
          crt: 'eq2',
          pain: 'moderate',
          spo2: '98',
          mucosa: 'rosada',
          hydration: 'leve',
          weight_kg: '12,4',
          heart_rate: '90',
          temperature_c: '38,5',
          blood_pressure: '120/80',
          respiratory_rate: '20',
        },
      }),
    );
    expect(view.metrics.map((m) => m.key)).toEqual([
      'temperature_c',
      'heart_rate',
      'respiratory_rate',
      'weight_kg',
      'spo2',
      'blood_pressure',
    ]);
    expect(view.chips.map((c) => c.label)).toEqual([
      'TPC · 2 s',
      'Desidratação leve',
      'Rosada',
      'Dor · Moderada',
    ]);
  });
});

describe('buildHospAdmitReason', () => {
  it('junta chip e complemento', () => {
    expect(buildHospAdmitReason('pos_cirurgico', 'OSH')).toBe('Pós-cirúrgico — OSH');
    expect(buildHospAdmitReason('emergencia', '')).toBe('Emergência');
    expect(buildHospAdmitReason('', 'não se alimenta')).toBe('não se alimenta');
    expect(buildHospAdmitReason('', '  ')).toBe('');
  });
});

describe('hospEventHasContent', () => {
  it('exige ao menos um campo preenchido', () => {
    expect(hospEventHasContent({})).toBe(false);
    expect(hospEventHasContent({ heart_rate: '88' })).toBe(true);
  });
});
