import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { downloadReportPdf } from './hubRelatoriosPdf';

type ExportCells = Array<Array<string | number | null | undefined>>;

type MakeReportExportersOpts = {
  clinicId: string;
  title: string;
  subtitle?: string | null;
  slug: string;
  headers: string[];
  rows: ExportCells;
  showError: (message: string) => void;
};

/** CSV + PDF a partir do mesmo conjunto de colunas/linhas. */
export function makeReportExporters(opts: MakeReportExportersOpts) {
  const onCsv = () => {
    downloadCsv(reportCsvFilename(opts.slug), opts.headers, opts.rows);
  };

  const onPdf = async () => {
    try {
      await downloadReportPdf({
        clinicId: opts.clinicId,
        title: opts.title,
        subtitle: opts.subtitle,
        filename: opts.slug,
        headers: opts.headers,
        rows: opts.rows,
      });
    } catch (e) {
      opts.showError((e as Error)?.message || 'Erro ao gerar PDF');
    }
  };

  return { onCsv, onPdf };
}
