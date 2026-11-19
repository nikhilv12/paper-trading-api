const http = require("http"); const { Server } = require("socket.io"); const { createApp } = require("./app"); const db = require("./models"); const env = require("./config/env"); const { startSettlementJobs, stopSettlementJobs } = require("./services/settlementService"); const { verifyAccessToken, getUserId } = require("./services/jwtService");
const app = createApp(); const server = http.createServer(app); const io = new Server(server, { path: "/paper-events", cors: { origin: env.corsOrigins, credentials: true } }); app.locals.io = io;
io.use((socket, next) => { try { const payload = verifyAccessToken(socket.handshake.auth.token); socket.userId = getUserId(payload); return next(); } catch (error) { return next(error); } });
io.on("connection", (socket) => socket.join(`user:${socket.userId}`));
const startServer = async () => { await db.sequelize.authenticate(); await db.sequelize.sync(); startSettlementJobs(io); return new Promise((resolve) => server.listen(env.PORT, env.HOST, () => { console.log(`Paper trading API running at http://${env.HOST}:${env.PORT}`); resolve(server); })); };
const stopServer = async () => { stopSettlementJobs(); io.close(); if (server.listening) await new Promise((resolve) => server.close(resolve)); await db.sequelize.close(); };
if (require.main === module) startServer().catch((error) => { console.error("Unable to start paper trading API:", error); process.exit(1); });
module.exports = { app, server, io, startServer, stopServer };
