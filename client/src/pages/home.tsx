import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Shield, BarChart3, Users, ArrowRight, CheckCircle } from "lucide-react";
import { Navbar } from "@/components/navbar";

export default function Home() {
  const features = [
    {
      icon: Shield,
      title: "SEBI Registered Advisors",
      desc: "All advisors on AlphaMarket are SEBI registered Research Analysts (RA) or Registered Investment Advisors (RIA).",
    },
    {
      icon: BarChart3,
      title: "Transparent Performance",
      desc: "Track real-time strategy performance with CAGR, recommendations, and complete call history.",
    },
    {
      icon: Users,
      title: "Direct Advisory Access",
      desc: "Subscribe to strategies and receive actionable calls directly from verified advisors.",
    },
    {
      icon: TrendingUp,
      title: "Multi-Segment Coverage",
      desc: "Strategies across Cash, F&O, Commodity segments including Intraday, Positional, and Long Term calls.",
    },
  ];

  const stats = [
    { value: "50+", label: "Registered Advisors" },
    { value: "200+", label: "Active Strategies" },
    { value: "10K+", label: "Investors" },
    { value: "95%", label: "Compliance Rate" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Badge variant="secondary" className="px-4 py-1">
              India's Premier Advisory Marketplace
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
              Connect with SEBI Registered{" "}
              <span className="text-primary">Investment Advisors</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              AlphaMarket bridges the gap between SEBI registered Research Analysts,
              Investment Advisors, Investors and Brokers. Browse strategies, subscribe
              to expert calls, and build your portfolio with confidence.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link href="/strategies">
                <Button size="lg" data-testid="button-browse-strategies">
                  Browse Strategies
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="outline" size="lg" data-testid="button-register-advisor">
                  Register as Advisor
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="text-center space-y-1">
                <p className="text-2xl md:text-3xl font-bold text-primary">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 md:px-6 py-16">
        <div className="text-center mb-10 space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold">Why AlphaMarket?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A transparent, compliant platform for financial advisory services in India.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <Card key={f.title} className="hover-elevate">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/30 border-t">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-16">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <h2 className="text-2xl md:text-3xl font-bold">For Advisors</h2>
              <p className="text-muted-foreground">
                Grow your advisory practice with our comprehensive SaaS platform.
                Manage strategies, publish calls, track performance, and handle compliance
                reporting - all from one dashboard.
              </p>
              <ul className="space-y-2">
                {[
                  "Create & manage multiple strategies",
                  "Publish calls across segments (Cash, F&O, Commodity)",
                  "Track subscriber revenue and growth",
                  "Download compliance reports (Call, Financial, Client)",
                  "Publish research & market updates",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register">
                <Button data-testid="button-become-advisor">
                  Become an Advisor
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="space-y-5">
              <h2 className="text-2xl md:text-3xl font-bold">For Investors</h2>
              <p className="text-muted-foreground">
                Access expert-curated investment strategies from SEBI-registered professionals.
                Subscribe to strategies that match your investment goals and risk appetite.
              </p>
              <ul className="space-y-2">
                {[
                  "Browse verified advisor profiles & track records",
                  "Subscribe to curated investment strategies",
                  "Receive actionable Buy/Sell calls",
                  "View transparent performance metrics",
                  "Rate and review advisor performance",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/strategies">
                <Button variant="outline" data-testid="button-explore-strategies">
                  Explore Strategies
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <h4 className="font-semibold text-sm mb-3">Advisors</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>Partnerships</li>
                <li>Data Partners</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>Careers</li>
                <li>Press</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Disclosures</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>Privacy Policy</li>
                <li>Grievances</li>
                <li>Terms and Conditions</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">About us</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>Contact us</li>
                <li>Help Center</li>
                <li>Site Map</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-center text-xs text-muted-foreground">
            AlphaMarket connects investors with advisors to receive advice on investing or
            trading in stock market, commodity, and F&O segments.
          </div>
        </div>
      </footer>
    </div>
  );
}
