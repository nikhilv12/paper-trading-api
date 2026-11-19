const { round } = require("../helper/response");
const calculateCharges = ({ side, quantity, price, optionType = "CE" }) => {
  const turnover = Math.abs(Number(quantity) * Number(price));
  const future = optionType === "FUT";
  const brokerage = Math.min(20, turnover * 0.0003);
  const stt = side === "SELL" ? turnover * (future ? 0.0002 : 0.001) : 0;
  const exchange = turnover * (future ? 0.0000173 : 0.0003503);
  const sebi = turnover * 0.000001;
  const stamp = side === "BUY" ? turnover * (future ? 0.00002 : 0.00003) : 0;
  const gst = (brokerage + exchange + sebi) * 0.18;
  return {
    brokerage: round(brokerage),
    stt: round(stt),
    exchange: round(exchange),
    sebi: round(sebi),
    stamp: round(stamp),
    gst: round(gst),
    total: round(brokerage + stt + exchange + sebi + stamp + gst),
  };
};
module.exports = { calculateCharges };
