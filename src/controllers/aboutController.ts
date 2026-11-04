import { Router } from "express";

const title = "About Us | Cue Corner";

interface TeamMember {
	name: string;
	role: string;
	bio: string;
	image: string;
}

const teamMembers: TeamMember[] = [
	{
		name: "Jack Luter",
		role: "Larper",
		bio: "Jack the Larper master of none, has created 3 skills and believes he has mastered them all.",
		image: "/css/images/Jack.jpeg",
	},
	{
		name: "Antidisestablishmentarianism Zacharska",
		role: "Not-Knower",
		bio: "Antidisestablishmentarianism sure is there, sometimes.",
		image: "/css/images/Amazon.jpeg",
	},
	{
		name: "Ryan Doherty",
		role: "Scroller",
		bio: "A master of scrolling up and down. Is a true team player especially when it comes to fulfilling 3 wishes.",
		image: "/css/images/Ryan.jpeg",
	},
	{
		name: "Sophia Toner",
		role: "Slacker",
		bio: "Sophia's passion for staying off has made her a valuable assest of the team (when she turns up).",
		image: "/css/images/Sophilar.jpeg",
	},
];

export function createAboutRouter(): Router {
	const router = Router();

	router.get("/", (_req, res) => {
		res.render("about", {
			title,
			teamMembers,
		});
	});

	return router;
}
