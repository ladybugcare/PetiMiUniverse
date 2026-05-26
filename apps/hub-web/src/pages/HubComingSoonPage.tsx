import React from 'react';

interface HubComingSoonPageProps {
  title: string;
  description?: string;
}

const HubComingSoonPage: React.FC<HubComingSoonPageProps> = ({
  title: _title,
  description = 'Esta área ainda está em construção. Em breve terá as funcionalidades completas.',
}) => {
  return (
    <div className="hub-coming-soon">
      <p className="hub-coming-soon__text">{description}</p>
    </div>
  );
};

export default HubComingSoonPage;
