import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@petimi/web-core';
import {
  X,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Info,
  Pencil,
  FilePlus2,
  Coins,
  User,
  Building2,
  Bird,
  Cat,
  Dog,
  ChevronRight,
} from 'lucide-react';
import type { HubGuardian, HubGuardianPet } from '../../api/hubGuardiansApi';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import { formatBrTaxIdDisplay } from '../../utils/formatBrTaxId';
import { formatGuardianAddress } from './formatters';
import { GuardianDetailQuickActions } from './GuardianDetailQuickActions';
import { GuardianPetsTab } from './GuardianPetsTab';
import { HubTabs } from '../../components/HubTabs';
import { HubProfileInfoCell } from '../../components/HubProfileInfoCell';
import { HubProfileAvatar, profileInitials } from '../../components/HubProfileAvatar';
import { HubLoading } from '../../components/HubLoading';
import { ProfileFinanceSummaryCard } from '../../components/ProfileFinanceSummaryCard';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { HubComandaReceivableDrawer } from '../finance/HubComandaReceivableDrawer';
import {
  formatComandaListOpenedAt,
  formatComandaListPets,
  formatComandaListTitle,
  formatComandaOriginLabel,
  formatReceivableListTitle,
  isReceivablePayable,
  resolveComandaProfileChargeAction,
  resolveComandaProfileHref,
  resolveReceivableProfileHref,
} from '../finance/comandaListPreview';
import { ReceivableDueBadge } from '../finance/ReceivableDueBadge';
import { formatDueDateShort } from '../finance/dueDateTone';
import { buildProfileFinanceSummary } from '../finance/profileFinanceSummary';
import { buildBatchChargeItems } from '../finance/batchChargeItems';
import { BatchChargeDrawer } from '../finance/BatchChargeDrawer';
import { SpecialPricesSection } from '../../components/SpecialPricesSection';
import '../../components/hub-profile.css';
import '../finance/hub-finance-page.css';
import './clientes.css';

type DetailTab = 'resumo' | 'pets' | 'historico' | 'financeiro';
type ProfileLayout = 'panel' | 'page';

function speciesKind(species: string): 'dog' | 'cat' | 'other' {
  const s = species.trim().toLowerCase();
  if (/gato|cat|felin/.test(s)) return 'cat';
  if (/c[aã]o|dog|canin/.test(s)) return 'dog';
  return 'other';
}

function PetSpeciesIcon({ species }: { species: string }) {
  const kind = speciesKind(species);
  const props = { size: 15, strokeWidth: 2, 'aria-hidden': true as const };
  if (kind === 'cat') return <Cat {...props} />;
  if (kind === 'dog') return <Dog {...props} />;
  return <Bird {...props} />;
}

interface GuardianDetailPanelProps {
  guardian: HubGuardian;
  pets: HubGuardianPet[];
  onClose: () => void;
  onStartEdit: () => void;
  onOpenInNewPage: () => void;
  onArchive?: () => void;
  hideNewPageButton?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  layout?: ProfileLayout;
  clinicId?: string | null;
  unitId?: string | null;
  canCreateReceivable?: boolean;
  canWritePets?: boolean;
  initialTab?: DetailTab;
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const GuardianDetailPanel: React.FC<GuardianDetailPanelProps> = ({
  guardian,
  pets,
  onClose,
  onStartEdit,
  onOpenInNewPage,
  onArchive,
  hideNewPageButton = false,
  hideHeader = false,
  hideFooter = false,
  layout = 'panel',
  clinicId,
  unitId,
  canCreateReceivable = false,
  canWritePets = false,
  initialTab = 'resumo',
}) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canFinancialRead = hasPermission('hub.financial.read');
  const isPage = layout === 'page';
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [finLoading, setFinLoading] = useState(false);
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [receivableDrawer, setReceivableDrawer] = useState<{
    comandaId: string;
    receivableIds: string[];
    selectedReceivableId: string;
  } | null>(null);
  const [openingComanda, setOpeningComanda] = useState(false);
  /** Pet de contexto opcional — comanda manual não exige pet (itens podem ser só do tutor). */
  const [comandaPetId, setComandaPetId] = useState('');
  const [showBatchCharge, setShowBatchCharge] = useState(false);

  const addr = formatGuardianAddress(guardian);
  const since = guardian.created_at
    ? new Date(guardian.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const isCompany = guardian.client_kind === 'company';
  const hasSecondaryOnlyPet = pets.some((p) => p.role === 'secondary');
  const label = isCompany ? 'Cliente empresa' : 'Tutor principal';
  const taxLabel = isCompany ? 'CNPJ' : 'CPF';

  const loadFinanceiro = useCallback(async () => {
    if (!clinicId) return;
    setFinLoading(true);
    try {
      const [cmd, rec] = await Promise.all([
        hubComandaApi
          .listComandas({ clinic_id: clinicId, enrich: true })
          .then((r) => r.comandas.filter((c) => (c.guardian_id as string) === guardian.id))
          .catch(() => [] as Array<Record<string, unknown>>),
        hubFinancialApi
          .listReceivables(clinicId, { status: undefined })
          .then((r) => r.filter((rv) => rv.guardian_id === guardian.id))
          .catch(() => [] as HubFinanceReceivable[]),
      ]);
      setComandas(cmd);
      setReceivables(rec);
    } finally {
      setFinLoading(false);
    }
  }, [clinicId, guardian.id]);

  useEffect(() => {
    if (tab === 'financeiro' || tab === 'resumo') void loadFinanceiro();
  }, [tab, loadFinanceiro]);

  const financeSummary = useMemo(
    () => buildProfileFinanceSummary(receivables, comandas),
    [receivables, comandas],
  );

  const batchChargeItems = useMemo(
    () => buildBatchChargeItems(receivables, comandas),
    [receivables, comandas],
  );

  const goToFinanceiroTab = () => setTab('financeiro');

  const openSingleChargeItem = (item: (typeof batchChargeItems)[number]) => {
    if (item.kind === 'receivable' && item.comandaId && item.receivableId) {
      setReceivableDrawer({
        comandaId: item.comandaId,
        receivableIds: [item.receivableId],
        selectedReceivableId: item.receivableId,
      });
      return;
    }
    if (item.kind === 'comanda' && item.comandaId) {
      setCheckoutComandaId(item.comandaId);
    }
  };

  const handleSummaryCharge = () => {
    if (!canCreateReceivable) {
      goToFinanceiroTab();
      return;
    }
    if (batchChargeItems.length === 0) {
      goToFinanceiroTab();
      return;
    }
    if (batchChargeItems.length === 1) {
      openSingleChargeItem(batchChargeItems[0]);
      return;
    }
    setShowBatchCharge(true);
  };

  const renderFinanceSummaryBlock = (asPageSection: boolean) => {
    const card = (
      <ProfileFinanceSummaryCard
        summary={financeSummary}
        loading={finLoading}
        emptyLabel="Ainda não há movimentos financeiros associados a este cliente no Hub. Quando existir faturamento ou pagamentos por atendimento, o resumo aparecerá aqui."
        onOpenFinanceiro={goToFinanceiroTab}
        onCharge={financeSummary.outstandingTotal > 0 && canCreateReceivable ? handleSummaryCharge : null}
      />
    );
    if (asPageSection) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Resumo financeiro</h2>
              <p className="hub-meu-perfil__panel-sub">Saldo em aberto de todos os pets deste cliente.</p>
            </div>
          </header>
          {card}
        </section>
      );
    }
    return (
      <div className="hub-clientes__section">
        <h3 className="hub-clientes__section-title" style={{ marginBottom: 8 }}>
          Resumo financeiro
        </h3>
        {card}
      </div>
    );
  };

  const singlePetId = pets.length === 1 ? pets[0].id : null;

  useEffect(() => {
    // 1 pet → pré-seleciona; vários ou nenhum → sem pet (cobrança do tutor), selecionável se houver lista.
    setComandaPetId(singlePetId ?? '');
  }, [guardian.id, singlePetId]);

  const handleOpenComandaManual = async () => {
    if (!clinicId) return;
    setOpeningComanda(true);
    try {
      const resolvedPetId = comandaPetId.trim() || singlePetId || '';
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardian.id,
        unit_id: unitId ?? undefined,
        ...(resolvedPetId ? { pet_id: resolvedPetId } : {}),
        manual_lines: [],
      });
      const comandaId = (detail.comanda as Record<string, unknown>).id as string;
      navigate(`/hub/caixa/comanda/${comandaId}`);
    } catch (e: unknown) {
      alert((e as Error)?.message || 'Erro ao abrir comanda');
    } finally {
      setOpeningComanda(false);
    }
  };

  const renderResumoPage = () => (
    <>
      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Informações de contato</h2>
            <p className="hub-meu-perfil__panel-sub">Dados do tutor e localização.</p>
          </div>
          <button type="button" className="hub-meu-perfil__btn-outline" onClick={onStartEdit}>
            <Pencil size={16} strokeWidth={2} aria-hidden />
            Editar informações
          </button>
        </header>
        <div className="hub-meu-perfil__grid">
          <HubProfileInfoCell icon={Phone} label="Telefone" value={formatBrPhoneDisplay(guardian.phone)} />
          <HubProfileInfoCell icon={Mail} label="E-mail" value={guardian.email || '—'} />
          <HubProfileInfoCell icon={MapPin} label="Endereço" value={addr} />
          <HubProfileInfoCell icon={Info} label="Origem" value={guardian.lead_source || '—'} />
          <HubProfileInfoCell icon={User} label={taxLabel} value={formatBrTaxIdDisplay(guardian.tax_id)} />
          {isCompany && guardian.legal_name ? (
            <HubProfileInfoCell icon={Building2} label="Razão social" value={guardian.legal_name} />
          ) : null}
        </div>
      </section>

      {renderFinanceSummaryBlock(true)}

      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Últimos atendimentos</h2>
            <p className="hub-meu-perfil__panel-sub">Histórico recente de serviços.</p>
          </div>
        </header>
        <div className="hub-clientes__empty-state">
          Nenhum atendimento registrado neste cliente. Após agendar e concluir serviços no Hub, o histórico resumido
          será mostrado aqui.
        </div>
      </section>
    </>
  );

  const renderResumoPanel = () => (
    <>
      <div className="hub-clientes__section">
        <div className="hub-clientes__contact-card">
          <div className="hub-clientes__contact-card-head">
            <h3 className="hub-clientes__contact-card-title">Informações de contato</h3>
            <button type="button" className="hub-clientes__link-btn hub-clientes__link-btn--with-icon" onClick={onStartEdit}>
              <Pencil size={15} strokeWidth={2} aria-hidden />
              Editar
            </button>
          </div>
          <ul className="hub-clientes__contact-list">
            <li className="hub-clientes__contact-row">
              <span className="hub-clientes__contact-row-icon" aria-hidden>
                <Phone size={18} strokeWidth={1.75} />
              </span>
              <div className="hub-clientes__contact-row-text">
                <strong>Telefone:</strong> {formatBrPhoneDisplay(guardian.phone)}
              </div>
            </li>
            <li className="hub-clientes__contact-row">
              <span className="hub-clientes__contact-row-icon" aria-hidden>
                <Mail size={18} strokeWidth={1.75} />
              </span>
              <div className="hub-clientes__contact-row-text">
                <strong>E-mail:</strong> {guardian.email || '—'}
              </div>
            </li>
            <li className="hub-clientes__contact-row">
              <span className="hub-clientes__contact-row-icon" aria-hidden>
                <MapPin size={18} strokeWidth={1.75} />
              </span>
              <div className="hub-clientes__contact-row-text">
                <strong>Endereço:</strong> {addr}
              </div>
            </li>
            <li className="hub-clientes__contact-row">
              <span className="hub-clientes__contact-row-icon" aria-hidden>
                <Info size={18} strokeWidth={1.75} />
              </span>
              <div className="hub-clientes__contact-row-text">
                <strong>Origem:</strong> {guardian.lead_source || '—'}
              </div>
            </li>
          </ul>
        </div>
      </div>

      {renderFinanceSummaryBlock(false)}

      <div className="hub-clientes__section">
        <h3 className="hub-clientes__section-title" style={{ marginBottom: 8 }}>
          Últimos atendimentos
        </h3>
        <div className="hub-clientes__empty-state">
          Nenhum atendimento registrado neste cliente. Após agendar e concluir serviços no Hub, o histórico resumido
          será mostrado aqui.
        </div>
      </div>
    </>
  );

  const renderPetsTab = () => (
    <GuardianPetsTab pets={pets} guardianId={guardian.id} canWritePets={canWritePets} isPage={isPage} />
  );

  const renderHistoricoTab = () => {
    const inner = (
      <div className="hub-clientes__empty-state">
        O histórico clínico e operacional por cliente estará disponível quando o módulo de atendimentos estiver ligado
        à ficha.
      </div>
    );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Histórico</h2>
              <p className="hub-meu-perfil__panel-sub">Atendimentos e interações anteriores.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return inner;
  };

  const renderFinanceiroTab = () => {
    const openComandas = comandas.filter((c) => c.status === 'aberta');
    const selectedPet = pets.find((p) => p.id === comandaPetId) ?? null;
    const composeHint = selectedPet
      ? `Itens novos entram vinculados a ${selectedPet.name}.`
      : pets.length > 0
        ? 'Sem pet: itens entram como cobrança do tutor (taxa, produto avulso, etc.).'
        : 'Comanda vinculada a este tutor.';

    const inner = (
      <>
        {clinicId ? (
          <div style={{ marginBottom: 20 }}>
            <SpecialPricesSection
              clinicId={clinicId}
              guardianId={guardian.id}
              guardianPets={pets.map((p) => ({ id: p.id, name: p.name }))}
              canWrite={canWritePets || canCreateReceivable || canFinancialRead}
            />
          </div>
        ) : null}
        {canCreateReceivable && (
          <div className="hub-clientes__fin-compose">
            <div className="hub-clientes__fin-compose-head">
              <div>
                <h3 className="hub-clientes__fin-compose-title">Nova comanda</h3>
                <p className="hub-clientes__fin-compose-sub">{composeHint}</p>
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                disabled={openingComanda}
                onClick={() => void handleOpenComandaManual()}
              >
                <FilePlus2 size={14} strokeWidth={2} aria-hidden />
                {openingComanda ? 'Abrindo…' : 'Abrir comanda'}
              </button>
            </div>

            {batchChargeItems.length >= 2 ? (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setShowBatchCharge(true)}
                >
                  <Coins size={14} strokeWidth={2} aria-hidden />
                  Cobrar em conjunto ({batchChargeItems.length})
                </button>
              </div>
            ) : null}

            {pets.length > 0 ? (
              <div
                className="hub-clientes__fin-pet-picker"
                role="radiogroup"
                aria-label="Pet da comanda (opcional)"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!comandaPetId}
                  className={`hub-clientes__fin-pet-chip${!comandaPetId ? ' hub-clientes__fin-pet-chip--active' : ''}`}
                  disabled={openingComanda}
                  onClick={() => setComandaPetId('')}
                >
                  <User size={15} strokeWidth={2} aria-hidden />
                  Só tutor
                </button>
                {pets.map((p) => {
                  const active = comandaPetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`hub-clientes__fin-pet-chip${active ? ' hub-clientes__fin-pet-chip--active' : ''}`}
                      disabled={openingComanda}
                      onClick={() => setComandaPetId(p.id)}
                      title={p.species || p.name}
                    >
                      <PetSpeciesIcon species={p.species} />
                      <span className="hub-clientes__fin-pet-chip-name">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {finLoading ? (
          <HubLoading variant="inline" label="Carregando financeiro…" size="sm" />
        ) : (
          <>
            {openComandas.length > 0 && (
              <section className="hub-clientes__fin-section">
                <h4 className="hub-clientes__fin-section-title">
                  Comandas abertas
                  <span className="hub-clientes__fin-section-count">{openComandas.length}</span>
                </h4>
                <ul className="hub-clientes__fin-list">
                  {openComandas.map((c) => {
                    const title = formatComandaListTitle(c);
                    const petsLabel = formatComandaListPets(c, pets);
                    const opened = formatComandaListOpenedAt(c);
                    const originLabel = formatComandaOriginLabel(c.origin_type);
                    const href = resolveComandaProfileHref(c, { canFinancialRead });
                    const charge = resolveComandaProfileChargeAction(c, receivables, {
                      canCreateReceivable,
                      canFinancialRead,
                    });
                    return (
                      <li key={String(c.id)} className="hub-clientes__fin-row">
                        <button
                          type="button"
                          className="hub-clientes__fin-row-main"
                          onClick={() => navigate(href)}
                          title={href.includes('/financeiro/') ? 'Abrir no financeiro' : 'Abrir no caixa'}
                        >
                          <span className="hub-clientes__fin-row-title">{title}</span>
                          <span className="hub-clientes__fin-row-meta">
                            <span className="hub-clientes__fin-row-origin">{originLabel}</span>
                            <span aria-hidden> · </span>
                            <span>{petsLabel}</span>
                            {opened ? (
                              <>
                                <span aria-hidden> · </span>
                                <span>{opened}</span>
                              </>
                            ) : null}
                          </span>
                        </button>
                        <span className="hub-clientes__fin-row-amount">
                          {formatBrl(Number(c.total_amount ?? 0))}
                        </span>
                        {charge.kind !== 'none' && (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-clientes__fin-row-action"
                            onClick={() => {
                              if (charge.kind === 'checkout_drawer') {
                                setCheckoutComandaId(charge.comandaId);
                              } else if (charge.kind === 'receivable_drawer') {
                                setReceivableDrawer({
                                  comandaId: charge.comandaId,
                                  receivableIds: [charge.receivableId],
                                  selectedReceivableId: charge.receivableId,
                                });
                              } else if (charge.kind === 'navigate') {
                                navigate(charge.href);
                              }
                            }}
                            title={
                              charge.kind === 'receivable_drawer' || charge.kind === 'navigate'
                                ? 'Registrar pagamento'
                                : 'Receber'
                            }
                            aria-label={
                              charge.kind === 'receivable_drawer' || charge.kind === 'navigate'
                                ? 'Registrar pagamento'
                                : 'Receber'
                            }
                          >
                            <Coins size={14} strokeWidth={2} />
                          </button>
                        )}
                        <ChevronRight
                          className="hub-clientes__fin-row-chevron"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {receivables.length > 0 ? (
              <section className="hub-clientes__fin-section">
                <h4 className="hub-clientes__fin-section-title">
                  Recebíveis
                  <span className="hub-clientes__fin-section-count">{Math.min(receivables.length, 20)}</span>
                </h4>
                <ul className="hub-clientes__fin-list">
                  {receivables.slice(0, 20).map((rv) => {
                    const href = resolveReceivableProfileHref(rv, { canFinancialRead });
                    const payable = isReceivablePayable(rv.status);
                    const canPay =
                      payable &&
                      canCreateReceivable &&
                      Boolean(rv.comanda_id) &&
                      Boolean(unitId);
                    const linkedComanda = rv.comanda_id
                      ? comandas.find((c) => String(c.id) === rv.comanda_id) ?? null
                      : null;
                    const title = formatReceivableListTitle(rv, linkedComanda);
                    const originLabel = formatComandaOriginLabel(rv.source_type);
                    const petsLabel = linkedComanda
                      ? formatComandaListPets(linkedComanda, pets)
                      : 'Tutor';
                    const rowMain = (
                      <>
                        <span className="hub-clientes__fin-row-title">{title}</span>
                        <span className="hub-clientes__fin-row-meta">
                          <span className="hub-clientes__fin-row-origin">{originLabel}</span>
                          <span aria-hidden> · </span>
                          <span>{petsLabel}</span>
                          <span aria-hidden> · </span>
                          <span>{formatDueDateShort(rv.due_date)}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={rv.id} className="hub-clientes__fin-row">
                        {href ? (
                          <button
                            type="button"
                            className="hub-clientes__fin-row-main"
                            onClick={() => navigate(href)}
                            title="Abrir no financeiro"
                          >
                            {rowMain}
                          </button>
                        ) : (
                          <div className="hub-clientes__fin-row-main">{rowMain}</div>
                        )}
                        <ReceivableDueBadge dueDate={rv.due_date} status={rv.status} showDate={false} />
                        <span className="hub-clientes__fin-row-amount">{formatBrl(rv.final_amount)}</span>
                        {canPay && rv.comanda_id ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-clientes__fin-row-action"
                            onClick={() =>
                              setReceivableDrawer({
                                comandaId: rv.comanda_id!,
                                receivableIds: [rv.id],
                                selectedReceivableId: rv.id,
                              })
                            }
                            title="Registrar pagamento"
                            aria-label="Registrar pagamento"
                          >
                            <Coins size={14} strokeWidth={2} />
                          </button>
                        ) : null}
                        {href ? (
                          <ChevronRight
                            className="hub-clientes__fin-row-chevron"
                            size={16}
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : openComandas.length === 0 && comandas.length === 0 ? (
              <p className="hub-clientes__muted hub-clientes__fin-empty">
                Nenhum lançamento financeiro encontrado para este tutor.
              </p>
            ) : null}
          </>
        )}
      </>
    );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Financeiro</h2>
              <p className="hub-meu-perfil__panel-sub">Comandas abertas e recebíveis do cliente.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return <div style={{ padding: '0 4px' }}>{inner}</div>;
  };

  const tabs = (
    <HubTabs
      variant="detail"
      ariaLabel="Detalhe do cliente"
      activeId={tab}
      onTabChange={(id) => setTab(id as DetailTab)}
      items={[
        { id: 'resumo', label: 'Resumo' },
        { id: 'pets', label: `Pets (${pets.length})` },
        { id: 'historico', label: 'Histórico' },
        { id: 'financeiro', label: 'Financeiro' },
      ]}
    />
  );

  const tabContent = (
    <>
      {tab === 'resumo' && (isPage ? renderResumoPage() : renderResumoPanel())}
      {tab === 'pets' && renderPetsTab()}
      {tab === 'historico' && renderHistoricoTab()}
      {tab === 'financeiro' && renderFinanceiroTab()}
    </>
  );

  const financeDrawer =
    clinicId && unitId && checkoutComandaId ? (
      <ComandaCheckoutDrawer
        key={checkoutComandaId}
        open={!!checkoutComandaId}
        onClose={() => setCheckoutComandaId(null)}
        clinicId={clinicId}
        unitId={unitId}
        comandaId={checkoutComandaId}
        onSuccess={() => {
          setCheckoutComandaId(null);
          void loadFinanceiro();
        }}
      />
    ) : null;

  const receivablePanel =
    receivableDrawer && clinicId ? (
      <HubComandaReceivableDrawer
        key={`${receivableDrawer.comandaId}-${receivableDrawer.selectedReceivableId}`}
        open
        onClose={() => setReceivableDrawer(null)}
        comandaId={receivableDrawer.comandaId}
        receivableIds={receivableDrawer.receivableIds}
        selectedReceivableId={receivableDrawer.selectedReceivableId}
        onSelectReceivable={(id) =>
          setReceivableDrawer((prev) => (prev ? { ...prev, selectedReceivableId: id } : prev))
        }
        onRefreshComanda={() => {
          void loadFinanceiro();
        }}
        highlightPayment
      />
    ) : null;

  const batchChargePanel = (
    <BatchChargeDrawer
      open={showBatchCharge}
      items={batchChargeItems}
      guardianName={guardian.full_name}
      onClose={() => setShowBatchCharge(false)}
      onDone={() => {
        setShowBatchCharge(false);
        void loadFinanceiro();
      }}
    />
  );

  if (isPage) {
    return (
      <>
        <div className="hub-meu-perfil">
          <aside className="hub-meu-perfil__sidebar">
            <div className="hub-meu-perfil__card hub-meu-perfil__summary">
              <HubProfileAvatar name={guardian.full_name} />
              <h2 className="hub-meu-perfil__sidebar-name">{guardian.full_name}</h2>
              <span className="hub-meu-perfil__badge">{label}</span>
              {hasSecondaryOnlyPet && !isCompany ? (
                <span className="hub-meu-perfil__badge hub-meu-perfil__badge--muted">Co-tutor em alguns pets</span>
              ) : null}
              <div className="hub-meu-perfil__contact">
                {guardian.phone ? <span>{formatBrPhoneDisplay(guardian.phone)}</span> : null}
                {guardian.email ? <span>{guardian.email}</span> : null}
                {!guardian.phone && !guardian.email ? <span>—</span> : null}
              </div>
              <div className="hub-meu-perfil__sidebar-actions">
                <GuardianDetailQuickActions
                  guardianId={guardian.id}
                  phone={guardian.phone}
                  email={guardian.email}
                  onArchive={onArchive}
                />
              </div>
            </div>

            <div className="hub-meu-perfil__card hub-meu-perfil__aside-meta">
              <div className="hub-meu-perfil__meta-row">
                <span className="hub-meu-perfil__meta-label">Cliente desde</span>
                <span className="hub-meu-perfil__meta-value">{since}</span>
              </div>
              <div className="hub-meu-perfil__meta-row">
                <span className="hub-meu-perfil__meta-label">Pets cadastrados</span>
                <span className="hub-meu-perfil__meta-value">{pets.length}</span>
              </div>
            </div>
          </aside>

          <div className="hub-meu-perfil__main">
            {tabs}
            {tabContent}
          </div>
        </div>
        {financeDrawer}
        {receivablePanel}
        {batchChargePanel}
      </>
    );
  }

  return (
    <div>
      {!hideHeader ? (
        <div className="hub-clientes__panel-header">
          <div style={{ flex: 1 }} />
          <button type="button" className="hub-clientes__panel-close" aria-label="Fechar painel" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      ) : null}

      <div className="hub-clientes__panel-hero">
        <div className="hub-clientes__panel-avatar-lg">{profileInitials(guardian.full_name)}</div>
        <h2 className="hub-clientes__panel-name">{guardian.full_name}</h2>
        <div style={{ marginTop: 6 }}>
          <span className={`hub-clientes__tag ${isCompany ? 'hub-clientes__tag--company' : 'hub-clientes__tag--primary'}`}>
            {label}
          </span>
          {hasSecondaryOnlyPet && !isCompany && (
            <span className="hub-clientes__tag hub-clientes__tag--secondary">Co-tutor em alguns pets</span>
          )}
        </div>
        <p className="hub-clientes__muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Cliente desde {since}
        </p>
      </div>

      <GuardianDetailQuickActions
        guardianId={guardian.id}
        phone={guardian.phone}
        email={guardian.email}
        onArchive={onArchive}
      />

      {tabs}
      {tabContent}
      {financeDrawer}
      {receivablePanel}
      {batchChargePanel}

      {!hideFooter ? (
        <div className="hub-clientes__footer-btns">
          <div className="hub-clientes__btn-row">
            <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onStartEdit}>
              {isCompany ? 'Editar empresa' : 'Editar tutor'}
            </button>
            {!hideNewPageButton && (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={onOpenInNewPage}
                title="Abrir o perfil completo"
              >
                <ExternalLink size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Ver perfil completo
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
