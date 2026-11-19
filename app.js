const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { rateLimit } = require("express-rate-limit");
const env = require("./config/env");
const paperRoutes = require("./routes/paper.routes");
const internalRoutes = require("./routes/internal.routes");
const errorMiddleware = require("./middleware/errorMiddleware");
const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true }));
  if (env.NODE_ENV !== "test") app.use(morgan("dev"));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.get("/health", (_req, res) =>
    res.json({
      result: 1,
      resultMessage: "Healthy",
      resultData: {
        status: "ok",
        database: process.env.DB_DIALECT || "sqlite",
        timestamp: new Date().toISOString(),
      },
    }),
  );
  app.use("/api/v1/paper", paperRoutes);
  app.use("/internal/v1", internalRoutes);
  app.use((req, res) =>
    res
      .status(404)
      .json({
        result: 0,
        resultMessage: "Route not found",
        errorCode: "ROUTE_NOT_FOUND",
      }),
  );
  app.use(errorMiddleware);
  return app;
};
module.exports = { createApp };
