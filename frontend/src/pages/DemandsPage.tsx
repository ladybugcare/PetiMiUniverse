import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { demandsApi, clinicsApi } from '../services';

interface Demand {
  id: string;
  title: string;
  description: string;
  clinic_id: string;
  status: string;
  payment?: number;
  created_at: string;
}

interface Clinic {
  id: string;
  name: string;
  address: string;
}

const DemandsPage: React.FC = () => {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar demandas abertas
      const demandsResult = await demandsApi.getOpen();
      setDemands(demandsResult.demands);
      
      // Carregar clínicas
      const clinicsResult = await clinicsApi.getAll();
      setClinics(clinicsResult.clinics);
      
    } catch (error: any) {
      alert('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getClinicName = (clinicId: string) => {
    const clinic = clinics.find(c => c.id === clinicId);
    return clinic?.name || 'Clínica não encontrada';
  };

  return (
    <div className="min-h-screen py-16 px-4" style={{background: 'linear-gradient(135deg, var(--primary-50) 0%, var(--accent-50) 100%)'}}>
      <div className="container max-w-7xl">
        <div className="text-center mb-12">
          <h1 className="text-display text-5xl font-bold mb-4 text-neutral-800">
            Demandas Abertas 📋
          </h1>
          <p className="text-xl text-neutral-600">Encontre oportunidades de trabalho na sua área</p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="text-neutral-600 text-lg">Carregando demandas...</p>
            </div>
          </div>
        ) : demands.length === 0 ? (
          <div className="modern-card p-12 text-center">
            <div className="w-24 h-24 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">📋</span>
            </div>
            <h3 className="text-2xl font-bold text-neutral-800 mb-4">
              Nenhuma demanda aberta
            </h3>
            <p className="text-neutral-600 text-lg">
              No momento não há demandas disponíveis. Volte mais tarde!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {demands.map((demand) => (
              <div key={demand.id} className="modern-card p-6 group">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-display text-xl font-bold text-neutral-800 group-hover:text-primary-600 transition-colors">
                    {demand.title}
                  </h2>
                  
                  <span className={`badge ${
                    demand.status === 'open' 
                      ? 'badge-success' 
                      : 'badge-warning'
                  }`}>
                    {demand.status === 'open' ? 'Aberta' : demand.status}
                  </span>
                </div>
                
                <p className="text-neutral-600 mb-6 line-clamp-3 leading-relaxed">
                  {demand.description}
                </p>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-500">
                      {getClinicName(demand.clinic_id)}
                    </span>
                    
                    {demand.payment && (
                      <span className="text-lg font-bold text-accent-600">
                        R$ {demand.payment.toFixed(2)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center text-sm text-neutral-400">
                    <span>
                      {new Date(demand.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    
                    <button className="btn btn-primary text-sm px-4 py-2">
                      Ver detalhes
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link 
            to="/" 
            className="btn btn-outline"
          >
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DemandsPage;
