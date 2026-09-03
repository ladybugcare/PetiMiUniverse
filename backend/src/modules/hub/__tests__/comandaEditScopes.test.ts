import { computeComandaEditScopes } from '../comandaEditScopes';

describe('computeComandaEditScopes', () => {
  it('comanda manual vazia (total 0) permanece editável no caixa', () => {
    expect(
      computeComandaEditScopes(
        { status: 'aberta', total_amount: 0, finance_handoff_at: null },
        true,
        0,
      ),
    ).toEqual({ caixa: true, financeiro: true, locked_reason: null });
  });

  it('comanda com valor quitado e operação concluída trava edição', () => {
    expect(
      computeComandaEditScopes(
        { status: 'aberta', total_amount: 150, finance_handoff_at: null },
        true,
        0,
      ),
    ).toEqual({ caixa: false, financeiro: false, locked_reason: 'paid_and_complete' });
  });

  it('comanda com saldo pendente continua editável mesmo com operação concluída', () => {
    expect(
      computeComandaEditScopes(
        { status: 'aberta', total_amount: 150, finance_handoff_at: null },
        true,
        50,
      ),
    ).toEqual({ caixa: true, financeiro: true, locked_reason: null });
  });

  it('após handoff, só financeiro edita', () => {
    expect(
      computeComandaEditScopes(
        { status: 'aberta', total_amount: 80, finance_handoff_at: '2026-09-02T12:00:00.000Z' },
        false,
        80,
      ),
    ).toEqual({ caixa: false, financeiro: true, locked_reason: 'finance_handoff' });
  });

  it('comanda fechada fica só leitura', () => {
    expect(
      computeComandaEditScopes(
        { status: 'fechada', total_amount: 100, finance_handoff_at: null },
        true,
        0,
      ),
    ).toEqual({ caixa: false, financeiro: false, locked_reason: 'closed' });
  });
});
