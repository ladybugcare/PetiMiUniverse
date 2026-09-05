import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, BedDouble, FileText, Link2, LogOut } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { hubClinicalApi, type HubHospitalBed, type HubHospitalization } from '../../api/hubClinicalApi';
import { getSelectedUnitId, useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
  isCaseLinkResolved,
} from '../../components/clinical/ClinicalCaseLinkFields';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import {
  BED_STATUS_LABEL,
  buildHospAdmitReason,
  formatHospDate,
  HOSP_STATUS_LABEL,
  petInitials,
} from './hospital/hospDisplay';
import HospBedAssignPanel from './hospital/HospBedAssignPanel';
import HospAdmitForm, { type HospAdmitDraft } from './hospital/HospAdmitForm';

export type HubClinicHospitalPageProps = {
  /** Lista embutida no Consultório (sem toolbar primária de admissão). */
  embedded?: boolean;
  /** Controle externo do painel "Internar pet". */
  admitOpen?: boolean;
  onAdmitOpenChange?: (open: boolean) => void;
  /** Prefill ao abrir a partir do Consultório / links. */
  presetPetId?: string | null;
  presetCaseId?: string | null;
};

const HubClinicHospitalPage: React.FC<HubClinicHospitalPageProps> = ({
  embedded = false,
  admitOpen: admitOpenProp,
  onAdmitOpenChange,
  presetPetId,
  presetCaseId,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const { myStaffMember, staffList } = useMyStaffMember();
  const [searchParams] = useSearchParams();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const [beds, setBeds] = useState<HubHospitalBed[]>([]);
  const [hosp, setHosp] = useState<HubHospitalization[]>([]);
  const [bedCode, setBedCode] = useState('');
  const [bedSubmitting, setBedSubmitting] = useState(false);
  const [admitOpenInternal, setAdmitOpenInternal] = useState(false);
  const admitControlled = admitOpenProp !== undefined;
  const admitOpen = admitControlled ? Boolean(admitOpenProp) : admitOpenInternal;
  const setAdmitOpen = (open: boolean) => {
    onAdmitOpenChange?.(open);
    if (!admitControlled) setAdmitOpenInternal(open);
  };
  const emptyAdmitDraft = (): HospAdmitDraft => ({
    guardianId: '',
    petId: '',
    bedId: '',
    reasonKey: '',
    reasonDetail: '',
    notes: '',
    staffId: myStaffMember?.id ?? '',
    caseLink: {},
  });
  const [admitDraft, setAdmitDraft] = useState<HospAdmitDraft>(emptyAdmitDraft);
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [dischargeHosp, setDischargeHosp] = useState<HubHospitalization | null>(null);
  const [dischargeStatus, setDischargeStatus] = useState<'discharged' | 'death' | 'transferred'>('discharged');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [dischargeSubmitting, setDischargeSubmitting] = useState(false);

  const [assignBedHosp, setAssignBedHosp] = useState<HubHospitalization | null>(null);
  const [linkCaseHosp, setLinkCaseHosp] = useState<HubHospitalization | null>(null);
  const [linkCaseValue, setLinkCaseValue] = useState<ClinicalCaseLinkValue>({});
  const [linkCaseHasActive, setLinkCaseHasActive] = useState(false);
  const [linkCaseSubmitting, setLinkCaseSubmitting] = useState(false);

  const reload = async () => {
    if (!clinicId) return;
    const [b, h] = await Promise.all([
      hubClinicalApi.listBeds(clinicId),
      hubClinicalApi.listHospitalizations(clinicId, 'active'),
    ]);
    setBeds(b.beds ?? []);
    setHosp(h.hospitalizations ?? []);
  };

  useEffect(() => {
    if (!canRead) return;
    void reload().catch(() => {});
  }, [clinicId, unitId, canRead]);

  useEffect(() => {
    if (!admitOpen) return;
    setAdmitDraft((prev) => ({
      ...prev,
      petId: presetPetId || prev.petId,
      caseLink: presetCaseId ? { hub_case_id: presetCaseId } : prev.caseLink,
      staffId: prev.staffId || myStaffMember?.id || '',
    }));
  }, [presetPetId, presetCaseId, admitOpen, myStaffMember?.id]);

  useEffect(() => {
    if (embedded) return;
    const qPet = searchParams.get('pet_id');
    const qCase = searchParams.get('hub_case_id');
    if (!qPet && !qCase) return;
    setAdmitOpen(true);
    setAdmitDraft((prev) => ({
      ...prev,
      petId: qPet || prev.petId,
      caseLink: qCase ? { hub_case_id: qCase } : prev.caseLink,
    }));
  }, []);

  const addBed = async () => {
    const code = bedCode.trim();
    if (!clinicId) {
      showError('Selecione uma clínica antes de cadastrar o leito.');
      return;
    }
    if (!code) {
      showError('Informe o código do leito.');
      return;
    }
    setBedSubmitting(true);
    try {
      await hubClinicalApi.createBed({
        clinic_id: clinicId,
        code,
        label: code,
        unit_id: getSelectedUnitId(),
      });
      setBedCode('');
      await reload();
      showSuccess('Leito criado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar leito');
    } finally {
      setBedSubmitting(false);
    }
  };

  const resetAdmitForm = () => {
    setAdmitDraft(emptyAdmitDraft());
    setHasActiveCases(false);
  };

  const admitReason = buildHospAdmitReason(admitDraft.reasonKey, admitDraft.reasonDetail);

  const admit = async () => {
    if (!clinicId || !admitDraft.guardianId || !admitDraft.petId || !admitReason) return;
    if (!isCaseLinkResolved(admitDraft.caseLink, hasActiveCases)) {
      showError('Selecione um caso clínico ou escolha criar um novo antes de continuar.');
      return;
    }
    const caseLink = admitDraft.caseLink.create_new_case
      ? {
          ...admitDraft.caseLink,
          new_case_title: admitDraft.caseLink.new_case_title?.trim() || admitReason,
        }
      : admitDraft.caseLink;
    setSubmitting(true);
    try {
      await hubClinicalApi.createHospitalization({
        clinic_id: clinicId,
        pet_id: admitDraft.petId,
        hub_hospital_bed_id: admitDraft.bedId || null,
        reason: admitReason,
        admission_notes: admitDraft.notes.trim() || null,
        hub_staff_member_id: admitDraft.staffId || null,
        guardian_id: admitDraft.guardianId || null,
        unit_id: getSelectedUnitId(),
        ...caseLink,
      });
      setAdmitOpen(false);
      resetAdmitForm();
      await reload();
      showSuccess('Internação registrada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao internar');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDischarge = async () => {
    if (!clinicId || !dischargeHosp) return;
    setDischargeSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(dischargeHosp.id, {
        clinic_id: clinicId,
        status: dischargeStatus,
        discharge_notes: dischargeNotes.trim() || null,
      });
      setDischargeHosp(null);
      setDischargeNotes('');
      setDischargeStatus('discharged');
      await reload();
      showSuccess('Status atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar internação');
    } finally {
      setDischargeSubmitting(false);
    }
  };

  const confirmLinkCase = async () => {
    if (!clinicId || !linkCaseHosp) return;
    if (!isCaseLinkResolved(linkCaseValue, linkCaseHasActive)) {
      showError('Selecione um caso clínico ou escolha criar um novo.');
      return;
    }
    setLinkCaseSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(linkCaseHosp.id, {
        clinic_id: clinicId,
        ...linkCaseValue,
      });
      setLinkCaseHosp(null);
      setLinkCaseValue({});
      await reload();
      showSuccess('Internação vinculada ao caso');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao vincular caso');
    } finally {
      setLinkCaseSubmitting(false);
    }
  };

  const openHospitalization = (id: string) => {
    navigate(`/hub/clinica/internacoes/${id}`);
  };

  const canSubmitAdmit =
    !!admitDraft.guardianId &&
    !!admitDraft.petId &&
    !!admitReason &&
    !submitting &&
    isCaseLinkResolved(admitDraft.caseLink, hasActiveCases);

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  const bedComposer = canWrite ? (
    <div className={`hub-hosp-beds-toolbar${embedded ? ' hub-clinic-hospital__embedded-beds' : ''}`}>
      <input
        className="hub-clientes__input hub-clinic-hospital__bed-input"
        placeholder="Código do leito (ex.: L01)"
        value={bedCode}
        onChange={(e) => setBedCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void addBed();
          }
        }}
        aria-label="Código do leito"
      />
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
        disabled={bedSubmitting || !bedCode.trim()}
        onClick={() => void addBed()}
      >
        {bedSubmitting ? 'Salvando…' : 'Adicionar leito'}
      </button>
      {!embedded ? (
        <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setAdmitOpen(true)}>
          Internar pet
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={`hub-clinic-hospital${embedded ? ' hub-clinic-hospital--embedded' : ''}`}>
      {bedComposer}

      <h3 className="hub-clinic-section-title">Mapa de leitos</h3>
      <div className="hub-clinic-beds-grid">
        {beds.map((b) => {
          const st = String(b.status || 'available');
          return (
            <div key={b.id} className={`hub-clinic-bed hub-clinic-bed--${st}`}>
              <span className="hub-clinic-bed__dot" aria-hidden />
              <span className="hub-clinic-bed__code">{b.label || b.code}</span>
              <span className="hub-clinic-bed__status">{BED_STATUS_LABEL[st] ?? st}</span>
            </div>
          );
        })}
        {beds.length === 0 ? (
          <p className="hub-clientes__muted hub-hosp-beds-empty">
            Nenhum leito configurado. Cadastre o código acima para montar o mapa.
          </p>
        ) : null}
      </div>

      {!embedded ? <h3 className="hub-clinic-section-title">Internações ativas</h3> : null}
      {hosp.length === 0 ? (
        <div className="hub-dayboard__empty">Nenhuma internação ativa.</div>
      ) : (
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Leito</th>
                <th>Tutor</th>
                <th>Entrada</th>
                <th>Status</th>
                <th>Caso</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {hosp.map((h) => {
                const petName = h.hub_pets?.name || 'Pet';
                const bed = h.hub_hospital_beds?.label || h.hub_hospital_beds?.code;
                const tutor = h.hub_guardians?.full_name;
                return (
                  <tr
                    key={h.id}
                    className="hub-dayboard__row-click"
                    onClick={() => openHospitalization(h.id)}
                  >
                    <td>
                      <div className="hub-clientes__tutor-cell">
                        <span className="hub-clientes__avatar">{petInitials(petName)}</span>
                        <span>
                          <span className="hub-clientes__tutor-name hub-dayboard__pet-name">{petName}</span>
                          {h.reason ? <small className="hub-hosp-admit__row-reason">{h.reason}</small> : null}
                        </span>
                      </div>
                    </td>
                    <td>{bed || <span className="hub-clientes__muted">Sem leito</span>}</td>
                    <td>{tutor || <span className="hub-clientes__muted">—</span>}</td>
                    <td className="hub-dayboard__time-cell">{formatHospDate(h.admitted_at)}</td>
                    <td>
                      <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${h.status === 'active' ? 'in_progress' : h.status}`}>
                        {HOSP_STATUS_LABEL[h.status] || h.status}
                      </span>
                    </td>
                    <td>
                      {h.hub_case_id ? (
                        <span className="hub-clientes__pill hub-dayboard__pill--open">Vinculado</span>
                      ) : (
                        <span className="hub-clientes__pill hub-dayboard__pill--none">Sem caso</span>
                      )}
                    </td>
                    <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                        <button
                          type="button"
                          className="hub-dayboard__action-btn"
                          title="Abrir internação"
                          aria-label="Abrir internação"
                          onClick={() => openHospitalization(h.id)}
                        >
                          <BedDouble size={15} strokeWidth={2} />
                        </button>
                        {h.hub_case_id ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Ver caso"
                            aria-label="Ver caso"
                            onClick={() => navigate(`/hub/clinica/casos/${h.hub_case_id}`)}
                          >
                            <FileText size={15} strokeWidth={2} />
                          </button>
                        ) : canWrite ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Vincular caso"
                            aria-label="Vincular caso"
                            onClick={() => {
                              setLinkCaseHosp(h);
                              setLinkCaseValue({});
                              setLinkCaseHasActive(false);
                            }}
                          >
                            <Link2 size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                        {canWrite ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title={h.hub_hospital_bed_id ? 'Trocar leito' : 'Atribuir leito'}
                            aria-label={h.hub_hospital_bed_id ? 'Trocar leito' : 'Atribuir leito'}
                            onClick={() => setAssignBedHosp(h)}
                          >
                            <ArrowRightLeft size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                        {canWrite ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Alta / encerrar"
                            aria-label="Alta / encerrar"
                            onClick={() => {
                              setDischargeHosp(h);
                              setDischargeStatus('discharged');
                              setDischargeNotes('');
                            }}
                          >
                            <LogOut size={15} strokeWidth={2} />
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

      {clinicId ? (
        <HospBedAssignPanel
          open={!!assignBedHosp}
          clinicId={clinicId}
          hospitalization={assignBedHosp}
          beds={beds}
          onClose={() => setAssignBedHosp(null)}
          onAssigned={() => reload()}
        />
      ) : null}

      <HubSidePanel
        open={admitOpen}
        onClose={() => {
          setAdmitOpen(false);
          resetAdmitForm();
        }}
        title="Internar pet"
        titleIcon={<BedDouble size={22} strokeWidth={2} aria-hidden />}
        size="wide"
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton
              onClick={() => {
                setAdmitOpen(false);
                resetAdmitForm();
              }}
            />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!canSubmitAdmit}
              onClick={() => void admit()}
            >
              {submitting ? 'Salvando…' : 'Confirmar internação'}
            </button>
          </div>
        }
      >
        {clinicId ? (
          <HospAdmitForm
            clinicId={clinicId}
            open={admitOpen}
            beds={beds}
            staff={staffList}
            draft={admitDraft}
            onChange={setAdmitDraft}
            onHasActiveCases={setHasActiveCases}
            submitting={submitting}
          />
        ) : (
          <p className="hub-clientes__muted">Selecione uma clínica para internar.</p>
        )}
      </HubSidePanel>

      <HubSidePanel
        open={!!linkCaseHosp}
        onClose={() => {
          setLinkCaseHosp(null);
          setLinkCaseValue({});
        }}
        title={`Vincular caso — ${linkCaseHosp?.hub_pets?.name || 'Internação'}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton
              onClick={() => {
                setLinkCaseHosp(null);
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
          {clinicId && linkCaseHosp ? (
            <ClinicalCaseLinkFields
              clinicId={clinicId}
              petId={linkCaseHosp.pet_id}
              value={linkCaseValue}
              onChange={(v) => {
                setLinkCaseValue(v);
                setLinkCaseHasActive(true);
              }}
              disabled={linkCaseSubmitting}
            />
          ) : null}
        </div>
      </HubSidePanel>

      <HubSidePanel
        open={!!dischargeHosp}
        onClose={() => setDischargeHosp(null)}
        title={`Encerrar internação — ${dischargeHosp?.hub_pets?.name || ''}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setDischargeHosp(null)} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={dischargeSubmitting}
              onClick={() => void confirmDischarge()}
            >
              {dischargeSubmitting ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <span className="hub-clientes__label">Tipo de encerramento</span>
          <select
            className="hub-clientes__input"
            value={dischargeStatus}
            onChange={(e) => setDischargeStatus(e.target.value as typeof dischargeStatus)}
          >
            <option value="discharged">Alta</option>
            <option value="death">Óbito</option>
            <option value="transferred">Transferido</option>
          </select>
          <span className="hub-clientes__label">Observações</span>
          <textarea
            className="hub-clientes__textarea"
            rows={3}
            value={dischargeNotes}
            onChange={(e) => setDischargeNotes(e.target.value)}
          />
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicHospitalPage;
