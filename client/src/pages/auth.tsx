import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { TrendingUp, Loader2, Shield, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.role === "admin") {
        navigate("/admin");
      } else if (user.role === "advisor") {
        navigate("/dashboard");
      } else {
        navigate("/strategies");
      }
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <Link href="/">
            <div className="flex items-center justify-center gap-2 cursor-pointer mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <TrendingUp className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">AlphaMarket</span>
            </div>
          </Link>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="input-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
              {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Sign In
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary font-medium">
                Register
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    role: "investor" as "investor" | "advisor",
    companyName: "",
    sebiRegNumber: "",
    sebiCertUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.role === "advisor" && !form.sebiRegNumber) {
      toast({ title: "SEBI Registration Number is required for advisors", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await register(form);
      if (form.role === "advisor") {
        toast({
          title: "Registration successful",
          description: "Your advisor account is pending admin approval. You will be notified once approved.",
        });
        navigate("/dashboard");
      } else {
        navigate("/strategies");
      }
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <Link href="/">
            <div className="flex items-center justify-center gap-2 cursor-pointer mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <TrendingUp className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">AlphaMarket</span>
            </div>
          </Link>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Join as an Investor or Advisor</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>I am a</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                <SelectTrigger data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="advisor">Advisor (RA/RIA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-username">Username</Label>
              <Input
                id="reg-username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                data-testid="input-reg-username"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                data-testid="input-reg-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">Mobile Number</Label>
              <Input
                id="reg-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 XXXXX-XXXXX"
                data-testid="input-reg-phone"
              />
            </div>
            {form.role === "advisor" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-company">Company / Firm Name</Label>
                  <Input
                    id="reg-company"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    data-testid="input-reg-company"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-sebi">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      SEBI Registration Number *
                    </span>
                  </Label>
                  <Input
                    id="reg-sebi"
                    value={form.sebiRegNumber}
                    onChange={(e) => setForm({ ...form, sebiRegNumber: e.target.value })}
                    placeholder="e.g. INH000012345"
                    required
                    data-testid="input-reg-sebi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-cert">
                    <span className="flex items-center gap-1">
                      <Upload className="w-3 h-3" />
                      SEBI Registration Certificate URL
                    </span>
                  </Label>
                  <Input
                    id="reg-cert"
                    value={form.sebiCertUrl}
                    onChange={(e) => setForm({ ...form, sebiCertUrl: e.target.value })}
                    placeholder="https://drive.google.com/... or upload link"
                    data-testid="input-reg-cert-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide a link to your SEBI registration certificate (Google Drive, Dropbox, etc.)
                  </p>
                </div>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Your advisor account will be reviewed and approved by our admin team before your profile and strategies become visible to investors.
                  </p>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                data-testid="input-reg-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-register">
              {loading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Create Account
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium">
                Sign In
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
