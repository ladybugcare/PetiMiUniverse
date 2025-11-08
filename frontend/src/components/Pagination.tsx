import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        style={{
          ...styles.button,
          ...(currentPage === 1 ? styles.buttonDisabled : {}),
        }}
      >
        ← Anterior
      </button>

      <div style={styles.pageNumbers}>
        {getPageNumbers().map((page, index) => (
          typeof page === 'number' ? (
            <button
              key={index}
              onClick={() => onPageChange(page)}
              style={{
                ...styles.pageButton,
                ...(currentPage === page ? styles.pageButtonActive : {}),
              }}
            >
              {page}
            </button>
          ) : (
            <span key={index} style={styles.ellipsis}>
              {page}
            </span>
          )
        ))}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        style={{
          ...styles.button,
          ...(currentPage === totalPages ? styles.buttonDisabled : {}),
        }}
      >
        Próxima →
      </button>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '24px',
    padding: '16px 0',
  },
  button: {
    padding: '8px 16px',
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    backgroundColor: '#e5e5e5',
    color: '#a3a3a3',
    cursor: 'not-allowed',
  },
  pageNumbers: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pageButton: {
    padding: '8px 12px',
    backgroundColor: '#ffffff',
    color: '#262626',
    border: '1px solid #e5e5e5',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    minWidth: '40px',
    transition: 'all 0.2s',
  },
  pageButtonActive: {
    backgroundColor: '#7c3aed',
    color: '#ffffff',
    borderColor: '#7c3aed',
  },
  ellipsis: {
    color: '#737373',
    fontSize: '14px',
    padding: '0 4px',
  },
};

export default Pagination;

