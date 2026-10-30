import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { Express, Response } from "express";
import session from "express-session";

interface LoginUser {
	email: string;
	name: string;
	createdAt: string;
}

interface LoginResponse {
	accessToken: string;
	tokenType: "Bearer";
	expiresIn: number;
	user: LoginUser;
}

declare module "express-session" {
	interface SessionData {
		adminCsrfToken?: string;
		auth?: {
			accessToken: string;
			user: LoginUser;
			expiresAt: number;
			role: "admin" | "user";
		};
	}
}

export function readLoginClaims(token: string): {
	role: "admin" | "user";
	expiresAt: number;
} {
	const parts = token.split(".");
	const payload = parts[1];
	if (
		parts.length !== 3 ||
		!payload ||
		parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
	) {
		throw new Error("Invalid JWT format");
	}
	// Decode only tokens received directly from the login backend; this is not signature verification.
	const claims: unknown = JSON.parse(
		Buffer.from(payload, "base64url").toString("utf8"),
	);
	if (typeof claims !== "object" || claims === null) {
		throw new Error("Invalid JWT payload");
	}
	const { role, exp, iss, aud, sub } = claims as Record<string, unknown>;
	if (
		(role !== "admin" && role !== "user") ||
		typeof exp !== "number" ||
		!Number.isSafeInteger(exp * 1000) ||
		exp * 1000 <= Date.now() ||
		iss !== "the-achievers-backend" ||
		aud !== "the-achievers-api" ||
		typeof sub !== "string" ||
		!sub
	) {
		throw new Error("Invalid JWT claims");
	}
	return { role, expiresAt: exp * 1000 };
}

function isLoginResponse(value: unknown): value is LoginResponse {
	if (typeof value !== "object" || value === null) return false;
	const data = value as Record<string, unknown>;
	if (typeof data.user !== "object" || data.user === null) return false;
	const user = data.user as Record<string, unknown>;
	return (
		typeof data.accessToken === "string" &&
		data.accessToken.length > 0 &&
		data.tokenType === "Bearer" &&
		typeof data.expiresIn === "number" &&
		Number.isSafeInteger(data.expiresIn) &&
		data.expiresIn > 0 &&
		Number.isSafeInteger(Date.now() + data.expiresIn * 1000) &&
		typeof user.email === "string" &&
		typeof user.name === "string" &&
		typeof user.createdAt === "string"
	);
}

function loginError(
	res: Response,
	status: number,
	message: string,
	email = "",
) {
	return res.status(status).render("login", {
		title: "Login | Cue Corner",
		loginError: true,
		loginMessage: message,
		email,
	});
}

export function registerAuth(app: Express, backendUrl: string): void {
	const production = process.env.NODE_ENV === "production";
	const secret = process.env.SESSION_SECRET;
	if (production && !secret) {
		throw new Error("SESSION_SECRET must be set in production");
	}
	const cookieName = "cue-corner.sid";
	const cookieOptions = {
		httpOnly: true,
		sameSite: "lax" as const,
		secure: production,
		path: "/",
	};

	app.use(
		session({
			name: cookieName,
			secret: secret || randomBytes(32).toString("hex"),
			resave: false,
			saveUninitialized: false,
			cookie: cookieOptions,
		}),
	);

	app.use(async (req, res, next) => {
		if (req.session.auth) {
			res.set("Cache-Control", "no-store");
			if (req.session.auth.expiresAt <= Date.now()) {
				try {
					await promisify(req.session.regenerate).call(req.session);
					res.clearCookie(cookieName, cookieOptions);
				} catch {
					console.error("Unable to clear the expired login session.");
					loginError(
						res,
						500,
						"Unable to clear your session. Please try again.",
					);
					return;
				}
			} else {
				res.locals.currentUser = req.session.auth.user;
				res.locals.isAdmin = req.session.auth.role === "admin";
			}
		}
		next();
	});

	app.get("/login", (_req, res) => {
		res.set("Cache-Control", "no-store");
		res.render("login", { title: "Login | Cue Corner" });
	});

	app.post("/login", async (req, res) => {
		res.set("Cache-Control", "no-store");
		const { email, password } = req.body ?? {};
		const trimmedEmail = typeof email === "string" ? email.trim() : "";
		if (
			!/^[^\s@]+@[^\s@]+$/.test(trimmedEmail) ||
			typeof password !== "string" ||
			!password
		) {
			return loginError(
				res,
				400,
				"Please provide a valid email address and password.",
				trimmedEmail,
			);
		}

		let backendResponse: globalThis.Response;
		try {
			backendResponse = await fetch(new URL("/api/login", backendUrl), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: trimmedEmail, password }),
				signal: AbortSignal.timeout(5000),
			});
		} catch {
			console.error("Unable to reach the login backend.");
			return loginError(
				res,
				503,
				"The login service is temporarily unavailable. Please try again.",
				trimmedEmail,
			);
		}

		if (backendResponse.status === 401) {
			return loginError(res, 401, "Invalid email or password", trimmedEmail);
		}

		const failureMessage = "Unable to log in. Please try again.";
		if (backendResponse.status !== 200 && backendResponse.status !== 400) {
			console.error(`Login backend returned status ${backendResponse.status}.`);
			return loginError(res, 502, failureMessage, trimmedEmail);
		}

		let data: unknown;
		try {
			data = await backendResponse.json();
		} catch {
			console.error("Login backend returned invalid JSON.");
			return loginError(res, 502, failureMessage, trimmedEmail);
		}

		if (backendResponse.status === 400) {
			if (
				typeof data === "object" &&
				data !== null &&
				"error" in data &&
				typeof data.error === "string" &&
				data.error.trim()
			) {
				return loginError(res, 400, data.error, trimmedEmail);
			}
			console.error("Login backend returned an invalid validation response.");
			return loginError(res, 502, failureMessage, trimmedEmail);
		}

		if (!isLoginResponse(data)) {
			console.error("Login backend returned an invalid success response.");
			return loginError(res, 502, failureMessage, trimmedEmail);
		}

		let claims: ReturnType<typeof readLoginClaims>;
		try {
			claims = readLoginClaims(data.accessToken);
		} catch {
			console.error("Login backend returned invalid token claims.");
			return loginError(res, 502, failureMessage, trimmedEmail);
		}
		const expiresAt = Math.min(
			claims.expiresAt,
			Date.now() + data.expiresIn * 1000,
		);

		try {
			await promisify(req.session.regenerate).call(req.session);
			req.session.auth = {
				accessToken: data.accessToken,
				user: {
					email: data.user.email,
					name: data.user.name,
					createdAt: data.user.createdAt,
				},
				expiresAt,
				role: claims.role,
			};
			req.session.cookie.maxAge = expiresAt - Date.now();
			await promisify(req.session.save).call(req.session);
		} catch {
			console.error("Unable to save the login session.");
			delete req.session.auth;
			try {
				await promisify(req.session.destroy).call(req.session);
			} catch {
				console.error("Unable to discard the failed login session.");
			}
			res.clearCookie(cookieName, cookieOptions);
			return loginError(res, 500, failureMessage, trimmedEmail);
		}

		return res.redirect(303, claims.role === "admin" ? "/admin" : "/");
	});

	app.post("/logout", async (req, res) => {
		res.set("Cache-Control", "no-store");
		try {
			await promisify(req.session.destroy).call(req.session);
			res.clearCookie(cookieName, cookieOptions);
		} catch {
			console.error("Unable to clear the login session.");
			return loginError(res, 500, "Unable to log out. Please try again.");
		}
		return res.redirect(303, "/login");
	});
}
