import { apiRequest } from './api';

// Types
export interface MarketplaceMessage {
  id: string;
  item_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface Conversation {
  item_id: string;
  item_title: string;
  item_images: string[];
  item_status: string;
  other_user_id: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface SendMessageData {
  item_id: string;
  receiver_id: string;
  sender_id: string;
  message: string;
}

// API Service
export const marketplaceMessagesApi = {
  // Send a message
  send: async (data: SendMessageData): Promise<{ message: MarketplaceMessage }> => {
    return apiRequest('/marketplace/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get conversation for a specific item
  getConversation: async (
    itemId: string,
    otherUserId: string,
    currentUserId: string
  ): Promise<{ messages: MarketplaceMessage[] }> => {
    return apiRequest(
      `/marketplace/messages/conversation?item_id=${itemId}&other_user_id=${otherUserId}&current_user_id=${currentUserId}`
    );
  },

  // Get all conversations for logged-in user
  getMyConversations: async (userId: string): Promise<{ conversations: Conversation[] }> => {
    return apiRequest(`/marketplace/messages/conversations?user_id=${userId}`);
  },

  // Mark messages as read
  markAsRead: async (messageIds: string[]): Promise<{ success: boolean }> => {
    return apiRequest('/marketplace/messages/mark-read', {
      method: 'PATCH',
      body: JSON.stringify({ message_ids: messageIds }),
    });
  },

  // Get unread message count
  getUnreadCount: async (userId: string): Promise<{ unread_count: number }> => {
    return apiRequest(`/marketplace/messages/unread-count?user_id=${userId}`);
  },
};

