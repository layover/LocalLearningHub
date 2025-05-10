import { useEffect, useState } from "react";
import ContactsSidebar from "@/components/ContactsSidebar";
import ChatArea from "@/components/ChatArea";
import GroupChatSidebar from "@/components/GroupChatSidebar";
import GroupChatArea from "@/components/GroupChatArea";
import UserProfile from "@/components/UserProfile";
import MobileNavigation from "@/components/MobileNavigation";
import { ChatProvider, useChat } from "@/hooks/use-chat";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Users } from "lucide-react";

// 聊天界面内容组件
function ChatContent() {
  const { selectedContact, selectedGroup } = useChat();
  const [chatTab, setChatTab] = useState<"direct" | "group">("direct");
  
  // 当用户点击联系人或群组时，自动切换标签
  useEffect(() => {
    if (selectedContact) {
      setChatTab("direct");
    } else if (selectedGroup) {
      setChatTab("group");
    }
  }, [selectedContact, selectedGroup]);
  
  return (
    <div className="bg-background h-screen overflow-hidden">
      <div className="flex flex-col h-screen sm:pt-0 pb-16 sm:pb-0">
        {/* 标签切换 */}
        <div className="border-b px-4 py-2 flex justify-center">
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
