const { failure } = require("../helper/response");
module.exports = (error, _req, res, _next) => {
  if ((error.status || 500) >= 500) console.error(error);
  return failure(res, error, 500);
};
