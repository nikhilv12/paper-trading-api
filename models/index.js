const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");
const config = require("../config/config")[process.env.NODE_ENV || "development"];

if (config.dialect === "sqlite") fs.mkdirSync(path.dirname(config.storage), { recursive: true });
const sequelize = config.url ? new Sequelize(config.url, config) : new Sequelize(config);
const db = { sequelize, Sequelize };

for (const file of ["paperWallet", "paperPosition", "paperOrder", "tradeJournal", "walletLedger"]) {
  const model = require(`./${file}`)(sequelize, DataTypes);
  db[model.name] = model;
}

db.PaperWallet.hasMany(db.PaperPosition, { foreignKey: "user_id", onDelete: "CASCADE" });
db.PaperWallet.hasMany(db.PaperOrder, { foreignKey: "user_id", onDelete: "CASCADE" });
db.PaperWallet.hasMany(db.TradeJournal, { foreignKey: "user_id", onDelete: "CASCADE" });
db.PaperWallet.hasMany(db.WalletLedger, { foreignKey: "user_id", onDelete: "CASCADE" });
db.PaperPosition.hasMany(db.PaperOrder, { foreignKey: "linked_position_id" });
module.exports = db;
