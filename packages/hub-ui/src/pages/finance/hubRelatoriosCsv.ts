/** Gera e baixa um CSV (UTF-8 com BOM) a partir de linhas de objetos. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): void {
  const escape = (cell: string | number | null | undefined): string => {
    const s = cell == null ? '' : String(cell);
    if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function reportCsvFilename(slug: string): string {
  const d = new Date().toISOString().slice(0, 10);
  return `petmi-${slug}-${d}.csv`;
}
