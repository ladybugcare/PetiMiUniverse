import React, { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HubSupportTicketModal } from '@petimi/hub-ui';
import { useHubSupportUnread } from '../hooks/useHubSupportUnread';

/** Atalho do cabeçalho: com respostas não lidas vai para os tickets; sem, abre um novo ticket. */
const HubSupportButton: React.FC = () => {
  const navigate = useNavigate();
  const unread = useHubSupportUnread();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (unread > 0) navigate('/hub/suporte');
    else setModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="hub-notify__bell"
        onClick={handleClick}
        aria-label={unread > 0 ? `Suporte: ${unread} resposta(s) não lida(s)` : 'Falar com o suporte'}
        title={unread > 0 ? 'Ver respostas do suporte' : 'Falar com o suporte PetMi'}
      >
        <LifeBuoy size={20} strokeWidth={1.75} />
        {unread > 0 && <span className="hub-notify__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <HubSupportTicketModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(ticket) => navigate(`/hub/suporte?ticket=${encodeURIComponent(ticket.id)}`)}
      />
    </>
  );
};

export default HubSupportButton;
