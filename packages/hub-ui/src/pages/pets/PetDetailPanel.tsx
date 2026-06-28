import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X,
  Pencil,
  User,
  StickyNote,
  CalendarClock,
  FileText,
  Syringe,
  MoreHorizontal,
  FilePlus2,
  Coins,
} from 'lucide-react';
import type { HubPet } from '../../api/hubPetsApi';
import { HubTabs } from '../../components/HubTabs';
import { petAgeDetailedLabel } from './petAge';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  type CoatTypeValue,
  type PetBodyPorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';

interface PetDetailPanelProps {
  pet: HubPet;
  onClose: () => void;
  onStartEdit: () => void;
  onArchive?: () => void;
  canWrite: boolean;
  clinicId?: string | null;
  unitId?: string | null;
  canCreateReceivable?: boolean;
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type PetDetailTab = 'resumo' | 'historico_saude' | 'servicos' | 'financeiro';

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function sexLabel(s: string | null): string {
  if (s === 'M') return 'Macho';
  if (s === 'F') return 'Fêmea';
  if (s === 'U') return 'Indefinido';
  return '—';
}

function formatDateBR(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="hub-pets-detail__info-pair">
      <span className="hub-pets-detail__info-label">{label}</span>
      <span className="hub-pets-detail__info-value">{value}</span>
    </div>
  );
}

export const PetDetailPanel: React.FC<PetDetailPanelProps> = ({
  pet,
  onClose,
  onStartEdit,
  onArchive,
  canWrite,
  clinicId,
  unitId,
  canCreateReceivable = false,
}) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<PetDetailTab>('resumo');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [finLoading, setFinLoading] = useState(false);
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [openingComanda, setOpeningComanda] = useState(false);

  const loadFinanceiro = useCallback(async () => {
    if (!clinicId) return;
    setFinLoading(true);
    try {
      const guardianId = pet.primary_guardian?.guardian_id ?? null;
      const [cmd, rec] = await Promise.all([
        hubComandaApi.listComandas({ clinic_id: clinicId, enrich: true })
          .then((r) => r.comandas.filter((c) => (c.pet_id as string) === pet.id))
          .catch(() => [] as Array<Record<string, unknown>>),
        guardianId
          ? hubFinancialApi.listReceivables(clinicId, { status: undefined })
              .then((r) => r.filter((rv) => rv.guardian_id === guardianId))
              .catch(() => [] as HubFinanceReceivable[])
          : Promise.resolve([] as HubFinanceReceivable[]),
      ]);
      setComandas(cmd);
      setReceivables(rec);
    } finally {
      setFinLoading(false);
    }
  }, [clinicId, pet.id, pet.primary_guardian?.guardian_id]);

  useEffect(() => {
    if (tab === 'financeiro') void loadFinanceiro();
  }, [tab, loadFinanceiro]);

  const handleOpenComandaManual = async () => {
    if (!clinicId) return;
    const guardianId = pet.primary_guardian?.guardian_id;
    if (!guardianId) {
      alert('Este pet não tem tutor principal cadastrado.');
      return;
    }
    setOpeningComanda(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardianId,
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

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  const active = !pet.deleted_at;
  const breedLine = [pet.breed || pet.species, sexLabel(pet.sex)].filter((x) => x && x !== '—').join(' • ');
  const primaryTutor = pet.primary_guardian?.guardian_name;

  return (
    <div className="hub-pets-detail">
      <div className="hub-clientes__panel-header">
        <div style={{ flex: 1 }} />
        <button type="button" className="hub-clientes__panel-close" aria-label="Fechar painel" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="hub-pets-detail__hero">
        <div className="hub-clientes__panel-avatar-lg hub-pets-detail__hero-avatar">{initials(pet.name)}</div>
        <div className="hub-pets-detail__hero-body">
          <div className="hub-pets-detail__hero-title-row">
            <h2 className="hub-clientes__panel-name hub-pets-detail__hero-name">{pet.name}</h2>
            <span className={`hub-clientes__pill ${active ? 'hub-clientes__pill--active' : 'hub-clientes__pill--inactive'}`}>
              {active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          {breedLine ? (
            <p className="hub-pets-detail__hero-muted">{breedLine}</p>
          ) : null}
          <p className="hub-pets-detail__hero-muted">{petAgeDetailedLabel(pet.birth_date)}</p>
          {primaryTutor ? (
            <p className="hub-pets-detail__hero-muted hub-pets-detail__hero-tutor">
              Tutor:{' '}
              <span className="hub-pets-detail__hero-tutor-name">{primaryTutor}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="hub-pets-detail__quick-actions">
        <Link to="/hub/appointments" className="hub-pets-detail__quick-item hub-pets-detail__quick-link" title="Agendar">
          <span className="hub-clientes__icon-btn">
            <CalendarClock size={18} strokeWidth={1.75} aria-hidden />
          </span>
          <span className="hub-pets-detail__quick-label">Agendar</span>
        </Link>
        <Link
          to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(pet.id)}`}
          className="hub-pets-detail__quick-item hub-pets-detail__quick-link"
          title="Prontuário clínico"
        >
          <span className="hub-clientes__icon-btn" aria-hidden>
            <FileText size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Histórico</span>
        </Link>
        <Link
          to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(pet.id)}&tab=vacinas`}
          className="hub-pets-detail__quick-item hub-pets-detail__quick-link"
          title="Vacinas no prontuário"
        >
          <span className="hub-clientes__icon-btn" aria-hidden>
            <Syringe size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Vacinas</span>
        </Link>
        {canWrite ? (
          <button type="button" className="hub-pets-detail__quick-item" title="Editar ficha" onClick={onStartEdit}>
            <span className="hub-clientes__icon-btn" aria-hidden>
              <Pencil size={18} strokeWidth={1.75} />
            </span>
            <span className="hub-pets-detail__quick-label">Editar</span>
          </button>
        ) : (
          <button type="button" className="hub-pets-detail__quick-item" title="Sem permissão para editar" disabled>
            <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
              <Pencil size={18} strokeWidth={1.75} />
            </span>
            <span className="hub-pets-detail__quick-label">Editar</span>
          </button>
        )}
        {onArchive && canWrite ? (
          <div className="hub-pets-detail__quick-item hub-pets-detail__dropdown-wrap" ref={moreRef}>
            <button
              type="button"
              className="hub-pets-detail__quick-stack"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-label="Mais opções"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <span className="hub-clientes__icon-btn">
                <MoreHorizontal size={18} strokeWidth={1.75} />
              </span>
              <span className="hub-pets-detail__quick-label">Mais</span>
            </button>
            {moreOpen ? (
              <div className="hub-clientes__dropdown-menu" role="menu">
                <button
                  type="button"
                  className="hub-clientes__dropdown-item hub-clientes__dropdown-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    onArchive();
                  }}
                >
                  Arquivar
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="hub-pets-detail__quick-item" disabled title="Mais opções">
            <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
              <MoreHorizontal size={18} strokeWidth={1.75} />
            </span>
            <span className="hub-pets-detail__quick-label">Mais</span>
          </button>
        )}
      </div>

      <HubTabs
        className="hub-pets-detail__tabs"
        variant="detail"
        ariaLabel="Detalhe do pet"
        activeId={tab}
        onTabChange={(id) => setTab(id as PetDetailTab)}
        items={[
          { id: 'resumo', label: 'Resumo' },
          { id: 'historico_saude', label: 'Histórico & Saúde' },
          { id: 'servicos', label: 'Serviços' },
          { id: 'financeiro', label: 'Financeiro' },
        ]}
      />

      {tab === 'resumo' && (
        <>
          <div className="hub-clientes__section">
            <div className="hub-clientes__contact-card">
              <div className="hub-clientes__contact-card-head">
                <h3 className="hub-clientes__contact-card-title">Informações gerais</h3>
                {canWrite ? (
                  <button type="button" className="hub-clientes__link-btn hub-clientes__link-btn--with-icon" onClick={onStartEdit}>
                    <Pencil size={15} strokeWidth={2} aria-hidden />
                    Editar
                  </button>
                ) : null}
              </div>
              <div className="hub-pets-detail__info-grid">
                <InfoPair label="Espécie" value={pet.species || '—'} />
                <InfoPair label="Data de nascimento" value={formatDateBR(pet.birth_date)} />
                <InfoPair label="Raça" value={pet.breed || '—'} />
                <InfoPair label="Cor" value={pet.coat_color || '—'} />
                <InfoPair label="Sexo" value={sexLabel(pet.sex)} />
                <InfoPair
                  label="Pelagem"
                  value={
                    pet.coat_type && COAT_TYPE_LABELS[pet.coat_type as CoatTypeValue]
                      ? COAT_TYPE_LABELS[pet.coat_type as CoatTypeValue]
                      : '—'
                  }
                />
                <InfoPair label="Castrado(a)" value="—" />
                <InfoPair
                  label="Porte"
                  value={
                    pet.size_tier && PORTE_LABELS[pet.size_tier as PetBodyPorteValue]
                      ? PORTE_LABELS[pet.size_tier as PetBodyPorteValue]
                      : '—'
                  }
                />
              </div>
            </div>
          </div>

          <div className="hub-clientes__section">
            <div className="hub-clientes__contact-card">
              <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 12 }}>
                Último atendimento
              </h3>
              <div className="hub-clientes__empty-state hub-pets-detail__empty-inline">
                Ainda não há atendimentos associados a este pet. Quando a agenda e o histórico estiverem ligados, o
                último serviço aparecerá aqui.
              </div>
            </div>
          </div>

          <div className="hub-clientes__section">
            <div className="hub-clientes__contact-card">
              <div className="hub-clientes__contact-card-head" style={{ marginBottom: 10 }}>
                <h3 className="hub-clientes__contact-card-title">Próximos compromissos</h3>
                <span className="hub-clientes__link-btn" style={{ opacity: 0.45, cursor: 'default', pointerEvents: 'none' }}>
                  Ver todos
                </span>
              </div>
              <div className="hub-clientes__empty-state hub-pets-detail__empty-inline">
                Sem marcações futuras. Os próximos agendamentos serão listados aqui.
              </div>
            </div>
          </div>

          {pet.secondary_guardian?.guardian_name ? (
            <div className="hub-clientes__section">
              <div className="hub-clientes__contact-card">
                <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 12 }}>
                  Co-tutor
                </h3>
                <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 14 }}>
                  <User size={16} strokeWidth={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden />
                  <span className="hub-pets-detail__hero-tutor-name">{pet.secondary_guardian.guardian_name}</span>
                </p>
              </div>
            </div>
          ) : null}

          {pet.notes ? (
            <div className="hub-clientes__section">
              <div className="hub-clientes__contact-card">
                <div className="hub-clientes__contact-card-head">
                  <h3 className="hub-clientes__contact-card-title">Notas</h3>
                </div>
                <div className="hub-clientes__contact-row" style={{ marginTop: 0 }}>
                  <span className="hub-clientes__contact-row-icon" aria-hidden>
                    <StickyNote size={18} strokeWidth={1.75} />
                  </span>
                  <p className="hub-clientes__contact-row-text" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {pet.notes}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {tab === 'historico_saude' && (
        <div className="hub-clientes__section">
          <div className="hub-clientes__contact-card">
            <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 10 }}>
              Histórico clínico
            </h3>
            <p className="hub-clientes__muted" style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5 }}>
              O histórico de atendimentos e episódios clínicos aparecerá aqui quando o módulo de atendimentos estiver
              ligado à ficha do pet.
            </p>
            <h3 className="hub-clientes__contact-card-title" style={{ marginBottom: 10 }}>
              Saúde e vacinas
            </h3>
            <p className="hub-clientes__muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              Vacinas, plano de saúde e alertas clínicos serão mostrados nesta mesma área quando o módulo de saúde
              estiver ativo.
            </p>
          </div>
        </div>
      )}

      {tab === 'servicos' && (
        <div className="hub-clientes__empty-state">
          Serviços contratados e pacotes serão listados aqui em breve.
        </div>
      )}

      {tab === 'financeiro' && (
        <div className="hub-clientes__section">
          <div className="hub-clientes__contact-card">
            {canCreateReceivable && clinicId && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  disabled={openingComanda}
                  onClick={() => void handleOpenComandaManual()}
                  title="Abrir comanda manual para este pet"
                >
                  <FilePlus2 size={13} strokeWidth={2} style={{ marginRight: 4 }} />
                  {openingComanda ? 'Abrindo…' : 'Abrir comanda'}
                </button>
              </div>
            )}

            {finLoading ? (
              <p className="hub-clientes__muted">Carregando…</p>
            ) : (
              <>
                {comandas.filter((c) => c.status === 'aberta').length > 0 && (
                  <section style={{ marginBottom: 20 }}>
                    <h4 className="hub-clientes__label" style={{ marginBottom: 8 }}>Comandas abertas</h4>
                    {comandas
                      .filter((c) => c.status === 'aberta')
                      .map((c) => (
                        <div key={String(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--hc-border,#e8ddd8)' }}>
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
                    <h4 className="hub-clientes__label" style={{ marginBottom: 8 }}>Recebíveis</h4>
                    {receivables.slice(0, 20).map((rv) => (
                      <div key={rv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--hc-border,#e8ddd8)', fontSize: 13 }}>
                        <span style={{ flex: 1 }}>
                          {rv.source_type}
                          <span className="hub-clientes__muted" style={{ marginLeft: 6, fontSize: 12 }}>
                            {rv.due_date ? `venc. ${new Date(rv.due_date).toLocaleDateString('pt-BR')}` : ''}
                          </span>
                        </span>
                        <span className={`hub-dayboard__badge ${rv.status === 'paid' ? 'hub-dayboard__badge--received' : rv.status === 'pending' ? 'hub-dayboard__badge--pending' : 'hub-dayboard__badge--none'}`} style={{ textTransform: 'capitalize' }}>
                          {rv.status === 'paid' ? 'Pago' : rv.status === 'pending' ? 'Pendente' : rv.status}
                        </span>
                        <span style={{ fontWeight: 500 }}>{formatBrl(rv.final_amount)}</span>
                      </div>
                    ))}
                  </section>
                ) : comandas.length === 0 ? (
                  <p className="hub-clientes__muted">Nenhum lançamento financeiro encontrado para este pet.</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {canWrite ? (
        <div className="hub-clientes__footer-btns">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--outline hub-pets-detail__footer-full"
            onClick={onStartEdit}
          >
            <User size={18} strokeWidth={1.75} aria-hidden />
            Ver perfil completo
          </button>
        </div>
      ) : null}

      {clinicId && unitId && checkoutComandaId ? (
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
      ) : null}
    </div>
  );
};
