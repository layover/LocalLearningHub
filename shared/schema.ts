import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Import necessary types
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  about: text("about"),
  email: text("email"),
  phone: text("phone"),
  lastSeen: timestamp("last_seen"),
  isOnline: boolean("is_online").default(false),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  receiverId: integer("receiver_id").references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  read: boolean("read").default(false),
  // 新增：消息类型和群组ID
  messageType: text("message_type").default("personal").notNull(), // personal, group
  groupId: integer("group_id").references(() => groups.id),
});

export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  receiverId: integer("receiver_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  contactId: integer("contact_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 新增：群组表
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  creatorId: integer("creator_id").notNull().references(() => users.id),
});

// 新增：群组成员表
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").default("member").notNull(), // admin, member
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  uniqueMember: unique().on(table.groupId, table.userId)
}));

// 新增：群组邀请表
export const groupInvites = pgTable("group_invites", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  inviterId: integer("inviter_id").notNull().references(() => users.id),
  inviteeId: integer("invitee_id").notNull().references(() => users.id),
  status: text("status").default("pending").notNull(), // pending, accepted, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueInvite: unique().on(table.groupId, table.inviteeId)
}));

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isOnline: true,
  lastSeen: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  read: true,
  messageType: true,
  groupId: true,
});

export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
});

// 新增：群组相关Schema
export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
});

export const insertGroupMemberSchema = createInsertSchema(groupMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertGroupInviteSchema = createInsertSchema(groupInvites).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

// 新增：群组消息Schema
export const insertGroupMessageSchema = z.object({
  senderId: z.number(),
  groupId: z.number(),
  content: z.string()
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type InsertGroupInvite = z.infer<typeof insertGroupInviteSchema>;
export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;

export type User = typeof users.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupInvite = typeof groupInvites.$inferSelect;

// WebSocket message types
export interface ChatMessage {
  type: 'message';
  message: {
    id: number;
    senderId: number;
    receiverId: number | null;
    content: string;
    createdAt: string;
    read: boolean;
    messageType?: string;
    groupId?: number;
  };
}

export interface StatusUpdate {
  type: 'status';
  userId: number;
  isOnline: boolean;
}

export interface ReadReceipt {
  type: 'read_receipt';
  messageIds: number[];
}

export interface FriendRequestNotification {
  type: 'friend_request';
  request: {
    id: number;
    senderId: number;
    receiverId: number;
    status: string;
    createdAt: string;
    sender?: {
      id: number;
      username: string;
      displayName: string;
      avatar?: string | null;
      isOnline?: boolean;
    };
  };
}

export interface FriendRequestResponseNotification {
  type: 'friend_request_response';
  requestId: number;
  senderId: number;
  receiverId: number;
  status: string;
}

// 新增：群组相关WebSocket消息类型
export interface GroupInviteNotification {
  type: 'group_invite';
  invite: {
    id: number;
    groupId: number;
    inviterId: number;
    inviteeId: number;
    status: string;
    createdAt: string;
    group?: {
      id: number;
      name: string;
      avatar?: string | null;
    };
    inviter?: {
      id: number;
      username: string;
      displayName: string;
      avatar?: string | null;
    };
  };
}

export interface GroupInviteResponseNotification {
  type: 'group_invite_response';
  inviteId: number;
  groupId: number;
  inviterId: number;
  inviteeId: number;
  status: string;
}

export interface GroupMembershipChangeNotification {
  type: 'group_membership_change';
  groupId: number;
  userId: number;
  action: 'added' | 'removed' | 'role_changed';
  byUserId: number;
  newRole?: string;
}

export type WebSocketMessage = 
  | ChatMessage 
  | StatusUpdate 
  | ReadReceipt 
  | FriendRequestNotification 
  | FriendRequestResponseNotification
  | GroupInviteNotification
  | GroupInviteResponseNotification
  | GroupMembershipChangeNotification;
