import React, { useMemo } from 'react';
import { Building2, User } from 'lucide-react';
import { HubSidePanel } from '../../components/HubSidePanel';
import { formatBrPhoneDisplay } from '../../utils/formatBrPhone';
import {
  GuardianCreateForm,
  type GuardianFormValues,
} from './GuardianCreateForm';
import { GuardianDetailPanel } from './GuardianDetailPanel';
import type { HubGuardian } from '../../api/hubGuardiansApi';
import './clientes.css';
import './clientes-drawer.css';

export type GuardianDrawerMode = 'create' | 'edit' | 'detail' | 'quote_review';

export type GuardianDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCancelEdit?: () => void;
  mode: GuardianDrawerMode;
  canWrite: boolean;
  form: GuardianFormValues;
  onFormChange: (next: GuardianFormValues) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  guardian: HubGuardian | null;
  onStartEdit: () => void;
  onOpenInNewPage: () => void;
  onArchive?: () => void;
  fromQuoteId?: string;
  quoteConversionLoading?: boolean;
  quoteConvShort?: string;
  linkGuardianId?: string;
  onContinueToPets?: () => void;
  canWritePets?: boolean;
};

const GUARDIAN_FORM_ID = 'hub-guardian-drawer-form';

export const GuardianDrawer: React.FC<GuardianDrawerProps> = ({
  open,
  onClose,
  onCancelEdit,
  mode,
  canWrite,
  form,
  onFormChange,
  onSubmit,
  submitting,
  guardian,
  onStartEdit,
  onOpenInNewPage,
  onArchive,
  fromQuoteId,
  quoteConversionLoading,
  quoteConvShort,
  linkGuardianId,
  onContinueToPets,
  canWritePets = false,
}) => {
  const isCompany = useMemo(() => {
    if (mode === 'detail' && guardian) return guardian.client_kind === 'company';
    return form.client_kind === 'company';
  }, [mode, guardian, form.client_kind]);

  const title = useMemo(() => {
    if (mode === 'detail' && guardian) return guardian.full_name;
    if (mode === 'edit') return isCompany ? 'Editar empresa' : 'Editar tutor';
    if (mode === 'quote_review') return 'Rever contacto do orçamento';
    return isCompany ? 'Cadastrar nova empresa' : 'Cadastrar novo tutor';
  }, [mode, guardian, isCompany]);

  const subtitle = useMemo(() => {
    if (mode === 'detail' && guardian?.created_at) {
      return `Cliente desde ${new Date(guardian.created_at).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`;
    }
    if (mode === 'create' && fromQuoteId && !linkGuardianId) {
      return `Conversão do orçamento #${quoteConvShort ?? ''}`;
    }
    return undefined;
  }, [mode, guardian, fromQuoteId, linkGuardianId, quoteConvShort]);

  const footer = useMemo(() => {
    if (mode === 'detail' && guardian) {
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--outline" onClick={onStartEdit}>
            {guardian.client_kind === 'company' ? 'Editar empresa' : 'Editar tutor'}
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={onOpenInNewPage}>
            Ver perfil completo
          </button>
        </div>
      );
    }

    if (mode === 'quote_review') {
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={quoteConversionLoading || !form.tax_id?.trim()}
            onClick={() => onContinueToPets?.()}
          >
            Continuar para pets
          </button>
        </div>
      );
    }

    if (mode === 'create' || mode === 'edit') {
      const handleCancel = mode === 'edit' && onCancelEdit ? onCancelEdit : onClose;
      return (
        <div className="hub-finance-page__drawer-footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={handleCancel} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            form={GUARDIAN_FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !canWrite}
          >
            {submitting ? 'Salvando…' : isCompany ? 'Salvar empresa' : 'Salvar tutor'}
          </button>
        </div>
      );
    }

    return undefined;
  }, [
    mode,
    guardian,
    onClose,
    onStartEdit,
    onOpenInNewPage,
    quoteConversionLoading,
    form.tax_id,
    onContinueToPets,
    onCancelEdit,
    submitting,
    canWrite,
    isCompany,
  ]);

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={
        mode !== 'quote_review' ? (
          isCompany ? (
            <Building2 size={20} strokeWidth={2} aria-hidden />
          ) : (
            <User size={20} strokeWidth={2} aria-hidden />
          )
        ) : undefined
      }
      subtitle={subtitle}
      footer={footer}
    >
      <div className="hub-clientes-drawer__content">
        {mode === 'detail' && guardian ? (
          <GuardianDetailPanel
            guardian={guardian}
            pets={guardian.pets ?? []}
            onClose={onClose}
            onStartEdit={onStartEdit}
            onOpenInNewPage={onOpenInNewPage}
            onArchive={onArchive}
            hideNewPageButton
            hideHeader
            hideFooter
            canWritePets={canWritePets}
          />
        ) : mode === 'quote_review' ? (
          <>
            {fromQuoteId ? (
              <div className="hub-clientes-drawer__banner" role="status">
                {quoteConversionLoading ? (
                  'A carregar orçamento…'
                ) : (
                  <>
                    A concluir conversão do orçamento #{quoteConvShort}.{' '}
                    <strong>Será usado o tutor existente</strong> — confira os dados do contacto do orçamento e
                    continue para cadastrar os pets.
                  </>
                )}
              </div>
            ) : null}
            <dl
              className="hub-clientes__muted hub-clientes-drawer__quote-review"
              style={{ display: 'grid', gap: 8 }}
            >
              <div>
                <dt>Nome</dt>
                <dd>{form.full_name || '—'}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{formatBrPhoneDisplay(form.phone)}</dd>
              </div>
              <div>
                <dt>CPF / CNPJ</dt>
                <dd>{form.tax_id?.trim() || '—'}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{form.email?.trim() || '—'}</dd>
              </div>
            </dl>
            {!form.tax_id?.trim() ? (
              <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
                É obrigatório um CPF/CNPJ no contacto do orçamento para continuar. Atualize o orçamento ou o prospecto
                e volte a abrir esta conversão.
              </p>
            ) : null}
          </>
        ) : (
          <>
            {fromQuoteId && mode === 'create' && !linkGuardianId ? (
              <div className="hub-clientes-drawer__banner" role="status">
                {quoteConversionLoading ? (
                  'A carregar orçamento…'
                ) : (
                  <>
                    A concluir conversão do orçamento #{quoteConvShort}. Confirme ou ajuste os dados do tutor e
                    salve para seguir ao cadastro dos pets.
                  </>
                )}
              </div>
            ) : null}
            <GuardianCreateForm
              value={form}
              onChange={onFormChange}
              onSubmit={onSubmit}
              submitting={submitting}
              canWrite={canWrite}
              title=""
              hideFooter
              formId={GUARDIAN_FORM_ID}
            />
          </>
        )}
      </div>
    </HubSidePanel>
  );
};

export default GuardianDrawer;
