import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, MoreVertical, Loader2, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Strategy, Plan } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

function getCallActionsForType(type: string): { label: string; mode: "stock" | "position" }[] {
  switch (type) {
    case "Equity":
      return [{ label: "Add Stock Call", mode: "stock" }];
    case "Option":
      return [{ label: "Add Option Call", mode: "position" }];
    case "Future":
      return [{ label: "Add Future Call", mode: "position" }];
    case "Commodity":
      return [{ label: "Add Commodity Call", mode: "stock" }];
    case "CommodityFuture":
      return [{ label: "Add Commodity Future Call", mode: "position" }];
    case "Basket":
      return [
        { label: "Add Stock Call", mode: "stock" },
        { label: "Add Position (F&O)", mode: "position" },
      ];
    default:
      return [
        { label: "Add Stock Call", mode: "stock" },
        { label: "Add Position (F&O)", mode: "position" },
      ];
  }
}

export default function StrategyManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNewStrategy, setShowNewStrategy] = useState(false);
  const [showEditStrategy, setShowEditStrategy] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/advisor/strategies"],
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["/api/advisor/plans"],
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest("PATCH", `/api/strategies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      setShowEditStrategy(false);
      setSelectedStrategy(null);
      toast({ title: "Strategy updated" });
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
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Horizon</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => {
                    const callActions = getCallActionsForType(s.type);
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover-elevate" data-testid={`row-strategy-${s.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              className="text-primary"
                              onClick={() => {
                                setSelectedStrategy(s);
                                const firstAction = callActions[0];
                                if (firstAction.mode === "stock") setShowAddStock(true);
                                else setShowAddPosition(true);
                              }}
                              data-testid={`button-add-stock-${s.id}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{s.type}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.horizon || "--"}</td>
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
                                  setShowEditStrategy(true);
                                }}
                                data-testid={`button-edit-strategy-${s.id}`}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit Strategy
                              </DropdownMenuItem>
                              {callActions.map((action) => (
                                <DropdownMenuItem
                                  key={action.label}
                                  onClick={() => {
                                    setSelectedStrategy(s);
                                    if (action.mode === "stock") setShowAddStock(true);
                                    else setShowAddPosition(true);
                                  }}
                                  data-testid={`button-action-${action.label.toLowerCase().replace(/\s+/g, "-")}-${s.id}`}
                                >
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem
                                onClick={() =>
                                  toggleStatusMutation.mutate({
                                    id: s.id,
                                    status: s.status === "Published" ? "Draft" : "Published",
                                  })
                                }
                                data-testid={`button-toggle-status-${s.id}`}
                              >
                                {s.status === "Published" ? "Unpublish" : "Publish"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteMutation.mutate(s.id)}
                                data-testid={`button-delete-strategy-${s.id}`}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <StrategyDialog
        open={showNewStrategy}
        onOpenChange={setShowNewStrategy}
        onSubmit={(data) => createMutation.mutate({ ...data, advisorId: user?.id })}
        loading={createMutation.isPending}
        plans={plans || []}
        mode="create"
      />

      <StrategyDialog
        open={showEditStrategy}
        onOpenChange={(v) => {
          setShowEditStrategy(v);
          if (!v) setSelectedStrategy(null);
        }}
        onSubmit={(data) => updateMutation.mutate({ ...data, id: selectedStrategy?.id })}
        loading={updateMutation.isPending}
        plans={plans || []}
        mode="edit"
        strategy={selectedStrategy}
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

function StrategyDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
  plans,
  mode,
  strategy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: any) => void;
  loading: boolean;
  plans: Plan[];
  mode: "create" | "edit";
  strategy?: Strategy | null;
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
    planIds: [] as string[],
  });

  useEffect(() => {
    if (mode === "edit" && strategy && open) {
      setForm({
        name: strategy.name || "",
        type: strategy.type || "Equity",
        description: strategy.description || "",
        theme: strategy.theme || [],
        managementStyle: strategy.managementStyle || "",
        horizon: strategy.horizon || "",
        volatility: strategy.volatility || "",
        benchmark: strategy.benchmark || "",
        planIds: strategy.planIds || [],
      });
    } else if (mode === "create" && open) {
      setForm({
        name: "",
        type: "Equity",
        description: "",
        theme: [],
        managementStyle: "",
        horizon: "",
        volatility: "",
        benchmark: "",
        planIds: [],
      });
    }
  }, [mode, strategy, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const togglePlan = (planId: string) => {
    setForm((prev) => ({
      ...prev,
      planIds: prev.planIds.includes(planId)
        ? prev.planIds.filter((id) => id !== planId)
        : [...prev.planIds, planId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit Strategy" : "Create New Strategy"}</DialogTitle>
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
                <SelectItem value="CommodityFuture">Commodity Future</SelectItem>
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

          {plans.length > 0 && (
            <div className="space-y-2">
              <Label>Map Pricing Plans</Label>
              <p className="text-xs text-muted-foreground">Select which plans apply to this strategy</p>
              <div className="space-y-2 rounded-md border p-3">
                {plans.map((plan) => (
                  <div key={plan.id} className="flex items-center gap-2" data-testid={`plan-option-${plan.id}`}>
                    <Checkbox
                      checked={form.planIds.includes(plan.id)}
                      onCheckedChange={() => togglePlan(plan.id)}
                      data-testid={`checkbox-plan-${plan.id}`}
                    />
                    <Label className="text-sm font-normal cursor-pointer flex items-center gap-2 flex-wrap">
                      <span>{plan.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {plan.code}
                      </Badge>
                      <span className="text-muted-foreground">
                        {"\u20B9"}{Number(plan.amount).toLocaleString("en-IN")}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-save-strategy">
            {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {mode === "edit" ? "Update Strategy" : "Save & Next"}
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
