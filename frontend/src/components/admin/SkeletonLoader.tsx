import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'statCard' | 'pendingCard' | 'activity' | 'chart';
  count?: number;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ variant = 'statCard', count = 1 }) => {
  const renderSkeleton = () => {
    switch (variant) {
      case 'statCard':
        return (
          <div style={styles.statCardSkeleton}>
            <div style={styles.skeletonIcon} />
            <div style={styles.skeletonContent}>
              <div style={styles.skeletonValue} />
              <div style={styles.skeletonLabel} />
              <div style={styles.skeletonSubtext} />
            </div>
          </div>
        );
      case 'pendingCard':
        return (
          <div style={styles.pendingCardSkeleton}>
            <div style={styles.skeletonIcon} />
            <div style={styles.skeletonContent}>
              <div style={styles.skeletonTitle} />
              <div style={styles.skeletonDescription} />
            </div>
          </div>
        );
      case 'activity':
        return (
          <div style={styles.activitySkeleton}>
            <div style={styles.skeletonIconCircle} />
            <div style={styles.skeletonContent}>
              <div style={styles.skeletonTitle} />
              <div style={styles.skeletonDescription} />
            </div>
            <div style={styles.skeletonTime} />
          </div>
        );
      case 'chart':
        return (
          <div style={styles.chartSkeleton}>
            <div style={styles.skeletonChartTitle} />
            <div style={styles.skeletonChartArea} />
          </div>
        );
      default:
        return null;
    }
  };

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, index) => (
          <React.Fragment key={index}>{renderSkeleton()}</React.Fragment>
        ))}
      </>
    );
  }

  return renderSkeleton();
};

const styles: { [key: string]: React.CSSProperties } = {
  statCardSkeleton: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  pendingCardSkeleton: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  activitySkeleton: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  chartSkeleton: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '32px',
  },
  skeletonIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    backgroundColor: '#f3f4f6',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonIconCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  skeletonValue: {
    width: '80px',
    height: '32px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonLabel: {
    width: '150px',
    height: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonSubtext: {
    width: '120px',
    height: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    marginTop: '8px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonTitle: {
    width: '180px',
    height: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonDescription: {
    width: '220px',
    height: '14px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonTime: {
    width: '80px',
    height: '14px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonChartTitle: {
    width: '200px',
    height: '24px',
    backgroundColor: '#f3f4f6',
    borderRadius: '4px',
    marginBottom: '24px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonChartArea: {
    width: '100%',
    height: '300px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
};

export default SkeletonLoader;

