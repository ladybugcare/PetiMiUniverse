"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMarketplaceItem = exports.markAsSold = exports.updateMarketplaceItem = exports.getItemById = exports.getMyListings = exports.getMarketplaceItems = exports.createMarketplaceItem = void 0;
const supabase_1 = require("../config/supabase");
// Create new marketplace listing
const createMarketplaceItem = async (req, res) => {
    const { title, description, seller_id, seller_type, category, condition, brand, model, price, quantity_available, negotiable, images, listing_type, city, state, } = req.body;
    // Validation
    if (!title || !description || !seller_id || !category || !listing_type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (listing_type === 'sale' && (!condition || !price)) {
        return res.status(400).json({ error: 'Sale listings require condition and price' });
    }
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .insert([
        {
            title,
            description,
            seller_id,
            seller_type,
            category,
            condition,
            brand,
            model,
            price: listing_type === 'sale' ? price : null,
            quantity_available: quantity_available || 1,
            negotiable: negotiable || false,
            images: images || [],
            listing_type,
            city,
            state,
            status: 'active',
        },
    ])
        .select()
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.status(201).json({ item: data });
};
exports.createMarketplaceItem = createMarketplaceItem;
// Get all marketplace items with filters
const getMarketplaceItems = async (req, res) => {
    const { category, listing_type, state, city, condition, min_price, max_price, negotiable_only, search, sort_by, } = req.query;
    let query = supabase_1.supabase
        .from('marketplace_items')
        .select('*')
        .eq('status', 'active');
    // Apply filters
    if (category && typeof category === 'string') {
        query = query.eq('category', category);
    }
    if (listing_type && typeof listing_type === 'string') {
        query = query.eq('listing_type', listing_type);
    }
    if (state && typeof state === 'string') {
        query = query.eq('state', state);
    }
    if (city && typeof city === 'string') {
        query = query.eq('city', city);
    }
    if (condition && typeof condition === 'string') {
        query = query.eq('condition', condition);
    }
    if (min_price && typeof min_price === 'string') {
        query = query.gte('price', parseFloat(min_price));
    }
    if (max_price && typeof max_price === 'string') {
        query = query.lte('price', parseFloat(max_price));
    }
    if (negotiable_only === 'true') {
        query = query.eq('negotiable', true);
    }
    if (search && typeof search === 'string') {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }
    // Sorting
    if (sort_by === 'price_asc') {
        query = query.order('price', { ascending: true });
    }
    else if (sort_by === 'price_desc') {
        query = query.order('price', { ascending: false });
    }
    else {
        // Default: most recent first
        query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query;
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ items: data });
};
exports.getMarketplaceItems = getMarketplaceItems;
// Get user's own listings
const getMyListings = async (req, res) => {
    const { seller_id } = req.query;
    if (!seller_id) {
        return res.status(400).json({ error: 'Missing seller_id' });
    }
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .select('*')
        .eq('seller_id', seller_id)
        .order('created_at', { ascending: false });
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ items: data });
};
exports.getMyListings = getMyListings;
// Get single item by ID
const getItemById = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .select('*')
        .eq('id', id)
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ item: data });
};
exports.getItemById = getItemById;
// Update marketplace item
const updateMarketplaceItem = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    // Only allow owner to update (should be validated by auth middleware)
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ item: data });
};
exports.updateMarketplaceItem = updateMarketplaceItem;
// Mark item as sold
const markAsSold = async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .update({ status: 'sold' })
        .eq('id', id)
        .select()
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ item: data });
};
exports.markAsSold = markAsSold;
// Delete (soft delete) marketplace item
const deleteMarketplaceItem = async (req, res) => {
    const { id } = req.params;
    // Soft delete by setting status to inactive
    const { data, error } = await supabase_1.supabase
        .from('marketplace_items')
        .update({ status: 'inactive' })
        .eq('id', id)
        .select()
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ item: data });
};
exports.deleteMarketplaceItem = deleteMarketplaceItem;
