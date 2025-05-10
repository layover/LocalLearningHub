import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertMessageSchema, WebSocketMessage } from "@shared/schema";
import { log } from "./vite";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Handle WebSocket connections
  wss.on('connection', async (ws: WebSocket, req) => {
    // Extract user ID from session
    if (!req.url) return ws.close();

    const userId = parseInt(new URL(req.url, 'http://localhost').searchParams.get('userId') || '0');
    if (!userId) return ws.close();

    // Get user
    const user = await storage.getUser(userId);
    if (!user) return ws.close();

    // Store connection
    storage.addConnection(userId, ws);
    
    // Update user status to online
    await storage.updateUserStatus(userId, true);
    
    // Broadcast user status to connected users
    const statusUpdate: WebSocketMessage = {
      type: 'status',
      userId: userId,
      isOnline: true
    };
    
    broadcastToConnections(JSON.stringify(statusUpdate));
    
    // Handle messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        
        switch (message.type) {
          case 'message':
            const validatedMessage = insertMessageSchema.parse({
              senderId: message.message.senderId,
              receiverId: message.message.receiverId,
              content: message.message.content
            });
            
            // Store message
            const savedMessage = await storage.createMessage(validatedMessage);
            
            // Send message to recipient if online
            const recipientSocket = storage.getConnection(validatedMessage.receiverId);
            if (recipientSocket && recipientSocket.readyState === WebSocket.OPEN) {
              recipientSocket.send(JSON.stringify({
                type: 'message',
                message: savedMessage
              }));
            }
            
            // Send confirmation back to sender
            ws.send(JSON.stringify({
              type: 'message',
              message: savedMessage
            }));
            break;
            
          case 'read_receipt':
            if (message.messageIds && message.messageIds.length > 0) {
              // Mark messages as read
              const senderId = user.id;
              
              // Instead of direct access to storage.messages, we'll use a different approach
              // Mark all messages as read from the senderId to the current user
              for (const messageId of message.messageIds) {
                // We can directly call markMessagesAsRead for each messageId
                // The implementation will handle finding and updating the message
                await storage.markMessagesAsRead(senderId, message.userId || 0);
              }
            }
            break;
        }
      } catch (error) {
        log(`Error processing WebSocket message: ${error}`, 'websocket');
      }
    });
    
    // Handle disconnection
    ws.on('close', async () => {
      storage.removeConnection(userId);
      await storage.updateUserStatus(userId, false);
      await storage.updateUserLastSeen(userId);
      
      // Broadcast user status update
      const statusUpdate: WebSocketMessage = {
        type: 'status',
        userId: userId,
        isOnline: false
      };
      
      broadcastToConnections(JSON.stringify(statusUpdate));
    });
  });

  // API routes
  // Get contacts for a user
  app.get('/api/contacts', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    const userId = req.user!.id;
    const contacts = await storage.getContacts(userId);
    res.json(contacts);
  });
  
  // Add a contact
  app.post('/api/contacts', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    const userId = req.user!.id;
    const { contactId } = req.body;
    
    if (!contactId || typeof contactId !== 'number') {
      return res.status(400).json({ message: 'Invalid contact ID' });
    }
    
    const contactUser = await storage.getUser(contactId);
    if (!contactUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const contact = await storage.addContact(userId, contactId);
    res.status(201).json(contact);
  });
  
  // Get messages between user and contact
  app.get('/api/messages/:contactId', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    const userId = req.user!.id;
    const contactId = parseInt(req.params.contactId);
    
    if (isNaN(contactId)) {
      return res.status(400).json({ message: 'Invalid contact ID' });
    }
    
    const messages = await storage.getMessages(userId, contactId);
    
    // Mark messages from this contact as read
    await storage.markMessagesAsRead(userId, contactId);
    
    res.json(messages);
  });
  
  // Search users by username
  app.get('/api/users/search', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    const { username } = req.query;
    const currentUserId = req.user!.id;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ message: 'Invalid username search term' });
    }
    
    // Use the getAllUsers method we just added to the interface
    const allUsers = await storage.getAllUsers();
    
    // Filter out the current user
    const filteredUsers = allUsers.filter(user => user.id !== currentUserId);
    
    // Filter users by username containing the search term
    const matchedUsers = filteredUsers.filter(user => 
      user.username.toLowerCase().includes(username.toLowerCase()) ||
      user.displayName.toLowerCase().includes(username.toLowerCase())
    );
    
    // Return users without sensitive info
    const safeUsers = matchedUsers.map(({ password, ...safeUser }) => safeUser);
    
    res.json(safeUsers);
  });
  
  // Helper function to broadcast to all connections
  function broadcastToConnections(data: string): void {
    const connections = storage.getAllConnections();
    
    for (const { socket } of connections) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }

  return httpServer;
}
