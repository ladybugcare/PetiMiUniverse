import { apiRequest, getApiBaseUrl, getSupabase } from '@petimi/web-core';

export type ReportPdfPayload = {
  clinicId: string;
  title: string;
  subtitle?: string | null;
  filename?: string | null;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
};

function normalizeRows(
  rows: Array<Array<string | number | null | undefined>>,
): Array<Array<string | number | null>> {
  return rows.map((r) => r.map((c) => (c === undefined ? null : c)));
}

/** Baixa PDF tabular gerado no backend (pdfkit). */
export async function downloadReportPdf(payload: ReportPdfPayload): Promise<void> {
  const session = await getSupabase().auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const res = await fetch(`${getApiBaseUrl()}/api/hub/reports/export-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      clinic_id: payload.clinicId,
      title: payload.title,
      subtitle: payload.subtitle ?? null,
      filename: payload.filename ?? null,
      headers: payload.headers,
      rows: normalizeRows(payload.rows),
    }),
  });

  if (!res.ok) {
    let msg = 'Erro ao gerar PDF';
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(cd);
  a.download = m?.[1] || `petmi-relatorio-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export type HubReportEmailSchedule = {
  id: string;
  clinic_id: string;
  unit_id: string | null;
  report_id: string;
  cadence: string;
  recipient_email: string;
  period_days: number;
  active: boolean;
  last_sent_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export const hubReportSchedulesApi = {
  list(clinicId: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/reports/email-schedules?${q}`) as Promise<{
      schedules: HubReportEmailSchedule[];
    }>;
  },
  create(body: {
    clinic_id: string;
    unit_id?: string | null;
    report_id: string;
    recipient_email: string;
    period_days?: number;
  }) {
    return apiRequest('/api/hub/reports/email-schedules', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<{ schedule: HubReportEmailSchedule }>;
  },
  patch(
    id: string,
    body: {
      clinic_id: string;
      recipient_email?: string;
      period_days?: number;
      active?: boolean;
      unit_id?: string | null;
    },
  ) {
    return apiRequest(`/api/hub/reports/email-schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as Promise<{ schedule: HubReportEmailSchedule }>;
  },
  remove(clinicId: string, id: string) {
    const q = new URLSearchParams({ clinic_id: clinicId });
    return apiRequest(`/api/hub/reports/email-schedules/${encodeURIComponent(id)}?${q}`, {
      method: 'DELETE',
    }) as Promise<void>;
  },
  run(clinicId: string, id: string) {
    return apiRequest(`/api/hub/reports/email-schedules/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      body: JSON.stringify({ clinic_id: clinicId }),
    }) as Promise<{
      schedule: HubReportEmailSchedule;
      preview: { to: string; subject: string; note: string };
      delivery: string;
    }>;
  },
};
