import type { RawProduct } from "../models/product";

const products: RawProduct[] = [
	{
		id: "calluminator",
		name: "Calluminator",
		description:
			"The precision automated pool cue. Motorised stroke control and laser-aligned tip deliver repeatable, pin-point accuracy on every shot.",
		category: "Calluminator Range",
		price: 1499.99,
		rating: 4.8,
		reviewCount: 312,
	},
	{
		id: "calluminator-silencer",
		name: "Calluminator Silencer",
		description:
			"Extension for the Calluminator. Dampens motor noise and cue-ball strike for whisper-quiet play in clubs and at home.",
		category: "Calluminator Range",
		price: 129.99,
		rating: 4.6,
		reviewCount: 148,
	},
	{
		id: "calluminator-scope",
		name: "Calluminator Scope",
		description:
			"Extension for the Calluminator. Magnified sighting scope with projected aim line for long pots and tight cuts.",
		category: "Calluminator Range",
		price: 199.99,
		rating: 4.7,
		reviewCount: 203,
	},
	{
		id: "ball-guard-helmet",
		name: "Ball-Guard Safety Helmet",
		description:
			"Lightweight padded helmet with clear visor that protects you from balls that fly off the table.",
		category: "Protective Gear",
		price: 39.99,
		rating: 4.4,
		reviewCount: 87,
	},
	{
		id: "full-body-protector",
		name: "Full Body Protector",
		description:
			"Impact-absorbing chest, arm and shin padding for spectators and players standing in the line of fire.",
		category: "Protective Gear",
		price: 89.99,
		rating: 4.2,
		reviewCount: 54,
	},
	{
		id: "pro-series-maple-cue",
		name: "Pro Series Maple Cue",
		description:
			"57-inch hand-finished maple cue with a 13mm tip and stainless steel joint.",
		category: "Pool Cues",
		price: 89.99,
		rating: 4.5,
		reviewCount: 421,
	},
	{
		id: "carbon-break-cue",
		name: "Carbon Break Cue",
		description:
			"Low-deflection carbon fibre shaft built for powerful, controlled break shots.",
		category: "Pool Cues",
		price: 149.99,
		rating: 4.6,
		reviewCount: 96,
	},
	{
		id: "hard-shell-cue-case",
		name: "Hard Shell Cue Case",
		description:
			"Water-resistant hard case holding two cues, with a padded interior and accessory pocket.",
		category: "Cue Cases",
		price: 49.99,
		rating: 4.3,
		reviewCount: 178,
	},
	{
		id: "tournament-ball-set",
		name: "Tournament Ball Set",
		description:
			"Full set of 16 phenolic resin balls, regulation 2 1/4-inch, matched for weight and balance.",
		category: "Pool Balls",
		price: 64.99,
		rating: 4.7,
		reviewCount: 265,
	},
	{
		id: "training-cue-ball",
		name: "Spot Training Cue Ball",
		description:
			"Cue ball marked with reference dots so you can see spin and contact point on every shot.",
		category: "Pool Balls",
		price: 12.99,
		rating: 4.1,
		reviewCount: 39,
	},
	{
		id: "chalk-tip-kit",
		name: "Chalk & Tip Kit",
		description:
			"Twelve cubes of premium chalk plus replacement tips, a tip shaper and a scuffer.",
		category: "Accessories",
		price: 14.99,
		rating: 4.4,
		reviewCount: 512,
	},
	{
		id: "triangle-rack",
		name: "Wooden Triangle Rack",
		description: "Solid hardwood triangle rack for tight, consistent racks.",
		category: "Accessories",
		price: 12.99,
		rating: 4.0,
		reviewCount: 61,
	},
	{
		id: "table-cover",
		name: "Fitted Pool Table Cover",
		description: null,
		category: "Accessories",
		price: 34.99,
		rating: 4.2,
		reviewCount: 22,
	},
	{
		id: "laser-training-aid",
		name: "Laser Alignment Training Aid",
		description:
			"Clip-on laser that shows whether your cue is travelling straight through the ball.",
		category: "Accessories",
		price: null,
		rating: null,
		reviewCount: 0,
	},
];

export function getProducts(): unknown[] {
	return products;
}
