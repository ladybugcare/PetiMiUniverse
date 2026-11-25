export async function copyPublicClinicalText(
  value: string,
  onDone?: () => void,
  onErr?: (msg: string) => void,
) {
  try {
    await navigator.clipboard.writeText(value);
    onDone?.();
  } catch {
    onErr?.('Não foi possível copiar');
  }
}

export async function downloadPublicClinicalPdf(
  pdfHref: string,
  filenameBase: string,
): Promise<'tab' | 'download'> {
  const res = await fetch(pdfHref, { credentials: 'omit' });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Não foi possível baixar o PDF');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const filename = `${(filenameBase || 'documento').replace(/[^\w.-]+/g, '_')}.pdf`;

  const opened = window.open(objectUrl, '_blank');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    return 'tab';
  }

  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  return 'download';
}

export function veterinarianPublicLabel(v: {
  full_name: string;
  crmv?: string | null;
  crmv_uf?: string | null;
}): string {
  const crmv = [v.crmv, v.crmv_uf].filter(Boolean).join('/');
  return crmv ? `${v.full_name} · CRMV ${crmv}` : v.full_name;
}
