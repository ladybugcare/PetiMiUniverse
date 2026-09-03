import React, { useState } from 'react';
import { Download, FileText } from 'lucide-react';

type HubRelatoriosExportButtonProps = {
  onClick: () => void;
  onPdf?: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  pdfLabel?: string;
};

export const HubRelatoriosExportButton: React.FC<HubRelatoriosExportButtonProps> = ({
  onClick,
  onPdf,
  disabled,
  label = 'Exportar CSV',
  pdfLabel = 'Exportar PDF',
}) => {
  const [pdfBusy, setPdfBusy] = useState(false);

  return (
    <div className="hub-relatorios__export-group">
      <button
        type="button"
        className="hub-clientes__btn hub-relatorios__export-btn"
        onClick={onClick}
        disabled={disabled}
      >
        <Download size={16} aria-hidden />
        {label}
      </button>
      {onPdf ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-relatorios__export-btn"
          disabled={disabled || pdfBusy}
          onClick={() => {
            void (async () => {
              setPdfBusy(true);
              try {
                await onPdf();
              } finally {
                setPdfBusy(false);
              }
            })();
          }}
        >
          <FileText size={16} aria-hidden />
          {pdfBusy ? 'Gerando…' : pdfLabel}
        </button>
      ) : null}
    </div>
  );
};

export default HubRelatoriosExportButton;
