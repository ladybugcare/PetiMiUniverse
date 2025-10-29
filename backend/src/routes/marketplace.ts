import express from 'express';
import {
  createMarketplaceItem,
  getMarketplaceItems,
  getMyListings,
  getItemById,
  updateMarketplaceItem,
  deleteMarketplaceItem,
  markAsSold,
} from '../controllers/marketplaceController';

const router = express.Router();

// Create new listing
router.post('/create', createMarketplaceItem);

// Get all items (with filters)
router.get('/', getMarketplaceItems);

// Get user's listings
router.get('/my-listings', getMyListings);

// Get single item by ID
router.get('/:id', getItemById);

// Update listing
router.patch('/:id', updateMarketplaceItem);

// Mark item as sold
router.patch('/:id/mark-sold', markAsSold);

// Delete listing
router.delete('/:id', deleteMarketplaceItem);

export default router;

