import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UserPlus,
  Users,
  Loader2
} from "lucide-react";
import { Contact } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { user } = useAuth();
  const { contacts } = useChat();
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  // 重置表单
  useEffect(() => {
    if (open) {
      setGroupName("");
      setGroupDescription("");
      setSelectedContacts([]);
      setIsCreating(false);
    }
  }, [open]);

  // 选择/取消选择联系人
  const toggleContact = (contactId: number) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  // 创建群组
  const createGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: "错误",
        description: "群组名称不能为空",
        variant: "destructive",
      });
      return;
    }

    if (selectedContacts.length === 0) {
      toast({
        title: "错误", 
        description: "请至少选择一个联系人",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          memberIds: selectedContacts,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "创建群组失败");
      }

      const newGroup = await response.json();
      
      // 成功创建群组
      toast({
        title: "成功",
        description: `群组 "${groupName}" 已创建`,
      });

      // 刷新群组列表
      queryClient.invalidateQueries({ queryKey: ['/api/groups'] });
      
      // 关闭对话框
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "创建群组失败",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-auto">
          <Users className="mr-2 h-4 w-4" />
          创建群组
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>创建新群组</DialogTitle>
          <DialogDescription>
            从您的联系人中选择成员创建一个新的群组对话。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="group-name" className="text-right">
              群组名称
            </Label>
            <Input
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="col-span-3"
              placeholder="输入群组名称"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="group-description" className="text-right">
              群组描述
            </Label>
            <Textarea
              id="group-description"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              className="col-span-3"
              placeholder="输入群组描述（可选）"
            />
          </div>
          <div className="grid gap-2 mt-4">
            <Label className="mb-2">选择成员</Label>
            <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto">
              {contacts.length > 0 ? (
                contacts.map(({ contact }: { contact: Contact["contact"] }) => (
                  <div 
                    key={contact.id} 
                    className="flex items-center space-x-2 mb-2 py-2 border-b last:border-0"
                  >
                    <Checkbox
                      id={`contact-${contact.id}`}
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <Label
                      htmlFor={`contact-${contact.id}`}
                      className="cursor-pointer font-normal flex-1"
                    >
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full mr-2 flex items-center justify-center bg-primary text-primary-foreground`}>
                          {contact.avatar ? (
                            <img src={contact.avatar} alt={contact.displayName} className="w-full h-full rounded-full" />
                          ) : (
                            contact.displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <span>{contact.displayName}</span>
                        <span className="text-gray-400 text-xs ml-2">
                          {contact.username}
                        </span>
                      </div>
                    </Label>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <UserPlus className="h-10 w-10 mx-auto mb-2" />
                  <p>您还没有联系人</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="submit" onClick={createGroup} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              "创建群组"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}