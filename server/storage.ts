import { users, messages, contacts, type User, type Message, type Contact, type InsertUser, type InsertMessage, type InsertContact } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { WebSocket } from "ws";

const MemoryStore = createMemoryStore(session);

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
  getAllUsers(): Promise<User[]>; // Add a function to get all users
  
  // Message operations
  getMessages(userId: number, contactId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessagesAsRead(receiverId: number, senderId: number): Promise<void>;
  getUnreadMessageCount(userId: number, contactId: number): Promise<number>;
  
  // Contact operations
  getContacts(userId: number): Promise<{ contact: User, unreadCount: number }[]>;
  addContact(userId: number, contactId: number): Promise<Contact>;
  
  // WebSocket connections
  addConnection(userId: number, socket: WebSocket): void;
  removeConnection(userId: number): void;
  getConnection(userId: number): WebSocket | undefined;
  getAllConnections(): UserConnection[];
  
  // Session store
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private messages: Map<number, Message>;
  private contacts: Map<number, Contact>;
  private connections: Map<number, WebSocket>;
  sessionStore: session.SessionStore;
  currentUserId: number;
  currentMessageId: number;
  currentContactId: number;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.contacts = new Map();
    this.connections = new Map();
    this.currentUserId = 1;
    this.currentMessageId = 1;
    this.currentContactId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  // Get all users - implementation for the new interface method
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id, 
      isOnline: false, 
      lastSeen: now
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserStatus(id: number, isOnline: boolean): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, isOnline };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserLastSeen(id: number): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, lastSeen: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getMessages(userId: number, contactId: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => 
        (message.senderId === userId && message.receiverId === contactId) ||
        (message.senderId === contactId && message.receiverId === userId)
    ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
      read: false,
    };
    this.messages.set(id, message);
    return message;
  }

  async markMessagesAsRead(receiverId: number, senderId: number): Promise<void> {
    Array.from(this.messages.values())
      .filter(msg => msg.senderId === senderId && msg.receiverId === receiverId && !msg.read)
      .forEach(msg => {
        const updatedMsg = { ...msg, read: true };
        this.messages.set(msg.id, updatedMsg);
      });
  }

  async getUnreadMessageCount(userId: number, contactId: number): Promise<number> {
    return Array.from(this.messages.values()).filter(
      (message) => message.senderId === contactId && message.receiverId === userId && !message.read
    ).length;
  }

  async getContacts(userId: number): Promise<{ contact: User, unreadCount: number }[]> {
    const userContacts = Array.from(this.contacts.values())
      .filter(contact => contact.userId === userId)
      .map(contact => contact.contactId);
    
    const results = [];
    for (const contactId of userContacts) {
      const contact = await this.getUser(contactId);
      if (contact) {
        const unreadCount = await this.getUnreadMessageCount(userId, contactId);
        results.push({ contact, unreadCount });
      }
    }
    
    return results;
  }

  async addContact(userId: number, contactId: number): Promise<Contact> {
    // Check if contact already exists
    const existingContact = Array.from(this.contacts.values()).find(
      (contact) => contact.userId === userId && contact.contactId === contactId
    );
    
    if (existingContact) {
      return existingContact;
    }
    
    const id = this.currentContactId++;
    const contact: Contact = { id, userId, contactId };
    this.contacts.set(id, contact);
    return contact;
  }

  addConnection(userId: number, socket: WebSocket): void {
    this.connections.set(userId, socket);
  }

  removeConnection(userId: number): void {
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

export const storage = new MemStorage();
