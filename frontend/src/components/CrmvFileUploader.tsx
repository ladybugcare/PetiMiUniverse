import React, { useState, useRef } from 'react';
import { Upload, X, AlertCircle, FileText } from 'lucide-react';
import colors from '../styles/colors';

interface CrmvFileUploaderProps {
  onFileSelect: (file: File | null) => void;
  existingFileUrl?: string;
  disabled?: boolean;
  maxSizeMB?: number;
}

const CrmvFileUploader: React.FC<CrmvFileUploaderProps> = ({
  onFileSelect,
  existingFileUrl,
  disabled = false,
  maxSizeMB = 5,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(existingFileUrl || null);
  const [error, setError] = useState<string>('');
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validar tipo
    if (!allowedTypes.includes(file.type)) {
      setError(`Tipo de arquivo inválido. Apenas PNG, JPG e PDF são permitidos.`);
      return;
    }

    // Validar tamanho
    if (file.size > maxSizeBytes) {
      setError(`Arquivo muito grande. Tamanho máximo: ${maxSizeMB}MB`);
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
    // Não precisamos mais de preview de imagem, apenas mostrar o nome do arquivo
    setPreview(null);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setPreview(null);
    setError('');
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  return (
    <div style={styles.container}>
      {/* Área de upload */}
      {!preview && !selectedFile && (
        <div
          onClick={() => !disabled && fileInputRef.current?.click()}
          style={{
            ...styles.uploadArea,
            ...(disabled ? styles.disabled : {}),
            ...(error ? styles.uploadAreaError : {}),
          }}
        >
          <Upload size={32} style={styles.uploadIcon} />
          <p style={styles.uploadText}>
            Clique para enviar
          </p>
          <p style={styles.uploadHint}>
            PNG, JPG ou PDF (máximo {maxSizeMB}MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            onChange={handleFileSelect}
            style={styles.hiddenInput}
            disabled={disabled}
          />
        </div>
      )}

      {/* Preview */}
      {(preview || selectedFile) && (
        <div style={styles.previewContainer}>
          <div style={styles.previewContent}>
            <FileText size={24} style={styles.fileIcon} />
            <p style={styles.fileName}>
              {selectedFile?.name || 'Documento CRMV'}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                ...styles.removeButton,
                ...(isHovered ? styles.removeButtonHover : {}),
              }}
              title="Remover arquivo"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Mensagem de erro */}
      {error && (
        <div style={styles.errorContainer}>
          <AlertCircle size={16} style={styles.errorIcon} />
          <span style={styles.errorText}>{error}</span>
        </div>
      )}

      {/* Informações */}
      {selectedFile && !error && (
        <div style={styles.infoContainer}>
          <p style={styles.infoText}>
            Arquivo selecionado: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  uploadArea: {
    border: `2px dashed ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: colors.neutral[50],
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadAreaError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  uploadIcon: {
    color: colors.brand.primary[500],
    marginBottom: '8px',
  },
  uploadText: {
    fontSize: '14px',
    fontWeight: '500',
    color: colors.text,
    marginBottom: '4px',
  },
  uploadHint: {
    fontSize: '12px',
    color: colors.textSecondary,
  },
  hiddenInput: {
    display: 'none',
  },
  previewContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '12px 16px',
    backgroundColor: colors.surface,
    gap: '12px',
  },
  previewContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  fileIcon: {
    color: colors.brand.primary[500],
    flexShrink: 0,
  },
  fileName: {
    fontSize: '14px',
    color: colors.text,
    fontWeight: '500',
    margin: 0,
    wordBreak: 'break-word',
  },
  removeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: colors.neutral[100],
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  removeButtonHover: {
    backgroundColor: colors.error[100],
    color: colors.error[500],
    borderColor: colors.error[500],
  },
  errorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: '#fef2f2',
    borderRadius: '6px',
    border: '1px solid #fecaca',
  },
  errorIcon: {
    color: '#ef4444',
    flexShrink: 0,
  },
  errorText: {
    fontSize: '14px',
    color: '#991b1b',
  },
  infoContainer: {
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: colors.brand.primary[100],
    borderRadius: '6px',
  },
  infoText: {
    fontSize: '14px',
    color: colors.brand.primary[500],
  },
};

export default CrmvFileUploader;

