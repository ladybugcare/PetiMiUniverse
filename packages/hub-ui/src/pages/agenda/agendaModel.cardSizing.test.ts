import { describe, expect, it } from 'vitest';
import {
  agendaCardSizeFromHeight,
  agendaDayStayPeriodLabel,
  dayLaneVisibleColumnCap,
  isAgendaDayStay,
  layoutDayLaneAppointments,
  planDayLaneOverflowDisplay,
} from './agendaModel';

describe('agendaCardSizeFromHeight', () => {
  it('usa altura para compact/medium/tall quando largura é omitida', () => {
    expect(agendaCardSizeFromHeight(30)).toBe('compact');
    // 60 min na densidade C (~44px) não cabe layout médio de 3 linhas
    expect(agendaCardSizeFromHeight(44)).toBe('compact');
    expect(agendaCardSizeFromHeight(50)).toBe('compact');
    expect(agendaCardSizeFromHeight(52)).toBe('medium');
    expect(agendaCardSizeFromHeight(80)).toBe('tall');
  });

  it('força mínimo quando largura < 96', () => {
    expect(agendaCardSizeFromHeight(100, 60)).toBe('compact');
    expect(agendaCardSizeFromHeight(100, 90)).toBe('compact');
  });

  it('só fica completo com altura ≥ 72 e largura ≥ 120', () => {
    expect(agendaCardSizeFromHeight(80, 130)).toBe('tall');
    expect(agendaCardSizeFromHeight(80, 100)).toBe('medium');
    expect(agendaCardSizeFromHeight(60, 130)).toBe('medium');
  });
});

describe('dayLaneVisibleColumnCap', () => {
  it('respeita maxVisible e piso de largura', () => {
    expect(dayLaneVisibleColumnCap(5, { maxVisible: 3, laneWidthPx: 168, minWidthPx: 72 })).toBe(2);
    expect(dayLaneVisibleColumnCap(5, { maxVisible: 3, laneWidthPx: 300, minWidthPx: 72 })).toBe(3);
    expect(dayLaneVisibleColumnCap(2, { maxVisible: 3, laneWidthPx: 300, minWidthPx: 72 })).toBe(2);
  });
});

describe('planDayLaneOverflowDisplay', () => {
  function appt(id: string, startH: number, startM: number, endH: number, endM: number) {
    return {
      id,
      start: new Date(2026, 10, 18, startH, startM),
      end: new Date(2026, 10, 18, endH, endM),
    };
  }

  it('não cria overflow quando cabem nas colunas', () => {
    const list = [appt('a', 9, 0, 10, 0), appt('b', 9, 30, 10, 30)];
    const layouts = layoutDayLaneAppointments(list);
    const plan = planDayLaneOverflowDisplay(list, layouts, {
      maxVisible: 3,
      laneWidthPx: 300,
      minWidthPx: 72,
    });
    expect(plan.overflows).toHaveLength(0);
    expect(plan.display.size).toBe(2);
  });

  it('oculta cards excedentes e agrupa no overflow', () => {
    const list = [
      appt('a', 9, 0, 10, 0),
      appt('b', 9, 0, 10, 0),
      appt('c', 9, 0, 10, 0),
      appt('d', 9, 0, 10, 0),
    ];
    const layouts = layoutDayLaneAppointments(list);
    expect(layouts.get('a')?.columnCount).toBe(4);

    const plan = planDayLaneOverflowDisplay(list, layouts, {
      maxVisible: 3,
      laneWidthPx: 300,
      minWidthPx: 72,
    });

    expect(plan.display.size).toBe(3);
    expect(plan.overflows).toHaveLength(1);
    expect(plan.overflows[0]!.hiddenIds).toHaveLength(1);
    expect(plan.overflows[0]!.allIds).toHaveLength(4);
    expect(plan.overflows[0]!.visibleIds).toHaveLength(3);
  });

  it('reduz colunas visíveis pelo piso de largura da lane', () => {
    const list = [appt('a', 9, 0, 10, 0), appt('b', 9, 0, 10, 0), appt('c', 9, 0, 10, 0)];
    const layouts = layoutDayLaneAppointments(list);
    const plan = planDayLaneOverflowDisplay(list, layouts, {
      maxVisible: 3,
      laneWidthPx: 168,
      minWidthPx: 72,
    });
    expect(plan.display.size).toBe(2);
    expect(plan.overflows[0]!.hiddenIds).toHaveLength(1);
  });

  it('mantém a sequência de horários das colunas visíveis e posiciona o +N nos ocultos', () => {
    const list = [
      appt('a', 9, 0, 10, 0),
      appt('b', 9, 0, 10, 0),
      appt('c', 9, 30, 11, 0),
      appt('d', 10, 0, 11, 0),
    ];
    const layouts = layoutDayLaneAppointments(list);
    const plan = planDayLaneOverflowDisplay(list, layouts, {
      maxVisible: 3,
      laneWidthPx: 200,
      minWidthPx: 96,
    });
    // cap 2: a (col 0) e d (col 0, depois de a) + b (col 1) visíveis; c (col 2) oculto.
    expect([...plan.display.keys()].sort()).toEqual(['a', 'b', 'd']);
    expect(plan.overflows[0]!.hiddenIds).toEqual(['c']);
    expect(plan.overflows[0]!.startMs).toBe(new Date(2026, 10, 18, 9, 30).getTime());
    expect(plan.overflows[0]!.allIds).toHaveLength(4);
  });
});

describe('isAgendaDayStay / agendaDayStayPeriodLabel', () => {
  const day = new Date(2026, 10, 19);
  const dayStart = new Date(2026, 10, 19, 7, 0);
  const dayMinutes = 13 * 60;

  it('hospedagem sempre vai para a faixa «Dia todo»', () => {
    const a = {
      start: new Date(2026, 10, 19, 11, 30),
      end: new Date(2026, 10, 19, 12, 0),
      appointment_kind: 'hotel_stay',
    };
    expect(isAgendaDayStay(a, dayStart, dayMinutes)).toBe(true);
  });

  it('atendimento ≥ 4h na grade vai para a faixa; curto fica na timeline', () => {
    const long = { start: new Date(2026, 10, 19, 8, 30), end: new Date(2026, 10, 19, 16, 0) };
    const short = { start: new Date(2026, 10, 19, 9, 0), end: new Date(2026, 10, 19, 10, 30) };
    expect(isAgendaDayStay(long, dayStart, dayMinutes)).toBe(true);
    expect(isAgendaDayStay(short, dayStart, dayMinutes)).toBe(false);
  });

  it('descreve o período relativo ao dia', () => {
    const inToday = { start: new Date(2026, 10, 19, 8, 30), end: new Date(2026, 10, 19, 16, 0) };
    const checkIn = { start: new Date(2026, 10, 19, 11, 30), end: new Date(2026, 10, 21, 10, 0) };
    const checkOut = { start: new Date(2026, 10, 17, 11, 30), end: new Date(2026, 10, 19, 10, 0) };
    const middle = { start: new Date(2026, 10, 17, 11, 30), end: new Date(2026, 10, 22, 10, 0) };
    expect(agendaDayStayPeriodLabel(inToday, day)).toBe('08:30–16:00');
    expect(agendaDayStayPeriodLabel(checkIn, day)).toBe('entra 11:30');
    expect(agendaDayStayPeriodLabel(checkOut, day)).toBe('sai 10:00');
    expect(agendaDayStayPeriodLabel(middle, day)).toBe('dia todo');
  });
});
