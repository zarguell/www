/**
 * Links data file
 * Organized by category for easy editing
 */

export interface Link {
	title: string;
	url: string;
	description: string;
}

export interface LinkCategory {
	name: string;
	links: Link[];
}

export interface CoolFind {
	title: string;
	url: string;
	description: string;
	date: string;
	tags: string[];
}

export const linksData: LinkCategory[] = [
	{
		name: "Social",
		links: [
			{
				title: "GitHub",
				url: "https://github.com/zarguell",
				description: "Code repositories and open source",
			},
			{
				title: "LinkedIn",
				url: "https://www.linkedin.com/in/zarguell/",
				description: "Professional networking",
			},
			{
				title: "eBird",
				url: "https://ebird.org/profile/MjYxNjc3NA",
				description: "Birdwatching observations and data",
			},
		],
	},
	{
		name: "Projects",
		links: [
			{
				title: "Audio Birdle",
				url: "https://audio-birdle.sechostlab.com",
				description: "(Beta) My experimental bird song guessing game",
			},
			{
				title: "Secret Santa",
				url: "https://secret-santa.useast01.workers.dev/",
				description: "Secret Santa, but in Cloudflare Workers",
			},
			{
				title: "Tia N List",
				url: "https://zarguell.github.io/tia-n-list/",
				description: "My AI/LLM assisted Threat Intel Analyst",
			},
			{
				title: "Cooklang Astro Recipes",
				url: "https://zarguell.github.io/recipes-as-code/",
				description: "Astro based static site for Cooklang recipes. Many recipes scraped via LLM from unstructured Instagram posts.",
			},
		],
	},
];

export function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		return "unknown";
	}
}

export const coolFindsData: CoolFind[] = [
	{
		title: "Budget/Income/Net Worth/FIRE Spreadsheet",
		url: "https://www.reddit.com/r/financialindependence/comments/rwq9qw/i_made_a_new_and_improved_advanced/",
		description: "A reddit post to an amazing Google Sheet for tracking budget, income, net wort, and FIRE projections. Made me realzie you don't need fancy tools, just a well made spreadsheet.",
		date: "2025-01-12",
		tags: ["finance", "tools", "google-sheets"],
	},
	{
		title: "Z.AI Coding Plan Referral",
		url: "https://z.ai/subscribe?ic=9VJT84FJTO",
		description: "My Z.AI referral code, an amazing and cheap coding plan. This is what I use in Claude Code instead of a standard Anthropic subscription. So much power for $3/month.",
		date: "2025-01-12",
		tags: ["llm", "agentic-coding", "referral", "z.ai", "claude-code"],
	},
	{
		title: "Happy Coder",
		url: "https://happy.engineering/",
		description: "A Claude Code client for mobile, with E2EE. What I use to code on the go...a dangerous tool!",
		date: "2025-01-12",
		tags: ["llm", "agentic-coding", "claude-code"],
	},
	{
		title: "Claude Superpowers",
		url: "https://github.com/obra/superpowers",
		description: "Insane upgrade for Claude Code. Implements TDD, subagents and a bunch of QoL improvements out of the box.",
		date: "2025-01-12",
		tags: ["llm", "agentic-coding", "claude-code"],
	},
];
