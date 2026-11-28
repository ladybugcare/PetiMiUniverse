import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest, useAuth } from '@petimi/web-core';

type UnitRow = { id: string; name: string; clinic_id: string };
type Membership = {
  clinic_id: string;
  unit_id: string | null;
  role: string;
  clinics?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function clinicName(m: Membership): string {
  const c = m.clinics;
  if (Array.isArray(c)) return c[0]?.name || m.clinic_id;
  return c?.name || m.clinic_id;
}

const HubAssistantOAuthConsentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [clinicId, setClinicId] = useState('');
  const [unitId, setUnitId] = useState('');

  const oauth = useMemo(
    () => ({
      client_id: searchParams.get('client_id') || '',
      redirect_uri: searchParams.get('redirect_uri') || '',
      scope: searchParams.get('scope') || '',
      state: searchParams.get('state') || '',
      code_challenge: searchParams.get('code_challenge') || '',
      code_challenge_method: searchParams.get('code_challenge_method') || 'S256',
      resource: searchParams.get('resource') || '',
    }),
    [searchParams],
  );

  const loginRedirect = `/oauth/assistant/consent?${searchParams.toString()}`;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ctx = (await apiRequest('/oauth/consent/context')) as {
          memberships?: Membership[];
          units?: UnitRow[];
        };
        if (cancelled) return;
        const ms = ctx.memberships || [];
        const us = ctx.units || [];
        setMemberships(ms);
        setUnits(us);
        if (ms[0]) {
          setClinicId(ms[0].clinic_id);
          const preferred =
            us.find((u) => u.clinic_id === ms[0]!.clinic_id && u.id === ms[0]!.unit_id)?.id ||
            us.find((u) => u.clinic_id === ms[0]!.clinic_id)?.id ||
            '';
          setUnitId(preferred);
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message || 'Falha ao carregar contexto');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const unitsForClinic = units.filter((u) => u.clinic_id === clinicId);

  const approve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = (await apiRequest('/oauth/consent/approve', {
        method: 'POST',
        body: JSON.stringify({
          clinic_id: clinicId,
          unit_id: unitId,
          ...oauth,
        }),
      })) as { redirect_uri?: string };
      const redirect = res.redirect_uri;
      if (!redirect) throw new Error('Redirect ausente');
      window.location.href = redirect;
    } catch (e: unknown) {
      setError((e as Error).message || 'Não foi possível autorizar');
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="hub-login-page" style={{ padding: 24, maxWidth: 480, margin: '40px auto' }}>
        <h1>Conectar ChatGPT ao PetMi</h1>
        <p>Faça login na sua conta PetMi Hub para autorizar o assistente.</p>
        <Link to={`/login?redirect=${encodeURIComponent(loginRedirect)}`}>Ir para o login</Link>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Carregando…</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Autorizar PetMi Hub</h1>
      <p>
        O ChatGPT solicitará permissão para consultar e executar ações autorizadas na clínica
        selecionada, em nome da sua conta. Dados clínicos reais não devem ser usados nesta POC —
        apenas fictícios.
      </p>
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <label style={{ display: 'block', marginTop: 16 }}>
        Clínica
        <select
          value={clinicId}
          onChange={(e) => {
            setClinicId(e.target.value);
            const first = units.find((u) => u.clinic_id === e.target.value);
            setUnitId(first?.id || '');
          }}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        >
          {memberships.map((m) => (
            <option key={m.clinic_id} value={m.clinic_id}>
              {clinicName(m)} ({m.role})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginTop: 12 }}>
        Unidade
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        >
          {unitsForClinic.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>

      <p style={{ marginTop: 16, fontSize: 14, color: '#444' }}>
        Escopos: {oauth.scope || 'petmi.grooming.read petmi.grooming.write offline_access'}
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button type="button" disabled={!clinicId || !unitId || submitting} onClick={approve}>
          {submitting ? 'Autorizando…' : 'Autorizar'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (oauth.redirect_uri) {
              const u = new URL(oauth.redirect_uri);
              u.searchParams.set('error', 'access_denied');
              if (oauth.state) u.searchParams.set('state', oauth.state);
              window.location.href = u.toString();
            }
          }}
        >
          Recusar
        </button>
      </div>
    </div>
  );
};

export default HubAssistantOAuthConsentPage;
