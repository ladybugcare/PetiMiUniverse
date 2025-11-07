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
<<<<<<< HEAD
      icon: <ClipboardList size={20} color={colors.primary} />,
=======
            icon: <ClipboardList size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/demands',
    },
    {
      id: 'criar-demanda',
      label: 'Criar Nova Demanda',
<<<<<<< HEAD
      icon: <PlusCircle size={20} color={colors.primary} />,
=======
            icon: <PlusCircle size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/create-demand',
    },
    {
      id: 'perfil',
      label: 'Perfil',
<<<<<<< HEAD
      icon: <User size={20} color={colors.primary} />,
=======
            icon: <User size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/clinic-profile',
    },
    // {
    //   id: 'logout',
    //   label: 'Sair',
<<<<<<< HEAD
    //   icon: <LogOut size={20} color={colors.primary} />,
=======
        //   icon: <LogOut size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
    //   action: 'logout',
    // },
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
