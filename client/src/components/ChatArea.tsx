import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Menu, Phone, Video, Paperclip, Send } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export default function ChatArea() {
  const { user } = useAuth();
  const { selectedContact, messages, sendMessage, markMessagesAsRead } = useChat();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  
  // Get messages for selected contact
  const contactMessages = selectedContact 
    ? messages[selectedContact.contact.id] || []
    : [];
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [contactMessages]);
  
  // Mark messages as read when scrolling or when component is mounted
  useEffect(() => {
    if (!selectedContact) return;
    
    const handleScroll = () => {
      markMessagesAsRead(selectedContact.contact.id);
    };
    
    const messagesContainer = chatMessagesRef.current;
    if (messagesContainer) {
      messagesContainer.addEventListener("scroll", handleScroll);
      
      // Also mark as read when component mounts
      markMessagesAsRead(selectedContact.contact.id);
    }
    
    return () => {
      if (messagesContainer) {
        messagesContainer.removeEventListener("scroll", handleScroll);
      }
    };
  }, [selectedContact, markMessagesAsRead]);
  
  // Handle sending a new message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact) return;
    
    sendMessage(newMessage);
    setNewMessage("");
  };
  
  // Group messages by date
  type MessageGroup = {
    date: string;
    messages: typeof contactMessages;
  };
  
  const groupedMessages: MessageGroup[] = [];
  
  contactMessages.forEach(message => {
    const messageDate = typeof message.createdAt === 'string' 
      ? new Date(message.createdAt) 
      : message.createdAt;
    
    const dateStr = format(messageDate, 'yyyy-MM-dd');
    const existingGroup = groupedMessages.find(g => g.date === dateStr);
    
    if (existingGroup) {
      existingGroup.messages.push(message);
    } else {
      groupedMessages.push({
        date: dateStr,
        messages: [message]
      });
    }
  });
  
  // Format date for display
  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return '今天';
    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return '昨天';
    } else {
      return format(date, 'yyyy年MM月dd日', { locale: zhCN });
    }
  };
  
  // Format time for message
  const formatMessageTime = (date: Date | string) => {
    const messageDate = typeof date === 'string' ? new Date(date) : date;
    return format(messageDate, 'HH:mm');
  };
  
  // Show empty state if no contact is selected
  if (!selectedContact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h3 className="text-xl font-medium text-gray-700 mb-2">选择一个联系人开始聊天</h3>
          <p className="text-gray-500">从左侧的联系人列表中选择一个联系人来开始或继续对话。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Chat header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center">
          <button className="sm:hidden mr-2 text-gray-500">
            <Menu className="h-6 w-6" />
          </button>
          <div className="relative">
            <img 
              src={selectedContact.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedContact.contact.displayName)}&background=random`} 
              alt={selectedContact.contact.displayName} 
              className="h-10 w-10 rounded-full object-cover"
            />
            <span className={`status-indicator ${selectedContact.contact.isOnline ? 'status-online' : 'status-offline'} absolute bottom-0 right-0 border-2 border-white`}></span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">{selectedContact.contact.displayName}</p>
            <p className="text-xs text-gray-500">
              {selectedContact.contact.isOnline 
                ? '在线' 
                : selectedContact.contact.lastSeen 
                  ? `最近登录：${formatMessageTime(selectedContact.contact.lastSeen)}`
                  : '离线'}
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <button className="text-gray-500 hover:text-gray-700 mx-2">
            <Phone className="h-5 w-5" />
          </button>
          <button className="text-gray-500 hover:text-gray-700 mx-2">
            <Video className="h-5 w-5" />
          </button>
          <button className="text-gray-500 hover:text-gray-700 mx-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Messages container */}
      <div 
        className="flex-1 p-4 overflow-y-auto no-scrollbar bg-gray-50" 
        id="chat-messages"
        ref={chatMessagesRef}
      >
        {groupedMessages.map((group, groupIndex) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="flex justify-center mb-4">
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-4 py-1 rounded-full">
                {formatMessageDate(group.date)}
              </span>
            </div>
            
            {/* Messages */}
            {group.messages.map((message, messageIndex) => {
              const isSentByMe = message.senderId === user?.id;
              
              return (
                <div 
                  key={message.id} 
                  className={`flex mb-4 ${isSentByMe ? 'justify-end' : ''}`}
                >
                  {!isSentByMe && (
                    <div className="flex-shrink-0 mr-3">
                      <img 
                        src={selectedContact.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedContact.contact.displayName)}&background=random`} 
                        alt={selectedContact.contact.displayName} 
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    </div>
                  )}
                  <div>
                    <div 
                      className={`${
                        isSentByMe ? 'chat-bubble-sent' : 'chat-bubble-received'
                      } px-4 py-2 max-w-xs sm:max-w-md`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                    <div className={`flex items-center ${isSentByMe ? 'justify-end' : ''} mt-1`}>
                      <p className="text-xs text-gray-500">{formatMessageTime(message.createdAt)}</p>
                      {isSentByMe && (
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${message.read ? 'text-blue-500' : 'text-gray-400'} ml-1`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <form onSubmit={handleSendMessage} className="flex items-center">
          <button type="button" className="text-gray-500 hover:text-gray-700 mr-3">
            <Paperclip className="h-6 w-6" />
          </button>
          <input 
            type="text" 
            placeholder="输入消息..." 
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button 
            type="submit" 
            className="bg-primary hover:bg-indigo-700 text-white rounded-full p-2 ml-3"
            disabled={!newMessage.trim()}
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
