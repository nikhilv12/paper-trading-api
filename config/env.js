const Joi = require("joi");
require("dotenv").config();
const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "test", "production")
    .default("development"),
  HOST: Joi.string().default("127.0.0.1"),
  PORT: Joi.number().port().default(4010),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ISSUER: Joi.string().required(),
  JWT_AUDIENCE: Joi.string().required(),
  JWT_USER_ID_CLAIM: Joi.string().default("sub"),
  INTERNAL_API_KEY: Joi.string()
    .min(16)
    .default("local-internal-key-change-me"),
  INITIAL_WALLET_BALANCE: Joi.number().positive().default(500000),
  CORS_ORIGINS: Joi.string().default("http://localhost:3005"),
}).unknown(true);
const { error, value } = schema.validate(process.env, { abortEarly: false });
if (error) throw new Error(`Invalid environment: ${error.message}`);
module.exports = {
  ...value,
  corsOrigins: value.CORS_ORIGINS.split(",").map((item) => item.trim()),
};
