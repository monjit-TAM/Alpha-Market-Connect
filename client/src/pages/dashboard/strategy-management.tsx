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
import { Plus, MoreVertical, Loader2, Pencil, ChevronDown, ChevronRight, X, Search, ArrowUp, ArrowDown } from "lucide-react";
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

  const activeCalls = calls?.filter((c) => c.status === "Active") || [];
  const closedCalls = calls?.filter((c) => c.status === "Closed") || [];
  const activePositions = positions?.filter((p) => p.status === "Active") || [];
  const closedPositions = positions?.filter((p) => p.status === "Closed") || [];

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
    refetchInterval: 15000,
  });

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
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-calls">
            Active ({activeCalls.length + activePositions.length})
          </TabsTrigger>
          <TabsTrigger value="closed" data-testid="tab-closed-calls">
            Closed ({closedCalls.length + closedPositions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-3">
          {activeCalls.length === 0 && activePositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No active calls</p>
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
                  strategyId={strategy.id}
                  livePrice={pos.symbol ? livePrices?.[pos.symbol] : undefined}
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
  const pnl = livePrice && buyPrice > 0 ? ((livePrice.ltp - buyPrice) / buyPrice) * 100 : null;

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
          {call.sellPrice && <span>Exit: {Number(call.sellPrice).toFixed(2)}</span>}
          {call.gainPercent && (
            <span className={Number(call.gainPercent) >= 0 ? "text-green-600" : "text-red-600"}>
              {Number(call.gainPercent) >= 0 ? "+" : ""}{Number(call.gainPercent).toFixed(2)}%
            </span>
          )}
          <span>{call.callDate ? new Date(call.callDate).toLocaleDateString("en-IN") : ""}</span>
        </div>
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
  strategyId,
  livePrice,
}: {
  position: Position;
  onEdit?: () => void;
  strategyId: string;
  livePrice?: { ltp: number; change: number; changePercent: number };
}) {
  const { toast } = useToast();
  const isActive = position.status === "Active";
  const entryPx = Number(position.entryPrice || 0);
  const pnl = livePrice && entryPx > 0 ? ((livePrice.ltp - entryPx) / entryPx) * 100 : null;

  const closeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/positions/${position.id}/close`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategyId, "positions"] });
      toast({ title: "Position closed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

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
          {isActive && livePrice && (
            <span className="flex items-center gap-1 text-xs font-medium" data-testid={`ltp-pos-${position.id}`}>
              {"\u20B9"}{livePrice.ltp.toFixed(2)}
              {livePrice.change >= 0 ? (
                <ArrowUp className="w-3 h-3 text-green-600 dark:text-green-400" />
              ) : (
                <ArrowDown className="w-3 h-3 text-red-600 dark:text-red-400" />
              )}
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
          <span>{position.createdAt ? new Date(position.createdAt).toLocaleDateString("en-IN") : ""}</span>
        </div>
      </div>
      {isActive && (
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-position-${position.id}`}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => closeMutation.mutate()}
            disabled={closeMutation.isPending}
            data-testid={`button-close-position-${position.id}`}
          >
            {closeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        </div>
      )}
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

  useEffect(() => {
    if (call) {
      setTargetPrice(call.targetPrice || "");
      setStopLoss(call.stopLoss || "");
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
          <Button
            className="w-full"
            onClick={() => mutation.mutate({ targetPrice, stopLoss })}
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

  useEffect(() => {
    if (position) {
      setTarget(position.target || "");
      setStopLoss(position.stopLoss || "");
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
          <Button
            className="w-full"
            onClick={() => mutation.mutate({ target, stopLoss })}
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
}: {
  call: Call | null;
  onClose: () => void;
  strategyId: string;
}) {
  const { toast } = useToast();
  const [sellPrice, setSellPrice] = useState("");

  useEffect(() => {
    if (call) setSellPrice("");
  }, [call]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/advisor/strategies", strategy?.id, "calls"] });
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

  const segmentForSearch = form.segment === "Equity" ? "Equity" : form.segment === "Index" ? "Index" : "FnO";

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
            <SymbolAutocomplete
              value={form.symbol}
              onChange={(v) => setForm({ ...form, symbol: v })}
              segment={segmentForSearch}
              testId="input-symbol"
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
