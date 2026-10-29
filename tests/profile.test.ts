import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import {
    type Profile,
    ProfileApiError,
    type ProfileUpdate,
} from "../src/clients/profileClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

const profile: Profile = {
    name: "Customer",
    email: "customer@example.com",
    phone: "07123456789",
    createdAt: "2026-01-01T00:00:00.000Z",
    homeAddress: {
        label: null,
        addressLine1: "1 Cue Street",
        addressLine2: null,
        city: "Belfast",
        postcode: "BT1 1AA",
    },
    otherAddresses: [
        {
            label: "Work",
            addressLine1: "2 Office Park",
            addressLine2: null,
            city: "Belfast",
            postcode: "BT2 8LA",
        },
    ],
};

const validForm = {
    name: "New Name",
    email: "customer@example.com",
    phone: "07123 456789",
    "home-addressLine1": "2 Snooker Road",
    "home-addressLine2": "",
    "home-city": "Belfast",
    "home-postcode": "BT2 2BB",
    "other0-label": "Mum's house",
    "other0-addressLine1": "3 Green Road",
    "other0-addressLine2": "Flat 1",
    "other0-city": "Lisburn",
    "other0-postcode": "BT27 4AA",
    "other1-label": "",
    "other1-addressLine1": "",
    "other1-addressLine2": "",
    "other1-city": "",
    "other1-postcode": "",
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

const accessToken = token();

function setup() {
    const profiles = {
        get: vi.fn(async (_token: string) => profile),
        update: vi.fn(async (_token: string, update: ProfileUpdate) => ({
            ...profile,
            name: update.name,
            email: update.email,
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
                accessToken,
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
    it("shows personal details, the home address and other addresses", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);

        const response = await agent.get("/profile");

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.text).toContain('value="Customer"');
        expect(response.text).toContain('value="07123456789"');
        expect(response.text).toContain("Home address");
        expect(response.text).toMatch(
            /name="home-addressLine1"[^>]*value="1 Cue Street"/,
        );
        expect(response.text).toMatch(/name="other0-label"[^>]*value="Work"/);
        expect(response.text).toMatch(
            /name="other0-addressLine1"[^>]*value="2 Office Park"/,
        );
        expect(response.text).toMatch(/name="other1-addressLine1"[^>]*value=""/);
        expect(response.text).toContain(
            "If you add this address, address line 1, town or city and postcode are required.",
        );
        expect(response.text).not.toMatch(
            /(Address line 1|Town or city|Postcode) <span class="optional">/,
        );
        expect(response.text).toContain(
            'Address line 2 <span class="optional">(optional)</span>',
        );
        expect(response.text).toContain("Member since January 2026");
        expect(response.text).toContain('href="#addresses"');
        expect(response.text).toMatch(
            /<details class="address-panel">\s*<summary>\s*<span class="address-panel-title">Work<\/span>\s*<span class="address-panel-summary">2 Office Park, BT2 8LA<\/span>/,
        );
        expect(response.text).toMatch(
            /Other address 2<\/span>\s*<span class="address-panel-summary">Not added - click to add/,
        );
        expect(response.text).not.toContain(accessToken);
        expect(profiles.get).toHaveBeenCalledWith(accessToken);
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

    it("sends personal details and all three address slots to the backend", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);

        await agent
            .post("/profile")
            .type("form")
            .send(validForm)
            .expect(303)
            .expect("Location", "/profile?updated=1");
        expect(profiles.update).toHaveBeenCalledWith(accessToken, {
            name: "New Name",
            email: "customer@example.com",
            phone: "07123 456789",
            homeAddress: {
                addressLine1: "2 Snooker Road",
                addressLine2: "",
                city: "Belfast",
                postcode: "BT2 2BB",
            },
            otherAddresses: [
                {
                    label: "Mum's house",
                    addressLine1: "3 Green Road",
                    addressLine2: "Flat 1",
                    city: "Lisburn",
                    postcode: "BT27 4AA",
                },
                {
                    label: "",
                    addressLine1: "",
                    addressLine2: "",
                    city: "",
                    postcode: "",
                },
            ],
            currentPassword: "CurrentPassword123",
        });

        profiles.get.mockResolvedValueOnce({ ...profile, name: "New Name" });
        const after = await agent.get("/profile?updated=1");
        expect(after.text).toContain("Your profile has been updated.");
        expect(after.text).toContain('value="New Name"');
        expect(after.text).toContain("Signed in as New Name");
    });

    it("shows address errors next to the right address and keeps what was typed", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.update.mockRejectedValueOnce(
            new ProfileApiError(400, {
                phone: "Enter a valid UK phone number, for example 07123 456789",
                "homeAddress.postcode":
                    "Enter a valid UK postcode, for example SW1A 1AA",
                "otherAddresses.1.city": "Enter your town or city",
            }),
        );

        const response = await agent
            .post("/profile")
            .type("form")
            .send({
                ...validForm,
                phone: "12345",
                "home-postcode": "NOPE",
                "other1-addressLine1": "4 Side Street",
            });

        expect(response.status).toBe(400);
        expect(response.text).toContain(
            "Your changes have not been saved. Please fix the errors below.",
        );
        expect(response.text).toContain(
            'id="profile-home-postcode-error">Enter a valid UK postcode',
        );
        expect(response.text).toContain(
            'id="profile-other1-city-error">Enter your town or city',
        );
        expect(response.text).toContain(
            "Enter a valid UK phone number, for example 07123 456789",
        );
        expect(response.text).toMatch(/name="home-postcode"[^>]*value="NOPE"/);
        expect(response.text).toMatch(
            /name="other1-addressLine1"[^>]*value="4 Side Street"/,
        );
        expect(response.text).toContain('aria-invalid="true"');
        expect(response.text).toContain(
            '<details class="address-panel has-error" open>',
        );
    });

    it("shows the address limit message", async () => {
        const { agent, profiles } = setup();
        await logIn(agent);
        profiles.update.mockRejectedValueOnce(
            new ProfileApiError(400, {
                otherAddresses: "Add a home address before adding other addresses",
            }),
        );

        const response = await agent
            .post("/profile")
            .type("form")
            .send({ ...validForm, "home-addressLine1": "", "home-city": "" });

        expect(response.status).toBe(400);
        expect(response.text).toContain(
            "Add a home address before adding other addresses",
        );
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
