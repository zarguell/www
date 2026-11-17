"""Route rendering for every page on the site."""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

import jinja2
from markdown_it import MarkdownIt

from .config import Paths, load_site
from .content import (
    flatten_tools,
    latest_post,
    load_colophon,
    load_links,
    load_page,
    load_posts,
    load_tools,
    newest_tool,
    reading_minutes,
    word_count,
)
from .render import make_env, make_markdown


class SiteBuilder:
    def __init__(self, paths: Paths, asset_map: dict[str, str]):
        self.paths = paths
        self.site = load_site(paths)
        self.env = make_env(paths.templates, self.site, asset_map)
        self.md: MarkdownIt = make_markdown()
        self.posts = load_posts(paths)
        self.tool_categories = load_tools(paths)
        self.tools = flatten_tools(self.tool_categories)
        self.links = load_links(paths)
        self.colophon = load_colophon(paths)
        self.routes: list[str] = []

        for post in self.posts:
            post.html = self.md.render(post.body)
            # The page title is the only h1; demote headings written in the post body.
            post.html = re.sub(
                r"<h1(\s[^>]*)?>(.*?)</h1>",
                r"<h2\1>\2</h2>",
                post.html,
                flags=re.S,
            )
            post.word_count = word_count(post.body)
            post.reading_time = reading_minutes(post.body)

    def context(
        self,
        path: str,
        title: str,
        description: str,
        *,
        og_image: str | None = None,
        og_type: str = "website",
        **extra: Any,
    ) -> dict[str, Any]:
        canonical = f"{self.site['url'].rstrip('/')}{path}"
        image = og_image or "/og-default.png"
        if image.startswith("/"):
            image = f"{self.site['url'].rstrip('/')}{image}"
        return {
            "page": {
                "path": path,
                "title": title,
                "description": description,
                "canonical": canonical,
                "og_image": image,
                "og_type": og_type,
            },
            "site": self.site,
            **extra,
        }

    def write(self, route: str, html: str) -> None:
        if route.endswith(".xml") or route.endswith(".txt"):
            target = self.paths.dist / route.lstrip("/")
        elif route.endswith("/"):
            target = self.paths.dist / route.lstrip("/") / "index.html"
        else:
            target = self.paths.dist / route.lstrip("/") / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        self.routes.append(route if route.endswith((".xml", ".txt")) else route)

    def render(self, template: str, context: dict[str, Any]) -> str:
        return self.env.get_template(template).render(context)

    def build_home(self) -> None:
        page = load_page(self.paths, "home")
        body_html = self.md.render(page.body)
        latest = latest_post(self.posts)
        newest = newest_tool(self.tools)
        ctx = self.context(
            "/",
            f"{self.site['name']} — {self.site['tagline']}",
            self.site["description"],
            home=page,
            body_html=body_html,
            latest_post=latest,
            newest_tool=newest,
            hero_image="/assets/images/hero.jpg",
        )
        self.write("/", self.render("pages/home.html", ctx))

    def build_blog_index(self) -> None:
        ctx = self.context(
            "/blog/",
            f"Blog — {self.site['name']}",
            "Notes on homelab, automation, and the systems I keep breaking.",
            posts=self.posts,
            all_tags=sorted({tag for post in self.posts for tag in post.tags}),
        )
        self.write("/blog/", self.render("pages/blog_index.html", ctx))

    def build_posts(self) -> None:
        for post in self.posts:
            related = [other for other in self.posts if other.slug != post.slug][:2]
            ctx = self.context(
                f"/blog/{post.slug}/",
                f"{post.title} — {self.site['name']}",
                post.description,
                post=post,
                related=related,
                has_mermaid="```mermaid" in post.body,
                has_timeline="```timeline" in post.body,
                og_image=post.image,
                og_type="article",
            )
            self.write(f"/blog/{post.slug}/", self.render("pages/blog_post.html", ctx))

    def build_about(self) -> None:
        page = load_page(self.paths, "about")
        body_html = self.md.render(page.body)
        ctx = self.context(
            "/about/",
            f"About — {self.site['name']}",
            self.site["description"],
            about=page,
            body_html=body_html,
            colophon=self.colophon,
            about_image="/assets/images/about.jpg",
        )
        self.write("/about/", self.render("pages/about.html", ctx))

    def build_links(self) -> None:
        ctx = self.context(
            "/links/",
            f"Links — {self.site['name']}",
            "Curated corners of the internet: socials, projects, and cool finds.",
            links=self.links,
            tags=sorted({tag for item in self.links["coolFinds"] for tag in item["tags"]}),
        )
        self.write("/links/", self.render("pages/links.html", ctx))

    def build_tools_index(self) -> None:
        ctx = self.context(
            "/tools/",
            f"Tools — {self.site['name']}",
            "Calculators and utilities for your digital life. Everything runs in your browser.",
            categories=self.tool_categories,
            tools=self.tools,
            tags=sorted({tool["badge"] for tool in self.tools}),
        )
        self.write("/tools/", self.render("pages/tools_index.html", ctx))

    def build_tool_pages(self) -> None:
        tool_og = {
            "cocktail-recipe": "/assets/cocktail-og.jpg",
            "perquackey": "/assets/perquackey-og.jpg",
        }
        for tool in self.tools:
            slug = tool.get("slug")
            if not slug:
                continue
            template = f"tools/{slug}.html"
            try:
                self.env.get_template(template)
            except jinja2.TemplateNotFound as exc:
                raise FileNotFoundError(f"missing tool template: {template}") from exc
            related = [
                other
                for other in self.tools
                if other.get("slug") and other["slug"] != slug and other["category_id"] == tool["category_id"]
            ][:3]
            ctx = self.context(
                f"/tools/{slug}/",
                f"{tool['title']} — {self.site['name']}",
                tool["description"],
                tool=tool,
                related=related,
                og_image=tool_og.get(slug),
                has_tool_css=(self.paths.assets / "css" / "tools" / f"{slug}.css").exists(),
            )
            self.write(f"/tools/{slug}/", self.render(template, ctx))

    def build_styleguide(self) -> None:
        ctx = self.context(
            "/styleguide/",
            f"Styleguide — {self.site['name']}",
            "The type, color, and component system behind arguelles.me.",
            code_sample=(
                "function createBetter() {\n"
                "  return {\n"
                "    focus: true,\n"
                "    iterate: true,\n"
                "  };\n"
                "}"
            ),
        )
        self.write("/styleguide/", self.render("pages/styleguide.html", ctx))

    def build_404(self) -> None:
        page = load_page(self.paths, "404")
        ctx = self.context(
            "/404.html",
            f"404 — {self.site['name']}",
            "The page you requested does not exist.",
            page_404=page,
        )
        html = self.render("pages/404.html", ctx)
        target = self.paths.dist / "404.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")
        self.routes.append("/404.html")

    def build_rss(self) -> None:
        ctx = {
            "site": self.site,
            "posts": self.posts,
            "build_date": dt.datetime.now(dt.UTC),
        }
        self.write("/rss.xml", self.render("rss.xml", ctx))

    def build_sitemap(self) -> None:
        routes = {
            route
            for route in self.routes
            if not route.endswith((".xml", ".txt")) and route != "/404.html"
        }
        ctx = {"site": self.site, "routes": sorted(routes)}
        self.write("/sitemap.xml", self.render("sitemap.xml", ctx))

    def build_all(self) -> None:
        self.build_home()
        self.build_blog_index()
        self.build_posts()
        self.build_about()
        self.build_links()
        self.build_tools_index()
        self.build_tool_pages()
        self.build_styleguide()
        self.build_404()
        self.build_rss()
        self.build_sitemap()
