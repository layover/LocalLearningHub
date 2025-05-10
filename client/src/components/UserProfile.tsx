import { useChat } from "@/hooks/use-chat";
import { Phone, Video, MoreVertical } from "lucide-react";

export default function UserProfile() {
  const { selectedContact } = useChat();
  
  if (!selectedContact) {
    return null;
  }
  
  const { contact } = selectedContact;

  return (
    <div className="hidden md:flex md:flex-col w-64 border-l border-gray-200 bg-white">
      <div className="p-6 flex flex-col items-center border-b border-gray-200">
        <img 
          src={contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.displayName)}&background=random&size=150`} 
          alt={contact.displayName} 
          className="h-24 w-24 rounded-full object-cover mb-4"
        />
        <h3 className="text-lg font-medium text-gray-900">{contact.displayName}</h3>
        <p className="text-sm text-gray-500">{contact.about || "无个人介绍"}</p>
        <div className="flex mt-4">
          <button className="flex items-center justify-center bg-primary hover:bg-indigo-700 text-white rounded-full p-2 mx-1">
            <Phone className="h-5 w-5" />
          </button>
          <button className="flex items-center justify-center bg-primary hover:bg-indigo-700 text-white rounded-full p-2 mx-1">
            <Video className="h-5 w-5" />
          </button>
          <button className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full p-2 mx-1">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      <div className="p-6 overflow-y-auto no-scrollbar">
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-2">关于</h4>
          <p className="text-sm text-gray-500">{contact.about || "用户没有填写个人介绍"}</p>
        </div>
        
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-2">联系信息</h4>
          {contact.email && (
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500">{contact.email}</p>
            </div>
          )}
          
          {contact.phone && (
            <div className="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <p className="text-sm text-gray-500">{contact.phone}</p>
            </div>
          )}
          
          {!contact.email && !contact.phone && (
            <p className="text-sm text-gray-500">用户未提供联系信息</p>
          )}
        </div>
      </div>
    </div>
  );
}
