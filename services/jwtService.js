const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { createError } = require("../helper/response");

const NAME_IDENTIFIER_CLAIM =
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier";

const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256", "HS384", "HS512"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    clockTolerance: 0,
  });

const getUserId = (payload) => {
  const userId =
    payload[env.JWT_USER_ID_CLAIM] ||
    payload.sub ||
    payload.nameid ||
    payload[NAME_IDENTIFIER_CLAIM] ||
    payload.user_id ||
    payload.userId;
  if (!userId)
    throw createError(401, "UNAUTHORIZED", "JWT user claim is missing.");
  return String(userId);
};

module.exports = { verifyAccessToken, getUserId };
