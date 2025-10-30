import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ListingTypeSelector from '../components/ListingTypeSelector';
import MarketplaceCategorySelector from '../components/MarketplaceCategorySelector';
import MarketplaceFormStep from '../components/MarketplaceFormStep';

type ListingType = 'sale' | 'wanted';
type CategoryType = 'equipment' | 'medicine' | 'vaccine' | 'supplies';
type StepType = 'type' | 'category' | 'form';

const CreateMarketplaceListingPage: React.FC = () => {
  const [step, setStep] = useState<StepType>('type');
  const [listingType, setListingType] = useState<ListingType | null>(null);
  const [category, setCategory] = useState<CategoryType | null>(null);

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: '📊',
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: '🛒',
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'criar-anuncio',
      label: 'Criar Anúncio',
      icon: '➕',
      action: 'navigate',
      path: '/marketplace/create',
    },
    {
      id: 'meus-anuncios',
      label: 'Meus Anúncios',
      icon: '📦',
      action: 'navigate',
      path: '/marketplace/my-listings',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
      icon: '💬',
      action: 'navigate',
      path: '/marketplace/messages',
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
      notificationCount={0}
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

