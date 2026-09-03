import React from 'react';
import { Inbox } from 'lucide-react';

type HubRelatoriosEmptyProps = {
  title?: string;
  description?: string;
};

export const HubRelatoriosEmpty: React.FC<HubRelatoriosEmptyProps> = ({
  title = 'Nada para mostrar',
  description = 'Não há registros para o período e filtros selecionados.',
}) => (
  <div className="hub-relatorios__empty" role="status">
    <span className="hub-relatorios__empty-icon" aria-hidden>
      <Inbox size={28} strokeWidth={1.75} />
    </span>
    <p className="hub-relatorios__empty-title">{title}</p>
    <p className="hub-relatorios__empty-desc">{description}</p>
  </div>
);

export default HubRelatoriosEmpty;
