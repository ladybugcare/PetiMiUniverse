import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle2, ChevronDown, Dog, Package, Plus, Receipt, Trash2, User } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPackagesApi, type HubPackage, type HubPackageItem } from '../../api/hubPackagesApi';
import { hubGuardiansApi, type HubGuardian } from '../../api/hubGuardiansApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubMultiSelectCombobox } from '../../components/HubMultiSelectCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  navigateToAgendaFromPackageSale,
  packageSaleSummaryLabel,
  schedulePetLabel,
  type PackageSaleScheduleContext,
} from './packageSaleScheduleUtils';
import '../clientes/clientes.css';
import './hub-finance-page.css';

export type SellPackageOpenIntent = 'edit' | 'checkout' | 'checkout_and_schedule';

type SaleLine = {
  id: string;
  petIds: string[];
  packageId: string;
};

type ResolvedPurchaseLine = {
  petId: string;
  petName: string;
  packageId: string;
  packageName: string;
  unitPrice: number;
  package: HubPackage | null;
};

type SuccessState = {
  comandaId: string;
  scheduleContext: PackageSaleScheduleContext;
  paid: boolean;
};

type Props = {
  open: boolean;
  unitId: string | null;
  onClose: () => void;
  onCheckout: (comandaId: string, intent: 'checkout' | 'checkout_and_schedule', scheduleContext: PackageSaleScheduleContext) => void;
  /** Pré-seleciona o tutor ao abrir (ex.: perfil do pet/tutor). */
  initialGuardianId?: string | null;
  /** Pré-seleciona o pet na primeira linha (requer `initialGuardianId`). */
  initialPetId?: string | null;
  /** Trava a troca de tutor quando aberto a partir de um perfil. */
  lockGuardian?: boolean;
};

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function packageItemLabel(it: HubPackageItem): string {
  const name = it.service_name ?? 'serviço';
  const suffix = it.is_addon ? ' (adicional)' : '';
  return `${it.quantity}× ${name}${suffix}`;
}

function newSaleLine(): SaleLine {
  return { id: crypto.randomUUID(), petIds: [], packageId: '' };
}

function saleLineKey(petId: string, packageId: string): string {
  return `${petId}:${packageId}`;
}

function expandSaleLines(
  saleLines: SaleLine[],
  packageById: Map<string, HubPackage>,
  petNameById: Map<string, string>,
): ResolvedPurchaseLine[] {
  const rows: ResolvedPurchaseLine[] = [];
  for (const ln of saleLines) {
    if (!ln.packageId || ln.petIds.length === 0) continue;
    const pkg = packageById.get(ln.packageId);
    for (const petId of ln.petIds) {
      rows.push({
        petId,
        petName: petNameById.get(petId) ?? 'Pet',
        packageId: ln.packageId,
        packageName: pkg?.name ?? 'Pacote',
        unitPrice: Number(pkg?.price ?? 0),
        package: pkg ?? null,
      });
    }
  }
  return rows;
}

export const SellPackageDrawer: React.FC<Props> = ({
  open,
  unitId,
  onClose,
  onCheckout,
  initialGuardianId = null,
  initialPetId = null,
  lockGuardian = false,
}) => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [packages, setPackages] = useState<HubPackage[]>([]);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [saleLines, setSaleLines] = useState<SaleLine[]>([newSaleLine()]);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [chargeMenuOpen, setChargeMenuOpen] = useState(false);
  const chargeSplitRef = useRef<HTMLDivElement>(null);
  const chargeMenuRef = useRef<HTMLDivElement>(null);
  const [chargeMenuStyle, setChargeMenuStyle] = useState<React.CSSProperties | null>(null);
  const prefillPetAppliedRef = useRef(false);

  const updateChargeMenuPosition = useCallback(() => {
    const el = chargeSplitRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setChargeMenuStyle({
      position: 'fixed',
      right: window.innerWidth - r.right,
      bottom: window.innerHeight - r.top + 6,
      left: 'auto',
      top: 'auto',
      zIndex: 1200,
      minWidth: Math.max(200, r.width),
    });
  }, []);

  const packageById = useMemo(() => new Map(packages.map((p) => [p.id, p])), [packages]);
  const petNameById = useMemo(() => new Map(pets.map((p) => [p.id, p.name])), [pets]);

  const resolvedLines = useMemo(
    () => expandSaleLines(saleLines, packageById, petNameById),
    [saleLines, packageById, petNameById],
  );

  const cartTotal = useMemo(
    () => resolvedLines.reduce((sum, ln) => sum + ln.unitPrice, 0),
    [resolvedLines],
  );

  const hasDuplicateLine = useMemo(() => {
    const seen = new Set<string>();
    for (const ln of resolvedLines) {
      const key = saleLineKey(ln.petId, ln.packageId);
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [resolvedLines]);

  const canSubmit = Boolean(
    guardianId &&
      unitId &&
      resolvedLines.length > 0 &&
      !hasDuplicateLine &&
      saleLines.every((ln) => ln.packageId && ln.petIds.length > 0) &&
      !submitting,
  );

  const resetForm = useCallback(() => {
    setGuardianId('');
    setSaleLines([newSaleLine()]);
    setSuccessState(null);
    setChargeMenuOpen(false);
    prefillPetAppliedRef.current = false;
  }, []);

  const load = useCallback(async () => {
    if (!clinicId || !open) return;
    setLoading(true);
    try {
      const [pkgRes, guRes] = await Promise.all([
        hubPackagesApi.list(clinicId),
        hubGuardiansApi.list(clinicId, true, { status: 'active' }),
      ]);
      setPackages((pkgRes.packages ?? []).filter((p) => p.active));
      setGuardians(guRes.guardians ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [clinicId, open, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    prefillPetAppliedRef.current = false;
    if (initialGuardianId) {
      setGuardianId(initialGuardianId);
    } else {
      setGuardianId('');
      setSaleLines([newSaleLine()]);
    }
    setSuccessState(null);
    setChargeMenuOpen(false);
  }, [open, initialGuardianId, resetForm]);

  useLayoutEffect(() => {
    if (!chargeMenuOpen) {
      setChargeMenuStyle(null);
      return;
    }
    updateChargeMenuPosition();
  }, [chargeMenuOpen, updateChargeMenuPosition]);

  useEffect(() => {
    if (!chargeMenuOpen) return;
    updateChargeMenuPosition();
    const onScrollOrResize = () => updateChargeMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [chargeMenuOpen, updateChargeMenuPosition]);

  useEffect(() => {
    if (!chargeMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chargeSplitRef.current?.contains(t)) return;
      if (chargeMenuRef.current?.contains(t)) return;
      setChargeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [chargeMenuOpen]);

  useEffect(() => {
    if (!chargeMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChargeMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [chargeMenuOpen]);

  useEffect(() => {
    if (!clinicId || !guardianId) {
      setPets([]);
      if (!guardianId) setSaleLines([newSaleLine()]);
      return;
    }
    let cancelled = false;
    void hubPetsApi
      .list(clinicId)
      .then((r) => {
        if (cancelled) return;
        const all = r.pets ?? [];
        const filtered = all.filter(
          (p) =>
            p.primary_guardian?.guardian_id === guardianId ||
            p.secondary_guardian?.guardian_id === guardianId,
        );
        setPets(filtered);

        const applyInitialPet =
          Boolean(open) &&
          Boolean(initialPetId) &&
          guardianId === (initialGuardianId || '') &&
          filtered.some((p) => p.id === initialPetId) &&
          !prefillPetAppliedRef.current;

        if (applyInitialPet && initialPetId) {
          prefillPetAppliedRef.current = true;
          setSaleLines([{ id: crypto.randomUUID(), petIds: [initialPetId], packageId: '' }]);
        } else if (
          !prefillPetAppliedRef.current ||
          guardianId !== (initialGuardianId || '')
        ) {
          setSaleLines([newSaleLine()]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPets([]);
          setSaleLines([newSaleLine()]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, guardianId, initialPetId, initialGuardianId, open]);

  const guardianOptions = useMemo(
    () => [
      { value: '', label: '— Selecionar tutor —' },
      ...guardians.map((g) => ({
        value: g.id,
        label: g.full_name,
        icon: <User size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [guardians],
  );

  const petMultiOptions = useMemo(
    () =>
      pets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={16} strokeWidth={2} aria-hidden />,
      })),
    [pets],
  );

  const packageOptions = useMemo(
    () => [
      { value: '', label: '— Selecionar pacote —' },
      ...packages.map((p) => ({
        value: p.id,
        label: `${p.name} · ${formatBrl(Number(p.price))}`,
        icon: <Package size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [packages],
  );

  const buildScheduleContext = useCallback(
    (comandaId: string): PackageSaleScheduleContext | null => {
      if (!guardianId || resolvedLines.length === 0) return null;
      const guardianName = guardians.find((g) => g.id === guardianId)?.full_name ?? 'Tutor';
      return {
        guardianId,
        guardianName,
        lines: resolvedLines.map((ln) => ({
          petId: ln.petId,
          petName: ln.petName,
          packageId: ln.packageId,
          packageName: ln.packageName,
          packageItems: ln.package?.items ?? [],
        })),
        comandaId,
        totalAmount: cartTotal,
      };
    },
    [guardianId, guardians, resolvedLines, cartTotal],
  );

  const updateLine = (lineId: string, patch: Partial<Pick<SaleLine, 'petIds' | 'packageId'>>) => {
    setSaleLines((prev) => prev.map((ln) => (ln.id === lineId ? { ...ln, ...patch } : ln)));
  };

  const addLine = () => {
    setSaleLines((prev) => [...prev, newSaleLine()]);
  };

  const removeLine = (lineId: string) => {
    setSaleLines((prev) => (prev.length <= 1 ? prev : prev.filter((ln) => ln.id !== lineId)));
  };

  const selectAllPetsOnLine = (lineId: string) => {
    setSaleLines((prev) =>
      prev.map((ln) => (ln.id === lineId ? { ...ln, petIds: pets.map((p) => p.id) } : ln)),
    );
  };

  const handleSubmit = async (intent: SellPackageOpenIntent) => {
    if (!clinicId || !unitId || !guardianId) {
      showError('Selecione tutor e unidade.');
      return;
    }
    if (resolvedLines.length === 0) {
      showError('Adicione ao menos uma linha com pet(s) e pacote.');
      return;
    }
    if (hasDuplicateLine) {
      showError('Não é possível repetir o mesmo pacote para o mesmo pet.');
      return;
    }
    setSubmitting(true);
    setChargeMenuOpen(false);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'package',
        guardian_id: guardianId,
        unit_id: unitId,
        package_lines: resolvedLines.map((ln) => ({
          package_id: ln.packageId,
          pet_id: ln.petId,
        })),
      });
      const comandaId = String((detail.comanda as { id?: string }).id ?? '');
      if (!comandaId) throw new Error('Comanda não criada');

      const scheduleContext = buildScheduleContext(comandaId);
      if (!scheduleContext) throw new Error('Dados da venda incompletos');

      if (intent === 'edit') {
        setSuccessState({ comandaId, scheduleContext, paid: false });
        return;
      }

      onCheckout(comandaId, intent, scheduleContext);
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir comanda do pacote');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedule = () => {
    if (!successState) return;
    navigateToAgendaFromPackageSale(navigate, successState.scheduleContext);
    onClose();
  };

  const handleViewComanda = () => {
    if (!successState) return;
    navigate(`/hub/caixa/comanda/${successState.comandaId}`);
    onClose();
  };

  const scheduleLabel = successState ? schedulePetLabel(successState.scheduleContext) : '';

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={successState ? 'Comanda aberta' : 'Vender pacote'}
      titleIcon={
        successState ? (
          <CheckCircle2 size={20} strokeWidth={1.75} />
        ) : (
          <Package size={20} strokeWidth={1.75} />
        )
      }
      subtitle={
        successState
          ? `${packageSaleSummaryLabel(successState.scheduleContext)} · ${formatBrl(successState.scheduleContext.totalAmount)}`
          : 'Venda pré-paga — escolha pet(s) e pacote em cada linha; um único pagamento na comanda.'
      }
      footer={
        successState ? (
          <div className="hub-sell-package__footer hub-sell-package__footer--success">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={handleViewComanda}>
              <Receipt size={16} aria-hidden />
              Ver comanda
            </button>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
              Concluir
            </button>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={handleSchedule}>
              <Calendar size={16} aria-hidden />
              Agendar para {scheduleLabel}
            </button>
          </div>
        ) : (
          <div className="hub-sell-package__footer">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <div className="hub-sell-package__footer-actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-sell-package__btn-secondary"
                disabled={!canSubmit}
                onClick={() => void handleSubmit('edit')}
              >
                {submitting ? 'Abrindo…' : 'Só abrir comanda'}
              </button>
              <div className="hub-sell-package__split" ref={chargeSplitRef}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-sell-package__split-main"
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit('checkout')}
                >
                  {submitting ? 'Abrindo…' : 'Abrir e cobrar'}
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-sell-package__split-toggle"
                  disabled={!canSubmit}
                  aria-label="Cobrar e agendar"
                  aria-haspopup="menu"
                  aria-expanded={chargeMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChargeMenuOpen((o) => !o);
                  }}
                >
                  <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
                </button>
                {chargeMenuOpen &&
                  chargeMenuStyle &&
                  typeof document !== 'undefined' &&
                  createPortal(
                    <div
                      ref={chargeMenuRef}
                      className="hub-sell-package__split-menu hub-sell-package__split-menu--portal"
                      style={chargeMenuStyle}
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="hub-sell-package__split-menu-item hub-sell-package__split-menu-item--highlight"
                        onClick={() => void handleSubmit('checkout_and_schedule')}
                      >
                        <Calendar size={15} aria-hidden />
                        Cobrar e agendar
                      </button>
                    </div>,
                    document.body,
                  )}
              </div>
            </div>
          </div>
        )
      }
    >
      {successState ? (
        <div className="hub-sell-package__success">
          <p className="hub-sell-package__success-lead">
            {successState.paid
              ? 'Pagamento registrado. O saldo do pacote já está disponível para uso nos atendimentos.'
              : 'A comanda foi criada. Cobre na ficha da comanda ou use os atalhos abaixo.'}
          </p>
          <ul className="hub-sell-package__success-list">
            {successState.scheduleContext.lines.map((ln) => (
              <li key={`${ln.petId}:${ln.packageId}`}>
                <span className="hub-sell-package__success-pet">{ln.petName}</span>
                <span className="hub-sell-package__success-mid">{ln.packageName}</span>
              </li>
            ))}
          </ul>
          {successState.scheduleContext.lines.length > 1 ? (
            <p className="hub-clientes__muted hub-sell-package__hint">
              Na agenda, a primeira linha vem pré-selecionada. Agende as demais em seguida.
            </p>
          ) : null}
        </div>
      ) : loading ? (
        <HubLoading variant="inline" label="Carregando pacotes e tutores…" />
      ) : packages.length === 0 ? (
        <div className="hub-sell-package__empty">
          <p className="hub-sell-package__empty-title">Nenhum pacote ativo no catálogo</p>
          <p className="hub-clientes__muted">Cadastre ou reative pacotes em Serviços → Pacotes.</p>
        </div>
      ) : (
        <div className="hub-sell-package__form">
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="sell-pkg-guardian">
              Tutor
            </label>
            <HubSearchableCombobox
              id="sell-pkg-guardian"
              options={guardianOptions}
              value={guardianId}
              onChange={setGuardianId}
              placeholder="Buscar tutor…"
              searchPlaceholder="Nome do tutor"
              ariaLabel="Tutor"
              disabled={lockGuardian && Boolean(initialGuardianId)}
              triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
            />
            {lockGuardian && initialGuardianId ? (
              <p className="hub-clientes__muted hub-sell-package__hint">Tutor preenchido a partir do perfil.</p>
            ) : null}
          </div>

          <div className="hub-clientes__field">
            <label className="hub-clientes__label">Linhas da venda</label>
            {guardianId && pets.length === 0 ? (
              <p className="hub-clientes__muted hub-sell-package__hint">Este tutor não tem pets cadastrados.</p>
            ) : (
              <>
                <ul className="hub-sell-package__lines">
                  {saleLines.map((ln, index) => {
                    const linePkg = ln.packageId ? packageById.get(ln.packageId) : null;
                    const allPetsSelected = pets.length > 0 && ln.petIds.length === pets.length;
                    return (
                      <li key={ln.id} className="hub-sell-package__line-card">
                        <div className="hub-sell-package__line-card-head">
                          <span className="hub-sell-package__line-badge">
                            {saleLines.length > 1 ? `Linha ${index + 1}` : 'Pacote'}
                          </span>
                          {saleLines.length > 1 ? (
                            <button
                              type="button"
                              className="hub-sell-package__line-remove"
                              aria-label={`Remover linha ${index + 1}`}
                              onClick={() => removeLine(ln.id)}
                            >
                              <Trash2 size={15} strokeWidth={2} aria-hidden />
                            </button>
                          ) : null}
                        </div>
                        <div className="hub-sell-package__line-fields">
                          <div className="hub-sell-package__line-field">
                            <div className="hub-sell-package__pets-head">
                              <label className="hub-clientes__label" htmlFor={`sell-pkg-pets-${ln.id}`}>
                                Pets
                              </label>
                              {guardianId && pets.length > 1 ? (
                                <button
                                  type="button"
                                  className="hub-clientes__link hub-sell-package__select-all"
                                  onClick={() => selectAllPetsOnLine(ln.id)}
                                  disabled={allPetsSelected}
                                >
                                  Selecionar todos
                                </button>
                              ) : null}
                            </div>
                            <HubMultiSelectCombobox
                              id={`sell-pkg-pets-${ln.id}`}
                              options={petMultiOptions}
                              value={ln.petIds}
                              onChange={(petIds) => updateLine(ln.id, { petIds })}
                              placeholder={guardianId ? 'Selecione um ou mais pets…' : 'Escolha o tutor primeiro'}
                              searchPlaceholder="Buscar pet"
                              ariaLabel={`Pets da linha ${index + 1}`}
                              disabled={!guardianId || pets.length === 0}
                              resolveLabel={(id) => petNameById.get(id) ?? id}
                              triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                            />
                          </div>
                          <div className="hub-sell-package__line-field">
                            <label className="hub-clientes__label" htmlFor={`sell-pkg-package-${ln.id}`}>
                              Pacote
                            </label>
                            <HubSearchableCombobox
                              id={`sell-pkg-package-${ln.id}`}
                              options={packageOptions}
                              value={ln.packageId}
                              onChange={(packageId) => updateLine(ln.id, { packageId })}
                              placeholder="Selecionar pacote…"
                              searchPlaceholder="Buscar pacote"
                              ariaLabel={`Pacote da linha ${index + 1}`}
                              triggerIcon={<Package size={18} strokeWidth={2} aria-hidden />}
                            />
                          </div>
                        </div>
                        {linePkg ? <LinePackagePreview pkg={linePkg} petCount={ln.petIds.length} /> : null}
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-sell-package__add-line"
                  disabled={!guardianId || pets.length === 0}
                  onClick={addLine}
                >
                  <Plus size={16} aria-hidden />
                  Adicionar pacote
                </button>
                <p className="hub-clientes__muted hub-sell-package__hint">
                  Cada pet selecionado na linha recebe o saldo do pacote escolhido.
                </p>
                {hasDuplicateLine ? (
                  <p className="hub-sell-package__duplicate-warn" role="alert">
                    Não é possível repetir o mesmo pacote para o mesmo pet.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {resolvedLines.length > 0 ? (
            <div className="hub-sell-package__cart" aria-live="polite">
              <div className="hub-sell-package__cart-title">Resumo da venda</div>
              <ul className="hub-sell-package__cart-list">
                {resolvedLines.map((ln) => (
                  <li key={`${ln.petId}:${ln.packageId}`} className="hub-sell-package__cart-row">
                    <span className="hub-sell-package__cart-pet">{ln.petName}</span>
                    <span className="hub-sell-package__cart-mid">{ln.packageName}</span>
                    <span className="hub-sell-package__cart-price">{formatBrl(ln.unitPrice)}</span>
                  </li>
                ))}
              </ul>
              <div className="hub-sell-package__cart-total">
                <span>
                  Total ({resolvedLines.length} pacote{resolvedLines.length === 1 ? '' : 's'})
                </span>
                <strong>{formatBrl(cartTotal)}</strong>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </HubSidePanel>
  );
};

function LinePackagePreview({ pkg, petCount = 0 }: { pkg: HubPackage; petCount?: number }) {
  const unitPrice = Number(pkg.price ?? 0);
  const items = pkg.items ?? [];
  return (
    <div className="hub-sell-package__line-preview" aria-hidden>
      <span className="hub-sell-package__line-preview-price">
        {formatBrl(unitPrice)}
        {petCount > 1 ? (
          <span className="hub-sell-package__line-preview-total"> · {formatBrl(unitPrice * petCount)} total</span>
        ) : null}
      </span>
      <span className="hub-sell-package__line-preview-sep">·</span>
      <span>
        {pkg.sessions_total} {pkg.sessions_total === 1 ? 'sessão' : 'sessões'}
      </span>
      <span className="hub-sell-package__line-preview-sep">·</span>
      <span>{pkg.validity_days ? `${pkg.validity_days} dias` : 'sem validade'}</span>
      {items.length > 0 ? (
        <div className="hub-sell-package__line-preview-chips">
          {items.map((it, idx) => (
            <span
              key={`${it.hub_service_type_id}-${idx}`}
              className={`hub-sell-package__chip hub-sell-package__chip--sm${it.is_addon ? ' hub-sell-package__chip--addon' : ''}`}
            >
              {packageItemLabel(it)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
