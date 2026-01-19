/**
 * Tools data file
 * Organized by category with metadata including last modified dates
 */

export interface Tool {
	title: string;
	slug: string;
	description: string;
	badge: string;
	features: string[];
	lastModified: string; // ISO date string
}

export interface ToolCategory {
	name: string;
	id: string;
	description: string;
	tools: Tool[];
}

export const toolsData: ToolCategory[] = [
	{
		name: "Retirement Planning",
		id: "retirement",
		description: "Plan your financial independence with sophisticated projections and withdrawal strategies.",
		tools: [
			{
				title: "401(k) Calculator",
				slug: "401k-calculator",
				description: "Plan your retirement with our compound interest calculator. See how your contributions grow over time.",
				badge: "RETIREMENT",
				features: [
					"Salary-based contributions",
					"Employer match included",
					"Annual return projections",
					"Multi-year growth charts",
				],
				lastModified: "2025-12-15",
			},
			{
				title: "Monte Carlo Retirement Lab",
				slug: "monte-carlo",
				description: "Simulate thousands of retirement scenarios to see sequence-of-returns risk in action. Understand the probability of success and see worst-case outcomes.",
				badge: "PYTHON",
				features: [
					"1,000+ simulation paths",
					"Correlated stock/bond returns",
					"Success rate at age 95",
					"Median & percentile projections",
					"Dual charts: paths + histogram",
				],
				lastModified: "2025-12-20",
			},
			{
				title: "Safe Withdrawal Rate Comparison",
				slug: "safe-withdrawal",
				description: "Compare three withdrawal strategies: constant dollar, percentage of portfolio, and dynamic guardrails. See which approach balances stability and flexibility.",
				badge: "PYTHON",
				features: [
					"Constant $ withdrawal (inflation-adjusted)",
					"Percentage of portfolio method",
					"Guardrails with +/- 20% bands",
					"Success rate comparison",
					"Withdrawal volatility analysis",
				],
				lastModified: "2025-12-18",
			},
		],
	},
	{
		name: "Investment Analysis",
		id: "investment",
		description: "Understand how costs, timing, and asset allocation impact long-term wealth building.",
		tools: [
			{
				title: "Expense Ratio Impact Visualizer",
				slug: "expense-ratio",
				description: "See the long-term cost of high expense ratios. Compare two funds side-by-side and watch how fees compound over decades.",
				badge: "PYTHON",
				features: [
					"Side-by-side fund comparison",
					"30-year fee projections",
					"Cumulative fee bar chart",
					"Wealth lost percentage",
					"Annotated insights",
				],
				lastModified: "2025-12-10",
			},
			{
				title: "Sequence of Returns Explorer",
				slug: "sequence-risk",
				description: "Demonstrate how early retirement returns matter more than late returns. Compare good-early vs bad-early scenarios with identical average returns.",
				badge: "PYTHON",
				features: [
					"4 return sequence scenarios",
					"Good early vs bad early",
					"Steady vs random walk",
					"Final wealth comparison table",
					"Visual sequence impact",
				],
				lastModified: "2025-12-12",
			},
		],
	},
	{
		name: "Tax & Strategy",
		id: "tax",
		description: "Optimize your tax-advantaged accounts and find your path to financial independence.",
		tools: [
			{
				title: "Roth vs Taxable Calculator",
				slug: "roth-calculator",
				description: "Compare Backdoor Roth, Taxable Brokerage, and Cash side-by-side with realistic tax modeling. See which strategy delivers the most spendable wealth at retirement, with Python-powered calculations running directly in your browser.",
				badge: "RETIREMENT",
				features: [
					"Three-scenario comparison (Roth/Taxable/Cash)",
					"Tax drag + capital gains modeling",
					"Pro-rata rule warnings",
					"Dual charts: balances & taxes paid",
					"Auto-generated insights",
				],
				lastModified: "2025-12-22",
			},
			{
				title: "Traditional vs Roth Analyzer",
				slug: "trad-vs-roth",
				description: "Compare Traditional and Roth IRA outcomes across different future tax rates. See the break-even point and make informed decisions.",
				badge: "PYTHON",
				features: [
					"Tax rate sensitivity analysis",
					"Side-by-side comparison",
					"Break-even visualization",
					"Shaded win regions",
					"Clear decision framework",
				],
				lastModified: "2025-12-08",
			},
			{
				title: "Savings Rate to FI Calculator",
				slug: "savings-rate-fi",
				description: "See the powerful relationship between savings rate and time to financial independence. Small changes in savings rate dramatically accelerate FI.",
				badge: "PYTHON",
				features: [
					"Savings rate vs years to FI",
					"Your rate highlighted",
					"FI target calculation",
					"Interactive-style plot",
					"Goal tracking insights",
				],
				lastModified: "2025-12-05",
			},
		],
	},
	{
		name: "Finance",
		id: "finance",
		description: "Credit card rewards analysis, expense splitting, and personal finance tools.",
		tools: [
			{
				title: "SplitCheck",
				slug: "splitcheck",
				description: "Split expenses with friends and calculate who owes who. Track shared expenses for trips, dinners, or group activities with automatic settlement calculations.",
				badge: "FINANCE",
				features: [
					"Add people and track expenses",
					"Even split or custom amounts",
					"Automatic balance calculations",
					"Optimized settlement suggestions",
					"Shareable view/manage links",
				],
				lastModified: "2026-01-09",
			},
			{
				title: "Bilt 2.0 Break-Even Calculator",
				slug: "bilt-breakeven",
				description: "Analyze the rumored Bilt Card 2.0 point structure. Calculate break-even spending levels, net annual value, and compare against alternative cards with Python-powered visualizations.",
				badge: "PYTHON",
				features: [
					"Transaction fee vs rewards analysis",
					"Annual points cap modeling",
					"Break-even spending calculation",
					"Net value vs alternatives comparison",
					"Interactive break-even chart",
				],
				lastModified: "2026-01-06",
			},
		],
	},
	{
		name: "Visualization",
		id: "visualization",
		description: "Create visual representations of your financial flows and understand where your money goes.",
		tools: [
			{
				title: "Cash Flow Sankey Builder",
				slug: "sankey-builder",
				description: "Create beautiful Sankey diagrams from simple text input. Visualize income, taxes, savings, and expenses in an elegant flow chart.",
				badge: "PYTHON",
				features: [
					"Simple text input format",
					"Auto-generate Sankey diagram",
					"Color-coded flows",
					"Flow validation warnings",
					"Savings rate calculation",
				],
				lastModified: "2025-11-28",
			},
		],
	},
	{
		name: "Text Manipulation",
		id: "text",
		description: "Transform, sanitize, and process text with privacy-focused browser tools.",
		tools: [
			{
				title: "Sanitext",
				slug: "sanitext",
				description: "Privacy-focused, client-side text sanitization tool. Redact sensitive information like emails, phone numbers, SSNs, credit cards, and IP addresses using customizable regex or string replacement rules.",
				badge: "TEXT TOOL",
				features: [
					"Pre-built rules for common PII (emails, phones, SSNs)",
					"Custom regex and string replacement rules",
					"Import/export rule configurations",
					"Real-time sanitization as you type",
					"100% client-side (your text never leaves your browser)",
				],
				lastModified: "2025-12-01",
			},
		],
	},
	{
		name: "Image Tools",
		id: "images",
		description: "Process and analyze images with privacy-focused browser tools.",
		tools: [
			{
				title: "EXIF Explorer & Marker Tool",
				slug: "exif-marker",
				description: "Explore raw EXIF metadata and add custom overlays to your photos. View timestamp, GPS location, camera settings, and all embedded metadata. Create visual metadata overlays with customizable positioning and sizing.",
				badge: "IMAGE TOOL",
				features: [
					"View raw EXIF data (categorized display)",
					"Add metadata overlay to images",
					"Customizable corner position",
					"Adjustable text size (small/medium/large)",
					"Toggle timestamp, location, camera info",
					"Download overlayed image",
					"Privacy-first (runs in browser)",
					"HEIC format support",
				],
				lastModified: "2025-12-19",
			},
			{
				title: "HEIC to JPG/PNG Converter",
				slug: "heic-converter",
				description: "Convert HEIC images to standard JPG or PNG formats. HEIC is Apple's default photo format but isn't widely supported. Convert your photos locally with complete privacy.",
				badge: "IMAGE TOOL",
				features: [
					"Batch convert multiple files",
					"Output to JPG or PNG",
					"Adjustable JPG quality (high/medium/low)",
					"Automatic download after conversion",
					"Validates HEIC format before converting",
					"Privacy-first (runs in browser)",
					"Progress tracking per file",
				],
				lastModified: "2025-12-14",
			},
		],
	},
	{
		name: "Food & Drinks",
		id: "food",
		description: "Culinary calculators and recipe tools for your kitchen experiments.",
		tools: [
			{
				title: "Cocktail Recipe Maker",
				slug: "cocktail-recipe",
				description: "Build and share cocktail recipes with optional batch calculations",
				badge: "FOOD & DRINKS",
				features: [
					"Scale recipes by target volume or servings",
					"Automatic ABV calculation per ingredient",
					"Dilution: stirred, shaken, or custom %",
					"Freezer storage warnings based on ABV",
					"Export batch recipe card as PNG",
					"Save/load recipes to browser storage",
				],
				lastModified: "2026-01-05",
			},
			{
				title: "Super Juice Calculator",
				slug: "super-juice",
				description: "Calculate citrus juice extraction with acid-infused peels. Create concentrated 'super juice' from lemon, lime, orange, grapefruit, or kumquat using scientific ratios of citric and malic acids.",
				badge: "FOOD & DRINKS",
				features: [
					"5 recipes: Lemon, Lime, Orange, Grapefruit, Kumquat",
					"Peel-based and fruit-based calculations",
					"Target weight reverse calculation",
					"Step-by-step instructions",
					"URL state preservation (shareable links)",
					"MSG for grapefruit (Umami boost)",
				],
				lastModified: "2025-12-25",
			},
		],
	},
	{
		name: "Games",
		id: "games",
		description: "Game utilities and calculators to enhance your gameplay experience.",
		tools: [
			{
				title: "Rune Calculator",
				slug: "rune-calculator",
				description: "Elden Ring golden runes are super helpful for quickly leveling your character up, especially when you only need a few more runes to get to the next level. I got tired of doing the mental math in my head, calculating how many runes I needed, etc. So I made this quick and dirty calculator by asking chatGPT to make it for me.",
				badge: "GAMING",
				features: [
					"Current to target level",
					"Optimize number of golden runes",
					"Planning made easy",
					"No spoilers included",
				],
				lastModified: "2025-11-20",
			},
			{
				title: "Perquackey Tracker",
				slug: "perquackey",
				description: "Track your Perquackey word game scores with automatic timer, dictionary validation, and complete game state management. Features real-time word validation, scoring based on official rules, vulnerability tracking, and multi-player support.",
				badge: "WORD GAME",
				features: [
					"3-minute timer with persistence",
					"Dictionary validation (lazy-loaded)",
					"Official scoring table lookup",
					"Bonus calculations (5+5 completions)",
					"Vulnerability & red dice tracking",
					"Multi-player support",
					"State persistence",
				],
				lastModified: "2026-01-18",
			},
		],
	},
];

// Helper function to get all tools flat array
export function getAllTools(): Array<Tool & { category: string; categoryId: string }> {
	const allTools: Array<Tool & { category: string; categoryId: string }> = [];

	for (const category of toolsData) {
		for (const tool of category.tools) {
			allTools.push({
				...tool,
				category: category.name,
				categoryId: category.id,
			});
		}
	}

	return allTools;
}

// Helper function to get tools sorted by date
export function getToolsSortedByDate(order: 'newest' | 'oldest' = 'newest'): Array<
	Tool & { category: string; categoryId: string }
> {
	const allTools = getAllTools();

	return allTools.sort((a, b) => {
		const dateA = new Date(a.lastModified);
		const dateB = new Date(b.lastModified);
		return order === 'newest' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
	});
}
