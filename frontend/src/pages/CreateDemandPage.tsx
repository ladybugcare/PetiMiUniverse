import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import CategorySelectionStep from '../components/CategorySelectionStep';
import DemandFormStep from '../components/DemandFormStep';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';
type StepType = 'category' | 'form';

const CreateDemandPage: React.FC = () => {
  const [step, setStep] = useState<StepType>('category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'demandas',
      label: 'Ver Todas Demandas',
      icon: '📋',
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'criar-demanda',
      label: 'Criar Nova Demanda',
      icon: '➕',
      action: 'navigate',
      path: '/create-demand',
    },
    {
      id: 'perfil',
      label: 'Perfil',
      icon: '👤',
      action: 'navigate',
      path: '/clinic-profile',
    },
    {
      id: 'logout',
      label: 'Sair',
      icon: '🚪',
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
