import React, { useMemo, useRef, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import './equipe-drawer.css';

export type StaffInviteShareResult = {
  invitation_url: string;
  share_message: string;
  email: string;
  expires_at?: string;
};

type Props = {
  result: StaffInviteShareResult;
  whatsappPhone?: string | null;
  onDone: () => void;
};

const HubStaffInviteSharePanel: React.FC<Props> = ({ result, whatsappPhone, onDone }) => {
  const { showSuccess, showError } = useAlert();
  const [linkCopied, setLinkCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expiresLabel = useMemo(() => {
    if (!result.expires_at) return '7 dias';
    try {
      return new Date(result.expires_at).toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '7 dias';
    }
  }, [result.expires_at]);

  const whatsappHref = useMemo(
    () => buildWhatsappLink(whatsappPhone, result.share_message),
    [whatsappPhone, result.share_message],
  );

  const copy = async (text: string, kind: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (kind === 'link') {
        setLinkCopied(true);
        setMessageCopied(false);
      } else {
        setMessageCopied(true);
        setLinkCopied(false);
      }
      timerRef.current = setTimeout(() => {
        setLinkCopied(false);
        setMessageCopied(false);
      }, 2500);
      showSuccess(kind === 'link' ? 'Link copiado' : 'Mensagem copiada');
    } catch {
      showError('Não foi possível copiar');
    }
  };

  return (
    <div className="hub-equipe-drawer__share">
      <p className="hub-equipe-drawer__share-lead">
        Convite criado para <strong>{result.email}</strong>. Compartilhe o link com o profissional (válido até{' '}
        {expiresLabel}).
      </p>

      <div className="hub-equipe-drawer__share-url">
        <code>{result.invitation_url}</code>
      </div>

      <div className="hub-equipe-drawer__share-actions">
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--outline"
          onClick={() => void copy(result.invitation_url, 'link')}
        >
          {linkCopied ? <Check size={16} /> : <Copy size={16} />}
          Copiar link
        </button>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--outline"
          onClick={() => void copy(result.share_message, 'message')}
        >
          {messageCopied ? <Check size={16} /> : <Copy size={16} />}
          Copiar mensagem
        </button>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hub-clientes__btn hub-clientes__btn--primary hub-equipe-drawer__wa-btn"
          >
            <MessageCircle size={16} />
            Enviar no WhatsApp
          </a>
        ) : (
          <p className="hub-clientes__muted hub-equipe-drawer__wa-hint">
            Cadastre o WhatsApp do profissional para abrir o envio direto, ou copie a mensagem e envie manualmente.
          </p>
        )}
      </div>

      <div className="hub-equipe-drawer__share-footer">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onDone}>
          Concluir
        </button>
      </div>
    </div>
  );
};

export default HubStaffInviteSharePanel;
