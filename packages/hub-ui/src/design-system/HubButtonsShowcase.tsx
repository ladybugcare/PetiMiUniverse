import React from 'react';
import { HubCancelButton } from '../components/HubCancelButton';

export const HubButtonsShowcase: React.FC = () => {
  return (
    <section className="hub-ds__section" aria-labelledby="hub-ds-buttons-title">
      <h2 id="hub-ds-buttons-title" className="hub-ds__section-title">
        Botões
      </h2>
      <p className="hub-ds__section-desc">
        Ações padrão do Hub. O botão <strong>Cancelar</strong> usa ícone X e cor vermelha para sair ou
        descartar um fluxo.
      </p>

      <div className="hub-ds__card">
        <p className="hub-ds__example-label">Cancelar</p>
        <div className="hub-ds__btn-row">
          <HubCancelButton onClick={() => undefined} />
          <HubCancelButton disabled>Cancelar</HubCancelButton>
        </div>
        <pre className="hub-ds__code">
          <code>{`import { HubCancelButton } from '@petimi/hub-ui';

<HubCancelButton onClick={handleCancel} />
<HubCancelButton onClick={handleClose}>Fechar</HubCancelButton>`}</code>
        </pre>
      </div>
    </section>
  );
};

export default HubButtonsShowcase;
