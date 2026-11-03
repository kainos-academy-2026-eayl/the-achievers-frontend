import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { ProductClient } from "../src/clients/productClient";
import { ProductService } from "../src/services/productService";
import { validateProductInput } from "../src/services/productValidation";

const credentials = {
	email: "admin@example.com",
	password: "Test-password-123!",
};
const input = {
	name: "Maple Cue",
	description: "A balanced maple cue.",
	category: "Cues",
	price: "89.99",
};
const product = {
	...input,
	id: "created-product",
	price: 89.99,
	rating: null,
	reviewCount: 0,
};

function setup(role = "admin", exp = Math.floor(Date.now() / 1000) + 3600) {
	const claims = {
		sub: "1",
		iss: "the-achievers-backend",
		aud: "the-achievers-api",
		role,
		exp,
	};
	const accessToken = `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
	const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({
			accessToken,
			tokenType: "Bearer",
			expiresIn: 3600,
			user: {
				name: "Admin",
				email: credentials.email,
				createdAt: "2026-01-01T00:00:00Z",
			},
		}),
	);
	const getAll = vi.fn().mockResolvedValue([]);
	const app = createApp(
		new ProductService({ getAll }),
		undefined,
		undefined,
		new ProductClient("http://backend.test"),
	);
	const agent = request.agent(app);
	async function login() {
		await agent.post("/login").type("form").send(credentials).expect(303);
	}
	async function form() {
		await login();
		const response = await agent.get("/admin/products/new").expect(200);
		const csrfToken = response.text.match(
			/name="csrfToken" value="([a-f0-9]+)"/,
		)?.[1];
		if (!csrfToken) throw new Error("Missing product creation CSRF token");
		return { csrfToken, response };
	}
	return { app, agent, fetchSpy, getAll, accessToken, form, login };
}

afterEach(() => vi.restoreAllMocks());

describe("Admin product creation", () => {
	it("offers an accessible form for the four fields, no stock, and no token exposure", async () => {
		const { agent, form, accessToken, fetchSpy } = setup();
		const { response } = await form();
		expect(response.headers["cache-control"]).toBe("no-store");
		for (const field of ["name", "description", "category", "price"]) {
			expect(response.text).toContain(`name="${field}"`);
			expect(response.text).toContain(`for="product-${field}"`);
		}
		expect(response.text).not.toMatch(/name="stock/);
		expect(response.text).not.toContain(accessToken);
		expect(response.text).toContain('href="/admin">Cancel');
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const dashboard = await agent.get("/admin").expect(200);
		expect(dashboard.text).toContain('href="/admin/products/new"');
	});

	it("creates using the stored JWT and refreshes the admin catalogue and shop", async () => {
		const { agent, form, fetchSpy, accessToken, getAll } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockImplementation(async () => {
			getAll.mockResolvedValue([product]);
			return Response.json(product, { status: 201 });
		});
		await agent
			.post("/admin/products")
			.type("form")
			.send({
				...input,
				name: " Maple Cue ",
				csrfToken,
				stock: 100,
			})
			.expect(303)
			.expect("Location", "/admin?created=1");
		expect(fetchSpy).toHaveBeenLastCalledWith(
			new URL("http://backend.test/api/products"),
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(input),
				signal: expect.any(AbortSignal),
			}),
		);
		const dashboard = await agent.get("/admin?created=1").expect(200);
		expect(dashboard.text).toContain("Product created successfully.");
		expect(dashboard.text).toContain("<dt>Products</dt><dd>1</dd>");
		expect(dashboard.text).toContain("Maple Cue");
		const shop = await agent.get("/shop").expect(200);
		expect(shop.text).toContain("Maple Cue");
		expect(shop.text).toContain("£89.99");
	});

	it.each(["get", "post"] as const)(
		"blocks anonymous %s access",
		async (method) => {
			const { app, fetchSpy } = setup();
			await request(app)
				[method](method === "get" ? "/admin/products/new" : "/admin/products")
				.expect(303)
				.expect("Location", "/login");
			expect(fetchSpy).not.toHaveBeenCalled();
		},
	);

	it.each(["get", "post"] as const)(
		"blocks non-admin %s access",
		async (method) => {
			const { agent, login, fetchSpy } = setup("user");
			await login();
			await agent[method](
				method === "get" ? "/admin/products/new" : "/admin/products",
			).expect(403);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		},
	);

	it("rejects an expired admin session before creating", async () => {
		const exp = Math.floor(Date.now() / 1000) + 60;
		const { agent, form, fetchSpy } = setup("admin", exp);
		const { csrfToken } = await form();
		vi.spyOn(Date, "now").mockReturnValue(exp * 1000 + 1);
		await agent
			.post("/admin/products")
			.type("form")
			.send({ ...input, csrfToken })
			.expect(303)
			.expect("Location", "/login");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it.each([undefined, "wrong", ["a", "b"]])(
		"rejects invalid CSRF token %j",
		async (token) => {
			const { agent, form, fetchSpy } = setup();
			await form();
			vi.spyOn(console, "warn").mockImplementation(() => {});
			const response = await agent
				.post("/admin/products")
				.type("form")
				.send({
					...input,
					...(token === undefined ? {} : { csrfToken: token }),
				})
				.expect(403);
			expect(response.text).toContain("Invalid form session");
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		},
	);

	it("rejects CSRF tokens from another session", async () => {
		const { agent, app, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		const other = request.agent(app);
		await other.post("/login").type("form").send(credentials).expect(303);
		await other.get("/admin/products/new").expect(200);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await other
			.post("/admin/products")
			.type("form")
			.send({ ...input, csrfToken })
			.expect(403);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		await agent.get("/admin").expect(200);
	});

	it.each([
		{ name: "" },
		{ name: " " },
		{ name: ["Cue", "Case"] },
		{ name: "n".repeat(201) },
		{ description: "" },
		{ description: "d".repeat(2001) },
		{ category: "" },
		{ category: "c".repeat(101) },
		{ price: "" },
		{ price: "-1" },
		{ price: "1.001" },
		{ price: "1e2" },
		{ price: "12abc" },
		{ price: "21474836.48" },
	])(
		"rejects invalid values %j before calling the backend",
		async (changes) => {
			const { agent, form, fetchSpy } = setup();
			const { csrfToken } = await form();
			const response = await agent
				.post("/admin/products")
				.type("form")
				.send({ ...input, ...changes, csrfToken })
				.expect(400);
			expect(response.text).toContain("Please fix the errors below.");
			expect(response.text).toContain('aria-invalid="true"');
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		},
	);

	it("preserves and escapes submitted fields after a validation failure", async () => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		const response = await agent
			.post("/admin/products")
			.type("form")
			.send({
				...input,
				name: '<script>alert("bad")</script>',
				description: "</textarea><script>bad()</script>",
				price: "",
				csrfToken,
			})
			.expect(400);
		expect(response.text).toContain("&lt;script&gt;");
		expect(response.text).toContain("&lt;/textarea&gt;");
		expect(response.text).toContain('value="Cues"');
		expect(response.text).not.toContain("<script>bad()");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("displays backend field errors and keeps the submitted values", async () => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockResolvedValue(
			Response.json(
				{
					error: "Validation failed",
					fieldErrors: { name: "This product name is invalid" },
				},
				{ status: 400 },
			),
		);
		const response = await agent
			.post("/admin/products")
			.type("form")
			.send({ ...input, csrfToken })
			.expect(400);
		expect(response.text).toContain("This product name is invalid");
		expect(response.text).toContain('value="Maple Cue"');
	});

	it.each([401, 403, 500, 200])(
		"handles backend status %s without claiming success",
		async (status) => {
			const { agent, form, fetchSpy } = setup();
			const { csrfToken } = await form();
			fetchSpy.mockResolvedValue(new Response(null, { status }));
			vi.spyOn(console, "error").mockImplementation(() => {});
			const response = await agent
				.post("/admin/products")
				.type("form")
				.send({ ...input, csrfToken })
				.expect(status === 401 ? 303 : status === 403 ? 403 : 502);
			expect(response.text).not.toContain("Product created successfully.");
			if (status === 401) {
				expect(response.headers.location).toBe("/login");
				await agent.get("/admin").expect(303).expect("Location", "/login");
			} else if (status === 403) {
				expect(response.text).toContain("Not allowed");
			} else {
				expect(response.text).toContain(
					"Check the catalogue before trying again",
				);
				expect(response.text).toContain('value="Maple Cue"');
			}
		},
	);

	it.each([
		{ status: 201, body: {} },
		{ status: 201, body: { ...product, price: "89.99" } },
		{ status: 201, body: { ...product, id: "" } },
		{ status: 400, body: {} },
		{ status: 400, body: { fieldErrors: {} } },
		{ status: 400, body: { fieldErrors: { name: 123 } } },
	])("rejects malformed backend response %j", async ({ status, body }) => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockResolvedValue(Response.json(body, { status }));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await agent
			.post("/admin/products")
			.type("form")
			.send({ ...input, csrfToken })
			.expect(502);
	});

	it("shows an explicit failure on network errors without logging the token", async () => {
		const { agent, form, fetchSpy, accessToken } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockRejectedValue(new Error("network unavailable"));
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await agent
			.post("/admin/products")
			.type("form")
			.send({ ...input, csrfToken })
			.expect(502);
		expect(response.text).toContain("Check the catalogue before trying again");
		expect(log).toHaveBeenCalled();
		expect(JSON.stringify(log.mock.calls)).not.toContain(accessToken);
	});
});

describe("Product form validation boundaries", () => {
	it.each(["0", "0.01", "0.29", "21474836.47"])("accepts price %s", (price) => {
		expect(validateProductInput({ ...input, price }).fieldErrors).toEqual({});
	});
	it("accepts maximum text lengths", () => {
		expect(
			validateProductInput({
				...input,
				name: "n".repeat(200),
				description: "d".repeat(2000),
				category: "c".repeat(100),
			}).fieldErrors,
		).toEqual({});
	});
});
