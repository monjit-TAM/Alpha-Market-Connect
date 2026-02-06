import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Lock, IndianRupee, ShieldCheck, CreditCard } from "lucide-react";
import type { Strategy, Plan, User } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useState } from "react";

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const planId = params.get("plan");
  const { user } = useAuth();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const { data: strategy, isLoading: strategyLoading } = useQuery<Strategy & { advisor?: User }>({
    queryKey: ["/api/strategies", id],
  });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/strategies", id, "plans"],
    enabled: !!id,
  });

  const isLoading = strategyLoading || plansLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 space-y-6">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  if (!strategy || !planId) return null;

  const selectedPlan = (plans || []).find(p => p.id === planId);
  if (!selectedPlan) return null;

  const advisorName = strategy.advisor?.companyName || strategy.advisor?.username || "Advisor";

  const formatDuration = (days: number | null | undefined) => {
    if (!days) return "Unlimited";
    if (days === 30) return "1 Month";
    if (days === 90) return "3 Months";
    if (days === 180) return "6 Months";
    if (days === 365) return "1 Year";
    return `${days} Days`;
  };

  const handlePayment = async () => {
    if (!user) {
      toast({ title: "Please sign in to subscribe", variant: "destructive" });
      navigate("/login");
      return;
    }
    setProcessing(true);
    try {
      await apiRequest("POST", `/api/strategies/${id}/subscribe`, { planId });
      toast({ title: "Subscription successful!", description: "You have been subscribed to this strategy." });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies", id] });
      navigate(`/strategies/${id}`);
    } catch (err: any) {
      toast({ title: "Subscription failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-2xl mx-auto px-4 md:px-6 py-8 w-full space-y-6">
        <div>
          <Link href={`/strategies/${id}/subscribe`}>
            <Button variant="ghost" size="sm" className="mb-3" data-testid="button-back-plans">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Plans
            </Button>
          </Link>
          <h1 className="text-2xl font-bold" data-testid="text-payment-title">Complete Payment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review your order and proceed with payment
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Strategy</span>
                <span className="text-sm font-medium" data-testid="text-order-strategy">{strategy.name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Advisor</span>
                <span className="text-sm font-medium" data-testid="text-order-advisor">{advisorName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Plan</span>
                <span className="text-sm font-medium" data-testid="text-order-plan">{selectedPlan.name}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm font-medium" data-testid="text-order-duration">{formatDuration(selectedPlan.durationDays)}</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Total Amount</span>
                <span className="text-xl font-bold flex items-center gap-0.5" data-testid="text-order-total">
                  <IndianRupee className="w-4 h-4" />
                  {Number(selectedPlan.amount).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Payment Gateway
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium" data-testid="text-payment-coming-soon">Payment Gateway Integration Coming Soon</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  The payment gateway will be integrated shortly. For now, you can complete the subscription to access this strategy.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Secure payment powered by AlphaMarket</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href={`/strategies/${id}/subscribe`}>
            <Button variant="outline" data-testid="button-cancel-payment">
              Cancel
            </Button>
          </Link>
          <Button
            onClick={handlePayment}
            disabled={processing}
            data-testid="button-confirm-payment"
          >
            {processing ? "Processing..." : `Pay \u20B9${Number(selectedPlan.amount).toLocaleString("en-IN")} & Subscribe`}
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
