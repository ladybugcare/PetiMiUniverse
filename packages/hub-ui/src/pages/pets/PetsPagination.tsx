import React from 'react';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';

const PAGE_SIZE_OPTIONS: HubComboboxOption[] = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
];

interface PetsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}

function buildVisiblePages(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (current >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }
  return [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

export const PetsPagination: React.FC<PetsPaginationProps> = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const visible = buildVisiblePages(safePage, totalPages);

  return (
    <div className="hub-pets-pagination">
      <span>
        Mostrando {from} a {to} de {total.toLocaleString('pt-BR')} pets
      </span>
      <div className="hub-pets-pagination__pages">
        <button
          type="button"
          className="hub-pets-pagination__page"
          disabled={safePage <= 1}
          aria-label="Página anterior"
          onClick={() => onPageChange(safePage - 1)}
        >
          ‹
        </button>
        {visible.map((p, idx) => {
          const prev = visible[idx - 1];
          const showGap = idx > 0 && prev !== undefined && p - prev > 1;
          return (
            <React.Fragment key={p}>
              {showGap ? (
                <span style={{ padding: '0 4px', color: 'var(--hc-text-muted)' }} aria-hidden>
                  …
                </span>
              ) : null}
              <button
                type="button"
                className={`hub-pets-pagination__page ${p === safePage ? 'hub-pets-pagination__page--active' : ''}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            </React.Fragment>
          );
        })}
        <button
          type="button"
          className="hub-pets-pagination__page"
          disabled={safePage >= totalPages}
          aria-label="Próxima página"
          onClick={() => onPageChange(safePage + 1)}
        >
          ›
        </button>
      </div>
      <div className="hub-pets-pagination__per-page">
        <label htmlFor="hub-pets-per-page" className="hub-clientes__muted" style={{ fontSize: 13 }}>
          Por página
        </label>
        <HubSearchableCombobox
          id="hub-pets-per-page"
          className="hub-combobox--clientes"
          options={PAGE_SIZE_OPTIONS}
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          placeholder="Por página"
          searchPlaceholder="Buscar…"
          allowCreate={false}
          clearable={false}
          ariaLabel="Itens por página"
        />
      </div>
    </div>
  );
};
