import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

export default function PaymentCallbackPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderId = params.get("order_id");

  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [strategyId, setStrategyId] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setStatus("failed");
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;

    const verify = async () => {
      try {
        const res = await apiRequest("POST", "/api/payments/verify", { orderId });
        const data = await res.json();

        if (data.success && data.orderStatus === "PAID") {
          setStatus("success");
          const paymentRes = await fetch(`/api/payments/history`, { credentials: "include" });
          if (paymentRes.ok) {
            const payments = await paymentRes.json();
            const match = payments.find((p: any) => p.orderId === orderId);
            if (match?.strategyId) setStrategyId(match.strategyId);
          }
        } else if (data.orderStatus === "ACTIVE" && attempts < maxAttempts) {
          attempts++;
          setTimeout(verify, 3000);
        } else {
          setStatus("failed");
        }
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(verify, 3000);
        } else {
          setStatus("failed");
        }
      }
    };

    verify();
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
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  {strategyId && (
                    <Link href={`/strategies/${strategyId}`}>
                      <Button data-testid="button-view-strategy">
                        View Strategy
                      </Button>
                    </Link>
                  )}
                  <Link href="/strategies">
                    <Button variant="outline" data-testid="button-browse-strategies">
                      Browse Strategies
                    </Button>
                  </Link>
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
