module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "WalletLedger",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: { type: DataTypes.STRING(128), allowNull: false },
      reference_id: DataTypes.UUID,
      event_type: { type: DataTypes.STRING(32), allowNull: false },
      amount: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
      balance_after: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
      metadata: { type: DataTypes.TEXT, defaultValue: "{}" },
    },
    {
      tableName: "paper_wallet_ledger",
      underscored: true,
      updatedAt: false,
      createdAt: "created_at",
    },
  );
