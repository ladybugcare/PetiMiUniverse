import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  hubBoardingApi,
  type BoardingDaycarePeriod,
  type BoardingDrawerResponse,
  type BoardingSpace,
} from '../../api/hubBoardingApi';
import { hubPackagesApi, type HubPackageBalance } from '../../api/hubPackagesApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { todayYmd, formatYmd } from '../../utils/hubCalendar';
import BoardingBelongingsSection from './BoardingBelongingsSection';
import BoardingTutorReportSection from './BoardingTutorReportSection';
import BoardingStockConsumption from './BoardingStockConsumption';
import {
  centsToInput,
  formatBRL,
  formatCents,
  formatDateTimeShort,
  isCapacityWarningError,
  parseBRLToCents,
} from './boardingCareUi';

function packageBalanceLabel(b: HubPackageBalance): string {
  const pkg = Array.isArray(b.hub_packages) ? b.hub_packages[0] : b.hub_packages;
  const name = pkg?.name ?? 'Pacote';
  const left = Number(b.sessions_remaining ?? 0);
  return `${name} (${left} ${left === 1 ? 'restante' : 'restantes'})`;
}

type Props = {
  clinicId: string;
  drawer: BoardingDrawerResponse;
  canManage: boolean;
  canWriteInventory?: boolean;
  onChanged: () => void | Promise<void>;
};

const RATE_SOURCE_LABELS: Record<string, string> = {
  appointment: 'do agendamento',
  service_type: 'da tabela de serviços',
  manual: 'definido manualmente',
};

function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: formatYmd(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function joinIso(date: string, time: string): string | null {
  if (!date) return null;
  return new Date(`${date}T${time || '12:00'}:00`).toISOString();
}

const BoardingStayDetailsTab: React.FC<Props> = ({ clinicId, drawer, canManage, canWriteInventory, onChanged }) => {
  const { showError, showSuccess } = useAlert();
  const rsv = drawer.reservation;
  const stage = String(rsv.status);
  const active = stage === 'reserved' || stage === 'checked_in';
  const editable = canManage && active;
  const isHotel = rsv.mode === 'hotel';
  const settings = drawer.unit_settings;
  const pricing = drawer.pricing;
  const extras = drawer.extras ?? [];

  const [busy, setBusy] = useState(false);
  const [capacityPending, setCapacityPending] = useState<{ space_id: string | null; message: string } | null>(null);
  const [spaces, setSpaces] = useState<BoardingSpace[]>([]);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);

  useEffect(() => {
    if (!editable) return;
    void hubBoardingApi
      .spaces(clinicId, { unitId: rsv.unit_id ?? undefined })
      .then((r) => setSpaces((r.spaces ?? []).filter((s) => s.active)))
      .catch(() => setSpaces([]));
    void hubServiceTypesApi
      .list(clinicId)
      .then((r) => setServiceTypes((r.service_types ?? []).filter((s) => s.active)))
      .catch(() => setServiceTypes([]));
  }, [clinicId, editable, rsv.unit_id]);

  const patch = async (payload: Parameters<typeof hubBoardingApi.patchReservation>[1], okMsg?: string) => {
    setBusy(true);
    try {
      await hubBoardingApi.patchReservation(rsv.id, payload);
      if (okMsg) showSuccess(okMsg);
      await onChanged();
      return true;
    } catch (e: unknown) {
      if (isCapacityWarningError(e) && payload.space_id !== undefined) {
        setCapacityPending({ space_id: payload.space_id ?? null, message: (e as Error).message });
      } else {
        showError((e as Error)?.message || 'Erro ao atualizar a estadia');
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Datas
  const inParts = splitIso(rsv.expected_check_in);
  const outParts = splitIso(rsv.expected_check_out);
  const [inDate, setInDate] = useState(inParts.date);
  const [inTime, setInTime] = useState(inParts.time);
  const [outDate, setOutDate] = useState(outParts.date);
  const [outTime, setOutTime] = useState(outParts.time);
  const datesChanged =
    inDate !== inParts.date || inTime !== inParts.time || outDate !== outParts.date || outTime !== outParts.time;

  // Diária
  const [rateInput, setRateInput] = useState(centsToInput(rsv.daily_rate_cents));
  useEffect(() => setRateInput(centsToInput(rsv.daily_rate_cents)), [rsv.daily_rate_cents]);

  const groupForMode = isHotel ? 'hotel' : 'creche';
  const rateServiceOptions: HubComboboxOption[] = useMemo(
    () => serviceTypes.filter((s) => s.service_group === groupForMode).map((s) => ({ value: s.id, label: s.name })),
    [serviceTypes, groupForMode],
  );
  const extraServiceOptions: HubComboboxOption[] = useMemo(
    () =>
      serviceTypes
        .filter((s) => s.service_group !== 'hotel' && s.service_group !== 'creche')
        .map((s) => ({ value: s.id, label: s.name })),
    [serviceTypes],
  );

  const spaceOptions = spaces.filter((s) => s.mode === 'shared' || s.mode === rsv.mode);
  const shifts = settings?.daycare_shifts ?? [];

  // Adicionais
  const [extraServiceId, setExtraServiceId] = useState('');
  const [extraDesc, setExtraDesc] = useState('');
  const [extraValue, setExtraValue] = useState('');
  const [extraQty, setExtraQty] = useState('1');

  // Pacote (saldo do tutor/pet cobrindo a linha de hospedagem na comanda)
  const [packageBalances, setPackageBalances] = useState<HubPackageBalance[]>([]);
  const [packageBalanceId, setPackageBalanceId] = useState('');
  const [packageBusy, setPackageBusy] = useState(false);
  const petId = drawer.pet?.id ?? rsv.pet_id ?? null;
  const serviceTypeId = rsv.hub_service_type_id ?? null;
  const canApplyPackage = canManage && stage === 'checked_out' && Boolean(petId) && Boolean(serviceTypeId);

  useEffect(() => {
    if (!canApplyPackage || !petId) {
      setPackageBalances([]);
      setPackageBalanceId('');
      return;
    }
    let cancelled = false;
    void hubPackagesApi
      .listPetBalances(clinicId, petId)
      .then((r) => {
        if (cancelled) return;
        const eligible = (r.balances ?? []).filter(
          (b) => b.hub_service_type_id === serviceTypeId && Number(b.sessions_remaining ?? 0) > 0,
        );
        setPackageBalances(eligible);
      })
      .catch(() => {
        if (!cancelled) setPackageBalances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canApplyPackage, clinicId, petId, serviceTypeId]);

  const applyPackage = async (balanceId: string | null) => {
    setPackageBusy(true);
    try {
      const result = await hubBoardingApi.applyPackageOnStay(rsv.id, {
        clinic_id: clinicId,
        package_balance_id: balanceId,
      });
      showSuccess(
        balanceId
          ? `Pacote aplicado — linha da hospedagem em ${formatBRL(result.line_total)}`
          : 'Pacote removido da linha de hospedagem',
      );
      setPackageBalanceId(balanceId ?? '');
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao aplicar pacote');
    } finally {
      setPackageBusy(false);
    }
  };

  const addExtra = async () => {
    const qty = Math.max(0.01, parseFloat(extraQty.replace(',', '.')) || 1);
    const cents = parseBRLToCents(extraValue);
    if (!extraServiceId && (!extraDesc.trim() || cents == null)) return;
    setBusy(true);
    try {
      await hubBoardingApi.createExtra(rsv.id, {
        clinic_id: clinicId,
        ...(extraServiceId ? { hub_service_type_id: extraServiceId } : {}),
        ...(extraDesc.trim() ? { description: extraDesc.trim() } : {}),
        ...(cents != null ? { unit_amount_cents: cents } : {}),
        quantity: qty,
        service_date: todayYmd(),
      });
      setExtraServiceId('');
      setExtraDesc('');
      setExtraValue('');
      setExtraQty('1');
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao adicionar');
    } finally {
      setBusy(false);
    }
  };

  const removeExtra = async (id: string) => {
    setBusy(true);
    try {
      await hubBoardingApi.deleteExtra(id, clinicId);
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover');
    } finally {
      setBusy(false);
    }
  };

  const qtyLabel = isHotel
    ? `${pricing?.quantity ?? 0} ${pricing?.quantity === 1 ? 'diária' : 'diárias'}`
    : `${pricing?.quantity ?? 0} ${pricing?.quantity === 1 ? 'dia' : 'dias'}`;

  return (
    <>
      <section className="hub-grooming-drawer__section">
        <h4 className="hub-grooming-drawer__heading">Datas</h4>
        <div className="hub-boarding-care__grid">
          <HubDateField
            id="stay-in-date"
            label="Entrada prevista"
            valueIso={inDate}
            onChangeIso={setInDate}
            showTodayButton={false}
            disabled={!editable || stage !== 'reserved'}
          />
          <HubTimeField
            id="stay-in-time"
            label="Horário"
            valueHm={inTime}
            onChangeHm={setInTime}
            minuteStep={5}
            disabled={!editable || stage !== 'reserved'}
          />
          <HubDateField
            id="stay-out-date"
            label="Saída prevista"
            valueIso={outDate}
            onChangeIso={setOutDate}
            showTodayButton={false}
            disabled={!editable}
          />
          <HubTimeField
            id="stay-out-time"
            label="Horário"
            valueHm={outTime}
            onChangeHm={setOutTime}
            minuteStep={5}
            disabled={!editable}
          />
        </div>
        {rsv.checked_in_at || rsv.checked_out_at ? (
          <p className="hub-grooming-drawer__hint">
            {rsv.checked_in_at ? `Entrou em ${formatDateTimeShort(rsv.checked_in_at)}` : ''}
            {rsv.checked_out_at ? ` · Saiu em ${formatDateTimeShort(rsv.checked_out_at)}` : ''}
          </p>
        ) : null}
        {editable && datesChanged ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={busy}
            onClick={() =>
              void patch(
                {
                  clinic_id: clinicId,
                  ...(stage === 'reserved' ? { expected_check_in: joinIso(inDate, inTime) } : {}),
                  expected_check_out: joinIso(outDate, outTime),
                },
                'Datas atualizadas',
              )
            }
          >
            Salvar datas
          </button>
        ) : null}
      </section>

      <section className="hub-grooming-drawer__section">
        <h4 className="hub-grooming-drawer__heading">{isHotel ? 'Acomodação' : 'Acomodação e turno'}</h4>
        <div className="hub-boarding-care__grid">
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="stay-space">
              Acomodação
            </label>
            {editable ? (
              <HubSearchableCombobox
                id="stay-space"
                options={spaceOptions.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.current ?? 0}/${s.capacity})`,
                }))}
                value={rsv.space_id ?? ''}
                disabled={busy}
                placeholder="Sem acomodação definida"
                searchPlaceholder="Buscar acomodação…"
                clearable
                onChange={(val) => void patch({ clinic_id: clinicId, space_id: val || null }, 'Acomodação atualizada')}
              />
            ) : (
              <p className="hub-grooming-drawer__fact-value">{drawer.space?.name ?? 'Sem acomodação definida'}</p>
            )}
          </div>
          {!isHotel ? (
            <>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="stay-period">
                  Período
                </label>
                <HubSearchableCombobox
                  id="stay-period"
                  options={[
                    { value: 'full_day', label: 'Período integral' },
                    { value: 'half_day', label: 'Meio período' },
                  ]}
                  value={rsv.daycare_period ?? 'full_day'}
                  disabled={!editable || busy}
                  placeholder="Período"
                  clearable={false}
                  onChange={(val) =>
                    void patch(
                      { clinic_id: clinicId, daycare_period: (val || 'full_day') as BoardingDaycarePeriod },
                      'Período atualizado',
                    )
                  }
                />
              </div>
              {shifts.length ? (
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="stay-shift">
                    Turno
                  </label>
                  <HubSearchableCombobox
                    id="stay-shift"
                    options={shifts.map((s) => ({
                      value: s.key,
                      label: `${s.label} (${s.start}–${s.end})`,
                    }))}
                    value={rsv.daycare_shift_key ?? ''}
                    disabled={!editable || busy}
                    placeholder="Sem turno"
                    searchPlaceholder="Buscar turno…"
                    clearable
                    onChange={(val) =>
                      void patch({ clinic_id: clinicId, daycare_shift_key: val || null }, 'Turno atualizado')
                    }
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {capacityPending ? (
          <div className="hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
            <p className="hub-grooming-drawer__hint">{capacityPending.message}</p>
            <div className="hub-clientes__btn-row">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await patch(
                    { clinic_id: clinicId, space_id: capacityPending.space_id, force_capacity: true },
                    'Acomodação atualizada',
                  );
                  if (ok) setCapacityPending(null);
                }}
              >
                Confirmar mesmo assim
              </button>
              <button type="button" className="hub-clientes__link-btn" onClick={() => setCapacityPending(null)}>
                Escolher outra
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="hub-grooming-drawer__section">
        <div className="hub-grooming-drawer__heading-row">
          <h4 className="hub-grooming-drawer__heading">Valor</h4>
          {pricing ? <span className="hub-grooming-drawer__count">Estimativa: {formatBRL(pricing.total)}</span> : null}
        </div>
        <ul className="hub-grooming-drawer__lines">
          <li className="hub-grooming-drawer__line">
            <span className="hub-grooming-drawer__line-name">
              {drawer.service_type?.name ?? (isHotel ? 'Hospedagem' : 'Creche')}
              <span className="hub-grooming-drawer__line-state">
                {' '}
                · {qtyLabel} × {formatCents(rsv.daily_rate_cents)}
              </span>
            </span>
            <span className="hub-grooming-drawer__line-price">{formatBRL(pricing?.base)}</span>
          </li>
          {extras.map((ex) => (
            <li key={ex.id} className="hub-grooming-drawer__line">
              <span className="hub-grooming-drawer__line-name">
                {ex.description}
                <span className="hub-grooming-drawer__line-state">
                  {' '}
                  · {Number(ex.quantity)} × {formatCents(ex.unit_amount_cents)}
                </span>
              </span>
              <span className="hub-grooming-drawer__line-price">
                {formatCents(Math.round(Number(ex.quantity) * ex.unit_amount_cents))}
              </span>
              {editable || stage === 'checked_out' ? (
                <button
                  type="button"
                  className="hub-clientes__icon-btn"
                  disabled={busy || !canManage}
                  aria-label={`Remover ${ex.description}`}
                  onClick={() => void removeExtra(ex.id)}
                >
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="hub-grooming-drawer__subtotal">
          {rsv.rate_source ? `Diária ${RATE_SOURCE_LABELS[rsv.rate_source] ?? ''}. ` : ''}
          {isHotel && pricing?.cutoff_time
            ? `Saída depois das ${pricing.cutoff_time.slice(0, 5)} conta mais uma diária.`
            : ''}
        </p>

        {editable ? (
          <div className="hub-boarding-stay__form">
            <div className="hub-boarding-care__grid">
              <div className="hub-clientes__field">
                <span className="hub-clientes__label">{isHotel ? 'Serviço de hospedagem' : 'Serviço de creche'}</span>
                <HubSearchableCombobox
                  id="stay-rate-service"
                  className="hub-combobox--clientes"
                  options={rateServiceOptions}
                  value={rsv.hub_service_type_id ?? ''}
                  onChange={(v) =>
                    void patch({ clinic_id: clinicId, hub_service_type_id: v || null }, 'Serviço atualizado')
                  }
                  placeholder="Selecionar serviço"
                  allowCreate={false}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="stay-rate">
                  {isHotel ? 'Valor da diária (R$)' : 'Valor do dia (R$)'}
                </label>
                <input
                  id="stay-rate"
                  className="hub-clientes__input"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                />
              </div>
            </div>
            <div className="hub-clientes__btn-row">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={busy || parseBRLToCents(rateInput) === (rsv.daily_rate_cents ?? null)}
                onClick={() =>
                  void patch({ clinic_id: clinicId, daily_rate_cents: parseBRLToCents(rateInput) }, 'Valor atualizado')
                }
              >
                Salvar valor
              </button>
              <button
                type="button"
                className="hub-clientes__link-btn"
                disabled={busy}
                onClick={() => void patch({ clinic_id: clinicId, reprice: true }, 'Valor recalculado pela tabela')}
              >
                Recalcular pela tabela
              </button>
            </div>
          </div>
        ) : null}

        {canApplyPackage ? (
          <div className="hub-boarding-stay__form">
            <span className="hub-clientes__label">Pacote</span>
            {packageBalances.length ? (
              <>
                <HubSearchableCombobox
                  id="stay-package-balance"
                  className="hub-combobox--clientes"
                  options={packageBalances.map((b) => ({ value: b.id, label: packageBalanceLabel(b) }))}
                  value={packageBalanceId}
                  onChange={setPackageBalanceId}
                  placeholder="Saldo de pacote do pet"
                  allowCreate={false}
                />
                <div className="hub-clientes__btn-row">
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                    disabled={packageBusy || !packageBalanceId}
                    onClick={() => void applyPackage(packageBalanceId || null)}
                  >
                    {packageBusy ? 'Aplicando…' : 'Aplicar pacote'}
                  </button>
                  <button
                    type="button"
                    className="hub-clientes__link-btn"
                    disabled={packageBusy}
                    onClick={() => void applyPackage(null)}
                  >
                    Remover pacote
                  </button>
                </div>
                <p className="hub-grooming-drawer__hint">
                  Abre a comanda da estadia e zera a linha de hospedagem com o saldo do pacote (mesmo fluxo do Caixa).
                </p>
              </>
            ) : (
              <p className="hub-grooming-drawer__hint">
                Nenhum saldo de pacote elegível para este serviço. Venda o pacote no Caixa ou confira o serviço da
                hospedagem.
              </p>
            )}
          </div>
        ) : canManage && stage !== 'checked_out' && serviceTypeId ? (
          <p className="hub-grooming-drawer__hint">Aplicar pacote na hospedagem fica disponível após o check-out.</p>
        ) : null}

        {canManage && (active || stage === 'checked_out') ? (
          <div className="hub-boarding-stay__form">
            <span className="hub-clientes__label">Adicional</span>
            <HubSearchableCombobox
              id="stay-extra-service"
              className="hub-combobox--clientes"
              options={extraServiceOptions}
              value={extraServiceId}
              onChange={setExtraServiceId}
              placeholder="Serviço do catálogo (banho, transporte…)"
              allowCreate={false}
            />
            <div className="hub-boarding-care__add-row">
              <input
                className="hub-clientes__input hub-boarding-care__inline-input"
                value={extraDesc}
                placeholder={extraServiceId ? 'Descrição (opcional)' : 'Ou descreva o adicional'}
                aria-label="Descrição do adicional"
                onChange={(e) => setExtraDesc(e.target.value)}
              />
              <input
                className="hub-clientes__input hub-boarding-belongings__qty"
                inputMode="decimal"
                value={extraValue}
                placeholder={extraServiceId ? 'Valor da tabela' : 'Valor'}
                aria-label="Valor unitário"
                onChange={(e) => setExtraValue(e.target.value)}
              />
              <input
                className="hub-clientes__input hub-boarding-belongings__qty"
                inputMode="decimal"
                value={extraQty}
                aria-label="Quantidade"
                onChange={(e) => setExtraQty(e.target.value)}
              />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={busy || (!extraServiceId && (!extraDesc.trim() || parseBRLToCents(extraValue) == null))}
                onClick={() => void addExtra()}
              >
                <Plus size={14} aria-hidden />
                Adicionar
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <BoardingBelongingsSection
        clinicId={clinicId}
        reservationId={rsv.id}
        belongings={drawer.belongings ?? []}
        variant={canManage && active ? 'manage' : stage === 'checked_out' && canManage ? 'checkout' : 'view'}
        onChanged={onChanged}
      />

      {stage === 'checked_in' || stage === 'checked_out' ? (
        <BoardingTutorReportSection
          clinicId={clinicId}
          reservationId={rsv.id}
          guardianId={drawer.guardian?.id}
          petId={drawer.pet?.id}
          kinds={stage === 'checked_out' ? ['stay_summary', 'daily'] : ['daily', 'pickup', 'stay_summary']}
          history={drawer.tutor_reports ?? []}
          onSent={() => void onChanged()}
        />
      ) : null}

      {canWriteInventory && stage !== 'cancelled' ? (
        <BoardingStockConsumption clinicId={clinicId} reservationId={rsv.id} />
      ) : null}
    </>
  );
};

export default BoardingStayDetailsTab;
