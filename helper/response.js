const success = (res, resultData, resultMessage = "Success", status = 200) =>
  res.status(status).json({ result: 1, resultMessage, resultData });
const failure = (res, error, status = 400) =>
  res
    .status(error.status || status)
    .json({
      result: 0,
      resultMessage: error.message || "Request failed",
      errorCode: error.code || "REQUEST_ERROR",
      errors: error.details || [],
    });
const createError = (status, code, message, details) =>
  Object.assign(new Error(message), { status, code, details });
const round = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;
module.exports = { success, failure, createError, round };
