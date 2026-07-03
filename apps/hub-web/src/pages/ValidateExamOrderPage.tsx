import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HubExamOrderPublicView,
  fetchPublicExamOrderByCode,
  normalizeExamOrderCodeInput,
  type HubPublicExamOrderPayload,
} from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const ValidateExamOrderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const [codeInput, setCodeInput] = useState(initialCode);
  const [examOrder, setExamOrder] = useState<HubPublicExamOrderPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  const validate = async (raw: string) => {
    const normalized = normalizeExamOrderCodeInput(raw);
    if (!normalized) {
      setErr('Informe um código no formato EX-XXXX-XXXX.');
      setExamOrder(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = await fetchPublicExamOrderByCode(normalized);
      setExamOrder(payload);
      setCodeInput(normalized);
    } catch (e: unknown) {
      setExamOrder(null);
      setErr((e as Error)?.message || 'Solicitação não encontrada');
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
          <h1 className="hub-public-quote__clinic hub-public-quote__clinic--solo">Validar solicitação de exames</h1>
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
            placeholder="EX-XXXX-XXXX"
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
        {examOrder ? (
          <div className="hub-public-rx-validate__result">
            <HubExamOrderPublicView examOrder={examOrder} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ValidateExamOrderPage;
