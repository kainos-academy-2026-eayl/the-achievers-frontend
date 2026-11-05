import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("Terms & Conditions Page", () => {
	it("should render the terms page successfully", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Terms & Conditions");
	});

	it("should display page title", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("Terms &amp; Conditions | Cue Corner");
	});

	it("should display all terms sections", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("The Calluminator Disclaimer");
		expect(response.text).toContain("Refund Policy");
		expect(response.text).toContain("Support & Liability");
		expect(response.text).toContain("Responsible Use");
		expect(response.text).toContain("Use of Website");
	});

	it("should display Calluminator disclaimer content", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain(
			"Shots you miss with the Calluminator"
		);
		expect(response.text).toContain(
			"Injuries sustained while pretending to be a professional player"
		);
		expect(response.text).toContain("Your ego when you lose");
	});

	it("should display refund policy content", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("We do not provide refunds. Ever.");
		expect(response.text).toContain("Mercury is in retrograde");
	});

	it("should display support and liability content", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain(
			"Cue Corner provides zero customer support for"
		);
		expect(response.text).toContain("pool hall drama");
	});

	it("should display responsible use section", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("Responsible Use");
		expect(response.text).toContain(
			"Swinging cues recklessly at other patrons"
		);
	});

	it("should display website usage terms", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("Use of Website");
		expect(response.text).toContain(
			"Betting money you can't afford to lose"
		);
		expect(response.text).toContain(
			"we barely tolerate each other"
		);
	});

	it("should be accessible from footer link", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.text).toContain("Terms &amp; Conditions");
		expect(response.text).toContain('href="/terms"');
	});

	it("should have proper HTML structure", async () => {
		const app = createApp();
		const response = await request(app).get("/terms");

		expect(response.text).toContain("<h1 id=\"terms-hero-title\">Terms & Conditions</h1>");
		expect(response.text).toContain("<article class=\"terms-card\">");
		expect(response.text).toContain("<ul>");
		expect(response.text).toContain("<li>");
	});
});
