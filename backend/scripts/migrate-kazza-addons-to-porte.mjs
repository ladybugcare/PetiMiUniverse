/**
 * Migra adicionais Kazza de personalizado (labels Mini…Gigante) → kind porte.
 * Uso: node --env-file=.env.production.local scripts/migrate-kazza-addons-to-porte.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const CLINIC_ID = '8e60f4dc-c186-4680-addc-1340bda2526a';

const LABEL_TO_PORTE = {
  Mini: 'mini',
  Pequeno: 'pequeno',
  Médio: 'medio',
  Medio: 'medio',
  Grande: 'grande',
  Gigante: 'gigante',
};

if (!SUPABASE_URL?.includes('jmfvoabsjxjjrxuzhxzh') || !SERVICE_ROLE) {
  console.error('Use .env.production.local (projeto jmfvoabsjxjjrxuzhxzh).');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function toPorteMatrix(matrix) {
  if (!matrix || matrix.kind !== 'personalizado' || !Array.isArray(matrix.tiers)) return null;
  const tiers = [];
  for (const t of matrix.tiers) {
    const porte = LABEL_TO_PORTE[String(t.label || '').trim()];
    if (!porte) {
      throw new Error(`Label não mapeável para porte: ${t.label}`);
    }
    tiers.push({
      porte,
      cost_amount: Number(t.cost_amount) || 0,
      sale_amount: Number(t.sale_amount) || 0,
    });
  }
  const sale = Math.min(...tiers.map((x) => x.sale_amount));
  return { matrix: { kind: 'porte', tiers }, sale };
}

async function main() {
  console.log(`Migrate Kazza addons → porte @ ${SUPABASE_URL}`);
  const { data: rows, error } = await admin
    .from('hub_service_types')
    .select('id, code, name, pricing_matrix, sale_amount')
    .eq('clinic_id', CLINIC_ID)
    .eq('is_addon', true)
    .is('deleted_at', null);
  if (error) throw error;

  for (const row of rows || []) {
    const converted = toPorteMatrix(row.pricing_matrix);
    if (!converted) {
      console.log(`skip ${row.code} (já não é personalizado ou vazio)`);
      continue;
    }
    const { error: upErr } = await admin
      .from('hub_service_types')
      .update({
        pricing_matrix: converted.matrix,
        sale_amount: converted.sale,
        cost_amount: 0,
      })
      .eq('id', row.id);
    if (upErr) throw upErr;
    console.log(`ok ${row.code} → porte (${converted.matrix.tiers.length} tiers), ref sale ${converted.sale}`);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
