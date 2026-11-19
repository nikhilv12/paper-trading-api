const db = require("../models");
const env = require("../config/env");
const getOrCreateWallet = async (userId, transaction) => {
  const [wallet] = await db.PaperWallet.findOrCreate({
    where: { user_id: userId },
    defaults: {
      initial_capital: env.INITIAL_WALLET_BALANCE,
      available_cash: env.INITIAL_WALLET_BALANCE,
    },
    transaction,
  });
  return wallet;
};
const getPortfolio = async (userId) => {
  const wallet = await getOrCreateWallet(userId);
  const [positions, orders] = await Promise.all([
    db.PaperPosition.findAll({
      where: { user_id: userId, status: "OPEN" },
      order: [["opened_at", "DESC"]],
    }),
    db.PaperOrder.findAll({
      where: { user_id: userId, status: "OPEN" },
      order: [["placed_at", "DESC"]],
    }),
  ]);
  return { wallet, positions, orders };
};
const resetWallet = async (userId) =>
  db.sequelize.transaction(async (transaction) => {
    await Promise.all([
      db.PaperOrder.destroy({ where: { user_id: userId }, transaction }),
      db.TradeJournal.destroy({ where: { user_id: userId }, transaction }),
      db.PaperPosition.destroy({ where: { user_id: userId }, transaction }),
      db.WalletLedger.destroy({ where: { user_id: userId }, transaction }),
    ]);
    const wallet = await getOrCreateWallet(userId, transaction);
    await wallet.update(
      {
        available_cash: wallet.initial_capital,
        blocked_margin: 0,
        realized_gross_pnl: 0,
        total_charges_paid: 0,
        realized_net_pnl: 0,
        reset_count: Number(wallet.reset_count) + 1,
      },
      { transaction },
    );
    return wallet;
  });
module.exports = { getOrCreateWallet, getPortfolio, resetWallet };
