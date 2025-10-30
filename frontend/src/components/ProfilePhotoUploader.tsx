import React, { useState, useRef } from 'react';

interface ProfilePhotoUploaderProps {
  currentPhotoUrl?: string;
  onPhotoSelect: (file: File) => void;
  isUploading?: boolean;
}

const ProfilePhotoUploader: React.FC<ProfilePhotoUploaderProps> = ({
  currentPhotoUrl,
  onPhotoSelect,
  isUploading = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione apenas arquivos de imagem');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 5MB');
        return;
      }

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Call parent handler
      onPhotoSelect(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const displayUrl = previewUrl || currentPhotoUrl;

  return (
    <div style={styles.container}>
      <div style={styles.photoContainer} onClick={handleClick}>
        {displayUrl ? (
          <img src={displayUrl} alt="Profile" style={styles.photo} />
        ) : (
          <div style={styles.placeholder}>
            <span style={styles.placeholderIcon}>👤</span>
          </div>
        )}
        <div style={styles.overlay}>
          {isUploading ? (
            <span style={styles.uploadingText}>Carregando...</span>
          ) : (
            <span style={styles.changeText}>📷 Alterar foto</span>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={styles.hiddenInput}
        disabled={isUploading}
      />
      <p style={styles.hint}>Clique para alterar a foto de perfil</p>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  photoContainer: {
    position: 'relative',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '3px solid #e5e5e5',
    transition: 'border-color 0.2s ease',
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: '48px',
    opacity: 0.5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.2s ease',
  },
  changeText: {
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '500',
  },
  uploadingText: {
    color: '#ffffff',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '500',
  },
  hiddenInput: {
    display: 'none',
  },
  hint: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    color: '#737373',
    margin: 0,
  },
};

// Add hover effect through style tag
const styleTag = document.createElement('style');
styleTag.innerHTML = `
  div[style*="photoContainer"]:hover div[style*="overlay"] {
    opacity: 1 !important;
  }
`;
document.head.appendChild(styleTag);

export default ProfilePhotoUploader;

