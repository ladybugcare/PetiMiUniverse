import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { hubClinicalApi } from '../../api/hubClinicalApi';

const KIND_MAP: Record<string, string> = {
  consulta: 'consultation',
  retorno: 'return_visit',
  vacinacao: 'vaccination',
  dermatologia: 'dermatology',
};

const HubClinicTemplatesPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('hub.clinic.write');
  const [rows, setRows] = useState<Array<{ id: string; name: string; template_kind?: string }>>([]);
  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState('consulta');

  const reload = () => {
    if (!clinicId) return Promise.resolve();
    return hubClinicalApi.listTemplates(clinicId).then((r) => setRows(r.templates ?? []));
  };

  useEffect(() => {
    void reload();
  }, [clinicId]);

  const create = async () => {
    if (!clinicId || !name.trim()) return;
    try {
      await hubClinicalApi.createTemplate({
        clinic_id: clinicId,
        name: name.trim(),
        template_kind: KIND_MAP[templateType] || 'consultation',
        anamnesis: { history: '' },
        physical_exam: {},
        diagnosis: {},
      });
      setName('');
      await reload();
      showSuccess('Template criado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar template');
    }
  };

  return (
    <div className="hub-clinic-templates">
      {canWrite && (
        <div className="hub-clientes__toolbar">
          <input
            className="hub-clientes__input"
            placeholder="Nome do template"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="hub-clientes__input" value={templateType} onChange={(e) => setTemplateType(e.target.value)}>
            <option value="consulta">Consulta</option>
            <option value="retorno">Retorno</option>
            <option value="vacinacao">Vacinação</option>
            <option value="dermatologia">Dermatologia</option>
          </select>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void create()}>
            Criar
          </button>
        </div>
      )}
      <div className="hub-clientes__table-wrap">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nenhum template. Crie um para pré-preencher atendimentos.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.template_kind || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HubClinicTemplatesPage;
