# Paper Trading API and Frontend Integration

This document is the source of truth for the QuantFNO paper-trading frontend and the Express API in `D:\all projects\quant-fno-paper-api`.

## 1. Runtime architecture

- Frontend: Next.js at `http://localhost:3005`.
- Paper API: Express at `http://127.0.0.1:4010`.
- Database: SQLite file configured by `DATABASE_URL` (local default: `./data/paper-trading.sqlite`).
- Authentication: the existing NiftyTrader JWT in every environment.
- Market quotes: remain a separate data source. The frontend option-chain socket is not used as a database. The execution API reads its quote provider or receives trusted quote ticks through the internal endpoint.
- Browser state: only the unsubmitted strategy-basket draft remains in React memory. Wallets, orders, positions, OCO values, closed trades, journal tags, and analytics come from the API/SQLite.

Set this in the frontend `.env.local`:

```env
NEXT_PUBLIC_PAPER_API_URL=http://127.0.0.1:4010
```

Do not put `INTERNAL_API_KEY` or `JWT_SECRET` in any `NEXT_PUBLIC_*` variable.

## 2. Authentication

Every `/api/v1/paper/*` request sends:

```http
Authorization: Bearer <existing NiftyTrader access token>
```

The API verifies the HMAC signature, issuer, audience, expiration, and zero clock skew. The user ID is read from `JWT_USER_ID_CLAIM` (normally `sub`). Use:

```env
JWT_SECRET=<deployment secret; do not commit>
JWT_ISSUER=prod-niftytrader.in
JWT_AUDIENCE=prod-niftytrader.in
JWT_USER_ID_CLAIM=sub
```

Development uses the same bearer-token flow as production. Use a valid token issued with the configured development JWT secret, issuer, and audience. There is no header or request-body fallback for selecting a user.

## 3. Common response format

Successful response:

```json
{
  "result": 1,
  "resultMessage": "Success",
  "resultData": {}
}
```

Error response:

```json
{
  "result": 0,
  "resultMessage": "Quantity must be a multiple of lot size 65.",
  "errorCode": "VALIDATION_ERROR",
  "errors": []
}
```

Typical status codes are `200`, `201`, `401`, `404`, `409`, `422`, and `500`. The frontend service throws an `Error` with `status`, `code`, and `details` for unsuccessful responses.

## 4. Order object

The following request object is used by single orders and every basket leg:

```json
{
  "symbolKey": "NIFTY_2026-11-23_25250_CE",
  "displaySymbol": "NIFTY 23 Nov 25250 CE",
  "underlying": "NIFTY",
  "expiryDate": "2026-11-23",
  "strikePrice": 25250,
  "optionType": "CE",
  "side": "BUY",
  "productType": "MIS",
  "orderType": "MARKET",
  "quantity": 65,
  "lotSize": 65,
  "limitPrice": null,
  "triggerPrice": null,
  "slPrice": null,
  "targetPrice": null,
  "plannedRR": 0,
  "marketPrice": 55.55,
  "spotPrice": 25371.35
}
```

Rules:

- `underlying`: `NIFTY`, `BANKNIFTY`, `FINNIFTY`, `MIDCPNIFTY`, or `SENSEX`.
- `optionType`: `CE`, `PE`, or `FUT`.
- `side`: `BUY` or `SELL`.
- `productType`: `MIS` or `NRML`.
- `orderType`: `MARKET`, `LIMIT`, or `SL`.
- `quantity` and `lotSize` are positive integers and quantity must be a multiple of lot size.
- `LIMIT` requires positive `limitPrice`.
- `SL` requires positive `triggerPrice`.
- `marketPrice` is the current option LTP supplied by the frontend and is required for execution and margin calculations.
- `spotPrice` is the current underlying spot supplied by the frontend; it is optional.
- `symbolKey` must exactly match the key used by the quote provider/internal tick producer.

## 5. Public API reference

All routes below require authentication and use base path `/api/v1/paper`.

### GET `/portfolio`

Creates the user's wallet on first access, then returns the complete terminal snapshot.

```json
{
  "result": 1,
  "resultMessage": "Success",
  "resultData": {
    "wallet": {
      "user_id": "123",
      "initial_capital": "1000000.00",
      "available_cash": "987445.25",
      "blocked_margin": "12554.75",
      "realized_gross_pnl": "0.00",
      "total_charges_paid": "0.00",
      "realized_net_pnl": "0.00",
      "reset_count": 0
    },
    "positions": [],
    "orders": []
  }
}
```

`positions` contains open `paper_positions`; `orders` contains open `paper_orders`. SQLite decimal values may be serialized as strings, so the frontend normalizes them with `Number()`.

### GET `/orders`

Returns the authenticated user's open orders as an array in `resultData`.

### POST `/orders`

Headers:

```http
Idempotency-Key: <new UUID for this user action>
```

Body: one order object from section 4. Response is `201` for a new order and `200` for an idempotent replay. A market order fills immediately using the frontend-supplied `marketPrice`. The backend does not call a live-quote provider. Limit/SL orders remain `OPEN` until a matching trusted quote tick arrives.

### DELETE `/orders/:id`

Cancels an open order owned by the authenticated user and releases reserved margin.

### POST `/orders/basket`

```json
{
  "legs": [
    { "...": "complete order object" },
    { "...": "complete order object" }
  ]
}
```

Requires 2–12 legs. The API executes buy/hedge legs before sell legs and returns the created orders/fills.

### PATCH `/positions/:id/oco`

```json
{
  "slPrice": 120.5,
  "targetPrice": 210
}
```

At least one field is required. Send `null` to remove that trigger. The response is the updated position.

### POST `/positions/:id/exit`

Full exit:

```json
{}
```

Partial exit:

```json
{ "quantity": 65, "marketPrice": 120.5 }
```

`marketPrice` is required for full and partial exits. The quantity cannot exceed the absolute open quantity and must follow lot-size rules. The API creates the opposite market order and returns its execution result.

### POST `/positions/exit-all`

Send a `quotes` object keyed by `symbolKey`, for example `{ "quotes": { "NIFTY_2026-11-23_25250_CE": 120.5 } }`. It creates exit orders for all open positions owned by the current user using those frontend prices.

### GET `/analytics`

```json
{
  "result": 1,
  "resultMessage": "Success",
  "resultData": {
    "kpis": {
      "totalTrades": 5,
      "winRate": 60,
      "netPnl": 1520.4,
      "profitFactor": 1.8,
      "totalCharges": 246.2
    },
    "taxAudit": { "turnover": 7460, "charges": 246.2 },
    "equityCurve": [
      { "time": "2026-11-19T10:10:00.000Z", "equity": 640.2 }
    ],
    "coachFlags": []
  }
}
```

Analytics are enabled in the UI only after at least one closed journal entry exists.

### GET `/journal?limit=100&offset=0`

`limit` is clamped to 1–100. Response:

```json
{
  "result": 1,
  "resultMessage": "Success",
  "resultData": {
    "count": 1,
    "rows": [
      {
        "id": "uuid",
        "display_symbol": "NIFTY 23 Nov 25250 CE",
        "direction": "LONG",
        "product_type": "MIS",
        "quantity": 65,
        "entry_price": "150.10",
        "exit_price": "160.00",
        "gross_pnl": "643.50",
        "charges_breakdown": "{\"brokerage\":40,\"total\":62.1}",
        "total_charges": "62.10",
        "net_pnl": "581.40",
        "setup_tag": "Breakout",
        "emotion_tag": "Patient",
        "user_notes": null
      }
    ]
  }
}
```

### PATCH `/journal/:id/tags`

One or more editable values:

```json
{
  "setupTag": "Breakout",
  "emotionTag": "Patient",
  "userNotes": "Waited for confirmation."
}
```

Wallet reset is not exposed to users. Any future reset or balance adjustment must use a separately authenticated admin-only backend workflow.

## 6. Internal quote endpoint

This route is server-to-server only:

```http
POST /internal/v1/quotes
X-Internal-Api-Key: <INTERNAL_API_KEY>
Content-Type: application/json
```

```json
{
  "symbolKey": "NIFTY_2026-11-23_25250_CE",
  "ltp": 156.1,
  "bid": 156.05,
  "ask": 156.15,
  "spot": 25174.4,
  "timestamp": "2026-11-19T10:20:00.000Z"
}
```

It updates the in-memory quote cache and evaluates pending Limit/SL orders. Never call this endpoint from the browser because that would expose the internal key.

## 7. Socket events

Connect to the paper API using Socket.IO with path `/paper-events` and authentication `{ token }`. The server verifies the JWT and derives the socket room user ID from its claims.

- `orderFilled`: refresh portfolio, journal, and analytics.
- `portfolioChanged`: refresh portfolio, journal, and analytics.

The socket is only a refresh signal; the REST API remains the source of truth.

## 8. Database tables

| Table | Purpose | Important keys/indexes |
| --- | --- | --- |
| `paper_wallets` | One wallet per user; cash, blocked margin, realized P&L and charges | PK `user_id` |
| `paper_positions` | Open and closed net positions, average/last price, margin, OCO triggers | indexes `(user_id,status)`, `(symbol_key,status)` |
| `paper_orders` | Market/Limit/SL orders, basket link, fill state, reserved margin | unique `(user_id,idempotency_key)`; indexes for user/status and quote matching |
| `paper_trade_journal` | Immutable closed-trade calculations plus editable tags/notes | index `(user_id,exit_time)` |
| `paper_wallet_ledger` | Auditable wallet movements and balances | user/reference/event fields |

Every public read/write is scoped by the authenticated `user_id`; a client-supplied user ID is never accepted in a request body.

## 9. Frontend field mapping

The API intentionally uses database-style snake_case. `usePaperTradingEngine.js` maps it to existing UI names:

| API | Frontend |
| --- | --- |
| `display_symbol` | `contract` |
| `expiry_date` | `expiry` |
| `strike_price` | `strike` |
| `option_type: CE/PE` | `optionType: Call/Put` |
| `product_type` | `product` |
| `net_quantity` | `quantity` |
| `average_price` | `avgPrice` |
| `last_price` | `ltp` |
| `sl_trigger_price` | `slPrice` |
| `target_trigger_price` | `targetPrice` |
| `entry_price` / `exit_price` | `entryPrice` / `exitPrice` |
| `net_pnl` | `netPnl` |

Integration files:

- `src/_services/paperTradingService.js`: HTTP/auth/envelope handling.
- `src/components/PaperTrading/usePaperTradingEngine.js`: mapping, fetching, mutations, Socket.IO refresh, in-memory basket draft.
- `src/components/PaperTrading/PaperTradingWorkspace.jsx`: validation, login checks, UI notifications, and API action handlers.

## 10. Local startup and verification

Backend:

```powershell
Set-Location 'D:\all projects\quant-fno-paper-api'
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

Frontend:

```powershell
Set-Location 'D:\all projects\quant-fno-web'
npm run dev
```

Use a separate development JWT secret locally. For deployment, inject all secrets through the host's environment, run migrations once before starting the new version, and persist the SQLite database directory on a durable mounted disk. SQLite is suitable for one API instance; switch to PostgreSQL before horizontal/multi-instance deployment.

## 11. End-to-end checks

1. Log in and open `/paper-trading`; `GET /portfolio`, `/journal`, and `/analytics` should return `200`.
2. Submit a Market order; it should fill only when the backend can resolve the matching `symbolKey` quote.
3. Submit Limit/SL orders; send internal quote ticks and confirm the orders move from pending to positions.
4. Edit OCO fields and reload the browser; values must persist.
5. Exit a position and confirm journal, wallet realized P&L, charges, and analytics update.
6. Reload/logout/login and confirm no paper state depends on localStorage.
7. Verify one user's token cannot access another user's UUID resources.
