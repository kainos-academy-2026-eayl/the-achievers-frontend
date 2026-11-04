import { randomUUID } from "node:crypto";
import request from "supertest";
import session, { type SessionData } from "express-session";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createApp } from "../src/app";

const credentials = {
	email: "customer@example.com",
	password: " LongEnoughPassword123! ",
};
const loginResponse = {
	accessToken: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
		JSON.stringify({
			sub: "1",
			iss: "the-achievers-backend",
			aud: "the-achievers-api",
			role: "user",
			exp: Math.floor(Date.now() / 1000) + 7200,
		}),
	).toString("base64url")}.test-signature`,
	tokenType: "Bearer",
	expiresIn: 3600,
	user: {
		email: credentials.email,
		name: "Customer",
		createdAt: "2026-01-01T00:00:00.000Z",
	},
};

function mockLogin(body: unknown = loginResponse, status = 200) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
	);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

const backendUrl = process.env.AUTH_INTEGRATION_BACKEND_URL;

describe.skipIf(!backendUrl)("Login with the real backend", () => {
	const realCredentials = {
		email: `login-test-${randomUUID()}@example.com`,
		password: " LongEnoughPassword123! ",
	};
	const name = "Login Test User";

	beforeAll(async () => {
		const response = await fetch(`${backendUrl}/api/register`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, ...realCredentials }),
			signal: AbortSignal.timeout(10000),
		});
		expect(
			response.status,
			"The real backend must create the test account",
		).toBe(201);
		expect(await response.json()).toMatchObject({
			name,
			email: realCredentials.email,
		});
	}, 15000);

	beforeEach(() => {
		vi.stubEnv("API_BASE_URL", backendUrl);
	});

	it("authenticates, preserves the session, and logs out using a real account", async () => {
		const app = createApp();
		let storedAuth: SessionData["auth"];
		app.get("/session-check", (req, res) => {
			storedAuth = req.session.auth;
			res.sendStatus(204);
		});
		const agent = request.agent(app);
		const login = await agent
			.post("/login")
			.type("form")
			.send({ ...realCredentials, email: ` ${realCredentials.email} ` })
			.timeout({ response: 10000, deadline: 12000 });

		expect(login.status).toBe(303);
		expect(login.headers.location).toBe("/");
		const cookie = String(login.headers["set-cookie"]);
		expect(cookie).toContain("cue-corner.sid=");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		await agent.get("/session-check").expect(204);
		expect(storedAuth?.user).toMatchObject({
			name,
			email: realCredentials.email,
		});
		expect(storedAuth?.accessToken).toEqual(expect.any(String));
		expect(storedAuth?.accessToken.length).toBeGreaterThan(0);
		expect(storedAuth?.expiresAt).toBeGreaterThan(Date.now());
		const home = await agent.get("/").expect(200);
		expect(home.text).toContain(`Signed in as ${name}`);
		expect(home.text).not.toContain(realCredentials.password);
		expect(cookie).not.toContain(storedAuth!.accessToken);
		expect(home.text).not.toContain(storedAuth!.accessToken);

		await agent.post("/logout").expect(303).expect("Location", "/login");
		const replay = await request(app)
			.get("/")
			.set("Cookie", cookie.split(";")[0]!);
		expect(replay.text).not.toContain("Signed in as");
		expect((await agent.get("/")).text).not.toContain("Signed in as");
	}, 15000);

	it("rejects an incorrect password using the real backend", async () => {
		const agent = request.agent(createApp());
		const response = await agent
			.post("/login")
			.type("form")
			.send({ ...realCredentials, password: "IncorrectPassword123!" })
			.timeout({ response: 10000, deadline: 12000 });

		expect(response.status).toBe(401);
		expect(response.text).toContain("Invalid email or password");
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect((await agent.get("/")).text).not.toContain("Signed in as");
	}, 15000);
});

describe("Login", () => {
	it("renders a working login form without creating an anonymous session", async () => {
		const response = await request(createApp()).get("/login");

		expect(response.status).toBe(200);
		expect(response.text).toContain('action="/login" method="post"');
		expect(response.text).not.toContain("event.preventDefault()");
		expect(response.headers["set-cookie"]).toBeUndefined();
		expect(response.headers["cache-control"]).toBe("no-store");
	});

	it("forwards credentials, stores authentication server-side, and signs in", async () => {
		vi.stubEnv("API_BASE_URL", "http://backend.example:3000");
		const fetchSpy = mockLogin();
		const app = createApp();
		let storedAuth: SessionData["auth"];
		app.get("/session-check", (req, res) => {
			storedAuth = req.session.auth;
			res.sendStatus(204);
		});
		const agent = request.agent(app);
		const before = Date.now();

		const response = await agent
			.post("/login")
			.type("form")
			.send({
				...credentials,
				email: ` ${credentials.email} `,
			});

		expect(response.status).toBe(303);
		expect(response.headers.location).toBe("/");
		expect(fetchSpy).toHaveBeenCalledWith(
			new URL("http://backend.example:3000/api/login"),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(credentials),
				signal: expect.any(AbortSignal),
			},
		);
		const cookie = String(response.headers["set-cookie"]);
		expect(cookie).toContain("cue-corner.sid=");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).not.toContain(loginResponse.accessToken);
		expect(cookie).not.toContain(credentials.email);

		await agent.get("/session-check").expect(204);
		expect(storedAuth).toEqual({
			accessToken: loginResponse.accessToken,
			user: loginResponse.user,
			expiresAt: expect.any(Number),
			role: "user",
		});
		expect(storedAuth?.expiresAt).toBeGreaterThanOrEqual(before + 3600000);
		expect(storedAuth?.expiresAt).toBeLessThanOrEqual(Date.now() + 3600000);
		const home = await agent.get("/");
		expect(home.text).toContain("Signed in as Customer");
		expect(home.text).toContain('action="/logout" method="post"');
		expect(home.text).not.toContain(loginResponse.accessToken);
		expect(home.text).not.toContain(credentials.password);
		expect(home.headers["cache-control"]).toBe("no-store");
	});

	it("regenerates the session ID and invalidates the previous session", async () => {
		mockLogin();
		const app = createApp();
		const agent = request.agent(app);
		const first = await agent.post("/login").type("form").send(credentials);
		const firstCookie = String(first.headers["set-cookie"]).split(";")[0]!;
		const second = await agent.post("/login").type("form").send(credentials);
		const secondCookie = String(second.headers["set-cookie"]).split(";")[0]!;

		expect(second.status).toBe(303);
		expect(firstCookie).not.toBe(secondCookie);
		const oldSession = await request(app).get("/").set("Cookie", firstCookie);
		expect(oldSession.text).not.toContain("Signed in as");
		expect((await agent.get("/")).text).toContain("Signed in as Customer");
	});

	it("destroys the session on logout", async () => {
		mockLogin();
		const app = createApp();
		const agent = request.agent(app);
		const login = await agent.post("/login").type("form").send(credentials);
		const oldCookie = String(login.headers["set-cookie"]).split(";")[0]!;
		const response = await agent.post("/logout");

		expect(response.status).toBe(303);
		expect(response.headers.location).toBe("/login");
		expect(String(response.headers["set-cookie"])).toContain(
			"Expires=Thu, 01 Jan 1970",
		);
		const home = await request(app).get("/").set("Cookie", oldCookie);
		expect(home.text).not.toContain("Signed in as");
	});

	it("rejects an expired cookie and removes its stored session", async () => {
		mockLogin();
		const app = createApp();
		const login = await request(app)
			.post("/login")
			.type("form")
			.send(credentials);
		const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
		vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3601000);

		const response = await request(app).get("/").set("Cookie", cookie);

		expect(response.text).not.toContain("Signed in as");
		vi.restoreAllMocks();
		const replay = await request(app).get("/").set("Cookie", cookie);
		expect(replay.text).not.toContain("Signed in as");
	});

	it("clears authentication when the token expires before the session cookie", async () => {
		mockLogin();
		const app = createApp();
		app.get("/expire-token", (req, res) => {
			if (req.session.auth) req.session.auth.expiresAt = Date.now() - 1;
			res.sendStatus(204);
		});
		const agent = request.agent(app);
		await agent.post("/login").type("form").send(credentials).expect(303);
		await agent.get("/expire-token").expect(204);

		const response = await agent.get("/");
		expect(response.text).not.toContain("Signed in as");
		expect(String(response.headers["set-cookie"])).toContain(
			"Expires=Thu, 01 Jan 1970",
		);
		expect((await agent.get("/")).text).not.toContain("Signed in as");
	});

	it("does not sign in when saving the session fails", async () => {
		mockLogin();
		vi.spyOn(session.MemoryStore.prototype, "set").mockImplementation(
			(_id, _session, callback) => callback?.(new Error("Store unavailable")),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const agent = request.agent(createApp());
		const response = await agent.post("/login").type("form").send(credentials);

		expect(response.status).toBe(500);
		expect(response.text).toContain("Unable to log in.");
		expect(response.text).not.toContain(loginResponse.accessToken);
		expect((await agent.get("/")).text).not.toContain("Signed in as");
	});

	it("allows login and logout when the incoming token has just expired", async () => {
		mockLogin();
		const app = createApp();
		app.get("/expire-token", (req, res) => {
			if (req.session.auth) req.session.auth.expiresAt = Date.now() - 1;
			res.sendStatus(204);
		});
		const agent = request.agent(app);
		await agent.post("/login").type("form").send(credentials).expect(303);
		await agent.get("/expire-token").expect(204);

		await agent.post("/login").type("form").send(credentials).expect(303);
		expect((await agent.get("/")).text).toContain("Signed in as Customer");
		await agent.get("/expire-token").expect(204);
		await agent.post("/logout").expect(303).expect("Location", "/login");
		expect((await agent.get("/")).text).not.toContain("Signed in as");
	});

	it.each([
		{},
		{ email: "not-an-email", password: "password" },
		{ email: credentials.email, password: "" },
		{ email: [credentials.email, "other@example.com"], password: "password" },
		{ email: credentials.email, password: ["password", "other"] },
	])(
		"rejects invalid input without contacting the backend: %j",
		async (input) => {
			const fetchSpy = vi.spyOn(globalThis, "fetch");
			const response = await request(createApp())
				.post("/login")
				.type("form")
				.send(input);

			expect(response.status).toBe(400);
			expect(response.text).toContain(
				"Please provide a valid email address and password.",
			);
			expect(response.text).toContain('role="alert"');
			expect(fetchSpy).not.toHaveBeenCalled();
		},
	);

	it.each([
		[400, { error: "Password is required." }, 400, "Password is required."],
		[
			401,
			{ error: "Account does not exist" },
			401,
			"Invalid email or password",
		],
		[500, { error: "Internal database details" }, 502, "Unable to log in."],
		[200, { ...loginResponse, accessToken: "" }, 502, "Unable to log in."],
		[200, { ...loginResponse, expiresIn: -1 }, 502, "Unable to log in."],
		[200, { ...loginResponse, tokenType: "Other" }, 502, "Unable to log in."],
		[200, { ...loginResponse, user: null }, 502, "Unable to log in."],
		[400, {}, 502, "Unable to log in."],
	])(
		"handles backend status %i and body %j",
		async (status, body, expectedStatus, message) => {
			mockLogin(body, status);
			const logger = vi.spyOn(console, "error").mockImplementation(() => {});
			const response = await request(createApp())
				.post("/login")
				.type("form")
				.send(credentials);

			expect(response.status).toBe(expectedStatus);
			expect(response.text).toContain(message);
			expect(response.text).toContain(`value="${credentials.email}"`);
			expect(response.text).not.toContain(credentials.password);
			expect(response.text).not.toContain(loginResponse.accessToken);
			expect(response.text).not.toContain("Internal database details");
			expect(response.headers["set-cookie"]).toBeUndefined();
			expect(JSON.stringify(logger.mock.calls)).not.toContain(
				loginResponse.accessToken,
			);
		},
	);

	it("escapes backend validation messages", async () => {
		mockLogin({ error: "<script>alert('error')</script>" }, 400);
		const response = await request(createApp())
			.post("/login")
			.type("form")
			.send(credentials);

		expect(response.status).toBe(400);
		expect(response.text).toContain("&lt;script&gt;");
		expect(response.text).not.toContain("<script>");
	});

	it("handles malformed backend JSON", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not JSON"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await request(createApp())
			.post("/login")
			.type("form")
			.send(credentials);

		expect(response.status).toBe(502);
		expect(response.text).toContain("Unable to log in.");
	});

	it("shows temporary unavailability without logging credentials on network failure", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(
			new Error(`Network error containing ${credentials.password}`),
		);
		const logger = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await request(createApp())
			.post("/login")
			.type("form")
			.send(credentials);

		expect(response.status).toBe(503);
		expect(response.text).toContain("temporarily unavailable");
		expect(response.text).not.toContain(credentials.password);
		expect(JSON.stringify(logger.mock.calls)).not.toContain(
			credentials.password,
		);
	});

	it("requires a session secret in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("SESSION_SECRET", "");
		expect(() => createApp()).toThrow(
			"SESSION_SECRET must be set in production",
		);
	});
});
