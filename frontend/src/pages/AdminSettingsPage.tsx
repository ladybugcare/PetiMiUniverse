import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import SpecialtiesManager from '../components/admin/SpecialtiesManager';
import { BarChart2, Building2, Stethoscope, ClipboardList, Users, Settings, MapPin, CreditCard, ShoppingCart, Shield, FileText, Server } from 'lucide-react';
import colors from '../styles/colors';

type SettingsTab = 'cadastros' | 'localizacao' | 'planos' | 'marketplace' | 'usuarios' | 'documentos' | 'sistema';

const AdminSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(tabParam || 'cadastros');

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam && ['cadastros', 'localizacao', 'planos', 'marketplace', 'usuarios', 'documentos', 'sistema'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Update URL when tab changes
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin-dashboard',
    },
    {
      id: 'clinics',
      label: 'Clínicas',
      icon: <Building2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/clinics',
    },
    {
      id: 'vets',
      label: 'Veterinários',
      icon: <Stethoscope size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/vets',
    },
    {
      id: 'demands',
      label: 'Demandas',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/demands',
    },
    {
      id: 'users',
      label: 'Usuários',
      icon: <Users size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/users',
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: <Settings size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/admin/settings',
    },
  ];

  const tabs = [
    {
      id: 'cadastros' as SettingsTab,
      label: 'Cadastros e Perfis',
      icon: <Users size={18} />,
    },
    {
      id: 'localizacao' as SettingsTab,
      label: 'Localização e Regiões',
      icon: <MapPin size={18} />,
    },
    {
      id: 'planos' as SettingsTab,
      label: 'Planos e Assinaturas',
      icon: <CreditCard size={18} />,
    },
    {
      id: 'marketplace' as SettingsTab,
      label: 'Marketplace',
      icon: <ShoppingCart size={18} />,
    },
    {
      id: 'usuarios' as SettingsTab,
      label: 'Usuários e Permissões',
      icon: <Shield size={18} />,
    },
    {
      id: 'documentos' as SettingsTab,
      label: 'Documentos e Verificação',
      icon: <FileText size={18} />,
    },
    {
      id: 'sistema' as SettingsTab,
      label: 'Sistema e Segurança',
      icon: <Server size={18} />,
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'cadastros':
        return (
          <div style={styles.tabContent}>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Especialidades</h3>
              <p style={styles.sectionDescription}>
                Gerencie as especialidades disponíveis para veterinários e freelancers.
              </p>
              <SpecialtiesManager />
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Funções/Cargos</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de funções e cargos permitidos</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Regiões</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de regiões de atendimento</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Requisitos de Cadastro</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de requisitos obrigatórios</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Política de Aprovação</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de aprovação automática/manual</p>
            </div>
          </div>
        );

      case 'localizacao':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Regiões ou Cidades Ativas</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de regiões onde o marketplace está disponível</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Bairros/Zonas</h3>
              <p style={styles.placeholderText}>Em breve: Detalhamento de busca local por bairros</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Distância Máxima de Busca</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de raio de busca para demandas próximas</p>
            </div>
          </div>
        );

      case 'planos':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Planos de Clínicas</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de planos (Free, Basic, Comfort, Pro)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Planos de Veterinários</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de planos (Basic, Plus, Pro)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Limites por Plano</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de limites (demandas, unidades, convites, uploads)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Período de Avaliação e Cobrança</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de trial e regras de cobrança</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Método de Pagamento</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de gateway de pagamento padrão</p>
            </div>
          </div>
        );

      case 'marketplace':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Categorias de Serviços</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de categorias (consulta, cirurgia, banho, tosa, etc.)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Status de Demandas</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de visibilidade de demandas</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Taxas de Intermediação</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de percentual PetiVet por transação</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Política de Cancelamento</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de tempo mínimo, taxas e penalidades</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Sistema de Avaliação</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de reviews (habilitar/desabilitar, média mínima)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Exibição de Perfis</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de visibilidade (público/privado, avaliações, fotos)</p>
            </div>
          </div>
        );

      case 'usuarios':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Perfis de Usuário Administrativo</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de perfis (Admin, Suporte, Analista Financeiro, etc.)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Permissões por Módulo</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de permissões (ver/editar/excluir por módulo)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Logs de Acesso e Ações</h3>
              <p style={styles.placeholderText}>Em breve: Visualização de logs administrativos</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Bloqueio/Desbloqueio de Contas</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de status de contas (clínicas e vets)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Feedbacks e Denúncias</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de feedbacks e denúncias</p>
            </div>
          </div>
        );

      case 'documentos':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Campos Obrigatórios de Verificação</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de campos obrigatórios (CRMV, CNPJ, CPF)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Status de Verificação Manual</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de status (pendente, aprovado, reprovado)</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Modelos de Certificados</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de modelos de certificados para upload</p>
            </div>
          </div>
        );

      case 'sistema':
        return (
          <div style={styles.tabContent}>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Logs de Erros e Auditoria</h3>
              <p style={styles.placeholderText}>Em breve: Visualização de logs de erros e auditoria</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Backup de Dados</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de backups e restore</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Configurações de CORS e Domínios</h3>
              <p style={styles.placeholderText}>Em breve: Configuração de CORS, domínios permitidos e APIs</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>Gerenciamento de Tokens e Chaves</h3>
              <p style={styles.placeholderText}>Em breve: Gerenciamento de tokens e chaves públicas/privadas</p>
            </div>
            <div style={styles.placeholderSection}>
              <h3 style={styles.sectionTitle}>LGPD - Consentimento e Exclusão</h3>
              <p style={styles.placeholderText}>Em breve: Controle de consentimento e exclusão de dados (LGPD)</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout pageName="Configurações do Sistema" menuItems={menuItems}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Configurações do Sistema</h1>
          <p style={styles.subtitle}>
            Gerencie as configurações gerais da plataforma PetiVet
          </p>
        </div>

        {/* Tabs */}
        <div style={styles.tabsContainer}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
              }}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={styles.content}>{renderTabContent()}</div>
      </div>
    </DashboardLayout>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: colors.text,
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    margin: 0,
  },
  tabsContainer: {
    display: 'flex',
    gap: '8px',
    marginBottom: '32px',
    borderBottom: `2px solid ${colors.border}`,
    overflowX: 'auto',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: colors.textSecondary,
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    color: colors.primary,
    borderBottomColor: colors.primary,
    fontWeight: '600',
  },
  tabIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '32px',
    minHeight: '400px',
  },
  tabContent: {
    width: '100%',
  },
  section: {
    marginBottom: '48px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: colors.text,
    margin: '0 0 8px 0',
  },
  sectionDescription: {
    fontSize: '14px',
    color: colors.textSecondary,
    margin: '0 0 24px 0',
  },
  placeholderSection: {
    marginBottom: '32px',
    padding: '24px',
    backgroundColor: colors.surface,
    borderRadius: '8px',
    border: `1px dashed ${colors.border}`,
  },
  placeholderText: {
    fontSize: '14px',
    color: colors.textSecondary,
    fontStyle: 'italic',
    margin: 0,
  },
};

export default AdminSettingsPage;

