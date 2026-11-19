const { failure, createError } = require("../helper/response");
const { verifyAccessToken, getUserId } = require("../services/jwtService");
module.exports = (req, res, next) => {
  try {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token)
      throw createError(401, "UNAUTHORIZED", "Bearer token is required.");
    const payload = verifyAccessToken(token);
    req.user = { id: getUserId(payload), payload };
    return next();
  } catch (error) {
    return failure(res, error, 401);
  }
};
