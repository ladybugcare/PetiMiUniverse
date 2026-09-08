import React, { useState } from 'react';
import { HubTimeField } from '../components/HubTimeField';

/** Exemplos de {@link HubTimeField} para o catálogo do design system. */
export const HubTimeFieldShowcase: React.FC = () => {
  const [filled, setFilled] = useState('16:24');
  const [empty, setEmpty] = useState('');

  return (
    <section className="hub-ds__section" aria-labelledby="hub-ds-time-field-title">
      <h2 id="hub-ds-time-field-title" className="hub-ds__section-title">
        HubTimeField
      </h2>
      <p className="hub-ds__section-desc">
        Horário em <code>HH:mm</code>. Seletor em duas colunas (hora / minuto), digitação manual e
        placeholder <code>--:--</code> — mesma família visual do <code>HubDateField</code>.
      </p>

      <div className="hub-ds__card">
        <div className="hub-ds__grid hub-ds__grid--2">
          <div>
            <p className="hub-ds__example-label">Preenchido</p>
            <HubTimeField
              id="hub-ds-time-filled"
              label="Horário"
              valueHm={filled}
              onChangeHm={setFilled}
            />
          </div>
          <div>
            <p className="hub-ds__example-label">Vazio</p>
            <HubTimeField
              id="hub-ds-time-empty"
              label="Horário"
              valueHm={empty}
              onChangeHm={setEmpty}
              showNowButton
            />
          </div>
        </div>

        <div className="hub-ds__code" style={{ marginTop: 24 }}>
          <code>{`<HubTimeField
  id="surgery-time"
  label="Horário *"
  valueHm={scheduledTime}
  onChangeHm={setScheduledTime}
  required
/>`}</code>
        </div>
      </div>
    </section>
  );
};

export default HubTimeFieldShowcase;
