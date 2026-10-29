import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { ProductService } from "../src/services/productService";

const credentials = { email: "admin@example.com", password: "Password123!" };
const product = {
	id: "p1",
	name: "Maple Cue",
	description: "A balanced cue.",
	category: "Cues",
	price: 89.99,
};

function token(overrides: Record<string, unknown> = {}) {
	const claims = {
		sub: "1",
		iss: "the-achievers-backend",
		aud: "the-achievers-api",
		role: "admin",
		exp: Math.floor(Date.now() / 1000) + 3600,
		...overrides,
	};
	return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test-signature`;
}

function mockLogin(accessToken = token()) {
	return vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(
			JSON.stringify({
				accessToken,
				tokenType: "Bearer",
				expiresIn: 3600,
				user: {
					...credentials,
					name: "Admin <script>alert(1)</script>",
					createdAt: "2026-01-01T00:00:00Z",
				},
			}),
			{ headers: { "Content-Type": "application/json" } },
		),
	);
}

function appWithProducts(products: unknown = [product]) {
	return createApp(new ProductService({ getAll: async () => products }));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Admin dashboard", () => {
	it("redirects anonymous visitors without loading products or trusting client tokens", async () => {
		const getAll = vi.fn();
		const app = createApp({ getAll });
		await request(app)
			.get("/admin")
			.set("Authorization", `Bearer ${token()}`)
			.expect(303)
			.expect("Location", "/login")
			.expect("Cache-Control", "no-store");
		expect(getAll).not.toHaveBeenCalled();
	});

	it("redirects admins after login and renders real product and category totals", async () => {
		const accessToken = token();
		const fetchSpy = mockLogin(accessToken);
		const app = appWithProducts([
			product,
			{ ...product, id: "p2", name: "Second Cue" },
			{ ...product, id: "p3", name: "Cue Case", category: "Cases" },
		]);
		const agent = request.agent(app);
		const login = await agent.post("/login").type("form").send(credentials);
		expect(login.status).toBe(303);
		expect(login.headers.location).toBe("/admin");
		const response = await agent.get("/admin").expect(200);
		expect(response.headers["cache-control"]).toBe("no-store");
		expect(response.text).toContain("<dt>Products</dt><dd>3</dd>");
		expect(response.text).toContain("<dt>Categories</dt><dd>2</dd>");
		expect(response.text).toContain("Maple Cue");
		expect(response.text).toContain("Cue Case");
		expect(response.text).toContain("£89.99");
		expect(response.text).toContain("Read-only overview");
		expect(response.text).toContain('href="/admin">Admin dashboard</a>');
		expect(response.text).not.toContain("<script>");
		expect(response.text).toContain("&lt;script&gt;");
		expect(response.text).not.toContain(accessToken);
		expect(response.text).not.toContain(credentials.password);
		expect(String(login.headers["set-cookie"])).not.toContain(accessToken);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect((await agent.get("/shop")).text).toContain('href="/admin"');
		await agent.post("/logout").expect(303);
		await agent.get("/admin").expect(303).expect("Location", "/login");
	});

	it("keeps ordinary users on the storefront and returns not allowed for direct access", async () => {
		mockLogin(token({ role: "user" }));
		const getAll = vi.fn().mockResolvedValue([]);
		const agent = request.agent(createApp({ getAll }));
		await agent
			.post("/login")
			.type("form")
			.send(credentials)
			.expect(303)
			.expect("Location", "/");
		const response = await agent.get("/admin").expect(403);
		expect(response.text).toContain("Not allowed");
		expect(response.text).not.toContain("Product catalogue");
		expect(response.text).not.toContain('href="/admin"');
		expect(getAll).not.toHaveBeenCalled();
		expect((await agent.get("/")).text).not.toContain('href="/admin"');
	});

	it("shows genuine zero totals and an empty state for an empty catalogue", async () => {
		mockLogin();
		const agent = request.agent(appWithProducts([]));
		await agent.post("/login").type("form").send(credentials).expect(303);
		const response = await agent.get("/admin").expect(200);
		expect(response.text).toContain("<dt>Products</dt><dd>0</dd>");
		expect(response.text).toContain("<dt>Categories</dt><dd>0</dd>");
		expect(response.text).toContain("No products available");
	});

	it("shows a retryable error instead of misleading zero totals on catalogue failure", async () => {
		mockLogin();
		const logger = vi.spyOn(console, "error").mockImplementation(() => {});
		const agent = request.agent(
			createApp({
				getAll: async () => {
					throw new Error("backend unavailable");
				},
			}),
		);
		await agent.post("/login").type("form").send(credentials).expect(303);
		const response = await agent.get("/admin").expect(502);
		expect(response.text).toContain('role="alert"');
		expect(response.text).toContain("Catalogue unavailable");
		expect(response.text).toContain("Try again");
		expect(response.text).not.toContain("<dt>Products</dt>");
		expect(logger).toHaveBeenCalled();
	});

	it.each([
		"not-a-jwt",
		"a.!!!.c",
		"a.bnVsbA.c",
		"a.bm90LWpzb24.c",
		token({ role: "superadmin" }),
		token({ role: undefined }),
		token({ exp: Math.floor(Date.now() / 1000) - 1 }),
		token({ exp: "3600" }),
		token({ iss: "another-backend" }),
		token({ aud: "another-api" }),
		token({ sub: null }),
	])(
		"rejects malformed or invalid login claims without creating a session: %s",
		async (accessToken) => {
			mockLogin(accessToken);
			const logger = vi.spyOn(console, "error").mockImplementation(() => {});
			const agent = request.agent(appWithProducts());
			const response = await agent
				.post("/login")
				.type("form")
				.send(credentials);
			expect(response.status).toBe(502);
			expect(response.text).toContain("Unable to log in");
			expect(response.headers["set-cookie"]).toBeUndefined();
			expect(response.text).not.toContain(accessToken);
			expect(JSON.stringify(logger.mock.calls)).not.toContain(accessToken);
			await agent.get("/admin").expect(303).expect("Location", "/login");
		},
	);

	it("expires admin access at JWT expiry even when expiresIn would allow a longer session", async () => {
		const exp = Math.floor(Date.now() / 1000) + 60;
		mockLogin(token({ exp }));
		const app = appWithProducts();
		let expiresAt: number | undefined;
		app.get("/session-expiry", (req, res) => {
			expiresAt = req.session.auth?.expiresAt;
			res.sendStatus(204);
		});
		const login = await request(app)
			.post("/login")
			.type("form")
			.send(credentials)
			.expect(303);
		const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
		await request(app).get("/session-expiry").set("Cookie", cookie).expect(204);
		expect(expiresAt).toBe(exp * 1000);
		vi.spyOn(Date, "now").mockReturnValue(exp * 1000 + 1);
		await request(app)
			.get("/admin")
			.set("Cookie", cookie)
			.expect(303)
			.expect("Location", "/login")
			.expect("Cache-Control", "no-store");
		vi.restoreAllMocks();
		await request(app)
			.get("/admin")
			.set("Cookie", cookie)
			.expect(303)
			.expect("Location", "/login");
	});
});
