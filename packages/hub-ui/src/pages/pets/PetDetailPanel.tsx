import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Pencil,
  User,
  StickyNote,
  CalendarClock,
  FileText,
  Syringe,
  MoreHorizontal,
} from 'lucide-react';
import type { HubPet } from '../../api/hubPetsApi';
import { petAgeDetailedLabel } from './petAge';

interface PetDetailPanelProps {
  pet: HubPet;
  onClose: () => void;
  onStartEdit: () => void;
  onArchive?: () => void;
  canWrite: boolean;
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
}) => {
  const [tab, setTab] = useState<PetDetailTab>('resumo');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

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
        <button
          type="button"
          className="hub-pets-detail__quick-item"
          title="Em breve"
          disabled
          aria-disabled="true"
        >
          <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
            <FileText size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Histórico</span>
        </button>
        <button type="button" className="hub-pets-detail__quick-item" title="Em breve" disabled aria-disabled="true">
          <span className="hub-clientes__icon-btn hub-pets-detail__quick-icon--disabled" aria-hidden>
            <Syringe size={18} strokeWidth={1.75} />
          </span>
          <span className="hub-pets-detail__quick-label">Vacinas</span>
        </button>
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

      <div className="hub-clientes__detail-tabs hub-pets-detail__tabs">
        {(
          [
            ['resumo', 'Resumo'],
            ['historico_saude', 'Histórico & Saúde'],
            ['servicos', 'Serviços'],
            ['financeiro', 'Financeiro'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`hub-clientes__detail-tab ${tab === id ? 'hub-clientes__detail-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

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
                <InfoPair label="Microchip" value="—" />
                <InfoPair label="Sexo" value={sexLabel(pet.sex)} />
                <InfoPair label="Cor / pelagem" value="—" />
                <InfoPair label="Castrado(a)" value="—" />
                <InfoPair label="Porte" value="—" />
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
        <div className="hub-clientes__empty-state">
          Não há lançamentos financeiros para mostrar. Esta área será preenchida quando o financeiro do Hub estiver
          ativo.
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
    </div>
  );
};
