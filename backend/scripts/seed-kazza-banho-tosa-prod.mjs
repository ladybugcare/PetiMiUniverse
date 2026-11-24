/**
 * Seed one-shot: serviços Banho & Tosa + adicionais (produção · Kazza Pet).
 * Uso: node --env-file=.env.production.local scripts/seed-kazza-banho-tosa-prod.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const CLINIC_ID = '8e60f4dc-c186-4680-addc-1340bda2526a'; // KAZZA PET CENTER E VETERINARIA LTDA
const GROUP = 'banho_tosa';

if (!SUPABASE_URL?.includes('jmfvoabsjxjjrxuzhxzh') || !SERVICE_ROLE) {
  console.error('Use .env.production.local (projeto jmfvoabsjxjjrxuzhxzh).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function porteMatrix(tiers) {
  return {
    kind: 'porte',
    tiers: tiers.map(([porte, sale]) => ({
      porte,
      cost_amount: 0,
      sale_amount: sale,
    })),
  };
}

/** Adicionais: matriz por porte (resolução automática na agenda). */
function addonPorteMatrix(tiers) {
  const portes = ['mini', 'pequeno', 'medio', 'grande', 'gigante'];
  return {
    kind: 'porte',
    tiers: tiers.map((sale, i) => ({
      porte: portes[i],
      cost_amount: 0,
      sale_amount: sale,
    })),
  };
}

function refSale(matrix) {
  return Math.min(...matrix.tiers.map((t) => t.sale_amount));
}

const MAINS = [
  {
    code: 'banho',
    name: 'Banho',
    description:
      'Banho completo com shampoo adequado ao pet, enxágue e secagem. Ideal para higiene regular.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['filhote', 43.9],
      ['mini', 61.9],
      ['pequeno', 85.9],
      ['medio', 122.9],
      ['grande', 159.9],
      ['gigante', 270.9],
    ]),
  },
  {
    code: 'tosa_higienica',
    name: 'Tosa Higiênica',
    description:
      'Tosa nas áreas de higiene (patas, barriga, região íntima e face, conforme necessidade), sem alterar o visual geral.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['mini', 24.9],
      ['pequeno', 30.9],
      ['medio', 33.9],
      ['grande', 39.9],
      ['gigante', 45.9],
    ]),
  },
  {
    code: 'tosa_maquina',
    name: 'Tosa Máquina',
    description: 'Tosa com máquina em comprimento uniforme, para praticidade no dia a dia.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['mini', 58.9],
      ['pequeno', 66.9],
      ['medio', 70.9],
      ['grande', 81.9],
      ['gigante', 93.9],
    ]),
  },
  {
    code: 'tosa_tesoura',
    name: 'Tosa Tesoura',
    description: 'Acabamento e modelagem com tesoura, para contorno e volume mais precisos.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['mini', 89.9],
      ['pequeno', 100.9],
      ['medio', 112.9],
      ['grande', 116.9],
      ['gigante', 154.9],
    ]),
  },
  {
    code: 'tosa_trimming',
    name: 'Tosa Trimming',
    description: 'Manutenção da raça com técnica de trimming, preservando a estrutura da pelagem.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['mini', 185.9],
      ['pequeno', 203.9],
      ['medio', 231.9],
      ['grande', 289.9],
      ['gigante', 312.9],
    ]),
  },
  {
    code: 'tosa_handstripping',
    name: 'Tosa Handstripping',
    description: 'Remoção manual do pelo morto (handstripping), indicada para pelagens wire/duras.',
    duration: 60,
    allow_scheduling: true,
    matrix: porteMatrix([
      ['mini', 215.9],
      ['pequeno', 243.9],
      ['medio', 289.9],
      ['grande', 416.9],
      ['gigante', 437.9],
    ]),
  },
];

const ADDONS = [
  {
    code: 'banho_terapeutico',
    name: 'Banho Terapêutico',
    description: 'Acréscimo de banho com produto/protocolo terapêutico, conforme indicação.',
    duration: 15,
    prices: [17.9, 17.9, 18.9, 18.9, 19.9],
  },
  {
    code: 'escovacao_dental',
    name: 'Escovação Dental',
    description: 'Limpeza superficial dos dentes com escova e produto pet.',
    duration: 10,
    prices: [10.9, 10.9, 10.9, 10.9, 10.9],
  },
  {
    code: 'manutencao_argan',
    name: 'Manutenção Argan',
    description: 'Tratamento com óleo de argan para brilho e maciez.',
    duration: 15,
    prices: [35.9, 35.9, 35.9, 35.9, 39.9],
  },
  {
    code: 'restauracao_liso_perfeito',
    name: 'Restauração Liso Perfeito',
    description: 'Tratamento para alisar e reduzir volume excessivo.',
    duration: 20,
    prices: [35.9, 35.9, 35.9, 35.9, 39.9],
  },
  {
    code: 'desembolo_leve',
    name: 'Desembolo Leve',
    description: 'Remoção de nós leves.',
    duration: 20,
    prices: [30.9, 30.9, 38.9, 38.9, 46.9],
  },
  {
    code: 'desembolo_moderado',
    name: 'Desembolo Moderado',
    description: 'Remoção de nós moderados.',
    duration: 30,
    prices: [38.9, 43.9, 49.9, 52.9, 60.9],
  },
  {
    code: 'desembolo_severo',
    name: 'Desembolo Severo',
    description: 'Remoção de nós severos (exclusivo com os outros desembolos).',
    duration: 45,
    prices: [79.9, 83.9, 89.9, 104.9, 115.9],
  },
  {
    code: 'remocao_subpelo',
    name: 'Remoção de Subpelo',
    description: 'Escovação profunda para soltar subpelo.',
    duration: 20,
    prices: [32.9, 32.9, 45.9, 45.9, 45.9],
  },
  {
    code: 'remocao_pelo_denso',
    name: 'Remoção pelo Denso',
    description: 'Tempo extra para pelagens muito densas.',
    duration: 15,
    prices: [15.9, 20.9, 24.9, 27.9, 52.9],
  },
  {
    code: 'aplicacao_tonalizante',
    name: 'Aplicação Tonalizante',
    description: 'Aplicação de tonalizante cosmético pet.',
    duration: 20,
    prices: [30.9, 33.9, 34.9, 36.9, 41.9],
  },
  {
    code: 'taxa_canil',
    name: 'Taxa de Canil',
    description: 'Taxa de hospedagem/espera em canil no período do serviço.',
    duration: 5,
    prices: [109.9, 109.9, 169.9, 169.9, 169.9],
  },
];

function rowBase({ code, name, description, duration, allow_scheduling, is_addon, matrix }) {
  const sale = refSale(matrix);
  return {
    clinic_id: CLINIC_ID,
    code,
    name,
    service_group: GROUP,
    cost_amount: 0,
    sale_amount: sale,
    default_duration_minutes: duration,
    pricing_matrix: matrix,
    description,
    allow_scheduling,
    is_addon,
    is_encounter_application: false,
    pickup_price_scope: 'round_trip',
    price_mode: 'fixed',
    price_min: null,
    price_max: null,
    agenda_color: null,
    internal_notes: null,
    code_locked: false,
    active: true,
    deleted_at: null,
  };
}

async function upsertService(spec) {
  const { data: existing } = await admin
    .from('hub_service_types')
    .select('id, code, name')
    .eq('clinic_id', CLINIC_ID)
    .eq('code', spec.code)
    .is('deleted_at', null)
    .maybeSingle();

  const payload = rowBase(spec);

  if (existing?.id) {
    const { data, error } = await admin
      .from('hub_service_types')
      .update({
        name: payload.name,
        description: payload.description,
        default_duration_minutes: payload.default_duration_minutes,
        pricing_matrix: payload.pricing_matrix,
        cost_amount: payload.cost_amount,
        sale_amount: payload.sale_amount,
        allow_scheduling: payload.allow_scheduling,
        is_addon: payload.is_addon,
        active: true,
        deleted_at: null,
      })
      .eq('id', existing.id)
      .select('id, code, name, is_addon, sale_amount')
      .single();
    if (error) throw error;
    console.log(`update ${data.code} → ${data.id}`);
    return data;
  }

  const { data, error } = await admin
    .from('hub_service_types')
    .insert([payload])
    .select('id, code, name, is_addon, sale_amount')
    .single();
  if (error) throw error;
  console.log(`create ${data.code} → ${data.id}`);
  return data;
}

async function main() {
  console.log(`Seed Kazza Banho & Tosa → ${SUPABASE_URL}`);
  console.log(`Clinic ${CLINIC_ID}`);

  const mainRows = [];
  for (const m of MAINS) {
    // fix typo guard
    const matrix = m.matrix;
    mainRows.push(
      await upsertService({
        code: m.code,
        name: m.name,
        description: m.description,
        duration: m.duration,
        allow_scheduling: m.allow_scheduling,
        is_addon: false,
        matrix,
      }),
    );
  }

  const banho = mainRows.find((r) => r.code === 'banho');
  if (!banho) throw new Error('Banho não criado');

  const addonRows = [];
  for (const a of ADDONS) {
    addonRows.push(
      await upsertService({
        code: a.code,
        name: a.name,
        description: a.description,
        duration: a.duration,
        allow_scheduling: false,
        is_addon: true,
        matrix: addonPorteMatrix(a.prices),
      }),
    );
  }

  // Vincular adicionais ao grupo
  for (let i = 0; i < addonRows.length; i++) {
    const addon = addonRows[i];
    const { error } = await admin.from('hub_service_group_addons').upsert(
      {
        clinic_id: CLINIC_ID,
        service_group_slug: GROUP,
        addon_service_type_id: addon.id,
        sort_order: i,
      },
      { onConflict: 'clinic_id,service_group_slug,addon_service_type_id' },
    );
    if (error) throw error;
  }
  console.log(`group addons linked: ${addonRows.length}`);

  // Disponibilidade: só no Banho
  for (const parent of mainRows) {
    for (const addon of addonRows) {
      const { error } = await admin.from('hub_service_type_addon_availability').upsert(
        {
          parent_service_type_id: parent.id,
          addon_service_type_id: addon.id,
          is_available: parent.code === 'banho',
        },
        { onConflict: 'parent_service_type_id,addon_service_type_id' },
      );
      if (error) throw error;
    }
  }
  console.log('addon availability: only Banho = true');

  console.log('\nOK');
  console.log(
    JSON.stringify(
      {
        mains: mainRows.map((r) => ({ code: r.code, id: r.id, sale: r.sale_amount })),
        addons: addonRows.map((r) => ({ code: r.code, id: r.id, sale: r.sale_amount })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
