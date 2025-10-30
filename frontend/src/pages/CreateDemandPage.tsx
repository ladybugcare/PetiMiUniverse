import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import CategorySelectionStep from '../components/CategorySelectionStep';
import DemandFormStep from '../components/DemandFormStep';
import { BarChart2, ClipboardList, PlusCircle, User, LogOut } from 'lucide-react';
import colors from '../styles/colors';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';
type StepType = 'category' | 'form';

const CreateDemandPage: React.FC = () => {
  const [step, setStep] = useState<StepType>('category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'demandas',
      label: 'Ver Todas Demandas',
      icon: <ClipboardList size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'criar-demanda',
      label: 'Criar Nova Demanda',
      icon: <PlusCircle size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/create-demand',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: <User size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/clinic-profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: <LogOut size={20} color={colors.primary} />,
      action: 'logout',
    },
  ];

  const handleCategorySelect = (category: CategoryType) => {
    setSelectedCategory(category);
    setStep('form');
  };

  const handleBackToCategory = () => {
    setStep('category');
    setSelectedCategory(null);
  };

  return (
    <DashboardLayout
      pageName="Criar Demanda"
      menuItems={menuItems}
      notificationCount={0}
    >
      {step === 'category' ? (
        <CategorySelectionStep onSelect={handleCategorySelect} />
      ) : (
        <DemandFormStep
          category={selectedCategory!}
          onBack={handleBackToCategory}
        />
      )}
    </DashboardLayout>
  );
};

export default CreateDemandPage;
