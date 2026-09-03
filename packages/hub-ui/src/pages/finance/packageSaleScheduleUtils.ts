import type { NavigateFunction } from 'react-router-dom';
import type { HubPackageItem } from '../../api/hubPackagesApi';
import type { NewAppointmentInitial } from '../agenda/NewAppointmentModal';

export type PackageSaleLineContext = {
  petId: string;
  petName: string;
  packageId: string;
  packageName: string;
  packageItems: HubPackageItem[];
};

export type PackageSaleScheduleContext = {
  guardianId: string;
  guardianName: string;
  lines: PackageSaleLineContext[];
  comandaId: string;
  totalAmount: number;
};

export function schedulePetLabel(ctx: PackageSaleScheduleContext): string {
  const petIds = [...new Set(ctx.lines.map((ln) => ln.petId))];
  const petNamesById = Object.fromEntries(ctx.lines.map((ln) => [ln.petId, ln.petName]));
  if (petIds.length === 0) return 'os pets';
  if (petIds.length === 1) return petNamesById[petIds[0]!] ?? 'o pet';
  if (petIds.length === 2) {
    return `${petNamesById[petIds[0]!] ?? 'pet'} e ${petNamesById[petIds[1]!] ?? 'pet'}`;
  }
  const names = petIds.map((id) => petNamesById[id] ?? 'pet');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function packageSaleSummaryLabel(ctx: PackageSaleScheduleContext): string {
  if (ctx.lines.length === 0) return 'Venda de pacotes';
  if (ctx.lines.length === 1) return ctx.lines[0]!.packageName;
  const uniquePackages = [...new Set(ctx.lines.map((ln) => ln.packageName))];
  if (uniquePackages.length === 1) return uniquePackages[0]!;
  return `${ctx.lines.length} pacotes`;
}

export function primaryServicesFromPackageItems(items: HubPackageItem[]) {
  const main = items.filter((it) => !it.is_addon);
  const source = main.length ? main : items;
  return source.map((it) => ({
    hub_service_type_id: it.hub_service_type_id,
    name: it.service_name ?? 'Serviço',
    duration_minutes: 60,
    pricing_variant: it.pricing_variant ?? null,
  }));
}

/** Sessões principais do pacote (máximo entre itens não-addon; fallback sessions nos itens). */
export function primaryPackageSessionCount(items: HubPackageItem[]): number {
  const main = items.filter((it) => !it.is_addon);
  const source = main.length ? main : items;
  const maxQty = source.reduce((m, it) => Math.max(m, Number(it.quantity) || 0), 0);
  return Math.max(1, maxQty);
}

export function buildNewAppointmentInitialFromPackageSale(
  line: PackageSaleLineContext,
  ctx: PackageSaleScheduleContext,
  dateYmd: string,
): NewAppointmentInitial {
  const services = primaryServicesFromPackageItems(line.packageItems);
  const sessions = primaryPackageSessionCount(line.packageItems);
  const remainingLines = ctx.lines.slice(1);
  const otherSummary = remainingLines
    .map((ln) => `${ln.petName} (${ln.packageName})`)
    .join(', ');

  return {
    date: dateYmd,
    guardian_id: ctx.guardianId,
    guardian_name: ctx.guardianName,
    pet_id: line.petId,
    pet_name: line.petName,
    services,
    title: `Pacote — ${line.packageName}`,
    notes:
      remainingLines.length > 0
        ? `Pacote vendido na comanda. Agende também: ${otherSummary}.`
        : `Pacote vendido na comanda #${ctx.comandaId.slice(0, 8).toUpperCase()}.`,
    financial_notes: `Origem: venda de pacote (${line.packageName})`,
    suggest_recurrence:
      sessions >= 2
        ? { occurrences: sessions, kind: 'weekly', interval_value: 1 }
        : null,
    package_balance_hint:
      sessions >= 2
        ? `Pacote «${line.packageName}»: ${sessions} sessões — a repetição já veio com ${sessions} ocorrências. Ajuste a frequência se precisar.`
        : `Pacote «${line.packageName}»: 1 sessão restante.`,
  };
}

export type PackageSaleAgendaNavigationState = {
  packageSaleSchedule: {
    initial: NewAppointmentInitial;
    remainingLines: PackageSaleLineContext[];
    packageName: string;
  };
};

export function navigateToAgendaFromPackageSale(
  navigate: NavigateFunction,
  ctx: PackageSaleScheduleContext,
  dateYmd?: string,
) {
  const firstLine = ctx.lines[0];
  if (!firstLine) return;
  const today = dateYmd ?? new Date().toISOString().slice(0, 10);
  const state: PackageSaleAgendaNavigationState = {
    packageSaleSchedule: {
      initial: buildNewAppointmentInitialFromPackageSale(firstLine, ctx, today),
      remainingLines: ctx.lines.slice(1),
      packageName: packageSaleSummaryLabel(ctx),
    },
  };
  navigate('/hub/appointments', { state });
}
