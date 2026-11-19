const env = require("../config/env");
const { failure, createError } = require("../helper/response");
module.exports = (req, res, next) =>
  req.header("x-internal-api-key") === env.INTERNAL_API_KEY
    ? next()
    : failure(
        res,
        createError(401, "UNAUTHORIZED", "Invalid internal API key."),
        401,
      );
