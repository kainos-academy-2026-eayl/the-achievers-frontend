import { Router } from "express";

const title = "Contact Us | Cue Corner";

interface ContactInfo {
	method: string;
	value: string;
	icon: string;
}

const contactDetails: ContactInfo[] = [
	{
		method: "Email",
		value: "support@cuecorner.com",
		icon: "envelope",
	},
	{
		method: "Phone",
		value: "+1 (555) 123-4567",
		icon: "phone",
	},
	{
		method: "Address",
		value: "123 Pool Lane, Billiard City, BC 12345",
		icon: "map-pin",
	},
];

export function createContactRouter(): Router {
	const router = Router();

	router.get("/", (_req, res) => {
		res.render("contact", {
			title,
			contactDetails,
		});
	});

	return router;
}
