import React, { useState, useEffect } from 'react';
import { X, Search, UserPlus, Loader } from 'lucide-react';
import { demandInvitesApi } from '../services/demandInvitesApi';
import { vetsApi, Vet } from '../services/vetsApi';
import { useAlert } from '../hooks/useAlert';
import colors from '../styles/colors';

interface InviteVetModalProps {
  demandId: string;
  onClose: () => void;
  onInviteSent: () => void;
}

const InviteVetModal: React.FC<InviteVetModalProps> = ({
  demandId,
  onClose,
  onInviteSent,
}) => {
  const { showSuccess, showError } = useAlert();
  const [vets, setVets] = useState<Vet[]>([]);
  const [filteredVets, setFilteredVets] = useState<Vet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    loadVets();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = vets.filter(
        (vet) =>
          vet.name.toLowerCase().includes(query) ||
          vet.email.toLowerCase().includes(query) ||
          vet.crmv?.toLowerCase().includes(query) ||
          vet.specialties?.some((s) => s.toLowerCase().includes(query))
      );
      setFilteredVets(filtered);
    } else {
      setFilteredVets(vets);
    }
  }, [searchQuery, vets]);

  const loadVets = async () => {
    try {
      setLoading(true);
      const { vets: data } = await vetsApi.getAll();
      // Filtrar apenas vets ativos
      const activeVets = data.filter((vet) => vet.status === 'active');
      setVets(activeVets);
      setFilteredVets(activeVets);
    } catch (error: any) {
      showError('Erro ao carregar veterinários: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (vetId: string) => {
    try {
      setInviting(vetId);
      await demandInvitesApi.inviteVet(demandId, vetId);
      showSuccess('Convite enviado com sucesso!');
      onInviteSent();
      onClose();
    } catch (error: any) {
      showError('Erro ao enviar convite: ' + error.message);
    } finally {
      setInviting(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px',
            borderBottom: `1px solid ${colors.lightGray}`,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: colors.text }}>
            Convidar Veterinário
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: colors.text,
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '20px', borderBottom: `1px solid ${colors.lightGray}` }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: '12px',
                color: colors.darkGray,
              }}
            />
            <input
              type="text"
              placeholder="Buscar por nome, email, CRMV ou especialidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 10px 10px 40px',
                border: `1px solid ${colors.lightGray}`,
                borderRadius: '6px',
                fontSize: '0.9rem',
              }}
            />
          </div>
        </div>

        {/* Vets List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
              }}
            >
              <Loader size={24} className="spin" />
            </div>
          ) : filteredVets.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px',
                color: colors.darkGray,
              }}
            >
              {searchQuery
                ? 'Nenhum veterinário encontrado'
                : 'Nenhum veterinário disponível'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredVets.map((vet) => (
                <div
                  key={vet.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    border: `1px solid ${colors.lightGray}`,
                    borderRadius: '6px',
                    backgroundColor: colors.background,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: colors.text,
                        marginBottom: '4px',
                      }}
                    >
                      {vet.name}
                    </div>
                    <div
                      style={{
                        fontSize: '0.875rem',
                        color: colors.darkGray,
                        marginBottom: '4px',
                      }}
                    >
                      {vet.email}
                    </div>
                    {vet.crmv && (
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: colors.darkGray,
                          marginBottom: '4px',
                        }}
                      >
                        CRMV: {vet.crmv}
                      </div>
                    )}
                    {vet.specialties && vet.specialties.length > 0 && (
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: colors.brand.primary[500],
                          marginTop: '8px',
                        }}
                      >
                        {vet.specialties.join(', ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleInvite(vet.id)}
                    disabled={inviting === vet.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: inviting === vet.id ? colors.lightGray : colors.brand.primary[500],
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: inviting === vet.id ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      opacity: inviting === vet.id ? 0.6 : 1,
                    }}
                  >
                    {inviting === vet.id ? (
                      <>
                        <Loader size={16} className="spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        Convidar
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InviteVetModal;

