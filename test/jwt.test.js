process.env.JWT_SECRET = "test-niftytrader-compatible-secret-key-value";
process.env.JWT_ISSUER = "prod-niftytrader.in";
process.env.JWT_AUDIENCE = "prod-niftytrader.in";
process.env.JWT_USER_ID_CLAIM = "sub";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const jwt = require("jsonwebtoken");
const { verifyAccessToken, getUserId } = require("../services/jwtService");

const signToken = (overrides = {}, options = {}) =>
  jwt.sign({ sub: "user-123", ...overrides }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: options.issuer || process.env.JWT_ISSUER,
    audience: options.audience || process.env.JWT_AUDIENCE,
    expiresIn: options.expiresIn || "5m",
  });

test("accepts a .NET-compatible HS256 token", () => {
  const payload = verifyAccessToken(signToken());
  assert.equal(getUserId(payload), "user-123");
});

test("rejects a token from another issuer", () => {
  assert.throws(
    () => verifyAccessToken(signToken({}, { issuer: "untrusted.example" })),
    /issuer/i,
  );
});

test("rejects a token for another audience", () => {
  assert.throws(
    () => verifyAccessToken(signToken({}, { audience: "another-api" })),
    /audience/i,
  );
});

test("rejects an expired token with zero clock tolerance", () => {
  assert.throws(
    () => verifyAccessToken(signToken({}, { expiresIn: -1 })),
    /expired/i,
  );
});
