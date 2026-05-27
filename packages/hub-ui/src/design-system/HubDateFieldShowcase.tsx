import React, { useState } from 'react';
import { HubDateField } from '../components/HubDateField';

/** Exemplos de {@link HubDateField} para o catálogo do design system. */
export const HubDateFieldShowcase: React.FC = () => {
  const [filled, setFilled] = useState('2026-05-27');
  const [empty, setEmpty] = useState('');

  return (
    <section className="hub-ds__section" aria-labelledby="hub-ds-date-field-title">
      <h2 id="hub-ds-date-field-title" className="hub-ds__section-title">
        HubDateField
      </h2>
      <p className="hub-ds__section-desc">
        Data em formato brasileiro (dd/mm/aaaa). Valor em ISO (<code>YYYY-MM-DD</code>). Calendário
        popover para seleção, botão <strong>Hoje</strong> e digitação manual — paleta Hub (terracota).
      </p>

      <div className="hub-ds__card">
        <div className="hub-ds__grid hub-ds__grid--2">
          <div>
            <p className="hub-ds__example-label">Preenchido</p>
            <HubDateField
              id="hub-ds-date-filled"
              label="Data"
              valueIso={filled}
              onChangeIso={setFilled}
            />
          </div>
          <div>
            <p className="hub-ds__example-label">Vazio</p>
            <HubDateField
              id="hub-ds-date-empty"
              label="Data"
              valueIso={empty}
              onChangeIso={setEmpty}
              hint="Digite ou cole no formato dd/mm/aaaa"
            />
          </div>
        </div>

        <div style={{ marginTop: 24, maxWidth: 280 }}>
          <p className="hub-ds__example-label">Desabilitado</p>
          <HubDateField
            id="hub-ds-date-disabled"
            label="Data"
            valueIso="2026-05-27"
            onChangeIso={() => {}}
            disabled
          />
        </div>

        <div className="hub-ds__code">
          <code>{`<HubDateField
  id="agenda-date"
  label="Data"
  valueIso={dateYmd}
  onChangeIso={setDateYmd}
/>`}</code>
        </div>
      </div>
    </section>
  );
};

export default HubDateFieldShowcase;
