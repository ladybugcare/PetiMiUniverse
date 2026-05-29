import React, { useRef, useState } from 'react';
import { Camera, Building2 } from 'lucide-react';
import HubAvatar from './HubAvatar';
import { hubProfileApi } from '../services/hubProfileApi';
import { useAlert } from '@petimi/hub-ui';
import { useAuth, CLINIC_STORAGE_UPDATED_EVENT } from '@petimi/web-core';

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

type UserMode = {
  kind: 'user';
};

type ClinicMode = {
  kind: 'clinic';
  clinicId: string;
  onClinicUpdated?: (clinic: { photo_url?: string | null }) => void;
};

type Props = {
  mode: UserMode | ClinicMode;
  photoUrl?: string;
  displayName: string;
  size?: number;
  disabled?: boolean;
};

const HubProfilePhotoPicker: React.FC<Props> = ({
  mode,
  photoUrl,
  displayName,
  size = 96,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useAlert();
  const { setAuthFromLogin } = useAuth();

  const displaySrc = preview || photoUrl;

  const validateFile = (file: File): boolean => {
    if (!ALLOWED.includes(file.type)) {
      showError('Use PNG, JPG ou WEBP.');
      return false;
    }
    if (file.size > MAX_BYTES) {
      showError('Imagem grande demais (máx. 5 MB).');
      return false;
    }
    return true;
  };

  const onPick = async (file: File | undefined) => {
    if (!file || disabled || uploading) return;
    if (!validateFile(file)) return;

    const blobUrl = URL.createObjectURL(file);
    setPreview(blobUrl);
    setUploading(true);

    try {
      if (mode.kind === 'user') {
        const res = await hubProfileApi.uploadMyPhoto(file);
        const sessionRaw = localStorage.getItem('session');
        const session = sessionRaw ? JSON.parse(sessionRaw) : null;
        await setAuthFromLogin({ user: res.user, session });
        showSuccess('Foto de perfil atualizada.');
      } else {
        const res = await hubProfileApi.uploadClinicPhoto(mode.clinicId, file);
        mode.onClinicUpdated?.(res.clinic);
        window.dispatchEvent(new Event(CLINIC_STORAGE_UPDATED_EVENT));
        showSuccess('Foto da clínica atualizada.');
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar foto');
    } finally {
      URL.revokeObjectURL(blobUrl);
      setPreview(null);
      setUploading(false);
    }
  };

  return (
    <div className="hub-profile-photo-picker">
      <div className="hub-meu-perfil__avatar-block">
        {mode.kind === 'user' ? (
          <HubAvatar src={displaySrc} name={displayName} size={size} />
        ) : (
          <div className="hub-meu-perfil__clinic-logo" style={{ width: size, height: size }}>
            {displaySrc ? (
              <img
                src={displaySrc}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              <Building2 size={size * 0.42} strokeWidth={1.75} color="#c86a4d" />
            )}
          </div>
        )}
        <button
          type="button"
          className="hub-meu-perfil__camera-btn"
          disabled={disabled || uploading}
          aria-label={mode.kind === 'user' ? 'Alterar foto de perfil' : 'Alterar logótipo da clínica'}
          title={uploading ? 'A enviar…' : 'Alterar foto'}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={16} strokeWidth={2} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hub-pets-sr-only"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void onPick(f);
        }}
      />
      {uploading ? (
        <p className="hub-profile-photo-picker__hint" aria-live="polite">
          A enviar foto…
        </p>
      ) : null}
    </div>
  );
};

export default HubProfilePhotoPicker;
