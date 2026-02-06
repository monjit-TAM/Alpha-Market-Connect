import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navbar } from "@/components/navbar";
import { Link } from "wouter";
import { Search, Filter, CheckCircle, Shield } from "lucide-react";
import { useState } from "react";
import type { User } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AdvisorsListing() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const { data: advisors, isLoading } = useQuery<(User & { liveStrategies?: number })[]>({
    queryKey: ["/api/advisors"],
  });

  const filtered = (advisors || []).filter(
    (a) => !search || (a.companyName || a.username).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row gap-6">
          <aside className="w-full md:w-64 space-y-4 flex-shrink-0">
            <h3 className="font-semibold text-sm flex items-center gap-1">
              <Filter className="w-4 h-4" /> Filters
            </h3>
          </aside>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search advisors..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-advisors"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40" data-testid="select-sort-advisors">
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
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <Skeleton className="h-5 w-40" />
                      </div>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-2">
                  <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No advisors found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {filtered.map((advisor) => (
                  <AdvisorCard key={advisor.id} advisor={advisor} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdvisorCard({ advisor }: { advisor: User & { liveStrategies?: number } }) {
  return (
    <Card className="hover-elevate" data-testid={`card-advisor-${advisor.id}`}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              {advisor.logoUrl && <AvatarImage src={advisor.logoUrl} />}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {(advisor.companyName || advisor.username).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{advisor.companyName || advisor.username}</h3>
              {advisor.sebiRegNumber && (
                <p className="text-xs text-muted-foreground">SEBI: {advisor.sebiRegNumber}</p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            <Shield className="w-3 h-3 mr-1" />
            Registered
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Theme</span>
            <p className="font-medium">{advisor.themes?.join(", ") || "Equity"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Active Since</span>
            <p className="font-medium text-xs">
              {advisor.activeSince
                ? new Date(advisor.activeSince).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                : advisor.createdAt
                  ? new Date(advisor.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                  : "N/A"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Registered</span>
            <p className="font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-accent" /> Yes
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Live Strategies</span>
            <p className="font-medium">{advisor.liveStrategies || 0}</p>
          </div>
        </div>

        {advisor.overview && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Advisor Overview</p>
            <p className="text-sm text-muted-foreground line-clamp-3">{advisor.overview}</p>
          </div>
        )}

        <Link href={`/advisors/${advisor.id}`}>
          <Button className="w-full" data-testid={`button-view-advisor-${advisor.id}`}>
            View Details
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
