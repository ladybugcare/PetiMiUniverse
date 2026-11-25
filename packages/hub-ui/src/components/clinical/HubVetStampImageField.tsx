import React, { useId, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Trash2 } from 'lucide-react';
import './hub-vet-stamp.css';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/*';

export type HubVetStampImageFieldProps = {
  label: string;
  hint?: string;
  imageUrl: string | null | undefined;
  disabled?: boolean;
  uploading?: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  /** Aspecto visual: assinatura (mais larga) ou carimbo (quadrado). */
  variant?: 'signature' | 'stamp';
};

export const HubVetStampImageField: React.FC<HubVetStampImageFieldProps> = ({
  label,
  hint,
  imageUrl,
  disabled,
  uploading,
  onUpload,
  onClear,
  variant = 'signature',
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = localPreview || imageUrl?.trim() || '';
  const hasImage = Boolean(preview);
  const Icon = variant === 'stamp' ? ImagePlus : Camera;

  const pick = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('Arquivo muito grande (máx. 5 MB).');
      return;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type) && !file.type.startsWith('image/')) {
      setError('Use PNG, JPG ou WEBP.');
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    try {
      await onUpload(file);
    } catch (e) {
      setLocalPreview(null);
      setError((e as Error)?.message || 'Falha no upload');
    }
  };

  return (
    <div className={`hub-vet-stamp-field hub-vet-stamp-field--${variant}`}>
      <div className="hub-vet-stamp-field__label-row">
        <p className="hub-vet-stamp-field__label">{label}</p>
        {hasImage && !uploading ? (
          <span className="hub-vet-stamp-field__badge">
            <Check size={12} strokeWidth={2.5} aria-hidden />
            Cadastrado
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="hub-vet-stamp-field__preview"
        onClick={pick}
        disabled={disabled || uploading}
        aria-label={hasImage ? `Alterar ${label.toLowerCase()}` : `Enviar ${label.toLowerCase()}`}
      >
        {hasImage ? (
          <img src={preview} alt="" />
        ) : (
          <span className="hub-vet-stamp-field__empty">
            <span className="hub-vet-stamp-field__empty-icon" aria-hidden>
              <Icon size={18} strokeWidth={2} />
            </span>
            <span className="hub-vet-stamp-field__placeholder">Tirar foto ou escolher arquivo</span>
          </span>
        )}
        {uploading ? <span className="hub-vet-stamp-field__busy">Enviando…</span> : null}
      </button>

      <div className="hub-vet-stamp-field__actions">
        <button
          type="button"
          className={`hub-vet-stamp-field__btn ${hasImage ? 'hub-vet-stamp-field__btn--ghost' : 'hub-vet-stamp-field__btn--primary'}`}
          onClick={pick}
          disabled={disabled || uploading}
        >
          <Icon size={14} strokeWidth={2.25} aria-hidden />
          {uploading ? 'Enviando…' : hasImage ? 'Trocar' : 'Enviar'}
        </button>
        {hasImage && onClear ? (
          <button
            type="button"
            className="hub-vet-stamp-field__btn hub-vet-stamp-field__btn--ghost"
            disabled={disabled || uploading}
            onClick={() => {
              setLocalPreview(null);
              setError(null);
              void onClear();
            }}
          >
            <Trash2 size={14} strokeWidth={2.25} aria-hidden />
            Remover
          </button>
        ) : null}
      </div>

      {hint ? <p className="hub-vet-stamp-field__hint">{hint}</p> : null}
      {error ? <p className="hub-vet-stamp-field__error">{error}</p> : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        capture="environment"
        hidden
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          void onFile(f);
        }}
      />
    </div>
  );
};
