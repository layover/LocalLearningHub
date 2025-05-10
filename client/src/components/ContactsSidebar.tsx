import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { Search, UserPlus, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useState } from "react";
import { AddContactDialog } from "./AddContactDialog";
import { Button } from "@/components/ui/button";

export default function ContactsSidebar() {
  const { user, logoutMutation } = useAuth();
  const { contacts, selectContact, selectedContact, pendingFriendRequests, respondToFriendRequest } = useChat();
  const [showAddContact, setShowAddContact] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter contacts by search query
  const filteredContacts = searchQuery.trim() 
    ? contacts.filter(c => 
        c.contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : contacts;
  
  // Separate online and offline contacts
  const onlineContacts = filteredContacts.filter(c => c.contact.isOnline);
  const offlineContacts = filteredContacts.filter(c => !c.contact.isOnline);
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  const formatLastSeen = (date: string | Date | undefined | null) => {
    if (!date) return "未知";
    
    try {
      const lastSeenDate = typeof date === 'string' ? new Date(date) : date;
      return formatDistanceToNow(lastSeenDate, { addSuffix: true, locale: zhCN });
    } catch (e) {
      return "未知";
    }
  };
  
  // Get last message time
  const getLastMessageTime = (contactId: number) => {
    // This would normally come from the last message timestamp
    // For now, we'll use the contact's last seen time
    const contact = contacts.find(c => c.contact.id === contactId);
    if (!contact || !contact.contact.lastSeen) return "";
    
    return formatLastSeen(contact.contact.lastSeen);
  };

  return (
    <div className="hidden sm:flex sm:flex-col w-64 bg-white border-r border-gray-200">
      {/* Search and profile header */}
      <div className="p-4 bg-primary">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-white">消息</h1>
          <button 
            className="text-white hover:text-gray-200"
            onClick={() => setShowAddContact(true)}
            title="添加联系人"
          >
            <UserPlus className="h-6 w-6" />
          </button>
        </div>
        <div className="flex items-center bg-indigo-700 rounded-full px-3 py-1">
          <Search className="h-5 w-5 text-indigo-200" />
          <input 
            type="search" 
            placeholder="搜索联系人..." 
            className="bg-transparent text-white placeholder-indigo-200 ml-2 outline-none text-sm w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      {/* Friend requests panel */}
      {pendingFriendRequests.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
            <UserPlus className="h-4 w-4 mr-1" />
            待处理好友请求 ({pendingFriendRequests.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {pendingFriendRequests.map((request: any) => (
              <div key={request.id} className="flex flex-col bg-white rounded-md p-2 shadow-sm border">
                <div className="flex items-center mb-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-2">
                    {request.sender.avatar ? (
                      <img src={request.sender.avatar} alt={request.sender.displayName} className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      request.sender.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate">{request.sender.displayName}</p>
                    <p className="text-xs text-gray-500 truncate">@{request.sender.username}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="flex-1"
                    onClick={() => {
                      console.log("接受好友请求:", request.id);
                      respondToFriendRequest(request.id, 'accepted');
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    接受
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      console.log("拒绝好友请求:", request.id);
                      respondToFriendRequest(request.id, 'rejected');
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Contacts list */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* No contacts state */}
        {contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <UserPlus className="h-12 w-12 text-gray-400 mb-2" />
            <h3 className="text-md font-medium text-gray-700">没有联系人</h3>
            <p className="text-sm text-gray-500 mb-4">点击右上角的添加按钮来添加新联系人</p>
            <button 
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-indigo-700 transition-colors"
              onClick={() => setShowAddContact(true)}
            >
              添加联系人
            </button>
          </div>
        )}
        
        {/* Filtered no results */}
        {contacts.length > 0 && filteredContacts.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500">未找到匹配的联系人</p>
          </div>
        )}
        
        {/* Active contacts */}
        <div className="pt-2">
          {onlineContacts.length > 0 && (
            <p className="px-4 text-xs font-medium text-gray-500 uppercase tracking-wider py-1">在线联系人</p>
          )}
          
          {onlineContacts.map((contact) => (
            <div 
              key={contact.contact.id}
              className={`flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                selectedContact?.contact.id === contact.contact.id ? 'bg-gray-100' : ''
              }`}
              onClick={() => selectContact(contact)}
            >
              <div className="relative">
                <img 
                  src={contact.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.contact.displayName)}&background=random`} 
                  alt={contact.contact.displayName} 
                  className="h-10 w-10 rounded-full object-cover"
                />
                <span className="status-indicator status-online absolute bottom-0 right-0 border-2 border-white"></span>
              </div>
              <div className="ml-3 flex-1">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-medium text-gray-900">{contact.contact.displayName}</p>
                  <span className="text-xs text-gray-500">{getLastMessageTime(contact.contact.id)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate w-36">在线</p>
              </div>
              {contact.unreadCount > 0 && (
                <div className="flex-shrink-0 ml-2">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-xs font-medium text-white">
                    {contact.unreadCount}
                  </span>
                </div>
              )}
            </div>
          ))}
          
          {offlineContacts.length > 0 && (
            <p className="px-4 text-xs font-medium text-gray-500 uppercase tracking-wider py-1 mt-2">其他联系人</p>
          )}
          
          {offlineContacts.map((contact) => (
            <div 
              key={contact.contact.id}
              className={`flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer ${
                selectedContact?.contact.id === contact.contact.id ? 'bg-gray-100' : ''
              }`}
              onClick={() => selectContact(contact)}
            >
              <div className="relative">
                <img 
                  src={contact.contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.contact.displayName)}&background=random`} 
                  alt={contact.contact.displayName} 
                  className="h-10 w-10 rounded-full object-cover"
                />
                <span className="status-indicator status-offline absolute bottom-0 right-0 border-2 border-white"></span>
              </div>
              <div className="ml-3 flex-1">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-medium text-gray-900">{contact.contact.displayName}</p>
                  <span className="text-xs text-gray-500">{getLastMessageTime(contact.contact.id)}</span>
                </div>
                <p className="text-xs text-gray-500 truncate w-36">
                  {contact.contact.lastSeen 
                    ? `最近登录: ${formatLastSeen(contact.contact.lastSeen)}` 
                    : "离线"}
                </p>
              </div>
              {contact.unreadCount > 0 && (
                <div className="flex-shrink-0 ml-2">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-xs font-medium text-white">
                    {contact.unreadCount}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* User profile */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center">
          <img 
            src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || '')}&background=random`} 
            alt="个人头像" 
            className="h-10 w-10 rounded-full object-cover"
          />
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">{user?.displayName}</p>
            <p className="text-xs text-gray-500">在线</p>
          </div>
          <button 
            className="ml-auto text-gray-500 hover:text-gray-700"
            onClick={handleLogout}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Add contact dialog */}
      <AddContactDialog open={showAddContact} onOpenChange={setShowAddContact} />
    </div>
  );
}
