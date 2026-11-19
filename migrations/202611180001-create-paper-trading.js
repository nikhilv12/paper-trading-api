"use strict";
module.exports = {
  async up(_queryInterface) {
    const db = require("../models");
    await db.sequelize.sync();
  },
  async down(queryInterface) {
    for (const table of [
      "paper_wallet_ledger",
      "paper_trade_journal",
      "paper_orders",
      "paper_positions",
      "paper_wallets",
    ])
      await queryInterface.dropTable(table);
  },
};
