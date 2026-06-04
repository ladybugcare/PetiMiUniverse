import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ListingTypeSelector from '../components/ListingTypeSelector';
import MarketplaceCategorySelector from '../components/MarketplaceCategorySelector';
import MarketplaceFormStep from '../components/MarketplaceFormStep';
import colors from '../styles/colors';
import { useSidebarMenu } from '../hooks/useSidebarMenu';
import { getUserRole } from '../utils/authHelpers';
import { useAuth } from '../AuthContext';

type ListingType = 'sale' | 'wanted';
type CategoryType = 'equipment' | 'medicine' | 'vaccine' | 'supplies';
type StepType = 'type' | 'category' | 'form';

const CreateMarketplaceListingPage: React.FC = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<StepType>('type');
  const [listingType, setListingType] = useState<ListingType | null>(null);
  const [category, setCategory] = useState<CategoryType | null>(null);

  // Get menu items using hook
  const userRole = user ? getUserRole(user) : 'VET';
  const { menuItems } = useSidebarMenu(userRole);

  const handleTypeSelect = (type: ListingType) => {
    setListingType(type);
    setStep('category');
  };

  const handleCategorySelect = (cat: CategoryType) => {
    setCategory(cat);
    setStep('form');
  };

  const handleBackToCategory = () => {
    setStep('category');
    setCategory(null);
  };

  const handleBackToType = () => {
    setStep('type');
    setListingType(null);
    setCategory(null);
  };

  return (
    <DashboardLayout
      pageName="Criar Anúncio"
      menuItems={menuItems}
    >
      {step === 'type' && <ListingTypeSelector onSelect={handleTypeSelect} />}
      
      {step === 'category' && listingType && (
        <MarketplaceCategorySelector
          listingType={listingType}
          onSelect={handleCategorySelect}
        />
      )}
      
      {step === 'form' && listingType && category && (
        <MarketplaceFormStep
          listingType={listingType}
          category={category}
          onBack={handleBackToCategory}
        />
      )}
    </DashboardLayout>
  );
};

export default CreateMarketplaceListingPage;

