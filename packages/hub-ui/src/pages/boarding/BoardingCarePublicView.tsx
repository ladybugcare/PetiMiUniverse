import React, { useState } from 'react';
import { Calendar, ClipboardList, Dog, MessageSquare } from 'lucide-react';
import type {
  BoardingCareBlockKey,
  BoardingCareFeeding,
  BoardingCareHandling,
  BoardingCareMedication,
  BoardingCarePlanBlocks,
  BoardingCareWalks,
} from '../../api/hubBoardingApi';
import { PublicDocCardTitle, PublicDocHeaderLogo, PublicDocMetaRow } from '../orcamentos/hubPublicDocumentUi';
import BoardingCareEditor from './BoardingCareEditor';
import { PROFILE_BLOCK_KEYS, boardingModeLabel, emptyPlanBlocks } from './boardingCareUi';
import '../clientes/clientes.css';
import '../grooming/grooming-page.css';
import '../orcamentos/orcamentos-page.css';
import './boarding-page.css';

export type BoardingCarePublicData = {
  pet: { name: string; species: string | null };
  clinic: { name: string; photo_url: string | null };
  stay: { mode: string; status: string; expected_check_in: string | null; expected_check_out: string | null };
  care: {
    feeding: BoardingCareFeeding | null;
    medications: BoardingCareMedication[] | null;
    walks: BoardingCareWalks | null;
    handling: BoardingCareHandling | null;
  };
  submission: Record<string, unknown> | null;
  submitted_at: string | null;
  can_submit: boolean;
};

export type BoardingCarePublicSubmit = {
  feeding?: BoardingCareFeeding | null;
  medications?: BoardingCareMedication[] | null;
  walks?: BoardingCareWalks | null;
  handling?: BoardingCareHandling | null;
  notes?: string | null;
  contact_name?: string | null;
};

type Props = {
  data: BoardingCarePublicData;
  onSubmit: (payload: BoardingCarePublicSubmit) => Promise<void>;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Página do tutor: confere e completa a rotina do pet antes da hospedagem. */
const BoardingCarePublicView: React.FC<Props> = ({ data, onSubmit }) => {
  const [draft, setDraft] = useState<BoardingCarePlanBlocks>(() => ({ ...emptyPlanBlocks(), ...data.care }));
  const [dirty, setDirty] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [contactName, setContactName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const petName = data.pet.name || 'seu pet';
  const isDaycare = data.stay.mode === 'daycare';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Envia todos os blocos: o tutor confirma o que já estava certo ao enviar.
      await onSubmit({
        feeding: draft.feeding,
        medications: draft.medications,
        walks: draft.walks,
        handling: draft.handling,
        contact_name: contactName.trim() || null,
        notes: notes.trim() || null,
      });
      setSent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Não foi possível enviar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hub-public-quote hub-boarding-public">
      <div className="hub-public-quote__shell">
        <header className="hub-public-quote__header">
          <div className="hub-public-quote__header-main">
            <PublicDocHeaderLogo logoUrl={data.clinic.photo_url} clinicName={data.clinic.name} />
            <div>
              <p className="hub-public-quote__eyebrow">Cuidados de {isDaycare ? 'creche' : 'hospedagem'}</p>
              <h1 className="hub-public-quote__clinic">{data.clinic.name || 'Hotel & Creche'}</h1>
              <p className="hub-public-quote__tagline">Confira a rotina de {petName} para cuidarmos do jeito certo.</p>
            </div>
          </div>
          <aside className="hub-public-quote__meta-card" aria-label="Resumo da estadia">
            <PublicDocMetaRow icon={Dog} label="Pet">
              <p className="hub-public-quote__meta-value hub-public-quote__meta-value--accent">
                {petName} · {boardingModeLabel(data.stay.mode)}
              </p>
            </PublicDocMetaRow>
            <PublicDocMetaRow icon={Calendar} label="Entrada">
              <p className="hub-public-quote__meta-value">{formatWhen(data.stay.expected_check_in)}</p>
            </PublicDocMetaRow>
            {data.stay.expected_check_out ? (
              <PublicDocMetaRow icon={Calendar} label="Saída">
                <p className="hub-public-quote__meta-value">{formatWhen(data.stay.expected_check_out)}</p>
              </PublicDocMetaRow>
            ) : null}
          </aside>
        </header>

        {sent ? (
          <div className="hub-public-quote__banner" role="status">
            <p className="hub-public-quote__banner-text">
              Recebemos as informações de {petName}. A equipe vai conferir antes da chegada. Se precisar mudar algo, é só
              enviar de novo por este link.
            </p>
          </div>
        ) : data.submitted_at ? (
          <div className="hub-public-quote__banner" role="status">
            <p className="hub-public-quote__banner-text">
              Você já enviou as informações em {formatWhen(data.submitted_at)}. Pode ajustar e enviar de novo.
            </p>
          </div>
        ) : null}

        {!data.can_submit ? (
          <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="status">
            <p className="hub-public-quote__banner-text">
              Esta hospedagem já foi encerrada. Para uma próxima estadia, fale com a recepção.
            </p>
          </div>
        ) : (
          <>
            <section className="hub-public-quote__card">
              <PublicDocCardTitle icon={ClipboardList}>Rotina de {petName}</PublicDocCardTitle>
              <p className="hub-public-quote__muted">
                Já deixamos preenchido o que sabemos. Corrija o que mudou e complete o que faltar.
              </p>
              <BoardingCareEditor
                idPrefix="public-care"
                blocks={[...PROFILE_BLOCK_KEYS]}
                value={draft}
                disabled={busy}
                dirtyBlocks={dirty}
                onChange={(next, changed) => {
                  setDraft(next);
                  setDirty((prev) => new Set(prev).add(changed));
                }}
              />
            </section>

            <section className="hub-public-quote__card">
              <PublicDocCardTitle icon={MessageSquare}>Algo mais?</PublicDocCardTitle>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="public-care-contact">
                  Seu nome
                </label>
                <input
                  id="public-care-contact"
                  className="hub-clientes__input"
                  value={contactName}
                  autoComplete="name"
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="public-care-notes">
                  Recados para a equipe
                </label>
                <textarea
                  id="public-care-notes"
                  className="hub-clientes__textarea"
                  rows={3}
                  value={notes}
                  placeholder="Ex.: tem medo de trovão, gosta de dormir com a mantinha"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {error ? (
                <div className="hub-public-quote__banner hub-public-quote__banner--warn" role="alert">
                  <p className="hub-public-quote__banner-text">{error}</p>
                </div>
              ) : null}
              <div className="hub-boarding-public__actions">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy ? 'Enviando…' : 'Enviar para a equipe'}
                </button>
              </div>
            </section>
          </>
        )}

        <p className="hub-public-quote__fineprint">
          As informações ficam com a equipe de {data.clinic.name || 'hospedagem'} e são usadas só nos cuidados de {petName}.
        </p>
      </div>
    </div>
  );
};

export default BoardingCarePublicView;
