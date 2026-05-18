#!/usr/bin/env python3
"""Build _site/index.html from README.md for GitHub Pages (static, no runtime deps beyond Markdown)."""

from __future__ import annotations

import os
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[2]
README = ROOT / "README.md"
SITE = ROOT / "_site"


def main() -> None:
    SITE.mkdir(parents=True, exist_ok=True)
    (SITE / ".nojekyll").write_text("", encoding="utf-8")

    for extra in ("LICENSE", "CODE_OF_CONDUCT.md"):
        src = ROOT / extra
        if src.is_file():
            (SITE / extra).write_bytes(src.read_bytes())

    text = README.read_text(encoding="utf-8")
    body = markdown.markdown(
        text,
        extensions=["extra", "nl2br", "sane_lists"],
    )

    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    gh_link = (
        f'<p class="gh-link"><a href="https://github.com/{repo}">Repository on GitHub</a></p>'
        if repo
        else ""
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VozShift</title>
  <meta name="color-scheme" content="dark" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css" crossorigin="anonymous" />
  <style>
    body {{ margin: 0; background: #0d1117; }}
    .wrap {{ max-width: 1012px; margin: 0 auto; }}
    .gh-bar {{
      padding: 12px 40px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      font-family: system-ui, sans-serif;
      font-size: 14px;
    }}
    .gh-link a {{ color: #58a6ff; text-decoration: none; }}
    .gh-link a:hover {{ text-decoration: underline; }}
    .markdown-body {{ box-sizing: border-box; padding: 32px 40px 80px; min-width: 200px; }}
    .markdown-body pre {{ overflow-x: auto; }}
  </style>
</head>
<body>
  <div class="wrap">
    {gh_link and f'<div class="gh-bar">{gh_link}</div>'}
    <article class="markdown-body">
{body}
    </article>
  </div>
</body>
</html>
"""
    (SITE / "index.html").write_text(html, encoding="utf-8")
    print(f"Wrote {SITE / 'index.html'}")


if __name__ == "__main__":
    main()
