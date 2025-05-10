import { users, messages, contacts, friendRequests, type User, type Message, type Contact, type FriendRequest, type InsertUser, type InsertMessage, type InsertContact, type InsertFriendRequest } from "@shared/schema";
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
  
  // Friend request operations
  getFriendRequests(userId: number): Promise<FriendRequest[]>;
  getFriendRequestById(id: number): Promise<FriendRequest | undefined>;
  getPendingFriendRequests(userId: number): Promise<FriendRequest[]>;
  createFriendRequest(request: InsertFriendRequest): Promise<FriendRequest>;
  updateFriendRequestStatus(id: number, status: string): Promise<FriendRequest | undefined>;
  
  // Contact operations
  getContacts(userId: number): Promise<{ contact: User, unreadCount: number }[]>;
  addContact(userId: number, contactId: number): Promise<Contact>;
  
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
      const result = await db.select().from(friendRequests).where(
        and(
          eq(friendRequests.receiverId, userId),
          eq(friendRequests.status, 'pending')
        )
      );
      
      console.log(`用户 ${userId} 有 ${result.length} 个待处理好友请求:`, result);
      return result;
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
    const userContacts = await db.select().from(contacts)
      .where(eq(contacts.userId, userId));
    
    const results = [];
    for (const contact of userContacts) {
      const user = await this.getUser(contact.contactId);
      if (user) {
        const unreadCount = await this.getUnreadMessageCount(userId, contact.contactId);
        results.push({ contact: user, unreadCount });
      }
    }
    
    return results;
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
}

// Create a memory-based storage for development and a database storage for production
export const storage = new DatabaseStorage();
