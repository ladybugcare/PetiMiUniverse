import { apiRequest } from '@petimi/web-core';

const base = '/api/hub/finance';

export type HubFinanceUnbilledSourceType = 'grooming_session' | 'encounter' | 'quote';

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
  source_type: string;
  source_id: string;
  original_amount: number;
  final_amount: number;
  currency: string;
  status: string;
  due_date?: string | null;
  notes?: string | null;
  created_at: string;
  lines?: unknown[];
};

export type HubFinanceDashboardSummary = {
  period: { from: string; to: string };
  pending_billing_count: number;
  receivables_open_count: number;
  receivables_outstanding: number;
  payments_total_period: number;
  expenses_total_period: number;
  net_operational_period: number;
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
    source_type: HubFinanceUnbilledSourceType;
    source_id: string;
    notes?: string | null;
  }): Promise<{ receivable: HubFinanceReceivable }> {
    return apiRequest(`${base}/receivables`, { method: 'POST', body: JSON.stringify(body) }) as Promise<{
      receivable: HubFinanceReceivable;
    }>;
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
};
