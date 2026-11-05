import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { ProductClient } from "../src/clients/productClient";
import { ProductService } from "../src/services/productService";
import { validateProductEditInput } from "../src/services/productValidation";

const credentials = {
	email: "admin@example.com",
	password: "Test-password-123!",
};
const input = {
	name: "Updated Maple Cue",
	description: "An updated balanced cue.",
	category: "Premium Cues",
	price: "129.99",
	stock: "25",
};
const product = {
	id: "test-product",
	name: "Maple Cue",
	description: "A balanced maple cue.",
	category: "Cues",
	price: 89.99,
	stock: 10,
	rating: null,
	reviewCount: 0,
};
const updatedProduct = {
	...product,
	...input,
	price: 129.99,
	stock: 25,
};
const path = `/admin/products/${product.id}/edit`;

function csrf(html: string): string {
	const value = html.match(/name="csrfToken" value="([a-f0-9]+)"/)?.[1];
	if (!value) throw new Error("Missing editing CSRF token");
	return value;
}

function setup(role = "admin") {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	const accessToken = [
		"header",
		Buffer.from(
			JSON.stringify({
				sub: "1",
				iss: "the-achievers-backend",
				aud: "the-achievers-api",
				role,
				exp,
			}),
		).toString("base64url"),
		"signature",
	].join(".");
	const fetchSpy = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (url) =>
			String(url).endsWith("/api/login")
				? Response.json({
						accessToken,
						tokenType: "Bearer",
						expiresIn: 3600,
						user: {
							name: "Admin",
							email: credentials.email,
							createdAt: "2026-01-01T00:00:00Z",
						},
					})
				: Response.json(product),
		);
	const getAll = vi.fn().mockResolvedValue([product]);
	const app = createApp(
		new ProductService({ getAll }),
		undefined,
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
		const response = await agent.get(path).expect(200);
		return { response, csrfToken: csrf(response.text) };
	}
	return { app, agent, fetchSpy, getAll, accessToken, exp, login, form };
}

afterEach(() => vi.restoreAllMocks());

describe("Admin product editing", () => {
	it("links the dashboard to a prefilled accessible form without exposing the JWT", async () => {
		const { agent, form, accessToken, fetchSpy } = setup();
		const { response } = await form();
		expect(response.headers["cache-control"]).toBe("no-store");
		expect(response.text).toContain(`action="${path}" method="post"`);
		for (const field of ["name", "description", "category", "price", "stock"]) {
			expect(response.text).toContain(`name="${field}"`);
			expect(response.text).toContain(`for="product-${field}"`);
		}
		expect(response.text).toContain('value="Maple Cue"');
		expect(response.text).toContain(">A balanced maple cue.</textarea>");
		expect(response.text).toContain('value="Cues"');
		expect(response.text).toContain('value="89.99"');
		expect(response.text).toContain('value="10"');
		expect(response.text).toContain('href="/admin">Cancel');
		expect(response.text).not.toContain(accessToken);
		expect(
			fetchSpy.mock.calls.every(([, options]) => options?.method !== "PUT"),
		).toBe(true);
		const dashboard = await agent.get("/admin").expect(200);
		expect(dashboard.text).toContain(`href="${path}"`);
	});

	it("sends a complete PUT with the stored JWT and refreshes the dashboard, form and shop", async () => {
		const { agent, form, fetchSpy, getAll, accessToken } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockImplementation(async () => {
			getAll.mockResolvedValue([updatedProduct]);
			return Response.json(updatedProduct);
		});
		await agent
			.post(path)
			.type("form")
			.send({
				...input,
				name: ` ${input.name} `,
				csrfToken,
				id: "untrusted-id",
				rating: "5",
			})
			.expect(303)
			.expect("Location", "/admin?updated=1");
		expect(fetchSpy).toHaveBeenLastCalledWith(
			new URL(`http://backend.test/api/products/${product.id}`),
			expect.objectContaining({
				method: "PUT",
				headers: {
					Authorization: ["Bearer", accessToken].join(" "),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ ...input, stock: 25 }),
				signal: expect.any(AbortSignal),
			}),
		);
		const dashboard = await agent.get("/admin?updated=1").expect(200);
		expect(dashboard.text).toContain("Product updated successfully.");
		expect(dashboard.text).toContain(input.name);
		expect(dashboard.text).toContain("£129.99");
		const shop = await agent.get("/shop").expect(200);
		expect(shop.text).toContain(input.name);
		expect(shop.text).toContain("£129.99");
		const edit = await agent.get(path).expect(200);
		expect(edit.text).toContain('value="25"');
	});

	it.each(["get", "post"] as const)(
		"blocks anonymous %s access",
		async (method) => {
			const { app, fetchSpy } = setup();
			await request(app)[method](path).expect(303).expect("Location", "/login");
			expect(fetchSpy).not.toHaveBeenCalled();
		},
	);

	it.each(["get", "post"] as const)(
		"blocks non-admin %s access",
		async (method) => {
			const { agent, login, fetchSpy } = setup("user");
			await login();
			await agent[method](path).expect(403);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		},
	);

	it.each(["get", "post"] as const)(
		"blocks expired sessions on %s",
		async (method) => {
			const { agent, form, fetchSpy, exp } = setup();
			const { csrfToken } = await form();
			vi.spyOn(Date, "now").mockReturnValue(exp * 1000 + 1);
			await agent[method](path)
				.type("form")
				.send({ ...input, csrfToken })
				.expect(303)
				.expect("Location", "/login");
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		},
	);

	it.each([undefined, "wrong", ["a", "b"]])(
		"rejects invalid CSRF %j before calling the API",
		async (token) => {
			const { agent, form, fetchSpy } = setup();
			await form();
			vi.spyOn(console, "warn").mockImplementation(() => {});
			const response = await agent
				.post(path)
				.type("form")
				.send({
					...input,
					...(token === undefined ? {} : { csrfToken: token }),
				})
				.expect(403);
			expect(response.text).toContain("Invalid form session");
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		},
	);

	it("rejects another session's CSRF token", async () => {
		const { app, agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		const other = request.agent(app);
		await other.post("/login").type("form").send(credentials).expect(303);
		await other.get(path).expect(200);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await other
			.post(path)
			.type("form")
			.send({ ...input, csrfToken })
			.expect(403);
		expect(fetchSpy).toHaveBeenCalledTimes(4);
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
		{ price: "21474836.48" },
		{ stock: "" },
		{ stock: "-1" },
		{ stock: "1.5" },
		{ stock: "1e2" },
		{ stock: "12abc" },
		{ stock: "NaN" },
		{ stock: "2147483648" },
		{ stock: ["1", "2"] },
	])(
		"rejects invalid fields %j and preserves input without calling the API",
		async (changes) => {
			const { agent, form, fetchSpy } = setup();
			const { csrfToken } = await form();
			const response = await agent
				.post(path)
				.type("form")
				.send({ ...input, ...changes, csrfToken })
				.expect(400);
			expect(response.text).toContain("Please fix the errors below.");
			expect(response.text).toContain('aria-invalid="true"');
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		},
	);

	it("requires the full set of fields", async () => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		const response = await agent
			.post(path)
			.type("form")
			.send({ name: input.name, csrfToken })
			.expect(400);
		for (const field of ["description", "category", "price", "stock"]) {
			expect(response.text).toContain(`href="#product-${field}"`);
		}
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("escapes prefilled and submitted values", async () => {
		const { agent, login, fetchSpy } = setup();
		await login();
		fetchSpy.mockResolvedValue(
			Response.json({
				...product,
				name: '<script>alert("bad")</script>',
				description: "</textarea><script>bad()</script>",
			}),
		);
		const page = await agent.get(path).expect(200);
		expect(page.text).toContain("&lt;script&gt;");
		expect(page.text).not.toContain("<script>bad()");
		const response = await agent
			.post(path)
			.type("form")
			.send({
				...input,
				name: "<script>bad()</script>",
				price: "",
				csrfToken: csrf(page.text),
			})
			.expect(400);
		expect(response.text).toContain("&lt;script&gt;bad()&lt;/script&gt;");
	});

	it("displays backend stock errors and retains submitted values", async () => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockResolvedValue(
			Response.json(
				{
					fieldErrors: { stock: "Stock cannot be changed right now" },
				},
				{ status: 400 },
			),
		);
		const response = await agent
			.post(path)
			.type("form")
			.send({ ...input, csrfToken })
			.expect(400);
		expect(response.text).toContain("Stock cannot be changed right now");
		expect(response.text).toContain('value="25"');
		expect(response.text).toContain('href="#product-stock"');
	});

	it.each([401, 403, 404, 500, 201])(
		"handles update status %s without claiming success",
		async (status) => {
			const { agent, form, fetchSpy } = setup();
			const { csrfToken } = await form();
			fetchSpy.mockResolvedValue(new Response(null, { status }));
			vi.spyOn(console, "error").mockImplementation(() => {});
			const response = await agent
				.post(path)
				.type("form")
				.send({ ...input, csrfToken })
				.expect(
					status === 401 ? 303 : [403, 404].includes(status) ? status : 502,
				);
			expect(response.text).not.toContain("Product updated successfully.");
			if (status === 401) {
				expect(response.headers.location).toBe("/login");
				await agent.get("/admin").expect(303).expect("Location", "/login");
			} else if (status === 404) {
				expect(response.text).toContain("Product not found");
				expect(response.text).not.toContain('name="stock"');
			} else if (status === 403) {
				expect(response.text).toContain("Not allowed");
			} else {
				expect(response.text).toContain(
					"Check the catalogue before trying again",
				);
				expect(response.text).toContain('value="Updated Maple Cue"');
			}
		},
	);

	it.each([
		{ status: 200, body: {} },
		{ status: 200, body: { ...updatedProduct, id: "wrong" } },
		{ status: 200, body: { ...updatedProduct, stock: "25" } },
		{ status: 200, body: { ...updatedProduct, price: 99 } },
		{ status: 400, body: { fieldErrors: {} } },
		{ status: 400, body: { fieldErrors: { stock: 123 } } },
		{ status: 400, body: { fieldErrors: { unknown: "Error" } } },
	])("rejects malformed update response %j", async ({ status, body }) => {
		const { agent, form, fetchSpy } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockResolvedValue(Response.json(body, { status }));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await agent
			.post(path)
			.type("form")
			.send({ ...input, csrfToken })
			.expect(502);
	});

	it.each([404, 500])(
		"handles load status %s without showing an empty edit form",
		async (status) => {
			const { agent, login, fetchSpy } = setup();
			await login();
			fetchSpy.mockResolvedValue(new Response(null, { status }));
			vi.spyOn(console, "error").mockImplementation(() => {});
			const response = await agent.get(path).expect(status === 404 ? 404 : 502);
			expect(response.text).toContain('role="alert"');
			expect(response.text).not.toContain('name="stock"');
		},
	);

	it.each([{}, { ...product, stock: -1 }, { ...product, id: "wrong" }])(
		"rejects malformed product details %j",
		async (body) => {
			const { agent, login, fetchSpy } = setup();
			await login();
			fetchSpy.mockResolvedValue(Response.json(body));
			vi.spyOn(console, "error").mockImplementation(() => {});
			await agent.get(path).expect(502);
		},
	);

	it("handles network failures explicitly without logging the JWT", async () => {
		const { agent, form, fetchSpy, accessToken } = setup();
		const { csrfToken } = await form();
		fetchSpy.mockRejectedValue(new Error("network unavailable"));
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await agent
			.post(path)
			.type("form")
			.send({ ...input, csrfToken })
			.expect(502);
		expect(response.text).toContain("Check the catalogue before trying again");
		await agent.get(path).expect(502);
		expect(log).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(log.mock.calls)).not.toContain(accessToken);
	});
});

describe("Product editing boundaries", () => {
	it.each(["0", "1", "2147483647"])("accepts stock %s", (stock) => {
		expect(validateProductEditInput({ ...input, stock }).fieldErrors).toEqual(
			{},
		);
	});
	it("accepts zero price and maximum text lengths", () => {
		expect(
			validateProductEditInput({
				name: "n".repeat(200),
				description: "d".repeat(2000),
				category: "c".repeat(100),
				price: "0",
				stock: "0",
			}).fieldErrors,
		).toEqual({});
	});
	it("trims all five fields", () => {
		const padded = Object.fromEntries(
			Object.entries(input).map(([field, value]) => [field, ` ${value} `]),
		);
		expect(validateProductEditInput(padded)).toEqual({
			values: input,
			fieldErrors: {},
		});
	});
});
