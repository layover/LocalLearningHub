import { 
  users, messages, contacts, friendRequests, 
  groups, groupMembers, groupInvites,
  type User, type Message, type Contact, type FriendRequest, 
  type Group, type GroupMember, type GroupInvite,
  type InsertUser, type InsertMessage, type InsertContact, type InsertFriendRequest,
  type InsertGroup, type InsertGroupMember, type InsertGroupInvite
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { WebSocket } from "ws";
import { db } from "./db";
import { eq, and, or, desc, asc } from "drizzle-orm";
import { pool } from "./db";

// Create a type for session.Store to fix SessionStore issues
type SessionStore = session.Store;

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

interface UserConnection {
  userId: number;
  socket: WebSocket;
}

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(id: number, isOnline: boolean): Promise<User | undefined>;
  updateUserLastSeen(id: number): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>; 
  
  // Message operations
  getMessages(userId: number, contactId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessagesAsRead(receiverId: number, senderId: number): Promise<void>;
  getUnreadMessageCount(userId: number, contactId: number): Promise<number>;
  
  // 群组消息操作
  getGroupMessages(groupId: number): Promise<Message[]>;
  createGroupMessage(senderId: number, groupId: number, content: string, fileUrl?: string, fileType?: string, fileName?: string, messageType?: string): Promise<Message>;
  
  // Friend request operations
  getFriendRequests(userId: number): Promise<FriendRequest[]>;
  getFriendRequestById(id: number): Promise<FriendRequest | undefined>;
  getPendingFriendRequests(userId: number): Promise<FriendRequest[]>;
  createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest>;
  updateFriendRequestStatus(id: number, status: string): Promise<FriendRequest | undefined>;
  
  // Contact operations
  getContacts(userId: number): Promise<{ contact: User, unreadCount: number }[]>;
  addContact(userId: number, contactId: number): Promise<Contact>;
  
  // 群组操作
  createGroup(group: InsertGroup): Promise<Group>;
  getGroup(id: number): Promise<Group | undefined>;
  getUserGroups(userId: number): Promise<Group[]>;
  updateGroup(id: number, data: Partial<InsertGroup>): Promise<Group | undefined>;
  deleteGroup(id: number): Promise<void>;
  
  // 群组成员操作
  addGroupMember(groupId: number, userId: number, role?: string): Promise<GroupMember>;
  removeGroupMember(groupId: number, userId: number): Promise<void>;
  getGroupMembers(groupId: number): Promise<GroupMember[]>;
  getGroupMembersWithUserDetails(groupId: number): Promise<{ member: GroupMember, user: User }[]>;
  updateGroupMemberRole(groupId: number, userId: number, role: string): Promise<GroupMember | undefined>;
  isGroupMember(groupId: number, userId: number): Promise<boolean>;
  isGroupAdmin(groupId: number, userId: number): Promise<boolean>;
  
  // 群组邀请操作
  createGroupInvite(invite: InsertGroupInvite): Promise<GroupInvite>;
  getGroupInvite(id: number): Promise<GroupInvite | undefined>;
  getUserGroupInvites(userId: number): Promise<GroupInvite[]>;
  updateGroupInviteStatus(id: number, status: string): Promise<GroupInvite | undefined>;
  
  // WebSocket connections
  addConnection(userId: number, socket: WebSocket): void;
  removeConnection(userId: number): void;
  getConnection(userId: number): WebSocket | undefined;
  getAllConnections(): UserConnection[];
  
  // Session store
  sessionStore: SessionStore;
}

export class DatabaseStorage implements IStorage {
  private connections: Map<number, WebSocket>;
  sessionStore: SessionStore;

  constructor() {
    this.connections = new Map();
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
    console.log("DatabaseStorage initialized with PostgreSQL connection");
  }

  // Friend request operations
  async getFriendRequests(userId: number): Promise<FriendRequest[]> {
    return await db.select().from(friendRequests).where(
      or(
        eq(friendRequests.senderId, userId),
        eq(friendRequests.receiverId, userId)
      )
    );
  }

  async getFriendRequestById(id: number): Promise<FriendRequest | undefined> {
    console.log(`获取好友请求详情 - 请求ID: ${id}`);
    try {
      const result = await db.select().from(friendRequests).where(eq(friendRequests.id, id));
      
      if (result.length === 0) {
        console.log(`未找到好友请求 ID: ${id}`);
        return undefined;
      }
      
      console.log(`好友请求 ID ${id} 详情:`, result[0]);
      return result[0];
    } catch (error) {
      console.error(`获取好友请求详情时出错:`, error);
      throw error;
    }
  }

  async getPendingFriendRequests(userId: number): Promise<FriendRequest[]> {
    console.log(`获取用户 ${userId} 的待处理好友请求`);
    try {
      // 直接执行SQL查询
      console.log(`执行SQL查询获取用户 ${userId} 收到的待处理请求`);
      
      const sqlResult = await db.select().from(friendRequests).where(
        and(
          eq(friendRequests.receiverId, userId),
          eq(friendRequests.status, 'pending')
        )
      );
      
      console.log(`SQL查询结果: 用户 ${userId} 收到了 ${sqlResult.length} 个待处理请求`, 
        sqlResult.map(r => `请求ID=${r.id}, 发送者=${r.senderId}`));
      
      // 如果没有请求，打印所有待处理请求以便调试
      if (sqlResult.length === 0) {
        const allPending = await db.select().from(friendRequests).where(
          eq(friendRequests.status, 'pending')
        );
        console.log(`数据库中所有待处理请求:`, allPending);
      }
      
      return sqlResult;
    } catch (error) {
      console.error(`获取待处理好友请求时出错:`, error);
      throw error;
    }
  }

  async createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest> {
    const result = await db.insert(friendRequests).values({
      ...request,
      status: 'pending',
    }).returning();
    return result[0];
  }

  async updateFriendRequestStatus(id: number, status: string): Promise<FriendRequest | undefined> {
    console.log(`更新好友请求状态 - 请求ID: ${id}, 新状态: ${status}`);
    try {
      // 首先确认此请求存在
      const existingRequest = await this.getFriendRequestById(id);
      if (!existingRequest) {
        console.error(`无法更新好友请求状态 - 请求ID ${id} 不存在`);
        return undefined;
      }
      
      console.log(`当前请求状态: ${existingRequest.status}, 更新为: ${status}`);
      
      // 执行更新
      const result = await db.update(friendRequests)
        .set({ 
          status, 
          updatedAt: new Date() 
        })
        .where(eq(friendRequests.id, id))
        .returning();
      
      if (result.length === 0) {
        console.error(`更新失败 - 没有记录被更新, 请求ID: ${id}`);
        return undefined;
      }
      
      console.log(`请求状态已成功更新为 ${status}:`, result[0]);
      return result[0];
    } catch (error) {
      console.error(`更新好友请求状态时出错:`, error);
      throw error;
    }
  }

  // Get all users
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(id: number): Promise<User | undefined> {
    console.log(`Fetching user with ID: ${id}`);
    const result = await db.select().from(users).where(eq(users.id, id));
    if (result.length === 0) {
      console.log(`No user found with ID: ${id}`);
      return undefined;
    }
    console.log(`Found user: ${result[0].username}`);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result.length > 0 ? result[0] : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log("Creating new user:", insertUser.username);
    const result = await db.insert(users).values({
      ...insertUser,
      isOnline: false,
      lastSeen: new Date(),
    }).returning();
    console.log(`User created with ID: ${result[0].id}`);
    return result[0];
  }

  async updateUserStatus(id: number, isOnline: boolean): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ isOnline })
      .where(eq(users.id, id))
      .returning();
    return result.length > 0 ? result[0] : undefined;
  }

  async updateUserLastSeen(id: number): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ lastSeen: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result.length > 0 ? result[0] : undefined;
  }

  async getMessages(userId: number, contactId: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, userId),
            eq(messages.receiverId, contactId)
          ),
          and(
            eq(messages.senderId, contactId),
            eq(messages.receiverId, userId)
          )
        )
      )
      .orderBy(asc(messages.createdAt));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const result = await db.insert(messages).values({
      ...insertMessage,
      read: false,
    }).returning();
    return result[0];
  }

  async markMessagesAsRead(receiverId: number, senderId: number): Promise<void> {
    await db.update(messages)
      .set({ read: true })
      .where(
        and(
          eq(messages.senderId, senderId),
          eq(messages.receiverId, receiverId),
          eq(messages.read, false)
        )
      );
  }

  async getUnreadMessageCount(userId: number, contactId: number): Promise<number> {
    const result = await db.select().from(messages)
      .where(
        and(
          eq(messages.senderId, contactId),
          eq(messages.receiverId, userId),
          eq(messages.read, false)
        )
      );
    return result.length;
  }

  async getContacts(userId: number): Promise<{ contact: User, unreadCount: number }[]> {
    console.log(`获取用户 ${userId} 的联系人列表`);
    
    try {
      // 直接查询contacts表
      const userContacts = await db.select().from(contacts)
        .where(eq(contacts.userId, userId));
      
      console.log(`从数据库查询到 ${userContacts.length} 个联系人关系:`, 
        userContacts.map(c => `联系人ID=${c.contactId}`));
      
      // 遍历每个联系人获取详细信息
      const results = [];
      for (const contact of userContacts) {
        console.log(`正在获取联系人 ${contact.contactId} 的详细信息`);
        const user = await this.getUser(contact.contactId);
        
        if (!user) {
          console.log(`警告: 找不到ID为 ${contact.contactId} 的用户信息`);
          continue;
        }
        
        console.log(`成功获取联系人 ${contact.contactId} (${user.username}) 的信息`);
        const unreadCount = await this.getUnreadMessageCount(userId, contact.contactId);
        results.push({ 
          contact: user, 
          unreadCount 
        });
      }
      
      console.log(`用户 ${userId} 总共有 ${results.length} 个联系人`);
      return results;
    } catch (error) {
      console.error(`获取联系人列表时出错:`, error);
      throw error;
    }
  }

  async addContact(userId: number, contactId: number): Promise<Contact> {
    // Check if contact already exists
    const existingContact = await db.select().from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          eq(contacts.contactId, contactId)
        )
      );
    
    if (existingContact.length > 0) {
      return existingContact[0];
    }
    
    const result = await db.insert(contacts).values({
      userId,
      contactId,
    }).returning();
    
    return result[0];
  }

  addConnection(userId: number, socket: WebSocket): void {
    console.log(`Adding WebSocket connection for user ${userId}`);
    this.connections.set(userId, socket);
  }

  removeConnection(userId: number): void {
    console.log(`Removing WebSocket connection for user ${userId}`);
    this.connections.delete(userId);
  }

  getConnection(userId: number): WebSocket | undefined {
    return this.connections.get(userId);
  }

  getAllConnections(): UserConnection[] {
    return Array.from(this.connections.entries()).map(([userId, socket]) => ({
      userId,
      socket
    }));
  }
  
  // 群组操作
  async createGroup(group: InsertGroup): Promise<Group> {
    console.log("创建群组:", group);
    const [newGroup] = await db.insert(groups).values(group).returning();
    
    // 自动添加创建者为管理员
    await this.addGroupMember(newGroup.id, group.creatorId, 'admin');
    
    return newGroup;
  }
  
  async getGroup(id: number): Promise<Group | undefined> {
    console.log(`获取群组 ${id} 信息`);
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }
  
  async getUserGroups(userId: number): Promise<Group[]> {
    console.log(`获取用户 ${userId} 所在的群组`);
    // 获取用户作为成员的所有群组ID
    const userGroupIds = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));
    
    if (userGroupIds.length === 0) {
      console.log(`用户 ${userId} 不属于任何群组`);
      return [];
    }
    
    // 获取这些群组的详细信息
    const userGroups = await db
      .select()
      .from(groups)
      .where(
        or(...userGroupIds.map(row => eq(groups.id, row.groupId)))
      );
    
    console.log(`用户 ${userId} 共属于 ${userGroups.length} 个群组`);
    return userGroups;
  }
  
  async updateGroup(id: number, data: Partial<InsertGroup>): Promise<Group | undefined> {
    console.log(`更新群组 ${id}:`, data);
    const [updated] = await db
      .update(groups)
      .set(data)
      .where(eq(groups.id, id))
      .returning();
    
    return updated;
  }
  
  async deleteGroup(id: number): Promise<void> {
    console.log(`删除群组 ${id}`);
    // 先删除群组成员
    await db.delete(groupMembers).where(eq(groupMembers.groupId, id));
    // 删除群组邀请
    await db.delete(groupInvites).where(eq(groupInvites.groupId, id));
    // 删除群消息
    await db.delete(messages).where(eq(messages.groupId as any, id));
    // 最后删除群组
    await db.delete(groups).where(eq(groups.id, id));
  }
  
  // 群组成员操作
  async addGroupMember(groupId: number, userId: number, role: string = 'member'): Promise<GroupMember> {
    console.log(`添加用户 ${userId} 到群组 ${groupId}, 角色: ${role}`);
    const [member] = await db
      .insert(groupMembers)
      .values({ groupId, userId, role })
      .returning();
    
    return member;
  }
  
  async removeGroupMember(groupId: number, userId: number): Promise<void> {
    console.log(`从群组 ${groupId} 移除用户 ${userId}`);
    await db
      .delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      );
  }
  
  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    console.log(`获取群组 ${groupId} 的所有成员`);
    return await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
  }
  
  async getGroupMembersWithUserDetails(groupId: number): Promise<{ member: GroupMember, user: User }[]> {
    console.log(`获取群组 ${groupId} 的所有成员及其详细信息`);
    const members = await this.getGroupMembers(groupId);
    
    // 获取所有成员的用户信息
    const results = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      if (user) {
        results.push({ member, user });
      }
    }
    
    return results;
  }
  
  async updateGroupMemberRole(groupId: number, userId: number, role: string): Promise<GroupMember | undefined> {
    console.log(`更新用户 ${userId} 在群组 ${groupId} 中的角色为 ${role}`);
    const [updated] = await db
      .update(groupMembers)
      .set({ role })
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      )
      .returning();
    
    return updated;
  }
  
  async isGroupMember(groupId: number, userId: number): Promise<boolean> {
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        )
      );
    
    return !!member;
  }
  
  async isGroupAdmin(groupId: number, userId: number): Promise<boolean> {
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, 'admin')
        )
      );
    
    return !!member;
  }
  
  // 群组邀请操作
  async createGroupInvite(invite: InsertGroupInvite): Promise<GroupInvite> {
    console.log(`创建群组邀请: 用户 ${invite.inviterId} 邀请 ${invite.inviteeId} 加入群组 ${invite.groupId}`);
    const [newInvite] = await db
      .insert(groupInvites)
      .values(invite)
      .returning();
    
    return newInvite;
  }
  
  async getGroupInvite(id: number): Promise<GroupInvite | undefined> {
    console.log(`获取群组邀请 ${id}`);
    const [invite] = await db
      .select()
      .from(groupInvites)
      .where(eq(groupInvites.id, id));
    
    return invite;
  }
  
  async getUserGroupInvites(userId: number): Promise<GroupInvite[]> {
    console.log(`获取用户 ${userId} 收到的群组邀请`);
    return await db
      .select()
      .from(groupInvites)
      .where(
        and(
          eq(groupInvites.inviteeId, userId),
          eq(groupInvites.status, 'pending')
        )
      );
  }
  
  async updateGroupInviteStatus(id: number, status: string): Promise<GroupInvite | undefined> {
    console.log(`更新群组邀请 ${id} 状态为 ${status}`);
    const [updated] = await db
      .update(groupInvites)
      .set({ 
        status, 
        updatedAt: new Date() 
      })
      .where(eq(groupInvites.id, id))
      .returning();
    
    return updated;
  }
  
  // 群组消息操作
  async getGroupMessages(groupId: number): Promise<Message[]> {
    console.log(`获取群组 ${groupId} 的消息`);
    return await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.groupId as any, groupId),
          eq(messages.messageType as any, 'group')
        )
      )
      .orderBy(asc(messages.createdAt));
  }
  
  async createGroupMessage(
    senderId: number, 
    groupId: number, 
    content: string,
    fileUrl?: string,
    fileType?: string,
    fileName?: string,
    messageType: string = 'group'
  ): Promise<Message> {
    console.log(`创建群组消息: 用户 ${senderId} 在群组 ${groupId} 发送消息 ${fileUrl ? '(带附件)' : ''}`);
    const [message] = await db
      .insert(messages)
      .values({
        senderId,
        content,
        receiverId: null,
        groupId,
        read: false,
        messageType,
        fileUrl,
        fileType,
        fileName
      } as any)
      .returning();
    
    return message;
  }
}

// Create a memory-based storage for development and a database storage for production
export const storage = new DatabaseStorage();
