const db = require("../models");
const { round, createError } = require("../helper/response");
const { calculateCharges } = require("./chargeService");
const { calculateOrderMargin } = require("./marginService");

const number = (value) => Number(value) || 0;
const emit = (events, name, userId, data) =>
  events?.to?.(`user:${userId}`).emit(name, data);

const createPosition = (order, fillPrice, margin, charges, transaction) =>
  db.PaperPosition.create(
    {
      user_id: order.user_id,
      symbol_key: order.symbol_key,
      display_symbol: order.display_symbol,
      underlying: order.underlying,
      expiry_date: order.expiry_date,
      strike_price: order.strike_price,
      option_type: order.option_type,
      lot_size: order.lot_size,
      product_type: order.product_type,
      net_quantity: order.side === "BUY" ? order.quantity : -order.quantity,
      average_price: fillPrice,
      last_price: fillPrice,
      margin_blocked: margin,
      sl_trigger_price: order.sl_price,
      target_trigger_price: order.target_price,
      planned_rr: order.planned_rr,
      total_charges: charges.total,
      realized_net_pnl: -charges.total,
    },
    { transaction },
  );

const fillOrder = async (order, quote, events) => {
  const result = await db.sequelize.transaction(async (transaction) => {
    const lockedOrder = await db.PaperOrder.findByPk(order.id, { transaction });
    if (!lockedOrder || lockedOrder.status !== "OPEN") return null;
    const wallet = await db.PaperWallet.findByPk(order.user_id, {
      transaction,
    });
    const position = await db.PaperPosition.findOne({
      where: {
        user_id: order.user_id,
        symbol_key: order.symbol_key,
        product_type: order.product_type,
        status: "OPEN",
      },
      transaction,
    });
    const slippage = Math.floor(order.quantity / order.lot_size / 10) * 0.05;
    const fillPrice = round(
      order.side === "BUY"
        ? number(quote.ask || quote.ltp) + slippage
        : Math.max(0.05, number(quote.bid || quote.ltp) - slippage),
    );
    const charges = calculateCharges({
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      optionType: order.option_type,
    });
    const signedQuantity =
      order.side === "BUY" ? order.quantity : -order.quantity;
    let marginAdded = 0;
    let marginReleased = 0;
    let grossPnl = 0;
    let nextPosition;

    if (!position) {
      marginAdded = calculateOrderMargin(
        {
          ...order.get({ plain: true }),
          fillPrice,
          side: order.side,
          lotSize: order.lot_size,
          strikePrice: order.strike_price,
        },
        quote,
      );
      nextPosition = await createPosition(
        order,
        fillPrice,
        marginAdded,
        charges,
        transaction,
      );
    } else if (Math.sign(position.net_quantity) === Math.sign(signedQuantity)) {
      marginAdded = calculateOrderMargin(
        {
          ...order.get({ plain: true }),
          fillPrice,
          lotSize: order.lot_size,
          strikePrice: order.strike_price,
        },
        quote,
      );
      const nextQuantity = position.net_quantity + signedQuantity;
      const averagePrice = round(
        (Math.abs(position.net_quantity) * number(position.average_price) +
          order.quantity * fillPrice) /
          Math.abs(nextQuantity),
      );
      await position.update(
        {
          net_quantity: nextQuantity,
          average_price: averagePrice,
          last_price: fillPrice,
          margin_blocked: number(position.margin_blocked) + marginAdded,
          total_charges: number(position.total_charges) + charges.total,
        },
        { transaction },
      );
      nextPosition = position;
    } else {
      const closingQuantity = Math.min(
        Math.abs(position.net_quantity),
        order.quantity,
      );
      grossPnl = round(
        (fillPrice - number(position.average_price)) *
          closingQuantity *
          Math.sign(position.net_quantity),
      );
      marginReleased = round(
        (number(position.margin_blocked) * closingQuantity) /
          Math.abs(position.net_quantity),
      );
      const nextQuantity = position.net_quantity + signedQuantity;
      const closed = nextQuantity === 0;
      const netPnl = round(
        grossPnl - charges.total - number(position.total_charges),
      );
      await db.TradeJournal.create(
        {
          user_id: order.user_id,
          position_id: position.id,
          symbol_key: position.symbol_key,
          display_symbol: position.display_symbol,
          underlying: position.underlying,
          option_type: position.option_type,
          direction: position.net_quantity > 0 ? "LONG" : "SHORT",
          product_type: position.product_type,
          entry_time: position.opened_at,
          exit_time: new Date(),
          holding_seconds: Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(position.opened_at).getTime()) / 1000,
            ),
          ),
          quantity: closingQuantity,
          entry_price: position.average_price,
          exit_price: fillPrice,
          initial_sl: position.sl_trigger_price,
          initial_target: position.target_trigger_price,
          planned_rr: position.planned_rr,
          realized_r: 0,
          gross_pnl: grossPnl,
          charges_breakdown: JSON.stringify(charges),
          total_charges: charges.total + number(position.total_charges),
          net_pnl: netPnl,
          ai_flags: JSON.stringify(
            position.sl_trigger_price ? ["CLEAN_EXECUTION"] : ["NO_SL_RISK"],
          ),
        },
        { transaction },
      );
      await position.update(
        {
          net_quantity: nextQuantity,
          status: closed ? "CLOSED" : "OPEN",
          closed_at: closed ? new Date() : null,
          last_price: fillPrice,
          margin_blocked: closed
            ? 0
            : number(position.margin_blocked) - marginReleased,
          realized_gross_pnl: number(position.realized_gross_pnl) + grossPnl,
          realized_net_pnl: number(position.realized_net_pnl) + netPnl,
        },
        { transaction },
      );
      nextPosition = position;
    }
    const marginDelta = marginAdded - number(order.margin_reserved);
    const availableCash = round(
      number(wallet.available_cash) +
        marginReleased +
        grossPnl -
        charges.total -
        marginDelta,
    );
    if (availableCash < 0)
      throw createError(
        422,
        "INSUFFICIENT_MARGIN",
        "Insufficient virtual margin for this fill.",
      );
    await wallet.update(
      {
        available_cash: availableCash,
        blocked_margin: round(
          Math.max(
            0,
            number(wallet.blocked_margin) - marginReleased + marginDelta,
          ),
        ),
        realized_gross_pnl: number(wallet.realized_gross_pnl) + grossPnl,
        total_charges_paid: number(wallet.total_charges_paid) + charges.total,
        realized_net_pnl:
          number(wallet.realized_net_pnl) + grossPnl - charges.total,
      },
      { transaction },
    );
    await lockedOrder.update(
      {
        status: "COMPLETE",
        fill_price: fillPrice,
        slippage_applied: slippage,
        margin_reserved: 0,
        executed_at: new Date(),
      },
      { transaction },
    );
    await db.WalletLedger.create(
      {
        user_id: order.user_id,
        reference_id: order.id,
        event_type: "ORDER_FILL",
        amount: grossPnl - charges.total,
        balance_after: availableCash,
        metadata: JSON.stringify({ fillPrice, marginAdded, marginReleased }),
      },
      { transaction },
    );
    return { order: lockedOrder, position: nextPosition, wallet };
  });
  if (result) {
    emit(events, "orderFilled", order.user_id, result);
    emit(events, "portfolioChanged", order.user_id, result);
  }
  return result;
};
module.exports = { fillOrder };
