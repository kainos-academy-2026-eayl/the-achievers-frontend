import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("Contact Us Page", () => {
	it("should render the Contact Us page successfully", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Contact Us");
	});

	it("should display the page heading", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Contact Us");
		expect(response.text).toContain(
			"We're here to help and answer any questions you might have",
		);
	});

	it("should display all contact information", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Email");
		expect(response.text).toContain("support@cuecorner.com");
		expect(response.text).toContain("Phone");
		expect(response.text).toContain("+1 (555) 123-4567");
		expect(response.text).toContain("Address");
		expect(response.text).toContain("123 Pool Lane, Billiard City, BC 12345");
	});

	it("should display Get in Touch introduction section", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Get in Touch");
		expect(response.text).toContain("Have questions about our products");
	});

	it("should display Contact Information heading", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Contact Information");
	});

	it("should display Response Times section", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Response Times");
		expect(response.text).toContain("Email Inquiries");
		expect(response.text).toContain("Phone Support");
		expect(response.text).toContain("In-Person");
	});

	it("should display response time details", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("24-48 business hours");
		expect(response.text).toContain("Monday to Friday, 9am-5pm");
	});

	it("should have navigation link to shop", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Visit the Shop");
		expect(response.text).toContain('href="/shop"');
	});

	it("should have correct page title", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("Contact Us | Cue Corner");
	});

	it("should render SVG icons for contact methods", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("<svg");
		expect(response.text).toContain("viewBox");
	});

	it("should have accessible heading structure", async () => {
		const app = createApp();
		const response = await request(app).get("/contact");

		expect(response.status).toBe(200);
		expect(response.text).toContain("<h1");
		expect(response.text).toContain("<h2");
		expect(response.text).toContain("<h3");
	});
});
