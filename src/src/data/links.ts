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
		],
	},
];
