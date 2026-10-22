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
curl http://localhost:8000/health
# {"status":"ok","uptime":1.234}
```

The example configuration runs the frontend at `http://localhost:8000`. Registration and product requests use the backend at `http://localhost:3000` by default; set `BACKEND_URL` in `.env` to the backend's base URL if it uses a different address.

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
| `BACKEND_URL` | no | Backend base URL for product, registration and cart requests. Defaults to `http://localhost:3000`; the frontend listens on the separate `PORT` (8000 in `.env.example`). |

The server binds to `0.0.0.0` so it is reachable from outside a container. Add new variables to both your `.env` and [.env.example](.env.example).

## Shopping cart

Visit **`GET /cart`** to review the shopping cart. Home and Shop use real products from
`GET /api/products`; their Add to Cart forms send the selected product ID, not a
browser-supplied price. The home page features the first four catalogue products.

The cart shows GBP unit prices, quantities, line subtotals and an order subtotal.
Change a quantity and select **Update**, or select **Remove**. Each successful
change redirects to a fresh backend-backed cart, updating all prices and the
header badge. The badge counts units, not distinct products, and remains current
when navigating back to Home or Shop. No browser JavaScript is required.
Checkout is not implemented; delivery/additional charges are not included.

### Backend contract

The cart endpoints are implemented in `the-achievers-backend`. Apply that
repository's Prisma migrations before starting the backend on port 3000.
If the backend is unavailable, the frontend displays a service error, not a
misleading empty cart or a local-only success.

All calls go from the frontend server to `BACKEND_URL`, using JSON and an
`X-Cart-Id` header containing a random UUID v4. The frontend creates a
`cue_cart` cookie (HttpOnly, SameSite=Lax, Secure in production)
to keep each browser's anonymous cart separate across navigation and restarts.
There is no signed-in customer integration in this repository yet. The cart ID
is a bearer capability: keep it private, use HTTPS in production, validate it
on the backend, and scope every read/write to it. Do not expose cart lookup by
customer ID. Clear/merge anonymous carts explicitly when authentication is added.

| Backend method and endpoint | Request body | Successful response |
| --- | --- | --- |
| `GET /api/cart` | None | `200`, JSON as below; a new/empty cart must return `{"items":[]}`, not `404` |
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
  ]
}
```

The sample ID `cue-1` is illustrative. The seeded Maple Cue has ID
`pro-series-maple-cue`; Home and Shop use the actual IDs from the catalogue.

Prices must be finite, non-negative JSON numbers in GBP, with at most two
decimal places. Quantities must be integers from `1` to `2147483647`, including
the accumulated quantity after adding units. Use Remove rather than setting
quantity to zero. Each product appears at most once.
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

Run `npm test -- tests/cart.test.ts tests/shop.test.ts tests/app.test.ts` for cart
journeys, calculations, validation, isolation, failure handling, catalogue
integration and backend request contract tests. These use test doubles; they do
not certify a real backend deployment. No numeric platform latency/availability
target was supplied: load/SLA validation remains necessary before deployment,
and the five-second timeout is a client safeguard, not an SLA guarantee.

To verify a real backend, use a disposable backend database, apply its migrations
and run `npx prisma db seed` in the backend repository. Start the backend using
that database, then run this command in the frontend repository:

```sh
CART_INTEGRATION_BACKEND_URL=http://localhost:3000 npm test -- tests/cart.integration.test.ts
```

This test uses the real HTTP clients and seeded products, checks the rendered
cart totals and quantities, exercises updates/removals, verifies browser cart
isolation, and removes its own cart items afterwards. It is skipped when the URL
is unset; never point it at a production backend.

## Troubleshooting

**`Cannot find module` or unexpected type errors** — you may be on the wrong Node version. Run `nvm use`, then `rm -rf node_modules && npm ci`.

**`PORT environment variable is not set`** — you have not created your `.env`. Run `cp .env.example .env`.

**`EADDRINUSE`** — another process is already using that port. Stop it, or change `PORT` in `.env`.

**`npm start` fails with a missing file** — run `npm run build` first to generate `dist/`.
