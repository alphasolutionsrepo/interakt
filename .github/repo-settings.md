# Repository Settings — Change Log

A running record of GitHub repository configuration changes (rulesets, branch
protection, merge settings, security features) made outside of code — **what**
changed, **when**, **who**, and **why**. Keep this current so any maintainer can
explain the repo's configuration without spelunking through GitHub settings.

Most of these settings require the **admin** repo role to change (the `maintain`
role can view but not edit). Make the change in the GitHub UI, then update the
entry below from "Pending" to "Applied".

> Settings live at: **Settings → Rules → Rulesets** (branch protection) and
> **Settings → General → Pull Requests** (merge methods). The legacy
> "Settings → Branches" page is superseded by Rulesets.

---

## 2026-09-16 — Public landing page: description, topics, social preview

**Context:** The README was rewritten as a project landing page (banner, badges,
feature grid, quick start). The repository metadata that frames it on GitHub was
still empty: no description, no topics, and the auto-generated social preview
card. These three settings are UI/API-only and are not versioned in code, so
they are recorded here. Requested by hja@alpha-solutions.us.

| # | Setting | Before | After | Reason | Status |
|---|---------|--------|-------|--------|--------|
| 1 | Repository description | *(empty)* | "Open-source, self-hosted AI search and chat for your website. Hybrid search over Elasticsearch or Azure AI Search, chat grounded in your data with tools and MCP, drop-in widgets, bring your own model." | Shown at the top of the repo page and in every search result / link preview | Pending |
| 2 | Topics | *(none)* | `ai` `search` `rag` `chatbot` `hybrid-search` `semantic-search` `elasticsearch` `azure-ai-search` `pgvector` `nextjs` `typescript` `openai` `ollama` `mcp` `self-hosted` `llm` `conversational-ai` `widgets` | GitHub topic pages are free discoverability; the project has none | Pending |
| 3 | Social preview image | GitHub auto-generated card | `.github/assets/banner-dark.png` (1280×640; matches the dark link-preview card on interakt.app) | The card shows up on every share to Slack, X, LinkedIn and in Discussions | Pending |

### How to apply
1. **#1 and #2 (CLI, `maintain` role is enough):**
   ```bash
   gh repo edit alphasolutionsrepo/interakt \
     --description "Open-source, self-hosted AI search and chat for your website. Hybrid search over Elasticsearch or Azure AI Search, chat grounded in your data with tools and MCP, drop-in widgets, bring your own model." \
     --homepage https://interakt.app \
     --add-topic ai,search,rag,chatbot,hybrid-search,semantic-search,elasticsearch,azure-ai-search,pgvector,nextjs,typescript,openai,ollama,mcp,self-hosted,llm,conversational-ai,widgets
   ```
2. **#3 (UI only, requires admin):** Settings → General → Social preview → **Edit** →
   upload `.github/assets/banner-dark.png` from a checkout of `main`.

### Verify after applying
```bash
gh repo view alphasolutionsrepo/interakt --json description,homepageUrl,repositoryTopics,usesCustomOpenGraphImage
```
Expected: the description above, homepage `https://interakt.app`, 18 topics,
`usesCustomOpenGraphImage: true`.

---

## 2026-06-14 — Post open-source / single-trunk cleanup

**Context:** The project went open source and migrated to a single trunk
(`main`); `develop`/`dev` were retired. The protection ruleset and merge
settings still referenced the old multi-branch model. These edits realign them.
Requested by hja@alpha-solutions.us. A full "before" snapshot of the ruleset is
archived at `interakt-materials/reference/ruleset-before-2026-06-14.json`.

**Verified applied 2026-08-05** by running the "Verify after applying" commands
below — all values match expected (ruleset renamed "Protect main", `main`-only
targets, thread resolution required, squash/rebase only, merge commits off).

Ruleset affected: **"Protect main and develop"** (id `17230654`).

| # | Setting | Before | After | Reason | Status |
|---|---------|--------|-------|--------|--------|
| 1 | Ruleset target branches | `main`, `develop`, `dev` | `main` only | `develop`/`dev` no longer exist after single-trunk migration — dead targets are misleading | Applied 2026-08-05 |
| 1 | Ruleset name | "Protect main and develop" | "Protect main" | Reflects the single protected branch | Applied 2026-08-05 |
| 2 | Require conversation resolution before merging | Off | On | Review comments must be resolved before merge, not silently left open | Applied 2026-08-05 |
| 3 | Ruleset allowed merge methods | merge · squash · rebase | squash · rebase | "Require linear history" rejects merge commits, so offering "merge" only produces confusing failures | Applied 2026-08-05 |
| 3 | Repo setting: Allow merge commits | Enabled | Disabled | Same reason — keep the merge button set consistent with linear history (squash/rebase only) | Applied 2026-08-05 |

### What is intentionally NOT changing (and why)
- **Required status checks** (`Backend …`, `Widgets …`, `CodeQL`) — kept as-is; correct gate.
- **Require code-owner review (1 approval)** — kept; this is the core protection.
- **Block force pushes / restrict deletions / linear history** — kept.
- **Auto-delete head branches on merge** (`delete_branch_on_merge`) — currently
  Off. Reasonable to enable later for branch hygiene, but left unchanged for now
  to keep this change set scoped to the migration cleanup.

### How to apply (UI — requires admin)
1. **#1, #2, #3 (ruleset):** Settings → Rules → Rulesets → "Protect main and develop".
   - Target branches: remove `develop` and `dev`, keep `main`. Rename to "Protect main".
   - "Require a pull request before merging" → expand → check **Require conversation resolution before merging**; set **Allowed merge methods** to Squash + Rebase only.
   - Save.
2. **#3 (repo merge button):** Settings → General → Pull Requests → uncheck **Allow merge commits** (leave Squash and Rebase checked). Save.

### Verify after applying
```bash
gh api repos/alphasolutionsrepo/interakt/rulesets/17230654 \
  --jq '{name, branches: .conditions.ref_name.include,
         pr: (.rules[] | select(.type=="pull_request").parameters
              | {required_review_thread_resolution, allowed_merge_methods})}'
gh api repos/alphasolutionsrepo/interakt --jq '{allow_merge_commit}'
```
Expected: name "Protect main"; branches `["refs/heads/main"]`;
`required_review_thread_resolution: true`; `allowed_merge_methods: ["squash","rebase"]`;
`allow_merge_commit: false`.

---

<!-- Add new entries above this line, newest first. -->
