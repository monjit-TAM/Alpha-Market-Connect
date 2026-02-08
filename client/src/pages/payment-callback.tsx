import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

export default function PaymentCallbackPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderId = params.get("order_id");
  const verifyToken = params.get("vt");

  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [riskProfilingRequired, setRiskProfilingRequired] = useState(false);
  const [riskProfilingCompleted, setRiskProfilingCompleted] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setStatus("failed");
      return;
    }

    let attempts = 0;
    const maxAttempts = 8;
    let cancelled = false;

    const verify = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderId, verifyToken }),
        });

        if (!res.ok) {
          console.error("Payment verify HTTP error:", res.status, await res.text());
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(verify, 3000);
          } else {
            setStatus("failed");
          }
          return;
        }

        const data = await res.json();

        if (data.success && data.orderStatus === "PAID") {
          setStatus("success");
          try {
            if (data.subscriptionId) {
              setSubscriptionId(data.subscriptionId);
              const rpCheck = await fetch(`/api/risk-profiling/check?subscriptionId=${data.subscriptionId}`, { credentials: "include" });
              if (rpCheck.ok) {
                const rpData = await rpCheck.json();
                setRiskProfilingRequired(rpData.requiresRiskProfiling);
                setRiskProfilingCompleted(rpData.completed);
              }
            }
            const paymentRes = await fetch(`/api/payments/history`, { credentials: "include" });
            if (paymentRes.ok) {
              const payments = await paymentRes.json();
              const match = payments.find((p: any) => p.orderId === orderId);
              if (match?.strategyId) setStrategyId(match.strategyId);
            }
          } catch {}
        } else if ((data.orderStatus === "ACTIVE" || data.orderStatus === "PENDING") && attempts < maxAttempts) {
          attempts++;
          setTimeout(verify, 3000);
        } else {
          setStatus("failed");
        }
      } catch (err) {
        console.error("Payment verify error:", err);
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(verify, 3000);
        } else {
          setStatus("failed");
        }
      }
    };

    const timer = setTimeout(verify, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-lg mx-auto px-4 md:px-6 py-16 w-full flex items-start justify-center">
        <Card className="w-full">
          <CardContent className="py-12 text-center space-y-6">
            {status === "loading" && (
              <>
                <Loader2 className="w-16 h-16 mx-auto animate-spin text-muted-foreground" data-testid="icon-payment-loading" />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold" data-testid="text-payment-verifying">Verifying Payment...</h2>
                  <p className="text-sm text-muted-foreground">
                    Please wait while we confirm your payment. Do not close this page.
                  </p>
                </div>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" data-testid="icon-payment-success" />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold" data-testid="text-payment-success">Payment Successful!</h2>
                  <p className="text-sm text-muted-foreground">
                    Your subscription has been activated. You now have full access to the strategy's recommendations.
                  </p>
                </div>

                {riskProfilingRequired && !riskProfilingCompleted && subscriptionId && (
                  <div className="p-4 rounded-md border border-accent/30 bg-accent/5 space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-accent" />
                      <p className="text-sm font-medium">Risk Profiling Required</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your advisor requires risk profiling to be completed. This helps ensure you receive suitable investment recommendations.
                    </p>
                    <Link href={`/risk-profiling?subscriptionId=${subscriptionId}`}>
                      <Button className="mt-2" data-testid="button-complete-risk-profile">
                        <ShieldCheck className="w-4 h-4 mr-1" />
                        Complete Risk Profile
                      </Button>
                    </Link>
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Link href="/investor-dashboard">
                    <Button variant={riskProfilingRequired && !riskProfilingCompleted ? "outline" : "default"} data-testid="button-go-dashboard">
                      Go to Dashboard
                    </Button>
                  </Link>
                  {strategyId && (
                    <Link href={`/strategies/${strategyId}`}>
                      <Button variant="outline" data-testid="button-view-strategy">
                        View Strategy
                      </Button>
                    </Link>
                  )}
                </div>
              </>
            )}

            {status === "failed" && (
              <>
                <XCircle className="w-16 h-16 mx-auto text-destructive" data-testid="icon-payment-failed" />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold" data-testid="text-payment-failed">Payment Failed</h2>
                  <p className="text-sm text-muted-foreground">
                    Your payment could not be completed. No amount has been charged. Please try again.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Button onClick={() => navigate("/strategies")} data-testid="button-try-again">
                    Browse Strategies
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
