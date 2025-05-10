import { useEffect, useState } from "react";
import ContactsSidebar from "@/components/ContactsSidebar";
import ChatArea from "@/components/ChatArea";
import GroupChatSidebar from "@/components/GroupChatSidebar";
import GroupChatArea from "@/components/GroupChatArea";
import UserProfile from "@/components/UserProfile";
import MobileNavigation from "@/components/MobileNavigation";
import { ChatProvider, useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, 
  Users, 
  LogOut,
  UserCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 聊天界面内容组件
function ChatContent() {
  const { selectedContact, selectedGroup } = useChat();
  const { user, logoutMutation } = useAuth();
  const [chatTab, setChatTab] = useState<"direct" | "group">("direct");
  
  // 当用户点击联系人或群组时，自动切换标签
  useEffect(() => {
    if (selectedContact) {
      setChatTab("direct");
    } else if (selectedGroup) {
      setChatTab("group");
    }
  }, [selectedContact, selectedGroup]);
  
  // 处理用户登出
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <div className="bg-background h-screen overflow-hidden">
      <div className="flex flex-col h-screen sm:pt-0 pb-16 sm:pb-0">
        {/* 标签切换和用户信息 */}
        <div className="border-b px-4 py-2 flex justify-between items-center">
          <Tabs value={chatTab} onValueChange={(value) => setChatTab(value as "direct" | "group")}>
            <TabsList>
              <TabsTrigger value="direct" className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" />
                私聊
              </TabsTrigger>
              <TabsTrigger value="group" className="flex items-center">
                <Users className="h-4 w-4 mr-2" />
                群聊
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          {/* 用户信息和登出按钮 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full">
                {user?.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.displayName}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <UserCircle className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                  {user?.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt={user.displayName}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    user?.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-medium">{user?.displayName}</div>
                  <div className="text-xs text-muted-foreground">@{user?.username}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600 cursor-pointer"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>登出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* 内容区域 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 联系人和群组侧边栏 */}
          <div className="w-[300px] h-full border-r">
            {chatTab === "direct" ? <ContactsSidebar /> : <GroupChatSidebar />}
          </div>
          
          {/* 聊天区域 */}
          <div className="flex-1 h-full">
            {chatTab === "direct" ? <ChatArea /> : <GroupChatArea />}
          </div>
          
          {/* 用户资料 */}
          {chatTab === "direct" && <UserProfile />}
        </div>
        
        {/* 移动导航 */}
        <MobileNavigation />
      </div>
    </div>
  );
}

export default function ChatPage() {
  // Set page title
  useEffect(() => {
    document.title = "聊天 | 即时通讯应用";
  }, []);

  return (
    <ChatProvider>
      <ChatContent />
    </ChatProvider>
  );
}
