import React, { useCallback, useEffect, useState } from 'react';
import { hubStaffApi, type HubStaffMember, HubVetStampImageField, useAlert } from '@petimi/hub-ui';
import { HubAccountProfileCard } from './profile';

type HubMyVetStampCardProps = {
  clinicId: string | null | undefined;
};

export const HubMyVetStampCard: React.FC<HubMyVetStampCardProps> = ({ clinicId }) => {
  const { showError, showSuccess } = useAlert();
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState(false);
  const [staff, setStaff] = useState<HubStaffMember | null>(null);
  const [uploading, setUploading] = useState<'signature' | 'stamp' | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) {
      setStaff(null);
      setLinked(false);
      return;
    }
    setLoading(true);
    try {
      const res = await hubStaffApi.getMe(clinicId);
      setStaff(res.staff);
      setLinked(res.linked);
    } catch (e) {
      setStaff(null);
      setLinked(false);
      showError((e as Error)?.message || 'Não foi possível carregar assinatura e carimbo.', 'PetMi Hub');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!clinicId) return null;

  return (
    <HubAccountProfileCard
      title="Assinatura e carimbo"
      subtitle="Usados automaticamente em receitas, exames e encaminhamentos. Não substitui assinatura digital ICP-Brasil."
    >
      {loading ? (
        <p className="hub-ap__prefs-hint">Carregando…</p>
      ) : !linked || !staff ? (
        <p className="hub-ap__prefs-hint">
          Seu usuário ainda não está vinculado a um profissional na Equipe. Peça à clínica para vincular o
          acesso para cadastrar assinatura e carimbo.
        </p>
      ) : (
        <div className="hub-vet-stamp-fields">
          <p className="hub-vet-stamp-fields__intro">
            Foto nítida em fundo claro ou PNG transparente. Máx. 5 MB (PNG, JPG ou WEBP).
          </p>
          <div className="hub-vet-stamp-fields__grid">
            <HubVetStampImageField
              label="Assinatura"
              variant="signature"
              imageUrl={staff.signature_image_url}
              uploading={uploading === 'signature'}
              onUpload={async (file) => {
                setUploading('signature');
                try {
                  const res = await hubStaffApi.uploadMeSignature(clinicId, file);
                  setStaff(res.staff);
                  showSuccess('Assinatura salva.', 'PetMi Hub');
                } catch (e) {
                  showError((e as Error)?.message || 'Falha ao enviar assinatura.', 'PetMi Hub');
                  throw e;
                } finally {
                  setUploading(null);
                }
              }}
              onClear={async () => {
                try {
                  const res = await hubStaffApi.patchMe(clinicId, { signature_image_url: null });
                  setStaff(res.staff);
                  showSuccess('Assinatura removida.', 'PetMi Hub');
                } catch (e) {
                  showError((e as Error)?.message || 'Falha ao remover assinatura.', 'PetMi Hub');
                }
              }}
            />
            <HubVetStampImageField
              label="Carimbo"
              variant="stamp"
              imageUrl={staff.stamp_image_url}
              uploading={uploading === 'stamp'}
              onUpload={async (file) => {
                setUploading('stamp');
                try {
                  const res = await hubStaffApi.uploadMeStamp(clinicId, file);
                  setStaff(res.staff);
                  showSuccess('Carimbo salvo.', 'PetMi Hub');
                } catch (e) {
                  showError((e as Error)?.message || 'Falha ao enviar carimbo.', 'PetMi Hub');
                  throw e;
                } finally {
                  setUploading(null);
                }
              }}
              onClear={async () => {
                try {
                  const res = await hubStaffApi.patchMe(clinicId, { stamp_image_url: null });
                  setStaff(res.staff);
                  showSuccess('Carimbo removido.', 'PetMi Hub');
                } catch (e) {
                  showError((e as Error)?.message || 'Falha ao remover carimbo.', 'PetMi Hub');
                }
              }}
            />
          </div>
        </div>
      )}
    </HubAccountProfileCard>
  );
};

export default HubMyVetStampCard;
