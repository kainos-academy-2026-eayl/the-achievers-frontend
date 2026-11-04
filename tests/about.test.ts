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
		expect(response.text).toContain("Jack Luter");
		expect(response.text).toContain("Antidisestablishmentarianism Zacharska");
		expect(response.text).toContain("Ryan Doherty");
		expect(response.text).toContain("Sophia Toner");
	});

	it("should display team member roles", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Larper");
		expect(response.text).toContain("Not-Knower");
		expect(response.text).toContain("Scroller");
		expect(response.text).toContain("Slacker");
	});

	it("should display team member biographies", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("master of none");
		expect(response.text).toContain("master of scrolling");
		expect(response.text).toContain("staying off");
		expect(response.text).toContain("true team player");
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
		expect(response.text).toContain("/css/images/Jack.jpeg");
		expect(response.text).toContain("/css/images/Amazon.jpeg");
		expect(response.text).toContain("/css/images/Ryan.jpeg");
		expect(response.text).toContain("/css/images/Sophilar.jpeg");
	});

	it("should have correct page title", async () => {
		const app = createApp();
		const response = await request(app).get("/about");

		expect(response.status).toBe(200);
		expect(response.text).toContain("About Us | Cue Corner");
	});
});
