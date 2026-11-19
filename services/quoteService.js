const { createError } = require("../helper/response");
const quotes = new Map();

const setQuote = (quote) => {
  quotes.set(quote.symbolKey, {
    ...quote,
    timestamp: quote.timestamp || new Date().toISOString(),
  });
  return quotes.get(quote.symbolKey);
};
const getQuote = async (symbolKey) => {
  if (quotes.has(symbolKey)) return quotes.get(symbolKey);
  throw createError(
    503,
    "QUOTE_UNAVAILABLE",
    `No client quote is cached for ${symbolKey}.`,
  );
};
module.exports = { setQuote, getQuote };
