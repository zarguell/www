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
				title: "Twitter / X",
				url: "https://twitter.com",
				description: "Microblogging, but make it fashion",
			},
			{
				title: "GitHub",
				url: "https://github.com",
				description: "Code repositories and open source",
			},
			{
				title: "LinkedIn",
				url: "https://linkedin.com",
				description: "Professional networking (occasionally)",
			},
		],
	},
	{
		name: "Code",
		links: [
			{
				title: "Astro",
				url: "https://astro.build",
				description: "The web framework for content-driven websites",
			},
			{
				title: "MDN Web Docs",
				url: "https://developer.mozilla.org",
				description: "The best web development documentation",
			},
			{
				title: "CSS Tricks",
				url: "https://css-tricks.com",
				description: "Daily articles about CSS and web design",
			},
		],
	},
	{
		name: "Writing",
		links: [
			{
				title: "Robin Sloan",
				url: "https://www.robinsloan.com",
				description: "Writing about technology and creativity",
			},
			{
				title: "Hacker News",
				url: "https://news.ycombinator.com",
				description: "Tech news and discussion (with grain of salt)",
			},
			{
				title: "Matt Levine",
				url: "https://www.bloomberg.com/opinion/authors/AfG0Rk59nY6Mm9hMmQMmQw",
				description: "Money Stuff newsletter (finance explained well)",
			},
		],
	},
	{
		name: "Other",
		links: [
			{
				title: "GeoCities Archive",
				url: "http://www.geocities.ws/",
				description: "Archived GeoCities pages - internet history",
			},
			{
				title: "Internet Archive",
				url: "https://archive.org",
				description: "Wayback Machine and digital library",
			},
			{
				title: "Awwwards",
				url: "https://www.awwwards.com",
				description: "Website design awards and inspiration",
			},
		],
	},
];
