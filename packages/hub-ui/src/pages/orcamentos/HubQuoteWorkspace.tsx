import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Copy,
  Eye,
  MessageSquare,
  Dog,
  Save,
  Search,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import {
  hubQuotesApi,
  type HubQuote,
  type HubQuoteDiscountKind,
  type HubQuoteLine,
  type HubQuoteLineInput,
  type HubQuotePet,
  type HubQuotePetInput,
  type HubQuotePricingVariant,
} from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import { COAT_TYPE_LABELS, COAT_TYPE_VALUES, coercePricingMatrixFromApi, type HubServicePricingMatrix } from '../../utils/hubServiceTypesPricingMatrix';
import { useAlert } from '../../components/AlertProvider';
import { mergeBreedComboboxOptions, mergeSpeciesComboboxOptions } from '../pets/wizard/petSpeciesComboboxData';
import { wizardBreedOptionsForSpecies } from '../pets/wizard/petSpeciesBreedOptions';
import { defaultBodyPorteForBreed } from '../../data/breedDefaultSizeTier';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { DiscountControl, resolveDiscountAmount, type DiscountKind } from '../../components/billing/DiscountControl';
import { FinancialSummaryCard } from '../../components/billing/FinancialSummaryCard';

const SIZE_TIERS = [
  { value: 'mini', label: 'Mini' },
  { value: 'pequeno', label: 'Pequeno' },
  { value: 'medio', label: 'Médio' },
  { value: 'grande', label: 'Grande' },
  { value: 'gigante', label: 'Gigante' },
] as const;

const SIZE_TIER_COMBO_OPTIONS: HubComboboxOption[] = SIZE_TIERS.map((t) => ({
  value: t.value,
  label: t.label,
}));

const COAT_COMBO_OPTIONS: HubComboboxOption[] = [
  { value: '', label: '—' },
  ...COAT_TYPE_VALUES.map((c) => ({ value: c, label: COAT_TYPE_LABELS[c] })),
];

const PERIOD_LABELS: Record<'full_day' | 'half_day', string> = {
  full_day: 'Dia completo',
  half_day: 'Meio período',
};

const CONSULT_LABELS: Record<'padrao' | 'retorno', string> = {
  padrao: 'Consulta padrão',
  retorno: 'Retorno',
};

function needsMatrixVariantChoice(matrix: HubServicePricingMatrix | null): boolean {
  if (!matrix) return false;
  return (
    matrix.kind === 'periodo' ||
    matrix.kind === 'consulta' ||
    matrix.kind === 'km_banda' ||
    matrix.kind === 'personalizado'
  );
}

function defaultPricingVariant(matrix: HubServicePricingMatrix): HubQuotePricingVariant {
  if (matrix.kind === 'periodo') return { period: matrix.tiers[0]!.period };
  if (matrix.kind === 'consulta') {
    const t = matrix.tiers.find((x) => x.consult_type === 'padrao') ?? matrix.tiers[0];
    return { consult_type: t!.consult_type };
  }
  if (matrix.kind === 'km_banda') return { km_tier_index: 0 };
  if (matrix.kind === 'personalizado') return { custom_tier_index: 0 };
  return {};
}

function inferPricingVariantFromUnitPrice(
  matrix: HubServicePricingMatrix,
  unitPrice: number,
): HubQuotePricingVariant | null {
  const target = round2(unitPrice);
  if (matrix.kind === 'periodo') {
    const hits = matrix.tiers.filter((t) => round2(t.sale_amount) === target);
    if (hits.length === 1) return { period: hits[0].period };
  }
  if (matrix.kind === 'consulta') {
    const hits = matrix.tiers.filter((t) => round2(t.sale_amount) === target);
    if (hits.length === 1) return { consult_type: hits[0].consult_type };
  }
  if (matrix.kind === 'km_banda') {
    const hits = matrix.tiers.map((t, i) => ({ i, t })).filter(({ t }) => round2(t.sale_amount) === target);
    if (hits.length === 1) return { km_tier_index: hits[0].i };
  }
  if (matrix.kind === 'personalizado') {
    const hits = matrix.tiers.map((t, i) => ({ i, t })).filter(({ t }) => round2(t.sale_amount) === target);
    if (hits.length === 1) return { custom_tier_index: hits[0].i };
  }
  return null;
}

function linePricingVariantFromQuote(l: HubQuoteLine, serviceTypes: HubServiceType[]): HubQuotePricingVariant | null {
  const st = l.hub_service_type_id ? serviceTypes.find((s) => s.id === l.hub_service_type_id) : undefined;
  const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
  if (!matrix || !needsMatrixVariantChoice(matrix)) return null;
  const fromDb = l.pricing_variant;
  if (
    fromDb &&
    (fromDb.period || fromDb.consult_type || fromDb.km_tier_index != null || fromDb.custom_tier_index != null)
  )
    return fromDb;
  const firstLp = [...(l.line_pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  const price = Number(firstLp?.unit_price ?? l.unit_price ?? 0);
  return inferPricingVariantFromUnitPrice(matrix, price) ?? defaultPricingVariant(matrix);
}

function fmtBrlShort(n: number): string {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatYmdBr(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function variantComboboxOptions(matrix: HubServicePricingMatrix): HubComboboxOption[] {
  if (matrix.kind === 'periodo') {
    return matrix.tiers.map((t) => ({
      value: `period:${t.period}`,
      label: `${PERIOD_LABELS[t.period]} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'consulta') {
    return matrix.tiers.map((t) => ({
      value: `consult:${t.consult_type}`,
      label: `${CONSULT_LABELS[t.consult_type]} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'km_banda') {
    return matrix.tiers.map((t, i) => ({
      value: `km:${i}`,
      label: `${(t.label || `Faixa ${i + 1}`).trim()} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  if (matrix.kind === 'personalizado') {
    return matrix.tiers.map((t, i) => ({
      value: `custom:${i}`,
      label: `${(t.label || `Opção ${i + 1}`).trim()} — R$ ${fmtBrlShort(t.sale_amount)}`,
    }));
  }
  return [];
}

function variantToComboValue(matrix: HubServicePricingMatrix, v: HubQuotePricingVariant | null): string {
  if (!v) return '';
  if (matrix.kind === 'periodo' && v.period) return `period:${v.period}`;
  if (matrix.kind === 'consulta' && v.consult_type) return `consult:${v.consult_type}`;
  if (matrix.kind === 'km_banda' && typeof v.km_tier_index === 'number') return `km:${v.km_tier_index}`;
  if (matrix.kind === 'personalizado' && typeof v.custom_tier_index === 'number')
    return `custom:${v.custom_tier_index}`;
  return '';
}

function comboValueToVariant(matrix: HubServicePricingMatrix, raw: string): HubQuotePricingVariant | null {
  const [k, val] = raw.split(':');
  if (matrix.kind === 'periodo' && k === 'period' && (val === 'full_day' || val === 'half_day')) {
    return { period: val };
  }
  if (matrix.kind === 'consulta' && k === 'consult' && (val === 'padrao' || val === 'retorno')) {
    return { consult_type: val };
  }
  if (matrix.kind === 'km_banda' && k === 'km') {
    const i = Number.parseInt(val, 10);
    if (Number.isInteger(i) && i >= 0 && i < matrix.tiers.length) return { km_tier_index: i };
  }
  if (matrix.kind === 'personalizado' && k === 'custom') {
    const i = Number.parseInt(val, 10);
    if (Number.isInteger(i) && i >= 0 && i < matrix.tiers.length) return { custom_tier_index: i };
  }
  return null;
}

/** Linha de pet no orçamento (espelha `HubQuotePetInput`). */
export type QuotePetRow = HubQuotePetInput;

function canonicalSpecies(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Cão';
  const low = t.toLowerCase();
  if (low === 'cão' || low === 'cao') return 'Cão';
  if (low === 'gato') return 'Gato';
  return t;
}

function fromApiQuotePet(p: HubQuotePet): QuotePetRow {
  const br = (p.breed || '').trim();
  const treatAsSrd = !br || /^srd$/i.test(br);
  return {
    display_name: p.display_name,
    species: canonicalSpecies(p.species),
    breed: treatAsSrd ? '' : p.breed,
    size_tier: p.size_tier,
    coat_type: p.coat_type,
  };
}

function emptyPet(): QuotePetRow {
  return {
    display_name: '',
    species: 'Cão',
    breed: '',
    size_tier: 'medio',
    coat_type: null,
  };
}

function parseMoney(s: string): number {
  const n = Number.parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function taxDigitsOk(s: string): boolean {
  const d = s.replace(/\D/g, '');
  return d.length === 11 || d.length === 14;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/** Valida rascunho antes de POST/PATCH (alinha com regras do backend). */
function validateWorkspaceDraft(opts: {
  createContext: HubQuoteCreateContext | null;
  persistedQuoteId: string | null;
  pets: QuotePetRow[];
  lines: LineDraft[];
  subtotal: number;
}): string | null {
  const { createContext, persistedQuoteId, pets, lines, subtotal } = opts;
  const editing = Boolean(persistedQuoteId);

  if (!editing) {
    if (!createContext) {
      return 'Preencha nome, telefone e CPF/CNPJ (11 ou 14 dígitos) do contato antes de salvar o rascunho.';
    }
    if (createContext.kind === 'inline_prospect') {
      const pr = createContext.prospect;
      if (!pr.full_name.trim()) return 'Informe o nome do contato.';
      if (!pr.phone.trim()) return 'Informe o telefone do contato.';
      if (!taxDigitsOk(pr.tax_id ?? '')) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para o contato.';
    }
  }

  if (pets.length < 1) return 'Inclua pelo menos um pet no orçamento.';
  for (let i = 0; i < pets.length; i++) {
    if (!pets[i]?.species?.trim()) return `Pet ${i + 1}: selecione a espécie.`;
  }

  const hasService = lines.some((l) => {
    const id = l.hub_service_type_id.trim();
    return id.length > 0 && isUuid(id);
  });
  if (!hasService) return 'Adicione pelo menos uma linha de serviço e escolha o tipo de serviço.';

  if (subtotal <= 0) return 'Informe valores (R$) superiores a zero para os serviços por pet.';

  return null;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function endOfLocalDayIso(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export type HubQuoteCreateContext =
  | { kind: 'prospect_id'; prospect_id: string }
  | {
      kind: 'inline_prospect';
      prospect: { full_name: string; tax_id: string; phone: string; email?: string | null };
    };

type LineDraft = {
  key: string;
  hub_service_type_id: string;
  description: string;
  unitPricesByPetIndex: string[];
  /** Período, tipo de consulta ou faixa km (matrizes não banho/hotel). */
  pricing_variant: HubQuotePricingVariant | null;
};

function newLineDraft(petCount: number): LineDraft {
  return {
    key: `ln-${Math.random().toString(36).slice(2)}`,
    hub_service_type_id: '',
    description: '',
    unitPricesByPetIndex: Array.from({ length: petCount }, () => '0'),
    pricing_variant: null,
  };
}

function formatDurationMin(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  if (rem === 0) return `${h} h`;
  return `${h} h ${rem} min`;
}

/** Serviço disponível para orçamento: ativo e não arquivado (`deleted_at`). */
function isQuotableServiceType(st: HubServiceType): boolean {
  if (st.is_addon) return false;
  if (st.deleted_at) return false;
  if (st.active === false) return false;
  return true;
}

function groupServiceTypes(serviceTypes: HubServiceType[]): Map<string, HubServiceType[]> {
  const m = new Map<string, HubServiceType[]>();
  for (const st of serviceTypes) {
    if (!isQuotableServiceType(st)) continue;
    const g = st.service_group || 'outros';
    const arr = m.get(g) ?? [];
    arr.push(st);
    m.set(g, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  return m;
}

export interface HubQuoteWorkspaceProps {
  clinicId: string;
  canWrite: boolean;
  /** Rascunho existente (edição); `null` = fluxo novo na mesma tela */
  quote: HubQuote | null;
  /** Id persistido (pai pode controlar após primeiro POST) */
  persistedQuoteId: string | null;
  onPersistedQuoteId: (id: string) => void;
  onQuoteUpdated: (q: HubQuote) => void;
  serviceTypes: HubServiceType[];
  /** Obrigatório quando `persistedQuoteId` é null */
  createContext: HubQuoteCreateContext | null;
  /** No detalhe (rascunho): envio fica no header; esconder “Gerar e enviar” duplicado. */
  hideGenerateAndSend?: boolean;
}

const HubQuoteWorkspace: React.FC<HubQuoteWorkspaceProps> = ({
  clinicId,
  canWrite,
  quote,
  persistedQuoteId,
  onPersistedQuoteId,
  onQuoteUpdated,
  serviceTypes,
  createContext,
  hideGenerateAndSend = false,
}) => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();

  const [pets, setPets] = useState<QuotePetRow[]>(() => {
    if (!quote?.pets?.length) return [emptyPet()];
    return [...quote.pets]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(fromApiQuotePet);
  });

  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (!quote?.lines?.length) return [];
    const orderedPets = [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const petIds = orderedPets.map((p) => p.id);
    const n = Math.max(orderedPets.length, 1);
    return [...quote.lines]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => {
        const prices = Array.from({ length: n }, () => '0');
        (l.line_pets ?? [])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .forEach((lp) => {
            const idx = petIds.indexOf(lp.quote_pet_id);
            if (idx >= 0) prices[idx] = String(lp.unit_price ?? 0);
          });
        return {
          key: `ln-${l.id}`,
          hub_service_type_id: l.hub_service_type_id ?? '',
          description: l.description ?? '',
          unitPricesByPetIndex: prices,
          pricing_variant: linePricingVariantFromQuote(l as HubQuoteLine, serviceTypes),
        };
      });
  });

  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [clientNotes, setClientNotes] = useState(quote?.client_notes ?? '');
  const [discountKind, setDiscountKind] = useState<DiscountKind>((quote?.discount_kind as DiscountKind) ?? '');
  const [discountValueStr, setDiscountValueStr] = useState(
    quote?.discount_value != null ? String(quote.discount_value) : '0',
  );
  const [validDays, setValidDays] = useState<number>(quote?.valid_days ?? 7);

  const [expiresYmd, setExpiresYmd] = useState(() => {
    if (quote?.expires_at) return ymdLocal(new Date(quote.expires_at));
    const d = new Date();
    d.setDate(d.getDate() + (quote?.valid_days ?? 7));
    return ymdLocal(d);
  });

  const [saving, setSaving] = useState(false);

  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!quote) return;
    const k = `${quote.id}-${quote.updated_at}`;
    if (hydratedKey.current === k) return;
    hydratedKey.current = k;
    const orderedPets = [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    setPets(
      orderedPets.length
        ? orderedPets.map(fromApiQuotePet)
        : [emptyPet()],
    );
    const petIds = orderedPets.map((p) => p.id);
    const n = Math.max(orderedPets.length, 1);
    setLines(
      (quote.lines ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((l) => {
          const prices = Array.from({ length: n }, () => '0');
          (l.line_pets ?? []).forEach((lp) => {
            const idx = petIds.indexOf(lp.quote_pet_id);
            if (idx >= 0) prices[idx] = String(lp.unit_price ?? 0);
          });
          return {
            key: `ln-${l.id}`,
            hub_service_type_id: l.hub_service_type_id ?? '',
            description: l.description ?? '',
            unitPricesByPetIndex: prices,
            pricing_variant: linePricingVariantFromQuote(l as HubQuoteLine, serviceTypes),
          };
        }),
    );
    setNotes(quote.notes ?? '');
    setClientNotes(quote.client_notes ?? '');
    setDiscountKind((quote.discount_kind as DiscountKind) ?? '');
    setDiscountValueStr(quote.discount_value != null ? String(quote.discount_value) : '0');
    setValidDays(quote.valid_days ?? 7);
    if (quote.expires_at) setExpiresYmd(ymdLocal(new Date(quote.expires_at)));
  }, [quote, serviceTypes]);

  const petsRef = useRef(pets);
  petsRef.current = pets;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const suggestUnitPriceForPet = useCallback(
    async (
      hubServiceTypeId: string,
      pet: QuotePetRow,
      pricingVariant: HubQuotePricingVariant | null,
    ): Promise<{ unit_price: string; pricing_variant: HubQuotePricingVariant | null }> => {
      try {
        const res = await hubQuotesApi.suggestPrice({
          clinic_id: clinicId,
          hub_service_type_id: hubServiceTypeId,
          pet: {
            size_tier: pet.size_tier,
            coat_type: pet.coat_type ?? null,
            birth_date: null,
          },
          pricing_variant: pricingVariant ?? undefined,
        });
        return {
          unit_price: String(res.unit_price ?? 0),
          pricing_variant: res.pricing_variant ?? pricingVariant,
        };
      } catch {
        return { unit_price: '0', pricing_variant: pricingVariant };
      }
    },
    [clinicId],
  );

  /** Preenche/atualiza o preço sugerido de um pet em todas as linhas que já têm serviço. */
  const refreshSuggestedPricesForPet = useCallback(
    (petIndex: number, petOverride?: QuotePetRow) => {
      void (async () => {
        const pet = petOverride ?? petsRef.current[petIndex];
        if (!pet) return;
        const snapshot = linesRef.current;
        const results = await Promise.all(
          snapshot.map(async (ln) => {
            if (!ln.hub_service_type_id.trim()) return null;
            const suggested = await suggestUnitPriceForPet(
              ln.hub_service_type_id,
              pet,
              ln.pricing_variant,
            );
            return { key: ln.key, unit_price: suggested.unit_price };
          }),
        );
        setLines((prev) =>
          prev.map((row) => {
            const hit = results.find((r) => r && r.key === row.key);
            if (!hit) return row;
            const nextPrices = Array.from(
              { length: Math.max(row.unitPricesByPetIndex.length, petIndex + 1) },
              (_, i) => row.unitPricesByPetIndex[i] ?? '0',
            );
            nextPrices[petIndex] = hit.unit_price;
            return { ...row, unitPricesByPetIndex: nextPrices };
          }),
        );
      })();
    },
    [suggestUnitPriceForPet],
  );

  const grouped = useMemo(() => groupServiceTypes(serviceTypes), [serviceTypes]);

  const [serviceSearch, setServiceSearch] = useState('');
  const groupedFiltered = useMemo(() => {
    const pinned = new Set(lines.map((l) => l.hub_service_type_id).filter(Boolean));
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return grouped;
    const next = new Map<string, HubServiceType[]>();
    for (const [g, arr] of grouped.entries()) {
      const gLow = g.toLowerCase();
      const filtered = arr.filter((s) => pinned.has(s.id) || s.name.toLowerCase().includes(q) || gLow.includes(q));
      if (filtered.length) next.set(g, filtered);
    }
    for (const st of serviceTypes) {
      if (!pinned.has(st.id)) continue;
      if (!isQuotableServiceType(st)) continue;
      const g = st.service_group || 'outros';
      const cur = next.get(g) ?? [];
      if (!cur.some((x) => x.id === st.id)) {
        next.set(g, [...cur, st].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      }
    }
    return next;
  }, [grouped, serviceSearch, lines, serviceTypes]);

  const resizeLinePetPrices = (prev: LineDraft[], petCount: number): LineDraft[] =>
    prev.map((ln) => ({
      ...ln,
      unitPricesByPetIndex: Array.from({ length: petCount }, (_, i) => ln.unitPricesByPetIndex[i] ?? '0'),
    }));

  const addPet = () => {
    const newPet = emptyPet();
    const newIndex = pets.length;
    setPets((p) => [...p, newPet]);
    setLines((ln) => resizeLinePetPrices(ln, newIndex + 1));
    // Preenche preço sugerido do novo pet nas linhas que já têm serviço
    refreshSuggestedPricesForPet(newIndex, newPet);
  };

  const removePet = (i: number) => {
    setPets((p) => (p.length <= 1 ? p : p.filter((_, j) => j !== i)));
    setLines((ln) =>
      resizeLinePetPrices(
        ln.map((l) => ({
          ...l,
          unitPricesByPetIndex: l.unitPricesByPetIndex.filter((_, j) => j !== i),
        })),
        Math.max(pets.length - 1, 1),
      ),
    );
  };

  const updatePet = (i: number, patch: Partial<QuotePetRow>) => {
    const current = pets[i];
    const nextRow = current ? { ...current, ...patch } : null;
    setPets((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    const pricingTouched =
      Object.prototype.hasOwnProperty.call(patch, 'size_tier') ||
      Object.prototype.hasOwnProperty.call(patch, 'coat_type');
    if (pricingTouched && nextRow) {
      refreshSuggestedPricesForPet(i, nextRow);
    }
  };

  const handleSpeciesChange = (i: number, species: string) => {
    const row = pets[i];
    if (!row) return;
    if (!species.trim()) {
      updatePet(i, { species: '', breed: '', size_tier: 'medio' });
      return;
    }
    const nextBreeds = wizardBreedOptionsForSpecies(species).filter((o) => o.value !== '');
    const keepBreed = !!row.breed?.trim() && nextBreeds.some((o) => o.value === row.breed);
    const nextBreed = keepBreed ? row.breed! : '';
    const sug = nextBreed ? defaultBodyPorteForBreed(species, nextBreed) : '';
    const tierOk = !!sug && SIZE_TIERS.some((t) => t.value === sug);
    updatePet(i, {
      species,
      breed: nextBreed,
      ...(tierOk ? { size_tier: sug as HubQuotePetInput['size_tier'] } : {}),
    });
  };

  const addLine = () => setLines((ln) => [...ln, newLineDraft(pets.length)]);

  const removeLine = (i: number) => setLines((ln) => ln.filter((_, j) => j !== i));

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  };

  const serviceComboboxOptions = useMemo((): HubComboboxOption[] => {
    const rows: HubComboboxOption[] = [{ value: '', label: '— Serviço —' }];
    const sortedGroups = [...groupedFiltered.entries()].sort(([a], [b]) =>
      serviceGroupLabel(a).localeCompare(serviceGroupLabel(b), 'pt-BR'),
    );
    const seen = new Set<string>();
    for (const [, arr] of sortedGroups) {
      for (const s of arr) {
        rows.push({ value: s.id, label: s.name });
        seen.add(s.id);
      }
    }
    for (const ln of lines) {
      const id = ln.hub_service_type_id;
      if (!id || seen.has(id)) continue;
      const s = serviceTypes.find((x) => x.id === id);
      if (s) {
        rows.push({
          value: s.id,
          label: `${s.name} (valor guardado)`,
        });
        seen.add(id);
      }
    }
    return rows;
  }, [groupedFiltered, lines, serviceTypes]);

  const applyLineServiceChange = useCallback(
    (lineIndex: number, hubServiceTypeId: string) => {
      if (!hubServiceTypeId) {
        setLines((prev) =>
          prev.map((row, j) => (j === lineIndex ? { ...row, hub_service_type_id: '', pricing_variant: null } : row)),
        );
        return;
      }
      void (async () => {
        const list = petsRef.current;
        const st = serviceTypes.find((x) => x.id === hubServiceTypeId);
        const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
        let pricingVariant: HubQuotePricingVariant | null = null;
        if (matrix && needsMatrixVariantChoice(matrix)) {
          pricingVariant = defaultPricingVariant(matrix);
        }
        const nextPrices: string[] = [];
        let normalizedPv: HubQuotePricingVariant | null = pricingVariant;
        for (let pi = 0; pi < list.length; pi++) {
          const suggested = await suggestUnitPriceForPet(hubServiceTypeId, list[pi], pricingVariant);
          if (suggested.pricing_variant != null) normalizedPv = suggested.pricing_variant;
          nextPrices.push(suggested.unit_price);
        }
        setLines((prev) =>
          prev.map((row, j) =>
            j === lineIndex
              ? {
                  ...row,
                  hub_service_type_id: hubServiceTypeId,
                  unitPricesByPetIndex: nextPrices,
                  pricing_variant: normalizedPv,
                }
              : row,
          ),
        );
      })();
    },
    [serviceTypes, suggestUnitPriceForPet],
  );

  const applyLinePricingVariantFromCombo = useCallback(
    (lineIndex: number, row: LineDraft, comboValue: string) => {
      const st = serviceTypes.find((s) => s.id === row.hub_service_type_id);
      const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
      if (!matrix || !needsMatrixVariantChoice(matrix)) return;
      const parsed = comboValueToVariant(matrix, comboValue);
      if (!parsed) return;
      void (async () => {
        const list = petsRef.current;
        const nextPrices: string[] = [];
        let normalizedPv: HubQuotePricingVariant | null = parsed;
        for (let pi = 0; pi < list.length; pi++) {
          const suggested = await suggestUnitPriceForPet(row.hub_service_type_id, list[pi], parsed);
          if (suggested.pricing_variant != null) normalizedPv = suggested.pricing_variant;
          nextPrices.push(suggested.unit_price);
        }
        setLines((prev) =>
          prev.map((r, j) =>
            j === lineIndex ? { ...r, unitPricesByPetIndex: nextPrices, pricing_variant: normalizedPv } : r,
          ),
        );
      })();
    },
    [serviceTypes, suggestUnitPriceForPet],
  );

  const summary = useMemo(() => {
    const petSubtotals = pets.map((_, pi) =>
      lines.reduce((sum, ln) => sum + parseMoney(ln.unitPricesByPetIndex[pi] ?? '0'), 0),
    );
    const subtotal = petSubtotals.reduce((a, b) => a + b, 0);
    const discountAmt = resolveDiscountAmount(discountKind, discountValueStr, subtotal);
    const total = Math.round((subtotal - discountAmt) * 100) / 100;
    let estMin = 0;
    for (const ln of lines) {
      if (!ln.hub_service_type_id) continue;
      const st = serviceTypes.find((s) => s.id === ln.hub_service_type_id);
      const m = st?.default_duration_minutes;
      if (m && Number.isFinite(m)) estMin += m;
    }
    return { petSubtotals, subtotal, discountAmt, total, estMin };
  }, [pets, lines, discountKind, discountValueStr, serviceTypes]);

  const buildPayloadLines = (): HubQuoteLineInput[] =>
    lines.map((l, idx) => ({
      hub_service_type_id: l.hub_service_type_id.trim() || null,
      description: l.description.trim() || null,
      quantity: 1,
      unit_price: 0,
      discount_amount: 0,
      sort_order: idx,
      pricing_variant: l.pricing_variant,
      line_pets: pets.map((_, pi) => ({
        pet_index: pi,
        unit_price: parseMoney(l.unitPricesByPetIndex[pi] ?? '0'),
        applied_porte: null,
        applied_coat_type: null,
      })),
    }));

  const buildPetPayload = (): HubQuotePetInput[] =>
    pets.map((p, idx) => ({
      display_name: p.display_name?.trim() || `Pet ${idx + 1}`,
      species: canonicalSpecies(p.species),
      breed: (p.breed?.trim() || 'SRD'),
      size_tier: p.size_tier,
      coat_type: p.coat_type?.trim() || null,
      age_months: null,
      sex: null,
      sort_order: idx,
    }));

  const persistDraft = async (opts?: { silentSuccess?: boolean }): Promise<HubQuote | null> => {
    const errMsg = validateWorkspaceDraft({
      createContext,
      persistedQuoteId,
      pets,
      lines,
      subtotal: summary.subtotal,
    });
    if (errMsg) {
      showError(errMsg);
      return null;
    }

    const petPayload = buildPetPayload();
    const linePayload = buildPayloadLines();
    const discount_kind = (discountKind || null) as HubQuoteDiscountKind | null;
    const discount_value = parseMoney(discountValueStr);
    const expires_at = endOfLocalDayIso(expiresYmd);

    const base = {
      clinic_id: clinicId,
      notes: notes.trim() || null,
      client_notes: clientNotes.trim() || null,
      discount_kind,
      discount_value,
      valid_days: validDays,
      expires_at,
      pets: petPayload,
      lines: linePayload,
    };

    try {
      if (persistedQuoteId) {
        const { quote: q } = await hubQuotesApi.patch(persistedQuoteId, base);
        onQuoteUpdated(q);
        if (!opts?.silentSuccess) showSuccess('Rascunho salvo');
        return q;
      }
      if (!createContext) {
        showError('Contexto de criação inválido');
        return null;
      }
      if (createContext.kind === 'prospect_id') {
        const { quote: q } = await hubQuotesApi.create({
          ...base,
          prospect_id: createContext.prospect_id,
        });
        onPersistedQuoteId(q.id);
        onQuoteUpdated(q);
        if (!opts?.silentSuccess) showSuccess('Rascunho criado');
        return q;
      }
      const { quote: q } = await hubQuotesApi.create({
        ...base,
        prospect: createContext.prospect,
      });
      onPersistedQuoteId(q.id);
      onQuoteUpdated(q);
      if (!opts?.silentSuccess) showSuccess('Rascunho criado');
      return q;
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
      return null;
    }
  };

  const handleSaveClick = async () => {
    setSaving(true);
    try {
      await persistDraft();
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    setSaving(true);
    try {
      const q = await persistDraft({ silentSuccess: true });
      const id = q?.id ?? persistedQuoteId;
      if (!id) return;
      await hubQuotesApi.send(id, clinicId);
      showSuccess('Orçamento salvo.');
      navigate(`/hub/orcamentos/${id}/pronto-para-envio`, { replace: true });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar');
    } finally {
      setSaving(false);
    }
  };

  const activeId = persistedQuoteId ?? quote?.id ?? null;

  const applyValidDays = (raw: number) => {
    const n = Math.min(90, Math.max(1, raw));
    setValidDays(n);
    const d = new Date();
    d.setDate(d.getDate() + n);
    setExpiresYmd(ymdLocal(d));
  };

  if (!canWrite) {
    return <p className="hub-clientes__muted">Sem permissão para editar.</p>;
  }

  return (
    <div className="hub-orcamento-novo__workspace">
      <div className="hub-orcamento-novo__sticky-actions">
        <div className="hub-orcamento-novo__sticky-actions-meta">
          <span>
            {pets.length} {pets.length === 1 ? 'pet' : 'pets'}
          </span>
          <span aria-hidden>·</span>
          <span>
            {lines.length} {lines.length === 1 ? 'serviço' : 'serviços'}
          </span>
          {summary.estMin ? (
            <>
              <span aria-hidden>·</span>
              <span>~{summary.estMin} min</span>
            </>
          ) : null}
          <strong className="hub-orcamento-novo__sticky-total">{fmtBrl(summary.total)}</strong>
        </div>
        <div className="hub-orcamento-novo__sticky-actions-btns">
          <button
            type="button"
            className="hub-orcamento-novo__btn"
            disabled={saving}
            onClick={() => void handleSaveClick()}
          >
            <Save size={16} strokeWidth={2} aria-hidden />
            Salvar rascunho
          </button>
          {!hideGenerateAndSend ? (
            <button
              type="button"
              className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
              disabled={saving}
              onClick={() => void handleSend()}
            >
              <Send size={16} strokeWidth={2} aria-hidden />
              Gerar e enviar
            </button>
          ) : null}
        </div>
      </div>

      <div className="hub-orcamento-novo__grid">
        <div className="hub-orcamento-novo__main">
          <section className="hub-orcamento-novo__card">
            <div className="hub-orcamento-novo__card-header hub-orcamento-novo__card-header--icon">
              <span className="hub-orcamento-novo__card-ic" aria-hidden>
                <Dog size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="hub-orcamento-novo__card-title">Pets deste orçamento</h2>
                <p className="hub-orcamento-novo__card-subtitle">
                  Dados temporários só para precificação e envio ao cliente.
                </p>
              </div>
            </div>
            <div className="hub-orcamento-novo__pets">
              {pets.map((p, i) => (
                <div key={i} className="hub-orcamento-novo__pet">
                  <div className="hub-orcamento-novo__pet-head">
                    <span className="hub-orcamento-novo__pet-badge">
                      {p.display_name?.trim() || `Pet ${i + 1}`}
                    </span>
                    <button
                      type="button"
                      className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost hub-orcamento-novo__btn--icon"
                      aria-label="Remover pet"
                      title={pets.length <= 1 ? 'É preciso manter pelo menos um pet' : 'Remover pet'}
                      disabled={pets.length <= 1}
                      onClick={() => removePet(i)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="hub-orcamento-novo__pet-row">
                    <div className="hub-orcamento-novo__field">
                      <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-pet-${i}-name`}>
                        Nome do pet
                      </label>
                      <input
                        id={`hub-quote-pet-${i}-name`}
                        className="hub-orcamento-novo__input"
                        placeholder={`Pet ${i + 1}`}
                        value={p.display_name ?? ''}
                        onChange={(e) => updatePet(i, { display_name: e.target.value })}
                      />
                    </div>
                    <div className="hub-orcamento-novo__field">
                      <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-pet-${i}-species`}>
                        Espécie
                      </label>
                      <HubSearchableCombobox
                        id={`hub-quote-pet-${i}-species`}
                        className="hub-orcamento-novo__combobox"
                        options={mergeSpeciesComboboxOptions(p.species)}
                        value={p.species}
                        onChange={(v) => handleSpeciesChange(i, v)}
                        placeholder="Selecionar espécie"
                        searchPlaceholder="Buscar espécie…"
                        allowCreate
                        createEntityLabel="espécie"
                        ariaLabel="Espécie"
                      />
                    </div>
                    <div className="hub-orcamento-novo__field">
                      <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-pet-${i}-breed`}>
                        Raça
                      </label>
                      <HubSearchableCombobox
                        id={`hub-quote-pet-${i}-breed`}
                        className="hub-orcamento-novo__combobox"
                        options={mergeBreedComboboxOptions(p.species, p.breed)}
                        value={p.breed}
                        onChange={(v) => {
                          const sp = p.species.trim();
                          const sug = sp ? defaultBodyPorteForBreed(sp, v) : '';
                          const tierOk = !!sug && SIZE_TIERS.some((t) => t.value === sug);
                          updatePet(i, {
                            breed: v,
                            ...(tierOk ? { size_tier: sug as HubQuotePetInput['size_tier'] } : {}),
                          });
                        }}
                        placeholder="Selecionar raça"
                        searchPlaceholder="Buscar raça…"
                        allowCreate
                        createEntityLabel="raça"
                        disabled={!p.species.trim()}
                        ariaLabel="Raça"
                      />
                    </div>
                    <div className="hub-orcamento-novo__field">
                      <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-pet-${i}-size`}>
                        Porte
                      </label>
                      <HubSearchableCombobox
                        id={`hub-quote-pet-${i}-size`}
                        className="hub-orcamento-novo__combobox"
                        options={SIZE_TIER_COMBO_OPTIONS}
                        value={p.size_tier}
                        onChange={(v) => updatePet(i, { size_tier: v as HubQuotePetInput['size_tier'] })}
                        placeholder="Porte"
                        searchPlaceholder="Buscar porte…"
                        clearable={false}
                        ariaLabel="Porte"
                      />
                    </div>
                    <div className="hub-orcamento-novo__field">
                      <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-pet-${i}-coat`}>
                        Pelagem
                      </label>
                      <HubSearchableCombobox
                        id={`hub-quote-pet-${i}-coat`}
                        className="hub-orcamento-novo__combobox"
                        options={COAT_COMBO_OPTIONS}
                        value={p.coat_type ?? ''}
                        onChange={(v) => updatePet(i, { coat_type: v || null })}
                        placeholder="Pelagem"
                        searchPlaceholder="Buscar pelagem…"
                        ariaLabel="Pelagem"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline hub-orcamento-novo__add"
                onClick={addPet}
              >
                + Adicionar outro pet
              </button>
            </div>
          </section>

          <section className="hub-orcamento-novo__card">
            <div className="hub-orcamento-novo__card-header hub-orcamento-novo__card-header--icon">
              <span className="hub-orcamento-novo__card-ic" aria-hidden>
                <Sparkles size={18} strokeWidth={1.75} />
              </span>
              <div className="hub-orcamento-novo__card-header-text">
                <h2 className="hub-orcamento-novo__card-title">Serviços e valores</h2>
                <p className="hub-orcamento-novo__card-subtitle">
                  Informe o preço por pet. Em creche, consulta ou leva e traz, escolha a opção de preço.
                </p>
              </div>
              <button type="button" className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline" onClick={addLine}>
                + Adicionar serviço
              </button>
            </div>

            {lines.length === 0 ? (
              <div className="hub-orcamento-novo__empty">
                <p className="hub-orcamento-novo__empty-title">Nenhum serviço ainda</p>
                <p className="hub-orcamento-novo__empty-text">
                  Adicione pelo menos um serviço com valor para salvar o rascunho ou enviar ao cliente.
                </p>
                <button type="button" className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary" onClick={addLine}>
                  + Adicionar serviço
                </button>
              </div>
            ) : (
              <div className="hub-orcamento-novo__svc-list">
                {lines.length > 2 ? (
                  <div className="hub-orcamento-novo__services-toolbar">
                    <div className="hub-orcamento-novo__services-search-wrap">
                      <Search size={17} className="hub-orcamento-novo__services-search-icon" aria-hidden />
                      <input
                        type="search"
                        className="hub-orcamento-novo__input hub-orcamento-novo__services-search-input"
                        placeholder="Filtrar opções do catálogo…"
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        aria-label="Filtrar serviços do catálogo"
                      />
                    </div>
                  </div>
                ) : null}

                {lines.map((ln, li) => {
                  const st = ln.hub_service_type_id
                    ? serviceTypes.find((s) => s.id === ln.hub_service_type_id)
                    : undefined;
                  const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
                  const showVariant = !!(matrix && needsMatrixVariantChoice(matrix));
                  const variantOpts = showVariant && matrix ? variantComboboxOptions(matrix) : [];
                  const variantValue =
                    showVariant && matrix
                      ? variantToComboValue(matrix, ln.pricing_variant ?? defaultPricingVariant(matrix))
                      : '';
                  const durationLabel = formatDurationMin(st?.default_duration_minutes);
                  const serviceLabel = st?.name?.trim() || `Serviço ${li + 1}`;

                  return (
                    <article key={ln.key} className="hub-orcamento-novo__svc">
                      <div className="hub-orcamento-novo__svc-head">
                        <span className="hub-orcamento-novo__svc-badge">{serviceLabel}</span>
                        <div className="hub-orcamento-novo__svc-head-meta">
                          {durationLabel !== '—' ? (
                            <span className="hub-orcamento-novo__svc-duration" title="Duração estimada">
                              {durationLabel}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost hub-orcamento-novo__btn--icon"
                            aria-label="Remover serviço"
                            onClick={() => removeLine(li)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div
                        className={
                          showVariant
                            ? 'hub-orcamento-novo__svc-fields'
                            : 'hub-orcamento-novo__svc-fields hub-orcamento-novo__svc-fields--single'
                        }
                      >
                        <div className="hub-orcamento-novo__field hub-orcamento-novo__svc-field--service">
                          <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-svc-${ln.key}`}>
                            Serviço
                          </label>
                          <HubSearchableCombobox
                            id={`hub-quote-svc-${ln.key}`}
                            className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
                            options={serviceComboboxOptions}
                            value={ln.hub_service_type_id}
                            onChange={(v) => applyLineServiceChange(li, v)}
                            placeholder="Selecionar serviço"
                            searchPlaceholder="Buscar na lista…"
                            ariaLabel="Serviço"
                          />
                        </div>

                        {showVariant && matrix ? (
                          <div className="hub-orcamento-novo__field hub-orcamento-novo__svc-field--variant">
                            <label className="hub-orcamento-novo__label" htmlFor={`hub-quote-var-${ln.key}`}>
                              Opção de preço
                            </label>
                            <HubSearchableCombobox
                              id={`hub-quote-var-${ln.key}`}
                              className="hub-orcamento-novo__combobox hub-orcamento-novo__variant-combobox"
                              options={variantOpts}
                              value={variantValue}
                              onChange={(v) => {
                                if (v) applyLinePricingVariantFromCombo(li, ln, v);
                              }}
                              placeholder="Escolha a faixa"
                              searchPlaceholder="Buscar opção…"
                              clearable={false}
                              ariaLabel="Opção de preço do serviço"
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="hub-orcamento-novo__svc-prices">
                        <p className="hub-orcamento-novo__svc-prices-label">Valor por pet (R$)</p>
                        <div className="hub-orcamento-novo__svc-prices-grid">
                          {pets.map((p, pi) => {
                            const petName = p.display_name?.trim() || `Pet ${pi + 1}`;
                            return (
                              <div key={pi} className="hub-orcamento-novo__field hub-orcamento-novo__svc-price">
                                <label
                                  className="hub-orcamento-novo__label"
                                  htmlFor={`hub-quote-price-${ln.key}-${pi}`}
                                >
                                  {petName}
                                </label>
                                <div className="hub-orcamento-novo__svc-price-input">
                                  <span className="hub-orcamento-novo__svc-price-prefix" aria-hidden>
                                    R$
                                  </span>
                                  <input
                                    id={`hub-quote-price-${ln.key}-${pi}`}
                                    className="hub-orcamento-novo__input"
                                    inputMode="decimal"
                                    value={ln.unitPricesByPetIndex[pi] ?? '0'}
                                    onChange={(e) => {
                                      const next = [...ln.unitPricesByPetIndex];
                                      next[pi] = e.target.value;
                                      updateLine(li, { unitPricesByPetIndex: next });
                                    }}
                                    aria-label={`Valor para ${petName}`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="hub-orcamento-novo__card">
            <div className="hub-orcamento-novo__card-header hub-orcamento-novo__card-header--icon">
              <span className="hub-orcamento-novo__card-ic" aria-hidden>
                <MessageSquare size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="hub-orcamento-novo__card-title">Mensagens</h2>
                <p className="hub-orcamento-novo__card-subtitle">
                  Texto visível no orçamento do cliente e anotação só para a equipe.
                </p>
              </div>
            </div>
            <div className="hub-orcamento-novo__notes-grid">
              <div className="hub-orcamento-novo__field">
                <label className="hub-orcamento-novo__label" htmlFor="hub-quote-client-notes">
                  Observação para o cliente
                </label>
                <textarea
                  id="hub-quote-client-notes"
                  className="hub-orcamento-novo__textarea hub-orcamento-novo__textarea--client"
                  rows={4}
                  maxLength={200}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  placeholder="Mensagem que aparece no orçamento enviado…"
                />
                <p className="hub-orcamento-novo__char-count">{clientNotes.length}/200</p>
              </div>
              <div className="hub-orcamento-novo__field">
                <label className="hub-orcamento-novo__label" htmlFor="hub-quote-internal-notes">
                  <StickyNote size={12} strokeWidth={2} aria-hidden /> Observação interna
                </label>
                <textarea
                  id="hub-quote-internal-notes"
                  className="hub-orcamento-novo__textarea"
                  rows={4}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Só a equipe vê"
                />
                <p className="hub-orcamento-novo__char-count">{notes.length}/300</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="hub-orcamento-novo__sidebar">
          <FinancialSummaryCard
            title="Resumo do orçamento"
            subtotal={summary.subtotal}
            discountAmount={summary.discountAmt}
            total={summary.total}
            extraRows={pets.map((p, i) => ({
              label: p.display_name?.trim() || `Pet ${i + 1}`,
              value: summary.petSubtotals[i] ?? 0,
            }))}
            discountControl={
              <DiscountControl
                idPrefix="hub-quote"
                kind={discountKind}
                valueStr={discountValueStr}
                onKindChange={setDiscountKind}
                onValueStrChange={setDiscountValueStr}
                disabled={saving}
              />
            }
          />

          <div className="hub-orcamento-novo__card">
            <div className="hub-orcamento-novo__card-header hub-orcamento-novo__card-header--icon">
              <span className="hub-orcamento-novo__card-ic" aria-hidden>
                <CalendarClock size={18} strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="hub-orcamento-novo__card-title">Validade</h3>
                <p className="hub-orcamento-novo__card-subtitle">Conta a partir da data de envio.</p>
              </div>
            </div>
            <div className="hub-orcamento-novo__chips" role="group" aria-label="Prazo rápido">
              {[7, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`hub-orcamento-novo__chip${validDays === d ? ' hub-orcamento-novo__chip--active' : ''}`}
                  onClick={() => applyValidDays(d)}
                >
                  {d} dias
                </button>
              ))}
            </div>
            <div className="hub-orcamento-novo__field hub-orcamento-novo__field--spaced">
              <label className="hub-orcamento-novo__label" htmlFor="hub-quote-valid-days">
                Dias após o envio
              </label>
              <input
                id="hub-quote-valid-days"
                className="hub-orcamento-novo__input"
                type="number"
                min={1}
                max={90}
                value={validDays}
                onChange={(e) => applyValidDays(Number.parseInt(e.target.value, 10) || 7)}
              />
            </div>
            <p className="hub-orcamento-novo__validity-hint">
              Prévia: válido até <strong>{formatYmdBr(expiresYmd)}</strong>
            </p>
            <details className="hub-orcamento-novo__validity-advanced">
              <summary>Definir data exata</summary>
              <div className="hub-orcamento-novo__field hub-orcamento-novo__field--spaced">
                <HubDateField
                  id="hub-quote-expires"
                  label="Válido até"
                  valueIso={expiresYmd}
                  onChangeIso={setExpiresYmd}
                />
              </div>
            </details>
          </div>

          <div className="hub-orcamento-novo__card hub-orcamento-novo__card--soft">
            <h3 className="hub-orcamento-novo__card-title">Neste orçamento</h3>
            <div className="hub-orcamento-novo__info-row">
              <span>Pets</span>
              <span>{pets.length}</span>
            </div>
            <div className="hub-orcamento-novo__info-row">
              <span>Serviços</span>
              <span>{lines.length}</span>
            </div>
            <div className="hub-orcamento-novo__info-row">
              <span>Duração estimada</span>
              <span>{summary.estMin ? `${summary.estMin} min` : '—'}</span>
            </div>
          </div>

          <div className="hub-orcamento-novo__card">
            <div className="hub-quote-detail__card-head hub-quote-detail__card-head--with-sub">
              <Eye size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
              <div>
                <h3 className="hub-quote-detail__card-title">Mais opções</h3>
                <p className="hub-quote-detail__card-sub">
                  Visualize ou copie o link interno depois de salvar o rascunho.
                </p>
              </div>
            </div>
            <div className="hub-quote-detail__convert-grid hub-orcamento-novo__side-actions">
              <button
                type="button"
                className="hub-quote-detail__convert-tile"
                disabled={!activeId}
                onClick={() => activeId && navigate(`/hub/orcamentos/${activeId}`)}
              >
                <Eye size={22} strokeWidth={1.75} aria-hidden />
                <span className="hub-quote-detail__convert-tile-title">Visualizar</span>
                <span className="hub-quote-detail__convert-tile-sub">Abrir visualização completa</span>
              </button>
              <button
                type="button"
                className="hub-quote-detail__convert-tile"
                disabled={!activeId}
                onClick={() => {
                  if (!activeId) return;
                  const url = `${window.location.origin}/hub/orcamentos/${activeId}`;
                  void navigator.clipboard.writeText(url).then(() => showSuccess('Link copiado'));
                }}
              >
                <Copy size={22} strokeWidth={1.75} aria-hidden />
                <span className="hub-quote-detail__convert-tile-title">Copiar link interno</span>
                <span className="hub-quote-detail__convert-tile-sub">URL da equipe</span>
              </button>
            </div>
            {!activeId ? (
              <p className="hub-quote-detail__muted hub-quote-detail__convert-hint">
                Salve o rascunho ao menos uma vez para habilitar visualizar e copiar o link.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HubQuoteWorkspace;
