import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import {
    ResetPasswordApiError,
    ResetPasswordClient,
} from "../src/clients/resetPasswordClient";
import { CartService } from "../src/services/cartService";
import { ProductService } from "../src/services/productService";

const email = "customer@example.com";
const safeWord = "private-safe-word";
const newPassword = "BrandNewPassword123";

function setup() {
    const resetPasswords = {
        verifySafeWord: vi.fn(async (_email: string, _safeWord: string) => true),
        resetPassword: vi.fn(
            async (_email: string, _safeWord: string, _newPassword: string) => { },
        ),
    };
    const app = createApp(
        new ProductService({ getAll: async () => [] }),
        new CartService({
            get: async () => ({ items: [] }),
            add: async () => { },
            update: async () => { },
            remove: async () => { },
        }),
        undefined,
        undefined,
        undefined,
        undefined,
        resetPasswords,
    );
    return { app, resetPasswords };
}

const validReset = { email, safeWord, newPassword, confirmPassword: newPassword };

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("GET /reset-pass", () => {
    it("shows the email and safe word fields first, with the new password fields hidden", async () => {
        const { app } = setup();

        const response = await request(app).get("/reset-pass");

        expect(response.status).toBe(200);
        expect(response.text).toContain('action="/reset-pass/verify" method="post"');
        expect(response.text).toContain(
            'id="safe-word" name="safeWord" type="password"',
        );
        expect(response.text).not.toContain('name="newPassword"');
        expect(response.text).not.toContain('name="confirmPassword"');
        expect(response.text).toMatch(/id="reset-submit"[^>]*>Submit</);
        expect(response.text).not.toContain("<script");
    });
});

describe("POST /reset-pass/verify", () => {
    it("confirms a correct email and safe word", async () => {
        const { app, resetPasswords } = setup();

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send({ email: `  ${email}  `, safeWord });

        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.text).toContain('action="/reset-pass" method="post"');
        expect(response.text).toContain('name="newPassword"');
        expect(response.text).toContain('name="confirmPassword"');
        expect(response.text).toMatch(/name="email"[^>]*readonly/);
        expect(response.text).not.toContain(safeWord);
        expect(resetPasswords.verifySafeWord).toHaveBeenCalledExactlyOnceWith(
            email,
            safeWord,
        );
    });

    it("rejects an incorrect email or safe word with one generic message", async () => {
        const { app, resetPasswords } = setup();
        resetPasswords.verifySafeWord.mockResolvedValueOnce(false);

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send({ email, safeWord: "wrong" });

        expect(response.status).toBe(401);
        expect(response.text).toContain("The email or safe word is incorrect.");
        expect(response.text).not.toContain('name="newPassword"');
    });

    it.each([
        [{ email: "", safeWord }, "Enter your email address."],
        [{ email: "nope", safeWord }, "Enter a valid email address, for example name@example.com."],
        [{ email, safeWord: "" }, "Enter your safe word."],
        [{ email, safeWord: "   " }, "Enter your safe word."],
        [{ email }, "Enter your safe word."],
        [
            { email, safeWord: "a".repeat(129) },
            "Your safe word must be no more than 128 characters long.",
        ],
    ])("rejects invalid details without calling the backend: %j", async (details, message) => {
        const { app, resetPasswords } = setup();

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send(details);

        expect(response.status).toBe(400);
        expect(response.text).toContain(message);
        expect(resetPasswords.verifySafeWord).not.toHaveBeenCalled();
    });

    it("ignores repeated form fields instead of trusting them", async () => {
        const { app, resetPasswords } = setup();

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send("email=a%40example.com&email=b%40example.com&safeWord=x");

        expect(response.status).toBe(400);
        expect(response.text).toContain("Enter your email address.");
        expect(resetPasswords.verifySafeWord).not.toHaveBeenCalled();
    });

    it("passes on a rate limit from the backend", async () => {
        const { app, resetPasswords } = setup();
        resetPasswords.verifySafeWord.mockRejectedValueOnce(
            new ResetPasswordApiError(429),
        );

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send({ email, safeWord });

        expect(response.status).toBe(429);
        expect(response.text).toContain("Too many attempts");
    });

    it.each([
        [new ResetPasswordApiError(500), "Reset password backend returned status 500."],
        [new TypeError("fetch failed"), "Unable to reach the reset password backend."],
    ])("shows a generic error when the backend fails: %s", async (failure, logged) => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
        const { app, resetPasswords } = setup();
        resetPasswords.verifySafeWord.mockRejectedValueOnce(failure);

        const response = await request(app)
            .post("/reset-pass/verify")
            .type("form")
            .send({ email, safeWord });

        expect(response.status).toBe(502);
        expect(response.text).toContain(
            "We couldn&#39;t check your details right now. Please try again.",
        );
        expect(consoleError).toHaveBeenCalledExactlyOnceWith(logged);
    });
});

describe("POST /reset-pass", () => {
    it("resets the password and sends the user to log in", async () => {
        const { app, resetPasswords } = setup();

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send({ ...validReset, email: `  ${email}  ` });

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login?reset=1");
        expect(resetPasswords.resetPassword).toHaveBeenCalledExactlyOnceWith(
            email,
            safeWord,
            newPassword,
        );
    });

    it.each([
        [{ confirmPassword: "SomethingElse12345" }, ["Your passwords do not match."]],
        [
            { newPassword: "short", confirmPassword: "short" },
            ["Your new password must be at least 12 characters long."],
        ],
        [
            { newPassword: "a".repeat(129), confirmPassword: "a".repeat(129) },
            ["Your new password must be no more than 128 characters long."],
        ],
        [
            { newPassword: undefined, confirmPassword: undefined },
            ["Enter a new password.", "Confirm your new password."],
        ],
        [{ email: "nope" }, ["Enter a valid email address, for example name@example.com."]],
        [{ safeWord: "   " }, ["Enter your safe word."]],
    ])("shows the form again for invalid input: %j", async (changes, messages) => {
        const { app, resetPasswords } = setup();

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send({ ...validReset, ...changes });

        expect(response.status).toBe(400);
        for (const message of messages) {
            expect(response.text).toContain(message);
        }
        expect(response.text).toContain("Please fix the following:");
        expect(response.text).not.toMatch(/id="reset-new-password-fields"\s+hidden/);
        expect(response.text).not.toMatch(/name="newPassword"[^>]*\sdisabled/);
        expect(response.text).toMatch(/id="reset-submit"[^>]*>Reset password</);
        expect(response.text).not.toContain(safeWord);
        expect(response.text).not.toContain(newPassword);
        expect(resetPasswords.resetPassword).not.toHaveBeenCalled();
    });

    it("keeps the email but never sends the safe word or passwords back to the page", async () => {
        const { app, resetPasswords } = setup();
        resetPasswords.resetPassword.mockRejectedValueOnce(
            new ResetPasswordApiError(401),
        );

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send(validReset);

        expect(response.status).toBe(401);
        expect(response.text).toContain("The email or safe word is incorrect.");
        expect(response.text).toContain(`value="${email}"`);
        expect(response.text).not.toContain(safeWord);
        expect(response.text).not.toContain(newPassword);
    });

    it("shows the message the backend gives for a rejected password", async () => {
        const { app, resetPasswords } = setup();
        resetPasswords.resetPassword.mockRejectedValueOnce(
            new ResetPasswordApiError(400, "Choose a password you have not used before."),
        );

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send(validReset);

        expect(response.status).toBe(400);
        expect(response.text).toContain("Choose a password you have not used before.");
    });

    it("passes on a rate limit from the backend", async () => {
        const { app, resetPasswords } = setup();
        resetPasswords.resetPassword.mockRejectedValueOnce(
            new ResetPasswordApiError(429),
        );

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send(validReset);

        expect(response.status).toBe(429);
        expect(response.text).toContain("Too many attempts");
    });

    it.each([
        [new ResetPasswordApiError(500), "Reset password backend returned status 500."],
        [new TypeError("fetch failed"), "Unable to reach the reset password backend."],
    ])("shows a generic error when the backend fails: %s", async (failure, logged) => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
        const { app, resetPasswords } = setup();
        resetPasswords.resetPassword.mockRejectedValueOnce(failure);

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send(validReset);

        expect(response.status).toBe(502);
        expect(response.text).toContain(
            "We couldn&#39;t reset your password right now. Please try again.",
        );
        expect(response.text).not.toContain(safeWord);
        expect(response.text).not.toContain(newPassword);
        expect(consoleError).toHaveBeenCalledExactlyOnceWith(logged);
    });

    it("does not cache the response", async () => {
        const { app } = setup();

        const response = await request(app)
            .post("/reset-pass")
            .type("form")
            .send(validReset);

        expect(response.headers["cache-control"]).toBe("no-store");
    });
});

describe("Login after a password reset", () => {
    it("confirms the reset only when the user arrives from the reset form", async () => {
        const { app } = setup();

        const afterReset = await request(app).get("/login?reset=1");
        const plain = await request(app).get("/login");

        expect(afterReset.text).toContain(
            "Your password has been reset. Log in with your new password.",
        );
        expect(plain.text).not.toContain("Your password has been reset.");
        expect(plain.text).toContain("Enter your email and password to sign in.");
    });
});

describe("default backend wiring", () => {
    it("sends the safe word check to the backend at API_BASE_URL", async () => {
        vi.stubEnv("API_BASE_URL", "http://backend.test");
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 204 }));

        const response = await request(createApp())
            .post("/reset-pass/verify")
            .type("form")
            .send({ email, safeWord });

        expect(response.status).toBe(200);
        expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
            "http://backend.test/api/reset-password/verify",
        );
    });
});

describe("ResetPasswordClient", () => {
    const client = new ResetPasswordClient("http://backend.test");

    function mockBackend(status: number, body?: unknown) {
        return vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(body === undefined ? null : JSON.stringify(body), { status }),
        );
    }

    it("checks the safe word with POST /api/reset-password/verify", async () => {
        const fetchSpy = mockBackend(204);

        await expect(client.verifySafeWord(email, safeWord)).resolves.toBe(true);

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(String(url)).toBe("http://backend.test/api/reset-password/verify");
        expect(init).toMatchObject({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, safeWord }),
        });
    });

    it.each([400, 401])("treats a %i from the backend as a failed check", async (status) => {
        mockBackend(status, { error: "No match" });

        await expect(client.verifySafeWord(email, safeWord)).resolves.toBe(false);
    });

    it.each([404, 429, 500])("throws for an unexpected %i when checking", async (status) => {
        mockBackend(status);

        await expect(client.verifySafeWord(email, safeWord)).rejects.toMatchObject({
            name: "Error",
            status,
        });
    });

    it("sends the new password with the safe word to POST /api/reset-password", async () => {
        const fetchSpy = mockBackend(204);

        await expect(
            client.resetPassword(email, safeWord, newPassword),
        ).resolves.toBeUndefined();

        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(String(url)).toBe("http://backend.test/api/reset-password");
        expect(init).toMatchObject({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, safeWord, newPassword }),
        });
    });

    it("keeps the backend's error message when the reset is rejected", async () => {
        mockBackend(400, { error: "  Password is too common.  " });

        const failure = await client
            .resetPassword(email, safeWord, newPassword)
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ResetPasswordApiError);
        expect(failure).toMatchObject({ status: 400, detail: "Password is too common." });
    });

    it("has no message when the backend gives no usable error body", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("<html>Bad gateway</html>", { status: 502 }),
        );

        const failure = await client
            .resetPassword(email, safeWord, newPassword)
            .catch((error: unknown) => error);

        expect(failure).toMatchObject({ status: 502, detail: "" });
    });
});
