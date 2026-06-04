import React, { useEffect, useMemo, useState } from 'react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { hubClinicalCasesApi, type HubClinicalCase } from '../../api/hubClinicalApi';
import { HubCancelButton } from '../../components/HubCancelButton';

type Props = {
  open: boolean;
  clinicId: string;
  onClose: () => void;
  onSubmit: (payload: {
    petId: string;
    staffId: string;
    complaint: string;
    hubCaseId?: string | null;
    createNewCase?: boolean;
  }) => Promise<void>;
  submitting: boolean;
};

const ClinicWalkInPanel: React.FC<Props> = ({ open, clinicId, onClose, onSubmit, submitting }) => {
  const [pets, setPets] = useState<HubPet[]>([]);
  const [staff, setStaff] = useState<HubStaffMember[]>([]);
  const [petId, setPetId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [activeCases, setActiveCases] = useState<HubClinicalCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  // 'existing' = associar a caso existente selecionado
  // 'new'      = criar novo caso
  // 'auto'     = deixar o backend decidir (padrão)
  const [caseMode, setCaseMode] = useState<'auto' | 'existing' | 'new'>('auto');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  useEffect(() => {
    if (!open || !clinicId) return;
    void Promise.all([hubPetsApi.list(clinicId), hubStaffApi.list(clinicId)]).then(([p, s]) => {
      setPets(p.pets ?? []);
      setStaff(s.staff ?? []);
    });
  }, [open, clinicId]);

  useEffect(() => {
    if (!petId || !clinicId) {
      setActiveCases([]);
      setCaseMode('auto');
      setSelectedCaseId('');
      return;
    }
    setLoadingCases(true);
    void hubClinicalCasesApi
      .list(clinicId, { petId, status: 'active' })
      .then((r) => {
        const active = r.cases ?? [];
        const monitoring = r.cases?.filter((c) => c.status === 'monitoring') ?? [];
        const combined = [...active, ...monitoring];
        setActiveCases(combined);
        setCaseMode(combined.length > 0 ? 'existing' : 'auto');
        setSelectedCaseId(combined.length === 1 ? combined[0].id : '');
      })
      .catch(() => setActiveCases([]))
      .finally(() => setLoadingCases(false));
  }, [petId, clinicId]);

  const petOptions: HubComboboxOption[] = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );
  const staffOptions: HubComboboxOption[] = useMemo(
    () => staff.filter((s) => s.active !== false).map((s) => ({ value: s.id, label: s.full_name })),
    [staff],
  );
  const caseOptions: HubComboboxOption[] = useMemo(
    () => activeCases.map((c) => ({ value: c.id, label: c.title })),
    [activeCases],
  );

  const handleSubmit = () => {
    if (!petId || !staffId) return;
    let hubCaseId: string | null | undefined;
    let createNewCase: boolean | undefined;
    if (caseMode === 'existing') {
      hubCaseId = selectedCaseId || null;
    } else if (caseMode === 'new') {
      createNewCase = true;
    }
    void onSubmit({ petId, staffId, complaint, hubCaseId, createNewCase }).then(() => {
      setPetId('');
      setStaffId('');
      setComplaint('');
      setActiveCases([]);
      setCaseMode('auto');
      setSelectedCaseId('');
    });
  };

  const showCaseSection = petId && (loadingCases || activeCases.length > 0);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Atendimento sem agendamento"
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !petId || !staffId || (caseMode === 'existing' && !selectedCaseId)}
            onClick={handleSubmit}
          >
            {submitting ? 'A iniciar…' : 'Iniciar atendimento'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes__form-stack">
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="clinic-walkin-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet…"
            allowCreate={false}
          />
        </div>
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Profissional</span>
          <HubSearchableCombobox
            id="clinic-walkin-staff"
            className="hub-combobox--clientes"
            options={staffOptions}
            value={staffId}
            onChange={setStaffId}
            placeholder="Selecionar…"
            allowCreate={false}
          />
        </div>
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor="walk_complaint">
            Queixa principal
          </label>
          <textarea
            id="walk_complaint"
            className="hub-clientes__textarea"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={3}
          />
        </div>

        {showCaseSection && (
          <div className="hub-clientes__field">
            <span className="hub-clientes__label">Caso clínico</span>
            {loadingCases ? (
              <p className="hub-clientes__muted">Verificando casos ativos…</p>
            ) : (
              <>
                <div className="hub-clinic-walkin__case-modes">
                  <label className="hub-clinic-walkin__case-mode-option">
                    <input
                      type="radio"
                      name="case_mode"
                      value="existing"
                      checked={caseMode === 'existing'}
                      onChange={() => setCaseMode('existing')}
                    />
                    <span>Associar a caso existente</span>
                  </label>
                  <label className="hub-clinic-walkin__case-mode-option">
                    <input
                      type="radio"
                      name="case_mode"
                      value="new"
                      checked={caseMode === 'new'}
                      onChange={() => setCaseMode('new')}
                    />
                    <span>Criar novo caso</span>
                  </label>
                </div>

                {caseMode === 'existing' && (
                  <HubSearchableCombobox
                    id="clinic-walkin-case"
                    className="hub-combobox--clientes"
                    options={caseOptions}
                    value={selectedCaseId}
                    onChange={setSelectedCaseId}
                    placeholder="Selecionar caso…"
                    allowCreate={false}
                  />
                )}
                {caseMode === 'new' && (
                  <p className="hub-clientes__muted hub-clinic-walkin__case-hint">
                    Um novo caso será criado com a queixa principal como título.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </HubSidePanel>
  );
};

export default ClinicWalkInPanel;
