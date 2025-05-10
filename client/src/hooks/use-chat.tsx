import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { Contact, Message, User, WebSocketMessage } from "@/types";
import { useToast } from "./use-toast";

interface ChatContextType {
  contacts: Contact[];
  messages: Record<number, Message[]>;
  selectedContact: Contact | null;
  selectContact: (contact: Contact) => void;
  sendMessage: (content: string) => void;
  isLoading: boolean;
  isConnected: boolean;
  markMessagesAsRead: (contactId: number) => void;
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

  // Fetch contacts for the current user
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
    enabled: !!user,
  });

  // Connect to WebSocket server
  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
      
      const ws = new WebSocket(wsUrl);
      socket.current = ws;

      ws.onopen = () => {
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

  return (
    <ChatContext.Provider value={{
      contacts,
      messages,
      selectedContact,
      selectContact,
      sendMessage,
      isLoading,
      isConnected,
      markMessagesAsRead
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
