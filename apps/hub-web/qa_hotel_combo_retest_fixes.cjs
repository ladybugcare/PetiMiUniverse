/**
 * Reteste local: Hotel + Banho + L&T — saída com devolução + comanda única do banho.
 * Usa PetMi Preprod (QA STAGING A) + Hub/API locais. Sem pagamento real.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');

const OUT = '/tmp/qa_hotel_combo_retest';
fs.mkdirSync(OUT, { recursive: true });
const API = 'http://localhost:3000';
const BASE = 'http://localhost:3002';
const SUPA = 'https://afstcbhcbrkvbihtjbww.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmc3RjYmhjYnJrdmJpaHRqYnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MjU2NzYsImV4cCI6MjExMDEwMTY3Nn0.5rdeHtcyJbSD1xheS0Gc-zc-l5fwnG2X9pZ-hcuw2Yg';
const PW = 'QaStaging!2026';
const CLINIC = 'a1111111-1111-4111-8111-111111111111';
const UNIT = 'ac9e17b6-d19c-4aad-a098-5fbd3e7fe4af';
const PET = 'ef127b0c-bd31-407b-95df-3497d0964531';
const GUARDIAN = '46de1925-ff80-49df-840a-d431260508d1';
const HOTEL_SVC = '5852e64f-b515-40ba-9e31-7ba4b6c96a47';
const BATH_SVC = '4609ee2e-20de-48fe-9b45-fb8652b71246';
const LT_SVC = '763474d2-20a4-4921-9032-30856e4260e9';
const DRIVER = 'def72aaa-a46e-4aad-a642-deb045e551e4';
const SALAO = 'f4d7dcff-eebf-4df8-ba2f-2158fbed35c1';
const ADMIN = 'qa.staging.a.cadmin@petmi.test';
const RECEP = 'qa.staging.a.cassistant@petmi.test';
const stamp = Date.now().toString().slice(-6);

const report = {
  stamp,
  scenarios: {
    hotel_return_embarque: { status: 'NÃO VALIDADO' },
    dual_comanda_banho: { status: 'NÃO VALIDADO' },
    caixa_totais: { status: 'NÃO VALIDADO' },
    agenda_16h: { status: 'NÃO VALIDADO' },
  },
  api: {},
  ui: {},
  operational_via_api: [],
};

async function token(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`auth fail ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

async function api(method, path, access, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text.slice(0, 500) };
  }
  return { status: r.status, json };
}

(async () => {
  const adminTok = await token(ADMIN);
  const recepTok = await token(RECEP);

  // ── 1) Criar Hotel + Banho + L&T (ida/volta) ─────────────────────────────
  const checkIn = '2026-11-21T14:00:00-03:00';
  const checkOut = '2026-11-22T16:00:00-03:00';
  const create = await api('POST', '/api/hub/appointments', adminTok, {
    clinic_id: CLINIC,
    unit_id: UNIT,
    pet_id: PET,
    guardian_id: GUARDIAN,
    hub_service_type_id: HOTEL_SVC,
    starts_at: checkIn,
    ends_at: checkOut,
    appointment_kind: 'hotel_stay',
    status: 'confirmed',
    notes: `QA retest hotel+banho+LT ${stamp}`,
    create_boarding_reservation: true,
    independent_extra_blocks: true,
    services: [{ hub_service_type_id: HOTEL_SVC, duration_minutes: 1440, sale_amount_override: 150 }],
    extra_blocks: [
      {
        starts_at: '2026-11-21T15:00:00-03:00',
        ends_at: '2026-11-21T16:00:00-03:00',
        hub_staff_member_id: SALAO,
        services: [{ hub_service_type_id: BATH_SVC, duration_minutes: 60, sale_amount_override: 80 }],
        notes: `QA banho vinculado ${stamp}`,
      },
    ],
    with_pickup_route_before: {
      starts_at: '2026-11-21T13:00:00-03:00',
      ends_at: '2026-11-21T13:30:00-03:00',
      hub_staff_member_id: DRIVER,
    },
    with_pickup_route_after: {
      starts_at: '2026-11-22T16:00:00-03:00',
      ends_at: '2026-11-22T16:30:00-03:00',
      hub_staff_member_id: DRIVER,
    },
    pickup_route_pricing: {
      hub_service_type_id: LT_SVC,
      pricing_variant: { km_tier_index: 0 },
    },
    allow_schedule_overlap: true,
  });
  report.api.create = { status: create.status, id: create.json?.appointment?.id, err: create.json?.error };
  if (create.status >= 300) throw new Error(`create failed: ${JSON.stringify(create.json).slice(0, 400)}`);
  const hotelId = create.json.appointment.id;
  report.operational_via_api.push('POST /appointments (hotel+banho+LT)');

  // Linked legs
  const linked = await api(
    'GET',
    `/api/hub/appointments?clinic_id=${CLINIC}&unit_id=${UNIT}&pet_id=${PET}&from=2026-11-21T00:00:00.000Z&to=2026-11-23T03:00:00.000Z`,
    adminTok,
  );
  const appts = (linked.json.appointments || []).filter(
    (a) => a.id === hotelId || a.parent_appointment_id === hotelId || (a.notes || '').includes(stamp),
  );
  const legs = appts.filter((a) => a.appointment_kind === 'pickup_route');
  const bathAppt = appts.find((a) => a.appointment_kind === 'standard' || (a.notes || '').includes('banho'));
  const returnLeg = legs.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).at(-1);
  const pickupLeg = legs.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];
  report.api.legs = legs.map((l) => ({
    id: l.id,
    starts_at: l.starts_at,
    parent: l.parent_appointment_id,
  }));
  report.api.bathApptId = bathAppt?.id || null;

  // Boarding reservation
  let resvId = create.json.boarding_reservation?.id || create.json.reservation?.id || null;
  if (!resvId) {
    const br = await fetch(
      `${SUPA}/rest/v1/hub_boarding_reservations?clinic_id=eq.${CLINIC}&hub_appointment_id=eq.${hotelId}&select=id,status&order=created_at.desc&limit=1`,
      { headers: { apikey: ANON, Authorization: `Bearer ${adminTok}` } },
    ).then((r) => r.json());
    resvId = br[0]?.id || null;
    report.api.boarding_lookup = br;
  }
  report.api.resvId = resvId;
  if (!resvId) throw new Error('boarding reservation not found');

  // Check-in + release
  const cin = await api('PATCH', `/api/hub/boarding/reservations/${resvId}`, adminTok, {
    clinic_id: CLINIC,
    status: 'checked_in',
    force_capacity: true,
  });
  report.api.checkIn = { status: cin.status, err: cin.json?.error, st: cin.json?.reservation?.status };
  report.operational_via_api.push('PATCH boarding → checked_in');

  const rel = await api('POST', `/api/hub/boarding/reservations/${resvId}/release-for-handoff`, adminTok, {
    clinic_id: CLINIC,
    force_belongings: true,
    force_belongings_reason: `QA retest ${stamp}`,
  });
  report.api.release = {
    status: rel.status,
    err: rel.json?.error,
    st: rel.json?.reservation?.status,
  };
  report.operational_via_api.push('POST release-for-handoff');

  // Dayboard L&T direction for return leg (before stop)
  const dayboard = await api(
    'GET',
    `/api/hub/pickup/day-board?clinic_id=${CLINIC}&unit_id=${UNIT}&date=2026-11-22`,
    adminTok,
  );
  const itemsArr = dayboard.json.items || [];
  const returnBoard = itemsArr.find((i) => i.appointment_id === returnLeg?.id);
  const pickupBoard = itemsArr.find((i) => i.appointment_id === pickupLeg?.id);
  report.api.dayboard_return = returnBoard
    ? { appointment_id: returnBoard.appointment_id, direction: returnBoard.direction }
    : { missing: true, sample: itemsArr.slice(0, 3).map((i) => ({ id: i.appointment_id, dir: i.direction })) };
  report.api.dayboard_pickup_same_day = pickupBoard
    ? { appointment_id: pickupBoard.appointment_id, direction: pickupBoard.direction }
    : null;

  // Reception board
  const recv = await api(
    'GET',
    `/api/hub/reception/board?clinic_id=${CLINIC}&unit_id=${UNIT}&date=2026-11-21`,
    recepTok,
  );
  const handoffs = (recv.json.handoffs || recv.json.items || []).filter(
    (h) => h.pet_id === PET || h.pet?.id === PET || h.source_id === resvId,
  );
  const openH = handoffs.filter((h) => h.status === 'open');
  report.api.reception_open = openH.map((h) => ({
    kind: h.kind,
    source_type: h.source_type,
    source_id: h.source_id,
    needs_return_config: h.context?.needs_return_config,
    label: h.context?.label,
  }));

  const embarque = openH.find((h) => h.kind === 'embarque' && h.source_id === resvId);
  const balcao = openH.find((h) => h.kind === 'retirada_balcao' && h.source_id === resvId);
  const pendConfig = openH.find(
    (h) => h.kind === 'saida_prevista' && h.source_id === resvId && h.context?.needs_return_config,
  );

  if (embarque && !balcao) {
    report.scenarios.hotel_return_embarque.status = 'PASSOU';
    report.scenarios.hotel_return_embarque.evidence = {
      kind: 'embarque',
      handoff_id: embarque.id,
      dayboard_direction: returnBoard?.direction,
    };
  } else if (pendConfig && !balcao) {
    report.scenarios.hotel_return_embarque.status = 'PASSOU';
    report.scenarios.hotel_return_embarque.note =
      'Volta presente sem direção explícita → pendente configurar (não balcão)';
    report.scenarios.hotel_return_embarque.evidence = { kind: 'saida_prevista', needs_return_config: true };
  } else {
    report.scenarios.hotel_return_embarque.status = 'FALHOU';
    report.scenarios.hotel_return_embarque.evidence = { openH: report.api.reception_open, balcao: !!balcao };
  }

  // Create delivery stop + confirm embarque path via API (ops)
  if (returnLeg && DRIVER) {
    const route = await api('POST', '/api/hub/pickup/routes', adminTok, {
      clinic_id: CLINIC,
      unit_id: UNIT,
      route_date: '2026-11-22',
      driver_staff_id: DRIVER,
      start_kind: 'clinic',
    });
    report.api.route = { status: route.status, id: route.json?.route?.id, err: route.json?.error };
    report.operational_via_api.push('POST pickup/routes');
    if (route.json?.route?.id) {
      const stops = await api('POST', `/api/hub/pickup/routes/${route.json.route.id}/stops`, adminTok, {
        clinic_id: CLINIC,
        stops: [{ hub_appointment_id: returnLeg.id, direction: 'delivery', sequence: 0 }],
      });
      report.api.addStop = { status: stops.status, err: stops.json?.error, n: stops.json?.stops?.length };
      report.operational_via_api.push('POST routes/:id/stops (delivery)');

      // re-sync reception after stop
      await api('POST', `/api/hub/boarding/reservations/${resvId}/release-for-handoff`, adminTok, {
        clinic_id: CLINIC,
      }).catch(() => {});
      // força sync via GET board
      const recv2 = await api(
        'GET',
        `/api/hub/reception/board?clinic_id=${CLINIC}&unit_id=${UNIT}&date=2026-11-21`,
        recepTok,
      );
      const open2 = (recv2.json.handoffs || recv2.json.items || []).filter(
        (h) => h.status === 'open' && h.source_id === resvId,
      );
      report.api.reception_after_stop = open2.map((h) => ({ kind: h.kind, id: h.id }));
      if (open2.some((h) => h.kind === 'embarque') && !open2.some((h) => h.kind === 'retirada_balcao')) {
        report.scenarios.hotel_return_embarque.status = 'PASSOU';
        report.scenarios.hotel_return_embarque.evidence = {
          ...(report.scenarios.hotel_return_embarque.evidence || {}),
          after_stop: 'embarque',
        };
      }
    }
  }

  // ── 2) Dual comanda banho ────────────────────────────────────────────────
  // Ensure grooming session exists linked to bath appointment
  let sessionId = null;
  if (bathAppt?.id) {
    const sessLookup = await fetch(
      `${SUPA}/rest/v1/hub_grooming_sessions?clinic_id=eq.${CLINIC}&hub_appointment_id=eq.${bathAppt.id}&select=id,grooming_stage&is=deleted_at.null&order=created_at.desc&limit=1`,
      { headers: { apikey: ANON, Authorization: `Bearer ${adminTok}` } },
    ).then((r) => r.json());
    sessionId = sessLookup[0]?.id || null;
    if (!sessionId) {
      const opened = await api('POST', '/api/hub/grooming/sessions/open-from-appointment', adminTok, {
        clinic_id: CLINIC,
        hub_appointment_id: bathAppt.id,
      });
      sessionId = opened.json?.session?.id || null;
      report.api.groom_open = { status: opened.status, sessionId, err: opened.json?.error };
      report.operational_via_api.push('POST grooming open-from-appointment');
      if (sessionId) {
        // avança até closed (queued → in_service → ready → delivered → closed)
        for (let i = 0; i < 6; i++) {
          const adv = await api('POST', `/api/hub/grooming/sessions/${sessionId}/advance`, adminTok, {
            clinic_id: CLINIC,
            skip_resource: true,
          });
          if (adv.status >= 400) {
            await api('PATCH', `/api/hub/grooming/sessions/${sessionId}`, adminTok, {
              clinic_id: CLINIC,
              grooming_stage: 'closed',
            });
            break;
          }
          if (adv.json?.session?.grooming_stage === 'closed' || adv.json?.grooming_stage === 'closed') break;
        }
        report.operational_via_api.push('advance/PATCH grooming → closed');
      }
    } else {
      report.api.groom_existing = sessLookup[0];
    }
  }
  report.api.sessionId = sessionId;

  if (bathAppt?.id && sessionId) {
    const openSess = await api('POST', '/api/hub/comandas/open', adminTok, {
      clinic_id: CLINIC,
      origin_type: 'grooming_session',
      origin_id: sessionId,
    });
    const openAppt = await api('POST', '/api/hub/comandas/open', adminTok, {
      clinic_id: CLINIC,
      origin_type: 'appointment',
      origin_id: bathAppt.id,
    });
    const parallel = await Promise.all([
      api('POST', '/api/hub/comandas/open', adminTok, {
        clinic_id: CLINIC,
        origin_type: 'appointment',
        origin_id: bathAppt.id,
      }),
      api('POST', '/api/hub/comandas/open', adminTok, {
        clinic_id: CLINIC,
        origin_type: 'grooming_session',
        origin_id: sessionId,
      }),
    ]);
    const id1 = openSess.json?.comanda?.id;
    const id2 = openAppt.json?.comanda?.id;
    const idP1 = parallel[0].json?.comanda?.id;
    const idP2 = parallel[1].json?.comanda?.id;
    const same =
      id1 && id1 === id2 && id1 === idP1 && id1 === idP2 && Number(openSess.json?.comanda?.total_amount) === 80;
    report.api.dual = {
      openSess: { status: openSess.status, id: id1, total: openSess.json?.comanda?.total_amount, origin: openSess.json?.comanda?.origin_type },
      openAppt: { status: openAppt.status, id: id2, total: openAppt.json?.comanda?.total_amount, origin: openAppt.json?.comanda?.origin_type },
      parallel: [
        { status: parallel[0].status, id: idP1 },
        { status: parallel[1].status, id: idP2 },
      ],
    };
    report.scenarios.dual_comanda_banho.status = same ? 'PASSOU' : 'FALHOU';
    report.scenarios.dual_comanda_banho.evidence = report.api.dual;

    // Also reverse order on fresh origin — already covered by rewrite; mark totals
  } else {
    report.scenarios.dual_comanda_banho.status = 'NÃO VALIDADO';
    report.scenarios.dual_comanda_banho.reason = 'bath appt or session missing';
  }

  // Inverse order with NEW bath (appointment first)
  const bath2 = await api('POST', '/api/hub/appointments', adminTok, {
    clinic_id: CLINIC,
    unit_id: UNIT,
    pet_id: PET,
    guardian_id: GUARDIAN,
    hub_service_type_id: BATH_SVC,
    hub_staff_member_id: SALAO,
    starts_at: '2026-11-23T10:00:00-03:00',
    ends_at: '2026-11-23T11:00:00-03:00',
    status: 'confirmed',
    notes: `QA dual reverse ${stamp}`,
    services: [{ hub_service_type_id: BATH_SVC, duration_minutes: 60, sale_amount_override: 80 }],
    allow_schedule_overlap: true,
  });
  const bath2Id = bath2.json?.appointment?.id;
  report.operational_via_api.push('POST appointment banho isolado (ordem inversa)');
  if (bath2Id) {
    const o1 = await api('POST', '/api/hub/comandas/open', adminTok, {
      clinic_id: CLINIC,
      origin_type: 'appointment',
      origin_id: bath2Id,
    });
    const s2 = await api('POST', '/api/hub/grooming/sessions/open-from-appointment', adminTok, {
      clinic_id: CLINIC,
      hub_appointment_id: bath2Id,
    });
    const s2id = s2.json?.session?.id;
    if (s2id) {
      for (let i = 0; i < 6; i++) {
        const adv = await api('POST', `/api/hub/grooming/sessions/${s2id}/advance`, adminTok, {
          clinic_id: CLINIC,
          skip_resource: true,
        });
        if (adv.status >= 400) {
          await api('PATCH', `/api/hub/grooming/sessions/${s2id}`, adminTok, {
            clinic_id: CLINIC,
            grooming_stage: 'closed',
          });
          break;
        }
        if (adv.json?.session?.grooming_stage === 'closed') break;
      }
      const o2 = await api('POST', '/api/hub/comandas/open', adminTok, {
        clinic_id: CLINIC,
        origin_type: 'grooming_session',
        origin_id: s2id,
      });
      report.api.dual_reverse = {
        apptFirst: { status: o1.status, id: o1.json?.comanda?.id, total: o1.json?.comanda?.total_amount },
        sessSecond: { status: o2.status, id: o2.json?.comanda?.id, total: o2.json?.comanda?.total_amount },
      };
      if (
        report.scenarios.dual_comanda_banho.status === 'PASSOU' &&
        o1.json?.comanda?.id &&
        o1.json.comanda.id === o2.json?.comanda?.id
      ) {
        report.scenarios.dual_comanda_banho.evidence.reverse = report.api.dual_reverse;
      } else if (o1.json?.comanda?.id !== o2.json?.comanda?.id) {
        report.scenarios.dual_comanda_banho.status = 'FALHOU';
        report.scenarios.dual_comanda_banho.evidence = {
          ...(report.scenarios.dual_comanda_banho.evidence || {}),
          reverse: report.api.dual_reverse,
        };
      }
    }
  }

  // ── 3) Caixa totais (abrir comandas hotel + LT + banho) — sem pagar ───────
  const openHotel = await api('POST', '/api/hub/comandas/open', adminTok, {
    clinic_id: CLINIC,
    origin_type: 'appointment',
    origin_id: hotelId,
  });
  const openIda = pickupLeg
    ? await api('POST', '/api/hub/comandas/open', adminTok, {
        clinic_id: CLINIC,
        origin_type: 'appointment',
        origin_id: pickupLeg.id,
      })
    : { status: 0, json: {} };
  const openVolta = returnLeg
    ? await api('POST', '/api/hub/comandas/open', adminTok, {
        clinic_id: CLINIC,
        origin_type: 'appointment',
        origin_id: returnLeg.id,
      })
    : { status: 0, json: {} };
  const totals = [
    { label: 'hotel', t: Number(openHotel.json?.comanda?.total_amount || 0), id: openHotel.json?.comanda?.id },
    {
      label: 'banho',
      t: Number((report.api.dual?.openSess?.total ?? openSessTotal(report)) || 0),
      id: report.api.dual?.openSess?.id,
    },
    { label: 'ida', t: Number(openIda.json?.comanda?.total_amount || 0), id: openIda.json?.comanda?.id },
    { label: 'volta', t: Number(openVolta.json?.comanda?.total_amount || 0), id: openVolta.json?.comanda?.id },
  ];
  const sum = totals.reduce((a, b) => a + b.t, 0);
  report.api.caixa_lines = totals;
  report.api.caixa_sum = sum;
  report.scenarios.caixa_totais.status = sum === 270 ? 'PASSOU' : sum > 0 ? 'FALHOU' : 'NÃO VALIDADO';
  report.scenarios.caixa_totais.evidence = { totals, sum, expected: 270 };

  // UI: Caixa + Recepção screenshots
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email', { exact: true }).fill(RECEP);
  await page.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page.getByRole('button', { name: /Entrar/i }).click();
  await page.waitForURL(/\/hub/, { timeout: 90000 });
  await page.evaluate((u) => localStorage.setItem('selected_unit_id', u), UNIT);

  await page.goto(`${BASE}/hub/reception?date=2026-11-21`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/reception.png`, fullPage: true });
  const recepText = await page.locator('body').innerText();
  report.ui.reception = {
    hasEmbarque: /Embarque/i.test(recepText),
    hasBalcao: /Retirada no balcão/i.test(recepText),
    hasConfig: /configurar a devolução|Falta configurar/i.test(recepText),
    snippet: recepText.slice(0, 800),
  };

  await page.goto(`${BASE}/hub/financeiro/caixa`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/caixa.png`, fullPage: true });
  const caixaText = await page.locator('body').innerText();
  report.ui.caixa = {
    has270: /270/.test(caixaText),
    hasCobrarConjunto: /Cobrar em conjunto/i.test(caixaText),
    snippet: caixaText.slice(0, 1000),
  };

  // Try open cobrar em conjunto if visible — stop before payment
  const conj = page.getByRole('button', { name: /Cobrar em conjunto/i }).first();
  if (await conj.isVisible().catch(() => false)) {
    await conj.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/caixa_conjunto_drawer.png`, fullPage: true });
    report.ui.caixa_drawer = (await page.locator('body').innerText()).slice(0, 800);
    report.operational_via_api.push('UI: abriu Cobrar em conjunto (sem pagar)');
  }

  await browser.close();

  // ── 4) Agenda 16h (fundador / data livre) ────────────────────────────────
  // Separate quick UI script inline
  const FUND_CLINIC = '0b0843d6-5d52-42fb-8685-3cf240ad35ef';
  const FUND_UNIT = '5fe7b990-4c08-486c-a0b4-cf65ef82543b';
  const FUND_RECEP = 'qa.fundador.banho.recepcao@petmi.test';
  const FUND_STAFF = '33eb780d-c908-475d-a241-cd4c3613327b';
  const DATE = '2026-11-24'; // data livre
  let createdId = null;
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  page2.setDefaultTimeout(45000);
  page2.on('response', async (res) => {
    try {
      const u = res.url().split('?')[0];
      if (res.request().method() === 'POST' && /\/api\/hub\/appointments$/.test(u)) {
        const j = await res.json().catch(() => null);
        const a = j?.appointment || j;
        if (a?.id) {
          createdId = a.id;
          report.api.agenda_create = {
            status: res.status(),
            id: a.id,
            starts_at: a.starts_at,
            ends_at: a.ends_at,
          };
        }
      }
    } catch (_) {}
  });
  await page2.goto(`${BASE}/login`);
  await page2.getByLabel('Email', { exact: true }).fill(FUND_RECEP);
  await page2.getByRole('textbox', { name: 'Senha' }).fill(PW);
  await page2.getByRole('button', { name: /Entrar/i }).click();
  await page2.waitForURL(/\/hub/, { timeout: 90000 });
  await page2.evaluate((u) => localStorage.setItem('selected_unit_id', u), FUND_UNIT);
  await page2.goto(`${BASE}/hub/appointments?date=${DATE}`);
  for (let i = 0; i < 25; i++) {
    await page2.waitForTimeout(400);
    if (!/Carregando agenda/i.test(await page2.locator('body').innerText())) break;
  }
  await page2.getByRole('button', { name: '+ Novo' }).click();
  const dlg = page2.getByRole('dialog').filter({ hasText: /Novo agendamento|Agendamento/i }).first();
  await dlg.waitFor({ timeout: 15000 });
  await page2.waitForTimeout(600);
  const tutor2 = dlg.locator('input[placeholder*="Buscar por nome"], input[placeholder*="tutor" i]').first();
  if (await tutor2.count()) {
    await tutor2.click({ force: true });
    await tutor2.fill('QA Tutor Fundador');
    await page2.waitForTimeout(1200);
    await page2.getByText(/QA Tutor Fundador/i).first().click({ force: true });
    await page2.waitForTimeout(800);
    await page2.getByText(/QA Rex Fundador/i).first().click({ force: true }).catch(() => {});
  }
  const svc = dlg.getByPlaceholder(/Buscar e adicionar serviço/i);
  if (await svc.count()) {
    await svc.click({ force: true });
    await svc.fill('Banho');
    await page2.waitForTimeout(700);
    await page2.getByText(/^Banho/i).first().click({ force: true }).catch(() => {});
  }
  await dlg
    .locator('.nam-field')
    .filter({ hasText: /Profissional/ })
    .locator('button, input, [role=combobox]')
    .first()
    .click({ force: true })
    .catch(() => {});
  await page2.getByText(/QA Salão Fundador/i).first().click({ force: true }).catch(() => {});
  const starts = dlg.locator('#nam-starts');
  if (await starts.count()) {
    await starts.click({ force: true, clickCount: 3 });
    await starts.fill('16:00');
    await starts.press('Tab');
  }
  report.ui.agenda_form = {
    starts: await starts.inputValue().catch(() => null),
    ends: await dlg.locator('#nam-ends').inputValue().catch(() => null),
  };
  await page2.screenshot({ path: `${OUT}/agenda_before.png`, fullPage: true });
  await dlg.getByRole('button', { name: /Criar agendamento|Salvar/i }).click({ force: true });
  await page2.waitForTimeout(4000);
  await page2.goto(`${BASE}/hub/appointments?date=${DATE}`);
  for (let i = 0; i < 20; i++) {
    await page2.waitForTimeout(400);
    if (!/Carregando agenda/i.test(await page2.locator('body').innerText())) break;
  }
  await page2.screenshot({ path: `${OUT}/agenda_reload.png`, fullPage: true });
  const fundTok = await page2.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes('auth-token')) {
        try {
          return JSON.parse(localStorage.getItem(k)).access_token;
        } catch (_) {}
      }
    }
    return null;
  });
  if (fundTok) {
    const res = await page2.request.get(
      `${API}/api/hub/appointments?clinic_id=${FUND_CLINIC}&unit_id=${FUND_UNIT}&from=2026-11-24T03:00:00.000Z&to=2026-11-25T03:00:00.000Z`,
      { headers: { Authorization: 'Bearer ' + fundTok } },
    );
    const j = await res.json();
    const all = j.appointments || [];
    const target =
      all.find((a) => a.id === createdId) ||
      all.find((a) => a.hub_staff_member_id === FUND_STAFF && String(a.starts_at).includes('19:00'));
    const brt = (iso) =>
      new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
    const targetBrt = target ? `${brt(target.starts_at)} -> ${brt(target.ends_at)}` : null;
    const overnight = target
      ? String(target.starts_at).slice(0, 10) !== String(target.ends_at).slice(0, 10)
      : null;
    const slot17 = all.filter(
      (a) =>
        a.hub_staff_member_id === FUND_STAFF &&
        /17:00/.test(brt(a.starts_at)) &&
        a.id !== target?.id,
    );
    report.api.agenda_target = { id: target?.id, brt: targetBrt, overnight, hours: target ? (new Date(target.ends_at) - new Date(target.starts_at)) / 3600000 : null };
    report.api.agenda_slot17_busy = slot17.length;
    const pass =
      target &&
      !overnight &&
      /16:00/.test(targetBrt) &&
      /17:00/.test(targetBrt) &&
      slot17.length === 0;
    report.scenarios.agenda_16h.status = pass ? 'PASSOU' : target ? 'FALHOU' : 'NÃO VALIDADO';
    report.scenarios.agenda_16h.evidence = {
      form: report.ui.agenda_form,
      api: report.api.agenda_target,
      slot17_busy: slot17.length,
      create: report.api.agenda_create,
    };
    // Preserve 18h evidence note
    report.scenarios.agenda_16h.note_18h_original =
      'Registro original de 18h da rodada anterior mantido como evidência em /tmp/qa_hotel_combo/01_agenda_ends.json e screenshots';
  }
  await browser2.close();

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  report.error = String(e?.stack || e);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});

function openSessTotal(report) {
  return report.api?.dual?.openSess?.total;
}
