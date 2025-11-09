import React, { useState, useRef } from 'react';
import { Upload, X, AlertCircle, FileText, Plus } from 'lucide-react';
import colors from '../styles/colors';
import IconWrapper from './IconWrapper';

interface CertificationFile {
  file: File;
  url?: string;
  path?: string;
}

interface CertificationUploaderProps {
  onFilesChange: (files: CertificationFile[]) => void;
  existingFiles?: string[];
  disabled?: boolean;
  maxSizeMB?: number;
  maxFiles?: number;
}

const CertificationUploader: React.FC<CertificationUploaderProps> = ({
  onFilesChange,
  existingFiles = [],
  disabled = false,
  maxSizeMB = 5,
  maxFiles = 10,
}) => {
  const [files, setFiles] = useState<CertificationFile[]>([]);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setError('');

    // Verificar limite de arquivos
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`Você pode enviar no máximo ${maxFiles} arquivos.`);
      return;
    }

    const validFiles: CertificationFile[] = [];

    for (const file of selectedFiles) {
      // Validar tipo
      if (!allowedTypes.includes(file.type)) {
        setError(`Tipo de arquivo inválido: ${file.name}. Apenas PNG, JPG e PDF são permitidos.`);
        continue;
      }

      // Validar tamanho
      if (file.size > maxSizeBytes) {
        setError(`Arquivo muito grande: ${file.name}. Tamanho máximo: ${maxSizeMB}MB`);
        continue;
      }

      validFiles.push({ file });
    }

    if (validFiles.length > 0) {
      const newFiles = [...files, ...validFiles];
      setFiles(newFiles);
      onFilesChange(newFiles);
    }

    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesChange(newFiles);
    setError('');
  };

  const handleAddMore = () => {
    if (files.length >= maxFiles) {
      setError(`Você pode enviar no máximo ${maxFiles} arquivos.`);
      return;
    }
    fileInputRef.current?.click();
  };

  return (
    <div style={styles.container}>
      {/* Área de upload inicial ou botão para adicionar mais */}
      {files.length === 0 ? (
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
            Clique para enviar certificações
          </p>
          <p style={styles.uploadHint}>
            PNG, JPG ou PDF (máximo {maxSizeMB}MB por arquivo)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            onChange={handleFileSelect}
            multiple
            style={styles.hiddenInput}
            disabled={disabled}
          />
        </div>
      ) : (
        <div style={styles.filesList}>
          {files.map((certFile, index) => (
            <div key={index} style={styles.fileItem}>
              <div style={styles.fileContent}>
                <FileText size={20} style={styles.fileIcon} />
                <div style={styles.fileInfo}>
                  <p style={styles.fileName}>{certFile.file.name}</p>
                  <p style={styles.fileSize}>
                    {(certFile.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  style={styles.removeButton}
                  title="Remover arquivo"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}

          {files.length < maxFiles && !disabled && (
            <button
              type="button"
              onClick={handleAddMore}
              style={styles.addMoreButton}
            >
              <Plus size={18} />
              <span>Adicionar outro arquivo</span>
            </button>
          )}
        </div>
      )}

      {/* Input oculto para múltiplos arquivos (usado pelo botão "Adicionar outro arquivo") */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={handleFileSelect}
        multiple
        style={styles.hiddenInput}
        disabled={disabled}
      />

      {/* Mensagem de erro */}
      {error && (
        <div style={styles.errorContainer}>
          <IconWrapper icon={AlertCircle} size={16} />
          <span style={styles.errorText}>{error}</span>
        </div>
      )}

      {/* Informações */}
      {files.length > 0 && !error && (
        <div style={styles.infoContainer}>
          <p style={styles.infoText}>
            {files.length} {files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}
            {files.length < maxFiles && ` (máximo ${maxFiles})`}
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
    color: colors.primary,
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
  filesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    padding: '12px 16px',
    backgroundColor: colors.surface,
    gap: '12px',
  },
  fileContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  fileIcon: {
    color: colors.primary,
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: '14px',
    color: colors.text,
    fontWeight: '500',
    margin: 0,
    wordBreak: 'break-word',
  },
  fileSize: {
    fontSize: '12px',
    color: colors.textSecondary,
    margin: '4px 0 0 0',
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
  addMoreButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    justifyContent: 'center',
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
  errorText: {
    fontSize: '14px',
    color: '#991b1b',
  },
  infoContainer: {
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: colors.primaryLight,
    borderRadius: '6px',
  },
  infoText: {
    fontSize: '14px',
    color: colors.primary,
  },
};

export default CertificationUploader;

