import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HubPrescriptionPublicView,
  fetchPublicPrescriptionByCode,
  normalizeValidationCodeInput,
  type HubPublicPrescriptionPayload,
} from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const ValidatePrescriptionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [codeInput, setCodeInput] = useState(initialCode);
  const [prescription, setPrescription] = useState<HubPublicPrescriptionPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  const validate = async (raw: string) => {
    const normalized = normalizeValidationCodeInput(raw);
    if (!normalized) {
      setErr('Informe um código no formato RX-XXXX-XXXX.');
      setPrescription(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPublicPrescriptionByCode(normalized);
      setPrescription(payload);
      setCodeInput(normalized);
    } catch (e: unknown) {
      setPrescription(null);
      setErr((e as Error)?.message || 'Receita não encontrada');
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
          <div>
            <p className="hub-public-quote__eyebrow">PetMi Hub</p>
            <h1 className="hub-public-quote__clinic hub-public-quote__clinic--solo">Validar receita</h1>
            <p className="hub-public-quote__tagline">
              Digite o código impresso na receita (formato RX-XXXX-XXXX) para consultar autenticidade.
            </p>
          </div>
        </header>

        <form
          className="hub-public-rx-validate__form"
          onSubmit={(e) => {
            e.preventDefault();
            void validate(codeInput);
          }}
        >
          <label className="hub-public-rx-validate__label">
            Código de validação
            <input
              className="hub-clientes__input hub-public-rx-validate__input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="RX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="submit"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={loading}
          >
            {loading ? 'Validando…' : 'Validar receita'}
          </button>
        </form>

        {err ? (
          <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="alert">
            <p className="hub-public-quote__banner-text">{err}</p>
          </div>
        ) : null}

        {prescription ? (
          <div className="hub-public-rx-validate__result">
            <HubPrescriptionPublicView prescription={prescription} />
          </div>
        ) : null}

        <p className="hub-public-rx-validate__hint">
          Recebeu um link direto?{' '}
          <Link to="/validar-receita" className="hub-clientes__link">
            Use esta página
          </Link>{' '}
          com o código ou abra o link enviado pela clínica.
        </p>
      </div>
    </div>
  );
};

export default ValidatePrescriptionPage;
