export type Row = Record<string, unknown>;

export type MockSupabaseState = {
  tables: Record<string, Row[]>;
};

type Filter =
  | { kind: 'eq'; col: string; val: unknown }
  | { kind: 'neq'; col: string; val: unknown }
  | { kind: 'is'; col: string; val: unknown }
  | { kind: 'in'; col: string; vals: unknown[] }
  | { kind: 'not'; col: string; op: 'in' | 'is'; vals?: unknown[]; val?: unknown }
  | { kind: 'gte'; col: string; val: unknown }
  | { kind: 'lte'; col: string; val: unknown }
  | { kind: 'or'; expr: string };

function matchesFilter(row: Row, filter: Filter): boolean {
  switch (filter.kind) {
    case 'eq':
      return row[filter.col] === filter.val;
    case 'neq':
      return row[filter.col] !== filter.val;
    case 'is':
      if (filter.val === null) return row[filter.col] == null;
      return row[filter.col] === filter.val;
    case 'in':
      return filter.vals.includes(row[filter.col]);
    case 'not':
      if (filter.op === 'in' && filter.vals) return !filter.vals.includes(row[filter.col]);
      if (filter.op === 'is') return row[filter.col] !== filter.val;
      return true;
    case 'gte':
      return String(row[filter.col] ?? '') >= String(filter.val ?? '');
    case 'lte':
      return String(row[filter.col] ?? '') <= String(filter.val ?? '');
    case 'or': {
      const parts = filter.expr.split(',');
      return parts.some((part) => {
        const trimmed = part.trim();
        if (trimmed.includes('.is.null')) {
          const col = trimmed.split('.')[0];
          return row[col] == null;
        }
        const m = trimmed.match(/^(\w+)\.eq\.(.+)$/);
        if (m) return row[m[1]] === m[2];
        return false;
      });
    }
    default:
      return true;
  }
}

class MockQueryBuilder {
  private filters: Filter[] = [];
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Row | Row[] | null = null;

  constructor(
    private readonly table: string,
    private readonly state: MockSupabaseState
  ) {}

  select(_cols?: string): this {
    if (this.op === 'select') return this;
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ kind: 'eq', col, val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ kind: 'neq', col, val });
    return this;
  }

  is(col: string, val: unknown): this {
    this.filters.push({ kind: 'is', col, val });
    return this;
  }

  in(col: string, vals: unknown[]): this {
    this.filters.push({ kind: 'in', col, vals });
    return this;
  }

  not(col: string, op: 'in' | 'is', val: unknown): this {
    if (op === 'in') {
      const vals = Array.isArray(val) ? val : String(val).replace(/[()"]/g, '').split(',').map((s) => s.trim());
      this.filters.push({ kind: 'not', col, op: 'in', vals });
    } else {
      this.filters.push({ kind: 'not', col, op: 'is', val });
    }
    return this;
  }

  gte(col: string, val: unknown): this {
    this.filters.push({ kind: 'gte', col, val });
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push({ kind: 'lte', col, val });
    return this;
  }

  or(expr: string): this {
    this.filters.push({ kind: 'or', expr });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderSpec = { col, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  private rows(): Row[] {
    return this.state.tables[this.table] ?? [];
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) => this.filters.every((f) => matchesFilter(row, f)));
  }

  private finalize(rows: Row[]): Row[] {
    let out = [...rows];
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      out.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = String(av).localeCompare(String(bv));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private run(): { data: Row | Row[] | null; error: null } {
    if (this.op === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const withIds = rows.map((r) => ({
        id: r.id ?? crypto.randomUUID(),
        created_at: r.created_at ?? new Date().toISOString(),
        ...r,
      }));
      const table = this.state.tables[this.table] ?? [];
      this.state.tables[this.table] = [...table, ...withIds];
      return { data: withIds.length === 1 ? withIds[0] : withIds, error: null };
    }

    if (this.op === 'update') {
      const table = this.rows();
      const updated: Row[] = [];
      for (let i = 0; i < table.length; i++) {
        const row = table[i];
        if (this.filters.every((f) => matchesFilter(row, f))) {
          const next = { ...row, ...(this.payload as Row) };
          table[i] = next;
          updated.push(next);
        }
      }
      this.state.tables[this.table] = table;
      return { data: updated, error: null };
    }

    const filtered = this.finalize(this.applyFilters(this.rows()));
    return { data: filtered, error: null };
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const { data } = this.run();
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: Row; error: null }> {
    const { data } = this.run();
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (!rows[0]) throw new Error(`No rows for ${this.table}`);
    return { data: rows[0], error: null };
  }

  then<TResult1 = { data: Row[] | Row | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createMockSupabaseClient(initial: MockSupabaseState) {
  const state: MockSupabaseState = {
    tables: Object.fromEntries(
      Object.entries(initial.tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
    ),
  };

  return {
    from: (table: string) => new MockQueryBuilder(table, state),
    auth: {
      getUser: async () => ({
        data: { user: { id: 'test-user', email: 'test@test.com', user_metadata: { role: 'CADMIN' } } },
        error: null,
      }),
    },
    _state: state,
  };
}

export function resetMockSupabaseState(
  client: ReturnType<typeof createMockSupabaseClient>,
  initial: MockSupabaseState
): void {
  client._state.tables = Object.fromEntries(
    Object.entries(initial.tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
}
