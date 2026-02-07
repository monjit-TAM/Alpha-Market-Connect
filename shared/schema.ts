import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["advisor", "investor", "admin"]);
export const strategyStatusEnum = pgEnum("strategy_status", ["Draft", "Published"]);
export const callStatusEnum = pgEnum("call_status", ["Active", "Closed"]);
export const strategyTypeEnum = pgEnum("strategy_type", ["Equity", "Basket", "Future", "Commodity", "CommodityFuture", "Option"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("investor"),
  companyName: text("company_name"),
  overview: text("overview"),
  themes: text("themes").array(),
  logoUrl: text("logo_url"),
  sebiCertUrl: text("sebi_cert_url"),
  sebiRegNumber: text("sebi_reg_number"),
  isRegistered: boolean("is_registered").default(false),
  isApproved: boolean("is_approved").default(false),
  agreementConsent: boolean("agreement_consent").default(false),
  agreementConsentDate: timestamp("agreement_consent_date"),
  activeSince: timestamp("active_since"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const strategies = pgTable("strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advisorId: varchar("advisor_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: strategyTypeEnum("type").notNull().default("Equity"),
  description: text("description"),
  status: strategyStatusEnum("status").notNull().default("Draft"),
  theme: text("theme").array(),
  managementStyle: text("management_style"),
  horizon: text("horizon"),
  keySectors: text("key_sectors").array(),
  volatility: text("volatility"),
  riskLevel: text("risk_level"),
  benchmark: text("benchmark"),
  minimumInvestment: numeric("minimum_investment"),
  cagr: numeric("cagr"),
  planIds: text("plan_ids").array(),
  totalRecommendations: integer("total_recommendations").default(0),
  stocksInBuyZone: integer("stocks_in_buy_zone").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  modifiedAt: timestamp("modified_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  stockName: text("stock_name").notNull(),
  action: text("action").notNull().default("Buy"),
  buyRangeStart: numeric("buy_range_start"),
  buyRangeEnd: numeric("buy_range_end"),
  targetPrice: numeric("target_price"),
  profitGoal: numeric("profit_goal"),
  stopLoss: numeric("stop_loss"),
  rationale: text("rationale"),
  status: callStatusEnum("status").notNull().default("Active"),
  entryPrice: numeric("entry_price"),
  sellPrice: numeric("sell_price"),
  gainPercent: numeric("gain_percent"),
  callDate: timestamp("call_date").defaultNow(),
  exitDate: timestamp("exit_date"),
  isPublished: boolean("is_published").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id").notNull().references(() => strategies.id),
  segment: text("segment").notNull().default("Equity"),
  callPut: text("call_put"),
  buySell: text("buy_sell").default("Buy"),
  symbol: text("symbol"),
  expiry: text("expiry"),
  strikePrice: numeric("strike_price"),
  entryPrice: numeric("entry_price"),
  lots: integer("lots"),
  target: numeric("target"),
  stopLoss: numeric("stop_loss"),
  rationale: text("rationale"),
  status: callStatusEnum("status").notNull().default("Active"),
  isPublished: boolean("is_published").default(false),
  publishMode: text("publish_mode").default("draft"),
  enableLeg: boolean("enable_leg").default(false),
  usePercentage: boolean("use_percentage").default(false),
  exitPrice: numeric("exit_price"),
  exitDate: timestamp("exit_date"),
  gainPercent: numeric("gain_percent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advisorId: varchar("advisor_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  amount: numeric("amount").notNull(),
  durationDays: integer("duration_days"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => plans.id),
  strategyId: varchar("strategy_id").references(() => strategies.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  advisorId: varchar("advisor_id").notNull().references(() => users.id),
  status: text("status").notNull().default("active"),
  ekycDone: boolean("ekyc_done").default(false),
  riskProfiling: boolean("risk_profiling").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const content = pgTable("content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advisorId: varchar("advisor_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  type: text("type").notNull().default("MarketUpdate"),
  body: text("body"),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scores = pgTable("scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advisorId: varchar("advisor_id").notNull().references(() => users.id),
  beginningOfMonth: integer("beginning_of_month"),
  receivedDuring: integer("received_during"),
  resolvedDuring: integer("resolved_during"),
  pendingAtEnd: integer("pending_at_end"),
  pendencyReasons: text("pendency_reasons"),
  month: text("month"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertStrategySchema = createInsertSchema(strategies).omit({ id: true, createdAt: true, modifiedAt: true });
export const insertCallSchema = createInsertSchema(calls).omit({ id: true, createdAt: true });
export const insertPositionSchema = createInsertSchema(positions).omit({ id: true, createdAt: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertContentSchema = createInsertSchema(content).omit({ id: true, createdAt: true });
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = z.infer<typeof insertStrategySchema>;
export type Call = typeof calls.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Position = typeof positions.$inferSelect;
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Content = typeof content.$inferSelect;
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;
