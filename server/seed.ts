import { db } from "./db";
import { users, strategies, calls, plans, content, scores } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function seed() {
  const existingAdvisors = await db.select().from(users).where(eq(users.role, "advisor"));
  if (existingAdvisors.length > 0) return;

  const advisorPassword = await hashPassword("advisor123");
  const investorPassword = await hashPassword("investor123");

  const [advisor1] = await db.insert(users).values({
    username: "stokwiz",
    email: "gaurav@stokwiz.com",
    password: advisorPassword,
    phone: "+91 7259-667755",
    role: "advisor",
    companyName: "STOKWIZ",
    overview: "Welcome to STOKWIZ, a revered entity in the financial domain, holding prestigious accreditation as a SEBI registered Investment Advisor. We take immense pride in our robust legacy of aiding Indian investors. Our commitment is fortified by our endeavor to furnish our clientele with precise insights, well-founded calls, expert advisory, and profound market analysis.\n\nAt STOKWIZ, we champion the ethos of empowering investors to navigate the financial markets with enhanced acuity and confidence, ensuring they are well-positioned to make informed and lucrative decisions.",
    themes: ["Equity", "F&O", "Growth"],
    isRegistered: true,
    sebiRegNumber: "INH000012345",
    activeSince: new Date("2023-06-17"),
  }).returning();

  const [advisor2] = await db.insert(users).values({
    username: "finqoz",
    email: "research@finqoz.com",
    password: advisorPassword,
    phone: "+91 9876-543210",
    role: "advisor",
    companyName: "FINQOZ ROBOADVISORY SERVICES PVT. LTD.",
    overview: "FINQOZ is a quantitative research and robo-advisory platform that builds data-backed stock baskets designed for long-term, consistent wealth creation. Our team of experienced financial analysts and data scientists work together to deliver high-quality investment strategies.",
    themes: ["Equity", "F&O", "Value", "Momentum"],
    isRegistered: true,
    sebiRegNumber: "INH000067890",
    activeSince: new Date("2024-12-01"),
  }).returning();

  const [advisor3] = await db.insert(users).values({
    username: "harshal_parmar",
    email: "harshal@parmar.com",
    password: advisorPassword,
    phone: "+91 8765-432109",
    role: "advisor",
    companyName: "Parmar Capital Research",
    overview: "Parmar Capital Research is dedicated to providing data-driven insights and strategic guidance to help clients achieve their financial goals. With years of experience in equity markets, our research process combines fundamental and technical analysis for comprehensive stock coverage.",
    themes: ["Equity"],
    isRegistered: true,
    sebiRegNumber: "INH000054321",
    activeSince: new Date("2025-01-28"),
  }).returning();

  await db.insert(users).values({
    username: "investor1",
    email: "investor1@gmail.com",
    password: investorPassword,
    role: "investor",
  });

  const [strategy1] = await db.insert(strategies).values({
    advisorId: advisor1.id,
    name: "Nifty and BankNifty Options",
    type: "Option",
    description: "This strategy is going to focus on Nifty and BankNifty options with precise entry points, carefully defined target levels, and strict stop losses to maximize returns while managing risk effectively.",
    status: "Published",
    theme: ["Equity", "F&O"],
    horizon: "Intraday",
    volatility: "High",
    benchmark: "Nifty 50",
    cagr: "-1.75",
    totalRecommendations: 12,
    stocksInBuyZone: 0,
  }).returning();

  const [strategy2] = await db.insert(strategies).values({
    advisorId: advisor1.id,
    name: "WIZ GROWTH LONG TERM",
    type: "Equity",
    description: "This is a Strategy Focusing on Long Term Positional Calls based on Growth Parameters. We will try to identify Growth Stocks and will have a horizon of 3 to 6 Months.",
    status: "Published",
    theme: ["Equity", "Growth", "Value"],
    horizon: "Long Term",
    volatility: "Medium",
    benchmark: "Nifty 50",
    cagr: "-1.75",
    totalRecommendations: 12,
    stocksInBuyZone: 0,
    minimumInvestment: "50000",
  }).returning();

  const [strategy3] = await db.insert(strategies).values({
    advisorId: advisor2.id,
    name: "V8 Momentum Quant Basket",
    type: "Basket",
    description: "To consistently outperform Nifty 50 using a fully non-discretionary, rule-based system that captures emerging trends and momentum signals across Indian equities.",
    status: "Published",
    theme: ["Equity", "Momentum"],
    horizon: "Positional",
    volatility: "Medium",
    benchmark: "Nifty 50",
    totalRecommendations: 8,
    minimumInvestment: "17000",
  }).returning();

  const [strategy4] = await db.insert(strategies).values({
    advisorId: advisor2.id,
    name: "Fire Wealth Compounder",
    type: "Basket",
    description: "The Wealth Compounder Basket is a research-driven portfolio crafted to uncover early-stage, high-growth opportunities while maintaining a margin of safety.",
    status: "Published",
    theme: ["Equity", "Growth"],
    horizon: "Positional",
    volatility: "Medium",
    benchmark: "Sensex",
    totalRecommendations: 5,
    minimumInvestment: "25000",
  }).returning();

  const [strategy5] = await db.insert(strategies).values({
    advisorId: advisor3.id,
    name: "Equity Positional",
    type: "Equity",
    description: "Equity positional stocks are shares bought with a medium to long-term horizon, typically held for weeks to months, based on fundamental strength and technical trends. Unlike intraday or short-term trades, positional investing focuses on capturing larger price movements.",
    status: "Published",
    theme: ["Equity"],
    horizon: "Positional",
    volatility: "Medium",
    benchmark: "Nifty 50",
    cagr: "0",
    totalRecommendations: 15,
    stocksInBuyZone: 7,
  }).returning();

  await db.insert(strategies).values({
    advisorId: advisor1.id,
    name: "Growth Basket LT",
    type: "Basket",
    description: "Growth Stock based on high growth parameters for long-term wealth creation.",
    status: "Published",
    theme: ["Equity", "Growth"],
    horizon: "Long Term",
    volatility: "Medium",
    benchmark: "Nifty 50",
    totalRecommendations: 6,
  });

  await db.insert(strategies).values({
    advisorId: advisor1.id,
    name: "Daywise",
    type: "Equity",
    description: "DayWise is an intraday strategy providing daily actionable calls with tight risk management.",
    status: "Published",
    theme: ["Equity"],
    horizon: "Intraday",
    volatility: "High",
    benchmark: "Nifty 50",
    totalRecommendations: 3,
  });

  await db.insert(calls).values([
    {
      strategyId: strategy2.id,
      stockName: "Oberoi Realty Limited",
      action: "Buy",
      buyRangeStart: "1896",
      entryPrice: "1849",
      sellPrice: "1392",
      gainPercent: "-2.36",
      status: "Closed",
      callDate: new Date("2025-07-01"),
      exitDate: new Date("2025-08-15"),
    },
    {
      strategyId: strategy2.id,
      stockName: "Mangalam Organics Limited",
      action: "Buy",
      buyRangeStart: "595",
      entryPrice: "579",
      sellPrice: "1860",
      gainPercent: "-3.85",
      status: "Closed",
      callDate: new Date("2025-06-18"),
    },
    {
      strategyId: strategy2.id,
      stockName: "ICICI Prudential Life Insurance Company Limited",
      action: "Buy",
      buyRangeStart: "643",
      entryPrice: "642",
      sellPrice: "634.6",
      gainPercent: "1.17",
      status: "Closed",
      callDate: new Date("2025-06-24"),
    },
    {
      strategyId: strategy2.id,
      stockName: "Hindustan Petroleum Corporation Limited",
      action: "Buy",
      buyRangeStart: "410",
      entryPrice: "386.75",
      gainPercent: "-6.15",
      status: "Active",
      callDate: new Date("2025-08-08"),
    },
    {
      strategyId: strategy5.id,
      stockName: "RELIANCE INDUSTRIES LTD",
      action: "Buy",
      buyRangeStart: "1345",
      entryPrice: "1345",
      targetPrice: "1453",
      gainPercent: "0.00",
      status: "Active",
      callDate: new Date("2026-01-28"),
    },
    {
      strategyId: strategy5.id,
      stockName: "RELIANCE INDUSTRIES LTD",
      action: "Buy",
      buyRangeStart: "1385",
      entryPrice: "1380",
      sellPrice: "1400",
      gainPercent: "4.15",
      status: "Closed",
      callDate: new Date("2026-01-28"),
    },
    {
      strategyId: strategy5.id,
      stockName: "CENTRAL DEPO SER (I) LTD",
      action: "Buy",
      buyRangeStart: "1225",
      entryPrice: "1100",
      gainPercent: "0.00",
      status: "Active",
      callDate: new Date("2026-01-28"),
    },
    {
      strategyId: strategy5.id,
      stockName: "ASTRAL LIMITED",
      action: "Buy",
      buyRangeStart: "1400",
      entryPrice: "1400",
      gainPercent: "-0.28",
      status: "Active",
      callDate: new Date("2026-01-28"),
    },
  ]);

  await db.insert(plans).values([
    { advisorId: advisor1.id, name: "365D", code: "000013", amount: "9999" },
    { advisorId: advisor1.id, name: "183D", code: "000014", amount: "5999" },
    { advisorId: advisor1.id, name: "92D", code: "000015", amount: "2999" },
    { advisorId: advisor1.id, name: "30D", code: "000016", amount: "999" },
    { advisorId: advisor1.id, name: "weekly", code: "000029", amount: "49" },
    { advisorId: advisor1.id, name: "Free Plan", code: "0000", amount: "0" },
    { advisorId: advisor1.id, name: "Trial Plan", code: "00061", amount: "1" },
    { advisorId: advisor1.id, name: "Half Yearly", code: "00167", amount: "12999" },
    { advisorId: advisor2.id, name: "Monthly", code: "F001", amount: "2999" },
    { advisorId: advisor2.id, name: "Quarterly", code: "F002", amount: "7999" },
    { advisorId: advisor3.id, name: "Monthly", code: "P001", amount: "1999" },
  ]);

  await db.insert(content).values([
    { advisorId: advisor1.id, title: "Morning Stock Market Commentary - 15th Feb 2025", type: "MarketUpdate", body: "Market analysis and key levels for the day." },
    { advisorId: advisor1.id, title: "Indigo Paints - Analysis", type: "Learn", body: "Detailed analysis of Indigo Paints stock." },
    { advisorId: advisor1.id, title: "Weekly Forecast 17 - 21 February 2025", type: "MarketUpdate", body: "Weekly market forecast covering Nifty, BankNifty." },
    { advisorId: advisor1.id, title: "Analysis on Market Direction - 20th February 2025", type: "MarketUpdate", body: "Market direction analysis." },
    { advisorId: advisor1.id, title: "Jyothy Labs - Research Report", type: "Learn", body: "Detailed research report on Jyothy Labs." },
    { advisorId: advisor1.id, title: "ICICI Securities", type: "Learn", body: "Analysis of ICICI Securities." },
    { advisorId: advisor1.id, title: "J&B Bank - Buy Call", type: "Learn", body: "Buy call analysis for J&B Bank." },
    { advisorId: advisor1.id, title: "Apply Stop Loss - Protect your trades", type: "Learn", body: "Guide on how to use stop loss effectively." },
    { advisorId: advisor2.id, title: "Quantamental Report Kei Industries", type: "Learn", body: "Quantamental analysis of Kei Industries." },
  ]);

  await db.insert(scores).values([
    { advisorId: advisor1.id, beginningOfMonth: 0, receivedDuring: 0, resolvedDuring: 0, pendingAtEnd: 0, pendencyReasons: "", month: "Feb 2026" },
    { advisorId: advisor2.id, beginningOfMonth: 0, receivedDuring: 3, resolvedDuring: 3, pendingAtEnd: 0, pendencyReasons: "", month: "Feb 2026" },
  ]);

  console.log("Seed data inserted successfully");
}
