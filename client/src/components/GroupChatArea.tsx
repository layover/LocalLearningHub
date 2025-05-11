import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { 
  Send, 
  Loader2, 
  Info, 
  UserPlus,
  Settings,
  Users,
  Trash2,
  X,
  Paperclip,
  File as FileIcon,
  ImageIcon,
  FileAudio,
  FileVideo
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Group, User, Message, Contact, GroupMember } from "@/types";
import GroupMemberList from "@/components/GroupMemberList";

export default function GroupChatArea() {
  const { user } = useAuth();
  const { selectedGroup, selectGroup, contacts, sendGroupMessage: chatSendGroupMessage } = useChat();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [potentialMembers, setPotentialMembers] = useState<Contact['contact'][]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [showMemberList, setShowMemberList] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // 检查当前用户是否是该群组的管理员
  const [isAdmin, setIsAdmin] = useState(false);
  
  // 获取群组消息
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<Message[]>({
    queryKey: [`/api/groups/${selectedGroup?.id}/messages`],
    queryFn: async () => {
      if (!selectedGroup) return [];
      const response = await fetch(`/api/groups/${selectedGroup.id}/messages`);
      if (!response.ok) throw new Error("获取群组消息失败");
      return await response.json();
    },
    enabled: !!selectedGroup,
    refetchInterval: 3000 // 每3秒刷新一次
  });
  
  // 获取群组成员
  const { data: membersData = [], isLoading: isLoadingMembers } = useQuery<{member: GroupMember, user: User}[]>({
    queryKey: [`/api/groups/${selectedGroup?.id}/members`],
    queryFn: async () => {
      if (!selectedGroup) return [];
      const response = await fetch(`/api/groups/${selectedGroup.id}/members`);
      if (!response.ok) throw new Error("获取群组成员失败");
      return await response.json();
    },
    enabled: !!selectedGroup
  });
  
  // 获取所有可能的成员(联系人中尚未加入群组的人)
  useEffect(() => {
    if (!selectedGroup || !contacts.length) return;
    
    // 获取当前组中所有用户的ID
    const currentMemberIds = membersData.map(m => m.user.id);
    
    // 找出不在当前组中的联系人
    const availableContacts = contacts
      .map(c => c.contact)
      .filter(contact => !currentMemberIds.includes(contact.id));
    
    setPotentialMembers(availableContacts);
  }, [selectedGroup, contacts, membersData]);
  
  // 检查当前用户是否是管理员
  useEffect(() => {
    if (!selectedGroup || !user || !membersData.length) return;
    
    const currentUserMember = membersData.find(m => m.user.id === user.id);
    if (currentUserMember) {
      // 使用字符串比较，避免类型问题
      const memberRole = String(currentUserMember.member.role);
      setIsAdmin(memberRole === 'admin' || memberRole === 'owner');
    }
  }, [selectedGroup, user, membersData]);
  
  // 文件处理函数
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  
  // 获取附件图标
  const getAttachmentIcon = (fileType?: string | null) => {
    if (!fileType) return <FileIcon className="h-5 w-5" />;
    
    if (fileType.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5 text-blue-500" />;
    } else if (fileType.startsWith('audio/')) {
      return <FileAudio className="h-5 w-5 text-purple-500" />;
    } else if (fileType.startsWith('video/')) {
      return <FileVideo className="h-5 w-5 text-red-500" />;
    } else if (fileType.includes('pdf')) {
      return <FileIcon className="h-5 w-5 text-red-500" />;
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return <FileIcon className="h-5 w-5 text-blue-500" />;
    } else if (fileType.includes('excel') || fileType.includes('sheet')) {
      return <FileIcon className="h-5 w-5 text-green-500" />;
    } else {
      return <FileIcon className="h-5 w-5 text-gray-500" />;
    }
  };
  
  // 获取文件类型的友好显示
  const getFileTypeLabel = (fileType: string): string => {
    const typeParts = fileType.split('/');
    if (typeParts.length > 1) {
      const mainType = typeParts[0];
      const subType = typeParts[1].toUpperCase();
      
      switch (mainType) {
        case 'image':
          return `图片 (${subType})`;
        case 'audio':
          return `音频 (${subType})`;
        case 'video':
          return `视频 (${subType})`;
        case 'application':
          if (subType === 'PDF') return '文档 (PDF)';
          else if (subType.includes('WORD')) return '文档 (WORD)';
          else if (subType.includes('EXCEL')) return '表格 (EXCEL)';
          else return `文件 (${subType})`;
        default:
          return `${mainType} (${subType})`;
      }
    }
    return fileType;
  };
  
  // 消息滚动到底部
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages]);
  
  // 按日期分组消息
  const groupedMessages = messages.reduce((groups: any, message) => {
    const date = new Date(message.createdAt).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});
  
  const groupedMessageArray = Object.keys(groupedMessages).map(date => ({
    date,
    messages: groupedMessages[date]
  }));
  
  // 发送消息
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!message.trim() && !selectedFile) || !selectedGroup || !user) return;
    
    setIsSending(true);
    
    try {
      // 处理文件上传
      let fileUrl = null;
      let fileType = null;
      let fileName = null;
      
      if (selectedFile) {
        setFileUploading(true);
        
        // 创建FormData对象来上传文件
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("groupId", selectedGroup.id.toString());
        
        // 上传文件
        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadResponse.ok) {
          throw new Error("文件上传失败");
        }
        
        const uploadResult = await uploadResponse.json();
        fileUrl = uploadResult.fileUrl;
        fileType = selectedFile.type;
        fileName = selectedFile.name;
        
        setFileUploading(false);
      }
      
      // 构建消息内容
      const messageContent = message.trim();
      
      // 发送消息
      if (chatSendGroupMessage) {
        // 使用钩子中的方法发送消息，同时传递文件信息
        await chatSendGroupMessage(
          messageContent || "发送了一个文件", 
          selectedGroup.id,
          fileUrl || undefined,
          fileType || undefined,
          fileName || undefined
        );
      } else {
        // 后备方法：直接使用API发送消息
        const response = await fetch(`/api/groups/${selectedGroup.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: messageContent || "发送了一个文件",
            senderId: user.id,
            groupId: selectedGroup.id,
            fileUrl,
            fileType,
            fileName,
            messageType: fileUrl ? 'file' : 'text'
          })
        });
        
        if (!response.ok) {
          throw new Error("发送群组消息失败");
        }
        
        // 刷新消息列表
        queryClient.invalidateQueries({ queryKey: [`/api/groups/${selectedGroup.id}/messages`] });
      }
      
      // 清空输入和文件选择
      setMessage("");
      setSelectedFile(null);
      
    } catch (error: any) {
      toast({
        title: "发送失败",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
      setFileUploading(false);
    }
  };
  
  // 添加新成员
  const addMembers = async () => {
    if (!selectedGroup || selectedMembers.length === 0) return;
    
    try {
      const addMemberPromises = selectedMembers.map(memberId => 
        fetch(`/api/groups/${selectedGroup.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ memberId })
        })
      );
      
      await Promise.all(addMemberPromises);
      
      toast({
        title: "成功",
        description: `已添加 ${selectedMembers.length} 位新成员`
      });
      
      // 刷新成员列表
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${selectedGroup.id}/members`] });
      
      // 重置并关闭对话框
      setSelectedMembers([]);
      setIsAddMemberOpen(false);
    } catch (error: any) {
      toast({
        title: "添加成员失败",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  
  // 移除成员
  const removeMember = async (memberId: number) => {
    if (!selectedGroup) return;
    
    try {
      const response = await fetch(`/api/groups/${selectedGroup.id}/members/${memberId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error("移除成员失败");
      }
      
      toast({
        title: "成功",
        description: "成员已移除"
      });
      
      // 刷新成员列表
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${selectedGroup.id}/members`] });
    } catch (error: any) {
      toast({
        title: "移除成员失败", 
        description: error.message,
        variant: "destructive"
      });
    }
  };
  
  // 离开群组
  const leaveGroup = async () => {
    if (!selectedGroup || !user) return;
    
    try {
      await removeMember(user.id);
      
      // 刷新群组列表
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
      
      // 取消选择当前群组
      selectGroup(null);
      
      toast({
        title: "已离开群组",
        description: `您已成功退出 "${selectedGroup.name}"`
      });
    } catch (error: any) {
      toast({
        title: "退出群组失败",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  
  // 删除群组
  const deleteGroup = async () => {
    if (!selectedGroup || !isAdmin) return;
    
    try {
      const response = await fetch(`/api/groups/${selectedGroup.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error("删除群组失败");
      }
      
      // 刷新群组列表
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
      
      // 取消选择当前群组
      selectGroup(null);
      
      toast({
        title: "成功",
        description: `群组 "${selectedGroup.name}" 已删除`
      });
    } catch (error: any) {
      toast({
        title: "删除群组失败",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  
  // 切换选择成员
  const toggleSelectMember = (memberId: number) => {
    setSelectedMembers(prev => 
      prev.includes(memberId) 
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };
  
  if (!selectedGroup) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <Users className="h-16 w-16 mb-4 text-primary/60" />
        <h2 className="text-xl font-bold mb-2">选择一个群组开始聊天</h2>
        <p className="text-muted-foreground text-center max-w-md">
          在左侧选择一个现有群组，或创建一个新的群组开始聊天
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex h-full relative">
      {/* 主聊天区域 */}
      <div className="flex flex-col flex-1 h-full">
        {/* 群组标题栏 */}
        <div className="border-b p-3 flex justify-between items-center">
          <div className="flex items-center">
            <Avatar className="h-10 w-10 mr-3">
              <AvatarFallback>
                <Users className="h-6 w-6" />
              </AvatarFallback>
              {selectedGroup.avatar && (
                <AvatarImage 
                  src={selectedGroup.avatar} 
                  alt={selectedGroup.name} 
                />
              )}
            </Avatar>
            <div>
              <div className="font-bold">{selectedGroup.name}</div>
              <div className="text-xs text-muted-foreground flex items-center">
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-xs text-muted-foreground" 
                  onClick={() => setShowMemberList(!showMemberList)}
                >
                  {membersData.length} 位成员
                  {membersData.filter(m => m.user.isOnline).length > 0 && (
                    <span className="ml-1 text-green-500">
                      ({membersData.filter(m => m.user.isOnline).length} 在线)
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <Button 
              variant="outline" 
              size="sm" 
              className="mr-2"
              onClick={() => setShowMemberList(!showMemberList)}
            >
              {showMemberList ? <X className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">
                {showMemberList ? "隐藏成员" : "显示成员"}
              </span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>群组选项</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      添加成员
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>添加群组成员</DialogTitle>
                      <DialogDescription>
                        从您的联系人中选择要添加到群组的成员
                      </DialogDescription>
                    </DialogHeader>
                    {potentialMembers.length === 0 ? (
                      <div className="py-6 text-center text-muted-foreground">
                        <UserPlus className="mx-auto h-10 w-10 mb-2" />
                        <p>没有可添加的联系人</p>
                        <p className="text-xs mt-1">您的所有联系人已经在这个群组中</p>
                      </div>
                    ) : (
                      <div className="py-4">
                        <div className="max-h-[200px] overflow-y-auto space-y-2">
                          {potentialMembers.map(contact => (
                            <div key={contact.id} className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md">
                              <Checkbox
                                id={`member-${contact.id}`}
                                checked={selectedMembers.includes(contact.id)}
                                onCheckedChange={() => toggleSelectMember(contact.id)}
                              />
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{contact.displayName[0]}</AvatarFallback>
                                {contact.avatar && <AvatarImage src={contact.avatar} />}
                              </Avatar>
                              <label
                                htmlFor={`member-${contact.id}`}
                                className="flex-1 cursor-pointer"
                              >
                                {contact.displayName}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <DialogFooter>
                      <Button
                        onClick={addMembers}
                        disabled={selectedMembers.length === 0}
                      >
                        添加所选成员
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <DropdownMenuItem>
                  <Info className="mr-2 h-4 w-4" />
                  查看群组信息
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem 
                      className="text-red-500 focus:text-red-500" 
                      onSelect={e => e.preventDefault()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isAdmin ? "删除群组" : "退出群组"}
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {isAdmin ? "删除群组" : "退出群组"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {isAdmin 
                          ? "确定要删除这个群组吗？此操作无法撤销，所有群组数据将被永久删除。" 
                          : "确定要退出这个群组吗？您需要被邀请才能重新加入。"}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={isAdmin ? deleteGroup : leaveGroup}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {isAdmin ? "删除" : "退出"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* 消息区域 */}
        <ScrollArea className="flex-1 p-4" ref={messageContainerRef}>
          {isLoadingMessages ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Users className="h-12 w-12 mb-2" />
              <p className="font-medium">群组聊天已创建</p>
              <p className="text-sm">发送第一条消息开始对话</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedMessageArray.map((group, i) => (
                <div key={i} className="space-y-4">
                  <div className="relative flex justify-center">
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded">
                      {format(new Date(group.date), 'yyyy年MM月dd日')}
                    </span>
                  </div>
                  
                  {group.messages.map((msg: Message) => {
                    // 找到发送者信息
                    const sender = membersData.find(m => m.user.id === msg.senderId)?.user;
                    const isOwnMessage = msg.senderId === user?.id;
                    
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} max-w-[80%]`}>
                          {!isOwnMessage && (
                            <Avatar className="h-8 w-8 mt-1 mx-2">
                              <AvatarFallback>
                                {sender?.displayName?.charAt(0) || '?'}
                              </AvatarFallback>
                              {sender?.avatar && <AvatarImage src={sender.avatar} />}
                            </Avatar>
                          )}
                          
                          <div>
                            {!isOwnMessage && (
                              <div className="text-xs text-muted-foreground ml-1 mb-1">
                                {sender?.displayName || '未知用户'}
                              </div>
                            )}
                            <div className={`${
                              isOwnMessage 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted'
                            } p-3 rounded-lg`}>
                              {/* 显示消息内容 */}
                              {msg.content && <div className="mb-2">{msg.content}</div>}
                              
                              {/* 显示文件附件 */}
                              {msg.fileUrl && (
                                <div className="mt-1">
                                  {msg.fileType?.startsWith('image/') ? (
                                    // 图片文件直接显示
                                    <div className="mt-2">
                                      <img 
                                        src={msg.fileUrl} 
                                        alt={msg.fileName || "图片"}
                                        className="max-w-full rounded-md max-h-[200px] object-contain"
                                      />
                                    </div>
                                  ) : (
                                    // 其他文件显示为链接
                                    <a 
                                      href={msg.fileUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 p-2 bg-background rounded-md"
                                    >
                                      {getAttachmentIcon(msg.fileType)}
                                      <div className="flex-1 truncate">
                                        <div className="text-sm font-medium">{msg.fileName || "文件下载"}</div>
                                        {msg.fileType && (
                                          <div className="text-xs text-muted-foreground">
                                            {getFileTypeLabel(msg.fileType)}
                                          </div>
                                        )}
                                      </div>
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className={`text-xs text-muted-foreground mt-1 ${
                              isOwnMessage ? 'text-right' : 'text-left'
                            }`}>
                              {format(new Date(msg.createdAt), 'HH:mm')}
                            </div>
                          </div>
                          
                          {isOwnMessage && (
                            <Avatar className="h-8 w-8 mt-1 mx-2">
                              <AvatarFallback>
                                {user?.displayName?.charAt(0) || '?'}
                              </AvatarFallback>
                              {user?.avatar && <AvatarImage src={user.avatar} />}
                            </Avatar>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        {/* 输入区域 */}
        <form onSubmit={handleSendMessage} className="p-4 border-t">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="输入消息..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full pr-10"
              />
              <label htmlFor="file-upload-group" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground">
                <Paperclip className="h-5 w-5" />
              </label>
              <input 
                id="file-upload-group" 
                type="file" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </div>
            <Button type="submit" disabled={(!message.trim() && !selectedFile) || isSending || fileUploading}>
              {isSending || fileUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {/* 附件预览区域 */}
          {selectedFile && (
            <div className="mt-2 p-2 bg-muted rounded-md flex items-center gap-2">
              <div className="flex-1 truncate">
                {getFileIcon(selectedFile.type)}
                <span className="text-sm">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  ({formatFileSize(selectedFile.size)})
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSelectedFile(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </form>
      </div>
      
      {/* 成员列表侧边栏 */}
      {showMemberList && selectedGroup && (
        <div className="w-[280px] border-l h-full">
          <GroupMemberList groupId={selectedGroup.id} />
        </div>
      )}
    </div>
  );
}