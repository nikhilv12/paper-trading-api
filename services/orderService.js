const { Op } = require("sequelize");
const { v4: uuid } = require("uuid");
const db = require("../models");
const { createError } = require("../helper/response");
const { getOrCreateWallet } = require("./walletService");
const quoteService = require("./quoteService");
const {
  calculateOrderMargin,
  calculateBasketMargin,
} = require("./marginService");
const { fillOrder } = require("./executionService");
const number = (value) => Number(value) || 0;
const normalizeOrder = (userId, input, idempotencyKey) => ({
  user_id: userId,
  idempotency_key: idempotencyKey || null,
  symbol_key: input.symbolKey,
  display_symbol: input.displaySymbol,
  underlying: input.underlying,
  expiry_date: input.expiryDate,
  strike_price: input.strikePrice,
  option_type: input.optionType,
  lot_size: input.lotSize,
  side: input.side,
  product_type: input.productType,
  order_type: input.orderType,
  status: "OPEN",
  quantity: input.quantity,
  limit_price: input.limitPrice,
  trigger_price: input.triggerPrice,
  sl_price: input.slPrice,
  target_price: input.targetPrice,
  planned_rr: input.plannedRR || 0,
});
const shouldFill = (order, quote) =>
  order.order_type === "MARKET" ||
  (order.order_type === "LIMIT" &&
    (order.side === "BUY"
      ? quote.ask <= number(order.limit_price)
      : quote.bid >= number(order.limit_price))) ||
  (order.order_type === "SL" &&
    (order.side === "BUY"
      ? quote.ltp >= number(order.trigger_price)
      : quote.ltp <= number(order.trigger_price)));
const clientQuote = (input) => ({
  symbolKey: input.symbolKey,
  ltp: number(input.marketPrice),
  bid: number(input.marketPrice),
  ask: number(input.marketPrice),
  spot: number(input.spotPrice) || number(input.strikePrice),
  timestamp: new Date().toISOString(),
});

const placeOrder = async (userId, input, idempotencyKey, events) => {
  if (idempotencyKey) {
    const existing = await db.PaperOrder.findOne({
      where: { user_id: userId, idempotency_key: idempotencyKey },
    });
    if (existing) return { order: existing, idempotentReplay: true };
  }
  const quote = clientQuote(input);
  const margin = calculateOrderMargin(input, quote);
  const wallet = await getOrCreateWallet(userId);
  if (number(wallet.available_cash) < margin)
    throw createError(
      422,
      "INSUFFICIENT_MARGIN",
      "Insufficient virtual margin.",
    );
  const order = await db.sequelize.transaction(async (transaction) => {
    await wallet.update(
      {
        available_cash: number(wallet.available_cash) - margin,
        blocked_margin: number(wallet.blocked_margin) + margin,
      },
      { transaction },
    );
    return db.PaperOrder.create(
      {
        ...normalizeOrder(userId, input, idempotencyKey),
        margin_reserved: margin,
      },
      { transaction },
    );
  });
  const fill = shouldFill(order, quote)
    ? await fillOrder(order, quote, events)
    : null;
  return { order: fill?.order || order, fill, idempotentReplay: false };
};
const processQuote = async (quote, events) => {
  quoteService.setQuote(quote);
  const [orders, positions] = await Promise.all([
    db.PaperOrder.findAll({
      where: { symbol_key: quote.symbolKey, status: "OPEN" },
    }),
    db.PaperPosition.findAll({
      where: { symbol_key: quote.symbolKey, status: "OPEN" },
    }),
  ]);
  const fills = [];
  for (const order of orders)
    if (shouldFill(order, quote))
      fills.push(await fillOrder(order, quote, events));
  for (const position of positions) {
    const ltp = number(quote.ltp);
    const isLong = number(position.net_quantity) > 0;
    const stop = number(position.sl_trigger_price);
    const target = number(position.target_trigger_price);
    const stopHit = stop > 0 && (isLong ? ltp <= stop : ltp >= stop);
    const targetHit = target > 0 && (isLong ? ltp >= target : ltp <= target);
    if (!stopHit && !targetHit) continue;

    await position.update({
      sl_trigger_price: null,
      target_trigger_price: null,
    });
    fills.push(
      await exitPosition(
        position.user_id,
        position.id,
        Math.abs(number(position.net_quantity)),
        quote.ltp,
        events,
      ),
    );
  }
  return fills.filter(Boolean);
};
const cancelOrder = async (userId, id) =>
  db.sequelize.transaction(async (transaction) => {
    const order = await db.PaperOrder.findOne({
      where: { id, user_id: userId, status: "OPEN" },
      transaction,
    });
    if (!order)
      throw createError(404, "NOT_FOUND", "Open order was not found.");
    const wallet = await db.PaperWallet.findByPk(userId, { transaction });
    await wallet.update(
      {
        available_cash:
          number(wallet.available_cash) + number(order.margin_reserved),
        blocked_margin: Math.max(
          0,
          number(wallet.blocked_margin) - number(order.margin_reserved),
        ),
      },
      { transaction },
    );
    await order.update(
      { status: "CANCELLED", margin_reserved: 0 },
      { transaction },
    );
    return order;
  });
const exitPosition = async (userId, id, quantity, marketPrice, events) => {
  const position = await db.PaperPosition.findOne({
    where: { id, user_id: userId, status: "OPEN" },
  });
  if (!position)
    throw createError(404, "NOT_FOUND", "Open position was not found.");
  const exitQuantity = quantity || Math.abs(position.net_quantity);
  if (
    exitQuantity > Math.abs(position.net_quantity) ||
    exitQuantity % position.lot_size
  )
    throw createError(
      422,
      "VALIDATION_ERROR",
      "Exit quantity must use valid lots and not exceed the position.",
    );
  return placeOrder(
    userId,
    {
      symbolKey: position.symbol_key,
      displaySymbol: position.display_symbol,
      underlying: position.underlying,
      expiryDate: position.expiry_date,
      strikePrice: position.strike_price,
      optionType: position.option_type,
      lotSize: position.lot_size,
      quantity: exitQuantity,
      side: position.net_quantity > 0 ? "SELL" : "BUY",
      productType: position.product_type,
      orderType: "MARKET",
      marketPrice,
      spotPrice: position.strike_price,
    },
    null,
    events,
  );
};
const placeBasket = async (userId, legs, events) => {
  const quotes = new Map();
  for (const leg of legs)
    quotes.set(leg.symbolKey, clientQuote(leg));
  const margin = calculateBasketMargin(legs, quotes);
  const basketId = uuid();
  const ordered = [...legs].sort(
    (a, b) => (a.side === "BUY" ? -1 : 1) - (b.side === "BUY" ? -1 : 1),
  );
  const results = [];
  for (const leg of ordered)
    results.push(
      await placeOrder(
        userId,
        leg,
        `${basketId}:${leg.symbolKey}:${leg.side}`,
        events,
      ),
    );
  return { basketId, margin, results };
};
const updateOco = async (userId, id, values) => {
  const position = await db.PaperPosition.findOne({
    where: { id, user_id: userId, status: "OPEN" },
  });
  if (!position)
    throw createError(404, "NOT_FOUND", "Open position was not found.");
  const changes = {};
  if (Object.hasOwn(values, "slPrice")) changes.sl_trigger_price = values.slPrice;
  if (Object.hasOwn(values, "targetPrice"))
    changes.target_trigger_price = values.targetPrice;
  await position.update(changes);
  return position;
};
const exitAll = async (userId, quotes, events) => {
  const positions = await db.PaperPosition.findAll({
    where: { user_id: userId, status: "OPEN" },
  });
  const results = [];
  for (const position of positions)
    results.push(
      await exitPosition(
        userId,
        position.id,
        null,
        quotes[position.symbol_key],
        events,
      ),
    );
  return results;
};
const activeOrders = (userId) =>
  db.PaperOrder.findAll({
    where: { user_id: userId, status: { [Op.in]: ["OPEN", "TRIGGERED"] } },
    order: [["placed_at", "DESC"]],
  });
module.exports = {
  placeOrder,
  processQuote,
  cancelOrder,
  exitPosition,
  placeBasket,
  updateOco,
  exitAll,
  activeOrders,
};
