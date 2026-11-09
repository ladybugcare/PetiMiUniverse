import React, { useEffect, useMemo, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  hubBoardingApi,
  type BoardingBlockStatus,
  type BoardingCareBlockKey,
  type BoardingCarePlan,
  type BoardingCarePlanBlocks,
  type BoardingCareProfile,
  type BoardingPlanPendency,
} from '../../api/hubBoardingApi';
import { buildWhatsappLink } from '../../utils/whatsappLink';
import BoardingCareEditor from './BoardingCareEditor';
import {
  CARE_BLOCK_LABELS,
  PROFILE_BLOCK_KEYS,
  formatDateTimeShort,
  stayCarePlanBlocks,
  summarizeBlock,
  tutorLinkUrl,
} from './boardingCareUi';

type Props = {
  clinicId: string;
  reservationId: string;
  mode: string;
  stage: string;
  petName: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  plan: BoardingCarePlan | null;
  profile: BoardingCareProfile | null;
  pendencies: BoardingPlanPendency[];
  canManage: boolean;
  onSaved: () => void | Promise<void>;
};

function blocksFromPlan(plan: BoardingCarePlan | null): BoardingCarePlanBlocks {
  return {
    feeding: plan?.feeding ?? null,
    medications: plan?.medications ?? null,
    walks: plan?.walks ?? null,
    handling: plan?.handling ?? null,
    recreation: plan?.recreation ?? null,
  };
}

const BoardingStayCareTab: React.FC<Props> = ({
  clinicId,
  reservationId,
  mode,
  stage,
  petName,
  guardianName,
  guardianPhone,
  plan: planProp,
  profile,
  pendencies: pendenciesProp,
  canManage,
  onSaved,
}) => {
  const { showError, showSuccess } = useAlert();
  const [plan, setPlan] = useState<BoardingCarePlan | null>(planProp);
  const [pendencies, setPendencies] = useState(pendenciesProp);
  const [loadingPlan, setLoadingPlan] = useState(!planProp);
  const [draft, setDraft] = useState<BoardingCarePlanBlocks>(() => blocksFromPlan(planProp));
  const [localStatus, setLocalStatus] = useState<Partial<Record<BoardingCareBlockKey, BoardingBlockStatus>>>(
    planProp?.block_status ?? {},
  );
  const [dirty, setDirty] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [confirm, setConfirm] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [saveToProfile, setSaveToProfile] = useState<Set<BoardingCareBlockKey>>(new Set());
  const [instructions, setInstructions] = useState(planProp?.instructions ?? '');
  const [markReviewed, setMarkReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  const resetFrom = (p: BoardingCarePlan | null, pend: BoardingPlanPendency[]) => {
    setPlan(p);
    setPendencies(pend);
    setDraft(blocksFromPlan(p));
    setLocalStatus(p?.block_status ?? {});
    setDirty(new Set());
    setConfirm(new Set());
    setSaveToProfile(new Set());
    setInstructions(p?.instructions ?? '');
    setMarkReviewed(false);
  };

  useEffect(() => {
    if (planProp) return;
    // Estadias antigas ainda sem plano: o backend cria a partir da ficha.
    let cancelled = false;
    setLoadingPlan(true);
    hubBoardingApi
      .getCarePlan(reservationId, clinicId)
      .then((r) => {
        if (!cancelled) resetFrom(r.care_plan, r.plan_pendencies ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) showError((e as Error)?.message || 'Erro ao carregar o plano de cuidados');
      })
      .finally(() => {
        if (!cancelled) setLoadingPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planProp, reservationId, clinicId, showError]);

  const editable = canManage && (stage === 'reserved' || stage === 'checked_in');
  const hasChanges = dirty.size > 0 || confirm.size > 0 || markReviewed || instructions !== (plan?.instructions ?? '');
  const submission = plan?.tutor_submission ?? null;
  const submissionPending = Boolean(plan?.tutor_submitted_at && !plan?.tutor_submission_reviewed_at && !markReviewed);
  const planBlocks = useMemo(() => stayCarePlanBlocks(mode), [mode]);
  const confirmable = useMemo(
    () => planBlocks.filter((k) => localStatus[k] === 'inherited'),
    [localStatus, planBlocks],
  );

  const handleChange = (next: BoardingCarePlanBlocks, key: BoardingCareBlockKey) => {
    setDraft(next);
    setDirty((prev) => new Set(prev).add(key));
    setLocalStatus((prev) => ({ ...prev, [key]: 'overridden' }));
  };

  const handleConfirm = (key: BoardingCareBlockKey) => {
    setConfirm((prev) => new Set(prev).add(key));
    setLocalStatus((prev) => ({ ...prev, [key]: 'confirmed' }));
  };

  const applySubmission = () => {
    if (!submission) return;
    const next = { ...draft };
    const touched = new Set(dirty);
    const status = { ...localStatus };
    for (const key of PROFILE_BLOCK_KEYS) {
      const val = submission[key];
      if (val == null) continue;
      (next as Record<string, unknown>)[key] = val;
      touched.add(key);
      status[key] = 'overridden';
    }
    setDraft(next);
    setDirty(touched);
    setLocalStatus(status);
    setMarkReviewed(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const blocksPatch: Partial<BoardingCarePlanBlocks> = {};
      for (const key of dirty) (blocksPatch as Record<string, unknown>)[key] = draft[key];
      const r = await hubBoardingApi.putCarePlan(reservationId, {
        clinic_id: clinicId,
        ...blocksPatch,
        ...(instructions !== (plan?.instructions ?? '') ? { instructions: instructions.trim() || null } : {}),
        confirm_blocks: [...confirm],
        save_to_profile: [...saveToProfile].filter(
          (k): k is Exclude<BoardingCareBlockKey, 'recreation'> => k !== 'recreation' && dirty.has(k),
        ),
        ...(markReviewed ? { tutor_submission_reviewed: true } : {}),
      });
      resetFrom(r.care_plan, r.plan_pendencies ?? []);
      showSuccess(stage === 'checked_in' ? 'Plano salvo. A rotina foi atualizada.' : 'Plano salvo.');
      await onSaved();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar o plano');
    } finally {
      setSaving(false);
    }
  };

  const generateLink = async (regenerate = false) => {
    setLinkBusy(true);
    try {
      const r = await hubBoardingApi.tutorLink(reservationId, clinicId, { regenerate });
      setPlan((prev) => (prev ? { ...prev, tutor_link: r.care_plan.tutor_link } : r.care_plan));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar o link');
    } finally {
      setLinkBusy(false);
    }
  };

  if (loadingPlan) return <HubLoading variant="block" label="Carregando plano…" className="hub-grooming-drawer__loading" />;

  const linkUrl = plan?.tutor_link ? tutorLinkUrl(plan.tutor_link.path) : null;
  const firstName = (guardianName ?? '').trim().split(/\s+/)[0] || '';
  const linkMessage = linkUrl
    ? `Olá${firstName ? `, ${firstName}` : ''}! Para cuidarmos bem do ${petName}, confira e confirme os cuidados da hospedagem neste link: ${linkUrl}`
    : '';
  const whatsappHref = linkUrl ? buildWhatsappLink(guardianPhone, linkMessage) : null;
  const pendingLabels = pendencies.map((p) => p.label);

  return (
    <>
      {pendingLabels.length ? (
        <section className="hub-grooming-drawer__section hub-grooming-drawer__callout hub-grooming-drawer__callout--request">
          <h4 className="hub-grooming-drawer__heading">
            {stage === 'reserved' ? 'Antes do check-in, confirme' : 'Pendências do plano'}
          </h4>
          <ul className="hub-grooming-drawer__request-list">
            {pendingLabels.map((label) => (
              <li key={label}>
                <span className="hub-grooming-drawer__request-dot" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          {editable && confirmable.length ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
              onClick={() => confirmable.forEach(handleConfirm)}
            >
              Confirmar tudo o que veio da ficha
            </button>
          ) : null}
        </section>
      ) : (
        <div className="hub-grooming-drawer__ready-banner" role="status">
          {mode === 'daycare' ? 'Cuidados confirmados para o dia.' : 'Cuidados confirmados para a estadia.'}
          {plan?.tasks_generated_at ? ' A rotina já está gerada.' : ''}
        </div>
      )}

      {submission && plan?.tutor_submitted_at ? (
        <section className="hub-grooming-drawer__section hub-grooming-drawer__callout hub-grooming-drawer__callout--notes">
          <h4 className="hub-grooming-drawer__heading">
            Resposta do tutor · {formatDateTimeShort(plan.tutor_submitted_at)}
            {submission.contact_name ? ` · ${submission.contact_name}` : ''}
          </h4>
          {PROFILE_BLOCK_KEYS.map((key) => {
            const text = summarizeBlock(key, submission);
            return text ? (
              <p key={key}>
                <strong>{CARE_BLOCK_LABELS[key]}:</strong> {text}
              </p>
            ) : null;
          })}
          {submission.notes ? <p>{submission.notes}</p> : null}
          {editable && submissionPending ? (
            <div className="hub-clientes__btn-row">
              <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={applySubmission}>
                Aplicar ao plano
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                onClick={() => setMarkReviewed(true)}
              >
                Marcar como revisada
              </button>
            </div>
          ) : (
            <p className="hub-grooming-drawer__muted">
              {markReviewed ? 'Será marcada como revisada ao salvar.' : 'Resposta revisada pela recepção.'}
            </p>
          )}
        </section>
      ) : null}

      {canManage && (stage === 'reserved' || stage === 'checked_in') ? (
        <section className="hub-grooming-drawer__section">
          <h4 className="hub-grooming-drawer__heading">Pré-confirmação com o tutor</h4>
          {linkUrl ? (
            <>
              <p className="hub-grooming-drawer__hint">
                O tutor confere os cuidados e responde pelo link
                {plan?.tutor_link?.expires_at ? `, válido até ${formatDateTimeShort(plan.tutor_link.expires_at)}` : ''}. A resposta
                chega aqui para você revisar.
              </p>
              <div className="hub-clientes__btn-row">
                {whatsappHref ? (
                  <a className="hub-grooming-drawer__whatsapp" href={whatsappHref} target="_blank" rel="noreferrer">
                    <MessageCircle size={16} aria-hidden />
                    Enviar no WhatsApp
                  </a>
                ) : null}
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(linkUrl)
                      .then(() => showSuccess('Link copiado'))
                      .catch(() => showError('Não foi possível copiar o link'));
                  }}
                >
                  <Copy size={14} aria-hidden />
                  Copiar link
                </button>
                <button
                  type="button"
                  className="hub-clientes__link-btn"
                  disabled={linkBusy}
                  onClick={() => void generateLink(true)}
                >
                  Gerar novo link
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="hub-grooming-drawer__hint">
                Envie um link para o tutor conferir alimentação, medicação e manejo antes da entrada.
              </p>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                disabled={linkBusy}
                onClick={() => void generateLink(false)}
              >
                {linkBusy ? 'Gerando…' : 'Gerar link para o tutor'}
              </button>
            </>
          )}
        </section>
      ) : null}

      <BoardingCareEditor
        idPrefix={`stay-${reservationId}`}
        blocks={planBlocks}
        value={draft}
        onChange={handleChange}
        disabled={!editable}
        statusByBlock={localStatus}
        onConfirmBlock={editable ? handleConfirm : undefined}
        dirtyBlocks={dirty}
        saveToProfile={
          editable
            ? {
                selected: saveToProfile,
                onToggle: (k) =>
                  setSaveToProfile((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  }),
              }
            : null
        }
      />

      <section className="hub-grooming-drawer__section">
        <label className="hub-grooming-drawer__heading" htmlFor={`stay-${reservationId}-instructions`}>
          Instruções para a equipe
        </label>
        <textarea
          id={`stay-${reservationId}-instructions`}
          className="hub-clientes__input"
          rows={3}
          value={instructions}
          disabled={!editable}
          placeholder="Ex.: tutor liga às 19h, enviar foto no fim do dia"
          onChange={(e) => setInstructions(e.target.value)}
        />
        {profile?.notes ? <p className="hub-grooming-drawer__hint">Ficha do pet: {profile.notes}</p> : null}
      </section>

      {editable ? (
        <div className="hub-boarding-stay__savebar">
          <span className="hub-grooming-drawer__muted">
            {hasChanges ? 'Alterações não salvas' : 'Sem alterações'}
          </span>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !hasChanges}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar plano'}
          </button>
        </div>
      ) : null}
    </>
  );
};

export default BoardingStayCareTab;
