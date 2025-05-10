import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserCircle, Crown, Shield } from "lucide-react";
import { User, GroupMember } from "@/types";

interface GroupMemberListProps {
  groupId: number;
}

type MemberWithUserDetails = {
  member: GroupMember;
  user: User;
};

export default function GroupMemberList({ groupId }: GroupMemberListProps) {
  const [activeTab, setActiveTab] = useState<"all" | "online" | "admin">("all");
  const [filteredMembers, setFilteredMembers] = useState<MemberWithUserDetails[]>([]);

  // 获取群组成员数据
  const { data: membersData = [], isLoading, error } = useQuery<MemberWithUserDetails[]>({
    queryKey: [`/api/groups/${groupId}/members`],
    enabled: !!groupId,
    refetchInterval: 10000, // 每10秒刷新一次,保持在线状态更新
  });

  // 根据选项卡筛选成员
  useEffect(() => {
    if (membersData) {
      if (activeTab === "all") {
        setFilteredMembers(membersData);
      } else if (activeTab === "online") {
        setFilteredMembers(membersData.filter(m => m.user.isOnline));
      } else if (activeTab === "admin") {
        setFilteredMembers(membersData.filter(m => ["admin", "owner"].includes(m.member.role)));
      }
    }
  }, [activeTab, membersData]);

  // 获取成员角色图标
  const getMemberRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case "admin":
        return <Shield className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  // 获取角色中文名称
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case "owner":
        return "群主";
      case "admin":
        return "管理员";
      default:
        return "成员";
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">加载群成员...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">获取群成员失败</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold mb-2">群成员 ({membersData.length})</h3>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "all" | "online" | "admin")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="online">
              在线 ({membersData.filter(m => m.user.isOnline).length})
            </TabsTrigger>
            <TabsTrigger value="admin">
              管理员 ({membersData.filter(m => ["admin", "owner"].includes(m.member.role)).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {activeTab === "online" ? "没有在线成员" : activeTab === "admin" ? "没有管理员" : "没有群成员"}
            </div>
          ) : (
            filteredMembers.map((item) => (
              <div key={item.member.userId} className="p-2 hover:bg-accent rounded-md">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {/* 用户头像 */}
                    {item.user.avatar ? (
                      <img
                        src={item.user.avatar}
                        alt={item.user.displayName}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                        <UserCircle className="h-10 w-10" />
                      </div>
                    )}
                    
                    {/* 在线状态指示器 */}
                    {item.user.isOnline && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background"></span>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="font-medium">{item.user.displayName}</span>
                      {getMemberRoleIcon(item.member.role) && (
                        <span className="ml-1">{getMemberRoleIcon(item.member.role)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>@{item.user.username}</span>
                      <Badge variant="outline" className="py-0 h-5">
                        {getRoleDisplayName(item.member.role)}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* 在线状态文本 */}
                  <div className="text-xs">
                    {item.user.isOnline ? (
                      <span className="text-green-500">在线</span>
                    ) : (
                      <span className="text-muted-foreground">离线</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}