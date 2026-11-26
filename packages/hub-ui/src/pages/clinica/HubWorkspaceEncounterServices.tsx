import React, { useCallback, useEffect, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import {
  HubClinicalServicePicker,
  type ClinicalServicePick,
} from '../../components/clinical/HubClinicalServicePicker';
import {
  hubClinicalApi,
  type HubClinicalBillingMode,
  type HubEncounter,
  type HubEncounterService,
} from '../../api/hubClinicalApi';
import { usePermissions } from '@petimi/web-core';

function formatMoneyBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Props = {
  encounter: HubEncounter;
  clinicId: string;
  readOnly?: boolean;
  onClinicalRefresh?: () => void;
};

export function HubWorkspaceEncounterServices({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: Props) {
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission('hub.financial.write');
  const [services, setServices] = useState<HubEncounterService[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pick, setPick] = useState<ClinicalServicePick>({
    hub_service_type_id: '',
    unit_amount: '',
  });
  const [quantity, setQuantity] = useState('1');
  const [billingMode, setBillingMode] = useState<HubClinicalBillingMode>('charge');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubClinicalApi.listEncounterServices(encounter.id, clinicId);
      setServices(res.services ?? []);
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [encounter.id, clinicId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addService = async () => {
    if (!pick.hub_service_type_id) return;
    const qty = Number(String(quantity).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      showError('Informe uma quantidade válida');
      return;
    }
    setSubmitting(true);
    try {
      await hubClinicalApi.createEncounterService(encounter.id, {
        clinic_id: clinicId,
        hub_service_type_id: pick.hub_service_type_id,
        unit_amount: pick.unit_amount ? Number(pick.unit_amount.replace(',', '.')) : null,
        quantity: qty,
        billing_mode: billingMode,
      });
      setPick({ hub_service_type_id: '', unit_amount: '' });
      setQuantity('1');
      setBillingMode('charge');
      showSuccess('Serviço lançado na consulta');
      await reload();
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao lançar serviço');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hub-cws-encounter-services">
      <p className="hub-cws-an-block__hint">
        Procedimentos e serviços do grupo Clínica realizados nesta consulta. Entram na comanda aberta
        (exceto «Incluso»). Aplicação de medicação continua em Aplicado agora · Medicação. Pedido de
        exame (PDF) não cobra — para cobrar, lance o serviço aqui.
      </p>

      {loading && services.length === 0 ? (
        <p className="hub-clientes__muted">Carregando…</p>
      ) : services.length === 0 ? (
        <p className="hub-clientes__muted">Nenhum serviço lançado ainda.</p>
      ) : (
        <div className="hub-checkout-drawer__items-table-wrap">
          <table className="hub-checkout-drawer__items-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Qtd</th>
                <th>Valor</th>
                <th>Modo</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.service_name}</td>
                  <td>{Number(s.quantity)}</td>
                  <td>{formatMoneyBrl(Number(s.unit_amount))}</td>
                  <td>{s.billing_mode === 'included' ? 'Incluso' : 'Cobrar'}</td>
                  <td>
                    {s.price_status === 'pending_approval' ? (
                      <span className="hub-clientes__pill hub-finance-page__pill--warning">
                        Aguardando aprovação
                      </span>
                    ) : (
                      <span className="hub-clientes__muted">Confirmado</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canApprove && s.price_status === 'pending_approval' ? (
                        <button
                          type="button"
                          className="hub-quote-detail__text-btn"
                          onClick={() => {
                            void hubClinicalApi
                              .approveEncounterServicePrice(encounter.id, s.id, clinicId)
                              .then(() => {
                                showSuccess('Preço aprovado');
                                return reload().then(() => onClinicalRefresh?.());
                              })
                              .catch((e: unknown) =>
                                showError((e as Error)?.message || 'Erro ao aprovar'),
                              );
                          }}
                        >
                          Aprovar
                        </button>
                      ) : null}
                      {!readOnly ? (
                        <button
                          type="button"
                          className="hub-quote-detail__text-btn"
                          onClick={() => {
                            void hubClinicalApi
                              .deleteEncounterService(encounter.id, s.id, clinicId)
                              .then(() => {
                                showSuccess('Serviço removido');
                                return reload().then(() => onClinicalRefresh?.());
                              })
                              .catch((e: unknown) =>
                                showError((e as Error)?.message || 'Erro ao remover'),
                              );
                          }}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly ? (
        <div className="hub-surg-billing__add" style={{ marginTop: 12 }}>
          <HubClinicalServicePicker
            clinicId={clinicId}
            group="clinica"
            value={pick}
            onChange={setPick}
            label="Adicionar serviço"
            disabled={submitting}
            excludeEncounterApplication
            id="encounter-svc"
          />
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="encounter-svc-qty">Quantidade</label>
            <input
              id="encounter-svc-qty"
              value={quantity}
              disabled={submitting}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="encounter-svc-mode">Cobrança</label>
            <select
              id="encounter-svc-mode"
              value={billingMode}
              disabled={submitting}
              onChange={(e) => setBillingMode(e.target.value as HubClinicalBillingMode)}
            >
              <option value="charge">Cobrar</option>
              <option value="included">Incluso (sem cobrança)</option>
            </select>
          </div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            disabled={submitting || !pick.hub_service_type_id}
            onClick={() => void addService()}
          >
            {submitting ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
