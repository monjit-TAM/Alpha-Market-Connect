import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndianRupee, Users, TrendingUp, FileText, Plus, Download } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import type { Strategy, Call, Subscription, Content as ContentType } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export default function DashboardHome() {
  const { user } = useAuth();

  const { data: strategies, isLoading: loadingStrategies } = useQuery<Strategy[]>({
    queryKey: ["/api/advisor/strategies"],
  });

  const { data: subscribers } = useQuery<Subscription[]>({
    queryKey: ["/api/advisor/subscribers"],
  });

  const { data: contents } = useQuery<ContentType[]>({
    queryKey: ["/api/advisor/content"],
  });

  const monthlyRevenue = (subscribers || []).length * 999;
  const ytdRevenue = monthlyRevenue * 6;

  const chartData = (strategies || []).map((s) => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "..." : s.name,
    fullName: s.name,
    cagr: Number(s.cagr || 0),
    recs: Number(s.totalRecommendations || 0),
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Subscription Revenue</h2>
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm opacity-80">Monthly Revenue</p>
                <p className="text-2xl font-bold">
                  {"\u20B9"}{monthlyRevenue.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-accent text-accent-foreground">
              <CardContent className="p-4 space-y-1">
                <p className="text-sm opacity-80">Revenue YTD</p>
                <p className="text-2xl font-bold">
                  {"\u20B9"}{ytdRevenue.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Strategy Performance</h3>
            <Card>
              <CardContent className="p-4">
                {!strategies || strategies.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                    <div className="text-center space-y-1">
                      <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground/50" />
                      <p>Create strategies to see performance</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-48" data-testid="chart-strategy-performance">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover text-popover-foreground border rounded-md p-2 shadow-md text-xs space-y-0.5">
                                  <p className="font-medium">{data.fullName}</p>
                                  <p>CAGR: {data.cagr}%</p>
                                  <p>Recommendations: {data.recs}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="cagr" radius={[4, 4, 0, 0]} maxBarSize={40}>
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.cagr >= 0 ? "hsl(145 45% 42%)" : "hsl(10 72% 48%)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/strategies">
              <Button size="sm" variant="outline" data-testid="button-add-stock">
                <Plus className="w-3 h-3 mr-1" /> Add Stock
              </Button>
            </Link>
            <Link href="/dashboard/strategies">
              <Button size="sm" variant="outline" data-testid="button-new-strategy">
                <Plus className="w-3 h-3 mr-1" /> New Strategy
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Customers Acquired</h2>
          <Tabs defaultValue="current">
            <TabsList>
              <TabsTrigger value="previous" data-testid="tab-previous-months">Previous Months</TabsTrigger>
              <TabsTrigger value="current" data-testid="tab-current-month">Current Month</TabsTrigger>
            </TabsList>
            <TabsContent value="current">
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <div className="flex items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground">
                      <span>Customer</span>
                      <div className="flex gap-6">
                        <span>EKYC Done</span>
                        <span>Risk Profiling</span>
                      </div>
                    </div>
                    {(subscribers || []).length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No subscribers yet
                      </div>
                    ) : (
                      (subscribers || []).slice(0, 5).map((sub, i) => (
                        <div key={sub.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="truncate">{sub.userId}</span>
                          <div className="flex gap-10 text-xs">
                            <span className={sub.ekycDone ? "text-accent font-medium" : "text-primary font-medium"}>
                              {sub.ekycDone ? "Yes" : "No"}
                            </span>
                            <span className={sub.riskProfiling ? "text-accent font-medium" : "text-primary font-medium"}>
                              {sub.riskProfiling ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="previous">
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No data for previous months
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Manage Media & Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(contents || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No content published yet</p>
            ) : (
              (contents || []).slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50">
                  <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{c.title}</span>
                </div>
              ))
            )}
            <Link href="/dashboard/content">
              <Button variant="outline" className="w-full mt-2" size="sm" data-testid="button-add-content">
                <Plus className="w-3 h-3 mr-1" /> Add New Content / Media
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {["Calls Report", "Customer Acquisition Report", "Financial Report"].map((r) => (
              <div key={r} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm text-primary font-medium">{r}</span>
              </div>
            ))}
            <Link href="/dashboard/reports">
              <Button className="w-full mt-2" size="sm" data-testid="button-download-reports">
                <Download className="w-3 h-3 mr-1" /> Download
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
