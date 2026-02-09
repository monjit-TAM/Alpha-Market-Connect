import { useState, useEffect, useRef } from "react";
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
import { Plus, MoreVertical, Loader2, Pencil, ChevronDown, ChevronRight, X, Search, ArrowUp, ArrowDown, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { Strategy, Call, Position, Plan } from "@shared/schema";
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

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  isFnO: boolean;
}

function SymbolAutocomplete({
  value,
  onChange,
  segment,
  testId,
}: {
  value: string;
  onChange: (val: string) => void;
  segment?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchSymbols = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (segment) params.set("segment", segment);
        const res = await fetch(`/api/symbols/search?${params}`);
        const data = await res.json();
        setResults(data);
        setShowDropdown(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onChange(v);
            searchSymbols(v);
          }}
          onFocus={() => {
            if (query.length >= 1) searchSymbols(query);
          }}
          placeholder="Search symbol..."
          className="pl-8"
          data-testid={testId || "input-symbol-search"}
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.exchange}-${r.symbol}`}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover-elevate flex items-center justify-between gap-2"
              onClick={() => {
                onChange(r.symbol);
                setQuery(r.symbol);
                setShowDropdown(false);
              }}
              data-testid={`symbol-option-${r.symbol}`}
            >
              <div>
                <span className="font-medium">{r.symbol}</span>
                <span className="text-muted-foreground ml-2 text-xs">{r.name}</span>
              </div>
              <Badge variant="secondary" className="text-xs">{r.exchange}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StrategyManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showNewStrategy, setShowNewStrategy] = useState(false);
  const [showEditStrategy, setShowEditStrategy] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

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
    <div className="space-y-4 max-w-6xl">
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
        <div className="space-y-3">
          {strategies.map((s) => {
            const callActions = getCallActionsForType(s.type);
            const isExpanded = expandedStrategy === s.id;
            return (
              <Card key={s.id} data-testid={`card-strategy-${s.id}`}>
                <CardContent className="p-0">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover-elevate flex-wrap"
                    onClick={() => setExpandedStrategy(isExpanded ? null : s.id)}
                    data-testid={`row-strategy-${s.id}`}
                  >
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.type} {s.horizon ? `| ${s.horizon}` : ""}</div>
                    </div>
                    <Badge variant={s.status === "Published" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : ""}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
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
                              <Plus className="w-4 h-4 mr-2" />
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
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t px-4 py-3">
                      <StrategyCallsPanel strategy={s} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
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

function StrategyCallsPanel({ strategy }: { strategy: Strategy }) {
  const { toast } = useToast();
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [closingCall, setClosingCall] = useState<Call | null>(null);
  const [closingPosition, setClosingPosition] = useState<Position | null>(null);

  const { data: calls, isLoading: callsLoading } = useQuery<Call[]>({
    queryKey: ["/api/advisor/strategies", strategy.id, "calls"],
    queryFn: async () => {
      const res = await fetch(`/api/advisor/strategies/${strategy.id}/calls`);
      if (!res.ok) throw new Error("Failed to load calls");
      return res.json();
    },
  });

  const { data: positions, isLoading: positionsLoading } = useQuery<Position[]>({
    queryKey: ["/api/advisor/strategies", strategy.id, "positions"],
    queryFn: async () => {
      const res = await fetch(`/api/advisor/strategies/${strategy.id}/positions`);
      if (!res.ok) throw new Error("Failed to load positions");
      return res.json();
    },
  });

  const activeCalls = calls?.filter((c) => c.status === "Active" && ((c as any).publishMode === "live" || (c.isPublished && !(c as any).publishMode))) || [];
  const closedCalls = calls?.filter((c) => c.status === "Closed") || [];
  const draftCalls = calls?.filter((c) => c.status === "Active" && !c.isPublished && ((c as any).publishMode === "draft" || (c as any).publishMode === "watchlist" || !(c as any).publishMode)) || [];
  const activePositions = positions?.filter((p) => p.status === "Active" && ((p as any).publishMode === "live" || (p.isPublished && !(p as any).publishMode))) || [];
  const closedPositions = positions?.filter((p) => p.status === "Closed") || [];
  const draftPositions = positions?.filter((p) => p.status === "Active" && ((p as any).publishMode === "draft" || (p as any).publishMode === "watchlist" || (!(p as any).publishMode && !p.isPublished))) || [];

  const activeSymbols = [
    ...activeCalls.map((c) => ({ symbol: c.stockName, strategyType: strategy.type })),
    ...activePositions.filter((p) => p.symbol).map((p) => ({ symbol: p.symbol!, strategyType: strategy.type })),
  ];

  const { data: livePrices } = useQuery<Record<string, { ltp: number; change: number; changePercent: number }>>({
    queryKey: ["/api/live-prices", strategy.id, "dashboard"],
    queryFn: async () => {
      if (!activeSymbols.length) return {};
      const res = await apiRequest("POST", "/api/live-prices/bulk", { symbols: activeSymbols });
      return res.json();
    },
    enabled: activeSymbols.length > 0,
    refetchInterval: ["Future", "Option", "CommodityFuture"].includes(strategy.type) ? 5000 : 15000,
  });

  const isFnOStrategy = ["Option", "Future", "Index", "CommodityFuture"].includes(strategy.type);
  const fnoPositionGroups = isFnOStrategy
    ? activePositions
        .filter((p) => p.symbol && p.expiry && p.strikePrice)
        .reduce<Record<string, { symbol: string; expiry: string; exchange: string }>>((acc, p) => {
          const exchange = ["SENSEX", "BANKEX"].includes(p.symbol!.toUpperCase()) ? "BSE" : "NSE";
          const key = `${p.symbol}:${p.expiry}`;
          if (!acc[key]) acc[key] = { symbol: p.symbol!, expiry: p.expiry!, exchange };
          return acc;
        }, {})
    : {};

  const { data: optionChainData } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/option-chain-premiums", strategy.id, JSON.stringify(fnoPositionGroups)],
    queryFn: async () => {
      const results: Record<string, any[]> = {};
      const entries = Object.entries(fnoPositionGroups);
      await Promise.all(
        entries.map(async ([key, { symbol, expiry, exchange }]) => {
          try {
            const res = await fetch(`/api/option-chain?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&expiry=${encodeURIComponent(expiry)}`);
            if (res.ok) results[key] = await res.json();
          } catch {}
        })
      );
      return results;
    },
    enabled: isFnOStrategy && Object.keys(fnoPositionGroups).length > 0,
    refetchInterval: 15000,
  });

  const getOptionPremiumLTP = (pos: Position): number | null => {
    if (!pos.symbol || !pos.expiry || !pos.strikePrice || !optionChainData) return null;
    const key = `${pos.symbol}:${pos.expiry}`;
    const chain = optionChainData[key];
    if (!chain) return null;
    const strike = chain.find((s: any) => String(s.strikePrice) === String(pos.strikePrice));
    if (!strike) return null;
    return pos.callPut === "Put" ? (strike.pe?.ltp ?? null) : (strike.ce?.ltp ?? null);
  };

  const hasPositions = (positions?.length || 0) > 0;
  const loading = callsLoading || positionsLoading;

  if (loading) {
    return <div className="py-4"><Skeleton className="h-20 w-full" /></div>;
  }

  const totalCalls = (calls?.length || 0) + (positions?.length || 0);
  if (totalCalls === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground text-sm">
        No calls or positions yet. Use the actions menu to add one.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Tabs defaultValue={draftCalls.length + draftPositions.length > 0 ? "draft" : "active"}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-calls">
            Active ({activeCalls.length + activePositions.length})
          </TabsTrigger>
          <TabsTrigger value="closed" data-testid="tab-closed-calls">
            Closed ({closedCalls.length + closedPositions.length})
          </TabsTrigger>
          <TabsTrigger value="draft" data-testid="tab-draft-calls">
            Draft ({draftCalls.length + draftPositions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-3">
          {activeCalls.length === 0 && activePositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active published calls</p>
          ) : (
            <div className="space-y-2">
              {activeCalls.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  onEdit={() => setEditingCall(call)}
                  onClose={() => setClosingCall(call)}
                  livePrice={livePrices?.[call.stockName]}
                />
              ))}
              {activePositions.map((pos) => (
                <PositionRow
                  key={pos.id}
                  position={pos}
                  onEdit={() => setEditingPosition(pos)}
                  onClose={() => setClosingPosition(pos)}
                  strategyId={strategy.id}
                  livePrice={pos.symbol ? livePrices?.[pos.symbol] : undefined}
                  optionPremiumLTP={getOptionPremiumLTP(pos)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closed" className="mt-3">
          {closedCalls.length === 0 && closedPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No closed calls</p>
          ) : (
            <div className="space-y-2">
              {closedCalls.map((call) => (
                <CallRow key={call.id} call={call} />
              ))}
              {closedPositions.map((pos) => (
                <PositionRow key={pos.id} position={pos} strategyId={strategy.id} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="draft" className="mt-3">
          {draftCalls.length === 0 && draftPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No draft or watchlist items. Use the actions menu to add calls or positions as drafts.</p>
          ) : (
            <div className="space-y-2">
              {draftCalls.map((call) => (
                <DraftCallRow
                  key={call.id}
                  call={call}
                  onEdit={() => setEditingCall(call)}
                  onClose={() => setClosingCall(call)}
                  strategyId={strategy.id}
                />
              ))}
              {draftPositions.map((pos) => (
                <DraftPositionRow
                  key={pos.id}
                  position={pos}
                  onEdit={() => setEditingPosition(pos)}
                  onClose={() => setClosingPosition(pos)}
                  strategyId={strategy.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <EditCallDialog
        call={editingCall}
        onClose={() => setEditingCall(null)}
        strategyId={strategy.id}
      />

      <EditPositionDialog
        position={editingPosition}
        onClose={() => setEditingPosition(null)}
        strategyId={strategy.id}
      />

      <CloseCallDialog
        call={closingCall}
        onClose={() => setClosingCall(null)}
        strategyId={strategy.id}
        strategyType={strategy.type}
        livePrices={livePrices}
      />

      <ClosePositionDialog
        position={closingPosition}
        onClose={() => setClosingPosition(null)}
        strategyId={strategy.id}
        strategyType={strategy.type}
        livePrices={livePrices}
        getOptionPremiumLTP={getOptionPremiumLTP}
      />
    </div>
  );
}

function CallRow({
  call,
  onEdit,
  onClose,
  livePrice,
}: {
  call: Call;
  onEdit?: () => void;
  onClose?: () => void;
  livePrice?: { ltp: number; change: number; changePercent: number };
}) {
  const isActive = call.status === "Active";
  const buyPrice = Number(call.entryPrice || call.buyRangeStart || 0);
  const currentPrice = livePrice?.ltp || 0;
  const isSell = call.action === "Sell";
  const pnl = buyPrice > 0 && currentPrice > 0
    ? (isSell ? ((buyPrice - currentPrice) / buyPrice) * 100 : ((currentPrice - buyPrice) / buyPrice) * 100)
    : null;

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-md border text-sm flex-wrap"
      data-testid={`call-row-${call.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{call.stockName}</span>
          <Badge variant={call.action === "Buy" ? "default" : "secondary"}>
            {call.action}
          </Badge>
          {!isActive && (
            <Badge variant="secondary">Closed</Badge>
          )}
          {isActive && livePrice && (
            <span className="flex items-center gap-1 text-xs font-medium" data-testid={`ltp-call-${call.id}`}>
              {"\u20B9"}{livePrice.ltp.toFixed(2)}
              {livePrice.change >= 0 ? (
                <ArrowUp className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowDown className="w-3 h-3 text-red-600 dark:text-red-400" />
              )}
              <span className={livePrice.changePercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                ({livePrice.changePercent >= 0 ? "+" : ""}{livePrice.changePercent.toFixed(2)}%)
              </span>
            </span>
          )}
          {isActive && pnl !== null && (
            <Badge variant="secondary" className={pnl >= 0 ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30" : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"}>
              P&L: {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {call.buyRangeStart && <span>Entry: {Number(call.buyRangeStart).toFixed(2)}{call.buyRangeEnd ? ` - ${Number(call.buyRangeEnd).toFixed(2)}` : ""}</span>}
          {call.targetPrice && <span>Target: {Number(call.targetPrice).toFixed(2)}</span>}
          {call.stopLoss && <span>SL: {Number(call.stopLoss).toFixed(2)}</span>}
          {(call as any).duration && <span>Duration: {(call as any).duration} {(call as any).durationUnit || "Days"}</span>}
          {(call as any).theme && <span>Theme: {(call as any).theme}</span>}
          {!isActive && call.sellPrice != null && <span>Exit: {Number(call.sellPrice).toFixed(2)}</span>}
          {!isActive && call.gainPercent != null && (
            <span className={Number(call.gainPercent) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
              {Number(call.gainPercent) >= 0 ? "+" : ""}{Number(call.gainPercent).toFixed(2)}%
            </span>
          )}
          <span>
            {call.createdAt
              ? `${new Date(call.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ${new Date(call.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
              : call.callDate ? new Date(call.callDate).toLocaleDateString("en-IN") : ""}
          </span>
          {!isActive && call.exitDate && (
            <span>Closed: {new Date(call.exitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} {new Date(call.exitDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
        {call.rationale && (
          <p className="text-xs text-muted-foreground mt-1 italic">{call.rationale}</p>
        )}
      </div>
      {isActive && (
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-call-${call.id}`}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} data-testid={`button-close-call-${call.id}`}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PositionRow({
  position,
  onEdit,
  onClose,
  strategyId,
  livePrice,
  optionPremiumLTP,
}: {
  position: Position;
  onEdit?: () => void;
  onClose?: () => void;
  strategyId: string;
  livePrice?: { ltp: number; change: number; changePercent: number };
  optionPremiumLTP?: number | null;
}) {
  const { toast } = useToast();
  const isActive = position.status === "Active";
  const entryPx = Number(position.entryPrice || 0);
  const isFnO = position.strikePrice && position.expiry;
  const currentPx = isFnO && optionPremiumLTP != null
    ? optionPremiumLTP
    : (position.symbol && livePrice ? livePrice.ltp : 0);
  const pnl = entryPx > 0 && currentPx > 0
    ? (position.buySell === "Sell"
        ? ((entryPx - currentPx) / entryPx) * 100
        : ((currentPx - entryPx) / entryPx) * 100)
    : null;

  const [editingExit, setEditingExit] = useState(false);
  const [exitPriceInput, setExitPriceInput] = useState("");

  const exitMutation = useMutation({
    mutationFn: async (data: { exitPrice: string }) => {
      const res = await apiRequest("PATCH", `/api/positions/${position.id}/exit`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "positions"] });
      setEditingExit(false);
      toast({ title: "Exit price updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isMissingExitData = !isActive && (position.exitPrice == null || position.exitPrice === "");

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-md border text-sm flex-wrap"
      data-testid={`position-row-${position.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{position.symbol || "Position"}</span>
          <Badge variant="secondary">{position.segment}</Badge>
          {position.callPut && <Badge variant="secondary">{position.callPut}</Badge>}
          <Badge variant={position.buySell === "Buy" ? "default" : "secondary"}>
            {position.buySell}
          </Badge>
          {!isActive && <Badge variant="secondary">Closed</Badge>}
          {isActive && (position as any).publishMode === "watchlist" && <Badge variant="secondary">Watchlist</Badge>}
          {isActive && (position as any).publishMode === "live" && <Badge variant="default">Live</Badge>}
          {isActive && !(position as any).publishMode && !position.isPublished && <Badge variant="secondary">Draft</Badge>}
          {isActive && livePrice != null && !isFnO && (
            <span className="flex items-center gap-1 text-xs font-medium" data-testid={`ltp-pos-${position.id}`}>
              {"\u20B9"}{livePrice.ltp.toFixed(2)}
              {livePrice.change >= 0 ? (
                <ArrowUp className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowDown className="w-3 h-3 text-red-600 dark:text-red-400" />
              )}
            </span>
          )}
          {isActive && isFnO && optionPremiumLTP != null && (
            <span className="flex items-center gap-1 text-xs font-medium" data-testid={`ltp-pos-${position.id}`}>
              {"\u20B9"}{optionPremiumLTP.toFixed(2)}
            </span>
          )}
          {isActive && pnl !== null && (
            <Badge variant="secondary" className={pnl >= 0 ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30" : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"}>
              P&L: {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {position.strikePrice && <span>Strike: {Number(position.strikePrice).toFixed(2)}</span>}
          {position.entryPrice && <span>Entry: {Number(position.entryPrice).toFixed(2)}</span>}
          {position.target && <span>Target: {position.target}</span>}
          {position.stopLoss && <span>SL: {position.stopLoss}</span>}
          {position.lots && <span>Lots: {position.lots}</span>}
          {position.expiry && <span>Exp: {position.expiry}</span>}
          {(position as any).duration && <span>Duration: {(position as any).duration} {(position as any).durationUnit || "Days"}</span>}
          {(position as any).theme && <span>Theme: {(position as any).theme}</span>}
          {!isActive && position.exitPrice != null && <span>Close Price: {Number(position.exitPrice).toFixed(2)}</span>}
          {!isActive && position.gainPercent != null && (
            <span className={Number(position.gainPercent) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
              {Number(position.gainPercent) >= 0 ? "+" : ""}{Number(position.gainPercent).toFixed(2)}%
            </span>
          )}
          <span>
            {position.createdAt
              ? `${new Date(position.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ${new Date(position.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
          {!isActive && position.exitDate && (
            <span>Closed: {new Date(position.exitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} {new Date(position.exitDate).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
        {isMissingExitData && !editingExit && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-amber-600 dark:text-amber-400">Exit price missing</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingExit(true)}
              data-testid={`button-update-exit-${position.id}`}
            >
              <Pencil className="w-3 h-3 mr-1" />
              Update Exit Price
            </Button>
          </div>
        )}
        {editingExit && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              value={exitPriceInput}
              onChange={(e) => setExitPriceInput(e.target.value)}
              placeholder="Enter exit price"
              className="w-32 h-8 text-xs"
              data-testid={`input-update-exit-${position.id}`}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!exitPriceInput || Number(exitPriceInput) <= 0) {
                  toast({ title: "Invalid price", variant: "destructive" });
                  return;
                }
                exitMutation.mutate({ exitPrice: exitPriceInput });
              }}
              disabled={exitMutation.isPending}
              data-testid={`button-save-exit-${position.id}`}
            >
              {exitMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setEditingExit(false); setExitPriceInput(""); }}
              data-testid={`button-cancel-exit-${position.id}`}
            >
              Cancel
            </Button>
          </div>
        )}
        {position.rationale && (
          <p className="text-xs text-muted-foreground mt-1 italic">{position.rationale}</p>
        )}
      </div>
      {isActive && (
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-position-${position.id}`}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid={`button-close-position-${position.id}`}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DraftCallRow({
  call,
  onEdit,
  onClose,
  strategyId,
}: {
  call: Call;
  onEdit?: () => void;
  onClose?: () => void;
  strategyId: string;
}) {
  const { toast } = useToast();
  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/calls/${call.id}/publish`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "calls"] });
      toast({ title: "Call published successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const publishMode = (call as any).publishMode || "draft";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-md border text-sm flex-wrap"
      data-testid={`draft-call-row-${call.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{call.stockName}</span>
          <Badge variant={call.action === "Buy" ? "default" : "secondary"}>
            {call.action}
          </Badge>
          <Badge variant="secondary">{publishMode === "watchlist" ? "Watchlist" : "Draft"}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {call.buyRangeStart && <span>Entry: {Number(call.buyRangeStart).toFixed(2)}{call.buyRangeEnd ? ` - ${Number(call.buyRangeEnd).toFixed(2)}` : ""}</span>}
          {call.targetPrice && <span>Target: {Number(call.targetPrice).toFixed(2)}</span>}
          {call.stopLoss && <span>SL: {Number(call.stopLoss).toFixed(2)}</span>}
          <span>
            {call.createdAt
              ? `${new Date(call.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ${new Date(call.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </div>
        {call.rationale && (
          <p className="text-xs text-muted-foreground mt-1 italic">{call.rationale}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!call.rationale?.trim() && (
          <span className="text-xs text-muted-foreground mr-1">Add rationale to publish</span>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending || !call.rationale?.trim()}
          data-testid={`button-publish-call-${call.id}`}
        >
          {publishMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Publish
        </Button>
        {onEdit && (
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-draft-call-${call.id}`}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} data-testid={`button-delete-draft-call-${call.id}`}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DraftPositionRow({
  position,
  onEdit,
  onClose,
  strategyId,
}: {
  position: Position;
  onEdit?: () => void;
  onClose?: () => void;
  strategyId: string;
}) {
  const { toast } = useToast();
  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/positions/${position.id}/publish`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "positions"] });
      toast({ title: "Position published successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const publishMode = (position as any).publishMode || "draft";

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-md border text-sm flex-wrap"
      data-testid={`draft-position-row-${position.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{position.symbol || "Position"}</span>
          <Badge variant="secondary">{position.segment}</Badge>
          {position.callPut && <Badge variant="secondary">{position.callPut}</Badge>}
          <Badge variant={position.buySell === "Buy" ? "default" : "secondary"}>
            {position.buySell}
          </Badge>
          <Badge variant="secondary">{publishMode === "watchlist" ? "Watchlist" : "Draft"}</Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          {position.strikePrice && <span>Strike: {Number(position.strikePrice).toFixed(2)}</span>}
          {position.entryPrice && <span>Entry: {Number(position.entryPrice).toFixed(2)}</span>}
          {position.target && <span>Target: {position.target}</span>}
          {position.stopLoss && <span>SL: {position.stopLoss}</span>}
          {position.lots && <span>Lots: {position.lots}</span>}
          {position.expiry && <span>Exp: {position.expiry}</span>}
          <span>
            {position.createdAt
              ? `${new Date(position.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ${new Date(position.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </div>
        {position.rationale && (
          <p className="text-xs text-muted-foreground mt-1 italic">{position.rationale}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!position.rationale?.trim() && (
          <span className="text-xs text-muted-foreground mr-1">Add rationale to publish</span>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending || !position.rationale?.trim()}
          data-testid={`button-publish-position-${position.id}`}
        >
          {publishMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
          Publish
        </Button>
        {onEdit && (
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-draft-position-${position.id}`}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} data-testid={`button-delete-draft-position-${position.id}`}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function EditCallDialog({
  call,
  onClose,
  strategyId,
}: {
  call: Call | null;
  onClose: () => void;
  strategyId: string;
}) {
  const { toast } = useToast();
  const [targetPrice, setTargetPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [rationale, setRationale] = useState("");

  useEffect(() => {
    if (call) {
      setTargetPrice(call.targetPrice || "");
      setStopLoss(call.stopLoss || "");
      setRationale(call.rationale || "");
    }
  }, [call]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/calls/${call?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "calls"] });
      onClose();
      toast({ title: "Call updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!call} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Call - {call?.stockName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Target Price</Label>
            <Input
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              data-testid="input-edit-target-price"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stop Loss</Label>
            <Input
              type="number"
              step="0.01"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              data-testid="input-edit-stop-loss"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              placeholder="Add rationale (required before publishing)"
              data-testid="input-edit-rationale"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate({ targetPrice, stopLoss, rationale })}
            disabled={mutation.isPending}
            data-testid="button-save-edit-call"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Update
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPositionDialog({
  position,
  onClose,
  strategyId,
}: {
  position: Position | null;
  onClose: () => void;
  strategyId: string;
}) {
  const { toast } = useToast();
  const [target, setTarget] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [rationale, setRationale] = useState("");

  useEffect(() => {
    if (position) {
      setTarget(position.target || "");
      setStopLoss(position.stopLoss || "");
      setRationale(position.rationale || "");
    }
  }, [position]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/positions/${position?.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "positions"] });
      onClose();
      toast({ title: "Position updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!position} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Position - {position?.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Target</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              data-testid="input-edit-position-target"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stop Loss</Label>
            <Input
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              data-testid="input-edit-position-stop-loss"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              placeholder="Add rationale (required before publishing)"
              data-testid="input-edit-position-rationale"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => mutation.mutate({ target, stopLoss, rationale })}
            disabled={mutation.isPending}
            data-testid="button-save-edit-position"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Update
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseCallDialog({
  call,
  onClose,
  strategyId,
  strategyType,
  livePrices,
}: {
  call: Call | null;
  onClose: () => void;
  strategyId: string;
  strategyType: string;
  livePrices?: Record<string, { ltp: number; change: number; changePercent: number }>;
}) {
  const { toast } = useToast();
  const [sellPrice, setSellPrice] = useState("");

  useEffect(() => {
    if (call) setSellPrice("");
  }, [call]);

  const isFnO = ["Option", "Future", "Index", "CommodityFuture"].includes(strategyType);
  const currentLTP = call ? livePrices?.[call.stockName]?.ltp : undefined;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/calls/${call?.id}/close`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "calls"] });
      onClose();
      toast({ title: "Call closed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFnOClose = () => {
    if (!currentLTP) {
      toast({ title: "Market price unavailable", description: "Please wait for live price to load or try again later.", variant: "destructive" });
      return;
    }
    mutation.mutate({ sellPrice: String(currentLTP), closeAtMarket: true });
  };

  return (
    <Dialog open={!!call} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Call - {call?.stockName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Entry: {call?.buyRangeStart ? Number(call.buyRangeStart).toFixed(2) : call?.entryPrice ? Number(call.entryPrice).toFixed(2) : "N/A"}
          </div>
          {isFnO ? (
            <>
              {currentLTP !== undefined ? (
                <div className="text-sm font-medium">
                  Current Market Price: {"\u20B9"}{currentLTP.toFixed(2)}
                </div>
              ) : (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  Live price is loading or market is closed...
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                This F&O call will be closed at the prevailing market price.
              </p>
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleFnOClose}
                disabled={mutation.isPending || !currentLTP}
                data-testid="button-confirm-close-call"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Confirm Close at Market Price
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Exit / Sell Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="Enter exit price"
                  data-testid="input-sell-price"
                />
              </div>
              <Button
                className="w-full"
                variant="destructive"
                onClick={() => mutation.mutate({ sellPrice: sellPrice || undefined })}
                disabled={mutation.isPending}
                data-testid="button-confirm-close-call"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Close Call
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClosePositionDialog({
  position,
  onClose,
  strategyId,
  strategyType,
  livePrices,
  getOptionPremiumLTP,
}: {
  position: Position | null;
  onClose: () => void;
  strategyId: string;
  strategyType: string;
  livePrices?: Record<string, { ltp: number; change: number; changePercent: number }>;
  getOptionPremiumLTP: (pos: Position) => number | null;
}) {
  const { toast } = useToast();
  const [exitPrice, setExitPrice] = useState("");
  const [useManualPrice, setUseManualPrice] = useState(false);

  useEffect(() => {
    if (position) {
      setExitPrice("");
      setUseManualPrice(false);
    }
  }, [position]);

  const isFnO = ["Option", "Future", "Index", "CommodityFuture"].includes(strategyType) ||
    !!(position?.strikePrice && position?.expiry);
  const currentLTP = position ? (
    position.strikePrice && position.expiry
      ? getOptionPremiumLTP(position)
      : (position.symbol ? livePrices?.[position.symbol]?.ltp : undefined)
  ) : undefined;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/positions/${position?.id}/close`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "positions"] });
      onClose();
      toast({ title: "Position closed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFnOClose = () => {
    if (useManualPrice) {
      if (!exitPrice || Number(exitPrice) <= 0) {
        toast({ title: "Exit price required", description: "Please enter a valid exit price.", variant: "destructive" });
        return;
      }
      mutation.mutate({ exitPrice: String(exitPrice) });
      return;
    }
    if (!currentLTP) {
      toast({ title: "Market price unavailable", description: "Please enter exit price manually or wait for live price.", variant: "destructive" });
      return;
    }
    mutation.mutate({ exitPrice: String(currentLTP), closeAtMarket: true });
  };

  const symbolLabel = position
    ? `${position.symbol || ""}${position.expiry ? " " + position.expiry : ""}${position.strikePrice ? " " + position.strikePrice : ""}${position.callPut ? " " + position.callPut : ""}`.trim()
    : "";

  return (
    <Dialog open={!!position} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Position - {symbolLabel || position?.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Entry: {position?.entryPrice ? Number(position.entryPrice).toFixed(2) : "N/A"}
            {position?.buySell && <span className="ml-2">({position.buySell})</span>}
          </div>
          {isFnO ? (
            <>
              {!useManualPrice && currentLTP != null ? (
                <div className="text-sm font-medium">
                  Current Market Price: {"\u20B9"}{Number(currentLTP).toFixed(2)}
                </div>
              ) : !useManualPrice ? (
                <div className="text-sm text-amber-600 dark:text-amber-400">
                  Live price is loading or market is closed...
                </div>
              ) : null}
              {useManualPrice ? (
                <div className="space-y-1.5">
                  <Label>Exit / Close Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="Enter exit price"
                    data-testid="input-exit-price-manual"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This F&O position will be closed at the prevailing market price.
                </p>
              )}
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleFnOClose}
                disabled={mutation.isPending || (!useManualPrice && !currentLTP)}
                data-testid="button-confirm-close-position"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {useManualPrice ? "Close at Entered Price" : "Confirm Close at Market Price"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setUseManualPrice(!useManualPrice)}
                data-testid="button-toggle-manual-price"
              >
                {useManualPrice ? "Use Market Price Instead" : "Enter Price Manually"}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Exit / Close Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  placeholder="Enter exit price"
                  data-testid="input-exit-price"
                />
              </div>
              <Button
                className="w-full"
                variant="destructive"
                onClick={() => mutation.mutate({ exitPrice: exitPrice || undefined })}
                disabled={mutation.isPending}
                data-testid="button-confirm-close-position"
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Close Position
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
    stopLoss: "",
    duration: "",
    durationUnit: "Days",
    theme: "",
    rationale: "",
    publishMode: "draft" as "draft" | "watchlist" | "live",
    isPublished: false,
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/strategies/${strategy?.id}/calls`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategy?.id, "calls"] });
      onOpenChange(false);
      toast({ title: "Stock call added" });
      setForm({
        stockName: "",
        action: "Buy",
        buyRangeStart: "",
        buyRangeEnd: "",
        targetPrice: "",
        stopLoss: "",
        duration: "",
        durationUnit: "Days",
        theme: "",
        rationale: "",
        publishMode: "draft",
        isPublished: false,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.publishMode === "live" && !form.rationale.trim()) {
      toast({ title: "Rationale is required to publish a call", variant: "destructive" });
      return;
    }
    mutation.mutate({
      ...form,
      strategyId: strategy?.id,
      isPublished: form.publishMode === "live",
      buyRangeStart: form.buyRangeStart || undefined,
      buyRangeEnd: form.buyRangeEnd || undefined,
      targetPrice: form.targetPrice || undefined,
      stopLoss: form.stopLoss || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      durationUnit: form.duration ? form.durationUnit : undefined,
      theme: form.theme || undefined,
    });
  };

  const segmentForSearch = strategy?.type === "Commodity" || strategy?.type === "CommodityFuture" ? "Commodity" : "Equity";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Stock Call</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label>Stock Name</Label>
            <SymbolAutocomplete
              value={form.stockName}
              onChange={(v) => setForm({ ...form, stockName: v })}
              segment={segmentForSearch}
              testId="input-stock-name"
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
            <Label>Target Price</Label>
            <Input
              type="number"
              step="0.01"
              value={form.targetPrice}
              onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
              data-testid="input-target-price"
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
            <Label>Duration</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="e.g. 3"
                className="flex-1"
                data-testid="input-duration"
              />
              <Select value={form.durationUnit} onValueChange={(v) => setForm({ ...form, durationUnit: v })}>
                <SelectTrigger className="w-[120px]" data-testid="select-duration-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Days">Days</SelectItem>
                  <SelectItem value="Weeks">Weeks</SelectItem>
                  <SelectItem value="Months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Select value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v })}>
              <SelectTrigger data-testid="select-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BTST">BTST</SelectItem>
                <SelectItem value="Momentum">Momentum</SelectItem>
                <SelectItem value="High Volatility">High Volatility</SelectItem>
                <SelectItem value="Short Term">Short Term</SelectItem>
                <SelectItem value="Medium Term">Medium Term</SelectItem>
                <SelectItem value="Long Term">Long Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Rationale <span className="text-destructive">*</span></Label>
            <Textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              rows={3}
              placeholder="Type your rationale for this call (required to publish)"
              data-testid="input-rationale"
            />
            {form.publishMode === "live" && !form.rationale.trim() && (
              <p className="text-xs text-destructive">Rationale is required to publish</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Publish Mode</Label>
            <Select value={form.publishMode} onValueChange={(v: "draft" | "watchlist" | "live") => setForm({ ...form, publishMode: v, isPublished: v === "live" })}>
              <SelectTrigger data-testid="select-publish-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="watchlist">Watchlist</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.publishMode === "draft" && "Saved privately, not visible to subscribers"}
              {form.publishMode === "watchlist" && "Saved to watchlist for monitoring"}
              {form.publishMode === "live" && "Published as an active recommendation"}
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-stock">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {form.publishMode === "live" ? "Publish Live" : form.publishMode === "watchlist" ? "Add to Watchlist" : "Save Draft"}
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
    duration: "",
    durationUnit: "Days",
    theme: "",
    rationale: "",
    isPublished: false,
    publishMode: "draft" as "draft" | "watchlist" | "live",
    enableLeg: false,
    usePercentage: false,
  });
  const [manualEntry, setManualEntry] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/strategies/${strategy?.id}/positions`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategy?.id, "positions"] });
      onOpenChange(false);
      toast({ title: "Position added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isPublished = form.publishMode === "live" || form.publishMode === "watchlist";
    if (isPublished && !form.rationale.trim()) {
      toast({ title: "Rationale is required to publish a position", variant: "destructive" });
      return;
    }
    mutation.mutate({
      ...form,
      isPublished,
      publishMode: form.publishMode,
      strategyId: strategy?.id,
      strikePrice: form.strikePrice || undefined,
      entryPrice: form.entryPrice || undefined,
      lots: form.lots ? parseInt(form.lots) : undefined,
      target: form.target || undefined,
      stopLoss: form.stopLoss || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      durationUnit: form.duration ? form.durationUnit : undefined,
      theme: form.theme || undefined,
    });
  };

  const segmentForSearch = form.segment === "Equity" ? "Equity" : form.segment === "Index" ? "Index" : "FnO";
  const isFnOSegment = form.segment === "Option" || form.segment === "Future" || form.segment === "Index";
  const symbolExchange = form.segment === "Index" ? (["SENSEX", "BANKEX"].includes(form.symbol.toUpperCase()) ? "BSE" : "NSE") : "NSE";

  const now = new Date();
  const { data: expiries, isLoading: expiriesLoading } = useQuery<string[]>({
    queryKey: ["/api/option-chain/expiries", form.symbol, symbolExchange, now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      if (!form.symbol) return [];
      const res = await fetch(`/api/option-chain/expiries?symbol=${encodeURIComponent(form.symbol)}&exchange=${symbolExchange}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isFnOSegment && form.symbol.length > 1,
  });

  const { data: optionChain, isLoading: chainLoading } = useQuery<any[]>({
    queryKey: ["/api/option-chain", form.symbol, symbolExchange, form.expiry],
    queryFn: async () => {
      if (!form.symbol || !form.expiry) return [];
      const res = await fetch(`/api/option-chain?symbol=${encodeURIComponent(form.symbol)}&exchange=${symbolExchange}&expiry=${encodeURIComponent(form.expiry)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isFnOSegment && form.symbol.length > 1 && !!form.expiry,
  });

  const selectedStrike = optionChain?.find((s: any) => String(s.strikePrice) === form.strikePrice);
  const optionLTP = selectedStrike
    ? (form.callPut === "Call" ? selectedStrike.ce?.ltp : selectedStrike.pe?.ltp) || null
    : null;

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
                  onClick={() => setForm({ ...form, segment: seg, expiry: "", strikePrice: "" })}
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
            <SymbolAutocomplete
              value={form.symbol}
              onChange={(v) => setForm({ ...form, symbol: v, expiry: "", strikePrice: "" })}
              segment={segmentForSearch}
              testId="input-symbol"
            />
          </div>

          {isFnOSegment && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={manualEntry}
                onCheckedChange={(v) => setManualEntry(!!v)}
                data-testid="checkbox-manual-entry"
              />
              <Label className="text-sm">Manual Entry (type expiry & strike manually)</Label>
            </div>
          )}

          {isFnOSegment && form.symbol && !manualEntry ? (
            <>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                {expiriesLoading ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading expiries...</div>
                ) : expiries && expiries.length > 0 ? (
                  <Select value={form.expiry} onValueChange={(v) => setForm({ ...form, expiry: v, strikePrice: "" })}>
                    <SelectTrigger data-testid="select-expiry">
                      <SelectValue placeholder="Select expiry date" />
                    </SelectTrigger>
                    <SelectContent>
                      {expiries.map((exp: string) => (
                        <SelectItem key={exp} value={exp}>
                          {new Date(exp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={form.expiry}
                    onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                    placeholder="YYYY-MM-DD"
                    data-testid="input-expiry"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Strike Price</Label>
                {chainLoading ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Loading option chain...</div>
                ) : optionChain && optionChain.length > 0 ? (
                  <Select value={form.strikePrice} onValueChange={(v) => setForm({ ...form, strikePrice: v })}>
                    <SelectTrigger data-testid="select-strike-price">
                      <SelectValue placeholder="Select strike price" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {optionChain.map((s: any) => {
                        const ceLtp = s.ce?.ltp ? `CE: ${"\u20B9"}${s.ce.ltp.toFixed(2)}` : "";
                        const peLtp = s.pe?.ltp ? `PE: ${"\u20B9"}${s.pe.ltp.toFixed(2)}` : "";
                        return (
                          <SelectItem key={s.strikePrice} value={String(s.strikePrice)}>
                            {"\u20B9"}{Number(s.strikePrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })} {ceLtp ? `(${ceLtp})` : ""} {peLtp ? `(${peLtp})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.strikePrice}
                    onChange={(e) => setForm({ ...form, strikePrice: e.target.value })}
                    data-testid="input-strike-price"
                  />
                )}
                {optionLTP !== null && (
                  <p className="text-xs font-medium text-green-600 dark:text-green-400">
                    Live {form.callPut} Premium: {"\u20B9"}{optionLTP.toFixed(2)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input
                  value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  placeholder="YYYY-MM-DD (e.g. 2026-02-10)"
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
                  placeholder="e.g. 25650"
                  data-testid="input-strike-price"
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Entry Price {isFnOSegment && optionLTP !== null && <span className="text-xs font-normal text-muted-foreground ml-1">(Current {form.callPut} Premium: {"\u20B9"}{optionLTP.toFixed(2)})</span>}</Label>
            <Input
              type="number"
              step="0.01"
              value={form.entryPrice}
              onChange={(e) => setForm({ ...form, entryPrice: e.target.value })}
              placeholder={isFnOSegment && optionLTP !== null ? `Current premium: ${optionLTP.toFixed(2)}` : ""}
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
            <Label>Duration</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="e.g. 3"
                className="flex-1"
                data-testid="input-position-duration"
              />
              <Select value={form.durationUnit} onValueChange={(v) => setForm({ ...form, durationUnit: v })}>
                <SelectTrigger className="w-[120px]" data-testid="select-position-duration-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Days">Days</SelectItem>
                  <SelectItem value="Weeks">Weeks</SelectItem>
                  <SelectItem value="Months">Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Select value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v })}>
              <SelectTrigger data-testid="select-position-theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BTST">BTST</SelectItem>
                <SelectItem value="Momentum">Momentum</SelectItem>
                <SelectItem value="High Volatility">High Volatility</SelectItem>
                <SelectItem value="Short Term">Short Term</SelectItem>
                <SelectItem value="Medium Term">Medium Term</SelectItem>
                <SelectItem value="Long Term">Long Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Rationale <span className="text-destructive">*</span></Label>
            <Textarea
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
              rows={3}
              placeholder="Type your rationale for this position (required to publish)"
              data-testid="input-position-rationale"
            />
            {(form.publishMode === "live" || form.publishMode === "watchlist") && !form.rationale.trim() && (
              <p className="text-xs text-destructive">Rationale is required to publish</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Publish Mode</Label>
            <Select value={form.publishMode} onValueChange={(v: "draft" | "watchlist" | "live") => setForm({ ...form, publishMode: v, isPublished: v !== "draft" })}>
              <SelectTrigger data-testid="select-publish-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (Save without publishing)</SelectItem>
                <SelectItem value="watchlist">Watchlist (Monitor only)</SelectItem>
                <SelectItem value="live">Live (Active recommendation)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.publishMode === "draft" && "Saved privately, not visible to subscribers"}
              {form.publishMode === "watchlist" && "Visible to subscribers as a watchlist item"}
              {form.publishMode === "live" && "Published as an active trade recommendation"}
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending} data-testid="button-save-position">
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {form.publishMode === "live" ? "Publish Live" : form.publishMode === "watchlist" ? "Add to Watchlist" : "Save Draft"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
