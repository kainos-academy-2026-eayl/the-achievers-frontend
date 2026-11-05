import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { ProductClient } from "../src/clients/productClient";
import { ProductService } from "../src/services/productService";

const credentials = {
	email: "admin@example.com",
	password: "Test-password-123!",
};
const imageId = "img-1";
const product = {
	id: "test-product",
	name: "Maple Cue",
	description: "A balanced maple cue.",
	category: "Cues",
	price: 89.99,
	stock: 10,
	rating: null,
	reviewCount: 0,
	images: [
		{
			id: imageId,
			url: `/api/products/test-product/images/${imageId}`,
			contentType: "image/png",
		},
	],
};
const path = `/admin/products/${product.id}/edit`;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function csrf(html: string): string {
	const value = html.match(/name="csrfToken" value="([a-f0-9]+)"/)?.[1];
	if (!value) throw new Error("Missing editing CSRF token");
	return value;
}

function jwt(role: string): string {
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return [
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
}

type ImageHandler = (url: string, init?: RequestInit) => Response;

function setup(imageHandler: ImageHandler = () => new Response(null, { status: 201 })) {
	const fetchSpy = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (url, init) => {
			const target = String(url);
			if (target.endsWith("/api/login")) {
				return Response.json({
					accessToken: jwt("admin"),
					tokenType: "Bearer",
					expiresIn: 3600,
					user: {
						name: "Admin",
						email: credentials.email,
						createdAt: "2026-01-01T00:00:00Z",
					},
				});
			}
			if (target.endsWith(`/api/products/${product.id}`)) {
				return Response.json(product);
			}
			return imageHandler(target, init);
		});
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
	async function csrfToken() {
		await login();
		const response = await agent.get(path).expect(200);
		return csrf(response.text);
	}
	return { app, agent, fetchSpy, login, csrfToken };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("product image upload", () => {
	it("uploads a valid image and redirects with a success notice", async () => {
		const { agent, fetchSpy, csrfToken } = setup();
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images`)
			.field("csrfToken", token)
			.attach("image", png, { filename: "cue.png", contentType: "image/png" })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?image=uploaded`);
		const upload = fetchSpy.mock.calls.find(([url]) =>
			String(url).endsWith(`/api/products/${product.id}/images`),
		);
		expect(upload?.[1]?.method).toBe("POST");
	});

	it("shows an error when no file is chosen", async () => {
		const { agent, fetchSpy, csrfToken } = setup();
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images`)
			.field("csrfToken", token)
			.expect(303);

		expect(
			fetchSpy.mock.calls.some(
				([url, init]) =>
					String(url).includes("/images") && init?.method === "POST",
			),
		).toBe(false);
	});

	it("maps a backend rejection of the file type to an unsupported-format error", async () => {
		const { agent, csrfToken } = setup(
			() => Response.json({ errors: {} }, { status: 400 }),
		);
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images`)
			.field("csrfToken", token)
			.attach("image", Buffer.from("GIF89a"), {
				filename: "cue.gif",
				contentType: "image/gif",
			})
			.expect(303);

		expect(response.headers.location).toBe(`${path}?imageError=unsupported`);
	});

	it("maps an oversized upload to a too-large error", async () => {
		const { agent, csrfToken } = setup(
			() => new Response(null, { status: 413 }),
		);
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images`)
			.field("csrfToken", token)
			.attach("image", png, { filename: "cue.png", contentType: "image/png" })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?imageError=too-large`);
	});

	it("rejects a missing CSRF token without calling the backend", async () => {
		const { agent, fetchSpy, csrfToken } = setup();
		await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images`)
			.attach("image", png, { filename: "cue.png", contentType: "image/png" })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?imageError=invalid-form`);
		expect(
			fetchSpy.mock.calls.some(
				([url, init]) =>
					String(url).includes("/images") && init?.method === "POST",
			),
		).toBe(false);
	});
});

describe("product image replace and remove", () => {
	it("replaces an image and redirects with a success notice", async () => {
		const { agent, fetchSpy, csrfToken } = setup(
			() => Response.json({ id: imageId }, { status: 200 }),
		);
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images/${imageId}/replace`)
			.field("csrfToken", token)
			.attach("image", png, { filename: "new.png", contentType: "image/png" })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?image=replaced`);
		expect(
			fetchSpy.mock.calls.some(
				([url, init]) =>
					String(url).endsWith(`/images/${imageId}`) &&
					init?.method === "PUT",
			),
		).toBe(true);
	});

	it("removes an image and redirects with a success notice", async () => {
		const { agent, fetchSpy, csrfToken } = setup(
			() => new Response(null, { status: 204 }),
		);
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images/${imageId}/delete`)
			.type("form")
			.send({ csrfToken: token })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?image=removed`);
		expect(
			fetchSpy.mock.calls.some(
				([url, init]) =>
					String(url).endsWith(`/images/${imageId}`) &&
					init?.method === "DELETE",
			),
		).toBe(true);
	});

	it("reports a missing image as not found", async () => {
		const { agent, csrfToken } = setup(
			() => new Response(null, { status: 404 }),
		);
		const token = await csrfToken();

		const response = await agent
			.post(`/admin/products/${product.id}/images/${imageId}/delete`)
			.type("form")
			.send({ csrfToken: token })
			.expect(303);

		expect(response.headers.location).toBe(`${path}?imageError=not-found`);
	});
});

describe("product image display", () => {
	it("lists existing images on the edit page", async () => {
		const { agent, csrfToken } = setup();
		await csrfToken();

		const response = await agent.get(`${path}?image=uploaded`).expect(200);

		expect(response.text).toContain(
			`/media/products/${product.id}/images/${imageId}`,
		);
		expect(response.text).toContain("Image uploaded.");
		expect(response.text).toContain('accept="image/jpeg,image/png,image/webp"');
	});

	it("shows the product photo on the shop tile", async () => {
		const { app } = setup();

		const response = await request(app).get("/shop").expect(200);

		expect(response.text).toContain(
			`src="/media/products/${product.id}/images/${imageId}"`,
		);
		expect(response.text).toContain('class="product-details-trigger"');
		expect(response.text).toContain(`data-product-id="${product.id}"`);
	});

	it("proxies image bytes with no-cache and a fixed content type", async () => {
		const { app } = setup((url) => {
			if (url.endsWith(`/images/${imageId}`)) {
				return new Response(png, {
					status: 200,
					headers: { "content-type": "image/png" },
				});
			}
			return new Response(null, { status: 500 });
		});

		const response = await request(app)
			.get(`/media/products/${product.id}/images/${imageId}`)
			.expect(200);

		expect(response.headers["content-type"]).toBe("image/png");
		expect(response.headers["cache-control"]).toBe("no-cache");
		expect(response.headers["x-content-type-options"]).toBe("nosniff");
	});

	it("returns 404 from the proxy when the image does not exist", async () => {
		const { app } = setup(() => new Response(null, { status: 404 }));

		await request(app)
			.get(`/media/products/${product.id}/images/missing`)
			.expect(404);
	});
});
