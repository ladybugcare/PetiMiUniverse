import React from 'react';
import { Bell } from 'lucide-react';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const supportImageSrc = `${baseUrl}vet.png`;

/** Card de suporte no rodapé do menu — sem ação por enquanto. */
const HubSidebarSupportCard: React.FC = () => {
  return (
    <div className="hub-sidebar__support" aria-label="Suporte">
      <div className="hub-sidebar__support-body">
        <p className="hub-sidebar__support-title">Precisa de ajuda?</p>
        <p className="hub-sidebar__support-text">Nossa equipe está pronta para te ajudar.</p>
        <span className="hub-sidebar__support-btn" aria-hidden>
          <Bell size={15} strokeWidth={1.75} aria-hidden />
          <span>Abrir atendimento</span>
        </span>
      </div>
      <img
        src={supportImageSrc}
        alt=""
        className="hub-sidebar__support-dog"
        decoding="async"
        aria-hidden
      />
    </div>
  );
};

export default HubSidebarSupportCard;
