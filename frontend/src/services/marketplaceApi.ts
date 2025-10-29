import { apiRequest } from './api';

// Types
export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  seller_id: string;
  seller_type: 'clinic' | 'vet' | 'freelancer';
  category: 'equipment' | 'medicine' | 'vaccine' | 'supplies' | 'other';
  condition: 'new' | 'used' | 'refurbished';
  brand?: string;
  model?: string;
  price: number;
  currency: string;
  quantity_available: number;
  negotiable: boolean;
  images: string[];
  listing_type: 'sale' | 'wanted';
  city?: string;
  state?: string;
  status: 'active' | 'sold' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface CreateMarketplaceItemData {
  title: string;
  description: string;
  seller_id: string;
  seller_type: 'clinic' | 'vet' | 'freelancer';
  category: 'equipment' | 'medicine' | 'vaccine' | 'supplies' | 'other';
  condition: 'new' | 'used' | 'refurbished';
  brand?: string;
  model?: string;
  price?: number;
  quantity_available: number;
  negotiable: boolean;
  images?: string[];
  listing_type: 'sale' | 'wanted';
  city?: string;
  state?: string;
}

export interface MarketplaceFilters {
  category?: string;
  listing_type?: string;
  state?: string;
  city?: string;
  condition?: string;
  min_price?: number;
  max_price?: number;
  negotiable_only?: boolean;
  search?: string;
  sort_by?: 'recent' | 'price_asc' | 'price_desc';
}

// API Service
export const marketplaceApi = {
  // Create new listing
  create: async (data: CreateMarketplaceItemData): Promise<{ item: MarketplaceItem }> => {
    return apiRequest('/marketplace/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get all items with filters
  getAll: async (filters?: MarketplaceFilters): Promise<{ items: MarketplaceItem[] }> => {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });
    }
    
    const url = params.toString() ? `/marketplace?${params.toString()}` : '/marketplace';
    return apiRequest(url);
  },

  // Get user's listings
  getMyListings: async (sellerId: string): Promise<{ items: MarketplaceItem[] }> => {
    return apiRequest(`/marketplace/my-listings?seller_id=${sellerId}`);
  },

  // Get single item by ID
  getById: async (id: string): Promise<{ item: MarketplaceItem }> => {
    return apiRequest(`/marketplace/${id}`);
  },

  // Update listing
  update: async (id: string, data: Partial<CreateMarketplaceItemData>): Promise<{ item: MarketplaceItem }> => {
    return apiRequest(`/marketplace/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Mark item as sold
  markAsSold: async (id: string): Promise<{ item: MarketplaceItem }> => {
    return apiRequest(`/marketplace/${id}/mark-sold`, {
      method: 'PATCH',
    });
  },

  // Delete listing
  delete: async (id: string): Promise<{ item: MarketplaceItem }> => {
    return apiRequest(`/marketplace/${id}`, {
      method: 'DELETE',
    });
  },

  // Upload images (separate endpoint for multipart/form-data)
  uploadImages: async (files: File[]): Promise<{ urls: string[] }> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });

    // Note: This bypasses apiRequest since we need multipart/form-data
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    const response = await fetch(`${API_URL}/marketplace/upload-images`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Image upload failed');
    }

    return response.json();
  },
};

