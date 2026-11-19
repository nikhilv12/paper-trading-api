const Joi = require("joi");
const { success, failure, createError } = require("../helper/response");
const orderService = require("../services/orderService");
const schema = Joi.object({
  symbolKey: Joi.string().required(),
  ltp: Joi.number().positive().required(),
  bid: Joi.number().positive(),
  ask: Joi.number().positive(),
  spot: Joi.number().positive().required(),
  timestamp: Joi.date().iso(),
});
exports.processQuote = async (req, res) => {
  try {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) throw createError(422, "VALIDATION_ERROR", error.message);
    const fills = await orderService.processQuote(value, req.app.locals.io);
    return success(res, { quote: value, fills });
  } catch (error) {
    return failure(res, error, 500);
  }
};
