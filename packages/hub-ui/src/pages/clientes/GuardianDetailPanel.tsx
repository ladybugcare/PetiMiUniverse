import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import type { HubGuardian, HubGuardianPet } from '../../api/hubGuardiansApi';
import { formatGuardianAddress } from './formatters';
import { GuardianDetailQuickActions } from './GuardianDetailQuickActions';
import { HubTabs } from '../../components/HubTabs';
import { HubProfileInfoCell } from '../../components/HubProfileInfoCell';
import { HubProfileAvatar, profileInitials } from '../../components/HubProfileAvatar';
import { HubLoading } from '../../components/HubLoading';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import '../../components/hub-profile.css';

type DetailTab = 'resumo' | 'pets' | 'historico' | 'financeiro';
type ProfileLayout = 'panel' | 'page';

interface GuardianDetailPanelProps {
  guardian: HubGuardian;
  pets: HubGuardianPet[];
  onClose: () => void;
  onStartEdit: () => void;
  onOpenInNewPage: () => void;
  onArchive?: () => void;
  hideNewPageButton?: boolean;
  layout?: ProfileLayout;
  clinicId?: string | null;
  unitId?: string | null;
  canCreateReceivable?: boolean;
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
  layout = 'panel',
  clinicId,
  unitId,
  canCreateReceivable = false,
}) => {
  const navigate = useNavigate();
  const isPage = layout === 'page';
  const [tab, setTab] = useState<DetailTab>('resumo');
  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [finLoading, setFinLoading] = useState(false);
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [openingComanda, setOpeningComanda] = useState(false);

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
    if (tab === 'financeiro') void loadFinanceiro();
  }, [tab, loadFinanceiro]);

  const handleOpenComandaManual = async () => {
    if (!clinicId) return;
    setOpeningComanda(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardian.id,
        unit_id: unitId ?? undefined,
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
          <HubProfileInfoCell icon={Phone} label="Telefone" value={guardian.phone || '—'} />
          <HubProfileInfoCell icon={Mail} label="E-mail" value={guardian.email || '—'} />
          <HubProfileInfoCell icon={MapPin} label="Endereço" value={addr} />
          <HubProfileInfoCell icon={Info} label="Origem" value={guardian.lead_source || '—'} />
          <HubProfileInfoCell icon={User} label={taxLabel} value={guardian.tax_id || '—'} />
          {isCompany && guardian.legal_name ? (
            <HubProfileInfoCell icon={Building2} label="Razão social" value={guardian.legal_name} />
          ) : null}
        </div>
      </section>

      <section className="hub-meu-perfil__panel">
        <header className="hub-meu-perfil__panel-head">
          <div>
            <h2 className="hub-meu-perfil__panel-title">Resumo financeiro</h2>
            <p className="hub-meu-perfil__panel-sub">Movimentos e saldo do cliente.</p>
          </div>
        </header>
        <div className="hub-clientes__empty-state">
          Ainda não há movimentos financeiros associados a este cliente no Hub. Quando existir faturação ou pagamentos
          por atendimento, o resumo aparecerá aqui.
        </div>
      </section>

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
                <strong>Telefone:</strong> {guardian.phone || '—'}
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

      <div className="hub-clientes__section">
        <h3 className="hub-clientes__section-title" style={{ marginBottom: 8 }}>
          Resumo financeiro
        </h3>
        <div className="hub-clientes__empty-state">
          Ainda não há movimentos financeiros associados a este cliente no Hub. Quando existir faturação ou pagamentos
          por atendimento, o resumo aparecerá aqui.
        </div>
      </div>

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

  const renderPetsTab = () => {
    const inner =
      pets.length === 0 ? (
        <div className="hub-clientes__empty-state">Este cliente ainda não tem pets associados.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {pets.map((p) => (
            <li
              key={`${p.id}-${p.role}`}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--hc-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Link
                to={`/hub/pets/${p.id}`}
                style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}
              >
                {p.name}
              </Link>
              <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                {p.species} · {p.role === 'primary' ? 'Principal' : 'Co-tutor'}
              </span>
            </li>
          ))}
        </ul>
      );

    if (isPage) {
      return (
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Pets</h2>
              <p className="hub-meu-perfil__panel-sub">{pets.length} pet(s) vinculado(s) a este cliente.</p>
            </div>
          </header>
          {inner}
        </section>
      );
    }

    return <div className="hub-clientes__section">{inner}</div>;
  };

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
    const inner = (
      <>
        {canCreateReceivable && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              disabled={openingComanda}
              onClick={() => void handleOpenComandaManual()}
            >
              <FilePlus2 size={14} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {openingComanda ? 'Abrindo…' : 'Abrir comanda'}
            </button>
          </div>
        )}

        {finLoading ? (
          <HubLoading variant="inline" label="Carregando financeiro…" size="sm" />
        ) : (
          <>
            {comandas.filter((c) => c.status === 'aberta').length > 0 && (
              <section style={{ marginBottom: 20 }}>
                <h4 className="hub-clientes__label" style={{ marginBottom: 8 }}>
                  Comandas abertas
                </h4>
                {comandas
                  .filter((c) => c.status === 'aberta')
                  .map((c) => (
                    <div
                      key={String(c.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 0',
                        borderBottom: '1px solid var(--hc-border,#e8ddd8)',
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {String(c.origin_type ?? '—')}
                        <span className="hub-clientes__muted" style={{ marginLeft: 6, fontSize: 12 }}>
                          {c.opened_at ? new Date(String(c.opened_at)).toLocaleDateString('pt-BR') : ''}
                        </span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{formatBrl(Number(c.total_amount ?? 0))}</span>
                      {canCreateReceivable && (
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          onClick={() => setCheckoutComandaId(String(c.id))}
                          title="Receber"
                        >
                          <Coins size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            )}

            {receivables.length > 0 ? (
              <section>
                <h4 className="hub-clientes__label" style={{ marginBottom: 8 }}>
                  Recebíveis
                </h4>
                {receivables.slice(0, 20).map((rv) => (
                  <div
                    key={rv.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px solid var(--hc-border,#e8ddd8)',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {rv.source_type}
                      <span className="hub-clientes__muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        {rv.due_date ? `venc. ${new Date(rv.due_date).toLocaleDateString('pt-BR')}` : ''}
                      </span>
                    </span>
                    <span
                      className={`hub-dayboard__badge ${rv.status === 'paid' ? 'hub-dayboard__badge--received' : rv.status === 'pending' ? 'hub-dayboard__badge--pending' : 'hub-dayboard__badge--none'}`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {rv.status === 'paid' ? 'Pago' : rv.status === 'pending' ? 'Pendente' : rv.status}
                    </span>
                    <span style={{ fontWeight: 500 }}>{formatBrl(rv.final_amount)}</span>
                  </div>
                ))}
              </section>
            ) : comandas.length === 0 ? (
              <p className="hub-clientes__muted">Nenhum lançamento financeiro encontrado para este tutor.</p>
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
      ariaLabel="Detalhe do tutor"
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
                {guardian.phone ? <span>{guardian.phone}</span> : null}
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
      </>
    );
  }

  return (
    <div>
      <div className="hub-clientes__panel-header">
        <div style={{ flex: 1 }} />
        <button type="button" className="hub-clientes__panel-close" aria-label="Fechar painel" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

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

      <div className="hub-clientes__footer-btns">
        <div className="hub-clientes__btn-row">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onStartEdit}>
            Editar tutor
          </button>
          {!hideNewPageButton && (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={onOpenInNewPage}
              title="Abrir o perfil completo numa nova página"
            >
              <ExternalLink size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Ver perfil completo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
