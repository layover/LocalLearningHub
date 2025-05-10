import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Users, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Group } from "@/types";
import { queryClient } from "@/lib/queryClient";

export default function GroupChatSidebar() {
  const { user } = useAuth();
  const { selectGroup } = useChat();
  const [searchTerm, setSearchTerm] = useState("");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  
  // 获取群组列表
  const { data: groups = [], isLoading, error, refetch } = useQuery<Group[]>({
    queryKey: ['/api/groups'],
    queryFn: async () => {
      const response = await fetch('/api/groups');
      if (!response.ok) {
        throw new Error('获取群组失败');
      }
      return response.json();
    }
  });
  
  // 定期刷新群组列表
  useEffect(() => {
    const intervalId = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
    }, 30000); // 每30秒刷新一次
    
    return () => clearInterval(intervalId);
  }, []);
  
  // 实现群组搜索
  const filteredGroups = searchTerm.trim() === "" 
    ? groups 
    : groups.filter(group => 
        group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  
  // 获取每个群组的最新消息（可以通过后续api实现）
  // const getGroupLastMessage = (groupId: number) => {
  //   // 这里可以调用后端API获取群组最新消息
  //   return "";
  // };
  
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">群组</h2>
          <CreateGroupDialog 
            open={createGroupOpen} 
            onOpenChange={setCreateGroupOpen} 
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索群组..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-500">
            加载群组失败，请重试
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4" />
            {searchTerm ? (
              <p>没有找到匹配的群组</p>
            ) : (
              <>
                <p>您还没有加入任何群组</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setCreateGroupOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  创建群组
                </Button>
              </>
            )}
          </div>
        ) : (
          <Accordion 
            type="single" 
            collapsible 
            className="w-full"
            defaultValue="groups"
          >
            <AccordionItem value="groups" className="border-b-0">
              <AccordionTrigger className="px-4 py-2 hover:no-underline hover:bg-accent">
                <div className="flex justify-between items-center w-full">
                  <span>我的群组</span>
                  <Badge>{filteredGroups.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-0">
                <ul>
                  {filteredGroups.map((group) => (
                    <li 
                      key={group.id}
                      className="flex items-center p-2 hover:bg-accent rounded-md cursor-pointer mx-2 mb-1"
                      onClick={() => selectGroup(group)}
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                        {group.avatar ? (
                          <img 
                            src={group.avatar} 
                            alt={group.name} 
                            className="w-full h-full rounded-full" 
                          />
                        ) : (
                          <Users className="h-5 w-5" />
                        )}
                      </div>
                      <div className="ml-3 overflow-hidden flex-1">
                        <div className="flex justify-between">
                          <p className="text-sm font-medium truncate">{group.name}</p>
                          {/* 显示未读消息数 */}
                          {/* {unreadCounts[group.id] > 0 && (
                            <Badge variant="destructive">{unreadCounts[group.id]}</Badge>
                          )} */}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {group.description || "无描述"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  );
}