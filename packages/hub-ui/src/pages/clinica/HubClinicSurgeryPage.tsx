import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, Check, Link2, Play } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
  isCaseLinkResolved,
} from '../../components/clinical/ClinicalCaseLinkFields';
import {
  hubClinicalApi,
  hubEncountersApi,
  type HubEncounter,
  type HubSurgery,
  type HubSurgeryService,
} from '../../api/hubClinicalApi';
import {
  HubClinicalServicePicker,
  type ClinicalServicePick,
} from '../../components/clinical/HubClinicalServicePicker';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import { formatHospDateTime } from './hospital/hospDisplay';
import { HubWorkspaceExamOrders } from './HubWorkspaceExamOrders';
import SurgDetailForm, {
  parseSurgDetail,
  serializeSurgDetail,
  SURG_DETAIL_TABS,
  type SurgDetailDraft,
  type SurgDetailTab,
} from './surgery/SurgDetailForm';
import { futureSurgeryStartCopy, isSurgeryScheduledInFuture, SURGERY_STATUS_LABEL } from './surgery/surgDisplay';

type SurgeryPhase = 'preparation' | 'due' | 'active' | 'done';

function localYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduledYmd(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localYmd(d);
}

function resolveSurgeryPhase(surgery: HubSurgery): SurgeryPhase {
  if (surgery.status === 'completed' || surgery.status === 'cancelled') return 'done';
  if (surgery.status === 'in_progress') return 'active';
  const day = scheduledYmd(surgery.scheduled_at);
  if (day && day > localYmd()) return 'preparation';
  return 'due';
}

const SECTION_TITLE: Record<SurgDetailTab, string> = {
  pre_op: 'Pré-operatório',
  procedure: 'Procedimento',
  team: 'Equipe',
  post_op: 'Pós-operatório',
};

function money(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const HubClinicSurgeryPage: React.FC = () => {
  const { surgeryId } = useParams<{ surgeryId: string }>();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showAlert, showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const { myStaffMember, staffList } = useMyStaffMember();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const canApprovePrices = hasPermission('hub.financial.write');

  const [surgery, setSurgery] = useState<HubSurgery | null>(null);
  const [encounter, setEncounter] = useState<HubEncounter | null>(null);
  const [draft, setDraft] = useState<SurgDetailDraft | null>(null);
  const [services, setServices] = useState<HubSurgeryService[]>([]);
  const [servicePick, setServicePick] = useState<ClinicalServicePick>({
    hub_service_type_id: '',
    unit_amount: '',
  });
  const [serviceSubmitting, setServiceSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkCaseOpen, setLinkCaseOpen] = useState(false);
  const [linkCaseValue, setLinkCaseValue] = useState<ClinicalCaseLinkValue>({});
  const [linkCaseHasActive, setLinkCaseHasActive] = useState(false);
  const [linkCaseSubmitting, setLinkCaseSubmitting] = useState(false);
  const [showDaySections, setShowDaySections] = useState(false);
  const examsBlockRef = useRef<HTMLDivElement | null>(null);
  const scrolledToExamsRef = useRef(false);

  const applySurgery = (row: HubSurgery) => {
    setSurgery(row);
    const parsed = parseSurgDetail(row);
    setDraft(parsed.staffId || !myStaffMember?.id ? parsed : { ...parsed, staffId: myStaffMember.id });
  };

  const reload = async () => {
    if (!clinicId || !surgeryId) return;
    const [{ surgery: row }, svcRes] = await Promise.all([
      hubClinicalApi.getSurgery(surgeryId, clinicId),
      hubClinicalApi.listSurgeryServices(surgeryId, clinicId).catch(() => ({ services: [] as HubSurgeryService[] })),
    ]);
    applySurgery(row);
    setServices(svcRes.services ?? []);
    if (!row.hub_encounter_id) {
      setEncounter(null);
      return;
    }
    try {
      const { encounter: enc } = await hubEncountersApi.get(row.hub_encounter_id, clinicId);
      setEncounter(enc);
    } catch {
      setEncounter(null);
    }
  };

  useEffect(() => {
    if (!canRead || !clinicId || !surgeryId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload()
      .catch((e: unknown) => {
        showError((e as Error)?.message || 'Erro ao carregar cirurgia');
        setSurgery(null);
        setDraft(null);
      })
      .finally(() => setLoading(false));
  }, [clinicId, surgeryId, canRead]);

  useEffect(() => {
    if (!myStaffMember?.id) return;
    setDraft((prev) => (prev && !prev.staffId ? { ...prev, staffId: myStaffMember.id } : prev));
  }, [myStaffMember?.id]);

  useEffect(() => {
    if (searchParams.get('exames') !== '1') return;
    if (loading || !surgery) return;
    if (scrolledToExamsRef.current) return;
    scrolledToExamsRef.current = true;
    setSearchParams({}, { replace: true });
    window.requestAnimationFrame(() => {
      examsBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surgery?.id, loading]);

  const save = async () => {
    if (!clinicId || !surgery || !draft) return;
    setSaving(true);
    try {
      const payload = serializeSurgDetail(draft);
      await hubClinicalApi.patchSurgery(surgery.id, { clinic_id: clinicId, ...payload });
      await reload();
      showSuccess('Ficha da cirurgia salva');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (status: string) => {
    if (!clinicId || !surgery) return;
    const movedAgenda = status === 'in_progress' && isSurgeryScheduledInFuture(surgery);
    try {
      const res = (await hubClinicalApi.patchSurgery(surgery.id, {
        clinic_id: clinicId,
        status,
        ...(status === 'in_progress'
          ? {
              started_at: new Date().toISOString(),
              hub_staff_member_id: draft?.staffId || surgery.hub_staff_member_id || null,
            }
          : {}),
        ...(status === 'completed'
          ? {
              completed_at: new Date().toISOString(),
              ...(!surgery.hub_case_id
                ? { create_new_case: true, new_case_title: surgery.title }
                : {}),
            }
          : {}),
      })) as { surgery?: HubSurgery };
      if (res.surgery) applySurgery(res.surgery);
      else await reload();
      showSuccess(
        status === 'in_progress'
          ? movedAgenda
            ? 'Cirurgia iniciada — o horário na agenda foi atualizado e o pet entrou na sua fila'
            : 'Cirurgia iniciada'
          : status === 'completed'
            ? 'Cirurgia concluída — a ficha ficou somente leitura e o registro foi para o caso e o prontuário'
            : 'Status atualizado',
      );
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar cirurgia');
    }
  };

  const confirmStartSurgery = (fromFuture: boolean) => {
    if (fromFuture && surgery) {
      const copy = futureSurgeryStartCopy(formatHospDateTime(surgery.scheduled_at));
      showAlert({
        type: 'warning',
        title: copy.title,
        message: copy.message,
        showCancel: true,
        confirmText: 'Iniciar agora',
        cancelText: 'Manter na data',
        onConfirm: () => {
          void patchStatus('in_progress');
        },
      });
      return;
    }
    void patchStatus('in_progress');
  };

  const openLinkCase = () => {
    setLinkCaseValue({});
    setLinkCaseHasActive(false);
    setLinkCaseOpen(true);
  };

  const confirmLinkCase = async () => {
    if (!clinicId || !surgery) return;
    if (!isCaseLinkResolved(linkCaseValue, linkCaseHasActive)) {
      showError('Selecione um caso clínico ou escolha criar um novo.');
      return;
    }
    setLinkCaseSubmitting(true);
    try {
      const caseLink = linkCaseValue.create_new_case
        ? {
            create_new_case: true as const,
            new_case_title: linkCaseValue.new_case_title?.trim() || surgery.title || null,
          }
        : linkCaseValue;
      await hubClinicalApi.patchSurgery(surgery.id, {
        clinic_id: clinicId,
        ...caseLink,
      });
      setLinkCaseOpen(false);
      setLinkCaseValue({});
      await reload();
      showSuccess('Cirurgia vinculada ao caso');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao vincular caso');
    } finally {
      setLinkCaseSubmitting(false);
    }
  };

  const billingTotal = useMemo(
    () =>
      services
        .filter((s) => s.billing_mode !== 'included' && s.price_status !== 'pending_approval')
        .reduce((acc, s) => acc + Number(s.unit_amount ?? 0) * Number(s.quantity ?? 1), 0),
    [services],
  );

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  if (loading) {
    return <HubLoading variant="block" label="Carregando cirurgia…" />;
  }

  if (!surgery || !draft) {
    return (
      <div className="hub-hosp-detail">
        <Link to="/hub/clinica" className="hub-clientes__link hub-hosp-detail__back">
          <ArrowLeft size={16} aria-hidden /> Voltar ao consultório
        </Link>
        <p className="hub-clientes__muted">Cirurgia não encontrada.</p>
      </div>
    );
  }

  const petName = surgery.hub_pets?.name || 'Pet';
  const tutor = surgery.hub_guardians?.full_name;
  const caseTitle = surgery.hub_clinical_cases?.title?.trim() || null;
  const caseHref = surgery.hub_case_id ? `/hub/clinica/casos/${surgery.hub_case_id}` : null;
  const phase = resolveSurgeryPhase(surgery);
  const canEdit = canWrite && surgery.status !== 'completed' && surgery.status !== 'cancelled';
  const showIntraSections = phase === 'active' || phase === 'done' || showDaySections;

  const phaseCopy =
    phase === 'preparation'
      ? {
          title: 'Preparação',
          body: surgery.scheduled_at
            ? `Agendada para ${formatHospDateTime(surgery.scheduled_at)}. Agora o foco é pré-op, exames e cobrança — iniciar e concluir ficam para o dia do procedimento.`
            : 'Cirurgia ainda sem data firme. Complete o pré-op e a cobrança antes do dia.',
        }
      : phase === 'due'
        ? {
            title: 'Dia do procedimento',
            body: 'Quando a equipe estiver pronta, inicie a cirurgia. Pré-op e cobrança já podem estar preenchidos.',
          }
        : phase === 'active'
          ? {
              title: 'Em andamento',
              body: 'Registre procedimento, equipe e pós-op. Ao terminar, conclua — se precisar, interne no mesmo caso.',
            }
          : {
              title: surgery.status === 'cancelled' ? 'Cancelada' : 'Concluída',
              body:
                surgery.status === 'cancelled'
                  ? 'Esta ficha foi cancelada e não pode mais ser editada.'
                  : 'Procedimento encerrado — a ficha ficou somente leitura. O registro fica no caso clínico e no prontuário do pet.',
            };

  const visibleTabs = showIntraSections
    ? SURG_DETAIL_TABS
    : SURG_DETAIL_TABS.filter((t) => t.id === 'pre_op');

  return (
    <div className="hub-hosp-detail hub-surg-detail">
      <button type="button" className="hub-clientes__link-btn hub-hosp-detail__back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden /> Voltar
      </button>

      <header className="hub-hosp-detail__hero">
        <div className="hub-hosp-detail__hero-top">
          <div>
            <p className="hub-hosp-detail__eyebrow">Cirurgia</p>
            <h1 className="hub-hosp-detail__title">{surgery.title}</h1>
            <p className="hub-hosp-detail__meta">
              {petName}
              {tutor ? ` · Tutor ${tutor}` : ''}
              {surgery.scheduled_at ? ` · ${formatHospDateTime(surgery.scheduled_at)}` : ''}
              {surgery.anesthetic_risk ? ` · ASA ${surgery.anesthetic_risk}` : ''}
            </p>
            {caseHref ? (
              <p className="hub-hosp-detail__meta" style={{ marginTop: 6 }}>
                Caso:{' '}
                <Link to={caseHref} className="hub-clientes__link">
                  {caseTitle || 'Caso clínico'}
                </Link>
              </p>
            ) : (
              <p className="hub-hosp-detail__meta" style={{ marginTop: 6 }}>
                Caso ainda não vinculado
                {canWrite ? (
                  <>
                    {' · '}
                    <button type="button" className="hub-clientes__link-btn" onClick={openLinkCase}>
                      Vincular agora
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </div>
          <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${surgery.status}`}>
            {SURGERY_STATUS_LABEL[surgery.status] || surgery.status}
          </span>
        </div>

        <div className={`hub-surg-phase hub-surg-phase--${phase}`} role="status">
          <strong>{phaseCopy.title}</strong>
          <p>{phaseCopy.body}</p>
        </div>

        <div className="hub-hosp-detail__actions">
          <Link
            to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(surgery.pet_id)}&tab=cirurgias`}
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
          >
            Ver no prontuário
          </Link>
          {caseHref ? (
            <Link to={caseHref} className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
              Abrir caso clínico
            </Link>
          ) : canWrite ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={openLinkCase}
            >
              <Link2 size={14} strokeWidth={2} /> Vincular caso
            </button>
          ) : null}

          {canWrite && surgery.status === 'scheduled' && phase === 'due' ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => confirmStartSurgery(false)}
            >
              <Play size={14} strokeWidth={2} /> Iniciar cirurgia
            </button>
          ) : null}

          {canWrite && surgery.status === 'scheduled' && phase === 'preparation' ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              title="Use só se o procedimento for antecipado"
              onClick={() => confirmStartSurgery(true)}
            >
              <Play size={14} strokeWidth={2} /> Iniciar antes do dia
            </button>
          ) : null}

          {canWrite && surgery.status === 'in_progress' ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => void patchStatus('completed')}
            >
              <Check size={14} strokeWidth={2} /> Concluir cirurgia
            </button>
          ) : null}

          {canWrite && phase === 'active' ? (
            <Link
              to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(surgery.pet_id)}${surgery.hub_case_id ? `&hub_case_id=${encodeURIComponent(surgery.hub_case_id)}` : ''}`}
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            >
              <BedDouble size={14} strokeWidth={2} /> Internar pós-operatório
            </Link>
          ) : null}

          {canWrite && phase === 'done' && surgery.status === 'completed' ? (
            <Link
              to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(surgery.pet_id)}${surgery.hub_case_id ? `&hub_case_id=${encodeURIComponent(surgery.hub_case_id)}` : ''}`}
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            >
              <BedDouble size={14} strokeWidth={2} /> Internar pós-operatório
            </Link>
          ) : null}
        </div>
      </header>

      {visibleTabs.map((section) => (
        <section key={section.id} className="hub-hosp-detail__block">
          <h2 className="hub-hosp-detail__block-title">{SECTION_TITLE[section.id]}</h2>
          {section.id === 'pre_op' ? (
            <p className="hub-hosp-detail__block-lead">
              ASA, responsável e observações. Exames pré-operatórios ficam no atendimento desta cirurgia.
            </p>
          ) : null}
          <SurgDetailForm tab={section.id} draft={draft} staff={staffList} canWrite={canEdit} onChange={setDraft} />
          {section.id === 'pre_op' ? (
            <div className="hub-surg-exams" ref={examsBlockRef}>
              <h3 className="hub-surg-exams__title">Exames pré-operatórios</h3>
              {encounter ? (
                <>
                  {canEdit && !encounter.hub_staff_member_id ? (
                    <p className="hub-clientes__muted">
                      Escolha o responsável acima e salve a ficha para liberar a emissão do PDF.
                    </p>
                  ) : null}
                  <HubWorkspaceExamOrders
                    encounter={encounter}
                    clinicId={clinicId ?? ''}
                    readOnly={!canEdit}
                  />
                </>
              ) : (
                <div className="hub-surg-empty-callout">
                  <p>
                    Para solicitar exames, vincule um caso clínico — isso cria o atendimento da cirurgia.
                  </p>
                  {canWrite ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={openLinkCase}
                    >
                      <Link2 size={14} strokeWidth={2} /> Vincular caso
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ))}

      {phase === 'preparation' && !showDaySections ? (
        <div className="hub-surg-more-sections">
          <p>
            Procedimento, equipe e pós-op aparecem no dia da cirurgia. Se quiser adiantar anotações, abra as seções.
          </p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            onClick={() => setShowDaySections(true)}
          >
            Mostrar procedimento, equipe e pós-op
          </button>
        </div>
      ) : null}

      <section className="hub-hosp-detail__block hub-surg-billing">
        <div className="hub-surg-billing__head">
          <div>
            <h2 className="hub-hosp-detail__block-title">Cobrança</h2>
            <p className="hub-hosp-detail__block-lead">
              Itens do grupo Cirurgia. O que veio da agenda já entra na comanda sem duplicar.
            </p>
          </div>
          {services.length > 0 ? (
            <div className="hub-surg-billing__total">
              <span>Total previsto</span>
              <strong>{money(billingTotal)}</strong>
            </div>
          ) : null}
        </div>

        {services.length === 0 ? (
          <p className="hub-clientes__muted">Nenhum serviço cobrável ainda.</p>
        ) : (
          <div className="hub-surg-billing__table-wrap">
            <table className="hub-surg-billing__table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Origem</th>
                  <th>Status</th>
                  <th className="hub-surg-billing__num">Valor</th>
                  <th className="hub-clientes__th-actions"> </th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const fromAgenda = Boolean(s.hub_appointment_service_id);
                  const included = s.billing_mode === 'included';
                  const pending = s.price_status === 'pending_approval';
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="hub-surg-billing__name">{s.service_name}</span>
                        {Number(s.quantity ?? 1) !== 1 ? (
                          <small className="hub-clientes__muted"> × {s.quantity}</small>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`hub-clientes__pill ${fromAgenda ? 'hub-dayboard__pill--open' : 'hub-dayboard__pill--none'}`}
                        >
                          {fromAgenda ? 'Agenda' : 'Ficha'}
                        </span>
                      </td>
                      <td>
                        {included ? (
                          <span className="hub-clientes__muted">Incluso</span>
                        ) : pending ? (
                          <span className="hub-clientes__muted">Pendente de aprovação</span>
                        ) : (
                          <span className="hub-clientes__muted">Confirmado</span>
                        )}
                      </td>
                      <td className="hub-surg-billing__num">
                        {included ? '—' : money(Number(s.unit_amount ?? 0) * Number(s.quantity ?? 1))}
                      </td>
                      <td className="hub-clientes__td-actions">
                        <div className="hub-clientes__td-actions-inner">
                          {canEdit && canApprovePrices && pending ? (
                            <button
                              type="button"
                              className="hub-quote-detail__text-btn"
                              onClick={() => {
                                if (!clinicId || !surgeryId) return;
                                void hubClinicalApi
                                  .approveSurgeryServicePrice(surgeryId, s.id, clinicId)
                                  .then(() => {
                                    showSuccess('Preço aprovado');
                                    return reload();
                                  })
                                  .catch((e: unknown) =>
                                    showError((e as Error)?.message || 'Erro ao aprovar'),
                                  );
                              }}
                            >
                              Aprovar
                            </button>
                          ) : null}
                          {canEdit && !fromAgenda ? (
                            <button
                              type="button"
                              className="hub-quote-detail__text-btn"
                              onClick={() => {
                                if (!clinicId || !surgeryId) return;
                                void hubClinicalApi
                                  .deleteSurgeryService(surgeryId, s.id, clinicId)
                                  .then(() => reload())
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && clinicId ? (
          <div className="hub-surg-billing__add">
            <HubClinicalServicePicker
              clinicId={clinicId}
              group="cirurgia"
              value={servicePick}
              onChange={setServicePick}
              label="Adicionar serviço"
              disabled={serviceSubmitting}
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              disabled={serviceSubmitting || !servicePick.hub_service_type_id || !surgeryId}
              onClick={() => {
                if (!clinicId || !surgeryId || !servicePick.hub_service_type_id) return;
                setServiceSubmitting(true);
                void hubClinicalApi
                  .createSurgeryService(surgeryId, {
                    clinic_id: clinicId,
                    hub_service_type_id: servicePick.hub_service_type_id,
                    unit_amount: servicePick.unit_amount
                      ? Number(servicePick.unit_amount.replace(',', '.'))
                      : null,
                  })
                  .then(() => {
                    setServicePick({ hub_service_type_id: '', unit_amount: '' });
                    showSuccess('Serviço adicionado');
                    return reload();
                  })
                  .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao adicionar serviço'))
                  .finally(() => setServiceSubmitting(false));
              }}
            >
              {serviceSubmitting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>
        ) : null}
      </section>

      {canEdit ? (
        <div className="hub-surg-savebar">
          <p className="hub-clientes__muted">Pré-op, procedimento, equipe e pós-op são salvos juntos.</p>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar ficha'}
          </button>
        </div>
      ) : (
        <div className="hub-surg-savebar">
          <p className="hub-clientes__muted">
            Ficha encerrada. Consulte o caso ou o prontuário — internar pós-op ainda é possível.
          </p>
          <Link
            to={`/hub/clinica/prontuarios?petId=${encodeURIComponent(surgery.pet_id)}&tab=cirurgias`}
            className="hub-clientes__btn hub-clientes__btn--ghost"
          >
            Abrir prontuário
          </Link>
        </div>
      )}

      <HubSidePanel
        open={linkCaseOpen}
        onClose={() => {
          setLinkCaseOpen(false);
          setLinkCaseValue({});
        }}
        title={`Vincular caso — ${surgery.title}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton
              onClick={() => {
                setLinkCaseOpen(false);
                setLinkCaseValue({});
              }}
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={linkCaseSubmitting || !isCaseLinkResolved(linkCaseValue, linkCaseHasActive)}
              onClick={() => void confirmLinkCase()}
            >
              {linkCaseSubmitting ? 'Salvando…' : 'Vincular'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          {clinicId ? (
            <ClinicalCaseLinkFields
              clinicId={clinicId}
              petId={surgery.pet_id}
              value={linkCaseValue}
              onChange={setLinkCaseValue}
              onHasActiveCases={setLinkCaseHasActive}
              disabled={linkCaseSubmitting}
              suggestedTitle={surgery.title}
              emptyActiveHint="Nenhum caso ativo — um novo caso será criado para esta cirurgia."
              blankTitleHint="Se ficar em branco, usamos o nome do procedimento."
            />
          ) : null}
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicSurgeryPage;
