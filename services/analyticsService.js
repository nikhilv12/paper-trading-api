const db = require("../models");
const { round } = require("../helper/response");
const getAnalytics = async (userId) => {
  const trades = await db.TradeJournal.findAll({
    where: { user_id: userId },
    order: [["exit_time", "ASC"]],
  });
  const values = trades.map((trade) => trade.get({ plain: true }));
  const winners = values.filter((trade) => Number(trade.net_pnl) > 0);
  const grossProfit = winners.reduce(
    (sum, trade) => sum + Number(trade.net_pnl),
    0,
  );
  const grossLoss = Math.abs(
    values
      .filter((trade) => Number(trade.net_pnl) < 0)
      .reduce((sum, trade) => sum + Number(trade.net_pnl), 0),
  );
  let equity = 0;
  return {
    kpis: {
      totalTrades: values.length,
      winRate: values.length
        ? round((winners.length / values.length) * 100)
        : 0,
      netPnl: round(
        values.reduce((sum, trade) => sum + Number(trade.net_pnl), 0),
      ),
      profitFactor: grossLoss
        ? round(grossProfit / grossLoss)
        : grossProfit
          ? 999
          : 0,
      totalCharges: round(
        values.reduce((sum, trade) => sum + Number(trade.total_charges), 0),
      ),
    },
    taxAudit: values.reduce(
      (result, trade) => ({
        turnover: round(result.turnover + Math.abs(Number(trade.gross_pnl))),
        charges: round(result.charges + Number(trade.total_charges)),
      }),
      { turnover: 0, charges: 0 },
    ),
    equityCurve: values.map((trade) => ({
      time: trade.exit_time,
      equity: (equity = round(equity + Number(trade.net_pnl))),
    })),
    coachFlags: values.flatMap((trade) => JSON.parse(trade.ai_flags || "[]")),
  };
};
const getJournal = (userId, limit, offset) =>
  db.TradeJournal.findAndCountAll({
    where: { user_id: userId },
    order: [["exit_time", "DESC"]],
    limit,
    offset,
  });
const updateJournal = async (userId, id, values) => {
  const trade = await db.TradeJournal.findOne({
    where: { id, user_id: userId },
  });
  if (!trade) {
    const error = new Error("Trade journal entry was not found.");
    error.status = 404;
    throw error;
  }
  return trade.update({
    setup_tag: values.setupTag,
    emotion_tag: values.emotionTag,
    user_notes: values.userNotes,
  });
};
module.exports = { getAnalytics, getJournal, updateJournal };
