import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { TrendingUp, TrendingDown, Calendar, BarChart3, Star, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Strategy, Call, User } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: strategy, isLoading } = useQuery<Strategy & { advisor?: User }>({
    queryKey: ["/api/strategies", id],
  });

  const { data: calls } = useQuery<Call[]>({
    queryKey: ["/api/strategies", id, "calls"],
    enabled: !!id,
  });

  const handleSubscribe = async () => {
    if (!user) {
      toast({ title: "Please sign in to subscribe", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", `/api/strategies/${id}/subscribe`);
      toast({ title: "Subscribed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id] });
    } catch (err: any) {
      toast({ title: "Subscribe failed", description: err.message, variant: "destructive" });
    }
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Advisor Name: {strategy.advisor?.companyName || strategy.advisor?.username}
            </p>
            <h1 className="text-2xl font-bold">{strategy.name}</h1>
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
                    <p className="font-semibold">{strategy.cagr ? `${strategy.cagr}%` : "--"}</p>
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
                    <p className="font-semibold">{strategy.totalRecommendations || 0}</p>
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
                    <p className="font-semibold text-sm">
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
                    <TrendingUp className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stocks in Buy Zone</p>
                    <p className="font-semibold">{strategy.stocksInBuyZone || 0}</p>
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
                  <p className="font-medium">{strategy.type}</p>
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
            <CardTitle className="text-base">Active Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {activeCalls.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Lock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>Currently there are no Current Trades available in this Strategy.</p>
                <p>Your advisor might add new calls to this section soon.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={handleSubscribe} data-testid="button-subscribe-view">
                  Subscribe to view
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Stock Name</th>
                      <th className="pb-2 font-medium text-muted-foreground">Buy Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Target</th>
                      <th className="pb-2 font-medium text-muted-foreground">Stop Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCalls.map((call) => (
                      <tr key={call.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{call.stockName}</td>
                        <td className="py-2">{"\u20B9"}{call.entryPrice || call.buyRangeStart}</td>
                        <td className="py-2">{"\u20B9"}{call.targetPrice}</td>
                        <td className="py-2">{"\u20B9"}{call.stopLoss}</td>
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
            <CardTitle className="text-base">Past / Closed Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {closedCalls.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">No closed recommendations yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
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
                        <td className="py-2">{"\u20B9"}{call.sellPrice || "--"}</td>
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

        <div className="flex items-center gap-1">
          <p className="text-sm text-muted-foreground mr-1">Investor Rating</p>
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="w-4 h-4 text-muted-foreground/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
