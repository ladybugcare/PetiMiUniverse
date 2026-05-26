import React, { ReactNode } from 'react';
import hubTheme from '../theme/hubTheme';

interface HubLayoutProps {
  /** Texto de contexto (não repetir o nome da página — esse fica no header global). */
  subtitle?: string;
  children: ReactNode;
}

const HubLayout: React.FC<HubLayoutProps> = ({ subtitle, children }) => {
  return (
    <div
      style={{
        backgroundColor: hubTheme.surface.card,
        borderRadius: 12,
        padding: '20px 24px 28px',
        border: `1px solid ${hubTheme.border.subtle}`,
        boxSizing: 'border-box',
      }}
    >
      {subtitle ? (
        <header
          style={{
            borderBottom: `1px solid ${hubTheme.border.default}`,
            paddingBottom: 16,
            marginBottom: 20,
          }}
        >
          <p
            style={{
              color: hubTheme.text.secondary,
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        </header>
      ) : null}
      {children}
    </div>
  );
};

export default HubLayout;
