import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { Contact, Message, User, WebSocketMessage, Group, FriendRequest } from "@/types";
import { useToast } from "./use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ChatContextType {
  contacts: Contact[];
  messages: Record<number, Message[]>;
  groupMessages: Record<number, Message[]>;
  selectedContact: Contact | null;
  selectedGroup: Group | null;
  selectContact: (contact: Contact) => void;
  selectGroup: (group: Group | null) => void;
  sendMessage: (content: string, fileUrl?: string, fileType?: string, fileName?: string) => void;
  sendGroupMessage: (content: string, groupId: number, fileUrl?: string, fileType?: string, fileName?: string) => void;
  isLoading: boolean;
  isConnected: boolean;
  markMessagesAsRead: (contactId: number) => void;
  pendingFriendRequests: FriendRequest[];
  respondToFriendRequest: (requestId: number, status: 'accepted' | 'rejected') => void;
  userGroups: Group[];
  isLoadingGroups: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Record<number, Message[]>>({});
  const [groupMessages, setGroupMessages] = useState<Record<number, Message[]>>({});
  // 已移除pendingFriendRequests状态，直接使用friendRequests

  // Fetch contacts for the current user
  const { data: contacts = [], isLoading, refetch: refetchContacts } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
    enabled: !!user,
    refetchInterval: 15000, // 每15秒刷新一次联系人列表
  });
  
  // 获取用户所在的群组
  const { data: userGroups = [], isLoading: isLoadingGroups } = useQuery<Group[]>({
    queryKey: ['/api/groups'],
    enabled: !!user,
    refetchInterval: 30000, // 每30秒刷新一次
  });
  
  // Fetch pending friend requests
  const { data: friendRequests = [] } = useQuery({
    queryKey: ['/api/friend-requests/pending'],
    enabled: !!user,
    refetchInterval: 10000, // 每10秒自动刷新一次
  });
  
  // 注释：已移除pendingFriendRequests相关useEffect以避免循环更新
  // 直接使用friendRequests而不是维护单独的pendingFriendRequests状态

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
                  createdAt: data.message.createdAt // 保持字符串格式
                };

                // 处理群组消息
                if (message.messageType === 'group' && message.groupId) {
                  // 更新群组消息
                  setGroupMessages(prev => {
                    const groupId = message.groupId as number;
                    const groupMessages = [...(prev[groupId] || []), message];
                    return {
                      ...prev,
                      [groupId]: groupMessages.sort((a, b) => 
                        // 使用字符串比较而不是转换为Date对象
                        a.createdAt.localeCompare(b.createdAt)
                      )
                    };
                  });
                  
                  // 播放消息提示音或显示通知
                  if (message.senderId !== user.id) {
                    // 通知用户有新的群组消息
                    const group = userGroups.find(g => g.id === message.groupId);
                    if (group && (!selectedGroup || selectedGroup.id !== group.id)) {
                      toast({
                        title: `${group.name} 有新消息`,
                        description: message.content.length > 30 
                          ? message.content.substring(0, 30) + '...' 
                          : message.content
                      });
                    }
                  }
                } else {
                  // 更新私聊消息
                  setMessages(prev => {
                    const contactId = message.senderId === user.id 
                      ? message.receiverId 
                      : message.senderId;
                      
                    const contactMessages = [...(prev[contactId as number] || []), message];
                    return {
                      ...prev,
                      [contactId as number]: contactMessages.sort((a, b) => 
                        // 使用字符串比较而不是转换为Date对象
                        a.createdAt.localeCompare(b.createdAt)
                      )
                    };
                  });

                  // Invalidate contacts query to update unread counts
                  queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
                }
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
                
                // 预设一个默认的发送者名称
                let senderName = "用户";
                
                // 通过senderId获取用户信息，以确保类型安全
                try {
                  const senderId = data.request.senderId;
                  // 这里可以直接获取所有用户列表然后查找，或者添加一个API来获取指定ID的用户
                  console.log(`尝试通过senderId=${senderId}获取发送者信息`);
                  
                  // 创建一个方法来安全地显示好友请求通知，不依赖sender字段
                  // 实际应用中应从API获取用户信息，这里简化处理
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
              
            // 群组相关WebSocket消息处理
            case 'group_membership_change':
              // 刷新群组列表
              queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
              
              // 如果当前正在查看这个群组，刷新成员列表
              if (selectedGroup && data.groupId === selectedGroup.id) {
                queryClient.invalidateQueries({ queryKey: [`/api/groups/${data.groupId}/members`] });
              }
              
              // 根据操作类型显示不同的通知
              switch (data.action) {
                case 'added':
                  if (data.userId === user.id) {
                    toast({
                      title: "您已被添加到群组",
                      description: "刷新群组列表以查看",
                    });
                  }
                  break;
                  
                case 'removed':
                  if (data.userId === user.id) {
                    toast({
                      title: "您已被移出群组",
                      description: "您已不再是该群组的成员",
                    });
                    
                    // 如果当前正在查看这个群组，切换回无选择状态
                    if (selectedGroup && selectedGroup.id === data.groupId) {
                      setSelectedGroup(null);
                    }
                  }
                  break;
                  
                case 'role_changed':
                  if (data.userId === user.id) {
                    toast({
                      title: "您的群组角色已更改",
                      description: `您现在是 ${data.newRole === 'admin' ? '管理员' : '成员'}`,
                    });
                  }
                  break;
              }
              break;
              
            case 'group_updated':
              // 更新群组信息
              queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
              
              // 如果正在查看这个群组，更新当前选择的群组
              if (selectedGroup && data.group && selectedGroup.id === data.group.id) {
                setSelectedGroup(data.group);
              }
              break;
              
            case 'group_deleted':
              // 刷新群组列表
              queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
              
              // 如果当前正在查看这个群组，切换回无选择状态
              if (selectedGroup && selectedGroup.id === data.groupId) {
                setSelectedGroup(null);
                toast({
                  title: "群组已删除",
                  description: "此群组不再存在",
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
            // 保持createdAt为字符串类型，不转换为Date对象
            createdAt: msg.createdAt 
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
    // 取消选中群组
    setSelectedGroup(null);
    
    // 选择联系人
    setSelectedContact(contact);
    
    // Mark messages as read when selecting a contact
    if (contact.unreadCount > 0) {
      markMessagesAsRead(contact.contact.id);
    }
  }, []);
  
  // 选择群组聊天
  const selectGroup = useCallback((group: Group | null) => {
    // 取消选中联系人
    setSelectedContact(null);
    
    // 选择群组
    setSelectedGroup(group);
    
    // 如果选择了群组，获取该群组的消息
    if (group) {
      queryClient.prefetchQuery({
        queryKey: [`/api/groups/${group.id}/messages`],
        queryFn: async () => {
          const response = await fetch(`/api/groups/${group.id}/messages`);
          if (!response.ok) throw new Error("获取群组消息失败");
          return response.json();
        }
      });
      
      // 获取群组成员信息
      queryClient.prefetchQuery({
        queryKey: [`/api/groups/${group.id}/members`],
        queryFn: async () => {
          const response = await fetch(`/api/groups/${group.id}/members`);
          if (!response.ok) throw new Error("获取群组成员失败");
          return response.json();
        }
      });
    }
  }, [queryClient]);

  const sendMessage = useCallback((
    content: string, 
    fileUrl?: string, 
    fileType?: string, 
    fileName?: string
  ) => {
    if (!socket.current || !user || !selectedContact || !isConnected) {
      toast({
        title: "发送失败",
        description: "网络连接异常，请重试",
        variant: "destructive",
      });
      return;
    }
    
    // 确定消息类型
    const messageType = fileUrl ? 'file' : 'direct';
    
    const message: WebSocketMessage = {
      type: 'message',
      message: {
        id: 0, // Will be set by server
        senderId: user.id,
        receiverId: selectedContact.contact.id,
        content,
        createdAt: new Date().toISOString(),
        read: false,
        messageType,
        fileUrl,
        fileType,
        fileName
      }
    };
    
    socket.current.send(JSON.stringify(message));
  }, [socket, user, selectedContact, isConnected, toast]);
  
  // 发送群组消息
  const sendGroupMessage = useCallback((
    content: string, 
    groupId: number,
    fileUrl?: string, 
    fileType?: string, 
    fileName?: string
  ) => {
    if (!socket.current || !user || !isConnected) {
      toast({
        title: "发送失败",
        description: "网络连接异常，请重试",
        variant: "destructive",
      });
      return;
    }
    
    // 确定消息类型
    const messageType = fileUrl ? 'file' : 'group';
    
    const message: WebSocketMessage = {
      type: 'message',
      message: {
        id: 0, // Will be set by server
        senderId: user.id,
        receiverId: null,
        groupId,
        content,
        createdAt: new Date().toISOString(),
        read: true,
        messageType,
        fileUrl,
        fileType,
        fileName
      }
    };
    
    socket.current.send(JSON.stringify(message));
  }, [socket, user, isConnected, toast]);

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
      // 由于我们现在直接使用friendRequests，这个过滤操作不再需要
      // 响应后会自动通过API刷新数据
      
      // 强制重新获取好友请求列表
      queryClient.invalidateQueries({ queryKey: ['/api/friend-requests/pending'] });
      
      // 强制重新获取联系人列表并手动触发刷新
      if (status === 'accepted') {
        console.log("请求已接受，强制刷新联系人列表");
        queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
        
        // 手动触发联系人刷新
        setTimeout(() => {
          refetchContacts(); 
          console.log("已发起联系人列表手动刷新");
        }, 500);
      }
      
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
      groupMessages,
      selectedContact,
      selectedGroup,
      selectContact,
      selectGroup,
      sendMessage,
      sendGroupMessage,
      isLoading,
      isLoadingGroups,
      isConnected,
      markMessagesAsRead,
      pendingFriendRequests: (friendRequests || []) as FriendRequest[],
      respondToFriendRequest,
      userGroups
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
