import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { db } from "./db";
import { and, eq, or } from "drizzle-orm";
import { insertMessageSchema, WebSocketMessage, friendRequests } from "@shared/schema";
import { log } from "./vite";
import { parse } from "querystring";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Handle WebSocket connections
  wss.on('connection', async (ws: WebSocket, req) => {
    // Extract user ID from query params
    if (!req.url) {
      console.error('WebSocket connection: No URL provided');
      return ws.close();
    }

    // Log connection attempt with URL
    console.log(`WebSocket connection attempt with URL: ${req.url}`);

    const userId = parseInt(new URL(req.url, 'http://localhost').searchParams.get('userId') || '0');
    if (!userId) {
      console.error('WebSocket connection: Invalid user ID');
      return ws.close();
    }
    
    console.log(`WebSocket connection: User ID ${userId} extracted`);

    // Get user
    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`WebSocket connection: User ${userId} not found`);
      return ws.close();
    }
    
    console.log(`WebSocket connection: User ${userId} (${user.username}) found and verified`);

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
              
              // Mark all messages as read from the other user to the current user
              // We need to figure out the other user's ID (contact ID) from the messages
              // Since we don't have access to the message.userId, we'll handle it differently
              // For simplicity, we'll assume all messageIds are from the same sender
              // and we'll mark all messages from that sender as read
              
              // Get the contacts for this user
              const contacts = await storage.getContacts(senderId);
              
              // For each contact, mark messages as read
              for (const contact of contacts) {
                await storage.markMessagesAsRead(senderId, contact.contact.id);
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
  
  // Send a friend request
  app.post('/api/friend-requests', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    const senderId = req.user!.id;
    const { receiverId } = req.body;
    
    if (!receiverId || typeof receiverId !== 'number') {
      return res.status(400).json({ message: 'Invalid receiver ID' });
    }
    
    // Verify receiver exists
    const receiverUser = await storage.getUser(receiverId);
    if (!receiverUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if a friend request already exists
    const existingRequests = await storage.getFriendRequests(senderId);
    const hasPendingRequest = existingRequests.some(
      req => (req.senderId === senderId && req.receiverId === receiverId ||
             req.senderId === receiverId && req.receiverId === senderId) && 
             req.status === 'pending'
    );
    
    if (hasPendingRequest) {
      return res.status(400).json({ message: 'A pending friend request already exists' });
    }
    
    // Check if they are already friends
    const contacts = await storage.getContacts(senderId);
    const isAlreadyFriend = contacts.some(c => c.contact.id === receiverId);
    
    if (isAlreadyFriend) {
      return res.status(400).json({ message: 'User is already in your contacts' });
    }
    
    // Create friend request
    const friendRequest = await storage.createFriendRequest({
      senderId,
      receiverId
    });
    
    // Get sender information to include in the notification
    const sender = await storage.getUser(senderId);
    if (!sender) {
      return res.status(500).json({ message: 'Failed to get sender information' });
    }
    
    // Remove sensitive information
    const { password: _, ...safeSender } = sender;
    
    // Get all active connections
    const connections = storage.getAllConnections();
    console.log(`Active connections: ${connections.length}`, 
      connections.map(c => c.userId));
    
    // Notify the receiver through WebSocket if they're online
    const receiverSocket = storage.getConnection(receiverId);
    console.log(`Checking if receiver ${receiverId} has active connection:`, 
      receiverSocket ? "Yes" : "No");
    
    if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
      console.log(`Sending friend request notification to user ${receiverId} from user ${senderId}`);
      
      const notification = {
        type: 'friend_request',
        request: {
          id: friendRequest.id,
          senderId: friendRequest.senderId,
          receiverId: friendRequest.receiverId,
          status: friendRequest.status,
          createdAt: friendRequest.createdAt.toISOString(),
          sender: safeSender // Include sender information
        }
      };
      
      console.log("Sending notification:", JSON.stringify(notification));
      
      try {
        receiverSocket.send(JSON.stringify(notification));
        console.log("Notification sent successfully");
      } catch (error) {
        console.error("Error sending notification:", error);
      }
    } else {
      console.log(`User ${receiverId} is not online, could not send real-time notification`);
    }
    
    res.status(201).json(friendRequest);
  });
  
  // Get pending friend requests
  app.get('/api/friend-requests/pending', async (req, res) => {
    console.log('获取待处理好友请求 - 认证状态:', req.isAuthenticated());
    
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    try {
      const userId = req.user!.id;
      console.log(`用户${userId}请求获取待处理好友请求列表`);
      
      // 直接从数据库获取所有待处理请求(receiver=当前用户且status=pending)
      const pendingRequests = await db.select().from(friendRequests).where(
        and(
          eq(friendRequests.receiverId, userId),
          eq(friendRequests.status, 'pending')
        )
      );
      
      console.log(`查询到${pendingRequests.length}个待处理请求:`, pendingRequests);
      
      // 获取每个请求发送者的信息
      const requestsWithSenders = await Promise.all(pendingRequests.map(async (request) => {
        console.log(`正在获取请求${request.id}的发送者${request.senderId}信息`);
        const sender = await storage.getUser(request.senderId);
        
        if (!sender) {
          console.log(`未找到发送者${request.senderId}的信息`);
          return {
            ...request,
            sender: { 
              id: request.senderId,
              username: `user${request.senderId}`,
              displayName: `用户${request.senderId}`,
              isOnline: false
            }
          };
        }
        
        // 确保不返回密码字段
        const { password: _, ...safeSender } = sender;
        console.log(`发送者${request.senderId}信息:`, safeSender);
        
        return {
          ...request,
          sender: safeSender
        };
      }));
      
      console.log(`返回${requestsWithSenders.length}个待处理请求(带发送者信息)`);
      res.json(requestsWithSenders);
    } catch (error) {
      console.error('获取待处理好友请求时出错:', error);
      res.status(500).json({ message: '获取待处理好友请求失败' });
    }
  });
  
  // Respond to a friend request
  app.put('/api/friend-requests/:id', async (req, res) => {
    console.log(`收到好友请求响应: ID=${req.params.id}, 状态=${req.body.status}`);
    
    if (!req.isAuthenticated()) {
      console.log('未授权的请求');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const userId = req.user!.id;
    const requestId = parseInt(req.params.id);
    const { status } = req.body; // 'accepted' or 'rejected'
    
    console.log(`用户 ${userId} 正在响应好友请求 ${requestId} 为 ${status}`);
    
    if (!['accepted', 'rejected'].includes(status)) {
      console.log(`无效的状态: ${status}`);
      return res.status(400).json({ message: 'Invalid status. Must be "accepted" or "rejected"' });
    }
    
    // Get the friend request
    const friendRequest = await storage.getFriendRequestById(requestId);
    
    if (!friendRequest) {
      console.log(`找不到好友请求 ${requestId}`);
      return res.status(404).json({ message: 'Friend request not found' });
    }
    
    console.log(`已找到好友请求:`, friendRequest);
    
    // Check if the current user is the receiver of the request
    if (friendRequest.receiverId !== userId) {
      console.log(`用户 ${userId} 不是请求的接收者 (${friendRequest.receiverId})`);
      return res.status(403).json({ message: 'You can only respond to friend requests sent to you' });
    }
    
    // Check if request is already handled
    if (friendRequest.status !== 'pending') {
      console.log(`好友请求已经被处理为 ${friendRequest.status}`);
      return res.status(400).json({ message: `Friend request is already ${friendRequest.status}` });
    }
    
    try {
      console.log(`更新好友请求 ${requestId} 状态为 ${status}`);
      // Update request status
      const updatedRequest = await storage.updateFriendRequestStatus(requestId, status);
      console.log(`请求状态已更新:`, updatedRequest);
      
      // If accepted, add both users to each other's contacts
      if (status === 'accepted') {
        console.log(`接受请求，添加双向联系人关系: ${friendRequest.senderId} <-> ${friendRequest.receiverId}`);
        await storage.addContact(friendRequest.senderId, friendRequest.receiverId);
        await storage.addContact(friendRequest.receiverId, friendRequest.senderId);
      }
      
      // Notify the sender through WebSocket if they're online
      const senderSocket = storage.getConnection(friendRequest.senderId);
      console.log(`发送者 ${friendRequest.senderId} 是否在线:`, !!senderSocket);
      
      if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
        console.log(`正在通知发送者 ${friendRequest.senderId} 请求已被${status}`);
        
        const message = {
          type: 'friend_request_response',
          requestId: friendRequest.id,
          senderId: friendRequest.senderId,
          receiverId: friendRequest.receiverId,
          status
        };
        
        try {
          senderSocket.send(JSON.stringify(message));
          console.log("通知已发送");
        } catch (error) {
          console.error("发送WebSocket通知时出错:", error);
        }
      }
      
      console.log(`响应好友请求 ${requestId} 成功`);
      res.json(updatedRequest);
    } catch (error) {
      console.error(`处理好友请求时出错:`, error);
      res.status(500).json({ message: 'Failed to process friend request' });
    }
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
    
    // Get friend requests to check statuses
    const friendRequests = await storage.getFriendRequests(currentUserId);
    
    // Get contacts to check who is already a friend
    const contacts = await storage.getContacts(currentUserId);
    const contactIds = contacts.map(c => c.contact.id);
    
    // Return users with friend status info
    const usersWithStatus = matchedUsers.map(user => {
      const { password, ...safeUser } = user;
      
      // Check if users are already friends
      const isFriend = contactIds.includes(user.id);
      
      // Check for pending request
      const pendingRequest = friendRequests.find(req => 
        (req.senderId === currentUserId && req.receiverId === user.id) || 
        (req.senderId === user.id && req.receiverId === currentUserId)
      );
      
      let requestStatus = null;
      let requestId = null;
      
      if (pendingRequest) {
        requestStatus = pendingRequest.status;
        requestId = pendingRequest.id;
      }
      
      return {
        ...safeUser,
        isFriend,
        friendRequest: pendingRequest ? {
          id: requestId,
          status: requestStatus,
          isOutgoing: pendingRequest.senderId === currentUserId
        } : null
      };
    });
    
    res.json(usersWithStatus);
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
