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
curl http://localhost:3000/health
# {"status":"ok","uptime":1.234}
```

The frontend listens on the port configured by `PORT`. Backend requests use `API_BASE_URL`, falling back to `BACKEND_URL` and then `http://localhost:3000`. The frontend and backend must use different ports. The `.env.example` defaults to frontend port `3002` and backend port `3000`.

### Login

If the backend runs on port 3000, use the following frontend configuration in `.env`:

```dotenv
PORT=3002
API_BASE_URL=http://localhost:3000
```

Check backend availability with `curl http://localhost:3000/health`. The backend needs its own `DATABASE_URL`, `PORT`, and `JWT_SECRET`; do not copy `JWT_SECRET` into the frontend.

The login form posts to the frontend's `POST /login`, which forwards JSON credentials to `POST /API/login` on the backend. Password whitespace is preserved. Validation errors and invalid credentials are displayed on the form; service failures show a generic error without exposing backend internals.

On success, the frontend regenerates the session ID, stores the access token, user details, and expiry server-side, and redirects to `/`. The header shows the signed-in name and a logout button. The browser receives only an HTTP-only, SameSite=Lax session-ID cookie, never the token. `POST /logout` destroys the session; expired sessions are cleared on the next request. There is no token refresh.

Sessions currently use Express's in-memory development store: restarting the frontend signs everyone out, and this store is not suitable for production or multiple instances. Before production deployment, configure a shared production session store in [src/auth.ts](src/auth.ts), set a strong `SESSION_SECRET`, and serve HTTPS (production cookies are Secure). If TLS terminates at a reverse proxy, configure Express `trust proxy` for that trusted proxy so secure cookies can be issued.

Signing in changes the frontend session only. Existing backend routes remain public until backend JWT verification is implemented. Future protected server-to-server requests must send `Authorization: Bearer <accessToken>`.

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

Run `npm test -- tests/app.test.ts` with the real backend running at
`http://localhost:3000` and connected to a development/test database. The
registration tests explicitly use this URL instead of any configured backend URL.
The frontend itself does not need to be running.

The success test makes a real registration request and checks the backend's
`201` response and returned user details. Each run creates a user with a unique
`registration-test-<UUID>@example.com` email in the backend database. These users
are not automatically deleted; do not run against a production database.
Unavailable backends, rejected requests, and database failures fail the test.
Local input-validation tests still check that invalid forms do not call the backend.

### Login tests

Run `npm test -- tests/login.test.ts` with the real backend running at
`http://localhost:3000` and connected to a development/test database. The
real-backend tests create a unique `login-test-<UUID>@example.com` account,
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
| `API_BASE_URL` | no | Backend base URL for login, registration, and products. Takes precedence over `BACKEND_URL`. |
| `BACKEND_URL` | no | Backwards-compatible backend base URL. Defaults to `http://localhost:3000`; frontend `PORT` must be different. |
| `SESSION_SECRET` | in production | Random secret used to sign session-ID cookies, not the backend JWT secret. Development uses an ephemeral random secret if omitted. |

The server binds to `0.0.0.0` so it is reachable from outside a container. Add new variables to both your `.env` and [.env.example](.env.example).

## Troubleshooting

**`Cannot find module` or unexpected type errors** — you may be on the wrong Node version. Run `nvm use`, then `rm -rf node_modules && npm ci`.

**`PORT environment variable is not set`** — you have not created your `.env`. Run `cp .env.example .env`.

**`EADDRINUSE`** — another process is already using that port. Stop it, or change `PORT` in `.env`.

**`npm start` fails with a missing file** — run `npm run build` first to generate `dist/`.
