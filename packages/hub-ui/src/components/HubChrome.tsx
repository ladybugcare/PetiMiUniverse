import React, { ReactNode } from 'react';

interface HubChromeProps {
  children: ReactNode;
}

/** Moldura de conteúdo; o título da página vem do header global do host (hub-web). */
const HubChrome: React.FC<HubChromeProps> = ({ children }) => {
  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
};

export default HubChrome;
