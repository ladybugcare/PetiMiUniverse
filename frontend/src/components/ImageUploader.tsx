import React, { useState, useRef, ChangeEvent } from 'react';
import { colors } from '../styles/colors';

interface ImageUploaderProps {
  maxImages?: number;
  maxSizeMB?: number;
  onImagesChange: (files: File[]) => void;
  existingImages?: string[]; // For edit mode
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  maxImages = 5,
  maxSizeMB = 5,
  onImagesChange,
  existingImages = [],
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>(existingImages);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError('');

    // Check if adding these files would exceed max
    if (selectedFiles.length + files.length > maxImages) {
      setError(`Você pode adicionar no máximo ${maxImages} imagens`);
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of files) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} não é uma imagem válida`);
        continue;
      }

      // Check file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`${file.name} excede o tamanho máximo de ${maxSizeMB}MB`);
        continue;
      }

      validFiles.push(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === validFiles.length) {
          setPreviews([...previews, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    }

    const updatedFiles = [...selectedFiles, ...validFiles];
    setSelectedFiles(updatedFiles);
    onImagesChange(updatedFiles);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    
    setSelectedFiles(newFiles);
    setPreviews(newPreviews);
    onImagesChange(newFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    // Create a mock event to reuse validation logic
    const mockEvent = {
      target: { files },
    } as any;
    
    handleFileSelect(mockEvent);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div style={styles.container}>
      {/* Upload Area */}
      <div
        style={styles.uploadArea}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={styles.hiddenInput}
        />
        
        <div style={styles.uploadIcon}>📸</div>
        <p style={styles.uploadText}>
          Arraste suas fotos aqui ou <span style={styles.browseText}>clique para escolher</span>
        </p>
        <p style={styles.uploadHint}>
          Até {maxImages} imagens • Máximo {maxSizeMB}MB por imagem
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={styles.errorMessage}>
          ⚠️ {error}
        </div>
      )}

      {/* Preview Grid */}
      {previews.length > 0 && (
        <div style={styles.previewGrid}>
          {previews.map((preview, index) => (
            <div key={index} style={styles.previewItem}>
              <img src={preview} alt={`Preview ${index + 1}`} style={styles.previewImage} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(index);
                }}
                style={styles.removeButton}
              >
                ✕
              </button>
              {index === 0 && (
                <div style={styles.mainBadge}>Principal</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image Counter */}
      {previews.length > 0 && (
        <p style={styles.counter}>
          {previews.length} de {maxImages} imagens selecionadas
        </p>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
  },
  uploadArea: {
    border: '2px dashed #d1d5db',
    borderRadius: '12px',
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: '#fafafa',
    transition: 'all 0.2s ease',
  },
  hiddenInput: {
    display: 'none',
  },
  uploadIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  uploadText: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    color: '#525252',
    marginBottom: '8px',
  },
  browseText: {
    color: colors.brand.primary[500],
    fontWeight: '500',
    textDecoration: 'underline',
  },
  uploadHint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
  },
  errorMessage: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#dc2626',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '12px',
    marginTop: '20px',
  },
  previewItem: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '2px solid #e5e5e5',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  removeButton: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
  },
  mainBadge: {
    position: 'absolute',
    bottom: '4px',
    left: '4px',
    backgroundColor: colors.brand.primary[500],
    color: '#ffffff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
  },
  counter: {
    marginTop: '12px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    color: '#737373',
    textAlign: 'center',
  },
};

export default ImageUploader;

