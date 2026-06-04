import React from 'react';
import { HubDateFieldShowcase } from './HubDateFieldShowcase';
import { HubButtonsShowcase } from './HubButtonsShowcase';
import { HubToastShowcase } from './HubToastShowcase';
import './design-system.css';

/**
 * Catálogo visual de componentes Hub (substituto leve de Storybook).
 * Renderize numa rota de desenvolvimento, ex.: `/hub/design-system`.
 */
export const HubDesignSystemShowcase: React.FC = () => {
  return (
    <div className="hub-ds">
      <header className="hub-ds__header">
        <h1 className="hub-ds__title">PetMi Hub — Design System</h1>
        <p className="hub-ds__lead">
          Pré-visualização de componentes reutilizáveis. Tokens em{' '}
          <code>packages/hub-ui/DESIGN.md</code>.
        </p>
      </header>

      <HubButtonsShowcase />
      <HubToastShowcase />
      <HubDateFieldShowcase />
    </div>
  );
};

export default HubDesignSystemShowcase;
