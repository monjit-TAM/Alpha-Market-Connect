import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  users, strategies, calls, positions, plans, subscriptions, content, scores, passwordResetTokens,
  type User, type InsertUser,
  type Strategy, type InsertStrategy,
  type Call, type InsertCall,
  type Position, type InsertPosition,
  type Plan, type InsertPlan,
  type Subscription, type InsertSubscription,
  type Content, type InsertContent,
  type Score, type InsertScore,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAdvisors(): Promise<User[]>;
  getAdvisorWithDetails(id: string): Promise<any>;
  getAllUsers(): Promise<User[]>;

  getStrategies(advisorId: string): Promise<Strategy[]>;
  getAllStrategies(): Promise<any[]>;
  getPublishedStrategies(): Promise<any[]>;
  getStrategy(id: string): Promise<any>;
  createStrategy(data: InsertStrategy): Promise<Strategy>;
  updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy>;
  deleteStrategy(id: string): Promise<void>;

  getCalls(strategyId: string): Promise<Call[]>;
  createCall(data: InsertCall): Promise<Call>;
  updateCall(id: string, data: Partial<Call>): Promise<Call>;

  getPositions(strategyId: string): Promise<Position[]>;
  createPosition(data: InsertPosition): Promise<Position>;
  updatePosition(id: string, data: Partial<Position>): Promise<Position>;
  getCall(id: string): Promise<Call | undefined>;
  getPosition(id: string): Promise<Position | undefined>;
  getActiveCallsByStrategy(strategyId: string): Promise<Call[]>;
  getActivePositionsByStrategy(strategyId: string): Promise<Position[]>;
  getUserSubscriptionForStrategy(userId: string, strategyId: string): Promise<Subscription | undefined>;
  getAllActiveCalls(): Promise<(Call & { strategy?: Strategy })[]>;
  getAllActivePositions(): Promise<(Position & { strategy?: Strategy })[]>;

  getPlans(advisorId: string): Promise<Plan[]>;
  createPlan(data: InsertPlan): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  getSubscriptions(advisorId: string): Promise<Subscription[]>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;

  getContent(advisorId: string): Promise<Content[]>;
  getPublicContentByType(type: string): Promise<(Content & { advisor: { id: string; username: string; companyName: string | null; logoUrl: string | null } })[]>;
  createContent(data: InsertContent): Promise<Content>;
  deleteContent(id: string): Promise<void>;

  getScores(advisorId: string): Promise<Score[]>;
  createScore(data: InsertScore): Promise<Score>;

  createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<any>;
  getPasswordResetToken(token: string): Promise<any>;
  markTokenUsed(tokenId: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const userStrats = await db.select().from(strategies).where(eq(strategies.advisorId, id));
    for (const s of userStrats) {
      await db.delete(calls).where(eq(calls.strategyId, s.id));
      await db.delete(positions).where(eq(positions.strategyId, s.id));
    }
    await db.delete(strategies).where(eq(strategies.advisorId, id));
    await db.delete(plans).where(eq(plans.advisorId, id));
    await db.delete(content).where(eq(content.advisorId, id));
    await db.delete(scores).where(eq(scores.advisorId, id));
    await db.delete(subscriptions).where(eq(subscriptions.advisorId, id));
    await db.delete(subscriptions).where(eq(subscriptions.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAdvisors(): Promise<User[]> {
    return db.select().from(users).where(and(eq(users.role, "advisor"), eq(users.isApproved, true))).orderBy(desc(users.createdAt));
  }

  async getAdvisorWithDetails(id: string): Promise<any> {
    const [advisor] = await db.select().from(users).where(eq(users.id, id));
    if (!advisor) return null;
    const strats = await db.select().from(strategies).where(eq(strategies.advisorId, id));
    const conts = await db.select().from(content).where(eq(content.advisorId, id)).orderBy(desc(content.createdAt));
    const scrs = await db.select().from(scores).where(eq(scores.advisorId, id)).orderBy(desc(scores.createdAt));
    return { ...advisor, strategies: strats, contents: conts, scores: scrs };
  }

  async getStrategies(advisorId: string): Promise<Strategy[]> {
    return db.select().from(strategies).where(eq(strategies.advisorId, advisorId)).orderBy(desc(strategies.createdAt));
  }

  async getAllStrategies(): Promise<any[]> {
    const strats = await db.select().from(strategies).orderBy(desc(strategies.createdAt));
    const result = [];
    for (const s of strats) {
      const [advisor] = await db.select().from(users).where(eq(users.id, s.advisorId));
      const { password: _, ...safeAdvisor } = advisor || {} as any;
      result.push({ ...s, advisor: safeAdvisor });
    }
    return result;
  }

  async getPublishedStrategies(): Promise<any[]> {
    const strats = await db.select().from(strategies).where(eq(strategies.status, "Published")).orderBy(desc(strategies.createdAt));
    const result = [];
    for (const s of strats) {
      const [advisor] = await db.select().from(users).where(eq(users.id, s.advisorId));
      if (!advisor || !advisor.isApproved) continue;
      const stratCalls = await db.select().from(calls).where(eq(calls.strategyId, s.id));
      const liveCalls = stratCalls.filter((c) => c.status === "Active").length;
      const { password: _, ...safeAdvisor } = advisor || {} as any;
      result.push({ ...s, advisor: safeAdvisor, liveCalls });
    }
    return result;
  }

  async getStrategy(id: string): Promise<any> {
    const [s] = await db.select().from(strategies).where(eq(strategies.id, id));
    if (!s) return null;
    const [advisor] = await db.select().from(users).where(eq(users.id, s.advisorId));
    return { ...s, advisor };
  }

  async createStrategy(data: InsertStrategy): Promise<Strategy> {
    const [s] = await db.insert(strategies).values(data).returning();
    return s;
  }

  async updateStrategy(id: string, data: Partial<Strategy>): Promise<Strategy> {
    const [s] = await db.update(strategies).set({ ...data, modifiedAt: new Date() }).where(eq(strategies.id, id)).returning();
    return s;
  }

  async deleteStrategy(id: string): Promise<void> {
    await db.delete(calls).where(eq(calls.strategyId, id));
    await db.delete(positions).where(eq(positions.strategyId, id));
    await db.delete(strategies).where(eq(strategies.id, id));
  }

  async getCalls(strategyId: string): Promise<Call[]> {
    return db.select().from(calls).where(eq(calls.strategyId, strategyId)).orderBy(desc(calls.createdAt));
  }

  async createCall(data: InsertCall): Promise<Call> {
    const [c] = await db.insert(calls).values(data).returning();
    return c;
  }

  async updateCall(id: string, data: Partial<Call>): Promise<Call> {
    const [c] = await db.update(calls).set(data).where(eq(calls.id, id)).returning();
    return c;
  }

  async getPositions(strategyId: string): Promise<Position[]> {
    return db.select().from(positions).where(eq(positions.strategyId, strategyId)).orderBy(desc(positions.createdAt));
  }

  async createPosition(data: InsertPosition): Promise<Position> {
    const [p] = await db.insert(positions).values(data).returning();
    return p;
  }

  async updatePosition(id: string, data: Partial<Position>): Promise<Position> {
    const [p] = await db.update(positions).set(data).where(eq(positions.id, id)).returning();
    return p;
  }

  async getCall(id: string): Promise<Call | undefined> {
    const [c] = await db.select().from(calls).where(eq(calls.id, id));
    return c;
  }

  async getPosition(id: string): Promise<Position | undefined> {
    const [p] = await db.select().from(positions).where(eq(positions.id, id));
    return p;
  }

  async getActiveCallsByStrategy(strategyId: string): Promise<Call[]> {
    return db.select().from(calls).where(and(eq(calls.strategyId, strategyId), eq(calls.status, "Active"))).orderBy(desc(calls.createdAt));
  }

  async getActivePositionsByStrategy(strategyId: string): Promise<Position[]> {
    return db.select().from(positions).where(and(eq(positions.strategyId, strategyId), eq(positions.status, "Active"))).orderBy(desc(positions.createdAt));
  }

  async getUserSubscriptionForStrategy(userId: string, strategyId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.strategyId, strategyId), eq(subscriptions.status, "active"))
    );
    return sub;
  }

  async getAllActiveCalls(): Promise<(Call & { strategy?: Strategy })[]> {
    const result = await db.select({
      call: calls,
      strategy: strategies,
    }).from(calls)
      .leftJoin(strategies, eq(calls.strategyId, strategies.id))
      .where(eq(calls.status, "Active"));
    return result.map(r => ({ ...r.call, strategy: r.strategy || undefined }));
  }

  async getAllActivePositions(): Promise<(Position & { strategy?: Strategy })[]> {
    const result = await db.select({
      position: positions,
      strategy: strategies,
    }).from(positions)
      .leftJoin(strategies, eq(positions.strategyId, strategies.id))
      .where(eq(positions.status, "Active"));
    return result.map(r => ({ ...r.position, strategy: r.strategy || undefined }));
  }

  async getPlans(advisorId: string): Promise<Plan[]> {
    return db.select().from(plans).where(eq(plans.advisorId, advisorId)).orderBy(desc(plans.createdAt));
  }

  async createPlan(data: InsertPlan): Promise<Plan> {
    const [p] = await db.insert(plans).values(data).returning();
    return p;
  }

  async deletePlan(id: string): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
  }

  async getSubscriptions(advisorId: string): Promise<Subscription[]> {
    return db.select().from(subscriptions).where(eq(subscriptions.advisorId, advisorId)).orderBy(desc(subscriptions.createdAt));
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [s] = await db.insert(subscriptions).values(data).returning();
    return s;
  }

  async getContent(advisorId: string): Promise<Content[]> {
    return db.select().from(content).where(eq(content.advisorId, advisorId)).orderBy(desc(content.createdAt));
  }

  async getPublicContentByType(type: string) {
    const rows = await db
      .select({
        id: content.id,
        advisorId: content.advisorId,
        title: content.title,
        type: content.type,
        body: content.body,
        createdAt: content.createdAt,
        advisorUsername: users.username,
        advisorCompanyName: users.companyName,
        advisorLogoUrl: users.logoUrl,
      })
      .from(content)
      .innerJoin(users, eq(content.advisorId, users.id))
      .where(and(eq(content.type, type), eq(users.role, "advisor"), eq(users.isApproved, true)))
      .orderBy(desc(content.createdAt));

    return rows.map((r) => ({
      id: r.id,
      advisorId: r.advisorId,
      title: r.title,
      type: r.type,
      body: r.body,
      createdAt: r.createdAt,
      advisor: {
        id: r.advisorId,
        username: r.advisorUsername,
        companyName: r.advisorCompanyName,
        logoUrl: r.advisorLogoUrl,
      },
    }));
  }

  async createContent(data: InsertContent): Promise<Content> {
    const [c] = await db.insert(content).values(data).returning();
    return c;
  }

  async deleteContent(id: string): Promise<void> {
    await db.delete(content).where(eq(content.id, id));
  }

  async getScores(advisorId: string): Promise<Score[]> {
    return db.select().from(scores).where(eq(scores.advisorId, advisorId)).orderBy(desc(scores.createdAt));
  }

  async createScore(data: InsertScore): Promise<Score> {
    const [s] = await db.insert(scores).values(data).returning();
    return s;
  }

  async createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<any> {
    const [t] = await db.insert(passwordResetTokens).values({ userId, token, expiresAt }).returning();
    return t;
  }

  async getPasswordResetToken(token: string): Promise<any> {
    const [t] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return t || null;
  }

  async markTokenUsed(tokenId: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, tokenId));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
