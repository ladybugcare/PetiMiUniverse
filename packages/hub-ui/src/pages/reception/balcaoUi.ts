import type { ReceptionBoardItem, ReceptionResolveAction } from '../../api/hubReceptionApi';
import { modalityLabel, sectorLabel } from './balcaoBoard';

export function waitLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h} h`;
}

export function formatTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatBrl(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function kindLabel(item: ReceptionBoardItem): string {
  if (item.status === 'cancelled') return 'Cancelada';
  if (item.status === 'done') return 'Concluída';
  if (item.kind === 'chegada') return 'Chegada';
  if (item.kind === 'no_consultorio') return 'No setor';
  if (item.kind === 'autorizar_extra') return 'Extra';
  if (item.kind === 'encaminhar') return 'Encaminhar';
  if (item.kind === 'embarque') return 'Embarque';
  if (item.kind === 'lt_falha') return 'Falha L&T';
  if (item.kind === 'saida_prevista') {
    return item.context?.preparing ? 'Preparando' : 'Prevista';
  }
  return 'Retirada';
}

export function serviceLabel(item: ReceptionBoardItem): string {
  const label = item.context?.label?.trim();
  if (label) return label;
  return sectorLabel(item);
}

export function pillClass(item: ReceptionBoardItem): string {
  if (item.status === 'done') return 'hub-clientes__pill hub-clinic-queue__pill--done';
  if (item.status === 'cancelled') return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
  if (item.kind === 'lt_falha') return 'hub-clientes__pill hub-reception__pill--failure';
  if (item.kind === 'no_consultorio') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  if (item.kind === 'autorizar_extra' || item.kind === 'encaminhar' || item.kind === 'saida_prevista') {
    return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
  }
  if (item.kind === 'retirada_balcao' || item.kind === 'embarque') {
    return 'hub-clientes__pill hub-clinic-queue__pill--progress';
  }
  return 'hub-clientes__pill hub-clinic-queue__pill--waiting';
}

export function primaryAction(item: ReceptionBoardItem): { action: ReceptionResolveAction; label: string } | null {
  if (item.status !== 'open') return null;
  if (item.kind === 'no_consultorio' || item.kind === 'saida_prevista') return null;
  if (item.kind === 'chegada') return { action: 'chegou', label: 'Chegou' };
  if (item.kind === 'retirada_balcao') return { action: 'entreguei', label: 'Entreguei' };
  if (item.kind === 'embarque') return { action: 'embarquei', label: 'Entreguei ao motorista' };
  if (item.kind === 'autorizar_extra' && item.context?.hub_service_type_id) {
    return { action: 'autorizar', label: 'Autorizar' };
  }
  return null;
}

export function isAttentionBlocking(item: ReceptionBoardItem): boolean {
  return item.kind === 'lt_falha';
}

export function custodyMetaParts(item: ReceptionBoardItem): string[] {
  const parts: string[] = [];
  const sector = sectorLabel(item);
  const service = serviceLabel(item);
  if (service && service !== sector) parts.push(service);
  else if (sector) parts.push(sector);

  const modality = modalityLabel(item);
  if (modality) parts.push(modality);

  const planned = formatTime(item.context?.starts_at);
  if (item.kind === 'chegada' && planned) parts.push(planned);
  if (item.kind === 'saida_prevista' && planned) parts.push(`saída ${planned}`);

  const ready = formatTime(item.context?.ready_at);
  if ((item.kind === 'retirada_balcao' || item.kind === 'embarque') && ready) {
    parts.push(`pronto ${ready}`);
  }

  if (item.status === 'open' && item.kind !== 'saida_prevista' && item.kind !== 'no_consultorio') {
    const wait = waitLabel(item.opened_at);
    if (wait) parts.push(wait);
  }

  return parts;
}

export function scheduleDestinationPath(
  item: ReceptionBoardItem,
  day: string,
): {
  pathname: string;
  search: string;
  state: {
    walkInInitial: {
      date: string;
      pet_id: string | null;
      pet_name: string | null;
      guardian_id: string | null;
      guardian_name: string | null;
    };
  };
} {
  const params = new URLSearchParams({
    openWalkIn: '1',
    date: day,
  });
  if (item.pet.id) params.set('petId', item.pet.id);
  if (item.pet.name?.trim()) params.set('petName', item.pet.name.trim());
  if (item.guardian?.id) params.set('guardianId', item.guardian.id);
  if (item.guardian?.full_name?.trim()) params.set('guardianName', item.guardian.full_name.trim());
  return {
    pathname: '/hub/appointments',
    search: `?${params.toString()}`,
    state: {
      walkInInitial: {
        date: day,
        pet_id: item.pet.id,
        pet_name: item.pet.name,
        guardian_id: item.guardian?.id ?? null,
        guardian_name: item.guardian?.full_name ?? null,
      },
    },
  };
}

export function walkInPath(day: string): {
  pathname: string;
  search: string;
  state: { walkInInitial: { date: string; pet_id: null; pet_name: null; guardian_id: null; guardian_name: null } };
} {
  const params = new URLSearchParams({ openWalkIn: '1', date: day });
  return {
    pathname: '/hub/appointments',
    search: `?${params.toString()}`,
    state: {
      walkInInitial: {
        date: day,
        pet_id: null,
        pet_name: null,
        guardian_id: null,
        guardian_name: null,
      },
    },
  };
}
