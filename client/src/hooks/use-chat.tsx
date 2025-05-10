import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { Contact, Message, User, WebSocketMessage } from "@/types";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatContextType {
  contacts: Contact[];
  messages: Record<number, Message[]>;
  selectedContact: Contact | null;
  selectContact: (contact: Contact) => void;
  sendMessage: (content: string) => void;
  isLoading: boolean;
  isConnected: boolean;
  markMessagesAsRead: (contactId: number) => void;
  pendingFriendRequests: any[];
  respondToFriendRequest: (requestId: number, status: 'accepted' | 'rejected') => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Record<number, Message[]>>({});
  const [pendingFriendRequests, setPendingFriendRequests] = useState<any[]>([]);

  // Fetch contacts for the current user
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
    enabled: !!user,
  });
  
  // Fetch pending friend requests
  const { data: friendRequests = [] } = useQuery({
    queryKey: ['/api/friend-requests/pending'],
    enabled: !!user,
    refetchInterval: 10000, // 每10秒自动刷新一次
  });
  
  // 使用useEffect来处理请求数据变化
  useEffect(() => {
    console.log("pendingFriendRequests数据更新:", friendRequests);
    if (Array.isArray(friendRequests)) {
      setPendingFriendRequests(friendRequests);
    }
  }, [friendRequests]);
  
  // 移除this effect，直接使用friendRequests

  // Connect to WebSocket server
  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
      
      // Log connection attempt
      console.log(`Attempting WebSocket connection to: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      socket.current = ws;

      ws.onopen = () => {
        console.log(`WebSocket connection opened successfully for user ${user.id}`);
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          
          switch (data.type) {
            case 'message':
              if (data.message) {
                const message = {
                  ...data.message,
                  createdAt: new Date(data.message.createdAt)
                };

                // Update messages
                setMessages(prev => {
                  const contactId = message.senderId === user.id 
                    ? message.receiverId 
                    : message.senderId;
                    
                  const contactMessages = [...(prev[contactId] || []), message];
                  return {
                    ...prev,
                    [contactId]: contactMessages.sort((a, b) => 
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    )
                  };
                });

                // Invalidate contacts query to update unread counts
                queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
              }
              break;
              
            case 'status':
              if (data.userId !== undefined && data.isOnline !== undefined) {
                // Update contact's online status
                queryClient.setQueryData(['/api/contacts'], (oldData: Contact[] | undefined) => {
                  if (!oldData) return [];
                  
                  return oldData.map(item => {
                    if (item.contact.id === data.userId) {
                      return {
                        ...item,
                        contact: {
                          ...item.contact,
                          isOnline: data.isOnline!
                        }
                      };
                    }
                    return item;
                  });
                });
              }
              break;
              
            case 'friend_request':
              if (data.request) {
                console.log("收到好友请求详情:", JSON.stringify(data.request));
                // 无论如何首先刷新好友请求列表
                queryClient.invalidateQueries({ queryKey: ['/api/friend-requests/pending'] });
                
                // 尝试安全地访问sender属性
                let senderName = "用户";
                try {
                  // 如果sender存在且有displayName或username属性
                  if (data.request.sender && 
                      (data.request.sender.displayName || data.request.sender.username)) {
                    console.log("请求中包含发送者信息:", data.request.sender);
                    senderName = data.request.sender.displayName || data.request.sender.username;
                  } else {
                    console.log("请求中不包含完整的发送者信息");
                  }
                } catch (error) {
                  console.error("处理好友请求发送者信息时出错:", error);
                }
                
                // 显示好友请求通知
                toast({
                  title: "收到好友请求",
                  description: `${senderName} 想要添加您为好友`,
                });
                
                // 强制重新加载数据以确保UI更新
                setTimeout(() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/friend-requests/pending'] });
                }, 500);
              }
              break;
              
            case 'friend_request_response':
              // Refresh contacts list if request was accepted
              if (data.status === 'accepted') {
                queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
                
                toast({
                  title: "好友请求已接受",
                  description: "您现在可以开始聊天了",
                });
              } else if (data.status === 'rejected') {
                toast({
                  title: "好友请求已拒绝",
                  description: "对方拒绝了您的好友请求",
                  variant: "destructive",
                });
              }
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Try to reconnect in 5 seconds
        setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.log('WebSocket error details:', {
          user: user ? user.id : 'undefined',
          readyState: ws.readyState,
          url: wsUrl
        });
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      if (socket.current) {
        socket.current.close();
      }
    };
  }, [user, queryClient]);

  // Fetch messages when a contact is selected
  useEffect(() => {
    if (!selectedContact || !user) return;
    
    const fetchMessages = async () => {
      try {
        const contactId = selectedContact.contact.id;
        const response = await fetch(`/api/messages/${contactId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }
        
        const data: Message[] = await response.json();
        
        setMessages(prev => ({
          ...prev,
          [contactId]: data.map(msg => ({
            ...msg,
            createdAt: new Date(msg.createdAt)
          }))
        }));
        
        // Update contact's unread count to zero
        queryClient.setQueryData(['/api/contacts'], (oldData: Contact[] | undefined) => {
          if (!oldData) return [];
          
          return oldData.map(item => {
            if (item.contact.id === contactId) {
              return {
                ...item,
                unreadCount: 0
              };
            }
            return item;
          });
        });
        
      } catch (error) {
        console.error('Error fetching messages:', error);
        toast({
          title: "获取消息失败",
          description: "无法加载聊天记录，请稍后重试",
          variant: "destructive",
        });
      }
    };
    
    fetchMessages();
  }, [selectedContact, user, queryClient, toast]);

  const selectContact = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    
    // Mark messages as read when selecting a contact
    if (contact.unreadCount > 0) {
      markMessagesAsRead(contact.contact.id);
    }
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!socket.current || !user || !selectedContact || !isConnected) {
      toast({
        title: "发送失败",
        description: "网络连接异常，请重试",
        variant: "destructive",
      });
      return;
    }
    
    const message: WebSocketMessage = {
      type: 'message',
      message: {
        id: 0, // Will be set by server
        senderId: user.id,
        receiverId: selectedContact.contact.id,
        content,
        createdAt: new Date().toISOString(),
        read: false
      }
    };
    
    socket.current.send(JSON.stringify(message));
  }, [socket, user, selectedContact, isConnected, toast]);

  const markMessagesAsRead = useCallback((contactId: number) => {
    if (!socket.current || !user || !isConnected) return;
    
    const contactMessages = messages[contactId] || [];
    const unreadMessageIds = contactMessages
      .filter(msg => msg.senderId === contactId && !msg.read)
      .map(msg => msg.id);
    
    if (unreadMessageIds.length === 0) return;
    
    const readReceipt: WebSocketMessage = {
      type: 'read_receipt',
      messageIds: unreadMessageIds
    };
    
    socket.current.send(JSON.stringify(readReceipt));
    
    // Update local messages state
    setMessages(prev => {
      const updatedMessages = (prev[contactId] || []).map(msg => {
        if (unreadMessageIds.includes(msg.id)) {
          return { ...msg, read: true };
        }
        return msg;
      });
      
      return {
        ...prev,
        [contactId]: updatedMessages
      };
    });
  }, [socket, user, isConnected, messages]);
  
  // Respond to friend request
  const respondToFriendRequest = useCallback(async (requestId: number, status: 'accepted' | 'rejected') => {
    console.log(`开始处理好友请求 ${requestId}, 状态: ${status}`);
    
    try {
      // 不再检查请求存在于列表中，因为这可能导致失败
      // 直接发送请求到后端处理
      
      console.log(`发送API请求到 /api/friend-requests/${requestId}`);
      
      // 使用带超时的fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`/api/friend-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
        signal: controller.signal,
        credentials: 'include'
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log("服务器响应:", result);
      
      // Update local state - 无论本地列表是否包含此请求，都尝试删除
      setPendingFriendRequests(prev => prev.filter(req => req.id !== requestId));
      
      // 强制重新获取好友请求列表和联系人列表
      queryClient.invalidateQueries({ queryKey: ['/api/friend-requests/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      
      // 通知用户
      toast({
        title: status === 'accepted' ? "好友请求已接受" : "好友请求已拒绝",
        description: status === 'accepted' ? "您已添加该用户为好友" : "您已拒绝该用户的好友请求"
      });
      
      console.log(`好友请求 ${requestId} 已被${status === 'accepted' ? '接受' : '拒绝'}`);
    } catch (error) {
      console.error("处理好友请求时出错:", error);
      toast({
        title: "操作失败",
        description: (error instanceof Error) ? error.message : "请稍后重试",
        variant: "destructive"
      });
    }
  }, [queryClient, toast]);

  return (
    <ChatContext.Provider value={{
      contacts,
      messages,
      selectedContact,
      selectContact,
      sendMessage,
      isLoading,
      isConnected,
      markMessagesAsRead,
      pendingFriendRequests,
      respondToFriendRequest
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
