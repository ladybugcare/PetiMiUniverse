import type { Area } from 'react-easy-crop';

/** Proporção da capa pública (alinhada ao hero ~largura / 640px). */
export const COVER_CROP_ASPECT = 2.5;

/** Largura máxima exportada (altura = width / aspect). */
export const COVER_EXPORT_WIDTH = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Não foi possível carregar a imagem.')));
    img.src = src;
  });
}

/** Recorta a área selecionada e devolve um File JPEG pronto para upload. */
export async function cropCoverImageToFile(
  imageSrc: string,
  croppedAreaPixels: Area,
  fileName = 'capa.jpg',
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não disponível neste navegador.');

  const { width, height, x, y } = croppedAreaPixels;
  const outW = COVER_EXPORT_WIDTH;
  const outH = Math.round(outW / COVER_CROP_ASPECT);
  canvas.width = outW;
  canvas.height = outH;

  ctx.fillStyle = '#1a1614';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(image, x, y, width, height, 0, 0, outW, outH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem recortada.'))),
      'image/jpeg',
      0.9,
    );
  });

  const base = fileName.replace(/\.[^.]+$/, '') || 'capa';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
