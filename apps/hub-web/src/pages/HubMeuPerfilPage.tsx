import React from 'react';
import { Lock, Mail, Pencil, Phone } from 'lucide-react';
import { useAuth, usePermissions } from '@petimi/web-core';
import { useAlert, formatBrPhoneDisplay } from '@petimi/hub-ui';
import HubProfilePhotoPicker from '../components/HubProfilePhotoPicker';
import {
  HubAccountProfileActionRow,
  HubAccountProfileCard,
  HubAccountProfileFields,
  HubAccountProfileHero,
  HubAccountProfileShell,
  formatProfileDate,
  formatProfileDateTime,
} from '../components/profile';
import {
  getHubUserDisplayName,
  getHubUserPhotoUrl,
  getHubUserPhone,
  getHubUserBirthDate,
  getHubUserLocaleCode,
  type HubUserLike,
} from '../utils/hubUserDisplay';
import { hubProfileAccessBadge, hubAccessTypeLabel } from '../utils/hubAccessLabel';

function formatBirthDisplay(raw?: string): string {
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatProfileDate(raw);
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

const HubMeuPerfilPage: React.FC = () => {
  const { user, role: authRole } = useAuth();
  const { role: clinicRole } = usePermissions();
  const { showInfo } = useAlert();

  const u = user as HubUserLike;
  const displayName = getHubUserDisplayName(user);
  const photoUrl = getHubUserPhotoUrl(user);
  const email = u?.email?.trim() || '—';
  const phone = formatBrPhoneDisplay(getHubUserPhone(user));
  const fullName = u?.user_metadata?.full_name || u?.user_metadata?.name || displayName;
  const badge = hubProfileAccessBadge(clinicRole, authRole);
  const cargo = hubAccessTypeLabel(clinicRole, authRole);
  const birth = formatBirthDisplay(getHubUserBirthDate(user));
  const idioma = localeLabel(getHubUserLocaleCode(user));
  const lastAccess = formatProfileDateTime(u?.last_sign_in_at);
  const memberSince = formatProfileDate(u?.created_at);

  const emBreve = () => showInfo('Esta ação estará disponível em breve.', 'PetMi Hub');

  return (
    <HubAccountProfileShell>
      <HubAccountProfileHero
        kicker="Seu perfil"
        name={displayName}
        photo={
          <HubProfilePhotoPicker mode={{ kind: 'user' }} photoUrl={photoUrl} displayName={displayName} size={88} />
        }
        badges={[badge]}
        chips={[
          { icon: Mail, label: email },
          { icon: Phone, label: phone },
        ]}
        meta={[
          { label: 'Membro desde', value: memberSince },
          { label: 'Último acesso', value: lastAccess },
        ]}
      />

      <HubAccountProfileCard
        title="Dados pessoais"
        subtitle="Informações usadas no Hub e nos documentos da clínica."
        actions={
          <button type="button" className="hub-ap__btn hub-ap__btn--outline" onClick={emBreve}>
            <Pencil size={16} aria-hidden />
            Editar
          </button>
        }
      >
        <HubAccountProfileFields
          fields={[
            { label: 'Nome completo', value: fullName },
            { label: 'E-mail', value: email },
            { label: 'Telefone', value: phone },
            { label: 'Cargo', value: cargo },
            { label: 'Data de nascimento', value: birth },
            { label: 'Idioma', value: idioma },
          ]}
        />
      </HubAccountProfileCard>

      <HubAccountProfileCard title="Acesso e segurança" subtitle="Credenciais da sua conta PetMi Hub.">
        <HubAccountProfileActionRow
          title="Senha"
          subtitle="Altere a senha de acesso quando quiser. Use uma combinação forte e exclusiva."
          action={
            <button type="button" className="hub-ap__btn hub-ap__btn--ghost" onClick={emBreve}>
              <Lock size={16} aria-hidden />
              Alterar senha
            </button>
          }
        />
      </HubAccountProfileCard>
    </HubAccountProfileShell>
  );
};

export default HubMeuPerfilPage;
