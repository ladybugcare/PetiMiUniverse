import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MATRIX_FILE } from './constants';

export type HomologStatus = 'PASSOU' | 'FALHOU' | 'BLOQUEADO' | 'NAO_EXECUTADO';

export type FinancialSnapshot = {
  final_amount?: number | null;
  paid_amount?: number | null;
  balance_amount?: number | null;
  posted_amount?: number | null;
  line_refunds_amount?: number | null;
  returned_amount?: number | null;
  status?: string | null;
  stock_return_status?: string | null;
};

export type MatrixRow = {
  id: string;
  scenario: string;
  before: FinancialSnapshot | null;
  after: FinancialSnapshot | null;
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  comanda_ok: boolean | null;
  receivable_ok: boolean | null;
  stock_ok: boolean | null;
  evidence: string[];
  fixture_id: string | null;
  status: HomologStatus;
  error?: string | null;
  finished_at: string;
};

type MatrixFile = {
  suite: string;
  started_at: string;
  updated_at: string;
  rows: MatrixRow[];
};

const startedAt = new Date().toISOString();
const rows: MatrixRow[] = [];

function loadExisting(): MatrixFile | null {
  if (!existsSync(MATRIX_FILE)) return null;
  try {
    return JSON.parse(readFileSync(MATRIX_FILE, 'utf8')) as MatrixFile;
  } catch {
    return null;
  }
}

function flush() {
  mkdirSync(dirname(MATRIX_FILE), { recursive: true });
  const payload: MatrixFile = {
    suite: 'etapa-a-devolucoes',
    started_at: loadExisting()?.started_at ?? startedAt,
    updated_at: new Date().toISOString(),
    rows: [...rows],
  };
  writeFileSync(MATRIX_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function recordMatrixRow(row: Omit<MatrixRow, 'finished_at'> & { finished_at?: string }) {
  const full: MatrixRow = {
    ...row,
    finished_at: row.finished_at ?? new Date().toISOString(),
  };
  const idx = rows.findIndex((r) => r.id === full.id);
  if (idx >= 0) rows[idx] = full;
  else rows.push(full);
  flush();
}

export function snapshotFromReceivable(rec: Record<string, unknown>): FinancialSnapshot {
  return {
    final_amount: num(rec.final_amount),
    paid_amount: num(rec.paid_amount),
    balance_amount: num(rec.balance_amount),
    posted_amount: num(rec.posted_amount),
    line_refunds_amount: num(rec.line_refunds_amount),
    returned_amount: num(rec.returned_amount),
    status: rec.status != null ? String(rec.status) : null,
    stock_return_status: rec.stock_return_status != null ? String(rec.stock_return_status) : null,
  };
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}