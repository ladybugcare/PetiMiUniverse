import React, { useState } from 'react';
import { X, ExternalLink, Phone, Mail, MapPin, Info, Pencil } from 'lucide-react';
import type { HubGuardian, HubGuardianPet } from '../../api/hubGuardiansApi';
import { formatGuardianAddress } from './formatters';
import { GuardianDetailQuickActions } from './GuardianDetailQuickActions';
import { HubTabs } from '../../components/HubTabs';

type DetailTab = 'resumo' | 'pets' | 'historico' | 'financeiro';

interface GuardianDetailPanelProps {
  guardian: HubGuardian;
  pets: HubGuardianPet[];
  onClose: () => void;
  onStartEdit: () => void;
  onOpenInNewPage: () => void;
  /** Abre confirmação e arquiva o cliente (menu "Mais"). */
  onArchive?: () => void;
  /** Quando true, oculta o botão "Ver Perfil Completo" (ex.: já estamos na rota dedicada). */
  hideNewPageButton?: boolean;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export const GuardianDetailPanel: React.FC<GuardianDetailPanelProps> = ({
  guardian,
  pets,
  onClose,
  onStartEdit,
  onOpenInNewPage,
  onArchive,
  hideNewPageButton = false,
}) => {
  const [tab, setTab] = useState<DetailTab>('resumo');
  const addr = formatGuardianAddress(guardian);
  const since = guardian.created_at
    ? new Date(guardian.created_at).toLocaleDateString('pt-BR')
    : '—';
  const isCompany = guardian.client_kind === 'company';
  const hasSecondaryOnlyPet = pets.some((p) => p.role === 'secondary');
  const label = isCompany ? 'Cliente empresa' : 'Tutor Principal';

  return (
    <div>
      <div className="hub-clientes__panel-header">
        <div style={{ flex: 1 }} />
        <button type="button" className="hub-clientes__panel-close" aria-label="Fechar painel" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="hub-clientes__panel-hero">
        <div className="hub-clientes__panel-avatar-lg">{initials(guardian.full_name)}</div>
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

      {tab === 'resumo' && (
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
              Ainda não há movimentos financeiros associados a este cliente no Hub. Quando existir faturação ou
              pagamentos por atendimento, o resumo aparecerá aqui.
            </div>
          </div>

          <div className="hub-clientes__section">
            <h3 className="hub-clientes__section-title" style={{ marginBottom: 8 }}>
              Últimos atendimentos
            </h3>
            <div className="hub-clientes__empty-state">
              Nenhum atendimento registado neste cliente. Após agendar e concluir serviços no Hub, o histórico
              resumido será mostrado aqui.
            </div>
          </div>
        </>
      )}

      {tab === 'pets' && (
        <div className="hub-clientes__section">
          {pets.length === 0 ? (
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
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                    {p.species} · {p.role === 'primary' ? 'Principal' : 'Co-tutor'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'historico' && (
        <div className="hub-clientes__empty-state">
          O histórico clínico e operacional por cliente estará disponível quando o módulo de atendimentos estiver
          ligado à ficha.
        </div>
      )}

      {tab === 'financeiro' && (
        <div className="hub-clientes__empty-state">
          Não há lançamentos financeiros para mostrar. Esta área será preenchida com faturas, pagamentos e saldo
          quando o financeiro do Hub estiver ativo.
        </div>
      )}

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
              Ver Perfil Completo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
