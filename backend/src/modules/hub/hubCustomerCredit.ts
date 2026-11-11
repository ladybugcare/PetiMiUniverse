import { supabaseAdmin } from '../../config/supabase';

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export class CustomerCreditError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = 'CustomerCreditError';
    this.status = status;
  }
}

export async function getHubCustomerCreditBalance(
  clinicId: string,
  guardianId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('hub_customer_credit_movements')
    .select('direction, amount')
    .eq('clinic_id', clinicId)
    .eq('guardian_id', guardianId);
  if (error) {
    if (String(error.message || '').includes('hub_customer_credit')) {
      throw new CustomerCreditError(
        'Tabela de crédito do tutor não encontrada. Aplique 044_create_hub_customer_credit_movements.sql.',
        503,
      );
    }
    throw new Error(error.message);
  }
  let balance = 0;
  for (const row of data ?? []) {
    const a = Number(row.amount ?? 0);
    if (row.direction === 'in') balance += a;
    else balance -= a;
  }
  return round2(balance);
}

export type ConsumeCustomerCreditOpts = {
  clinicId: string;
  guardianId: string;
  amount: number;
  reason: string;
  comandaId?: string | null;
  receivableId?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
};

/** Debita saldo do tutor ao pagar com `customer_credit`. */
export async function consumeHubCustomerCredit(opts: ConsumeCustomerCreditOpts): Promise<void> {
  const amount = round2(opts.amount);
  if (amount <= 0.009) return;

  const balance = await getHubCustomerCreditBalance(opts.clinicId, opts.guardianId);
  if (balance + 0.009 < amount) {
    throw new CustomerCreditError(
      `Saldo de crédito insuficiente (disponível R$ ${balance.toFixed(2)}; necessário R$ ${amount.toFixed(2)}).`,
      409,
    );
  }

  const { error } = await supabaseAdmin.from('hub_customer_credit_movements').insert({
    clinic_id: opts.clinicId,
    guardian_id: opts.guardianId,
    direction: 'out',
    amount,
    reason: opts.reason,
    comanda_id: opts.comandaId ?? null,
    receivable_id: opts.receivableId ?? null,
    payment_method: 'customer_credit',
    cash_session_id: null,
    notes: opts.notes ?? 'Aplicação de crédito do tutor no pagamento',
    created_by_user_id: opts.createdByUserId ?? null,
  });
  if (error) {
    if (String(error.message || '').includes('hub_customer_credit')) {
      throw new CustomerCreditError(
        'Tabela de crédito do tutor não encontrada. Aplique 044_create_hub_customer_credit_movements.sql.',
        503,
      );
    }
    throw new Error(error.message);
  }
}

export type RestoreCustomerCreditOpts = {
  clinicId: string;
  guardianId: string;
  amount: number;
  reason: string;
  comandaId?: string | null;
  receivableId?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
};

/** Devolve crédito ao tutor ao estornar pagamento feito com `customer_credit`. */
export async function restoreHubCustomerCredit(opts: RestoreCustomerCreditOpts): Promise<void> {
  const amount = round2(opts.amount);
  if (amount <= 0.009) return;

  const { error } = await supabaseAdmin.from('hub_customer_credit_movements').insert({
    clinic_id: opts.clinicId,
    guardian_id: opts.guardianId,
    direction: 'in',
    amount,
    reason: opts.reason,
    comanda_id: opts.comandaId ?? null,
    receivable_id: opts.receivableId ?? null,
    payment_method: null,
    cash_session_id: null,
    notes: opts.notes ?? 'Estorno de pagamento com crédito do tutor',
    created_by_user_id: opts.createdByUserId ?? null,
  });
  if (error) {
    if (String(error.message || '').includes('hub_customer_credit')) {
      throw new CustomerCreditError(
        'Tabela de crédito do tutor não encontrada. Aplique 044_create_hub_customer_credit_movements.sql.',
        503,
      );
    }
    throw new Error(error.message);
  }
}

/**
 * Se o pagamento foi com crédito do tutor, devolve o saldo.
 * Retorna o valor restaurado (0 se o método não for customer_credit).
 */
export async function restoreCustomerCreditIfNeeded(opts: {
  clinicId: string;
  paymentMethod: string | null | undefined;
  amount: number;
  receivableId: string;
  reason: string;
  createdByUserId?: string | null;
}): Promise<number> {
  if (String(opts.paymentMethod ?? '') !== 'customer_credit') return 0;

  const { data: rec } = await supabaseAdmin
    .from('hub_receivables')
    .select('guardian_id, comanda_id')
    .eq('id', opts.receivableId)
    .eq('clinic_id', opts.clinicId)
    .maybeSingle();
  const guardianId = (rec?.guardian_id as string | null) ?? null;
  if (!guardianId) {
    throw new CustomerCreditError(
      'Recebível sem tutor — não é possível devolver o crédito do pagamento estornado.',
      409,
    );
  }

  const amount = round2(opts.amount);
  await restoreHubCustomerCredit({
    clinicId: opts.clinicId,
    guardianId,
    amount,
    reason: opts.reason,
    comandaId: (rec?.comanda_id as string | null) ?? null,
    receivableId: opts.receivableId,
    createdByUserId: opts.createdByUserId ?? null,
  });
  return amount;
}
