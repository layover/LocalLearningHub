import { MessageSquare, Users, Settings } from "lucide-react";
import { useState } from "react";

export default function MobileNavigation() {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'settings'>('chats');
  
  return (
    <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white shadow-lg z-10">
      <nav className="flex justify-around items-center h-16 px-4">
        <button 
          className={`flex flex-col items-center justify-center ${activeTab === 'chats' ? 'text-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('chats')}
        >
          <MessageSquare className="h-6 w-6" />
          <span className="text-xs mt-1">聊天</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center ${activeTab === 'contacts' ? 'text-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('contacts')}
        >
          <Users className="h-6 w-6" />
          <span className="text-xs mt-1">联系人</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center ${activeTab === 'settings' ? 'text-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-6 w-6" />
          <span className="text-xs mt-1">设置</span>
        </button>
      </nav>
    </div>
  );
}
