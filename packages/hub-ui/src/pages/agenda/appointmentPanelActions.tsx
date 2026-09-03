import type { ReactNode } from 'react';
import { Copy, Ban, Receipt } from 'lucide-react';
import type { AgendaStatus } from './agendaModel';

export type PanelAction = {
  key: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'menu';
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

import type { OperationalModule } from './walkInUtils';
import { operationalOpenLabel } from './walkInUtils';

export function buildPanelActions(
  status: AgendaStatus,
  canWrite: boolean,
  handlers: {
    onConfirm: () => void;
    onCheckIn: () => void;
    onComplete: () => void;
    onOpenCheckout: () => void;
    onOpenComanda: () => void;
    onViewComanda: () => void;
    onOpenInClinic: () => void;
    onOpenInGrooming: () => void;
    onOpenInBoarding: () => void;
    onDuplicate: () => void;
    onCancel: () => void;
  },
  operationalModule?: OperationalModule | null,
  canOpenComanda?: boolean,
  existingComandaId?: string | null,
  canViewComanda?: boolean,
): { primary: PanelAction | null; comanda: PanelAction | null; utilities: PanelAction[] } {
  const dup: PanelAction = {
    key: 'duplicate',
    label: 'Duplicar',
    variant: 'ghost',
    icon: <Copy size={16} />,
    onClick: handlers.onDuplicate,
    disabled: !canWrite,
  };
  const cancel: PanelAction = {
    key: 'cancel',
    label: 'Cancelar',
    variant: 'ghost',
    icon: <Ban size={16} />,
    onClick: handlers.onCancel,
    disabled: !canWrite,
  };

  const hasOpenComanda = Boolean(existingComandaId);
  const canSeeComanda = hasOpenComanda && (canViewComanda || canOpenComanda);

  const comandaAction: PanelAction | null = canSeeComanda
    ? {
        key: 'view-comanda',
        label: 'Ver comanda',
        variant: 'secondary',
        icon: <Receipt size={16} />,
        onClick: handlers.onViewComanda,
      }
    : canOpenComanda
      ? {
          key: 'open-comanda',
          label: 'Abrir comanda',
          variant: 'secondary',
          icon: <Receipt size={16} />,
          onClick: handlers.onOpenComanda,
        }
      : null;

  /** Cancelar + Duplicar à vista (direita), nunca no menu ⋯. */
  const utilities = (extra: PanelAction[] = []): PanelAction[] => {
    if (!canWrite) return extra;
    return [cancel, dup, ...extra];
  };

  const operationalPrimary: PanelAction | null =
    operationalModule === 'clinical'
      ? { key: 'open-clinic', label: operationalOpenLabel('clinical'), variant: 'primary', onClick: handlers.onOpenInClinic }
      : operationalModule === 'grooming'
        ? { key: 'open-grooming', label: operationalOpenLabel('grooming'), variant: 'primary', onClick: handlers.onOpenInGrooming }
        : operationalModule === 'boarding'
          ? { key: 'open-boarding', label: operationalOpenLabel('boarding'), variant: 'primary', onClick: handlers.onOpenInBoarding }
          : null;

  switch (status) {
    case 'pending_confirm':
      return {
        primary: canWrite
          ? { key: 'confirm', label: 'Confirmar', variant: 'primary', onClick: handlers.onConfirm }
          : null,
        comanda: comandaAction,
        utilities: utilities(),
      };
    case 'confirmed':
      return {
        primary: canWrite
          ? { key: 'checkin', label: 'Check-in', variant: 'primary', onClick: handlers.onCheckIn }
          : null,
        comanda: comandaAction,
        utilities: utilities(),
      };
    case 'checked_in':
      return {
        primary: canWrite && operationalPrimary
          ? operationalPrimary
          : canWrite
            ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
            : null,
        comanda: comandaAction,
        utilities: utilities(),
      };
    case 'in_progress':
      return {
        primary: canWrite && operationalPrimary
          ? { ...operationalPrimary, label: operationalModule === 'clinical' ? 'Continuar atendimento' : operationalPrimary.label }
          : canWrite
            ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
            : null,
        comanda: comandaAction,
        utilities: utilities(),
      };
    case 'done':
      return {
        primary: canSeeComanda
          ? {
              key: 'view-comanda',
              label: 'Ver comanda',
              variant: 'primary',
              icon: <Receipt size={16} />,
              onClick: handlers.onViewComanda,
            }
          : canOpenComanda
            ? {
                key: 'open-comanda',
                label: 'Abrir comanda',
                variant: 'primary',
                icon: <Receipt size={16} />,
                onClick: handlers.onOpenComanda,
              }
            : null,
        comanda: null,
        utilities: canWrite ? [dup] : [],
      };
    case 'paid':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const, icon: undefined } : null,
        comanda: null,
        utilities: [],
      };
    case 'cancelled':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const, icon: undefined } : null,
        comanda: null,
        utilities: [],
      };
    default:
      return { primary: null, comanda: null, utilities: [] };
  }
}

export function appointmentKindLabel(kind: string | undefined): string {
  if (kind === 'hotel_stay') return 'Hotel / hospedagem';
  if (kind === 'daycare_block') return 'Creche';
  if (kind === 'pickup_route') return 'Leva e traz';
  if (kind === 'clinical_walk_in') return 'Encaixe clínico (atendimento imediato)';
  if (kind === 'clinical_emergency') return 'Emergência na agenda';
  if (kind === 'walk_in') return 'Encaixe / walk-in';
  if (kind === 'standard') return 'Agendamento';
  return 'Atendimento';
}

export function displayAppointmentTitle(appt: { serviceName: string; petName: string; title?: string }): string {
  const pet = appt.petName && appt.petName !== '—' ? appt.petName : null;
  const svc = appt.title || appt.serviceName || 'Serviço';
  if (!pet) return svc;
  const petSuffix = ` — ${pet}`;
  if (svc.endsWith(petSuffix)) return svc;
  return `${svc} — ${pet}`;
}

export function formatPanelDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
