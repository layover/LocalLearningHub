import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Menu, Phone, Video, Paperclip, Send, FileIcon, ImageIcon, FileAudio, FileVideo } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function ChatArea() {
  const { user } = useAuth();
  const { selectedContact, messages, sendMessage, markMessagesAsRead } = useChat();
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
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
  
  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 检查文件大小
      if (file.size > 10 * 1024 * 1024) { // 10MB限制
        toast({
          title: "文件过大",
          description: "请选择小于10MB的文件",
          variant: "destructive"
        });
        return;
      }
      
      setSelectedFile(file);
      
      // 清空input，允许相同文件再次选择
      e.target.value = '';
    }
  };
  
  // 取消选择文件
  const handleCancelFile = () => {
    setSelectedFile(null);
  };
  
  // 获取文件类型对应的图标
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <ImageIcon className="h-4 w-4 inline-block mr-2" />;
    } else if (fileType.startsWith('audio/')) {
      return <FileAudio className="h-4 w-4 inline-block mr-2" />;
    } else if (fileType.startsWith('video/')) {
      return <FileVideo className="h-4 w-4 inline-block mr-2" />;
    } else {
      return <FileIcon className="h-4 w-4 inline-block mr-2" />;
    }
  };
  
  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
  };
  
  // 获取文件类型标签
  const getFileTypeLabel = (fileType: string): string => {
    if (fileType.startsWith('image/')) {
      return `图片 ${fileType.replace('image/', '')}`;
    } else if (fileType.startsWith('audio/')) {
      return `音频 ${fileType.replace('audio/', '')}`;
    } else if (fileType.startsWith('video/')) {
      return `视频 ${fileType.replace('video/', '')}`;
    } else {
      return `文件 ${fileType.split('/').pop() || fileType}`;
    }
  };
  
  // 打开文件选择对话框
  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  // Handle sending a new message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedContact) return;
    
    try {
      // 如果有选择文件，先上传文件
      if (selectedFile) {
        setFileUploading(true);
        
        // 创建FormData对象来上传文件
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("contactId", selectedContact.contact.id.toString());
        
        console.log("开始上传文件:", selectedFile.name, "大小:", selectedFile.size);
        
        // 上传文件
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        console.log("文件上传响应状态:", uploadResponse.status);
        const responseText = await uploadResponse.text();
        console.log("文件上传响应内容:", responseText);
        
        if (!uploadResponse.ok) {
          throw new Error(`文件上传失败: ${responseText}`);
        }
        
        // 将响应文本解析为JSON
        const fileData = JSON.parse(responseText);
        
        // 发送带有文件信息的消息
        sendMessage(newMessage || "发送了一个文件", fileData.fileUrl, selectedFile.type, selectedFile.name);
        
        // 重置状态
        setSelectedFile(null);
        setFileUploading(false);
      } else {
        // 发送普通文本消息
        sendMessage(newMessage);
      }
      
      setNewMessage("");
    } catch (error) {
      console.error("发送消息失败", error);
      setFileUploading(false);
      toast({
        title: "发送失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive"
      });
    }
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
              
              // 调试日志，输出消息详细信息
              console.log("渲染消息:", message.id, "文件URL:", message.fileUrl, "文件类型:", message.fileType, "消息类型:", message.messageType);
              
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
                      {/* 根据消息类型显示不同内容 */}
                      {message.messageType === 'file' ? (
                        <>
                          <p className="text-sm mb-1">{message.content}</p>
                          {(() => {
                            console.log("渲染文件类型消息:", {
                              id: message.id,
                              type: message.messageType,
                              fileUrl: message.fileUrl,
                              fileType: message.fileType,
                              fileName: message.fileName
                            });
                            return null;
                          })()}
                          
                          {message.fileUrl ? (
                            <div className="mt-2">
                              {message.fileType?.startsWith('image/') ? (
                                // 图片预览
                                <a 
                                  href={message.fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img 
                                    src={message.fileUrl} 
                                    alt={message.fileName || "图片附件"} 
                                    className="max-w-full max-h-48 rounded-md cursor-pointer hover:opacity-90"
                                  />
                                </a>
                              ) : (
                                // 其他文件类型
                                <a 
                                  href={message.fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center p-2 border rounded-md bg-gray-50 hover:bg-gray-100"
                                >
                                  {message.fileType && getFileIcon(message.fileType)}
                                  <div className="flex-1 truncate">
                                    <div className="text-sm font-medium">{message.fileName || "文件下载"}</div>
                                    {message.fileType && (
                                      <div className="text-xs text-muted-foreground">
                                        {getFileTypeLabel(message.fileType)}
                                      </div>
                                    )}
                                  </div>
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-red-500">
                              [文件附件丢失 - 无法显示]
                            </div>
                          )}
                        </>
                      ) : (
                        // 普通文本消息
                        <p className="text-sm">{message.content}</p>
                      )}
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
        {/* 文件预览 */}
        {selectedFile && (
          <div className="mb-3 p-3 border border-gray-200 rounded-md bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {getFileIcon(selectedFile.type)}
                <div className="ml-2">
                  <p className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={handleCancelFile}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSendMessage} className="flex items-center">
          {/* 隐藏的文件输入 */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* 文件附件按钮 */}
          <button 
            type="button" 
            onClick={openFileSelector}
            className="text-gray-500 hover:text-gray-700 mr-3"
            disabled={fileUploading}
          >
            <Paperclip className="h-6 w-6" />
          </button>
          
          {/* 消息输入框 */}
          <input 
            type="text" 
            placeholder={selectedFile ? "添加消息(可选)..." : "输入消息..."} 
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={fileUploading}
          />
          
          {/* 发送按钮 */}
          <button 
            type="submit" 
            className="bg-primary hover:bg-indigo-700 text-white rounded-full p-2 ml-3"
            disabled={(fileUploading || (!newMessage.trim() && !selectedFile))}
          >
            {fileUploading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
