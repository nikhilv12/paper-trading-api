module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "PaperWallet",
    {
      user_id: { type: DataTypes.STRING(128), primaryKey: true },
      initial_capital: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
      available_cash: { type: DataTypes.DECIMAL(16, 2), allowNull: false },
      blocked_margin: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
      },
      realized_gross_pnl: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_charges_paid: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
      },
      realized_net_pnl: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false,
        defaultValue: 0,
      },
      reset_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "paper_wallets",
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );
