import { storage } from "./storage";
import { db } from "./db";
import { calls, positions, strategies } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getLiveQuote } from "./groww";

function getISTTime(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
}

async function autoSquareOffIntraday() {
  try {
    const ist = getISTTime();
    const hours = ist.getHours();
    const minutes = ist.getMinutes();

    if (hours !== 15 || minutes < 25 || minutes > 30) return;

    const intradayStrategies = await db
      .select()
      .from(strategies)
      .where(eq(strategies.horizon, "Intraday"));

    for (const strategy of intradayStrategies) {
      const activeCalls = await db
        .select()
        .from(calls)
        .where(and(eq(calls.strategyId, strategy.id), eq(calls.status, "Active")));

      for (const call of activeCalls) {
        const entryPrice = Number(call.entryPrice || call.buyRangeStart || 0);
        let sellPrice = entryPrice;
        let gainPercent = 0;

        try {
          const liveQuote = await getLiveQuote(call.stockName, strategy.type);
          if (liveQuote && liveQuote.ltp > 0) {
            sellPrice = liveQuote.ltp;
            gainPercent = entryPrice > 0 ? ((sellPrice - entryPrice) / entryPrice) * 100 : 0;
          }
        } catch (e) {
          console.error(`[Scheduler] Could not fetch live price for ${call.stockName}, using entry price`);
        }

        await storage.updateCall(call.id, {
          status: "Closed",
          sellPrice: String(sellPrice.toFixed(2)),
          gainPercent: String(gainPercent.toFixed(2)),
          exitDate: new Date(),
        });
        console.log(`[Scheduler] Auto-squared off intraday call ${call.id} (${call.stockName}) at ${"\u20B9"}${sellPrice.toFixed(2)}, P&L: ${gainPercent.toFixed(2)}%`);
      }

      const activePositions = await db
        .select()
        .from(positions)
        .where(and(eq(positions.strategyId, strategy.id), eq(positions.status, "Active")));

      for (const pos of activePositions) {
        await storage.updatePosition(pos.id, {
          status: "Closed",
        });
        console.log(`[Scheduler] Auto-squared off intraday position ${pos.id} (${pos.symbol})`);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error in auto square-off:", err);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(() => {
    autoSquareOffIntraday();
  }, 60 * 1000);

  console.log("[Scheduler] Intraday auto-square-off scheduler started (checks every minute)");
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
