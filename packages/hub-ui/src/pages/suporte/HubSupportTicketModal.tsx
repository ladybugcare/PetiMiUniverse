import { useEffect, useState, type ReactNode } from 'react';
import { CreditCard, HelpCircle, UserCog, Wrench } from 'lucide-react';
import { getStoredClinicId, useAuth } from '@petimi/web-core';
import { HubModal } from '../../components/HubModal';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  hubSupportTicketsApi,
  notifyHubSupportTicketsUpdated,
  type HubSupportTicket,
  type HubSupportTicketCategory,
  type HubSupportTicketPriority,
} from '../../api/hubSupportTicketsApi';
import { HUB_SUPPORT_CATEGORY_LABELS, HUB_SUPPORT_PRIORITY_LABELS } from './hubSupportLabels';
import '../clientes/clientes.css';
import './hub-support.css';

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;

const CATEGORY_ICONS: Record<HubSupportTicketCategory, ReactNode> = {
  técnico: <Wrench size={16} strokeWidth={1.75} />,
  financeiro: <CreditCard size={16} strokeWidth={1.75} />,
  conta_perfil: <UserCog size={16} strokeWidth={1.75} />,
  outro: <HelpCircle size={16} strokeWidth={1.75} />,
};

const CATEGORY_OPTIONS: HubComboboxOption[] = (
  Object.keys(HUB_SUPPORT_CATEGORY_LABELS) as HubSupportTicketCategory[]
).map((key) => ({ value: key, label: HUB_SUPPORT_CATEGORY_LABELS[key], icon: CATEGORY_ICONS[key] }));

const PRIORITY_OPTIONS: HubComboboxOption[] = (
  Object.keys(HUB_SUPPORT_PRIORITY_LABELS) as HubSupportTicketPriority[]
).map((key) => ({
  value: key,
  label: HUB_SUPPORT_PRIORITY_LABELS[key],
  icon: <span className={`hub-support-form__priority-dot hub-support-form__priority-dot--${key}`} aria-hidden />,
}));

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (ticket: HubSupportTicket) => void;
};

export function HubSupportTicketModal({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const userId = (user as { id?: string } | null)?.id;

  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<HubSupportTicketCategory>('técnico');
  const [priority, setPriority] = useState<HubSupportTicketPriority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) return;
    setMessage('');
    setCategory('técnico');
    setPriority('normal');
    setError('');
  }, [open]);

  const trimmed = message.trim();
  const canSubmit = Boolean(userId) && trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (!userId || !canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const ticket = await hubSupportTicketsApi.create({
        user_id: userId,
        clinic_id: getStoredClinicId(),
        message: trimmed,
        category,
        priority,
      });
      notifyHubSupportTicketsUpdated();
      onCreated?.(ticket);
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Não foi possível enviar o ticket. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HubModal
      open={open}
      onClose={handleClose}
      title="Falar com o suporte PetMi"
      subtitle="Conte o que aconteceu. A equipe PetMi responde por aqui e você recebe uma notificação."
      footer={
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={submitting}
            onClick={handleClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Enviando…' : 'Enviar ticket'}
          </button>
        </>
      }
    >
      <div className="hub-support-form">
        <div className="hub-clientes__row2">
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="hub-support-category">
              Assunto
            </label>
            <HubSearchableCombobox
              id="hub-support-category"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => v && setCategory(v as HubSupportTicketCategory)}
              searchPlaceholder="Buscar assunto…"
              ariaLabel="Assunto do ticket"
              clearable={false}
              disabled={submitting}
            />
          </div>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="hub-support-priority">
              Prioridade
            </label>
            <HubSearchableCombobox
              id="hub-support-priority"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(v) => v && setPriority(v as HubSupportTicketPriority)}
              searchPlaceholder="Buscar prioridade…"
              ariaLabel="Prioridade do ticket"
              clearable={false}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="hub-support-message">
            Mensagem
          </label>
          <textarea
            id="hub-support-message"
            className="hub-clientes__textarea hub-support-form__textarea"
            rows={6}
            maxLength={MAX_LENGTH}
            value={message}
            disabled={submitting}
            placeholder="Ex.: ao finalizar a comanda no caixa, aparece um erro e o pagamento não é registrado."
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="hub-support-form__counter">
            {trimmed.length < MIN_LENGTH
              ? `Mínimo de ${MIN_LENGTH} caracteres`
              : `${trimmed.length}/${MAX_LENGTH} caracteres`}
          </p>
        </div>

        {error && (
          <p className="hub-support-form__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </HubModal>
  );
}
