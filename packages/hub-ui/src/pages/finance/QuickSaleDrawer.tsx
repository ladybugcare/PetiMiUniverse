import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dog, ShoppingBag, User, UserPlus } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubGuardiansApi, type HubGuardian } from '../../api/hubGuardiansApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import '../clientes/clientes.css';
import './hub-finance-page.css';

type Props = {
  open: boolean;
  unitId: string | null;
  onClose: () => void;
  onOpened: (comandaId: string) => void;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export const QuickSaleDrawer: React.FC<Props> = ({ open, unitId, onClose, onOpened }) => {
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [petId, setPetId] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingGuardian, setCreatingGuardian] = useState(false);

  const resetForm = useCallback(() => {
    setGuardianId('');
    setPetId('');
    setPets([]);
    setShowQuickCreate(false);
    setFullName('');
    setPhone('');
    setTaxId('');
    setCreateError(null);
  }, []);

  const load = useCallback(async () => {
    if (!clinicId || !open) return;
    setLoading(true);
    try {
      const guRes = await hubGuardiansApi.list(clinicId, true, { status: 'active' });
      setGuardians(guRes.guardians ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar tutores');
    } finally {
      setLoading(false);
    }
  }, [clinicId, open, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!clinicId || !guardianId) {
      setPets([]);
      setPetId('');
      return;
    }
    void hubPetsApi
      .list(clinicId)
      .then((r) => {
        const all = r.pets ?? [];
        setPets(
          all.filter(
            (p) =>
              p.primary_guardian?.guardian_id === guardianId ||
              p.secondary_guardian?.guardian_id === guardianId,
          ),
        );
      })
      .catch(() => setPets([]));
    setPetId('');
  }, [clinicId, guardianId]);

  const guardianOptions = useMemo(
    () => [
      { value: '', label: '— Selecionar tutor —' },
      ...guardians.map((g) => ({
        value: g.id,
        label: g.phone ? `${g.full_name} · ${g.phone}` : g.full_name,
        icon: <User size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [guardians],
  );

  const petOptions = useMemo(
    () => [
      { value: '', label: '— Sem pet (só tutor) —' },
      ...pets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [pets],
  );

  const canSubmit = Boolean(clinicId && guardianId && unitId && !submitting);

  const handleQuickCreate = async () => {
    if (!clinicId) return;
    setCreateError(null);
    if (!fullName.trim()) {
      setCreateError('Informe o nome do tutor.');
      return;
    }
    if (!phone.trim()) {
      setCreateError('Informe o telefone.');
      return;
    }
    if (!taxId.trim()) {
      setCreateError('Informe o CPF.');
      return;
    }

    setCreatingGuardian(true);
    try {
      const q = digitsOnly(taxId).length >= 11 ? digitsOnly(taxId) : phone.trim();
      if (q) {
        const { guardians: hits } = await hubGuardiansApi.list(clinicId, false, { status: 'active', q });
        const hit = hits[0];
        if (hit) {
          setCreateError(`Cliente já cadastrado: ${hit.full_name}. Selecione-o na lista.`);
          setCreatingGuardian(false);
          return;
        }
      }
      const { guardian } = await hubGuardiansApi.create({
        clinic_id: clinicId,
        client_kind: 'individual',
        full_name: fullName.trim(),
        phone: phone.trim(),
        tax_id: taxId.trim(),
        lead_source: 'Passante',
      });
      setGuardians((prev) => {
        if (prev.some((g) => g.id === guardian.id)) return prev;
        return [guardian, ...prev];
      });
      setGuardianId(guardian.id);
      setShowQuickCreate(false);
      setFullName('');
      setPhone('');
      setTaxId('');
    } catch (e: unknown) {
      setCreateError((e as Error)?.message || 'Erro ao cadastrar tutor');
    } finally {
      setCreatingGuardian(false);
    }
  };

  const handleOpenComanda = async () => {
    if (!clinicId || !guardianId || !unitId) return;
    setSubmitting(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardianId,
        pet_id: petId || null,
        unit_id: unitId,
        manual_lines: [],
      });
      const comandaId = (detail.comanda as Record<string, unknown>).id as string;
      onOpened(comandaId);
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir comanda');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Venda rápida"
      titleIcon={<ShoppingBag size={20} strokeWidth={1.75} />}
      subtitle="Abra uma comanda sem atendimento para vender produtos ou serviços no balcão."
      footer={
        <div className="hub-sell-package__footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!canSubmit}
            onClick={() => void handleOpenComanda()}
          >
            <ShoppingBag size={16} aria-hidden />
            {submitting ? 'Abrindo…' : 'Abrir comanda'}
          </button>
        </div>
      }
    >
      {loading ? (
        <HubLoading variant="inline" label="Carregando tutores…" />
      ) : (
        <div className="hub-sell-package__form">
          <div className="hub-clientes__field">
            <div className="hub-sell-package__pets-head">
              <label className="hub-clientes__label" htmlFor="quick-sale-guardian">
                Tutor
              </label>
              {!showQuickCreate ? (
                <button
                  type="button"
                  className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
                  onClick={() => {
                    setShowQuickCreate(true);
                    setCreateError(null);
                  }}
                >
                  <UserPlus size={14} strokeWidth={2.25} aria-hidden />
                  Cadastrar rápido
                </button>
              ) : null}
            </div>
            <HubSearchableCombobox
              id="quick-sale-guardian"
              options={guardianOptions}
              value={guardianId}
              onChange={(id) => {
                setGuardianId(id);
                setShowQuickCreate(false);
              }}
              placeholder="Buscar tutor…"
              searchPlaceholder="Nome, telefone ou CPF"
              ariaLabel="Tutor"
              triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
            />
          </div>

          {showQuickCreate ? (
            <div className="hub-sell-package__line-card" style={{ marginBottom: 12 }}>
              <p className="hub-clientes__muted hub-sell-package__hint" style={{ marginTop: 0 }}>
                Cadastro mínimo para venda no balcão. Depois você pode completar a ficha do cliente.
              </p>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="quick-sale-name">
                  Nome
                </label>
                <input
                  id="quick-sale-name"
                  className="hub-clientes__input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="quick-sale-phone">
                  Telefone
                </label>
                <input
                  id="quick-sale-phone"
                  className="hub-clientes__input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="quick-sale-tax">
                  CPF
                </label>
                <input
                  id="quick-sale-tax"
                  className="hub-clientes__input"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {createError ? <p className="hub-clientes__error">{createError}</p> : null}
              <div className="hub-sell-package__footer" style={{ padding: 0, marginTop: 8 }}>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => {
                    setShowQuickCreate(false);
                    setCreateError(null);
                  }}
                  disabled={creatingGuardian}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  onClick={() => void handleQuickCreate()}
                  disabled={creatingGuardian}
                >
                  {creatingGuardian ? 'Salvando…' : 'Salvar tutor'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="quick-sale-pet">
              Pet (opcional)
            </label>
            <HubSearchableCombobox
              id="quick-sale-pet"
              options={petOptions}
              value={petId}
              onChange={setPetId}
              placeholder={guardianId ? 'Sem pet ou escolher…' : 'Escolha o tutor primeiro'}
              searchPlaceholder="Nome do pet"
              ariaLabel="Pet"
              disabled={!guardianId}
              triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
            />
            {guardianId && pets.length === 0 ? (
              <p className="hub-clientes__muted hub-sell-package__hint">Este tutor não tem pets — a comanda fica só no tutor.</p>
            ) : null}
          </div>

          <p className="hub-clientes__muted hub-sell-package__hint">
            Na comanda você adiciona produtos do estoque e serviços, e faz o checkout.
          </p>
        </div>
      )}
    </HubSidePanel>
  );
};
