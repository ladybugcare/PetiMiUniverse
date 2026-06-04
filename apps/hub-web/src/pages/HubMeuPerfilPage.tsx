import React from 'react';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Globe,
  Lock,
  Pencil,
} from 'lucide-react';
import { useAuth, usePermissions } from '@petimi/web-core';
import { useAlert } from '@petimi/hub-ui';
import HubProfilePhotoPicker from '../components/HubProfilePhotoPicker';
import {
  getHubUserDisplayName,
  getHubUserPhotoUrl,
  getHubUserPhone,
  getHubUserBirthDate,
  getHubUserLocaleCode,
  type HubUserLike,
} from '../utils/hubUserDisplay';
import { hubProfileAccessBadge, hubAccessTypeLabel } from '../utils/hubAccessLabel';

const terracotta = '#c86a4d';

function formatDateTimePt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDatePt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatBirthDisplay(raw?: string): string {
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDatePt(raw);
  return raw;
}

function localeLabel(code?: string): string {
  if (!code) return '—';
  const c = code.toLowerCase().slice(0, 2);
  if (c === 'pt') return 'Português';
  if (c === 'en') return 'English';
  if (c === 'es') return 'Español';
  return code;
}

type CellProps = { icon: React.ReactNode; label: string; value: string };

const InfoCell: React.FC<CellProps> = ({ icon, label, value }) => (
  <div className="hub-meu-perfil__cell">
    <div className="hub-meu-perfil__cell-icon" aria-hidden>
      {icon}
    </div>
    <div className="hub-meu-perfil__cell-label">{label}</div>
    <div className="hub-meu-perfil__cell-value">{value}</div>
  </div>
);

const HubMeuPerfilPage: React.FC = () => {
  const { user, role: authRole } = useAuth();
  const { role: clinicRole } = usePermissions();
  const { showInfo } = useAlert();

  const u = user as HubUserLike;
  const displayName = getHubUserDisplayName(user);
  const photoUrl = getHubUserPhotoUrl(user);
  const email = u?.email?.trim() || '—';
  const phone = getHubUserPhone(user) || '—';
  const fullName = u?.user_metadata?.full_name || u?.user_metadata?.name || displayName;
  const badge = hubProfileAccessBadge(clinicRole, authRole);
  const cargo = hubAccessTypeLabel(clinicRole, authRole);
  const birth = formatBirthDisplay(getHubUserBirthDate(user));
  const idioma = localeLabel(getHubUserLocaleCode(user));

  const lastAccess = formatDateTimePt(u?.last_sign_in_at);
  const memberSince = formatDatePt(u?.created_at);

  const emBreve = () => showInfo('Esta ação estará disponível em breve.', 'PetMi Hub');

  return (
    <div className="hub-meu-perfil">
      <aside className="hub-meu-perfil__sidebar">
        <div className="hub-meu-perfil__card hub-meu-perfil__summary">
          <HubProfilePhotoPicker mode={{ kind: 'user' }} photoUrl={photoUrl} displayName={displayName} size={96} />
          <h2 className="hub-meu-perfil__sidebar-name">{displayName}</h2>
          <span className="hub-meu-perfil__badge">{badge}</span>
          <div className="hub-meu-perfil__contact">
            <span>{email}</span>
            <span>{phone}</span>
          </div>
        </div>

        <div className="hub-meu-perfil__card hub-meu-perfil__aside-meta">
          <div className="hub-meu-perfil__meta-row">
            <span className="hub-meu-perfil__meta-label">Último acesso</span>
            <span className="hub-meu-perfil__meta-value">{lastAccess}</span>
          </div>
          <div className="hub-meu-perfil__meta-row">
            <span className="hub-meu-perfil__meta-label">Membro desde</span>
            <span className="hub-meu-perfil__meta-value">{memberSince}</span>
          </div>
        </div>
      </aside>

      <div className="hub-meu-perfil__main">
        <section className="hub-meu-perfil__panel">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Informações Pessoais</h2>
              <p className="hub-meu-perfil__panel-sub">Atualize os seus dados pessoais e de contato.</p>
            </div>
            <button type="button" className="hub-meu-perfil__btn-outline" onClick={emBreve}>
              <Pencil size={16} aria-hidden />
              Editar informações
            </button>
          </header>
          <div className="hub-meu-perfil__grid">
            <InfoCell icon={<User size={20} color={terracotta} />} label="Nome completo" value={fullName} />
            <InfoCell icon={<Mail size={20} color={terracotta} />} label="E-mail" value={email} />
            <InfoCell icon={<Phone size={20} color={terracotta} />} label="Telefone" value={phone} />
            <InfoCell icon={<User size={20} color={terracotta} />} label="Cargo / Função" value={cargo} />
            <InfoCell icon={<Calendar size={20} color={terracotta} />} label="Data de nascimento" value={birth} />
            <InfoCell icon={<Globe size={20} color={terracotta} />} label="Idioma" value={idioma} />
          </div>
        </section>

        <section className="hub-meu-perfil__panel hub-meu-perfil__panel--spaced">
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Senha</h2>
              <p className="hub-meu-perfil__panel-sub">Altere a sua senha de acesso.</p>
            </div>
            <button type="button" className="hub-meu-perfil__btn-outline" onClick={emBreve}>
              <Lock size={16} aria-hidden />
              Alterar senha
            </button>
          </header>
        </section>
      </div>
    </div>
  );
};

export default HubMeuPerfilPage;
