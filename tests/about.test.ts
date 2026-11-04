import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("About Us Page", () => {
	it("should render the About Us page successfully", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("About Cue Corner");
	});

	it("should display the mission statement", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Our Mission");
		expect(response.text).toContain(
			"Cue Corner is dedicated to providing players",
		);
	});

	it("should display all four team members", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Alex Thompson");
		expect(response.text).toContain("Sarah Chen");
		expect(response.text).toContain("Marcus Williams");
		expect(response.text).toContain("Emma Davis");
	});

	it("should display team member roles", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Founder &amp; Owner");
		expect(response.text).toContain("Head of Operations");
		expect(response.text).toContain("Product Specialist");
		expect(response.text).toContain("Customer Relations");
	});

	it("should display team member biographies", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("competitive pool experience");
		expect(response.text).toContain("attention to detail");
		expect(response.text).toContain("snooker champion");
		expect(response.text).toContain("customer service");
	});

	it("should display Why Us section with benefits", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Why Choose Cue Corner?");
		expect(response.text).toContain("Expert Knowledge");
		expect(response.text).toContain("Quality Products");
		expect(response.text).toContain("Customer First");
		expect(response.text).toContain("Passion for the Game");
	});

	it("should have navigation link to shop", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Visit the Shop");
		expect(response.text).toContain('href="/shop"');
	});

	it("should include team member images", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("/css/images/team-member-1.png");
		expect(response.text).toContain("/css/images/team-member-2.png");
		expect(response.text).toContain("/css/images/team-member-3.png");
		expect(response.text).toContain("/css/images/team-member-4.png");
	});

	it("should have correct page title", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("About Us | Cue Corner");
	});
});
