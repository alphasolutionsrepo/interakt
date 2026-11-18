#!/usr/bin/env bash
# Copies the docs Markdown (backend/src/content/docs, the same files the app serves at /docs)
# into docs-site/docs for a Docusaurus build. Run from the repository root.
set -euo pipefail

rm -rf docs-site/docs
mkdir -p docs-site/docs
cp -R backend/src/content/docs/. docs-site/docs/
# index.md is a GitHub-repo-browsing landing; intro.md (slug: /) is the Pages homepage.
# Drop the copy so they don't both claim the / route.
rm -f docs-site/docs/index.md
