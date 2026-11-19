const cron = require("node-cron");
const db = require("../models");
const orderService = require("./orderService");
let tasks = [];
const closeMisPositions = async (io) => {
  const positions = await db.PaperPosition.findAll({
    where: { status: "OPEN", product_type: "MIS" },
  });
  for (const position of positions)
    await orderService.exitPosition(position.user_id, position.id, null, io);
};
const settleExpiredPositions = async (io) => {
  const today = new Date().toISOString().slice(0, 10);
  const positions = await db.PaperPosition.findAll({
    where: { status: "OPEN", expiry_date: today },
  });
  for (const position of positions)
    await orderService.exitPosition(position.user_id, position.id, null, io);
};
const startSettlementJobs = (io) => {
  tasks = [
    cron.schedule("20 15 * * 1-5", () => closeMisPositions(io), {
      timezone: "Asia/Kolkata",
    }),
    cron.schedule("35 15 * * 1-5", () => settleExpiredPositions(io), {
      timezone: "Asia/Kolkata",
    }),
  ];
};
const stopSettlementJobs = () => {
  tasks.forEach((task) => task.stop());
  tasks = [];
};
module.exports = {
  startSettlementJobs,
  stopSettlementJobs,
  closeMisPositions,
  settleExpiredPositions,
};
