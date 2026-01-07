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
