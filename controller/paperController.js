const Joi = require("joi");
const { success, failure, createError } = require("../helper/response");
const walletService = require("../services/walletService");
const orderService = require("../services/orderService");
const analyticsService = require("../services/analyticsService");
const price = Joi.number().positive().precision(2);
const orderSchema = Joi.object({
  symbolKey: Joi.string().max(100).required(),
  displaySymbol: Joi.string().max(100).required(),
  underlying: Joi.string()
    .valid("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX")
    .required(),
  expiryDate: Joi.date().iso().required(),
  strikePrice: Joi.number().positive().required(),
  optionType: Joi.string().valid("CE", "PE", "FUT").required(),
  side: Joi.string().valid("BUY", "SELL").required(),
  productType: Joi.string().valid("MIS", "NRML").required(),
  orderType: Joi.string().valid("MARKET", "LIMIT", "SL").required(),
  quantity: Joi.number().integer().positive().required(),
  lotSize: Joi.number().integer().positive().required(),
  limitPrice: price.allow(null),
  triggerPrice: price.allow(null),
  slPrice: price.allow(null),
  targetPrice: price.allow(null),
  plannedRR: Joi.number().min(0).max(100).default(0),
  marketPrice: price.required(),
  spotPrice: price.allow(null),
}).custom((value, helpers) => {
  if (value.quantity % value.lotSize)
    return helpers.error("any.custom", {
      message: `Quantity must be a multiple of lot size ${value.lotSize}.`,
    });
  if (value.orderType === "LIMIT" && !value.limitPrice)
    return helpers.error("any.custom", { message: "Limit price is required." });
  if (value.orderType === "SL" && !value.triggerPrice)
    return helpers.error("any.custom", {
      message: "Trigger price is required.",
    });
  return value;
});
const validate = (schema, input) => {
  const { error, value } = schema.validate(input, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error)
    throw createError(
      422,
      "VALIDATION_ERROR",
      error.details
        .map((item) => item.context?.message || item.message)
        .join(" "),
      error.details.map((item) => item.message),
    );
  return value;
};
const handler = (callback) => async (req, res) => {
  try {
    return await callback(req, res);
  } catch (error) {
    return failure(res, error, 500);
  }
};
exports.getPortfolio = handler(async (req, res) =>
  success(res, await walletService.getPortfolio(req.user.id)),
);
exports.getOrders = handler(async (req, res) =>
  success(res, await orderService.activeOrders(req.user.id)),
);
exports.placeOrder = handler(async (req, res) => {
  const result = await orderService.placeOrder(
    req.user.id,
    validate(orderSchema, req.body),
    req.header("idempotency-key"),
    req.app.locals.io,
  );
  return success(
    res,
    result,
    result.idempotentReplay ? "Order replayed" : "Order placed",
    result.idempotentReplay ? 200 : 201,
  );
});
exports.cancelOrder = handler(async (req, res) =>
  success(
    res,
    await orderService.cancelOrder(req.user.id, req.params.id),
    "Order cancelled",
  ),
);
exports.placeBasket = handler(async (req, res) => {
  const body = validate(
    Joi.object({
      legs: Joi.array().items(orderSchema).min(2).max(12).required(),
    }),
    req.body,
  );
  return success(
    res,
    await orderService.placeBasket(req.user.id, body.legs, req.app.locals.io),
    "Basket placed",
    201,
  );
});
exports.exitPosition = handler(async (req, res) =>
  success(
    res,
    await orderService.exitPosition(
      req.user.id,
      req.params.id,
      validate(
        Joi.object({
          quantity: Joi.number().integer().positive(),
          marketPrice: price.required(),
        }),
        req.body,
      ).quantity,
      req.body?.marketPrice,
      req.app.locals.io,
    ),
    "Position exit placed",
  ),
);
exports.exitAll = handler(async (req, res) =>
  success(
    res,
    await orderService.exitAll(
      req.user.id,
      validate(
        Joi.object({
          quotes: Joi.object().pattern(Joi.string(), price).required(),
        }),
        req.body,
      ).quotes,
      req.app.locals.io,
    ),
    "All positions exited",
  ),
);
exports.updateOco = handler(async (req, res) =>
  success(
    res,
    await orderService.updateOco(
      req.user.id,
      req.params.id,
      validate(
        Joi.object({
          slPrice: price.allow(null),
          targetPrice: price.allow(null),
        }).or("slPrice", "targetPrice"),
        req.body,
      ),
    ),
    "OCO updated",
  ),
);
exports.getAnalytics = handler(async (req, res) =>
  success(res, await analyticsService.getAnalytics(req.user.id)),
);
exports.getJournal = handler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  return success(
    res,
    await analyticsService.getJournal(req.user.id, limit, offset),
  );
});
exports.updateJournal = handler(async (req, res) =>
  success(
    res,
    await analyticsService.updateJournal(req.user.id, req.params.id, req.body),
    "Journal updated",
  ),
);
const quoteSchema = Joi.object({
  symbolKey: Joi.string().max(100).required(),
  ltp: price.required(),
  bid: price,
  ask: price,
  spot: price.required(),
  timestamp: Joi.date().iso(),
});
exports.evaluateQuote = handler(async (req, res) => {
  const quote = validate(quoteSchema, req.body);
  const fills = await orderService.processQuote(quote, req.app.locals.io, req.user.id);
  return success(res, { quote, fills }, "Quote evaluated");
});
exports.orderSchema = orderSchema;
