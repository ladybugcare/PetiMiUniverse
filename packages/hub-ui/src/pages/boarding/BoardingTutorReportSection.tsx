import React, { useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  hubBoardingApi,
  type BoardingTutorReport,
  type BoardingTutorReportKind,
} from '../../api/hubBoardingApi';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import { todayYmd } from '../../utils/hubCalendar';
import { formatDateTimeShort } from './boardingCareUi';

const KIND_LABELS: Record<BoardingTutorReportKind, string> = {
  daily: 'Resumo do dia',
  stay_summary: 'Resumo da estadia',
  pickup: 'Pronto para buscar',
};

type Props = {
  clinicId: string;
  reservationId: string;
  guardianId?: string | null;
  petId?: string | null;
  /** Tipos oferecidos (ex.: no check-out, só "Pronto para buscar" e "Resumo da estadia"). */
  kinds?: BoardingTutorReportKind[];
  initialKind?: BoardingTutorReportKind;
  history?: BoardingTutorReport[];
  onSent?: () => void;
};

/** Relatório ao tutor montado a partir da operação (tarefas, intercorrências, fotos). */
const BoardingTutorReportSection: React.FC<Props> = ({
  clinicId,
  reservationId,
  guardianId,
  petId,
  kinds = ['daily', 'stay_summary', 'pickup'],
  initialKind,
  history = [],
  onSent,
}) => {
  const { showError, showSuccess } = useAlert();
  const [kind, setKind] = useState<BoardingTutorReportKind>(initialKind ?? kinds[0]!);
  const [body, setBody] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hubBoardingApi
      .tutorReportPreview(reservationId, clinicId, { kind, dateYmd: kind === 'daily' ? todayYmd() : undefined })
      .then((r) => {
        if (cancelled) return;
        setBody(r.body);
        setPhone(r.guardian_phone);
      })
      .catch((e: unknown) => {
        if (!cancelled) showError((e as Error)?.message || 'Erro ao montar o relatório');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reservationId, clinicId, kind, showError]);

  const record = (channel: 'whatsapp' | 'copy') => {
    void hubBoardingApi
      .recordTutorReport(reservationId, {
        clinic_id: clinicId,
        kind,
        report_date: kind === 'daily' ? todayYmd() : null,
        body,
        channel,
      })
      .then(() => onSent?.())
      .catch(() => {});
    if (channel === 'whatsapp') {
      void logMessageAttempt({
        clinic_id: clinicId,
        guardian_id: guardianId ?? null,
        pet_id: petId ?? null,
        channel: 'whatsapp_link',
        template_key: `boarding_${kind}`,
      });
    }
  };

  const href = body.trim() ? buildWhatsappLink(phone, body) : null;

  return (
    <section className="hub-grooming-drawer__section">
      <h4 className="hub-grooming-drawer__heading">Aviso ao tutor</h4>
      {kinds.length > 1 ? (
        <div className="hub-clientes__btn-row hub-boarding-stay__days">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`hub-clientes__btn hub-clientes__btn--sm ${kind === k ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--ghost'}`}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <HubLoading variant="inline" size="sm" label="Montando mensagem…" />
      ) : (
        <>
          <textarea
            className="hub-clientes__input hub-boarding-report__body"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Mensagem para o tutor"
          />
          <p className="hub-grooming-drawer__hint">A mensagem é montada com o que a equipe registrou. Revise antes de enviar.</p>
          <div className="hub-clientes__btn-row">
            {href ? (
              <a
                className="hub-grooming-drawer__whatsapp"
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={() => record('whatsapp')}
              >
                <MessageCircle size={16} aria-hidden />
                Enviar no WhatsApp
              </a>
            ) : (
              <span className="hub-grooming-drawer__muted">Tutor sem telefone cadastrado.</span>
            )}
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={!body.trim()}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(body)
                  .then(() => {
                    showSuccess('Mensagem copiada');
                    record('copy');
                  })
                  .catch(() => showError('Não foi possível copiar'));
              }}
            >
              <Copy size={14} aria-hidden />
              Copiar
            </button>
          </div>
        </>
      )}
      {history.length ? (
        <p className="hub-grooming-drawer__hint hub-boarding-stay__spaced">
          Último envio: {KIND_LABELS[history[0]!.kind] ?? history[0]!.kind} em {formatDateTimeShort(history[0]!.sent_at)}
          {history.length > 1 ? ` · ${history.length} avisos nesta estadia` : ''}
        </p>
      ) : null}
    </section>
  );
};

export default BoardingTutorReportSection;
