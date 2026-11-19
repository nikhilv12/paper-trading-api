const path = require("path");
require("dotenv").config();
const storage = path.resolve(
  process.cwd(),
  process.env.DATABASE_URL || "./data/paper-trading.sqlite",
);
const common = { logging: false };
module.exports = {
  development:
    process.env.DB_DIALECT === "postgres"
      ? {
          ...common,
          dialect: "postgres",
          url: process.env.DATABASE_URL,
          timezone: "+05:30",
        }
      : { ...common, dialect: "sqlite", storage },
  test: { ...common, dialect: "sqlite", storage: ":memory:" },
  production:
    process.env.DB_DIALECT === "sqlite"
      ? { ...common, dialect: "sqlite", storage }
      : {
          ...common,
          dialect: "postgres",
          url: process.env.DATABASE_URL,
          timezone: "+05:30",
        },
};
