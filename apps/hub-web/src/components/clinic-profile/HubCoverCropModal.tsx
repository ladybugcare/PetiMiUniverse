import React, { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { HubModal } from '@petimi/hub-ui';
import { COVER_CROP_ASPECT, cropCoverImageToFile } from './coverCropUtils';
import './HubCoverCropModal.css';

type Props = {
  open: boolean;
  imageSrc: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

const HubCoverCropModal: React.FC<Props> = ({ open, imageSrc, busy = false, onClose, onConfirm }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels || busy || working) return;
    setWorking(true);
    try {
      const file = await cropCoverImageToFile(imageSrc, croppedAreaPixels);
      await onConfirm(file);
    } finally {
      setWorking(false);
    }
  };

  const disabled = busy || working || !imageSrc;

  return (
    <HubModal
      open={open && Boolean(imageSrc)}
      onClose={() => {
        if (busy || working) return;
        onClose();
      }}
      title="Ajustar foto de capa"
      subtitle="Arraste e use o zoom para escolher a parte que aparece no hero da página."
      size="xl"
      footer={
        <div className="hub-cover-crop__footer">
          <button
            type="button"
            className="hub-cover-crop__btn hub-cover-crop__btn--ghost"
            onClick={onClose}
            disabled={busy || working}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="hub-cover-crop__btn hub-cover-crop__btn--primary"
            onClick={() => void handleConfirm()}
            disabled={disabled || !croppedAreaPixels}
          >
            {busy || working ? 'Enviando…' : 'Usar este recorte'}
          </button>
        </div>
      }
    >
      <div className="hub-cover-crop">
        <div className="hub-cover-crop__stage">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={COVER_CROP_ASPECT}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid
              objectFit="contain"
            />
          ) : null}
        </div>
        <div className="hub-cover-crop__controls">
          <label className="hub-cover-crop__zoom-label" htmlFor="hub-cover-crop-zoom">
            Zoom
          </label>
          <input
            id="hub-cover-crop-zoom"
            className="hub-cover-crop__zoom"
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            disabled={disabled}
          />
          <p className="hub-cover-crop__hint">
            Proporção da capa: 2,5∶1 (ex.: 1600×640). O que ficar fora da área clara será cortado.
          </p>
        </div>
      </div>
    </HubModal>
  );
};

export default HubCoverCropModal;
