import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/navbar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  BarChart3,
  BookOpen,
  ListChecks,
  FolderKanban,
  IndianRupee,
  User,
  LogOut,
  CreditCard,
} from "lucide-react";

import DashboardHome from "./dashboard-home";
import StrategyManagement from "./strategy-management";
import PlansPage from "./plans";
import ContentPage from "./content-page";
import AdvisorProfile from "./advisor-profile";
import ReportsPage from "./reports";
import PaymentsPage from "./payments-page";

const sidebarItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { title: "Strategies", icon: ListChecks, path: "/dashboard/strategies" },
  { title: "Plans", icon: FolderKanban, path: "/dashboard/plans" },
  { title: "Payments", icon: CreditCard, path: "/dashboard/payments" },
  { title: "Content", icon: BookOpen, path: "/dashboard/content" },
  { title: "Reports", icon: BarChart3, path: "/dashboard/reports" },
  { title: "Profile", icon: User, path: "/dashboard/profile" },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user || user.role !== "advisor") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">You need to be signed in as an Advisor to access the dashboard.</p>
            <Link href="/login">
              <a className="text-primary font-medium">Sign In</a>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  const renderPage = () => {
    if (location === "/dashboard/strategies") return <StrategyManagement />;
    if (location === "/dashboard/plans") return <PlansPage />;
    if (location === "/dashboard/payments") return <PaymentsPage />;
    if (location === "/dashboard/content") return <ContentPage />;
    if (location === "/dashboard/reports") return <ReportsPage />;
    if (location === "/dashboard/profile") return <AdvisorProfile />;
    return <DashboardHome />;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-[calc(100vh-3.5rem)] w-full">
          <Sidebar>
            <SidebarContent className="pt-2">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {sidebarItems.map((item) => {
                      const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path));
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            data-testid={`sidebar-${item.title.toLowerCase()}`}
                          >
                            <Link href={item.path}>
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={logout}
                        data-testid="sidebar-logout"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center h-10 px-3 border-b bg-background flex-shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {renderPage()}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}
