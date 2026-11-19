const { round } = require("../helper/response");
const risk = {
  NIFTY: 115000,
  BANKNIFTY: 135000,
  FINNIFTY: 105000,
  MIDCPNIFTY: 90000,
  SENSEX: 130000,
};
const calculateOrderMargin = (order, quote, quantity = order.quantity) => {
  const price = Number(
    order.fillPrice || order.limitPrice || order.triggerPrice || quote.ltp,
  );
  if (order.side === "BUY") return round(quantity * price);
  const lots = quantity / order.lotSize;
  const spot = Number(quote.spot) || Number(order.strikePrice);
  const distance = Math.abs(spot - Number(order.strikePrice));
  const discount = Math.min(0.25, (distance / spot) * 4);
  return round(
    lots *
      ((risk[order.underlying] || risk.NIFTY) * (1 - discount) +
        order.lotSize * price * 0.35),
  );
};
const calculateBasketMargin = (legs, quoteMap) => {
  const standaloneMargin = round(
    legs.reduce(
      (sum, leg) =>
        sum + calculateOrderMargin(leg, quoteMap.get(leg.symbolKey)),
      0,
    ),
  );
  const hedged =
    legs.some((leg) => leg.side === "BUY") &&
    legs.some((leg) => leg.side === "SELL");
  const hedgeBenefit = hedged ? round(standaloneMargin * 0.58) : 0;
  return {
    standaloneMargin,
    hedgeBenefit,
    finalMargin: round(standaloneMargin - hedgeBenefit),
  };
};
module.exports = { calculateOrderMargin, calculateBasketMargin };
