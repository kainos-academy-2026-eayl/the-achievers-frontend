import type { NextFunction, Request, Response } from "express";
import { readLoginClaims } from "../auth";

/**
 * Middleware to require user to be authenticated.
 * Redirects to login if no session or token is expired.
 */
export function requireAuth(
	_req: Request,
	res: Response,
	next: NextFunction,
): void {
	const auth = res.locals.currentUser ? _req.session.auth : undefined;

	if (!auth) {
		res.set("Cache-Control", "no-store");
		res.redirect(303, "/login");
		return;
	}

	try {
		const claims = readLoginClaims(auth.accessToken);
		if (claims.expiresAt <= Date.now()) {
			res.set("Cache-Control", "no-store");
			res.redirect(303, "/logout");
			return;
		}
	} catch (error) {
		console.error("Failed to verify token claims", error);
		res.set("Cache-Control", "no-store");
		res.redirect(303, "/logout");
		return;
	}

	next();
}

/**
 * Middleware to require user to be authenticated and have admin role.
 * Redirects to login if not authenticated, renders 403 if insufficient permissions.
 */
export function requireAdmin(
	_req: Request,
	res: Response,
	next: NextFunction,
): void {
	const auth = res.locals.currentUser ? _req.session.auth : undefined;

	if (!auth) {
		res.set("Cache-Control", "no-store");
		res.redirect(303, "/login");
		return;
	}

	try {
		const claims = readLoginClaims(auth.accessToken);
		if (claims.expiresAt <= Date.now()) {
			res.set("Cache-Control", "no-store");
			res.redirect(303, "/logout");
			return;
		}
	} catch (error) {
		console.error("Failed to verify token claims", error);
		res.set("Cache-Control", "no-store");
		res.redirect(303, "/logout");
		return;
	}

	if (auth.role !== "admin") {
		res.set("Cache-Control", "no-store");
		res.status(403).render("admin", {
			title: "Admin dashboard | Cue Corner",
			notAllowed: true,
		});
		return;
	}

	next();
}
