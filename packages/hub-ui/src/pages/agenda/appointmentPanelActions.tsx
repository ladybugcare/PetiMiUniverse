import type { ReactNode } from 'react';
import { Copy, Ban } from 'lucide-react';
import type { AgendaStatus } from './agendaModel';

export type PanelAction = {
  key: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'menu';
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
    onOpenInClinic: () => void;
    onOpenInGrooming: () => void;
    onOpenInBoarding: () => void;
    onDuplicate: () => void;
    onCancel: () => void;
  },
  operationalModule?: OperationalModule | null,
  canOpenComanda?: boolean,
): { primary: PanelAction | null; secondary: PanelAction | null; menu: PanelAction[] } {
  const dup: PanelAction = {
    key: 'duplicate',
    label: 'Duplicar',
    variant: 'menu',
    icon: <Copy size={14} />,
    onClick: handlers.onDuplicate,
    disabled: !canWrite,
  };
  const cancel: PanelAction = {
    key: 'cancel',
    label: 'Cancelar',
    variant: 'menu',
    icon: <Ban size={14} />,
    onClick: handlers.onCancel,
    disabled: !canWrite,
  };
  const openComandaAction: PanelAction | null = canOpenComanda
    ? {
        key: 'open-comanda',
        label: 'Abrir comanda (antecipado)',
        variant: 'menu',
        onClick: handlers.onOpenComanda,
      }
    : null;

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
        secondary: null,
        menu: [dup, cancel, ...(openComandaAction ? [openComandaAction] : [])],
      };
    case 'confirmed':
      return {
        primary: canWrite
          ? { key: 'checkin', label: 'Check-in', variant: 'primary', onClick: handlers.onCheckIn }
          : null,
        secondary: canWrite ? dup : null,
        menu: [cancel, ...(openComandaAction ? [openComandaAction] : [])],
      };
    case 'checked_in':
      return {
        primary: canWrite && operationalPrimary
          ? operationalPrimary
          : canWrite
            ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
            : null,
        secondary: null,
        menu: [cancel, ...(openComandaAction ? [openComandaAction] : [])],
      };
    case 'in_progress':
      return {
        primary: canWrite && operationalPrimary
          ? { ...operationalPrimary, label: operationalModule === 'clinical' ? 'Continuar atendimento' : operationalPrimary.label }
          : canWrite
            ? { key: 'complete', label: 'Concluir', variant: 'primary', onClick: handlers.onComplete }
            : null,
        secondary: null,
        menu: [cancel, ...(openComandaAction ? [openComandaAction] : [])],
      };
    case 'done':
      return {
        primary: canOpenComanda
          ? { key: 'open-comanda', label: 'Abrir comanda', variant: 'primary', onClick: handlers.onOpenComanda }
          : canWrite
            ? dup
            : null,
        secondary: canWrite && canOpenComanda ? dup : null,
        menu: [],
      };
    case 'paid':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const } : null,
        secondary: null,
        menu: [],
      };
    case 'cancelled':
      return {
        primary: canWrite ? { ...dup, variant: 'primary' as const } : null,
        secondary: null,
        menu: [],
      };
    default:
      return { primary: null, secondary: null, menu: [] };
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
