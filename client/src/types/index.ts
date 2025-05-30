export interface User {
  id: number;
  username: string;
  displayName: string;
  avatar?: string | null;
  about?: string | null;
  email?: string | null;
  phone?: string | null;
  isOnline?: boolean;
  lastSeen?: string | null;
}

export interface UserWithFriendStatus extends User {
  friendStatus?: 'none' | 'pending' | 'requested' | 'friends';
  isFriend?: boolean;
  friendRequest?: {
    id: number;
    status: string;
  };
}

export interface Message {
  id: number;
  senderId: number;
  receiverId: number | null;
  groupId?: number | null;
  content: string;
  createdAt: string;
  read: boolean;
  messageType?: 'direct' | 'group' | 'file' | 'text';
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
}

export interface FriendRequest {
  id: number;
  senderId: number;
  receiverId: number;
  status: string;
  createdAt: string;
  sender?: User;
}

export interface Contact {
  contact: User;
  unreadCount: number;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  avatar: string | null;
  creatorId: number;
  createdAt: string;
}

export interface GroupMember {
  id: number;
  groupId: number;
  userId: number;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface GroupInvite {
  id: number;
  groupId: number;
  inviterId: number;
  inviteeId: number;
  status: string;
  createdAt: string;
  group?: Group;
  inviter?: User;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}