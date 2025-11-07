import React, { useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { MenuItem } from '../components/DashboardSidebar';
import ListingTypeSelector from '../components/ListingTypeSelector';
import MarketplaceCategorySelector from '../components/MarketplaceCategorySelector';
import MarketplaceFormStep from '../components/MarketplaceFormStep';
import { BarChart2, ShoppingCart, PlusCircle, Package, MessageSquare, User, LogOut } from 'lucide-react';
import colors from '../styles/colors';

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
      icon: <BarChart2 size={20} color={colors.primary} />,
      action: 'navigate',
      path: '/clinic-dashboard',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
<<<<<<< HEAD
      icon: <ShoppingCart size={20} color={colors.primary} />,
=======
            icon: <ShoppingCart size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/marketplace',
    },
    {
      id: 'criar-anuncio',
      label: 'Criar Anúncio',
<<<<<<< HEAD
      icon: <PlusCircle size={20} color={colors.primary} />,
=======
            icon: <PlusCircle size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/marketplace/create',
    },
    {
      id: 'meus-anuncios',
      label: 'Meus Anúncios',
<<<<<<< HEAD
      icon: <Package size={20} color={colors.primary} />,
=======
            icon: <Package size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/marketplace/my-listings',
    },
    {
      id: 'mensagens',
      label: 'Mensagens',
<<<<<<< HEAD
      icon: <MessageSquare size={20} color={colors.primary} />,
=======
            icon: <MessageSquare size={20} color={colors.primary} />,
>>>>>>> c05ee3cbec49f0605ebe1b5c5ff44929457fde77
      action: 'navigate',
      path: '/marketplace/messages',
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

