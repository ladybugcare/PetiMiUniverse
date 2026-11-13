import React, { useCallback, useEffect, useState } from 'react';
import { Bell, History, Lock, Mail, Pencil, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { useHubUnit } from '../contexts/HubUnitContext';
import {
  hubGetNotificationPrefs,
  hubUpdateNotificationPrefs,
  type HubNotificationPrefCategory,
  type HubNotificationPrefsMap,
} from '../services/hubNotificationsApi';
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

const DEFAULT_PREFS: HubNotificationPrefsMap = {
  acoes: true,
  operacao: true,
  alertas: true,
};

const PREF_ROWS: Array<{
  key: HubNotificationPrefCategory;
  title: string;
  subtitle: string;
}> = [
  {
    key: 'acoes',
    title: 'Ações necessárias',
    subtitle: 'Autorização de serviço no salão, cobranças e cancelamentos pendentes.',
  },
  {
    key: 'operacao',
    title: 'Operação do dia',
    subtitle: 'Pet pronto, a caminho ou chegou, check-in e check-out de hotel/creche.',
  },
  {
    key: 'alertas',
    title: 'Alertas',
    subtitle: 'Estoque baixo, validade próxima e avisos semelhantes.',
  },
];

const HubMeuPerfilPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole } = usePermissions();
  const { clinicId } = useHubUnit();
  const { showInfo, showError, showSuccess } = useAlert();

  const [prefs, setPrefs] = useState<HubNotificationPrefsMap>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState<HubNotificationPrefCategory | null>(null);

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

  const loadPrefs = useCallback(async () => {
    if (!clinicId) {
      setPrefs(DEFAULT_PREFS);
      return;
    }
    setPrefsLoading(true);
    try {
      const next = await hubGetNotificationPrefs(clinicId);
      setPrefs(next);
    } catch {
      setPrefs(DEFAULT_PREFS);
      showError('Não foi possível carregar as preferências de notificação.', 'PetMi Hub');
    } finally {
      setPrefsLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  const togglePref = async (key: HubNotificationPrefCategory) => {
    if (!clinicId || prefsSaving) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setPrefsSaving(key);
    try {
      const saved = await hubUpdateNotificationPrefs(clinicId, next);
      setPrefs(saved);
      showSuccess('Preferências atualizadas.', 'PetMi Hub');
    } catch {
      setPrefs(prefs);
      showError('Não foi possível salvar a preferência.', 'PetMi Hub');
    } finally {
      setPrefsSaving(null);
    }
  };

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

      <HubAccountProfileCard
        title="Notificações"
        subtitle="Avisos in-app do dia a dia. Quem recebe cada tipo também depende da área operacional na Equipe."
        actions={
          <button
            type="button"
            className="hub-ap__btn hub-ap__btn--outline"
            onClick={() => navigate('/hub/notificacoes')}
          >
            <History size={16} aria-hidden />
            Ver histórico
          </button>
        }
      >
        {!clinicId ? (
          <p className="hub-ap__prefs-hint">
            Vincule-se a uma clínica para configurar as preferências de notificação.
          </p>
        ) : (
          <div className="hub-ap__prefs" aria-busy={prefsLoading}>
            {PREF_ROWS.map((row) => {
              const on = prefs[row.key];
              const busy = prefsSaving === row.key || prefsLoading;
              return (
                <HubAccountProfileActionRow
                  key={row.key}
                  title={row.title}
                  subtitle={row.subtitle}
                  action={
                    <button
                      type="button"
                      className={`hub-ap__switch${on ? ' hub-ap__switch--on' : ''}`}
                      role="switch"
                      aria-checked={on}
                      aria-label={row.title}
                      disabled={busy}
                      onClick={() => void togglePref(row.key)}
                    >
                      <span className="hub-ap__switch-thumb" aria-hidden />
                    </button>
                  }
                />
              );
            })}
            <p className="hub-ap__prefs-hint">
              <Bell size={14} aria-hidden />
              Os avisos aparecem no sino do topo. Sem área na Equipe, só gestores recebem por padrão.
            </p>
          </div>
        )}
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
