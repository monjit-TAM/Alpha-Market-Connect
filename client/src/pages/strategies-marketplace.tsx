import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navbar } from "@/components/navbar";
import { Link } from "wouter";
import { Search, TrendingUp, Clock, BarChart3, Lock, Filter } from "lucide-react";
import { useState } from "react";
import type { Strategy, User } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function StrategiesMarketplace() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: strategies, isLoading } = useQuery<(Strategy & { advisor?: User })[]>({
    queryKey: ["/api/strategies/public"],
  });

  const filtered = (strategies || []).filter((s) => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === "all" || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row gap-6">
          <aside className="w-full md:w-64 space-y-4 flex-shrink-0">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-1">
                <Filter className="w-4 h-4" /> Filters
              </h3>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue placeholder="Strategy Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Equity">Equity</SelectItem>
                  <SelectItem value="Basket">Basket</SelectItem>
                  <SelectItem value="Future">Future</SelectItem>
                  <SelectItem value="Commodity">Commodity</SelectItem>
                  <SelectItem value="Option">Option</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </aside>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search strategies..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-strategies"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40" data-testid="select-sort">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="popular">Popular</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-5 space-y-3">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <Skeleton className="h-10 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-2">
                  <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No strategies found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {filtered.map((strategy) => (
                  <StrategyCard key={strategy.id} strategy={strategy} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: Strategy & { advisor?: User } }) {
  const riskColor =
    strategy.volatility === "High"
      ? "text-red-600 dark:text-red-400"
      : strategy.volatility === "Low"
        ? "text-green-600 dark:text-green-400"
        : "text-yellow-600 dark:text-yellow-400";

  return (
    <Card className="hover-elevate" data-testid={`card-strategy-${strategy.id}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold truncate">{strategy.name}</h3>
            <p className="text-xs text-muted-foreground">
              by {strategy.advisor?.companyName || strategy.advisor?.username || "Advisor"}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
            <Link href={`/strategies/${strategy.id}`}>
              <Button variant="ghost" size="sm" className="text-xs">
                Performance
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {strategy.type}
          </Badge>
          {strategy.horizon && (
            <Badge variant="outline" className="text-xs">
              {strategy.horizon}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Strategy Type</span>
          </div>
          <div className="text-right font-medium">{strategy.type}</div>

          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Active Since</span>
          </div>
          <div className="text-right font-medium text-xs">
            {strategy.createdAt ? new Date(strategy.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
          </div>

          <div className="text-muted-foreground">Horizon</div>
          <div className="text-right font-medium">{strategy.horizon || "N/A"}</div>

          <div className="text-muted-foreground">Live Calls</div>
          <div className="text-right font-medium">{strategy.totalRecommendations || 0}</div>
        </div>

        {strategy.minimumInvestment && (
          <p className="text-sm">
            <span className="text-muted-foreground">Minimum Investment:</span>{" "}
            <span className="font-semibold">
              {"\u20B9"}{Number(strategy.minimumInvestment).toLocaleString("en-IN")}
            </span>
          </p>
        )}

        {strategy.description && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Strategy Description</p>
            <p className="text-sm text-muted-foreground line-clamp-2">{strategy.description}</p>
          </div>
        )}

        <Link href={`/strategies/${strategy.id}`}>
          <Button className="w-full" data-testid={`button-view-strategy-${strategy.id}`}>
            View More
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
