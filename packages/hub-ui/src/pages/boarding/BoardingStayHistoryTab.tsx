import React, { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { hubBoardingApi, type BoardingMedia, type BoardingTimelineEntry } from '../../api/hubBoardingApi';
import { formatDateTimeShort } from './boardingCareUi';

type Props = {
  clinicId: string;
  reservationId: string;
  media: BoardingMedia[];
  canUpload: boolean;
  /** Muda quando a estadia é recarregada, para atualizar a linha do tempo. */
  refreshKey?: string | number;
  onChanged: () => void | Promise<void>;
};

const BoardingStayHistoryTab: React.FC<Props> = ({ clinicId, reservationId, media, canUpload, refreshKey, onChanged }) => {
  const { showError, showSuccess } = useAlert();
  const [timeline, setTimeline] = useState<BoardingTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    hubBoardingApi
      .timeline(reservationId, clinicId)
      .then((r) => {
        if (!cancelled) setTimeline(r.timeline ?? []);
      })
      .catch(() => {
        if (!cancelled) setTimeline([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reservationId, clinicId, refreshKey]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await hubBoardingApi.uploadMedia({ clinicId, reservationId, file });
      }
      showSuccess(files.length > 1 ? 'Fotos enviadas' : 'Foto enviada');
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (m: BoardingMedia) => {
    try {
      await hubBoardingApi.deleteMedia(m.id, clinicId);
      await onChanged();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover foto');
    }
  };

  return (
    <>
      <section className="hub-grooming-drawer__section">
        <div className="hub-grooming-drawer__heading-row">
          <h4 className="hub-grooming-drawer__heading">Fotos</h4>
          {canUpload ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void upload(e.target.files)}
              />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={14} aria-hidden />
                {uploading ? 'Enviando…' : 'Adicionar fotos'}
              </button>
            </>
          ) : null}
        </div>
        {media.length ? (
          <ul className="hub-boarding-photos">
            {media.map((m) => (
              <li key={m.id} className="hub-boarding-photos__item">
                <a href={m.url} target="_blank" rel="noreferrer">
                  <img src={m.url} alt={m.caption ?? 'Foto da estadia'} loading="lazy" />
                </a>
                <span className="hub-boarding-photos__meta">{formatDateTimeShort(m.created_at)}</span>
                {canUpload ? (
                  <button
                    type="button"
                    className="hub-boarding-photos__remove"
                    aria-label="Remover foto"
                    onClick={() => void remove(m)}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__hint">As fotos entram no aviso diário ao tutor.</p>
        )}
      </section>

      <section className="hub-grooming-drawer__section">
        <h4 className="hub-grooming-drawer__heading">Linha do tempo</h4>
        {loading ? (
          <HubLoading variant="inline" size="sm" label="Carregando histórico…" />
        ) : timeline.length ? (
          <ul className="hub-grooming-drawer__timeline">
            {timeline.map((t) => (
              <li key={t.id} className="hub-grooming-drawer__timeline-item">
                <span
                  className={`hub-grooming-drawer__timeline-dot${t.type === 'incident' ? ' hub-boarding-stay__dot--open' : ''}`}
                  aria-hidden
                />
                <div>
                  <p className="hub-grooming-drawer__timeline-title">{t.title}</p>
                  <p className="hub-grooming-drawer__timeline-meta">
                    {formatDateTimeShort(t.at)}
                    {t.actor_name ? ` · ${t.actor_name}` : ''}
                  </p>
                  {t.detail ? <p className="hub-grooming-drawer__timeline-body">{t.detail}</p> : null}
                  {t.photo_url ? (
                    <a href={t.photo_url} target="_blank" rel="noreferrer" className="hub-boarding-photos__inline">
                      <img src={t.photo_url} alt="" loading="lazy" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hub-grooming-drawer__hint">Nada registrado ainda.</p>
        )}
      </section>
    </>
  );
};

export default BoardingStayHistoryTab;
