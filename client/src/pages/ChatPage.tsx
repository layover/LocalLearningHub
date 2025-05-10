import { useEffect } from "react";
import ContactsSidebar from "@/components/ContactsSidebar";
import ChatArea from "@/components/ChatArea";
import UserProfile from "@/components/UserProfile";
import MobileNavigation from "@/components/MobileNavigation";
import { ChatProvider } from "@/hooks/use-chat";

export default function ChatPage() {
  // Set page title
  useEffect(() => {
    document.title = "聊天 | 即时通讯应用";
  }, []);

  return (
    <ChatProvider>
      <div className="bg-gray-100 h-screen overflow-hidden">
        <div className="flex h-screen sm:pt-0 pb-16 sm:pb-0">
          <ContactsSidebar />
          <ChatArea />
          <UserProfile />
        </div>
        <MobileNavigation />
      </div>
    </ChatProvider>
  );
}
