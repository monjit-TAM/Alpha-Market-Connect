import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, MoreVertical, Loader2, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Content as ContentType } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContentPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [contentType, setContentType] = useState("MarketUpdate");

  const { data: contents, isLoading } = useQuery<ContentType[]>({
    queryKey: ["/api/advisor/content"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/content", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/content"] });
      setShowNew(false);
      toast({ title: "Content added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/content/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/content"] });
      toast({ title: "Content deleted" });
    },
  });

  const contentTypes = [
    { label: "Add Terms & Conditions", type: "Terms" },
    { label: "Add Risk Advisory", type: "RiskAdvisory" },
    { label: "Add Learn", type: "Learn" },
    { label: "Add Market Update", type: "MarketUpdate" },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Content</h2>
        <div className="flex flex-wrap gap-2">
          {contentTypes.map((ct) => (
            <Button
              key={ct.type}
              size="sm"
              variant={ct.type === "Terms" || ct.type === "RiskAdvisory" ? "default" : "outline"}
              onClick={() => {
                setContentType(ct.type);
                setShowNew(true);
              }}
              data-testid={`button-add-${ct.type.toLowerCase()}`}
            >
              {ct.label}
            </Button>
          ))}
        </div>
      </div>

      <h3 className="text-xl font-bold">All pages</h3>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !contents || contents.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No content published yet. Add terms, research, or market updates.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {contents.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-3 border-b hover-elevate rounded-md"
              data-testid={`content-item-${c.id}`}
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{c.title}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(c.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <NewContentDialog
        open={showNew}
        onOpenChange={setShowNew}
        type={contentType}
        onSubmit={(data) => createMutation.mutate({ ...data, advisorId: user?.id })}
        loading={createMutation.isPending}
      />
    </div>
  );
}

function NewContentDialog({
  open,
  onOpenChange,
  type,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: string;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({ title: "", body: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, type });
    setForm({ title: "", body: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add {type === "MarketUpdate" ? "Market Update" : type === "RiskAdvisory" ? "Risk Advisory" : type}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              data-testid="input-content-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={6}
              data-testid="input-content-body"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-save-content">
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
