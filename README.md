# Technologist Academy Node Service Template

A starter repository for building Node.js HTTP services in the Technologist Academy.

It gives you a working Express service with TypeScript and a production build already wired together, so you can start writing features. Out of the box it exposes a single `GET /health` endpoint that reports service status and uptime.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| [nvm](https://github.com/nvm-sh/nvm) | latest | Required. Manages your Node version per project. |
| Node.js | 22 | Pinned in [.nvmrc](.nvmrc). Install it with nvm, not with a system installer. |
| npm | 10+ | Ships with Node 22. |

Install nvm, then from the repository root run:

```sh
nvm install   # reads .nvmrc and installs Node 22
nvm use       # switches this shell to Node 22
```

Run `nvm use` every time you open a new terminal in this project, or configure your shell to do it automatically. Using a different Node version may cause confusing build failures.

Verify you are on the right version:

```sh
node -v   # should print v22.x.x
```

## Quick start

```sh
nvm use
npm ci             # install exact dependency versions from package-lock.json
cp .env.example .env
npm run dev        # start the service with hot reload
```

Then in another terminal:

```sh
curl http://localhost:3002/health
# {"status":"ok","uptime":1.234}
```

The frontend listens on the port configured by `PORT`. Backend requests use `API_BASE_URL`, falling back to `BACKEND_URL` and then `http://localhost:3000`. The frontend and backend must use different ports. The `.env.example` defaults to frontend port `3002` and backend port `3000`. Product, registration, and cart requests are forwarded to that backend.

### Login

If the backend runs on port 3000, use the following frontend configuration in `.env`:

```dotenv
PORT=3002
API_BASE_URL=http://localhost:3000
```

Check backend availability with `curl http://localhost:3000/health`. The backend needs its own `DATABASE_URL`, `PORT`, and `JWT_SECRET`; do not copy `JWT_SECRET` into the frontend.

The login form posts to the frontend's `POST /login`, which forwards JSON credentials to `POST /api/login` on the backend. Password whitespace is preserved. Validation errors and invalid credentials are displayed on the form; service failures show a generic error without exposing backend internals.

On success, the frontend regenerates the session ID and stores the access token, user details, role, and expiry server-side. Admins are redirected to `/admin`; ordinary users go to `/`. The header shows the signed-in name and a logout button. The browser receives only an HTTP-only, SameSite=Lax session-ID cookie, never the token. `POST /logout` destroys the session; expired sessions are cleared on the next request. There is no token refresh.

### Admin dashboard

`GET /admin` is a read-only overview of the existing public product catalogue, showing product/category totals and a product table. Empty catalogues show zero totals; backend failures show a retryable error rather than invented statistics. Product editing, order management, and user management are not implemented because no admin backend endpoints exist.

The frontend decodes the JWT received directly from a successful backend login to read `role` (`admin` or `user`) and `exp`. It checks the expected issuer (`the-achievers-backend`), audience (`the-achievers-api`), and string subject; malformed or expired tokens produce a login-service error. This is **not signature verification** and does not replace backend authorization. Tokens supplied in browser headers or URLs are not used to establish a session. The session expires at the earlier of JWT `exp` and login time plus `expiresIn`. Role changes take effect after logging in again or session expiry.

Only admin sessions see the dashboard navigation link. Anonymous or expired sessions are redirected to login; signed-in non-admin users receive HTTP 403 with a "Not allowed" page. Dashboard responses use `Cache-Control: no-store`.

All current backend calls run server-to-server, so browser CORS does not affect this dashboard. Future protected backend requests must send the stored token as a Bearer authorization header and handle backend 401 (clear the session and return to login) and 403 (show not allowed). Direct browser calls would additionally require the backend to allow `Authorization` in its CORS headers. Never expose or log the token.

Run `npm test -- tests/admin.test.ts tests/login.test.ts` to cover dashboard access, JWT claims, expiry, login redirects, catalogue totals, and backend failures without a running backend.

Sessions currently use Express's in-memory development store: restarting the frontend signs everyone out, and this store is not suitable for production or multiple instances. Before production deployment, configure a shared production session store in [src/auth.ts](src/auth.ts), set a strong `SESSION_SECRET`, and serve HTTPS (production cookies are Secure). If TLS terminates at a reverse proxy, configure Express `trust proxy` for that trusted proxy so secure cookies can be issued.

Signing in changes the frontend session only. Existing backend routes remain public until backend JWT verification is implemented. Future protected server-to-server requests must send `Authorization: Bearer <accessToken>`.
Registration sends `name`, `email`, `password`, `safeWordHint`, and `safeWord` as JSON to `POST /api/register`. The backend must validate the hint and securely hash and store the safe word. The current backend registration DTO and service only handle name, email, and password, so backend support is still required for the safe-word feature to work end to end.

Use `npm ci` rather than `npm install`. It installs the exact versions recorded in `package-lock.json`, so everyone on the team runs identical dependencies. Use `npm install` only when you are deliberately adding or upgrading a package.

## Making it your own

After clicking **Use this template** on GitHub and creating your own repository:

1. Clone your new repository and run the quick start steps above.
2. Update the identity fields in [package.json](package.json):
   - `name` — your service name in kebab-case, e.g. `booking-service`
   - `description` — one line describing what your service does
   - `author` and `license`
   - `version` — reset to `0.1.0` if you prefer to start fresh
3. Replace this README with documentation for your own service.
4. Update `PORT` in [.env.example](.env.example) if your service should default to a different port, and keep it in sync with your own `.env`.
5. Delete or replace the sample `/health` route once you have real endpoints — though keeping a health check is good practice for deployments.

Never commit your `.env` file. It is already listed in [.gitignore](.gitignore); `.env.example` is the committed template that documents which variables are needed.

## Scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `tsx watch src/index.ts` | Runs the service from TypeScript source and restarts on file changes. Use this while developing. |
| `npm run typecheck` | `tsc` | Checks types without emitting files. |
| `npm run build` | `tsc` then `esbuild` | Type-checks, then bundles the service into `dist/index.js` for production. |
| `npm start` | `node dist/index.js` | Runs the built output. Requires `npm run build` first. |
Before pushing, run `npm run typecheck` and `npm run build`.

### Registration tests

Run `npm test -- tests/app.test.ts` for isolated registration tests; no backend
is required. To also run the real-backend test, start a backend connected to a
development/test database and opt in explicitly:

```bash
AUTH_INTEGRATION_BACKEND_URL=http://localhost:3000 npm test -- tests/app.test.ts
```

The frontend itself does not need to be running. The integration test is skipped
when `AUTH_INTEGRATION_BACKEND_URL` is unset.
The integration test makes a real registration request and checks the backend's
`201` response and returned user details. Each run creates a user with a unique
`registration-test-<UUID>@example.com` email in the backend database. These users
are not automatically deleted; do not run against a production database.
Unavailable backends, rejected requests, and database failures fail the test.
Local input-validation tests still check that invalid forms do not call the backend.

### Login tests

Run `npm test -- tests/login.test.ts` for isolated login tests; no backend is
required. To also run the real-backend tests, start a backend connected to a
development/test database and opt in explicitly:

```bash
AUTH_INTEGRATION_BACKEND_URL=http://localhost:3000 npm test -- tests/login.test.ts
```

The real-backend tests are skipped when `AUTH_INTEGRATION_BACKEND_URL` is unset.
They create a unique `login-test-<UUID>@example.com` account,
then verify successful login, session persistence, logout, and rejection of
an incorrect password. The test account is not automatically deleted.
Do not run against a production database. The frontend does not need to be running.

The existing isolated tests remain alongside these integration tests to cover
malformed responses, network failures, session-store failures, and expiry safely.
Backend unavailability or failed account creation fails the real-backend tests.

## Project structure

```
.
├── src/
│   ├── index.ts          # entry point: config, server startup, shutdown
│   └── app.ts            # builds the Express app and registers routes
├── .env                  # your local secrets and config (not committed)
├── .env.example          # template listing required env variables
├── .github/              # GitHub configuration
├── .gitignore            # files git should ignore
├── .npmrc                # pins the public npm registry for this project
├── .nvmrc                # the Node version this project uses
├── package.json          # project metadata, scripts and dependencies
├── package-lock.json     # exact dependency versions, committed
└── tsconfig.json         # TypeScript compiler and type-checking options
```

Generated folders — `node_modules/` and `dist/` — are ignored by git and safe to delete and regenerate.

### Why `app.ts` and `index.ts` are separate

[src/app.ts](src/app.ts) creates and configures the Express app but never starts listening. [src/index.ts](src/index.ts) reads configuration and starts the server. Keeping those responsibilities separate makes route registration independent from server startup.

## Adding a new route

Say you want a `GET /bookings` endpoint.

**1. Create the router** in `src/controllers/bookings.ts`:

```ts
import { Router, type Request, type Response } from 'express'

export const bookingsRouter = Router()

bookingsRouter.get('/', (_req: Request, res: Response) => {
  res.json({ bookings: [] })
})
```

**2. Register it** in [src/app.ts](src/app.ts):

```ts
import { bookingsRouter } from './controllers/bookings'

// inside createApp(), before `return app`
app.use('/bookings', bookingsRouter)
```

Imports do not need a `.js` extension — this project is configured for bundler-style module resolution.

**3. Verify:**

```sh
npm run typecheck
npm run build
```

If your route reads a JSON request body, add `app.use(express.json({ limit: '100kb' }))` in `createApp()` before your routes.

## Configuration

Environment variables are loaded from `.env` by [dotenv](https://github.com/motdotla/dotenv) at startup.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | yes | Port the service listens on. The service exits at startup if it is missing or invalid. |
| `API_BASE_URL` | no | Backend base URL for login, registration, products, and cart. Takes precedence over `BACKEND_URL`. |
| `BACKEND_URL` | no | Backwards-compatible backend base URL. Defaults to `http://localhost:3000`; frontend `PORT` must be different. |
| `SESSION_SECRET` | in production | Random secret used to sign session-ID cookies, not the backend JWT secret. Development uses an ephemeral random secret if omitted. |

The server binds to `0.0.0.0` so it is reachable from outside a container. Add new variables to both your `.env` and [.env.example](.env.example).

## Shopping cart

Visit **`GET /cart`** to review the shopping cart. Home and Shop use real products from
`GET /api/products`; their Add to Cart forms send the selected product ID, not a
browser-supplied price. The home page features the first four catalogue products.

The cart shows GBP unit prices, quantities, line subtotals, an order subtotal,
shipping and a total. Shipping is calculated by the backend (£4.99 standard, free
when the subtotal is over £50) and returned as `estimatedShippingCost`; the
frontend only displays it. Change a quantity and select **Update**, or select **Remove**. Each successful
change redirects to a fresh backend-backed cart, updating all prices and the
header badge. The badge counts units, not distinct products, and remains current
when navigating back to Home or Shop. No browser JavaScript is required.
Checkout is not implemented.

### Backend contract

The cart endpoints are implemented in `the-achievers-backend`. Apply that
repository's Prisma migrations before starting the backend on port 3000.
If the backend is unavailable, the frontend displays a service error, not a
misleading empty cart or a local-only success.

All calls go from the frontend server to the configured backend base URL, using
JSON and an `X-Cart-Id` header containing a random UUID v4. The frontend creates a
`cue_cart` cookie (HttpOnly, SameSite=Lax, Secure in production)
to keep each browser's anonymous cart separate across navigation and restarts.
There is no signed-in customer integration in this repository yet. The cart ID
is a bearer capability: keep it private, use HTTPS in production, validate it
on the backend, and scope every read/write to it. Do not expose cart lookup by
customer ID. Clear/merge anonymous carts explicitly when authentication is added.

| Backend method and endpoint | Request body | Successful response |
| --- | --- | --- |
| `GET /api/cart` | None | `200`, JSON as below; a new/empty cart must return `{"items":[],"estimatedShippingCost":0}`, not `404` |
| `POST /api/cart/items` | `{"productId":"cue-1","quantity":1}` | `200`, updated cart; add units to an existing line, or create a new line |
| `PATCH /api/cart/items/:productId` | `{"quantity":3}` | `200`, updated cart; replace the existing quantity |
| `DELETE /api/cart/items/:productId` | None | `200`, updated cart; remove the line (safe to repeat) |

`:productId` is URL-encoded and is the same string ID returned by the catalogue.
Mutation response bodies are ignored; the redirected cart page reads the
authoritative state with `GET /api/cart`.

Example `GET /api/cart` response:

```json
{
  "items": [
    {
      "product": {
        "id": "cue-1",
        "name": "Pro Series Maple Cue",
        "price": 89.99
      },
      "quantity": 2
    }
  ],
  "estimatedShippingCost": 0
}
```

The sample ID `cue-1` is illustrative. The seeded Maple Cue has ID
`pro-series-maple-cue`; Home and Shop use the actual IDs from the catalogue.

Prices must be finite, non-negative JSON numbers in GBP, with at most two
decimal places. Quantities must be integers from `1` to `2147483647`, including
the accumulated quantity after adding units. Use Remove rather than setting
quantity to zero. Each product appears at most once.
`estimatedShippingCost` is required on every response: a non-negative number in
GBP with at most two decimal places, `0` when shipping is free. The backend owns
the shipping rule; the frontend rejects a missing or invalid value.
The frontend calculates subtotals in integer pennies, validates
the complete cart, and rejects malformed data rather than dropping products or
displaying incorrect totals.

The backend must persist carts in shared durable storage (not process memory),
validate product IDs and quantities, obtain prices from its own catalogue,
and update quantities atomically. Adding the same product must increment the
existing quantity atomically. Never trust client-supplied prices or ownership
claims.

Return `400` for invalid input, `404` for a missing product/line and `409` for a
product without a valid price. The frontend presents these as a rejected change
and reloads the cart. Other HTTP/network/timeout failures produce a `502` error page with a
retry link or a message to check the current cart before retrying a change.
Writes are not automatically retried (to avoid duplicate additions).
Backend calls have a five-second deadline; personalized pages use
`Cache-Control: no-store`. Header count failures show `?`, not zero.

Frontend form routes (these render/redirect HTML, not JSON):

| Frontend route | Fields |
| --- | --- |
| `POST /cart/items/add` | `productId`, `quantity` |
| `POST /cart/items/update` | `productId`, `quantity` |
| `POST /cart/items/remove` | `productId` |

The cart tests run against a real backend only; there are no mocks or test
doubles. To run them, use a disposable backend database, apply its migrations
and run `npx prisma db seed` in the backend repository. Start the backend using
that database, then run this command in the frontend repository:

```sh
CART_INTEGRATION_BACKEND_URL=http://localhost:3000 npm test -- tests/cart.integration.test.ts
```

The tests use the real HTTP clients and seeded products. They cover add, update
and remove, totals, shipping around the £50 threshold, quantity validation,
backend `404`/`409` rejections, browser cart isolation, and an unreachable
backend (a real refused connection). Each test uses its own cart and removes its
items afterwards. The tests are skipped when the URL is unset; never point them
at a production backend. No numeric platform latency/availability target was
supplied: load/SLA validation remains necessary before deployment, and the
five-second timeout is a client safeguard, not an SLA guarantee.

## Troubleshooting

**`Cannot find module` or unexpected type errors** — you may be on the wrong Node version. Run `nvm use`, then `rm -rf node_modules && npm ci`.

**`PORT environment variable is not set`** — you have not created your `.env`. Run `cp .env.example .env`.

**`EADDRINUSE`** — another process is already using that port. Stop it, or change `PORT` in `.env`.

**`npm start` fails with a missing file** — run `npm run build` first to generate `dist/`.
