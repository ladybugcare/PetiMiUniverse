import { apiRequest, getApiBaseUrl, getSupabase } from '@petimi/web-core';

const base = '/api/hub/finance';

export type HubFinanceUnbilledSourceType = 'grooming_session' | 'encounter' | 'quote' | 'appointment';
export type HubFinanceReceivableSourceType = HubFinanceUnbilledSourceType | 'manual';

export type HubFinanceUnbilledItem = {
  source_type: HubFinanceUnbilledSourceType;
  source_id: string;
  origin_label: string;
  completed_at: string | null;
  unit_id: string | null;
  guardian: { id: string; full_name: string } | null;
  pet: { id: string; name: string } | null;
  staff: { id: string; full_name: string } | null;
  estimated_amount: number;
  operational_status: string;
};

export type HubFinanceReceivable = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  guardian_id: string | null;
  guardian?: { id: string; full_name: string } | null;
  source_type: string;
  source_id: string;
  original_amount: number;
  final_amount: number;
  currency: string;
  status: string;
  due_date?: string | null;
  notes?: string | null;
  created_at: string;
  lines?: Array<{
    id: string;
    line_kind: string;
    description: string;
    quantity: number;
    unit_sale_amount: number;
    line_total: number;
    hub_service_type_id?: string | null;
    hub_inventory_item_id?: string | null;
    hub_inventory_lot_id?: string | null;
    pet_id?: string | null;
    pet?: { name: string } | null;
    service_type?: { id: string; name: string; code?: string; service_group?: string } | null;
    inventory_item?: { id: string; name: string; store_sku?: string | null } | null;
    inventory_lot?: { id: string; lot_code?: string | null; expires_at?: string | null } | null;
  }>;
};

export type HubFinancePayment = {
  id: string;
  clinic_id: string;
  receivable_id: string;
  cash_session_id?: string | null;
  amount: number;
  payment_method: HubPaymentMethod;
  installments?: number;
  payment_date: string;
  notes?: string | null;
  created_by_user_id?: string | null;
  created_at?: string;
};

export type HubFinanceAdjustment = {
  id: string;
  adjustment_type: string;
  amount: number;
  reason?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
};

export type HubFinanceReceivableDetail = HubFinanceReceivable & {
  guardian?: { id: string; full_name: string; phone?: string | null; email?: string | null } | null;
  unit?: { id: string; name?: string | null; nickname?: string | null } | null;
  source?: Record<string, unknown> | null;
  payments?: HubFinancePayment[];
  adjustments?: HubFinanceAdjustment[];
  paid_amount?: number;
  balance_amount?: number;
};

export type HubFinanceDashboardSummary = {
  period: { from: string; to: string };
  pending_billing_count: number;
  receivables_pending_count?: number;
  receivables_open_count: number;
  receivables_outstanding: number;
  payments_total_period: number;
  expenses_total_period: number;
  net_operational_period: number;
  /** Pets distintos com agendamento no período (início do slot dentro do intervalo; exclui cancelados). */
  pets_attended_distinct?: number;
};

export type HubFinanceCashFlowDay = {
  date: string;
  payments_in: number;
  expenses_out: number;
  withdrawals_out: number;
  deposits_in: number;
  net: number;
};

export type HubFinanceExpenseCategory =
  | 'supplies'
  | 'services'
  | 'utilities'
  | 'payroll'
  | 'rent'
  | 'marketing'
  | 'other';

export type HubPaymentMethod =
  | 'pix'
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'transfer'
  | 'payment_link'
  | 'customer_credit';

export type HubFinanceExpense = {
  id: string;
  clinic_id: string;
  unit_id: string;
  amount: number;
  category: HubFinanceExpenseCategory;
  description: string;
  expense_date: string;
  payment_method?: string | null;
  notes?: string | null;
  created_at: string;
};

export type HubCashSession = {
  id: string;
  clinic_id: string;
  unit_id: string;
  status: string;
  opening_balance?: number;
  opened_at?: string;
  closed_at?: string | null;
  expected_balance?: number | null;
  closing_balance?: number | null;
  difference_amount?: number | null;
};

export type HubCashSessionSummary = {
  cash_session: HubCashSession;
  payments: Array<HubFinancePayment & { receivable?: Partial<HubFinanceReceivable> | null }>;
  movements: Array<{
    id: string;
    movement_type: 'withdrawal' | 'deposit' | 'opening_adjustment';
    amount: number;
    notes?: string | null;
    created_at: string;
  }>;
  summary: {
    opening_balance: number;
    cash_payments_total: number;
    cash_payments_from_receivables?: number;
    credit_cash_in_total?: number;
    deposits_total: number;
    withdrawals_total: number;
    expected_balance: number;
    /** Totais por método de pagamento (pix, credit_card, etc.) — informativo, não entra no saldo da gaveta. */
    totals_by_method?: Record<string, number>;
  };
};

export type HubCommissionBasis = 'percent_of_sale' | 'fixed_per_sale';

export type HubCommissionRule = {
  id: string;
  clinic_id: string;
  hub_service_type_id: string;
  basis: HubCommissionBasis;
  rate: number;
  active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  hub_service_types?:
    | { id: string; name: string; code: string; service_group: string; active: boolean }
    | { id: string; name: string; code: string; service_group: string; active: boolean }[]
    | null;
};

export type HubCommissionPreviewLine = {
  line_id: string;
  description: string;
  line_total: number;
  hub_service_type_id: string | null;
  basis: string | null;
  rate: number | null;
  commission_amount: number;
};

export type HubCommissionPreviewResponse = {
  receivable_id: string;
  receivable_final_amount: number;
  lines: HubCommissionPreviewLine[];
  total_commission: number;
};

export type HubFinanceRevenueReport = {
  period: { from: string; to: string };
  total: number;
  by_method: Record<string, number>;
};

export type HubFinanceTicketAverageReport = {
  period: { from: string; to: string };
  receivables_count: number;
  total: number;
  ticket_average: number;
};

export type HubFinanceTopServicesReport = {
  period: { from: string; to: string };
  items: Array<{ service_id: string; name: string; quantity: number; total: number }>;
};

export type HubFinanceRevenueSeriesPoint = { key: string; label: string; amount: number };

export type HubFinanceRevenueSeriesReport = {
  period: { from: string; to: string };
  bucket: 'day' | 'week' | 'month';
  points: HubFinanceRevenueSeriesPoint[];
};

export type HubFinanceAgingReport = {
  as_of: string;
  buckets: Record<string, { count: number; total: number }>;
};

export const hubFinancialApi = {
  async getPendingBillingCount(clinicId: string, unitId?: string | null): Promise<number> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (unitId) q.set('unit_id', unitId);
    const res = (await apiRequest(`${base}/pending-billing-count?${q.toString()}`)) as {
      pending_billing_count?: number;
    };
    return Number(res?.pending_billing_count ?? 0);
  },

  async listUnbilledCompleted(clinicId: string, unitId?: string | null): Promise<HubFinanceUnbilledItem[]> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (unitId) q.set('unit_id', unitId);
    const res = (await apiRequest(`${base}/unbilled-completed?${q.toString()}`)) as {
      items?: HubFinanceUnbilledItem[];
    };
    return res.items ?? [];
  },

  async listReceivables(
    clinicId: string,
    opts?: { unit_id?: string | null; status?: string }
  ): Promise<HubFinanceReceivable[]> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.unit_id) q.set('unit_id', opts.unit_id);
    if (opts?.status) q.set('status', opts.status);
    const res = (await apiRequest(`${base}/receivables?${q.toString()}`)) as { receivables?: HubFinanceReceivable[] };
    return res.receivables ?? [];
  },

  async createReceivable(body: {
    clinic_id: string;
    source_type: HubFinanceReceivableSourceType;
    source_id?: string;
    unit_id?: string | null;
    guardian_id?: string | null;
    due_date?: string | null;
    notes?: string | null;
    lines?: Array<{ description: string; quantity?: number; unit_sale_amount: number }>;
  }): Promise<{ receivable: HubFinanceReceivable }> {
    return apiRequest(`${base}/receivables`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      receivable: HubFinanceReceivable;
    }>;
  },

  async getReceivableDetail(receivableId: string, clinicId: string): Promise<HubFinanceReceivableDetail> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    const res = (await apiRequest(`${base}/receivables/${encodeURIComponent(receivableId)}?${q}`)) as {
      receivable?: HubFinanceReceivableDetail;
    };
    if (!res.receivable) throw new Error('Recebível não encontrado');
    return res.receivable;
  },

  async addReceivableProductLine(
    receivableId: string,
    body: {
      clinic_id: string;
      item_id: string;
      lot_id: string;
      quantity: number;
      unit_sale_amount: number;
      description?: string | null;
      notes?: string | null;
    }
  ): Promise<{ receivable: HubFinanceReceivable }> {
    return apiRequest(`${base}/receivables/${encodeURIComponent(receivableId)}/product-lines`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ receivable: HubFinanceReceivable }>;
  },

  async removeReceivableProductLine(receivableId: string, lineId: string, clinicId: string): Promise<{ receivable: HubFinanceReceivable }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/receivables/${encodeURIComponent(receivableId)}/product-lines/${encodeURIComponent(lineId)}?${q}`, {
      method: 'DELETE',
    }) as Promise<{ receivable: HubFinanceReceivable }>;
  },

  async cancelReceivable(receivableId: string, body: { clinic_id: string; reason: string }): Promise<{ receivable: HubFinanceReceivable }> {
    return apiRequest(`${base}/receivables/${encodeURIComponent(receivableId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ receivable: HubFinanceReceivable }>;
  },

  async createReceivablePayment(
    receivableId: string,
    body: {
      clinic_id: string;
      amount: number;
      payment_method: HubPaymentMethod;
      installments?: number;
      notes?: string | null;
      cash_session_id?: string | null;
    }
  ): Promise<{ payment: Record<string, unknown>; receivable_status: string }> {
    return apiRequest(`${base}/receivables/${encodeURIComponent(receivableId)}/payments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ payment: Record<string, unknown>; receivable_status: string }>;
  },

  async reversePayment(paymentId: string, body: { clinic_id: string; reason: string }): Promise<{ ok: boolean; receivable_status: string; warning?: string | null }> {
    return apiRequest(`${base}/payments/${encodeURIComponent(paymentId)}/reverse`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ ok: boolean; receivable_status: string; warning?: string | null }>;
  },

  async getCashSessionSummary(sessionId: string, clinicId: string): Promise<HubCashSessionSummary> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/cash-sessions/${encodeURIComponent(sessionId)}/summary?${q}`) as Promise<HubCashSessionSummary>;
  },

  async waiveBilling(body: {
    clinic_id: string;
    source_type: HubFinanceUnbilledSourceType;
    source_id: string;
    reason: string;
  }): Promise<void> {
    await apiRequest(`${base}/waive-billing`, { method: 'POST', body: JSON.stringify(body) });
  },

  async getCashSessionOpen(clinicId: string, unitId: string): Promise<{ cash_session: HubCashSession | null }> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    return apiRequest(`${base}/cash-sessions/open?${q.toString()}`) as Promise<{ cash_session: HubCashSession | null }>;
  },

  async openCashSession(body: {
    clinic_id: string;
    unit_id: string;
    opening_balance: number;
    opened_by_staff_id?: string | null;
  }): Promise<{ cash_session: HubCashSession }> {
    return apiRequest(`${base}/cash-sessions/open`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      cash_session: HubCashSession;
    }>;
  },

  async closeCashSession(
    sessionId: string,
    body: { clinic_id: string; closing_balance: number; notes?: string | null }
  ): Promise<{ cash_session: HubCashSession }> {
    return apiRequest(`${base}/cash-sessions/${encodeURIComponent(sessionId)}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ cash_session: HubCashSession }>;
  },

  async getDashboardSummary(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string }
  ): Promise<HubFinanceDashboardSummary> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return apiRequest(`${base}/dashboard-summary?${q}`) as Promise<HubFinanceDashboardSummary>;
  },

  async getCashFlow(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string }
  ): Promise<{ period: { from: string; to: string }; days: HubFinanceCashFlowDay[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return apiRequest(`${base}/cash-flow?${q}`) as Promise<{
      period: { from: string; to: string };
      days: HubFinanceCashFlowDay[];
    }>;
  },

  async getRevenueReport(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string }
  ): Promise<HubFinanceRevenueReport> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return apiRequest(`${base}/reports/revenue?${q}`) as Promise<HubFinanceRevenueReport>;
  },

  async getRevenueSeries(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string; bucket?: 'day' | 'week' | 'month' }
  ): Promise<HubFinanceRevenueSeriesReport> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    if (opts?.bucket) q.set('bucket', opts.bucket);
    return apiRequest(`${base}/reports/revenue-series?${q}`) as Promise<HubFinanceRevenueSeriesReport>;
  },

  async getTicketAverageReport(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string }
  ): Promise<HubFinanceTicketAverageReport> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return apiRequest(`${base}/reports/ticket-average?${q}`) as Promise<HubFinanceTicketAverageReport>;
  },

  async getTopServicesReport(
    clinicId: string,
    unitId: string,
    opts?: { days?: number; from?: string; to?: string }
  ): Promise<HubFinanceTopServicesReport> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.days != null) q.set('days', String(opts.days));
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return apiRequest(`${base}/reports/top-services?${q}`) as Promise<HubFinanceTopServicesReport>;
  },

  async getAgingReport(clinicId: string, unitId: string, opts?: { as_of?: string }): Promise<HubFinanceAgingReport> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.as_of) q.set('as_of', opts.as_of);
    return apiRequest(`${base}/reports/aging?${q}`) as Promise<HubFinanceAgingReport>;
  },

  async listExpenses(
    clinicId: string,
    unitId: string,
    opts?: { from?: string; to?: string }
  ): Promise<HubFinanceExpense[]> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId });
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const res = (await apiRequest(`${base}/expenses?${q}`)) as { expenses?: HubFinanceExpense[] };
    return res.expenses ?? [];
  },

  async createExpense(body: {
    clinic_id: string;
    unit_id: string;
    amount: number;
    category: HubFinanceExpenseCategory;
    description: string;
    expense_date?: string;
    payment_method?: string | null;
    notes?: string | null;
  }): Promise<{ expense: HubFinanceExpense }> {
    return apiRequest(`${base}/expenses`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      expense: HubFinanceExpense;
    }>;
  },

  async createCashMovement(
    sessionId: string,
    body: {
      clinic_id: string;
      movement_type: 'withdrawal' | 'deposit';
      amount: number;
      notes?: string | null;
    }
  ): Promise<{ movement: Record<string, unknown> }> {
    return apiRequest(`${base}/cash-sessions/${encodeURIComponent(sessionId)}/movements`, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ movement: Record<string, unknown> }>;
  },

  async listCommissionRules(clinicId: string, opts?: { includeInactive?: boolean }): Promise<HubCommissionRule[]> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    if (opts?.includeInactive) q.set('include_inactive', 'true');
    const res = (await apiRequest(`${base}/commission-rules?${q}`)) as { rules?: HubCommissionRule[] };
    return res.rules ?? [];
  },

  async upsertCommissionRule(body: {
    clinic_id: string;
    hub_service_type_id: string;
    basis: HubCommissionBasis;
    rate: number;
    notes?: string | null;
    active?: boolean;
  }): Promise<{ rule: HubCommissionRule }> {
    return apiRequest(`${base}/commission-rules`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      rule: HubCommissionRule;
    }>;
  },

  async patchCommissionRule(
    ruleId: string,
    body: {
      clinic_id: string;
      basis?: HubCommissionBasis;
      rate?: number;
      notes?: string | null;
      active?: boolean;
    }
  ): Promise<{ rule: HubCommissionRule }> {
    return apiRequest(`${base}/commission-rules/${encodeURIComponent(ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as Promise<{ rule: HubCommissionRule }>;
  },

  async deleteCommissionRule(ruleId: string, clinicId: string): Promise<void> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    await apiRequest(`${base}/commission-rules/${encodeURIComponent(ruleId)}?${q}`, { method: 'DELETE' });
  },

  async getCommissionPreview(clinicId: string, receivableId: string): Promise<HubCommissionPreviewResponse> {
    const q = new URLSearchParams({ clinic_id: clinicId, receivable_id: receivableId });
    return apiRequest(`${base}/commission-preview?${q}`) as Promise<HubCommissionPreviewResponse>;
  },

  async listClosedCashSessions(
    clinicId: string,
    unitId: string,
    limit = 20
  ): Promise<{ sessions: HubCashSession[] }> {
    const q = new URLSearchParams({ clinic_id: clinicId, unit_id: unitId, limit: String(limit) });
    return apiRequest(`${base}/cash-sessions/closed?${q}`) as Promise<{ sessions: HubCashSession[] }>;
  },

  async postCreditMovement(body: {
    clinic_id: string;
    guardian_id: string;
    direction: 'in' | 'out';
    amount: number;
    reason: string;
    comanda_id?: string | null;
    receivable_id?: string | null;
    payment_method?: 'pix' | 'cash' | 'credit_card' | 'debit_card' | 'transfer' | 'payment_link' | 'other';
    cash_session_id?: string | null;
    notes?: string | null;
  }): Promise<{ movement: Record<string, unknown> }> {
    return apiRequest(`${base}/credit-movements`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      movement: Record<string, unknown>;
    }>;
  },

  async getCreditBalance(clinicId: string, guardianId: string): Promise<{ balance: number; movements_count: number }> {
    const q = new URLSearchParams({ clinic_id: clinicId, guardian_id: guardianId });
    return apiRequest(`${base}/credit-balance?${q}`) as Promise<{ balance: number; movements_count: number }>;
  },

  async listPackages(clinicId: string): Promise<{ packages: Array<Record<string, unknown>> }> {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`${base}/packages?${q}`) as Promise<{ packages: Array<Record<string, unknown>> }>;
  },

  async createPackage(body: {
    clinic_id: string;
    name: string;
    hub_service_type_id?: string | null;
    sessions_total: number;
    price: number;
    validity_days?: number | null;
    notes?: string | null;
  }): Promise<{ package: Record<string, unknown> }> {
    return apiRequest(`${base}/packages`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{ package: Record<string, unknown> }>;
  },
};

async function fetchHubPaymentReceiptPdfBlob(paymentId: string, clinicId: string): Promise<Blob> {
  const token = (await getSupabase().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const url = `${getApiBaseUrl()}${base}/payments/${encodeURIComponent(paymentId)}/receipt?${new URLSearchParams({ clinic_id: clinicId })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || 'Falha ao gerar comprovante');
  }
  return res.blob();
}

export async function openHubPaymentReceiptPdf(paymentId: string, clinicId: string): Promise<void> {
  const blob = await fetchHubPaymentReceiptPdfBlob(paymentId, clinicId);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}
