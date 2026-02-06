import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { LoginPage, RegisterPage } from "@/pages/auth";
import StrategiesMarketplace from "@/pages/strategies-marketplace";
import StrategyDetail from "@/pages/strategy-detail";
import AdvisorsListing from "@/pages/advisors-listing";
import AdvisorDetail from "@/pages/advisor-detail";
import Dashboard from "@/pages/dashboard/index";
import AdminDashboard from "@/pages/admin/index";
import MarketOutlook from "@/pages/market-outlook";
import LearnPage from "@/pages/learn";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/strategies" component={StrategiesMarketplace} />
      <Route path="/strategies/:id" component={StrategyDetail} />
      <Route path="/advisors" component={AdvisorsListing} />
      <Route path="/advisors/:id" component={AdvisorDetail} />
      <Route path="/market-outlook" component={MarketOutlook} />
      <Route path="/learn" component={LearnPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/:rest*" component={Dashboard} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/:rest*" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
