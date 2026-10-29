import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { ProfileApiError } from "../src/clients/profileClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

const profile = {
    name: "Customer",
    email: "customer@example.com",
    phone: "07123456789",
    addressLine1: "1 Cue Street",
    addressLine2: null,
    city: "Belfast",
    postcode: "BT1 1AA",
    createdAt: "2026-01-01T00:00:00.000Z",
};

const validForm = {
    name: "New Name",
    email: "customer@example.com",
    phone: "07123 456789",
    addressLine1: "2 Snooker Road",
    addressLine2: "",
    city: "Belfast",
    postcode: "BT2 2BB",
    currentPassword: "CurrentPassword123",
};

function token(overrides: Record<string, unknown> = {}) {
	const claims = {
		sub: "1",
		iss: "the-achievers-backend",
		aud: "the-achievers-api",
		role: "user",
		exp: Math.floor(Date.now() / 1000) + 3600,
		...overrides,
	};
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
	return `${header}.${payload}.test-signature`;
}

function setup() {
    const profiles = {
        get: vi.fn(async (_token: string) => profile),
        update: vi.fn(async (_token: string, update: typeof validForm) => ({
            ...profile,
            ...update,
        })),
    };
    const app = createApp(
        new ProductService({ getAll: async () => [] }),
        new CartService({
            get: async () => ({ items: [] }),
            add: async () => { },
            update: async () => { },
            remove: async () => { },
        }),
        profiles,
    );
    return { app, profiles, agent: request.agent(app) };
}

async function logIn(agent: ReturnType<typeof request.agent>) {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
            JSON.stringify({
                accessToken: token(),
                tokenType: "Bearer",
                expiresIn: 3600,
                user: {
                    email: profile.email,
                    name: profile.name,
                    createdAt: profile.createdAt,
                },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await agent
        .post("/login")
        .type("form")
        .send({ email: profile.email, password: "LongEnoughPassword123" })
        .expect(303);
}

afterEach(() => vi.restoreAllMocks());

describe("Customer profile", () => {
    it("shows the logged-in customer's profile", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);

        const response = await agent.get("/profile");

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.text).toContain('value="Customer"');
        expect(response.text).toContain('value="customer@example.com"');
        expect(response.text).toContain('value="07123456789"');
        expect(response.text).toContain('value="1 Cue Street"');
        expect(response.text).toContain('value="BT1 1AA"');
        expect(profiles.get).toHaveBeenCalledWith(expect.any(String));
    });

    it("asks logged-out visitors to log in", async () => {
        const { app, profiles } = setup();

        for (const response of [
            await request(app).get("/profile"),
            await request(app).post("/profile").type("form").send(validForm),
        ]) {
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe("/login");
        }
        expect(profiles.get).not.toHaveBeenCalled();
        expect(profiles.update).not.toHaveBeenCalled();
    });

    it("saves valid changes and shows them straight away", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);

        await agent
            .post("/profile")
            .type("form")
            .send(validForm)
            .expect(303)
            .expect("Location", "/profile?updated=1");
        expect(profiles.update).toHaveBeenCalledWith(
            expect.any(String),
            validForm,
        );

        profiles.get.mockResolvedValueOnce({ ...profile, name: "New Name" });
        const after = await agent.get("/profile?updated=1");
        expect(after.text).toContain("Your profile has been updated.");
        expect(after.text).toContain('value="New Name"');
        expect(after.text).toContain("Signed in as New Name");
    });

    it("shows field errors and keeps what the customer typed", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.update.mockRejectedValueOnce(
            new ProfileApiError(400, {
                phone: "Enter a valid UK phone number, for example 07123 456789",
                postcode: "Enter a valid UK postcode, for example SW1A 1AA",
            }),
        );

        const response = await agent
            .post("/profile")
            .type("form")
            .send({ ...validForm, phone: "12345", postcode: "NOPE" });

        expect(response.status).toBe(400);
        expect(response.text).toContain(
            "Your changes have not been saved. Please fix the errors below.",
        );
        expect(response.text).toContain(
            "Enter a valid UK phone number, for example 07123 456789",
        );
        expect(response.text).toContain(
            "Enter a valid UK postcode, for example SW1A 1AA",
        );
        expect(response.text).toContain('value="12345"');
        expect(response.text).toContain('value="NOPE"');
        expect(response.text).toContain('aria-invalid="true"');
    });

    it("asks for the correct current password before saving", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.update.mockRejectedValueOnce(
            new ProfileApiError(400, {
                currentPassword: "Your current password is incorrect",
            }),
        );

        const response = await agent
            .post("/profile")
            .type("form")
            .send({ ...validForm, currentPassword: "WrongPassword123" });

        expect(response.status).toBe(400);
        expect(response.text).toContain("Your current password is incorrect");
        expect(response.text).toContain(
            "Enter your current password to save any changes.",
        );
        expect(response.text).not.toContain("WrongPassword123");
    });

    it("tells the customer when the email is already taken", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.update.mockRejectedValueOnce(
            new ProfileApiError(409, {
                email: "An account with this email already exists",
            }),
        );

        const response = await agent
            .post("/profile")
            .type("form")
            .send({
                ...validForm,
                email: "taken@example.com",
                currentPassword: "secret-password",
            });

        expect(response.status).toBe(409);
        expect(response.text).toContain(
            "An account with this email already exists",
        );
        expect(response.text).not.toContain("secret-password");
    });

    it("treats an expired backend token as logged out", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.get.mockRejectedValueOnce(new ProfileApiError(401));

        const response = await agent.get("/profile");

        expect(response.status).toBe(401);
        expect(response.text).toContain("Please log in to view your profile.");
    });

    it("shows an error when the profile service is unavailable", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        vi.spyOn(console, "error").mockImplementation(() => { });
        profiles.get.mockRejectedValueOnce(new Error("backend down"));

        const response = await agent.get("/profile");

        expect(response.status).toBe(502);
        expect(response.text).toContain("We can't load your profile right now.");
    });
});
