import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { sendRegistrationNotification, sendUserWelcomeEmail, sendPasswordResetEmail, sendAdvisorAgreementEmail } from "./email";
import { getLiveQuote, getLivePrices, setGrowwAccessToken, getGrowwTokenStatus, getOptionChainExpiries, getOptionChain } from "./groww";
import type { Plan } from "@shared/schema";
import nseSymbols from "./data/nse-symbols.json";

const scryptAsync = promisify(scrypt);

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
        const activeCount = activeCalls.filter((c: any) => c.status === "Active" && (c.publishMode === "live" || c.isPublished)).length;
        const horizon = (s.horizon || "").toLowerCase();
        const type = s.type;

        if (horizon.includes("intraday")) counts["Intraday"] += activeCount;
        if (type === "Future" || type === "Option") counts["F&O"] += activeCount;
        if (horizon.includes("swing")) counts["Swing"] += activeCount;
        if (horizon.includes("positional") || horizon.includes("long term")) counts["Positional"] += activeCount;
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
      const { sellPrice, reason } = req.body || {};
      const entryPrice = Number(call.entryPrice || call.buyRangeStart || 0);
      const exitPrice = sellPrice ? Number(sellPrice) : entryPrice;
      const gainPercent = entryPrice > 0 ? (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2) : "0";
      const updated = await storage.updateCall(call.id, {
        status: "Closed",
        sellPrice: String(exitPrice),
        gainPercent,
        exitDate: new Date(),
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
      res.json(subs);
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

  return httpServer;
}
