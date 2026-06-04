import React from 'react';

interface HubComingSoonPageProps {
  title: string;
  description?: string;
}

const HubComingSoonPage: React.FC<HubComingSoonPageProps> = ({
  title,
  description = 'Esta área ainda está em construção. Em breve terá as funcionalidades completas.',
}) => {
  return (
    <div className="hub-coming-soon">
      <h2 className="hub-coming-soon__title">{title}</h2>
      <p className="hub-coming-soon__text">{description}</p>
    </div>
  );
};

export default HubComingSoonPage;
