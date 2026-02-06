import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, MoreVertical, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Strategy, Call } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function StrategyManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNewStrategy, setShowNewStrategy] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/advisor/strategies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/strategies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      setShowNewStrategy(false);
      toast({ title: "Strategy created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/strategies/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      toast({ title: "Strategy updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/strategies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      toast({ title: "Strategy deleted" });
    },
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">
          Manage Strategies ({strategies?.length || 0})
        </h2>
        <Button onClick={() => setShowNewStrategy(true)} data-testid="button-add-strategy">
          <Plus className="w-4 h-4 mr-1" /> Add New
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !strategies || strategies.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No strategies yet. Create your first strategy to start publishing calls.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Strategy Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover-elevate" data-testid={`row-strategy-${s.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="text-primary"
                            onClick={() => {
                              setSelectedStrategy(s);
                              setShowAddStock(true);
                            }}
                            data-testid={`button-add-stock-${s.id}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{s.type}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">
                        {s.description || "--"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.status === "Published" ? "default" : "secondary"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : "--"}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${s.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedStrategy(s);
                                setShowAddStock(true);
                              }}
                            >
                              Add Stock Call
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedStrategy(s);
                                setShowAddPosition(true);
                              }}
                            >
                              Add Position (F&O)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  id: s.id,
                                  status: s.status === "Published" ? "Draft" : "Published",
                                })
                              }
                            >
                              {s.status === "Published" ? "Unpublish" : "Publish"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMutation.mutate(s.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewStrategyDialog
        open={showNewStrategy}
        onOpenChange={setShowNewStrategy}
        onSubmit={(data) => createMutation.mutate({ ...data, advisorId: user?.id })}
        loading={createMutation.isPending}
      />

      <AddStockSheet
        open={showAddStock}
        onOpenChange={setShowAddStock}
        strategy={selectedStrategy}
      />

      <AddPositionSheet
        open={showAddPosition}
        onOpenChange={setShowAddPosition}
        strategy={selectedStrategy}
      />
    </div>
  );
}

function NewStrategyDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "Equity",
    description: "",
    theme: [] as string[],
    managementStyle: "",
    horizon: "",
    volatility: "",
    benchmark: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Strategy</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Strategy Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              data-testid="input-strategy-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Strategy Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger data-testid="select-strategy-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Equity">Equity</SelectItem>
                <SelectItem value="Basket">Basket</SelectItem>
                <SelectItem value="Future">Future</SelectItem>
                <SelectItem value="Commodity">Commodity</SelectItem>
                <SelectItem value="Option">Option</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Horizon</Label>
            <Select value={form.horizon} onValueChange={(v) => setForm({ ...form, horizon: v })}>
              <SelectTrigger data-testid="select-horizon">
                <SelectValue placeholder="Select Horizon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Intraday">Intraday</SelectItem>
                <SelectItem value="Positional">Positional</SelectItem>
                <SelectItem value="Short Term">Short Term</SelectItem>
                <SelectItem value="Swing">Swing</SelectItem>
                <SelectItem value="Long Term">Long Term</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Volatility</Label>
            <Select value={form.volatility} onValueChange={(v) => setForm({ ...form, volatility: v })}>
              <SelectTrigger data-testid="select-volatility">
                <SelectValue placeholder="Select Volatility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Benchmark</Label>
            <Select value={form.benchmark} onValueChange={(v) => setForm({ ...form, benchmark: v })}>
              <SelectTrigger data-testid="select-benchmark">
                <SelectValue placeholder="Select Benchmark" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Nifty 50">Nifty 50</SelectItem>
                <SelectItem value="Sensex">Sensex</SelectItem>
                <SelectItem value="Nifty Bank">Nifty Bank</SelectItem>
                <SelectItem value="Nifty Midcap">Nifty Midcap</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              data-testid="input-strategy-description"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-save-strategy">
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save & Next
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStockSheet({
  open,
  onOpenChange,
  strategy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  strategy: Strategy | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    stockName: "",
    action: "Buy",
    buyRangeStart: "",
    buyRangeEnd: "",
    targetPrice: "",
    profitGoal: "",
    stopLoss: "",
    rationale: "",
    isPublished: false,
    usePercentage: false,
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/strategies/${strategy?.id}/calls`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      onOpenChange(false);
      toast({ title: "Stock call added" });
      setForm({
        stockName: "",
        action: "Buy",
        buyRangeStart: "",
        buyRangeEnd: "",
        targetPrice: "",
        profitGoal: "",
        stopLoss: "",
        rationale: "",
        isPublished: false,
        usePercentage: false,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      strategyId: strategy?.id,
      buyRangeStart: form.buyRangeStart || undefined,
      buyRangeEnd: form.buyRangeEnd || undefined,
      targetPrice: form.targetPrice || undefined,
      profitGoal: form.profitGoal || undefined,
      stopLoss: form.stopLoss || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Stock</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label>Stock Name</Label>
            <Input
              value={form.stockName}
              onChange={(e) => setForm({ ...form, stockName: e.target.value })}
              required
              data-testid="input-stock-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Buy/Sell</Label>
            <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
              <SelectTrigger data-testid="select-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Buy">Buy</SelectItem>
                <SelectItem value="Sell">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buy Range Start</Label>
            <Input
              type="number"
              step="0.01"
              value={form.buyRangeStart}
              onChange={(e) => setForm({ ...form, buyRangeStart: e.target.value })}
              data-testid="input-buy-range-start"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Buy Range End</Label>
            <Input
              type="number"
              step="0.01"
              value={form.buyRangeEnd}
              onChange={(e) => setForm({ ...form, buyRangeEnd: e.target.value })}
              data-testid="input-buy-range-end"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target Price Range</Label>
            <Input
              type="number"
              step="0.01"
              value={form.targetPrice}
              onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
              data-testid="input-target-price"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.usePercentage}
              onCheckedChange={(v) => setForm({ ...form, usePercentage: !!v })}
              data-testid="checkbox-percentage"
            />
            <Label className="text-sm">Profit Goal {form.usePercentage ? "%" : ""}</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Profit Goal</Label>
            <Input
              value={form.profitGoal}
              onChange={(e) => setForm({ ...form, profitGoal: e.target.value })}
              placeholder={form.usePercentage ? "%" : ""}
              data-testid="input-profit-goal"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stop Loss</Label>
            <Input
              type="number"
              step="0.01"
              value={form.stopLoss}
              onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              data-testid="input-stop-loss"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              rows={3}
              data-testid="input-rationale"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.isPublished}
              onCheckedChange={(v) => setForm({ ...form, isPublished: !!v })}
              data-testid="checkbox-published"
            />
            <Label className="text-sm">Published</Label>
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-stock">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AddPositionSheet({
  open,
  onOpenChange,
  strategy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  strategy: Strategy | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    segment: "Equity",
    callPut: "Call",
    buySell: "Buy",
    symbol: "",
    expiry: "",
    strikePrice: "",
    entryPrice: "",
    lots: "",
    target: "",
    stopLoss: "",
    rationale: "",
    isPublished: false,
    enableLeg: false,
    usePercentage: false,
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/strategies/${strategy?.id}/positions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      onOpenChange(false);
      toast({ title: "Position added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      strategyId: strategy?.id,
      strikePrice: form.strikePrice || undefined,
      entryPrice: form.entryPrice || undefined,
      lots: form.lots ? parseInt(form.lots) : undefined,
      target: form.target || undefined,
      stopLoss: form.stopLoss || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Position</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.enableLeg}
              onCheckedChange={(v) => setForm({ ...form, enableLeg: !!v })}
              data-testid="checkbox-enable-leg"
            />
            <Label className="text-sm">Enable Leg</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Segment</Label>
            <div className="flex flex-wrap gap-1">
              {["Equity", "Index", "Future", "Option"].map((seg) => (
                <Button
                  key={seg}
                  type="button"
                  variant={form.segment === seg ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, segment: seg })}
                  data-testid={`button-segment-${seg.toLowerCase()}`}
                >
                  {seg}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {["Call", "Put"].map((cp) => (
                <Button
                  key={cp}
                  type="button"
                  variant={form.callPut === cp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, callPut: cp })}
                >
                  {cp}
                </Button>
              ))}
              <div className="w-2" />
              {["Buy", "Sell"].map((bs) => (
                <Button
                  key={bs}
                  type="button"
                  variant={form.buySell === bs ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, buySell: bs })}
                >
                  {bs}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Symbol</Label>
            <Input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              data-testid="input-symbol"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry</Label>
            <Input
              value={form.expiry}
              onChange={(e) => setForm({ ...form, expiry: e.target.value })}
              data-testid="input-expiry"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Strike Price</Label>
            <Input
              type="number"
              step="0.01"
              value={form.strikePrice}
              onChange={(e) => setForm({ ...form, strikePrice: e.target.value })}
              data-testid="input-strike-price"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Entry Price</Label>
            <Input
              type="number"
              step="0.01"
              value={form.entryPrice}
              onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
              data-testid="input-entry-price"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lots</Label>
            <Input
              type="number"
              value={form.lots}
              onChange={(e) => setForm({ ...form, lots: e.target.value })}
              data-testid="input-lots"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.usePercentage}
              onCheckedChange={(v) => setForm({ ...form, usePercentage: !!v })}
            />
            <Label className="text-sm">Switch Target & Stop Loss to Percentage</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Target</Label>
            <Input
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              data-testid="input-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stop Loss</Label>
            <Input
              value={form.stopLoss}
              onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              data-testid="input-position-stop-loss"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              rows={3}
              data-testid="input-position-rationale"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.isPublished}
              onCheckedChange={(v) => setForm({ ...form, isPublished: !!v })}
            />
            <Label className="text-sm">Published</Label>
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-position">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
