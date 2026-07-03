import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HubSpecialistReferralPublicView,
  fetchPublicSpecialistReferralByCode,
  normalizeSpecialistReferralCodeInput,
  type HubPublicSpecialistReferralPayload,
} from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const ValidateSpecialistReferralPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [codeInput, setCodeInput] = useState(initialCode);
  const [referral, setReferral] = useState<HubPublicSpecialistReferralPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  const validate = async (raw: string) => {
    const normalized = normalizeSpecialistReferralCodeInput(raw);
    if (!normalized) {
      setErr('Informe um código no formato RF-XXXX-XXXX.');
      setReferral(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPublicSpecialistReferralByCode(normalized);
      setReferral(payload);
      setCodeInput(normalized);
    } catch (e: unknown) {
      setReferral(null);
      setErr((e as Error)?.message || 'Encaminhamento não encontrado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRan || !initialCode.trim()) return;
    setAutoRan(true);
    void validate(initialCode);
  }, [autoRan, initialCode]);

  return (
    <div className="hub-public-quote hub-public-rx-validate">
      <div className="hub-public-quote__shell hub-public-rx-validate__shell">
        <header className="hub-public-rx-validate__header">
          <p className="hub-public-quote__eyebrow">PetMi Hub</p>
          <h1 className="hub-public-quote__clinic hub-public-quote__clinic--solo">Validar encaminhamento</h1>
        </header>
        <form
          className="hub-public-rx-validate__form"
          onSubmit={(e) => {
            e.preventDefault();
            void validate(codeInput);
          }}
        >
          <input
            className="hub-clientes__input"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="RF-XXXX-XXXX"
          />
          <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={loading}>
            {loading ? 'Validando…' : 'Validar'}
          </button>
        </form>
        {err ? (
          <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="alert">
            <p className="hub-public-quote__banner-text">{err}</p>
          </div>
        ) : null}
        {referral ? (
          <div className="hub-public-rx-validate__result">
            <HubSpecialistReferralPublicView referral={referral} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ValidateSpecialistReferralPage;
