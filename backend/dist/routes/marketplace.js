"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const marketplaceController_1 = require("../controllers/marketplaceController");
const requireActiveClinic_1 = require("../middleware/requireActiveClinic");
const router = express_1.default.Router();
// Create new listing (requires active clinic)
router.post('/create', requireActiveClinic_1.requireActiveClinic, marketplaceController_1.createMarketplaceItem);
// Get all items (with filters)
router.get('/', marketplaceController_1.getMarketplaceItems);
// Get user's listings
router.get('/my-listings', marketplaceController_1.getMyListings);
// Get single item by ID
router.get('/:id', marketplaceController_1.getItemById);
// Update listing
router.patch('/:id', marketplaceController_1.updateMarketplaceItem);
// Mark item as sold
router.patch('/:id/mark-sold', marketplaceController_1.markAsSold);
// Delete listing
router.delete('/:id', marketplaceController_1.deleteMarketplaceItem);
exports.default = router;
