"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnreadCount = exports.markAsRead = exports.getMyConversations = exports.getConversation = exports.sendMessage = void 0;
const supabase_1 = require("../config/supabase");
// Send a message
const sendMessage = async (req, res) => {
    const { item_id, receiver_id, message } = req.body;
    const sender_id = req.user?.id; // Should come from auth middleware
    if (!item_id || !receiver_id || !message || !sender_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (sender_id === receiver_id) {
        return res.status(400).json({ error: 'Cannot send message to yourself' });
    }
    const { data, error } = await supabase_1.supabase
        .from('marketplace_messages')
        .insert([
        {
            item_id,
            sender_id,
            receiver_id,
            message,
        },
    ])
        .select()
        .single();
    if (error)
        return res.status(400).json({ error: error.message });
    res.status(201).json({ message: data });
};
exports.sendMessage = sendMessage;
// Get conversation for a specific item between two users
const getConversation = async (req, res) => {
    const { item_id, other_user_id, current_user_id } = req.query;
    if (!item_id || !other_user_id || !current_user_id) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    const { data, error } = await supabase_1.supabase
        .from('marketplace_messages')
        .select('*')
        .eq('item_id', item_id)
        .or(`and(sender_id.eq.${current_user_id},receiver_id.eq.${other_user_id}),and(sender_id.eq.${other_user_id},receiver_id.eq.${current_user_id})`)
        .order('created_at', { ascending: true });
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ messages: data });
};
exports.getConversation = getConversation;
// Get all conversations for logged-in user (grouped by item and other user)
const getMyConversations = async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    // Get all messages where user is sender or receiver
    const { data: messages, error } = await supabase_1.supabase
        .from('marketplace_messages')
        .select(`
      *,
      marketplace_items!inner(id, title, images, status)
    `)
        .or(`sender_id.eq.${user_id},receiver_id.eq.${user_id}`)
        .order('created_at', { ascending: false });
    if (error)
        return res.status(400).json({ error: error.message });
    // Group by item and other user
    const conversationsMap = new Map();
    messages?.forEach((msg) => {
        const otherUserId = msg.sender_id === user_id ? msg.receiver_id : msg.sender_id;
        const key = `${msg.item_id}-${otherUserId}`;
        if (!conversationsMap.has(key)) {
            conversationsMap.set(key, {
                item_id: msg.item_id,
                item_title: msg.marketplace_items.title,
                item_images: msg.marketplace_items.images,
                item_status: msg.marketplace_items.status,
                other_user_id: otherUserId,
                last_message: msg.message,
                last_message_at: msg.created_at,
                unread_count: 0,
            });
        }
        // Count unread messages (messages sent to current user that are unread)
        if (msg.receiver_id === user_id && !msg.read) {
            conversationsMap.get(key).unread_count++;
        }
    });
    const conversations = Array.from(conversationsMap.values());
    res.json({ conversations });
};
exports.getMyConversations = getMyConversations;
// Mark messages as read
const markAsRead = async (req, res) => {
    const { message_ids } = req.body;
    if (!message_ids || !Array.isArray(message_ids)) {
        return res.status(400).json({ error: 'Invalid message_ids' });
    }
    const { error } = await supabase_1.supabase
        .from('marketplace_messages')
        .update({ read: true })
        .in('id', message_ids);
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ success: true });
};
exports.markAsRead = markAsRead;
// Get unread message count
const getUnreadCount = async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const { count, error } = await supabase_1.supabase
        .from('marketplace_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user_id)
        .eq('read', false);
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ unread_count: count || 0 });
};
exports.getUnreadCount = getUnreadCount;
