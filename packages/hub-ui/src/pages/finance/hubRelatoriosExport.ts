import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { downloadReportPdf } from './hubRelatoriosPdf';
import type { HubReportId } from './hubRelatoriosConfig';

type ExportCells = Array<Array<string | number | null | undefined>>;

type MakeReportExportersOpts = {
  clinicId: string;
  reportId: HubReportId;
  unitId?: string | null;
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
        reportId: opts.reportId,
        unitId: opts.unitId,
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
