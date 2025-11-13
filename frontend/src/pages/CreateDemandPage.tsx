import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import CategorySelectionStep from '../components/CategorySelectionStep';
import DemandFormStep from '../components/DemandFormStep';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

type CategoryType = 'vet' | 'freelancer' | 'clinic' | 'other';
type StepType = 'category' | 'form';

const CreateDemandPage: React.FC = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<StepType>('category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'CADMIN';
  const { menuItems } = useSidebarMenu(userRole);

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
