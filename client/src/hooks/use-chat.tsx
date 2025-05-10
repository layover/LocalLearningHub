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
  });
  
  // Update state when friend requests change
  useEffect(() => {
    setPendingFriendRequests(friendRequests || []);
  }, [friendRequests]);

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
                console.log("收到好友请求:", data.request);
                // Invalidate pending friend requests query to refresh the list
                queryClient.invalidateQueries({ queryKey: ['/api/friend-requests/pending'] });
                
                // Display notification with sender info
                if (data.request.sender) {
                  toast({
                    title: "收到好友请求",
                    description: `${data.request.sender.displayName || data.request.sender.username || '用户'} 想要添加您为好友`,
                  });
                } else {
                  // Fallback if sender info is not included
                  toast({
                    title: "收到好友请求",
                    description: `有用户想要添加您为好友`,
                  });
                  
                  console.log("好友请求中无发送者信息");
                }
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
    try {
      await apiRequest('PUT', `/api/friend-requests/${requestId}`, { status });
      
      // Update local state
      setPendingFriendRequests(prev => prev.filter(req => req.id !== requestId));
      
      // Refresh contacts list if request was accepted
      if (status === 'accepted') {
        queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      }
      
      toast({
        title: status === 'accepted' ? "好友请求已接受" : "好友请求已拒绝",
        description: status === 'accepted' ? "您已添加该用户为好友" : "您已拒绝该用户的好友请求"
      });
      
    } catch (error) {
      toast({
        title: "操作失败",
        description: (error as Error).message || "请稍后重试",
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
