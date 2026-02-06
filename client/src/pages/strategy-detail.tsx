import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { TrendingUp, Calendar, BarChart3, Star, Lock, Zap, Shield, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Strategy, Call, User } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

function getRiskColor(risk: string | null | undefined) {
  if (!risk) return "text-muted-foreground bg-muted";
  if (risk.toLowerCase().includes("high")) return "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
  if (risk.toLowerCase().includes("low")) return "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
  return "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
}

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: strategy, isLoading } = useQuery<Strategy & { advisor?: User }>({
    queryKey: ["/api/strategies", id],
  });

  const { data: calls } = useQuery<Call[]>({
    queryKey: ["/api/strategies", id, "calls"],
    enabled: !!id,
  });

  const { data: subStatus } = useQuery<{ subscribed: boolean }>({
    queryKey: ["/api/strategies", id, "subscription-status"],
    queryFn: async () => {
      const res = await fetch(`/api/strategies/${id}/subscription-status`);
      if (!res.ok) return { subscribed: false };
      return res.json();
    },
    enabled: !!id && !!user,
  });

  const isSubscribed = subStatus?.subscribed || false;
  const isAdvisor = user?.role === "advisor";
  const isAdmin = user?.role === "admin";
  const canViewActiveCalls = isSubscribed || isAdvisor || isAdmin;

  const handleSubscribe = () => {
    if (!user) {
      toast({ title: "Please sign in to subscribe", variant: "destructive" });
      navigate("/login");
      return;
    }
    navigate(`/strategies/${id}/subscribe`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!strategy) return null;

  const activeCalls = (calls || []).filter((c) => c.status === "Active");
  const closedCalls = (calls || []).filter((c) => c.status === "Closed");
  const advisorName = strategy.advisor?.companyName || strategy.advisor?.username || "Advisor";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6 w-full">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              by {advisorName}
              {strategy.advisor?.sebiRegNumber && (
                <span className="ml-2 text-xs">({strategy.advisor.sebiRegNumber})</span>
              )}
            </p>
            <h1 className="text-2xl font-bold" data-testid="text-strategy-title">{strategy.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={getRiskColor(strategy.riskLevel)}>
                {strategy.riskLevel || "Medium Risk"}
              </Badge>
              <Badge variant="outline">{strategy.type === "CommodityFuture" ? "Commodity Future" : strategy.type}</Badge>
              {strategy.horizon && <Badge variant="outline">{strategy.horizon}</Badge>}
            </div>
          </div>
          <Button onClick={handleSubscribe} data-testid="button-subscribe">
            Subscribe
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm leading-relaxed">
              {strategy.description}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CAGR</p>
                    <p className="font-semibold" data-testid="text-cagr">{strategy.cagr ? `${strategy.cagr}%` : "--"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Recommendations</p>
                    <p className="font-semibold" data-testid="text-total-recs">{strategy.totalRecommendations || 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Strategy Live Since</p>
                    <p className="font-semibold text-sm" data-testid="text-live-since">
                      {strategy.createdAt
                        ? new Date(strategy.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "N/A"}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-accent/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Live Calls</p>
                    <p className="font-semibold" data-testid="text-live-calls">{activeCalls.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Strategy Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Theme</p>
                  <p className="font-medium">{strategy.theme?.join(", ") || strategy.type}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Volatility</p>
                  <p className="font-medium">{strategy.volatility || "Medium"}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium">{strategy.type === "CommodityFuture" ? "Commodity Future" : strategy.type}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Horizon</p>
                  <p className="font-medium">{strategy.horizon || "N/A"}</p>
                </div>
                {strategy.minimumInvestment && Number(strategy.minimumInvestment) > 0 && (
                  <div className="p-3 rounded-md bg-muted/50 text-center space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground">Minimum Investment</p>
                    <p className="font-medium">{"\u20B9"}{Number(strategy.minimumInvestment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Stocks in Buy Zone</p>
                  <p className="font-medium">{strategy.stocksInBuyZone || 0}</p>
                </div>
                <div className="p-3 rounded-md bg-muted/50 text-center space-y-1">
                  <p className="text-xs text-muted-foreground">Last Recommended</p>
                  <p className="font-medium text-xs">
                    {strategy.modifiedAt
                      ? new Date(strategy.modifiedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Active Recommendations ({activeCalls.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!canViewActiveCalls ? (
              <div className="text-center py-8 space-y-3" data-testid="locked-active-calls">
                <div className="w-16 h-16 rounded-full bg-muted/80 flex items-center justify-center mx-auto">
                  <Lock className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Subscribe to view active recommendations</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Active trades and live calls are only available to subscribers. Subscribe now to get real-time trade alerts.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {activeCalls.length} active call{activeCalls.length !== 1 ? "s" : ""}</span>
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> SEBI Registered</span>
                </div>
                <Button onClick={handleSubscribe} data-testid="button-subscribe-unlock">
                  Subscribe to Unlock
                </Button>
              </div>
            ) : activeCalls.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <p>No active trades at the moment. New calls will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-active-calls">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Stock Name</th>
                      <th className="pb-2 font-medium text-muted-foreground">Buy Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Target</th>
                      <th className="pb-2 font-medium text-muted-foreground">Stop Loss</th>
                      <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCalls.map((call) => (
                      <tr key={call.id} className="border-b last:border-0" data-testid={`row-call-${call.id}`}>
                        <td className="py-2 font-medium">{call.stockName}</td>
                        <td className="py-2">{"\u20B9"}{call.entryPrice || call.buyRangeStart}</td>
                        <td className="py-2">{call.targetPrice ? `\u20B9${call.targetPrice}` : "--"}</td>
                        <td className="py-2">{call.stopLoss ? `\u20B9${call.stopLoss}` : "--"}</td>
                        <td className="py-2 text-xs">
                          {call.callDate ? new Date(call.callDate).toLocaleDateString("en-IN") : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Past / Closed Recommendations ({closedCalls.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {closedCalls.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">No closed recommendations yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-closed-calls">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Stock Name</th>
                      <th className="pb-2 font-medium text-muted-foreground">Buy Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Sell Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Gain/Loss</th>
                      <th className="pb-2 font-medium text-muted-foreground">Call Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedCalls.map((call) => (
                      <tr key={call.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{call.stockName}</td>
                        <td className="py-2">{"\u20B9"}{call.entryPrice || call.buyRangeStart}</td>
                        <td className="py-2">{call.sellPrice ? `\u20B9${call.sellPrice}` : "--"}</td>
                        <td className="py-2">
                          <span className={Number(call.gainPercent) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {call.gainPercent ? `${call.gainPercent}%` : "--"}
                          </span>
                        </td>
                        <td className="py-2 text-xs">
                          {call.callDate ? new Date(call.callDate).toLocaleDateString("en-IN") : "--"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pricing Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Subscribe to access all calls, positions, and live updates from this strategy.
              </p>
              <Button onClick={handleSubscribe} data-testid="button-subscribe-plan">
                Subscribe Now
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-1">
          <p className="text-sm text-muted-foreground mr-1">Investor Rating</p>
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="w-4 h-4 text-muted-foreground/30" />
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
