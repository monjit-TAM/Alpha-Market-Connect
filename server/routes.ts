import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { sendRegistrationNotification, sendUserWelcomeEmail, sendPasswordResetEmail, sendAdvisorAgreementEmail, sendEsignAgreementEmail } from "./email";
import { getLiveQuote, getLivePrices, setGrowwAccessToken, getGrowwTokenStatus, getOptionChainExpiries, getOptionChain } from "./groww";
import type { Plan } from "@shared/schema";
import { esignAgreements } from "@shared/schema";
import { db } from "./db";
import { and, eq, desc } from "drizzle-orm";
import nseSymbols from "./data/nse-symbols.json";
import { createCashfreeOrder, fetchCashfreeOrder, fetchCashfreePayments, verifyCashfreeWebhook } from "./cashfree";
import { notifyStrategySubscribers, notifyAllUsers, notifyAllVisitors, vapidPublicKey, pushEnabled } from "./push";
import { sendAadhaarOtp, verifyAadhaarOtp, verifyPan, isSandboxConfigured } from "./sandbox-kyc";

const scryptAsync = promisify(scrypt);

function generateVerifyToken(orderId: string, userId: string): string {
  const secret = process.env.SESSION_SECRET!;
  const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
  return createHmac("sha256", secret).update(`${orderId}:${userId}:${hourBucket}`).digest("hex").slice(0, 32);
}

function validateVerifyToken(token: string, orderId: string, userId: string): boolean {
  if (!token || token.length !== 32) return false;
  const secret = process.env.SESSION_SECRET!;
  const now = Math.floor(Date.now() / (1000 * 60 * 60));
  for (let i = 0; i <= 2; i++) {
    const bucket = now - i;
    const expected = createHmac("sha256", secret).update(`${orderId}:${userId}:${bucket}`).digest("hex").slice(0, 32);
    if (timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
  }
  return false;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashed, "hex"), buf);
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "alphamarket-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
      },
    })
  );

  registerObjectStorageRoutes(app);

  function requireAuth(req: Request, res: Response, next: Function) {
    if (!req.session.userId) {
      return res.status(401).send("Not authenticated");
    }
    next();
  }

  async function requireAdmin(req: Request, res: Response, next: Function) {
    if (!req.session.userId) {
      return res.status(401).send("Not authenticated");
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).send("Admin access required");
    }
    next();
  }

  async function requireAdvisor(req: Request, res: Response, next: Function) {
    if (!req.session.userId) {
      return res.status(401).send("Not authenticated");
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "advisor") {
      return res.status(403).send("Advisor access required");
    }
    next();
  }

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const baseUrl = process.env.SITE_DOMAIN
        ? `https://${process.env.SITE_DOMAIN}`
        : "https://alphamarket.co.in";

      const strategies = await storage.getPublishedStrategies();
      const advisors = await storage.getAdvisors();

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/strategies", priority: "0.9", changefreq: "daily" },
        { loc: "/advisors", priority: "0.9", changefreq: "daily" },
        { loc: "/market-outlook", priority: "0.8", changefreq: "daily" },
        { loc: "/learn", priority: "0.8", changefreq: "weekly" },
        { loc: "/login", priority: "0.5", changefreq: "monthly" },
        { loc: "/register", priority: "0.5", changefreq: "monthly" },
        { loc: "/terms-and-conditions", priority: "0.3", changefreq: "yearly" },
        { loc: "/cancellation-policy", priority: "0.3", changefreq: "yearly" },
        { loc: "/privacy-policy", priority: "0.3", changefreq: "yearly" },
        { loc: "/legal-agreement", priority: "0.3", changefreq: "yearly" },
        { loc: "/shipping-and-delivery", priority: "0.3", changefreq: "yearly" },
        { loc: "/contact-us", priority: "0.4", changefreq: "monthly" },
      ];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      for (const page of staticPages) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}${page.loc}</loc>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += `  </url>\n`;
      }

      for (const strategy of strategies) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/strategies/${strategy.id}</loc>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }

      for (const advisor of advisors) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/advisors/${advisor.id}</loc>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }

      xml += `</urlset>`;

      res.set("Content-Type", "application/xml");
      res.send(xml);
    } catch (err: any) {
      res.status(500).send("Error generating sitemap");
    }
  });

  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, phone, role, companyName, sebiRegNumber, sebiCertUrl, agreementConsent } = req.body;
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(400).send("Username already taken");
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).send("Email already registered");

      if (role === "advisor" && !agreementConsent) {
        return res.status(400).send("Advisor registration requires agreement to both platform agreements");
      }
      if (role === "advisor" && !sebiRegNumber) {
        return res.status(400).send("SEBI Registration Number is required for advisors");
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        phone: phone || null,
        role: role || "investor",
        companyName: companyName || null,
        overview: null,
        themes: null,
        logoUrl: null,
        sebiCertUrl: role === "advisor" ? (sebiCertUrl || null) : null,
        sebiRegNumber: role === "advisor" ? (sebiRegNumber || null) : null,
        isRegistered: role === "advisor",
        isApproved: false,
        agreementConsent: role === "advisor" ? (agreementConsent || false) : false,
        agreementConsentDate: role === "advisor" && agreementConsent ? new Date() : null,
        activeSince: new Date(),
      });

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);

      sendRegistrationNotification({
        username,
        email,
        phone: phone || undefined,
        role: role || "investor",
        companyName: companyName || undefined,
        sebiRegNumber: sebiRegNumber || undefined,
        sebiCertUrl: sebiCertUrl || undefined,
      }).catch((err) => console.error("Email notification error:", err));

      sendUserWelcomeEmail({
        email,
        username,
        role: role || "investor",
        companyName: companyName || undefined,
      }).catch((err) => console.error("Welcome email error:", err));

      if (role === "advisor" && agreementConsent) {
        sendAdvisorAgreementEmail({
          email,
          username,
          companyName: companyName || undefined,
        }).catch((err) => console.error("Agreement email error:", err));
      }
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username);
      }
      if (!user) return res.status(401).send("Invalid credentials");
      const valid = await comparePasswords(password, user.password);
      if (!valid) return res.status(401).send("Invalid credentials");
      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).send("Not authenticated");
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).send("Not authenticated");
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).send("Email is required");

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ ok: true, message: "If an account with that email exists, a password reset link has been sent." });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await storage.createPasswordResetToken(user.id, token, expiresAt);

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["host"] || "localhost:5000";
      const appUrl = `${protocol}://${host}`;

      await sendPasswordResetEmail(email, token, appUrl);

      res.json({ ok: true, message: "If an account with that email exists, a password reset link has been sent." });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).send("Token and password are required");
      if (password.length < 6) return res.status(400).send("Password must be at least 6 characters");

      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) return res.status(400).send("Invalid or expired reset link");
      if (resetToken.used) return res.status(400).send("This reset link has already been used");
      if (new Date() > new Date(resetToken.expiresAt)) return res.status(400).send("This reset link has expired");

      const hashedPassword = await hashPassword(password);
      await storage.updateUserPassword(resetToken.userId, hashedPassword);
      await storage.markTokenUsed(resetToken.id);

      res.json({ ok: true, message: "Password has been reset successfully. You can now sign in with your new password." });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Advisor public routes (only approved advisors)
  app.get("/api/advisors", async (_req, res) => {
    try {
      const advisors = await storage.getAdvisors();
      const result = [];
      for (const a of advisors) {
        const strats = await storage.getStrategies(a.id);
        const liveStrategies = strats.filter((s) => s.status === "Published").length;
        const { password: _, ...safe } = a;
        result.push({ ...safe, liveStrategies });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisors/:id", async (req, res) => {
    try {
      const advisor = await storage.getAdvisorWithDetails(req.params.id);
      if (!advisor) return res.status(404).send("Not found");
      const { password: _, ...safe } = advisor;
      res.json(safe);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/content/public/:type", async (req, res) => {
    try {
      const items = await storage.getPublicContentByType(req.params.type);
      res.json(items);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/content/:id", async (req, res) => {
    try {
      const item = await storage.getContentById(req.params.id);
      if (!item) return res.status(404).send("Content not found");
      res.json(item);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/strategies/:id/positions", async (req, res) => {
    try {
      const allPositions = await storage.getPositions(req.params.id);
      const publishedPositions = allPositions.filter((p: any) => p.publishMode === "live" || p.isPublished);
      const userId = req.session?.userId;

      if (userId) {
        const currentUser = await storage.getUser(userId);
        if (currentUser?.role === "admin" || currentUser?.role === "advisor") {
          return res.json(publishedPositions);
        }
        const sub = await storage.getUserSubscriptionForStrategy(userId, req.params.id);
        if (sub) return res.json(publishedPositions);
      }

      const closedOnly = publishedPositions.filter((p: any) => p.status === "Closed");
      res.json(closedOnly);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/live-call-counts", async (_req, res) => {
    try {
      const strats = await storage.getPublishedStrategies();
      const counts: Record<string, number> = {
        "Intraday": 0,
        "F&O": 0,
        "Swing": 0,
        "Positional": 0,
        "Multi Leg": 0,
        "Commodities": 0,
        "Basket": 0,
      };
      for (const s of strats) {
        const activeCalls = await storage.getCalls(s.id);
        const activePositions = await storage.getPositions(s.id);
        const activeCallCount = activeCalls.filter((c: any) => c.status === "Active").length;
        const activePosCount = activePositions.filter((p: any) => p.status === "Active").length;
        const activeCount = activeCallCount + activePosCount;
        const horizon = (s.horizon || "").toLowerCase();
        const type = s.type;

        if (horizon.includes("intraday")) counts["Intraday"] += activeCount;
        if (type === "Future" || type === "Option" || type === "Index") counts["F&O"] += activeCount;
        if (horizon.includes("swing")) counts["Swing"] += activeCount;
        if (horizon.includes("positional") || horizon.includes("long term") || horizon.includes("short term")) counts["Positional"] += activeCount;
        if (type === "Commodity" || type === "CommodityFuture") counts["Commodities"] += activeCount;
        if (type === "Basket") counts["Basket"] += activeCount;
      }
      res.json(counts);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Strategy public routes
  app.get("/api/strategies/public", async (_req, res) => {
    try {
      const strats = await storage.getPublishedStrategies();
      res.json(strats);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/strategies/:id", async (req, res) => {
    try {
      const s = await storage.getStrategy(req.params.id);
      if (!s) return res.status(404).send("Not found");
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/symbols/search", async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").toLowerCase().trim();
      const segment = (req.query.segment as string) || "";
      if (!q || q.length < 1) return res.json([]);
      let filtered = nseSymbols.filter((s: any) => {
        const matchesQuery = s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        if (!matchesQuery) return false;
        if (segment === "Equity") return s.segment === "Equity";
        if (segment === "FnO") return s.isFnO === true;
        if (segment === "Commodity") return s.segment === "Commodity";
        if (segment === "Index") return s.segment === "Index";
        return true;
      });
      res.json(filtered.slice(0, 20));
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/option-chain/expiries", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || "NIFTY";
      const exchange = (req.query.exchange as string) || "NSE";
      const now = new Date();
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const expiries = await getOptionChainExpiries(exchange, symbol, year, month);
      res.json(expiries);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/option-chain", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || "NIFTY";
      const exchange = (req.query.exchange as string) || "NSE";
      const expiry = req.query.expiry as string;
      if (!expiry) return res.status(400).send("expiry query parameter is required");
      const chain = await getOptionChain(exchange, symbol, expiry);
      res.json(chain);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/strategies/:id/calls", async (req, res) => {
    try {
      const allCalls = await storage.getCalls(req.params.id);
      const publishedCalls = allCalls.filter((c: any) => c.publishMode === "live" || c.isPublished);
      const userId = req.session?.userId;

      if (userId) {
        const currentUser = await storage.getUser(userId);
        if (currentUser?.role === "admin" || currentUser?.role === "advisor") {
          return res.json(publishedCalls);
        }
        const sub = await storage.getUserSubscriptionForStrategy(userId, req.params.id);
        if (sub) return res.json(publishedCalls);
      }

      const closedOnly = publishedCalls.filter((c: any) => c.status === "Closed");
      res.json(closedOnly);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/strategies/:id/plans", async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) return res.status(404).send("Strategy not found");
      const advisorPlans = await storage.getPlans(strategy.advisorId);
      if (strategy.planIds && strategy.planIds.length > 0) {
        const filtered = advisorPlans.filter((p: Plan) => strategy.planIds.includes(p.id));
        return res.json(filtered.length > 0 ? filtered : advisorPlans);
      }
      res.json(advisorPlans);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Subscribe to strategy
  app.post("/api/strategies/:id/subscribe", requireAuth, async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) return res.status(404).send("Strategy not found");
      const { planId } = req.body || {};
      const advisorPlans = await storage.getPlans(strategy.advisorId);
      const strategyPlanIds = strategy.planIds && strategy.planIds.length > 0 ? strategy.planIds : advisorPlans.map((p: Plan) => p.id);
      let plan;
      if (planId) {
        plan = advisorPlans.find((p: Plan) => p.id === planId);
        if (plan && !strategyPlanIds.includes(plan.id)) {
          return res.status(400).send("Selected plan is not available for this strategy");
        }
      }
      if (!plan) {
        const availablePlans = advisorPlans.filter((p: Plan) => strategyPlanIds.includes(p.id));
        plan = availablePlans[0] || advisorPlans[0];
      }
      if (!plan) return res.status(400).send("No plans available");
      const sub = await storage.createSubscription({
        planId: plan.id,
        strategyId: strategy.id,
        userId: req.session.userId!,
        advisorId: strategy.advisorId,
        status: "active",
        ekycDone: false,
        riskProfiling: false,
      });
      res.json(sub);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ==================== Payment Routes (Cashfree) ====================

  app.post("/api/payments/create-order", requireAuth, async (req, res) => {
    try {
      const { strategyId, planId } = req.body;
      if (!strategyId || !planId) return res.status(400).send("strategyId and planId are required");

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) return res.status(404).send("Strategy not found");

      const advisorPlans = await storage.getPlans(strategy.advisorId);
      const plan = advisorPlans.find((p: Plan) => p.id === planId);
      if (!plan) return res.status(404).send("Plan not found");

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).send("User not found");

      const signedAgreement = await storage.getEsignAgreementByUserAndStrategy(user.id, strategyId, planId);
      if (!signedAgreement || signedAgreement.status !== "signed") {
        return res.status(400).send("You must sign the Investment Advisory Services Agreement before proceeding to payment.");
      }

      const orderId = `AM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const amount = Number(plan.amount);
      const verifyToken = generateVerifyToken(orderId, user.id);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const returnUrl = `${baseUrl}/payment-callback?order_id=${orderId}&vt=${verifyToken}`;

      const cfOrder = await createCashfreeOrder({
        orderId,
        amount,
        customerName: user.companyName || user.username,
        customerEmail: user.email,
        customerPhone: user.phone || "9999999999",
        customerId: user.id,
        returnUrl,
      });

      const payment = await storage.createPayment({
        orderId,
        userId: user.id,
        strategyId: strategy.id,
        planId: plan.id,
        advisorId: strategy.advisorId,
        amount: amount.toString(),
        currency: "INR",
        status: "PENDING",
        cfOrderId: cfOrder.cf_order_id?.toString() || null,
        paymentSessionId: cfOrder.payment_session_id || null,
        paymentMethod: null,
        cfPaymentId: null,
        subscriptionId: null,
        paidAt: null,
      });

      res.json({
        orderId,
        paymentSessionId: cfOrder.payment_session_id,
        cfOrderId: cfOrder.cf_order_id,
        paymentId: payment.id,
        verifyToken,
      });
    } catch (err: any) {
      console.error("Cashfree create order error:", err?.response?.data || err.message);
      res.status(500).json({ error: err?.response?.data?.message || err.message });
    }
  });

  app.post("/api/payments/verify", async (req, res) => {
    try {
      const { orderId, verifyToken } = req.body;
      if (!orderId) return res.status(400).send("orderId is required");

      const payment = await storage.getPaymentByOrderId(orderId);
      if (!payment) {
        console.error("Payment verify: order not found in DB:", orderId);
        return res.status(404).send("Payment not found");
      }

      const isSessionOwner = req.session.userId === payment.userId;
      const isTokenValid = verifyToken && validateVerifyToken(verifyToken, orderId, payment.userId);

      if (!isSessionOwner && !isTokenValid) {
        console.error("Payment verify: unauthorized - no valid session or token for order:", orderId);
        return res.status(403).send("Not authorized to verify this payment");
      }

      if (payment.status === "PAID" && payment.subscriptionId) {
        return res.json({ success: true, orderStatus: "PAID", subscriptionId: payment.subscriptionId });
      }

      console.log(`Payment verify: checking Cashfree for order ${orderId}, current status: ${payment.status}`);
      const cfOrder = await fetchCashfreeOrder(orderId);
      const orderStatus = cfOrder.order_status;
      console.log(`Payment verify: Cashfree order status for ${orderId}: ${orderStatus}`);

      if (orderStatus === "PAID" && payment.status !== "PAID") {
        let paymentMethod: string | null = null;
        let cfPaymentId: string | null = null;
        try {
          const cfPayments = await fetchCashfreePayments(orderId);
          if (cfPayments && cfPayments.length > 0) {
            const successPayment = cfPayments.find((p: any) => p.payment_status === "SUCCESS");
            if (successPayment) {
              paymentMethod = successPayment.payment_group || null;
              cfPaymentId = successPayment.cf_payment_id?.toString() || null;
            }
          }
        } catch (payErr: any) {
          console.error("Payment verify: error fetching CF payments:", payErr?.message);
        }

        const freshPayment = await storage.getPaymentByOrderId(orderId);
        if (freshPayment && freshPayment.subscriptionId) {
          return res.json({ success: true, orderStatus: "PAID", subscriptionId: freshPayment.subscriptionId });
        }

        await storage.updatePayment(payment.id, {
          status: "PAID",
          paymentMethod,
          cfPaymentId,
          paidAt: new Date(),
        });

        const sub = await storage.createSubscription({
          planId: payment.planId!,
          strategyId: payment.strategyId!,
          userId: payment.userId,
          advisorId: payment.advisorId!,
          status: "active",
          ekycDone: false,
          riskProfiling: false,
        });

        await storage.updatePayment(payment.id, { subscriptionId: sub.id });

        const esignAgreement = await storage.getEsignAgreementByUserAndStrategy(
          payment.userId, payment.strategyId!, payment.planId!
        );
        if (esignAgreement) {
          await storage.updateEsignAgreement(esignAgreement.id, { subscriptionId: sub.id });
        }

        console.log(`Payment verify: subscription created for order ${orderId}, sub: ${sub.id}`);

        res.json({ success: true, orderStatus: "PAID", subscriptionId: sub.id });
      } else if (orderStatus === "PAID") {
        res.json({ success: true, orderStatus: "PAID", subscriptionId: payment.subscriptionId });
      } else {
        await storage.updatePayment(payment.id, { status: orderStatus });
        res.json({ success: false, orderStatus });
      }
    } catch (err: any) {
      console.error("Cashfree verify error:", err?.response?.data || err.message, err?.stack);
      res.status(500).json({ error: "Payment verification failed. Please contact support." });
    }
  });

  app.post("/api/webhooks/cashfree", async (req: any, res) => {
    try {
      const signature = req.headers["x-webhook-signature"] as string;
      const timestamp = req.headers["x-webhook-timestamp"] as string;

      if (!signature || !timestamp) {
        console.error("Cashfree webhook: missing signature or timestamp headers");
        return res.status(400).send("Missing webhook signature");
      }

      const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const valid = verifyCashfreeWebhook(signature, rawBody, timestamp);
      if (!valid) {
        console.error("Cashfree webhook: invalid signature");
        return res.status(400).send("Invalid webhook signature");
      }

      const webhookData = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const eventType = webhookData?.type;
      const orderData = webhookData?.data?.order;
      const paymentData = webhookData?.data?.payment;

      if (eventType === "PAYMENT_SUCCESS_WEBHOOK" || eventType === "ORDER_PAID") {
        const orderId = orderData?.order_id;
        if (orderId) {
          const payment = await storage.getPaymentByOrderId(orderId);
          if (payment && payment.status !== "PAID" && !payment.subscriptionId) {
            await storage.updatePayment(payment.id, {
              status: "PAID",
              paymentMethod: paymentData?.payment_group || null,
              cfPaymentId: paymentData?.cf_payment_id?.toString() || null,
              paidAt: new Date(),
            });

            const freshPayment = await storage.getPaymentByOrderId(orderId);
            if (freshPayment && !freshPayment.subscriptionId) {
              const sub = await storage.createSubscription({
                planId: payment.planId!,
                strategyId: payment.strategyId!,
                userId: payment.userId,
                advisorId: payment.advisorId!,
                status: "active",
                ekycDone: false,
                riskProfiling: false,
              });

              await storage.updatePayment(payment.id, { subscriptionId: sub.id });

              const esignAg = await storage.getEsignAgreementByUserAndStrategy(
                payment.userId, payment.strategyId!, payment.planId!
              );
              if (esignAg) {
                await storage.updateEsignAgreement(esignAg.id, { subscriptionId: sub.id });
              }
            }
          }
        }
      }

      res.status(200).send("OK");
    } catch (err: any) {
      console.error("Cashfree webhook error:", err.message);
      res.status(200).send("OK");
    }
  });

  app.get("/api/payments/history", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getPaymentsByUser(req.session.userId!);
      res.json(payments);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/payments", requireAdvisor, async (req, res) => {
    try {
      const payments = await storage.getPaymentsByAdvisor(req.session.userId!);
      const enriched = await Promise.all(payments.map(async (p: any) => {
        const user = await storage.getUser(p.userId);
        const strategy = p.strategyId ? await storage.getStrategy(p.strategyId) : null;
        const plan = p.planId ? await storage.getPlan(p.planId) : null;
        return {
          ...p,
          customerName: user?.companyName || user?.username || "Unknown",
          customerEmail: user?.email || "",
          strategyName: strategy?.name || "",
          planName: plan?.name || "",
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ==================== End Payment Routes ====================

  app.get("/api/live-price/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const strategyType = req.query.strategyType as string | undefined;
      const quote = await getLiveQuote(symbol, strategyType);
      if (!quote) return res.status(404).json({ error: "Price not available" });
      res.json(quote);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/live-prices/bulk", async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "symbols array required" });
      }
      const items = symbols.map((s: any) => ({
        symbol: typeof s === "string" ? s : s.symbol,
        strategyType: typeof s === "string" ? undefined : s.strategyType,
      }));
      const prices = await getLivePrices(items);
      res.json(prices);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Advisor dashboard routes (require advisor role)
  app.get("/api/advisor/strategies", requireAdvisor, async (req, res) => {
    try {
      const strats = await storage.getStrategies(req.session.userId!);
      res.json(strats);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/strategies", requireAdvisor, async (req, res) => {
    try {
      const s = await storage.createStrategy({
        ...req.body,
        advisorId: req.session.userId,
      });
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/strategies/:id", requireAdvisor, async (req, res) => {
    try {
      const existing = await storage.getStrategy(req.params.id);
      if (!existing) return res.status(404).send("Strategy not found");
      if (existing.advisorId !== req.session.userId) return res.status(403).send("Not authorized");
      const s = await storage.updateStrategy(req.params.id, req.body);
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/strategies/:id", requireAdvisor, async (req, res) => {
    try {
      const existing = await storage.getStrategy(req.params.id);
      if (!existing) return res.status(404).send("Strategy not found");
      if (existing.advisorId !== req.session.userId) return res.status(403).send("Not authorized");
      await storage.deleteStrategy(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/strategies/:id/calls", requireAdvisor, async (req, res) => {
    try {
      const validModes = ["draft", "watchlist", "live"];
      const publishMode = req.body.publishMode || (req.body.isPublished ? "live" : "draft");
      if (!validModes.includes(publishMode)) {
        return res.status(400).send("Invalid publishMode. Must be draft, watchlist, or live");
      }
      const isPublished = publishMode === "live";
      if (isPublished && (!req.body.rationale || !req.body.rationale.trim())) {
        return res.status(400).send("Rationale is required to publish a call");
      }
      const c = await storage.createCall({
        ...req.body,
        strategyId: req.params.id,
        publishMode,
        isPublished,
      });
      if (isPublished) {
        const strategy = await storage.getStrategy(req.params.id);
        if (strategy) {
          notifyStrategySubscribers(req.params.id, strategy.name, "new_call", {
            title: `New Call: ${c.stockName}`,
            body: `${c.action} ${c.stockName} - ${strategy.name}`,
            tag: `call-${c.id}`,
            url: `/strategies/${req.params.id}`,
            data: { strategyId: req.params.id, callId: c.id },
          });
        }
      }
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/strategies/:id/positions", requireAdvisor, async (req, res) => {
    try {
      const validModes = ["draft", "watchlist", "live"];
      const publishMode = req.body.publishMode || "draft";
      if (!validModes.includes(publishMode)) {
        return res.status(400).send("Invalid publishMode. Must be draft, watchlist, or live");
      }
      const isPublished = publishMode === "live" || publishMode === "watchlist";
      if (isPublished && (!req.body.rationale || !req.body.rationale.trim())) {
        return res.status(400).send("Rationale is required to publish a position");
      }
      const p = await storage.createPosition({
        ...req.body,
        strategyId: req.params.id,
        publishMode,
        isPublished,
      });
      if (isPublished) {
        const strategy = await storage.getStrategy(req.params.id);
        if (strategy) {
          notifyStrategySubscribers(req.params.id, strategy.name, "new_position", {
            title: `New Position: ${p.symbol || p.segment}`,
            body: `${p.buySell} ${p.symbol || p.segment} - ${strategy.name}`,
            tag: `position-${p.id}`,
            url: `/strategies/${req.params.id}`,
            data: { strategyId: req.params.id, positionId: p.id },
          });
        }
      }
      res.json(p);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/strategies/:id/calls", requireAdvisor, async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id as string);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      const c = await storage.getCalls(req.params.id as string);
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/strategies/:id/positions", requireAdvisor, async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id as string);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      const p = await storage.getPositions(req.params.id as string);
      res.json(p);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/calls/:id", requireAdvisor, async (req, res) => {
    try {
      const call = await storage.getCall(req.params.id as string);
      if (!call) return res.status(404).send("Call not found");
      const strategy = await storage.getStrategy(call.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (call.status !== "Active") {
        return res.status(400).send("Can only edit active calls");
      }
      const { targetPrice, stopLoss, rationale } = req.body;
      const updated = await storage.updateCall(call.id, {
        ...(targetPrice !== undefined ? { targetPrice } : {}),
        ...(stopLoss !== undefined ? { stopLoss } : {}),
        ...(rationale !== undefined ? { rationale } : {}),
      });
      if (call.isPublished && (targetPrice !== undefined || stopLoss !== undefined)) {
        const changes: string[] = [];
        if (stopLoss !== undefined && stopLoss !== call.stopLoss) changes.push(`SL: ${stopLoss}`);
        if (targetPrice !== undefined && targetPrice !== call.targetPrice) changes.push(`Target: ${targetPrice}`);
        if (changes.length > 0) {
          notifyStrategySubscribers(call.strategyId, strategy.name, "call_update", {
            title: `Alert: ${call.stockName} Updated`,
            body: `${changes.join(", ")} - ${strategy.name}`,
            tag: `call-update-${call.id}`,
            url: `/strategies/${call.strategyId}`,
            data: { strategyId: call.strategyId, callId: call.id },
          });
        }
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/calls/:id/close", requireAdvisor, async (req, res) => {
    try {
      const call = await storage.getCall(req.params.id as string);
      if (!call) return res.status(404).send("Call not found");
      const strategy = await storage.getStrategy(call.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (call.status !== "Active") {
        return res.status(400).send("Call is already closed");
      }
      const { sellPrice, reason, closeAtMarket } = req.body || {};
      const entryPrice = Number(call.entryPrice || call.buyRangeStart || 0);
      const exitPrice = sellPrice ? Number(sellPrice) : entryPrice;
      const isSellAction = call.action === "Sell";
      const gainPercent = entryPrice > 0
        ? (isSellAction
            ? (((entryPrice - exitPrice) / entryPrice) * 100).toFixed(2)
            : (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2))
        : "0";
      const updated = await storage.updateCall(call.id, {
        status: "Closed",
        sellPrice: String(exitPrice),
        gainPercent,
        exitDate: new Date(),
      });
      if (call.isPublished) {
        const gain = Number(gainPercent);
        const emoji = gain >= 0 ? "Profit" : "Loss";
        notifyStrategySubscribers(call.strategyId, strategy.name, "call_closed", {
          title: `Call Closed: ${call.stockName}`,
          body: `${emoji} ${Math.abs(gain)}% | Exit at ${exitPrice} - ${strategy.name}`,
          tag: `call-close-${call.id}`,
          url: `/strategies/${call.strategyId}`,
          data: { strategyId: call.strategyId, callId: call.id },
        });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/calls/:id/exit", requireAdvisor, async (req, res) => {
    try {
      const call = await storage.getCall(req.params.id as string);
      if (!call) return res.status(404).send("Call not found");
      const strategy = await storage.getStrategy(call.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (call.status !== "Closed") {
        return res.status(400).send("Can only update exit data on closed calls");
      }
      const { exitPrice } = req.body;
      if (!exitPrice || Number(exitPrice) <= 0) {
        return res.status(400).send("Valid exit price is required");
      }
      const entryPx = Number(call.entryPrice || call.buyRangeStart || 0);
      const exitPx = Number(exitPrice);
      let gainPercent: string | null = null;
      if (entryPx > 0 && exitPx > 0) {
        const isSell = call.action === "Sell";
        gainPercent = (isSell ? ((entryPx - exitPx) / entryPx) * 100 : ((exitPx - entryPx) / entryPx) * 100).toFixed(2);
      }
      const updated = await storage.updateCall(call.id, {
        sellPrice: String(exitPx),
        gainPercent,
        exitDate: call.exitDate || new Date(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/calls/:id/publish", requireAdvisor, async (req, res) => {
    try {
      const call = await storage.getCall(req.params.id as string);
      if (!call) return res.status(404).send("Call not found");
      const strategy = await storage.getStrategy(call.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (call.status !== "Active") {
        return res.status(400).send("Can only publish active calls");
      }
      if (!call.rationale || !call.rationale.trim()) {
        return res.status(400).send("Rationale is required to publish a call");
      }
      const updated = await storage.updateCall(call.id, {
        publishMode: "live",
        isPublished: true,
      });
      notifyStrategySubscribers(call.strategyId, strategy.name, "new_call", {
        title: `New Call: ${call.stockName}`,
        body: `${call.action} ${call.stockName} - ${strategy.name}`,
        tag: `call-${call.id}`,
        url: `/strategies/${call.strategyId}`,
        data: { strategyId: call.strategyId, callId: call.id },
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/positions/:id/publish", requireAdvisor, async (req, res) => {
    try {
      const pos = await storage.getPosition(req.params.id as string);
      if (!pos) return res.status(404).send("Position not found");
      const strategy = await storage.getStrategy(pos.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (pos.status !== "Active") {
        return res.status(400).send("Can only publish active positions");
      }
      if (!pos.rationale || !pos.rationale.trim()) {
        return res.status(400).send("Rationale is required to publish a position");
      }
      const updated = await storage.updatePosition(pos.id, {
        publishMode: "live",
        isPublished: true,
      });
      notifyStrategySubscribers(pos.strategyId, strategy.name, "new_position", {
        title: `New Position: ${pos.symbol || pos.segment}`,
        body: `${pos.buySell} ${pos.symbol || pos.segment} - ${strategy.name}`,
        tag: `position-${pos.id}`,
        url: `/strategies/${pos.strategyId}`,
        data: { strategyId: pos.strategyId, positionId: pos.id },
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/positions/:id", requireAdvisor, async (req, res) => {
    try {
      const pos = await storage.getPosition(req.params.id as string);
      if (!pos) return res.status(404).send("Position not found");
      const strategy = await storage.getStrategy(pos.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (pos.status !== "Active") {
        return res.status(400).send("Can only edit active positions");
      }
      const { target, stopLoss, rationale } = req.body;
      const updated = await storage.updatePosition(pos.id, {
        ...(target !== undefined ? { target } : {}),
        ...(stopLoss !== undefined ? { stopLoss } : {}),
        ...(rationale !== undefined ? { rationale } : {}),
      });
      if (pos.isPublished && (target !== undefined || stopLoss !== undefined)) {
        const changes: string[] = [];
        if (stopLoss !== undefined && stopLoss !== pos.stopLoss) changes.push(`SL: ${stopLoss}`);
        if (target !== undefined && target !== pos.target) changes.push(`Target: ${target}`);
        if (changes.length > 0) {
          notifyStrategySubscribers(pos.strategyId, strategy.name, "position_update", {
            title: `Alert: ${pos.symbol || pos.segment} Updated`,
            body: `${changes.join(", ")} - ${strategy.name}`,
            tag: `position-update-${pos.id}`,
            url: `/strategies/${pos.strategyId}`,
            data: { strategyId: pos.strategyId, positionId: pos.id },
          });
        }
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/positions/:id/close", requireAdvisor, async (req, res) => {
    try {
      const pos = await storage.getPosition(req.params.id as string);
      if (!pos) return res.status(404).send("Position not found");
      const strategy = await storage.getStrategy(pos.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (pos.status !== "Active") {
        return res.status(400).send("Position is already closed");
      }
      const exitPrice = req.body.exitPrice || req.body.sellPrice || null;
      const entryPx = Number(pos.entryPrice || 0);
      const exitPx = Number(exitPrice || 0);
      let gainPercent: string | null = null;
      if (entryPx > 0 && exitPx > 0) {
        const isSell = pos.buySell === "Sell";
        gainPercent = (isSell ? ((entryPx - exitPx) / entryPx) * 100 : ((exitPx - entryPx) / entryPx) * 100).toFixed(2);
      }
      const updated = await storage.updatePosition(pos.id, {
        status: "Closed",
        exitPrice: exitPrice,
        exitDate: new Date(),
        gainPercent: gainPercent,
      });
      if (pos.isPublished) {
        const gain = Number(gainPercent || 0);
        const result = gain >= 0 ? "Profit" : "Loss";
        notifyStrategySubscribers(pos.strategyId, strategy.name, "position_closed", {
          title: `Position Closed: ${pos.symbol || pos.segment}`,
          body: `${result} ${Math.abs(gain)}% | Exit at ${exitPx} - ${strategy.name}`,
          tag: `position-close-${pos.id}`,
          url: `/strategies/${pos.strategyId}`,
          data: { strategyId: pos.strategyId, positionId: pos.id },
        });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/positions/:id/exit", requireAdvisor, async (req, res) => {
    try {
      const pos = await storage.getPosition(req.params.id as string);
      if (!pos) return res.status(404).send("Position not found");
      const strategy = await storage.getStrategy(pos.strategyId);
      if (!strategy || strategy.advisorId !== req.session.userId) {
        return res.status(403).send("Not authorized");
      }
      if (pos.status !== "Closed") {
        return res.status(400).send("Can only update exit data on closed positions");
      }
      const { exitPrice } = req.body;
      if (!exitPrice || Number(exitPrice) <= 0) {
        return res.status(400).send("Valid exit price is required");
      }
      const entryPx = Number(pos.entryPrice || 0);
      const exitPx = Number(exitPrice);
      let gainPercent: string | null = null;
      if (entryPx > 0 && exitPx > 0) {
        const isSell = pos.buySell === "Sell";
        gainPercent = (isSell ? ((entryPx - exitPx) / entryPx) * 100 : ((exitPx - entryPx) / entryPx) * 100).toFixed(2);
      }
      const updated = await storage.updatePosition(pos.id, {
        exitPrice: String(exitPx),
        gainPercent,
        exitDate: pos.exitDate || new Date(),
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/strategies/:id/subscription-status", requireAuth, async (req, res) => {
    try {
      const sub = await storage.getUserSubscriptionForStrategy(req.session.userId!, req.params.id as string);
      res.json({ subscribed: !!sub });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Plans
  app.get("/api/advisor/plans", requireAdvisor, async (req, res) => {
    try {
      const p = await storage.getPlans(req.session.userId!);
      res.json(p);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/plans", requireAdvisor, async (req, res) => {
    try {
      const p = await storage.createPlan({
        ...req.body,
        advisorId: req.session.userId,
      });
      res.json(p);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/plans/:id", requireAdvisor, async (req, res) => {
    try {
      await storage.deletePlan(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Subscriptions
  app.get("/api/advisor/subscribers", requireAdvisor, async (req, res) => {
    try {
      const subs = await storage.getSubscriptions(req.session.userId!);
      const enriched = await Promise.all(subs.map(async (sub) => {
        const u = await storage.getUser(sub.userId);
        const strategy = sub.strategyId ? await storage.getStrategy(sub.strategyId) : null;
        const plan = sub.planId ? await storage.getPlan(sub.planId) : null;
        return {
          ...sub,
          customerName: u?.companyName || u?.username || "Unknown",
          customerEmail: u?.email || "",
          customerPhone: u?.phone || "",
          strategyName: strategy?.name || "",
          planName: plan?.name || "",
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/subscriptions", requireAdvisor, async (req, res) => {
    try {
      const subs = await storage.getSubscriptions(req.session.userId!);
      res.json(subs);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Content
  app.get("/api/advisor/content", requireAdvisor, async (req, res) => {
    try {
      const c = await storage.getContent(req.session.userId!);
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/content", requireAdvisor, async (req, res) => {
    try {
      const c = await storage.createContent({
        ...req.body,
        advisorId: req.session.userId,
      });
      res.json(c);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/content/:id", requireAdvisor, async (req, res) => {
    try {
      await storage.deleteContent(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Scores
  app.get("/api/advisor/scores", requireAdvisor, async (req, res) => {
    try {
      const s = await storage.getScores(req.session.userId!);
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/advisor/scores", requireAdvisor, async (req, res) => {
    try {
      const s = await storage.createScore({
        ...req.body,
        advisorId: req.session.userId,
      });
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Profile update
  app.patch("/api/advisor/profile", requireAdvisor, async (req, res) => {
    try {
      const u = await storage.updateUser(req.session.userId!, req.body);
      const { password: _, ...safe } = u;
      res.json(safe);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Reports download
  app.get("/api/advisor/reports/download", requireAdvisor, async (req, res) => {
    try {
      const type = req.query.type as string;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);

      if (type === "Calls Report") {
        const strats = await storage.getStrategies(req.session.userId!);
        let csv = "Strategy,Stock,Action,Entry Price,Entry Date,Entry Time,Target,Stop Loss,Exit Price,Exit Date,Exit Time,Status,Gain %\n";
        for (const s of strats) {
          const callsList = await storage.getCalls(s.id);
          for (const c of callsList) {
            const entryDt = c.createdAt || c.callDate;
            const entryDate = entryDt ? new Date(entryDt).toLocaleDateString("en-IN") : "";
            const entryTime = entryDt ? new Date(entryDt).toLocaleTimeString("en-IN") : "";
            const exitDt = c.exitDate;
            const exitDate = exitDt ? new Date(exitDt).toLocaleDateString("en-IN") : "";
            const exitTime = exitDt ? new Date(exitDt).toLocaleTimeString("en-IN") : "";
            csv += `"${s.name}","${c.stockName}","${c.action}","${c.entryPrice || c.buyRangeStart || ""}","${entryDate}","${entryTime}","${c.targetPrice || ""}","${c.stopLoss || ""}","${c.sellPrice || ""}","${exitDate}","${exitTime}","${c.status}","${c.gainPercent || ""}"\n`;
          }
          const positionsList = await storage.getPositions(s.id);
          for (const p of positionsList) {
            const entryDt = p.createdAt;
            const entryDate = entryDt ? new Date(entryDt).toLocaleDateString("en-IN") : "";
            const entryTime = entryDt ? new Date(entryDt).toLocaleTimeString("en-IN") : "";
            const exitDt = p.exitDate;
            const exitDate = exitDt ? new Date(exitDt).toLocaleDateString("en-IN") : "";
            const exitTime = exitDt ? new Date(exitDt).toLocaleTimeString("en-IN") : "";
            const symbolLabel = `${p.symbol || ""}${p.expiry ? " " + p.expiry : ""}${p.strikePrice ? " " + p.strikePrice : ""}${p.callPut ? " " + p.callPut : ""}`;
            csv += `"${s.name}","${symbolLabel.trim()}","${p.buySell || "Buy"}","${p.entryPrice || ""}","${entryDate}","${entryTime}","${p.target || ""}","${p.stopLoss || ""}","${p.exitPrice || ""}","${exitDate}","${exitTime}","${p.status}","${p.gainPercent || ""}"\n`;
          }
        }
        res.send(csv);
      } else if (type === "Customer Acquisition Report") {
        const subs = await storage.getSubscriptions(req.session.userId!);
        let csv = "Subscriber,Plan,EKYC Done,Risk Profiling,Status,Subscription Date,Subscription Time,Start Date,End Date\n";
        for (const s of subs) {
          const subDt = s.createdAt;
          const subDate = subDt ? new Date(subDt).toLocaleDateString("en-IN") : "";
          const subTime = subDt ? new Date(subDt).toLocaleTimeString("en-IN") : "";
          const startDate = subDt ? new Date(subDt).toLocaleDateString("en-IN") : "";
          const plan = await storage.getPlan(s.planId);
          const durationDays = plan?.durationDays || 30;
          const endDt = subDt ? new Date(new Date(subDt).getTime() + durationDays * 86400000) : null;
          const endDate = endDt ? endDt.toLocaleDateString("en-IN") : "";
          csv += `"${s.userId}","${plan?.name || s.planId}","${s.ekycDone ? "Yes" : "No"}","${s.riskProfiling ? "Yes" : "No"}","${s.status}","${subDate}","${subTime}","${startDate}","${endDate}"\n`;
        }
        res.send(csv);
      } else if (type === "Financial Report") {
        const subs = await storage.getSubscriptions(req.session.userId!);
        const pls = await storage.getPlans(req.session.userId!);
        let csv = "Plan,Code,Amount,Duration Days,Subscriber,Payment Date,Payment Time,Start Date,End Date,Status\n";
        for (const s of subs) {
          const plan = pls.find((p) => p.id === s.planId);
          const subDt = s.createdAt;
          const payDate = subDt ? new Date(subDt).toLocaleDateString("en-IN") : "";
          const payTime = subDt ? new Date(subDt).toLocaleTimeString("en-IN") : "";
          const startDate = subDt ? new Date(subDt).toLocaleDateString("en-IN") : "";
          const durationDays = plan?.durationDays || 30;
          const endDt = subDt ? new Date(new Date(subDt).getTime() + durationDays * 86400000) : null;
          const endDate = endDt ? endDt.toLocaleDateString("en-IN") : "";
          csv += `"${plan?.name || s.planId}","${plan?.code || ""}","${plan?.amount || ""}","${durationDays}","${s.userId}","${payDate}","${payTime}","${startDate}","${endDate}","${s.status}"\n`;
        }
        if (subs.length === 0) {
          for (const p of pls) {
            csv += `"${p.name}","${p.code}","${p.amount}","${p.durationDays || ""}","","","","","",""\n`;
          }
        }
        res.send(csv);
      } else {
        const scrs = await storage.getScores(req.session.userId!);
        let csv = "Beginning,Received,Resolved,Pending,Reasons\n";
        for (const s of scrs) {
          csv += `"${s.beginningOfMonth || 0}","${s.receivedDuring || 0}","${s.resolvedDuring || 0}","${s.pendingAtEnd || 0}","${s.pendencyReasons || ""}"\n`;
        }
        res.send(csv);
      }
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ========== ADMIN ROUTES ==========

  // Get all users (admin)
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safe = allUsers.map(({ password: _, ...u }) => u);
      res.json(safe);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Update user (admin - approve/disapprove/edit)
  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const u = await storage.updateUser(req.params.id, req.body);
      const { password: _, ...safe } = u;
      res.json(safe);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Delete user (admin)
  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Get all strategies (admin)
  app.get("/api/admin/strategies", requireAdmin, async (_req, res) => {
    try {
      const strats = await storage.getAllStrategies();
      res.json(strats);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Update any strategy (admin)
  app.patch("/api/admin/strategies/:id", requireAdmin, async (req, res) => {
    try {
      const s = await storage.updateStrategy(req.params.id, req.body);
      res.json(s);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Delete any strategy (admin)
  app.delete("/api/admin/strategies/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteStrategy(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/admin/groww-token-status", requireAdmin, async (_req, res) => {
    try {
      const status = getGrowwTokenStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/admin/groww-token", requireAdmin, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string" || token.trim().length < 10) {
        return res.status(400).json({ error: "Please provide a valid access token" });
      }
      const result = setGrowwAccessToken(token.trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ==================== Advisor Revenue Route ====================
  app.get("/api/advisor/revenue", requireAdvisor, async (req, res) => {
    try {
      const allPayments = await storage.getPaymentsByAdvisor(req.session.userId!);
      const successfulPayments = allPayments.filter(p => p.status === "PAID");
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const monthlyRevenue = successfulPayments
        .filter(p => p.paidAt && new Date(p.paidAt).getMonth() === currentMonth && new Date(p.paidAt).getFullYear() === currentYear)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const ytdRevenue = successfulPayments
        .filter(p => p.paidAt && new Date(p.paidAt).getFullYear() === currentYear)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      res.json({ monthlyRevenue, ytdRevenue, totalPayments: successfulPayments.length });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ==================== Investor Dashboard Routes ====================
  app.get("/api/investor/subscriptions", requireAuth, async (req, res) => {
    try {
      const subs = await storage.getSubscriptionsByUserId(req.session.userId!);
      const enriched = await Promise.all(subs.map(async (sub) => {
        const strategy = sub.strategyId ? await storage.getStrategy(sub.strategyId) : null;
        const plan = sub.planId ? await storage.getPlan(sub.planId) : null;
        const advisor = strategy?.advisorId ? await storage.getUser(strategy.advisorId) : null;
        return {
          ...sub,
          strategyName: strategy?.name || "",
          strategyType: strategy?.type || "",
          strategySegment: strategy?.segment || "",
          strategyCagr: strategy?.cagr || "0",
          strategyHorizon: strategy?.horizon || "",
          strategyRisk: strategy?.riskLevel || "",
          strategyStatus: strategy?.status || "",
          strategyDescription: strategy?.description || "",
          advisorName: advisor?.companyName || advisor?.username || "",
          advisorSebi: advisor?.sebiRegNumber || "",
          planName: plan?.name || "",
          planDuration: plan?.durationDays ? `${plan.durationDays} days` : "",
          planPrice: plan?.amount || "0",
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/investor/recommendations", requireAuth, async (req, res) => {
    try {
      const subs = await storage.getSubscriptionsByUserId(req.session.userId!);
      const activeSubs = subs.filter(s => s.status === "active");
      const allCalls: any[] = [];
      const allPositions: any[] = [];
      for (const sub of activeSubs) {
        if (!sub.strategyId) continue;
        const strategy = await storage.getStrategy(sub.strategyId);
        const subDate = sub.createdAt ? new Date(sub.createdAt) : new Date(0);
        const strategyCalls = await storage.getCallsByStrategy(sub.strategyId);
        const strategyPositions = await storage.getPositionsByStrategy(sub.strategyId);
        const advisor = strategy?.advisorId ? await storage.getUser(strategy.advisorId) : null;
        const advisorName = advisor?.companyName || "";
        const strategyType = strategy?.type || "";
        const filteredCalls = strategyCalls.filter(c => {
          const isClosed = c.status === "Closed" || !!c.exitDate;
          const isLive = !c.publishMode || c.publishMode === "live";
          if (!isLive && !isClosed) return false;
          const callDate = c.createdAt ? new Date(c.createdAt) : new Date();
          if (callDate >= subDate) return true;
          if (c.status === "Active" && isLive) return true;
          const exitDate = c.exitDate ? new Date(c.exitDate) : null;
          if (exitDate && exitDate >= subDate) return true;
          if (isClosed) return true;
          return false;
        });
        const filteredPositions = strategyPositions.filter(p => {
          const isClosed = p.status === "Closed" || !!p.exitDate;
          const isLive = !p.publishMode || p.publishMode === "live";
          if (!isLive && !isClosed) return false;
          const posDate = p.createdAt ? new Date(p.createdAt) : new Date();
          if (posDate >= subDate) return true;
          if (p.status === "Active" && isLive) return true;
          const exitDate = p.exitDate ? new Date(p.exitDate) : null;
          if (exitDate && exitDate >= subDate) return true;
          if (isClosed) return true;
          return false;
        });
        for (const c of filteredCalls) {
          allCalls.push({ ...c, strategyName: strategy?.name || "", advisorName, strategyType });
        }
        for (const p of filteredPositions) {
          allPositions.push({ ...p, strategyName: strategy?.name || "", advisorName, strategyType });
        }
      }
      res.json({ calls: allCalls, positions: allPositions });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ── Watchlist routes ──
  app.get("/api/investor/watchlist", requireAuth, async (req, res) => {
    try {
      const items = await storage.getWatchlistByUser(req.session.userId!);
      const enriched: any[] = [];
      for (const item of items) {
        if (item.itemType === "strategy") {
          const strategy = await storage.getStrategy(item.itemId);
          if (strategy) {
            const activeCalls = await storage.getActiveCallsByStrategy(item.itemId);
            const activePositions = await storage.getActivePositionsByStrategy(item.itemId);
            const newCallsSinceWatch = activeCalls.filter(c => c.publishMode === "live" && c.createdAt && item.createdAt && new Date(c.createdAt) > new Date(item.createdAt)).length;
            const newPosSinceWatch = activePositions.filter(p => p.publishMode === "live" && p.createdAt && item.createdAt && new Date(p.createdAt) > new Date(item.createdAt)).length;
            const { password: _, ...safeAdvisor } = strategy.advisor || {} as any;
            enriched.push({ ...item, strategy: { ...strategy, advisor: safeAdvisor }, newCalls: newCallsSinceWatch + newPosSinceWatch });
          }
        } else if (item.itemType === "advisor") {
          const advisor = await storage.getUser(item.itemId);
          if (advisor) {
            const { password: _, ...safeAdvisor } = advisor;
            enriched.push({ ...item, advisor: safeAdvisor });
          }
        }
      }
      res.json(enriched);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/investor/watchlist", requireAuth, async (req, res) => {
    try {
      const { itemType, itemId } = req.body;
      if (!itemType || !itemId) return res.status(400).send("itemType and itemId required");
      if (!["strategy", "advisor"].includes(itemType)) return res.status(400).send("Invalid itemType");
      const item = await storage.addWatchlistItem({ userId: req.session.userId!, itemType, itemId });
      res.json(item);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/investor/watchlist", requireAuth, async (req, res) => {
    try {
      const { itemType, itemId } = req.body;
      if (!itemType || !itemId) return res.status(400).send("itemType and itemId required");
      await storage.removeWatchlistItem(req.session.userId!, itemType, itemId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/investor/watchlist/check", requireAuth, async (req, res) => {
    try {
      const { itemType, itemId } = req.query;
      if (!itemType || !itemId) return res.status(400).send("itemType and itemId required");
      const result = await storage.isWatchlisted(req.session.userId!, itemType as string, itemId as string);
      res.json({ watchlisted: result });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/investor/watchlist/ids", requireAuth, async (req, res) => {
    try {
      const items = await storage.getWatchlistByUser(req.session.userId!);
      const strategyIds = items.filter(i => i.itemType === "strategy").map(i => i.itemId);
      const advisorIds = items.filter(i => i.itemType === "advisor").map(i => i.itemId);
      res.json({ strategyIds, advisorIds });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ── Advisor Questions routes ──
  app.post("/api/advisors/:id/questions", async (req, res) => {
    try {
      const advisorId = req.params.id;
      const advisor = await storage.getUser(advisorId);
      if (!advisor || advisor.role !== "advisor") return res.status(404).send("Advisor not found");

      let name: string, email: string, phone: string | undefined;
      const { question } = req.body;
      if (!question || !question.trim()) return res.status(400).send("Question is required");

      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          name = user.companyName || user.username;
          email = user.email;
          phone = user.phone || undefined;
        } else {
          return res.status(400).send("User not found");
        }
      } else {
        name = req.body.name;
        email = req.body.email;
        phone = req.body.phone;
        if (!name || !email) return res.status(400).send("Name and email are required for guest users");
      }

      const q = await storage.createAdvisorQuestion({
        advisorId,
        userId: req.session.userId || null,
        name,
        email,
        phone: phone || null,
        question: question.trim(),
      });
      res.json(q);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/questions", requireAdvisor, async (req, res) => {
    try {
      const questions = await storage.getQuestionsByAdvisor(req.session.userId!);
      res.json(questions);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/questions/unread-count", requireAdvisor, async (req, res) => {
    try {
      const count = await storage.getUnreadQuestionCount(req.session.userId!);
      res.json({ count });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.patch("/api/advisor/questions/:id", requireAdvisor, async (req, res) => {
    try {
      const { answer, isRead } = req.body;
      const data: any = {};
      if (answer !== undefined) {
        data.answer = answer;
        data.answeredAt = new Date();
        data.isRead = true;
      }
      if (isRead !== undefined) data.isRead = isRead;
      const q = await storage.updateAdvisorQuestion(req.params.id, data, req.session.userId!);
      if (!q) return res.status(404).send("Question not found or not yours");
      res.json(q);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // --- Risk Profiling Routes ---

  function computeRiskScores(data: any) {
    let capacityRaw = 0;
    let capacityMax = 0;

    const incomeScores: Record<string, number> = { "below_3l": 1, "3l_10l": 2, "10l_25l": 3, "above_25l": 4 };
    const surplusScores: Record<string, number> = { "below_1l": 1, "1l_5l": 2, "5l_25l": 3, "above_25l": 4 };
    const assetsScores: Record<string, number> = { "below_5l": 1, "5l_25l": 2, "25l_1cr": 3, "above_1cr": 4 };
    const liabilityScores: Record<string, number> = { "none": 4, "below_5l": 3, "5l_25l": 2, "above_25l": 1 };
    const emergencyScores: Record<string, number> = { "below_3m": 0, "3m_6m": 1, "6m_12m": 2, "above_12m": 3 };
    const lossScores: Record<string, number> = { "below_5": 0, "5_15": 1, "15_30": 2, "above_30": 3 };

    capacityRaw += incomeScores[data.annualIncome] || 0; capacityMax += 4;
    capacityRaw += surplusScores[data.investibleSurplus] || 0; capacityMax += 4;
    capacityRaw += assetsScores[data.totalFinancialAssets] || 0; capacityMax += 4;
    capacityRaw += liabilityScores[data.totalLiabilities] || 0; capacityMax += 4;
    capacityRaw += emergencyScores[data.emergencyFund] || 0; capacityMax += 3;
    capacityRaw += lossScores[data.affordableLoss] || 0; capacityMax += 3;

    const horizonScores: Record<string, number> = { "below_1y": 0, "1y_3y": 1, "3y_7y": 2, "7y_15y": 3, "above_15y": 4 };
    capacityRaw += horizonScores[data.timeHorizon] || 0; capacityMax += 4;

    const capacityScore = capacityMax > 0 ? Math.round((capacityRaw / capacityMax) * 100) : 0;

    let toleranceRaw = 0;
    let toleranceMax = 0;

    const knowledgeScores: Record<string, number> = { "none": 0, "basic": 1, "moderate": 2, "advanced": 3 };
    toleranceRaw += knowledgeScores[data.marketKnowledge] || 0; toleranceMax += 3;

    const expInstruments = data.investmentExperience || [];
    let instrScore = 0;
    if (expInstruments.includes("bank_fd")) instrScore = Math.max(instrScore, 1);
    if (expInstruments.includes("equity_mf")) instrScore = Math.max(instrScore, 2);
    if (expInstruments.includes("direct_equity")) instrScore = Math.max(instrScore, 2);
    if (expInstruments.includes("derivatives")) instrScore = Math.max(instrScore, 3);
    if (expInstruments.includes("structured")) instrScore = Math.max(instrScore, 3);
    toleranceRaw += instrScore; toleranceMax += 3;

    const yearsScores: Record<string, number> = { "0": 0, "below_2y": 1, "2y_5y": 2, "above_5y": 3 };
    toleranceRaw += yearsScores[data.yearsOfExperience] || 0; toleranceMax += 3;

    const pastScores: Record<string, number> = { "sold": 0, "held": 1, "bought_more": 2 };
    toleranceRaw += pastScores[data.pastBehavior] || 0; toleranceMax += 2;

    const fallScores: Record<string, number> = { "sell_most": 0, "sell_some": 1, "do_nothing": 2, "buy_more": 3 };
    toleranceRaw += fallScores[data.portfolioFallReaction] || 0; toleranceMax += 3;

    const returnScores: Record<string, number> = { "below_6": 0, "6_10": 1, "10_15": 2, "15_25": 3, "above_25": 4 };
    toleranceRaw += returnScores[data.expectedReturn] || 0; toleranceMax += 4;

    const volComfort = Math.min(Math.max(Number(data.volatilityComfort) || 0, 0), 5);
    toleranceRaw += Math.round(volComfort * 0.8); toleranceMax += 4;

    const stmtScores: Record<string, number> = { "no_loss": 0, "small_fluctuations": 1, "significant_fluctuations": 2, "high_risk": 3 };
    toleranceRaw += stmtScores[data.riskStatement] || 0; toleranceMax += 3;

    const toleranceScore = toleranceMax > 0 ? Math.round((toleranceRaw / toleranceMax) * 100) : 0;

    const overallScore = Math.round(capacityScore * 0.6 + toleranceScore * 0.4);

    let riskCategory = "Conservative";
    if (overallScore >= 85) riskCategory = "Very Aggressive";
    else if (overallScore >= 70) riskCategory = "Aggressive";
    else if (overallScore >= 50) riskCategory = "Moderate";
    else if (overallScore >= 25) riskCategory = "Moderately Conservative";

    return { capacityScore, toleranceScore, overallScore, riskCategory };
  }

  app.patch("/api/advisor/settings/risk-profiling", requireAdvisor, async (req, res) => {
    try {
      const { requireRiskProfiling } = req.body;
      const updated = await storage.updateUser(req.session.userId!, { requireRiskProfiling: !!requireRiskProfiling });
      res.json({ requireRiskProfiling: updated.requireRiskProfiling });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/settings/risk-profiling", requireAdvisor, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      res.json({ requireRiskProfiling: user?.requireRiskProfiling || false });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/risk-profiles", requireAuth, async (req, res) => {
    try {
      const { subscriptionId, ...profileData } = req.body;
      if (!subscriptionId) return res.status(400).send("subscriptionId required");

      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.userId !== req.session.userId!) return res.status(403).send("Not your subscription");

      const existing = await storage.getRiskProfileBySubscription(subscriptionId);
      if (existing) return res.status(400).send("Risk profile already completed for this subscription");

      const scores = computeRiskScores(profileData);

      const riskProfile = await storage.createRiskProfile({
        subscriptionId,
        userId: req.session.userId!,
        advisorId: sub.advisorId,
        ...profileData,
        ...scores,
      });

      await storage.updateSubscription(subscriptionId, { riskProfiling: true });

      res.json(riskProfile);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/risk-profiles/:subscriptionId", requireAuth, async (req, res) => {
    try {
      const rp = await storage.getRiskProfileBySubscription(req.params.subscriptionId);
      if (!rp) return res.status(404).send("Risk profile not found");
      const user = await storage.getUser(req.session.userId!);
      if (rp.userId !== req.session.userId! && rp.advisorId !== req.session.userId! && user?.role !== "admin") {
        return res.status(403).send("Access denied");
      }
      res.json(rp);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // ─── eKYC Routes ───

  // ==================== eSign Agreement Routes ====================

  app.post("/api/esign/otp", requireAuth, async (req, res) => {
    try {
      const { strategyId, planId, aadhaarNumber } = req.body;
      if (!strategyId || !planId || !aadhaarNumber) return res.status(400).send("strategyId, planId and aadhaarNumber required");
      if (!/^\d{12}$/.test(aadhaarNumber)) return res.status(400).send("Invalid Aadhaar number format");

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) return res.status(404).send("Strategy not found");

      const result = await sendAadhaarOtp(aadhaarNumber);

      const existing = await storage.getEsignAgreementByUserAndStrategy(req.session.userId!, strategyId, planId);
      if (existing) {
        await storage.updateEsignAgreement(existing.id, {
          status: "otp_sent",
          aadhaarRefId: String(result.referenceId),
          aadhaarLast4: aadhaarNumber.slice(-4),
        });
      } else {
        await storage.createEsignAgreement({
          userId: req.session.userId!,
          advisorId: strategy.advisorId,
          strategyId,
          planId,
          status: "otp_sent",
          aadhaarRefId: String(result.referenceId),
          aadhaarLast4: aadhaarNumber.slice(-4),
          agreementVersion: "1.0",
        });
      }

      res.json({ success: true, message: result.message, referenceId: result.referenceId });
    } catch (err: any) {
      console.error("[eSign] OTP send error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/esign/verify", requireAuth, async (req, res) => {
    try {
      const { strategyId, planId, referenceId, otp } = req.body;
      if (!strategyId || !planId || !referenceId || !otp) {
        return res.status(400).send("strategyId, planId, referenceId and otp required");
      }

      const result = await verifyAadhaarOtp(Number(referenceId), otp);

      const agreements = await db.select().from(esignAgreements)
        .where(and(
          eq(esignAgreements.userId, req.session.userId!),
          eq(esignAgreements.strategyId, strategyId),
          eq(esignAgreements.planId, planId),
          eq(esignAgreements.status, "otp_sent")
        ))
        .orderBy(desc(esignAgreements.createdAt))
        .limit(1);

      const agreement = agreements[0];
      if (!agreement) return res.status(404).send("No pending agreement found");

      await storage.updateEsignAgreement(agreement.id, {
        status: "signed",
        aadhaarName: result.name,
        aadhaarTransactionId: result.transactionId,
        signedAt: new Date(),
        rawResponse: {
          name: result.name,
          dob: result.dob,
          gender: result.gender,
          transactionId: result.transactionId,
        },
      });

      const strategy = await storage.getStrategy(strategyId);
      const user = await storage.getUser(req.session.userId!);
      const advisor = await storage.getUser(agreement.advisorId);

      if (user && advisor && strategy) {
        sendEsignAgreementEmail({
          investorName: user.companyName || user.username,
          investorEmail: user.email,
          advisorName: advisor.companyName || advisor.username,
          advisorEmail: advisor.email,
          strategyName: strategy.name,
          signedAt: new Date(),
          aadhaarName: result.name,
          aadhaarLast4: agreement.aadhaarLast4 || "",
        }).catch(err => console.error("[eSign] Email error:", err));
      }

      res.json({ success: true, agreementId: agreement.id, name: result.name });
    } catch (err: any) {
      console.error("[eSign] Verify error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/esign/status", requireAuth, async (req, res) => {
    try {
      const { strategyId, planId } = req.query;
      if (!strategyId || !planId) return res.status(400).send("strategyId and planId required");

      const agreement = await storage.getEsignAgreementByUserAndStrategy(
        req.session.userId!, strategyId as string, planId as string
      );

      if (agreement && agreement.status === "signed") {
        res.json({
          signed: true,
          agreementId: agreement.id,
          signedAt: agreement.signedAt,
          aadhaarName: agreement.aadhaarName,
        });
      } else {
        res.json({ signed: false });
      }
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/advisor/agreements/:subscriptionId", requireAdvisor, async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.advisorId !== req.session.userId) return res.status(403).send("Not authorized");

      const agreement = await storage.getEsignAgreementBySubscription(subscriptionId);
      if (!agreement) return res.status(404).json({ found: false });

      const user = await storage.getUser(agreement.userId);

      res.json({
        found: true,
        agreementId: agreement.id,
        investorName: user?.username || "Unknown",
        investorEmail: user?.email || "",
        aadhaarName: agreement.aadhaarName,
        aadhaarLast4: agreement.aadhaarLast4,
        signedAt: agreement.signedAt,
        agreementVersion: agreement.agreementVersion,
        status: agreement.status,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/ekyc/configured", (req, res) => {
    res.json({ configured: isSandboxConfigured() });
  });

  app.get("/api/ekyc/status", requireAuth, async (req, res) => {
    try {
      const { subscriptionId } = req.query;
      if (!subscriptionId) return res.status(400).send("subscriptionId required");

      const sub = await storage.getSubscription(subscriptionId as string);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.userId !== req.session.userId) return res.status(403).send("Not authorized");

      const aadhaarVerification = await storage.getEkycBySubscriptionAndType(subscriptionId as string, "aadhaar");
      const panVerification = await storage.getEkycBySubscriptionAndType(subscriptionId as string, "pan");

      res.json({
        subscriptionId: sub.id,
        ekycDone: sub.ekycDone,
        aadhaar: aadhaarVerification ? {
          status: aadhaarVerification.status,
          name: aadhaarVerification.aadhaarName,
          last4: aadhaarVerification.aadhaarLast4,
          verifiedAt: aadhaarVerification.verifiedAt,
        } : null,
        pan: panVerification ? {
          status: panVerification.status,
          panNumber: panVerification.panNumber,
          panName: panVerification.panName,
          verifiedAt: panVerification.verifiedAt,
        } : null,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/ekyc/aadhaar/otp", requireAuth, async (req, res) => {
    try {
      const { subscriptionId, aadhaarNumber } = req.body;
      if (!subscriptionId || !aadhaarNumber) return res.status(400).send("subscriptionId and aadhaarNumber required");
      if (!/^\d{12}$/.test(aadhaarNumber)) return res.status(400).send("Invalid Aadhaar number format");

      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.userId !== req.session.userId) return res.status(403).send("Not authorized");

      const result = await sendAadhaarOtp(aadhaarNumber);

      const existing = await storage.getEkycBySubscriptionAndType(subscriptionId, "aadhaar");
      if (existing) {
        await storage.updateEkycVerification(existing.id, {
          status: "otp_sent",
          aadhaarRefId: String(result.referenceId),
          aadhaarTransactionId: result.transactionId,
          aadhaarLast4: aadhaarNumber.slice(-4),
        });
      } else {
        await storage.createEkycVerification({
          subscriptionId,
          userId: sub.userId,
          advisorId: sub.advisorId,
          verificationType: "aadhaar",
          status: "otp_sent",
          aadhaarRefId: String(result.referenceId),
          aadhaarTransactionId: result.transactionId,
          aadhaarLast4: aadhaarNumber.slice(-4),
        });
      }

      res.json({ success: true, message: result.message, referenceId: result.referenceId });
    } catch (err: any) {
      console.error("[eKYC] Aadhaar OTP error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ekyc/aadhaar/verify", requireAuth, async (req, res) => {
    try {
      const { subscriptionId, referenceId, otp } = req.body;
      if (!subscriptionId || !referenceId || !otp) return res.status(400).send("subscriptionId, referenceId and otp required");

      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.userId !== req.session.userId) return res.status(403).send("Not authorized");

      const result = await verifyAadhaarOtp(Number(referenceId), otp);

      const existing = await storage.getEkycBySubscriptionAndType(subscriptionId, "aadhaar");
      if (existing) {
        await storage.updateEkycVerification(existing.id, {
          status: "verified",
          aadhaarName: result.name,
          aadhaarDob: result.dob,
          aadhaarGender: result.gender,
          aadhaarAddress: result.address,
          aadhaarPhoto: result.photo,
          aadhaarTransactionId: result.transactionId,
          verifiedAt: new Date(),
        });
      }

      const panVerification = await storage.getEkycBySubscriptionAndType(subscriptionId, "pan");
      if (panVerification?.status === "verified") {
        await storage.updateSubscription(sub.id, { ekycDone: true });
      }

      res.json({
        success: true,
        name: result.name,
        dob: result.dob,
        gender: result.gender,
      });
    } catch (err: any) {
      console.error("[eKYC] Aadhaar verify error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ekyc/pan/verify", requireAuth, async (req, res) => {
    try {
      const { subscriptionId, pan, nameAsPan, dateOfBirth } = req.body;
      if (!subscriptionId || !pan) return res.status(400).send("subscriptionId and pan required");
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(pan)) return res.status(400).send("Invalid PAN format");

      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.userId !== req.session.userId) return res.status(403).send("Not authorized");

      const result = await verifyPan(pan, nameAsPan || "", dateOfBirth || "");

      const maskedPan = pan.slice(0, 2) + "****" + pan.slice(-2);

      const existing = await storage.getEkycBySubscriptionAndType(subscriptionId, "pan");
      if (existing) {
        await storage.updateEkycVerification(existing.id, {
          status: result.status === "valid" ? "verified" : "failed",
          panNumber: maskedPan,
          panStatus: result.status,
          panName: result.pan,
          panCategory: result.category,
          panAadhaarLinked: result.aadhaarLinked,
          verifiedAt: result.status === "valid" ? new Date() : null,
        });
      } else {
        await storage.createEkycVerification({
          subscriptionId,
          userId: sub.userId,
          advisorId: sub.advisorId,
          verificationType: "pan",
          status: result.status === "valid" ? "verified" : "failed",
          panNumber: maskedPan,
          panStatus: result.status,
          panName: result.pan,
          panCategory: result.category,
          panAadhaarLinked: result.aadhaarLinked,
        });
      }

      const aadhaarVerification = await storage.getEkycBySubscriptionAndType(subscriptionId, "aadhaar");
      if (aadhaarVerification?.status === "verified" && result.status === "valid") {
        await storage.updateSubscription(sub.id, { ekycDone: true });
      }

      res.json({
        success: true,
        status: result.status,
        category: result.category,
        nameMatch: result.nameMatch,
        dobMatch: result.dobMatch,
        aadhaarLinked: result.aadhaarLinked,
      });
    } catch (err: any) {
      console.error("[eKYC] PAN verify error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/advisor/ekyc/:subscriptionId", requireAdvisor, async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const sub = await storage.getSubscription(subscriptionId);
      if (!sub) return res.status(404).send("Subscription not found");
      if (sub.advisorId !== req.session.userId) return res.status(403).send("Not authorized");

      const aadhaarV = await storage.getEkycBySubscriptionAndType(subscriptionId, "aadhaar");
      const panV = await storage.getEkycBySubscriptionAndType(subscriptionId, "pan");
      const user = await storage.getUser(sub.userId);

      res.json({
        subscriptionId,
        investorName: user?.username || "Unknown",
        investorEmail: user?.email || "",
        ekycDone: sub.ekycDone,
        aadhaar: aadhaarV ? {
          status: aadhaarV.status,
          name: aadhaarV.aadhaarName,
          last4: aadhaarV.aadhaarLast4,
          dob: aadhaarV.aadhaarDob,
          gender: aadhaarV.aadhaarGender,
          address: aadhaarV.aadhaarAddress,
          photo: aadhaarV.aadhaarPhoto,
          verifiedAt: aadhaarV.verifiedAt,
        } : null,
        pan: panV ? {
          status: panV.status,
          number: panV.panNumber,
          name: panV.panName,
          category: panV.panCategory,
          aadhaarLinked: panV.panAadhaarLinked,
          verifiedAt: panV.verifiedAt,
        } : null,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/notifications/vapid-key", (req, res) => {
    if (!pushEnabled || !vapidPublicKey) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey: vapidPublicKey });
  });

  app.post("/api/notifications/subscribe", async (req, res) => {
    try {
      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).send("Invalid push subscription");
      }
      const userId = req.session?.userId || null;
      await storage.createPushSubscription({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.delete("/api/notifications/subscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).send("Endpoint required");
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/notifications/recent", requireAuth, async (req, res) => {
    try {
      const allNotifications = await storage.getRecentNotifications(100);
      const userSubs = await storage.getSubscriptionsByUserId(req.session.userId!);
      const subscribedStrategyIds = new Set(userSubs.filter(s => s.status === "active" && s.strategyId).map(s => s.strategyId));

      const filtered = allNotifications.filter(n => {
        if (n.targetScope === "all_users" || n.targetScope === "all_visitors") return true;
        if (n.targetScope === "strategy_subscribers" && n.strategyId) {
          return subscribedStrategyIds.has(n.strategyId);
        }
        return false;
      });
      res.json(filtered.slice(0, 50));
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.post("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const { title, body, url, scope } = req.body;
      if (!title || !body) return res.status(400).send("Title and body required");

      const payload = { title, body, url: url || "/", tag: "admin-alert", data: { url: url || "/" } };
      if (scope === "all_visitors") {
        await notifyAllVisitors(payload);
      } else {
        await notifyAllUsers(payload);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  app.get("/api/risk-profiling/check", requireAuth, async (req, res) => {
    try {
      const { subscriptionId } = req.query;
      if (!subscriptionId) return res.status(400).send("subscriptionId required");

      const sub = await storage.getSubscription(subscriptionId as string);
      if (!sub) return res.status(404).send("Subscription not found");

      const advisor = await storage.getUser(sub.advisorId);
      const requiresRiskProfiling = advisor?.requireRiskProfiling || false;

      const existing = await storage.getRiskProfileBySubscription(subscriptionId as string);

      res.json({
        requiresRiskProfiling,
        completed: !!existing,
        subscriptionId: sub.id,
        advisorId: sub.advisorId,
        advisorName: advisor?.companyName || advisor?.username,
      });
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  return httpServer;
}
