import React, { useEffect, useRef, useState } from 'react';
import { Home, ChevronDown, Check } from 'lucide-react';
import { useHubUnit } from '../contexts/HubUnitContext';
import { useHubCashSession } from '../contexts/HubCashSessionContext';
import type { HubUnit } from '../types/hubUnit';
import { unitShortLabel } from '../utils/hubUnitDisplay';

type HubHeaderUnitSelectorProps = {
  collapsed?: boolean;
};

const HubHeaderUnitSelector: React.FC<HubHeaderUnitSelectorProps> = ({ collapsed = false }) => {
  const { clinicId, clinicName, selectedUnit, units, setSelectedUnit, loading } = useHubUnit();
  const { isOpen: caixaOpen, pendingBillingCount } = useHubCashSession();
  const [open, setOpen] = useState(false);
  const [pendingUnit, setPendingUnit] = useState<HubUnit | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasMultiple = units.length > 1;
  const primaryLabel = clinicId ? clinicName : 'Sem clínica';
  const selectedShort = selectedUnit
    ? unitShortLabel(selectedUnit, clinicName)
    : units.length === 1
      ? unitShortLabel(units[0], clinicName)
      : '—';
  /** Com várias unidades, sempre mostra o rótulo curto (Matriz / Granja) — mesma estrutura para todas. */
  const showSecondary = Boolean(clinicId) && hasMultiple && selectedShort !== '—';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const wrapClass = [
    'hub-header-unit-wrap',
    'hub-header-unit-wrap--sidebar',
    collapsed ? 'hub-header-unit-wrap--collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (loading) {
    return (
      <div className={wrapClass}>
        <div className="hub-header-unit hub-header-unit--loading" aria-busy="true">
          <span className="hub-header-unit__icon-wrap" aria-hidden>
            <Home size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-header-unit__text">
            <span className="hub-header-unit__name">Carregando…</span>
          </span>
        </div>
      </div>
    );
  }

  const ariaUnit = showSecondary ? `${primaryLabel}, ${selectedShort}` : primaryLabel;

  const body = (
    <>
      <span className="hub-header-unit__icon-wrap" aria-hidden>
        <Home size={18} strokeWidth={1.75} />
      </span>
      <span className="hub-header-unit__text">
        <span className="hub-header-unit__name">{primaryLabel}</span>
        {showSecondary ? <span className="hub-header-unit__sub">{selectedShort}</span> : null}
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

  const pickUnit = (unit: HubUnit) => {
    const already = selectedUnit?.id === unit.id;
    if (!already && caixaOpen && pendingBillingCount > 0) {
      setPendingUnit(unit);
      setOpen(false);
    } else {
      setSelectedUnit(unit);
      setOpen(false);
    }
  };

  return (
    <div className={wrapClass} ref={wrapRef}>
      {hasMultiple ? (
        <button
          type="button"
          className="hub-header-unit"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={`Unidade operacional: ${ariaUnit}. Escolher unidade`}
          title={collapsed ? ariaUnit : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {body}
        </button>
      ) : (
        <div
          className="hub-header-unit hub-header-unit--static"
          aria-label={`Unidade: ${ariaUnit}`}
          title={collapsed ? ariaUnit : undefined}
        >
          {body}
        </div>
      )}

      {open && hasMultiple ? (
        <div className="hub-header-unit__menu" role="listbox" aria-label="Unidades">
          <p className="hub-header-unit__menu-hint">
            Unidade operacional (caixa e lançamentos). Nas filas e na Agenda, use o filtro{' '}
            <strong>Todas as unidades</strong> para ver as duas juntas.
          </p>
          {units.map((unit) => {
            const active = selectedUnit?.id === unit.id;
            const short = unitShortLabel(unit, clinicName);
            const fullName = unit.name?.trim() || '';
            const showFull =
              Boolean(fullName) &&
              fullName.localeCompare(short, 'pt-BR', { sensitivity: 'accent' }) !== 0;
            return (
              <button
                key={unit.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`hub-header-unit__option${active ? ' hub-header-unit__option--active' : ''}`}
                onClick={() => pickUnit(unit)}
              >
                <span className="hub-header-unit__option-text">
                  <span className="hub-header-unit__option-name">{short}</span>
                  {showFull ? <span className="hub-header-unit__option-sub">{fullName}</span> : null}
                </span>
                {active ? <Check size={16} strokeWidth={2.25} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {pendingUnit ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unit-switch-title"
          className="hub-header-unit__dialog-backdrop"
        >
          <div className="hub-header-unit__dialog">
            <h2 id="unit-switch-title" className="hub-header-unit__dialog-title">
              Caixa aberto na unidade atual
            </h2>
            <p className="hub-header-unit__dialog-text">
              Há <strong>{pendingBillingCount}</strong> item(ns) pendente(s) no caixa de{' '}
              <strong>{selectedUnit ? unitShortLabel(selectedUnit, clinicName) : '—'}</strong>. A sessão
              permanecerá aberta ao trocar de unidade.
            </p>
            <div className="hub-header-unit__dialog-actions">
              <button
                type="button"
                className="hub-header-unit__dialog-btn hub-header-unit__dialog-btn--ghost"
                onClick={() => setPendingUnit(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hub-header-unit__dialog-btn hub-header-unit__dialog-btn--primary"
                onClick={() => {
                  setSelectedUnit(pendingUnit);
                  setPendingUnit(null);
                }}
              >
                Trocar mesmo assim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HubHeaderUnitSelector;
