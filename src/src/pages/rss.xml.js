import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts
			.filter((post) => post.data.draft !== true)
			.map((post) => ({
				title: post.data.title,
				description: post.data.description,
				pubDate: post.data.pubDate,
				updatedDate: post.data.updatedDate,
				categories: post.data.tags,
				author: 'Arguelles Site',
				link: `/blog/${post.id}/`,
				// Include the full post content as raw markdown
				// RSS readers will render it appropriately
				content: post.body,
			})),
	});
}
