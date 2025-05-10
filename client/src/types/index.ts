export interface User {
  id: number;
  username: string;
  displayName: string;
  avatar?: string | null;
  about?: string | null;
  email?: string | null;
  phone?: string | null;
  lastSeen?: string | Date | null;
  isOnline: boolean;
}

export interface UserWithFriendStatus extends User {
  isFriend?: boolean;
  friendRequest?: {
    id: number;
    status: string;
    isOutgoing: boolean;
  } | null;
}

export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string | Date;
  read: boolean;
}

export interface Contact {
  contact: User;
  unreadCount: number;
}

export interface WebSocketMessage {
  type: 'message' | 'status' | 'read_receipt' | 'friend_request' | 'friend_request_response';
  message?: {
    id: number;
    senderId: number;
    receiverId: number;
    content: string;
    createdAt: string;
    read: boolean;
  };
  userId?: number;
  isOnline?: boolean;
  messageIds?: number[];
  request?: {
    id: number;
    senderId: number;
    receiverId: number;
    status: string;
    createdAt: string;
  };
  requestId?: number;
  senderId?: number;
  receiverId?: number;
  status?: string;
}
