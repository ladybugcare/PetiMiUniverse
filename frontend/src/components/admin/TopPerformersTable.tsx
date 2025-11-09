import React from 'react';
import { Building2, Stethoscope } from 'lucide-react';
import { TopPerformer } from '../../services/statisticsApi';
import colors from '../../styles/colors';

interface TopPerformersTableProps {
  clinics: TopPerformer[];
  vets: TopPerformer[];
}

const TopPerformersTable: React.FC<TopPerformersTableProps> = ({ clinics, vets }) => {
  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Top Performers</h3>
      <div style={styles.grid}>
        {/* Top Clinics */}
        <div style={styles.tableContainer}>
          <div style={styles.tableHeader}>
            <Building2 size={20} color={colors.primary} />
            <h4 style={styles.tableTitle}>Top 5 Clínicas</h4>
          </div>
          <div style={styles.table}>
            {clinics.length > 0 ? (
              clinics.map((clinic, index) => (
                <div key={clinic.id} style={styles.row}>
                  <div style={styles.rank}>{index + 1}</div>
                  <div style={styles.name}>{clinic.name}</div>
                  <div style={styles.metric}>{clinic.metric} demandas</div>
                </div>
              ))
            ) : (
              <div style={styles.empty}>Nenhuma clínica encontrada</div>
            )}
          </div>
        </div>

        {/* Top Vets */}
        <div style={styles.tableContainer}>
          <div style={styles.tableHeader}>
            <Stethoscope size={20} color={colors.primary} />
            <h4 style={styles.tableTitle}>Top 5 Veterinários</h4>
          </div>
          <div style={styles.table}>
            {vets.length > 0 ? (
              vets.map((vet, index) => (
                <div key={vet.id} style={styles.row}>
                  <div style={styles.rank}>{index + 1}</div>
                  <div style={styles.name}>
                    {vet.name}
                    {vet.crmv && <span style={styles.crmv}> - CRMV {vet.crmv}</span>}
                  </div>
                  <div style={styles.metric}>{vet.metric} candidaturas</div>
                </div>
              ))
            ) : (
              <div style={styles.empty}>Nenhum veterinário encontrado</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    marginTop: '32px',
    marginBottom: '32px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#262626',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },
  tableContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    padding: '20px',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e5e5',
  },
  tableTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#262626',
    margin: 0,
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#fafafa',
  },
  rank: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    color: '#ffffff',
    borderRadius: '50%',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: '14px',
    fontWeight: '500',
    color: '#262626',
  },
  crmv: {
    fontSize: '12px',
    color: '#737373',
    fontWeight: '400',
  },
  metric: {
    fontSize: '12px',
    color: '#737373',
    fontWeight: '500',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    color: '#737373',
    fontSize: '14px',
  },
};

export default TopPerformersTable;

