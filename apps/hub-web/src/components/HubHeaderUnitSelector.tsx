import React, { useEffect, useRef, useState } from 'react';
import { Home, ChevronDown, Check } from 'lucide-react';
import { useHubUnit } from '../contexts/HubUnitContext';
import { useHubCashSession } from '../contexts/HubCashSessionContext';
import type { HubUnit } from '../types/hubUnit';

const HubHeaderUnitSelector: React.FC = () => {
  const { clinicId, clinicName, selectedUnit, units, setSelectedUnit, loading } = useHubUnit();
  const { isOpen: caixaOpen, pendingBillingCount } = useHubCashSession();
  const [open, setOpen] = useState(false);
  const [pendingUnit, setPendingUnit] = useState<HubUnit | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasMultiple = units.length > 1;
  const unitLabel =
    selectedUnit?.name?.trim() ||
    (units.length === 1 ? units[0]?.name?.trim() : '') ||
    '—';
  const primaryLabel = clinicId ? clinicName : 'Sem clínica';
  const secondaryLabel = clinicId ? unitLabel || '—' : '—';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (loading) {
    return (
      <div className="hub-header-unit hub-header-unit--loading" aria-busy="true">
        <span className="hub-header-unit__icon-wrap" aria-hidden>
          <Home size={18} strokeWidth={1.75} />
        </span>
        <span className="hub-header-unit__text">
          <span className="hub-header-unit__name">A carregar…</span>
        </span>
      </div>
    );
  }

  const body = (
    <>
      <span className="hub-header-unit__icon-wrap" aria-hidden>
        <Home size={18} strokeWidth={1.75} />
      </span>
      <span className="hub-header-unit__text">
        <span className="hub-header-unit__name">{primaryLabel}</span>
        <span className="hub-header-unit__sub">{secondaryLabel}</span>
      </span>
      {hasMultiple && (
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`hub-header-unit__chevron${open ? ' hub-header-unit__chevron--open' : ''}`}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <div className="hub-header-unit-wrap" ref={wrapRef}>
      {hasMultiple ? (
        <button
          type="button"
          className="hub-header-unit"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Unidade: ${primaryLabel}, ${secondaryLabel}. Escolher unidade`}
          onClick={() => setOpen((o) => !o)}
        >
          {body}
        </button>
      ) : (
        <div className="hub-header-unit hub-header-unit--static" aria-label={`Unidade: ${primaryLabel}, ${secondaryLabel}`}>
          {body}
        </div>
      )}

      {open && hasMultiple && (
        <div className="hub-header-unit__menu" role="listbox" aria-label="Unidades">
          {units.map((unit) => {
            const active = selectedUnit?.id === unit.id;
            return (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`hub-header-unit__option${active ? ' hub-header-unit__option--active' : ''}`}
                onClick={() => {
                  const active = selectedUnit?.id === unit.id;
                  if (!active && caixaOpen && pendingBillingCount > 0) {
                    setPendingUnit(unit);
                    setOpen(false);
                  } else {
                    setSelectedUnit(unit);
                    setOpen(false);
                  }
                }}
              >
                <span className="hub-header-unit__option-text">
                  <span className="hub-header-unit__option-name">{unit.name}</span>
                  {unit.is_main && <span className="hub-header-unit__option-badge">Matriz</span>}
                </span>
                {active && <Check size={16} strokeWidth={2.25} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      {pendingUnit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unit-switch-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '24px 28px',
              maxWidth: 380,
              width: '100%',
              margin: '0 16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h2
              id="unit-switch-title"
              style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}
            >
              Caixa aberto na unidade atual
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: '#555', lineHeight: 1.5 }}>
              Há <strong>{pendingBillingCount}</strong> item(ns) pendente(s) no caixa de{' '}
              <strong>{selectedUnit?.name}</strong>. A sessão permanecerá aberta ao trocar de unidade.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPendingUnit(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: '1px solid #e5e5e5',
                  background: '#f5f5f5',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedUnit(pendingUnit);
                  setPendingUnit(null);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#f0642f',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Trocar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HubHeaderUnitSelector;
