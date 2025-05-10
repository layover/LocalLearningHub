import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddContactDialog({ open, onOpenChange }: AddContactDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);

  // Search users mutation
  const searchMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiRequest("GET", `/api/users/search?username=${encodeURIComponent(username)}`);
      return await res.json();
    },
    onSuccess: (data: User[]) => {
      setSearchResults(data);
      setIsSearching(false);
    },
    onError: (error: Error) => {
      toast({
        title: "搜索失败",
        description: error.message,
        variant: "destructive",
      });
      setIsSearching(false);
    },
  });
  
  // Add contact mutation
  const addContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await apiRequest("POST", "/api/contacts", { contactId });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: "添加成功",
        description: "联系人已成功添加",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "添加失败",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle search
  const handleSearch = () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    searchMutation.mutate(searchTerm);
  };

  // Handle add contact
  const handleAddContact = (contactId: number) => {
    addContactMutation.mutate(contactId);
  };

  // Handle key press in search input
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>添加新联系人</DialogTitle>
          <DialogDescription>
            搜索用户名并添加为联系人
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex gap-2 items-end my-4">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input 
              id="username" 
              placeholder="输入用户名搜索..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
            />
          </div>
          <Button 
            onClick={handleSearch} 
            disabled={isSearching || !searchTerm.trim()}
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
          </Button>
        </div>
        
        {searchResults.length > 0 ? (
          <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
            {searchResults.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3">
                <div className="flex items-center">
                  <img 
                    src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=random`} 
                    alt={user.displayName} 
                    className="h-8 w-8 rounded-full object-cover mr-3"
                  />
                  <div>
                    <p className="text-sm font-medium">{user.displayName}</p>
                    <p className="text-xs text-gray-500">@{user.username}</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleAddContact(user.id)}
                  disabled={addContactMutation.isPending}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            ))}
          </div>
        ) : isSearching ? (
          <div className="text-center p-4">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-2">搜索中...</p>
          </div>
        ) : searchMutation.isSuccess && searchTerm && (
          <div className="text-center p-4 text-gray-500">
            未找到匹配的用户
          </div>
        )}
      
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}