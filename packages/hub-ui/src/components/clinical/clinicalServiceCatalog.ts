import {
  normalizeServiceGroupSlug,
  type OperationalClinicalServiceGroup,
} from '../../utils/serviceTypeSlug';

/** Filtra serviços ativos (não-addon) de um grupo clínico operacional. */
export function filterServicesByClinicalGroup<
  T extends { active?: boolean | null; service_group?: string | null; is_addon?: boolean | null },
>(services: T[], group: OperationalClinicalServiceGroup): T[] {
  return services.filter(
    (s) => s.active !== false && !s.is_addon && normalizeServiceGroupSlug(s.service_group ?? '') === group,
  );
}

export function formatServicePriceLabel(saleAmount: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(saleAmount ?? 0),
  );
}
