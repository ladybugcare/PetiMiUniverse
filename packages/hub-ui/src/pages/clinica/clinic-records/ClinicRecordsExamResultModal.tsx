import React, { useEffect, useState } from 'react';
import { HubModal } from '../../../components/HubModal';
import { useAlert } from '../../../components/AlertProvider';
import {
  hubClinicalApi,
  hubClinicalExamsApi,
  type HubClinicalExam,
} from '../../../api/hubClinicalApi';
import { formatHubClinicalExamStatus } from '../clinicalDisplay';
import { registerExamResult } from './registerExamResult';

type Props = {
  open: boolean;
  exam: HubClinicalExam | null;
  clinicId: string;
  petId: string;
  /** Quando true, o texto já está gravado — só reenvia o PDF. */
  attachmentOnly?: boolean;
  onClose: () => void;
  onSaved: (exam: HubClinicalExam) => void;
};

export const ClinicRecordsExamResultModal: React.FC<Props> = ({
  open,
  exam,
  clinicId,
  petId,
  attachmentOnly = false,
  onClose,
  onSaved,
}) => {
  const { showError, showSuccess } = useAlert();
  const [activeExam, setActiveExam] = useState<HubClinicalExam | null>(exam);
  const [resultText, setResultText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [textAlreadySaved, setTextAlreadySaved] = useState(attachmentOnly);

  useEffect(() => {
    if (!open || !exam) return;
    setActiveExam(exam);
    setResultText(exam.result_text?.trim() || '');
    setFile(null);
    setPartialError(null);
    setTextAlreadySaved(attachmentOnly || exam.status === 'result_received');
  }, [open, exam, attachmentOnly]);

  if (!activeExam) return null;

  const save = async () => {
    if (saving) return;
    const onlyAttach = textAlreadySaved || attachmentOnly;
    if (!onlyAttach && !resultText.trim()) {
      showError('Informe o texto do resultado.');
      return;
    }
    if (onlyAttach && !file) {
      showError('Selecione o PDF do laudo para reenviar.');
      return;
    }

    setSaving(true);
    setPartialError(null);
    try {
      const outcome = await registerExamResult(
        {
          clinicId,
          petId,
          exam: activeExam,
          resultText,
          file,
          attachmentOnly: onlyAttach,
        },
        {
          patchExam: (id, payload) => hubClinicalExamsApi.patch(id, payload),
          uploadAttachment: (params) => hubClinicalApi.uploadAttachmentFile(params),
        },
      );

      setActiveExam(outcome.exam);
      onSaved(outcome.exam);

      if (outcome.attachmentError) {
        setTextAlreadySaved(true);
        setFile(null);
        setPartialError(
          `Resultado gravado no pedido. O PDF ainda não foi anexado: ${outcome.attachmentError}. Selecione o arquivo e tente de novo — o mesmo pedido será atualizado.`,
        );
        showError('Resultado salvo, mas o anexo falhou. Reenvie o PDF.');
        return;
      }

      if (outcome.attachmentSaved) {
        showSuccess('Resultado e PDF registrados no prontuário');
      } else if (outcome.attachmentSkipped) {
        showSuccess('Resultado registrado no prontuário');
      } else {
        showSuccess('Resultado atualizado');
      }
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar resultado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <HubModal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={textAlreadySaved ? 'Anexar PDF do laudo' : 'Registrar resultado'}
      subtitle={`${activeExam.exam_type} · ${formatHubClinicalExamStatus(activeExam.status)}`}
      footer={
        <>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : textAlreadySaved ? 'Reenviar PDF' : 'Salvar resultado'}
          </button>
        </>
      }
    >
      <div className="hub-clinic-records__exam-result-form">
        {partialError ? (
          <p className="hub-clinic-records__exam-result-alert" role="alert">
            {partialError}
          </p>
        ) : null}

        <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
          O lançamento atualiza o pedido original. O atendimento permanece encerrado.
        </p>

        <div className="hub-clinic-field">
          <label htmlFor="clinic-records-exam-result-text">Resultado</label>
          <textarea
            id="clinic-records-exam-result-text"
            rows={5}
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder="Texto do laudo ou resumo clínico"
            disabled={saving || textAlreadySaved}
            readOnly={textAlreadySaved}
          />
        </div>

        <div className="hub-clinic-field">
          <label htmlFor="clinic-records-exam-result-file">
            PDF do laudo {textAlreadySaved ? '(obrigatório para concluir)' : '(opcional)'}
          </label>
          <input
            id="clinic-records-exam-result-file"
            type="file"
            accept="application/pdf,image/*"
            disabled={saving}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 0, fontSize: 12 }}>
              Selecionado: {file.name}
            </p>
          ) : null}
        </div>
      </div>
    </HubModal>
  );
};
