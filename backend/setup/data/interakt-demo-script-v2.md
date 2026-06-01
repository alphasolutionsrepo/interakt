# Interakt Demo Script v2 — Full Live Walkthrough

**Audience:** E-commerce teams and developers evaluating Interakt
**Format:** Live screen-share walkthrough with talking points
**Duration:** ~15 minutes (plus Q&A)
**Demo data:** Fashion catalog — 200 products, 20 brands

> **What changed in v2:** Every product name, price, count, and stat below is verified against the live index (May 2026). Result counts are now safe to quote out loud — a fix to the Elasticsearch hybrid-search total means ES and Azure AI Search now report **identical** match counts (e.g. both say *15* for "bomber jacket"). Claims that only hold on one backend are explicitly flagged. See **Appendix D — Backend Differences** before running on Elasticsearch.

> **Provider note:** This script runs on **either** backend — the Elasticsearch experience (`fashion-catalog-search` / `fashion-product-assistant`) or the Azure AI Search experience (`fashion-catalog-search-experience-azure` / `fashion-product-assistant-azure`). Search and chat behave the same on both, including review counts and per-variant stock. The only remaining differences are Azure-side cosmetics (brand casing, autocomplete) — see Appendix D.

---

## Pre-Demo Setup Checklist

- [ ] Interakt demo app open in browser (frontend search + chat widgets)
- [ ] Admin Console open in a second tab (logged in, dashboard visible)
- [ ] Chat widget cleared (fresh session, no prior conversation)
- [ ] Confirm which backend the demo experience points at (ES or Azure) — see Appendix D
- [ ] Browser zoom at 100%, full screen

---

## Part 1 — Set the Stage (1 minute)

> "Let me show you Interakt in action. It's an open-source, AI-powered platform that gives you three things in one stack: intelligent search, conversational AI chat, and a full analytics and observability console."

> "We've loaded a fashion catalog for today's demo — **200 products across 20 brands**: dresses, jackets, jeans, sneakers, handbags, activewear, the full range. Entry prices start around **$15** and run up to about **$350**, averaging roughly **$80 to get in the door** and **~$180 for a typical mid-range pick**. The catalog is realistic where it matters: materials like merino wool, cashmere, and vegan leather; seasons; style tags from 'bohemian' to 'business casual'; care instructions; and customer ratings spanning **3.0 to 5.0 stars**."

> "I'll walk you through what the shopper sees, what the AI is actually doing behind the scenes, and what your team gets on the backend. Let's start with search."

---

## Part 2 — Smart Search (3 minutes)

### Beat 1: Basic keyword search
**Action:** Type `bomber jacket` into the search widget.

> "A customer types 'bomber jacket.' Interakt returns **15 relevant jackets**, with the actual bomber jackets ranked right at the top — the Vesper & Co Modern Bomber Jacket leads, followed by streetwear and bohemian bombers from Ember Threads, Echo Style, Coastal Haven, and Aurelia Lane. Results are ordered by relevance, so the most on-target pieces come first and related jackets follow."

**Point out:** Speed. Relevance ranking. The count is honest — 15 matches, not a padded number. The customer doesn't need the exact product name.

### Beat 2: Autocomplete
**Action:** Clear the search box. Start typing `cas` and pause.

> "As the customer types 'cas,' autocomplete surfaces real catalog products in real time — casual styles like the Indigo Park Casual V-Neck Sweater and Vesper & Co Casual Dress Shoes. It's reading the indexed product fields, so it guides the customer before they finish typing and heads off zero-result dead ends."

**Point out:** Type-ahead straight from the catalog reduces friction and search abandonment.
*(Backend note: ES returns clean product names; Azure currently mixes in description text — see Appendix D.)*

### Beat 3: Natural language intent
**Action:** Type `elegant dress for an evening out`

> "Now the customer doesn't name a product or pick a category — they describe the occasion. Interakt resolves 'elegant' and 'evening out' to the catalog's dressy pieces: at the top you'll see the **Aurelia Lane Formal Wrap Dress**, the **Meridian Wear Classic Wrap Dress**, and the **Terra Nova Formal Shirt Dress**, alongside midi and maxi dresses from Skyline Fashion and Haven & Hart."

**Point out:** The phrase 'evening out' appears nowhere in the product data — semantic search understands what it *means*. This is why this query casts a wide net across the dress catalog rather than matching two literal words.

### Beat 4: Search modes
> "Behind the scenes there are three search modes: **lexical** for keyword matching, **semantic** for meaning-based search, and **hybrid** which fuses both with Reciprocal Rank Fusion for maximum relevance. You configure the mode per experience — most teams default to hybrid."

### Beat 5: Multi-attribute, budget-aware search
**Action:** Type `vegan leather bags under $200`

> "This blends a material, a category, and a budget in one sentence. Interakt returns the catalog's **12 vegan-leather bags**, ranking the budget-friendly picks first — the Skyline Fashion Casual Backpack at about **$63**, the Lumina Collective Structured Tote at **$70**, and an Atlas Apparel backpack at **$72** all lead."

**Point out:** No three separate filter panels — the customer says it in one sentence. (Note: search *ranks* by intent; when you need a **hard** price cap or in-stock-only enforced, that's the chat pipeline's job — coming up next.)

### Beat 6: Faceted filtering
**Action:** Show the filter sidebar — filter by brand, then season, then style.

> "You still get traditional faceted filtering alongside AI search. We have **20 brands**, five seasons — **Winter (47), Fall (46), Summer (37), Spring and All-Season (35 each)** — and style tags like Minimalist (28), Athleisure and Business Casual (23 each), Formal and Streetwear (20 each). Structured filters and AI search work together: start with a natural-language search, then narrow with filters."

---

## Part 3 — Conversational AI Chat (4 minutes)

> "Search gets people browsing. But what about a question they can't answer from a product grid? That's where chat comes in."

### Beat 7: Product deep-dive question
**Action:** Open the chat widget. Type: `Tell me about the Vesper & Co Crew Neck Sweater — is it worth the price?`

> "Instead of making the shopper read descriptions, the chat synthesizes an answer grounded in the data: the Vesper & Co Casual Crew Neck Sweater is **50% merino wool, 50% acrylic**, **rated 4 out of 5**, priced from about **$89 up to $338** across sizes. It frames the merino blend as solid value for the material quality — a personal-shopper-level answer, generated in real time."

**Point out:** Grounded in actual product data — material, rating, price. AI proposes, your product data enforces. No hallucinated specs.

### Beat 8: Multi-turn conversation with context
**Action:** Follow up: `What sizes does the crew come in? And is the tan one available in XL?`

> "Two questions and a pronoun — 'the crew' means the Vesper & Co sweater from the last turn. The chat checks variant data: sizes run **S through XXXL**, and it confirms the tan colorway in XL is available and in stock."

**Point out:** Conversational memory across turns, plus variant-level data access — not just marketing copy. Both backends now read the actual per-SKU variants (color + size + live stock).

### Beat 9: Rich response formats
**Action:** Ask: `Show me women's dresses for a spring wedding`

> "Look at how this comes back — not a text list, but product cards with images, prices, and details. You'll get spring-appropriate formal dresses like the Terra Nova Formal Shirt Dress, the Aurelia Lane Formal Wrap Dress, and flowing maxi dresses from Willow Creek and Atlas Apparel. Interakt can render item grids for browsing, comparison tables for evaluation, or rich markdown with citations — the format adapts to the query."

**Point out:** Rich formats — markdown, single cards, item grids, comparison tables, summary-with-sources — each enabled per experience. Citations are a toggle (off in this demo).

### Beat 10: Cross-sell and outfit building
**Action:** Ask: `What handbags would go with the Aurelia Lane Formal Wrap Dress?`

> "Now the AI plays stylist — drawing on the catalog to suggest bags that pair with the dress by style and occasion. That's cross-category styling your search bar would never generate, surfacing naturally in conversation."

> **Presenter note:** This open-ended ask varies run-to-run. The anchored phrasing above ("What handbags would go with…") reliably returns coordinating pieces. The looser "what bag *and* shoes" version is a nice flourish but less repeatable — rehearse whichever you'll use.

### Beat 11: Agentic vs. Deterministic modes
> "Two chat pipeline modes, chosen per experience. In **agentic mode**, the AI autonomously decides when to search, what to look up, and how to respond — great for open-ended discovery and styling."

> "This demo runs **deterministic mode** — your backend orchestrates every step: intent detection, validation, search, response generation. The AI proposes, your business rules enforce. That's what you want for high-control scenarios — order status, returns, pricing rules, compliance — and, as you just saw, the customer experience is every bit as fluid."

---

## Part 4 — Analytics Dashboard (2 minutes)

### Beat 12: Dashboard overview
**Action:** Switch to the Admin Console tab. Show the main dashboard.

> "Your command center: total queries, active experiences, average response latency. Below that, the Search Platform section — search indexes, data templates, search experiences. Tools & Insights — analytics, the playground, settings."

**Point out:** Sidebar — Dashboard, Analytics, Analytics Chat, Traces, Indexes, Data Templates, Search Experiences, AI Providers, Asset Management, Event Monitoring, Settings.

### Beat 13: Search Analytics
**Action:** Click into Analytics.

> "Search analytics shows what customers actually search for: popular queries, trending searches, and — the most actionable part — **zero-result queries**. If customers keep searching 'plus size dresses' or 'maternity wear' and get nothing, you know exactly where your catalog has a gap. Your search data tells you what to stock."

> "You also get query volume over time, click-through rates, and performance — collected in real time, in the background, with zero impact on search latency."

**Point out:** Zero-result queries are a merchandising goldmine most search tools don't surface cleanly.

---

## Part 5 — Chat Analytics (1 minute)

### Beat 14: Chat session analytics
**Action:** Navigate to Analytics Chat. Click through the preconfigured filters. Drill into the first session.

> "Chat analytics goes deeper than search. Preconfigured views right on the page — click into one and you're looking at real chat sessions: the full conversation, every turn, what was asked, what the AI answered, how many turns it took. This tells you whether chat is driving conversions or just answering questions — and where customers drop off."

---

## Part 6 — Execution Traces (2 minutes)

### Beat 15: Traces overview
**Action:** Navigate to Traces.

> "My favorite feature, and the thing most AI platforms don't give you: **full execution traces.**"

### Beat 16: Drilling into a trace
**Action:** Click into a chat interaction — ideally the outfit-building or spring-wedding conversation.

> "Click into a single chat turn and you see the complete reasoning chain: what the user said, what context the AI had from prior turns, what it decided to do, what search query it constructed, what results came back and how they ranked, and how it assembled the final response."

**Point out:** Each trace: user input → context assembly → AI decision → search execution → result ranking → response generation. Not a log buried in CloudWatch — a visual, step-by-step breakdown.

### Beat 17: Why traces matter
> "Three reasons this matters. **Debugging:** a bad recommendation? Click in, see exactly which step went wrong — intent, search query, or synthesis — and fix the right thing. **Tuning:** spot patterns and adjust data templates or prompts with evidence, not intuition. **Compliance:** it's your audit trail — show exactly how and why the AI made every recommendation."

---

## Part 7 — Platform Configuration (2 minutes)

### Beat 18: Experience Builder
**Action:** Navigate to Search Experiences. Open the demo experience.

> "The Experience Builder wires everything together. An 'experience' bundles a search index, AI settings, display rules, guardrails, and access controls into one deployable unit. This demo experience points at the fashion catalog index, uses hybrid search, and sets the chat persona to a knowledgeable fashion advisor."

> "You define the persona here — brand voice, expertise, allowed and off-limits topics. Input/output filtering for safety. Deploy it, and it gets its own API token and CORS config."

**Point out:** Multiple experiences can run against the same data with different settings — one for your website, one for internal buyers, one for wholesale. We literally have two right now: the same fashion catalog served through both Elasticsearch and Azure AI Search.

### Beat 19: AI Provider Management
**Action:** Navigate to AI Providers.

> "Interakt doesn't lock you into one vendor — OpenAI, Anthropic, Google Gemini, Azure OpenAI, and Ollama for self-hosted. This demo runs on OpenAI, with Ollama configured alongside for local use. Test connections, discover models, set defaults — all here."

> "Want Claude for synthesis and GPT for embeddings? Done. Want everything local through Ollama for data privacy? Done. Swap providers without changing integration code."

### Beat 20: Playground
**Action:** Show the Playground briefly.

> "Before you go live, the Playground lets you test search, filters, autocomplete, and full chat against any experience. Debug here, not in production."

---

## Part 8 — Developer Story & Close (1 minute)

> "Two things your engineering team will care about. **Integration:** two lines of JavaScript — one script tag, one component — gives you the full search and chat widget with analytics built in. Want more control? A complete REST API with an OpenAPI 3.1 spec, SSE streaming for chat, and token-based auth."

> "**Open source.** No black box. Inspect the search pipeline, the AI reasoning chain, the analytics collection. Self-host, extend, contribute. No vendor lock-in."

> "Recap: smart search that understands intent across 200 products — from 'bomber jacket' to 'an elegant dress for an evening out,' with honest result counts. AI chat that answers product questions, checks variant availability, and styles outfits — with full conversational memory. An admin console with real-time analytics and full execution traces. Multi-provider AI with no lock-in. And it's all open source."

> "We loaded this entire catalog from a JSON file. Your product data is probably already more structured. I'd love to get you on the waitlist and talk about what this looks like with your catalog."

---

## Appendix A: Demo Data Quick Reference (verified May 2026)

| Stat | Value |
|---|---|
| Total products | 200 |
| Brands | 20 (Coastal Haven, Skyline Fashion, Summit Style, Atlas Apparel, Lumina Collective, Aurelia Lane, Echo Style, Haven & Hart, Meridian Wear, Terra Nova, Cascade Fashion, Nova Thread, Solstice Apparel, Vesper & Co, Anchor & Pine, Crestwood, Willow Creek, Riverstone, Ember Threads, Indigo Park) |
| Price range | $15 – $349 (avg entry ~$80; avg mid-range ~$181) |
| Ratings | 3.0 – 5.0 (avg ~3.75; only 5 products rated ≥4.5) |
| Gender split | Women 115, Men 72, Kids 7, Unisex 6 |
| Seasons | Winter 47, Fall 46, Summer 37, Spring 35, All-Season 35 |
| Styles | Minimalist 28, Athleisure 23, Business Casual 23, Formal 20, Streetwear 20, Bohemian 19, Casual 19, Classic 19, Modern 15, Vintage 14 |
| Top categories | Dresses (W) 14, T-Shirts (M) 13, Jackets 21 (M11/W10), Jeans 20, Shoes 19, Activewear 20, Handbags 10, Sweaters 15 |
| Materials | cotton, polyester, wool, linen, cashmere, merino wool, **vegan leather (12 bags)**, silk, viscose |
| Variant SKUs | ~1,000+ (variant-level data; structured on Azure) |

> ⚠️ Numbers corrected from v1: average rating is **~3.75** (not 4.26) over a **3.0–5.0** range; there are **12** vegan-leather products (not 8); out-of-stock is **variant-level, Azure-only** (see Appendix D), so don't claim "164 out-of-stock" on an Elasticsearch run.

## Appendix B: Backup Searches & Chat Questions (verified)

**Search queries (count · sample top result):**
- `cashmere sweater` — 12 · Coastal Haven Athleisure Oversized Sweater
- `women's minimalist jeans` — 43 · Terra Nova Minimalist Bootcut Jeans
- `vegan leather bags` — 12 · all vegan-leather handbags (Atlas, Lumina, Skyline, Crestwood, Cascade, Echo Style, Vesper & Co)
- `winter jacket under $200` — season + category + price intent
- `athleisure for working from home` — lifestyle intent across activewear/hoodies

**Chat questions:**
- `Compare the Solstice Apparel skinny jeans and the Skyline Fashion slim-fit jeans` — comparison table. Real products: **Solstice Apparel High-Rise Skinny Jeans** (~$111, 4.5★) vs **Skyline Fashion Modern Slim-Fit Jeans** (~$84, 3.5★).
- `What's the difference between relaxed fit and tailored fit?` — fit-type domain knowledge.
- `Which brands use vegan or sustainable materials?` — material-aware filtering (12 vegan-leather products).
- `Is the Echo Style Minimalist Crew Neck Sweater good quality?` — rating synthesis. It's rated **5.0 stars from 483 reviews** (now works on both backends).

## Appendix C: Key Features Mentioned

| Feature | Where | Proves |
|---|---|---|
| Lexical / Semantic / Hybrid (RRF) | Beat 4 | Three modes for different needs |
| Autocomplete | Beat 2 | Real-time type-ahead from product data |
| Natural-language intent | Beats 3, 5 | Understands meaning, not keywords |
| Honest hybrid result counts | Beats 1, 5 | ES and Azure agree on match counts |
| Faceted filtering | Beat 6 | Traditional filters alongside AI |
| Deterministic chat mode | Beats 7–11 | Backend-orchestrated control/compliance |
| Agentic chat mode | Beat 11 | Optional autonomous pipeline |
| Rich response formats | Beat 9 | Cards, grids, comparisons, markdown |
| Conversational memory | Beat 8 | Multi-turn context |
| Cross-sell / outfit building | Beat 10 | Context-driven recommendations |
| Search & chat analytics | Beats 13–14 | Popular/zero-result queries, sessions |
| Execution traces | Beats 15–17 | Full reasoning chain |
| Experience builder | Beat 18 | Bundle index + AI + rules |
| Multi-provider AI | Beat 19 | OpenAI, Anthropic, Gemini, Azure, Ollama |
| 2-line widget integration | Close | Minimal deploy effort |
| Open source | Close | Transparency, self-hosting |

## Appendix D: Backend Differences (READ BEFORE THE DEMO)

Both experiences serve the same catalog and now report **identical search result counts**. Differences remaining, and what to do about them:

| # | Difference | Status | Notes |
|---|---|---|---|
| 1 | **`ratingCount` (review counts)** | ✅ **Resolved on ES** | The ES index already carried `ratingCount`; it was just flagged out of the default response. Now `include_in_response=true`, so "483 reviews" works on both backends. No reindex was needed. |
| 2 | **Per-variant stock (`variants[]`)** | ✅ **Resolved on ES** | Same as above — the per-SKU `variants` array (color/size/`inStock`/`stockQuantity`) is now returned on ES, so variant-level stock answers and out-of-stock demos work on both. |
| 3 | **Azure stores `brand` lowercased** (`vesper & co`) | ⚠️ Azure-only, open | Result cards show lowercase brands on Azure. Fixing means editing the Azure index/data template — **requires a push to the shared Postgres DB**, so deferred. |
| 4 | **Azure `variants` stored as a JSON string**, not structured | ⚠️ Azure-only, open | Variant attributes aren't independently facetable on Azure. ES stores `variants` as structured objects. Fixing Azure requires a shared-DB push — deferred. |
| 5 | **Autocomplete sources differ** — ES returns product names; Azure interleaves description sentences | ⚠️ Azure-only, open | Azure autocomplete looks noisy (Beat 2). Restricting Azure's autocomplete source fields requires a shared-DB push — deferred. |

**Bottom line for the presenter:** Review counts and variant-level stock now work on **both** backends, so every chat beat is backend-agnostic. The only remaining differences (3–5) are Azure-side cosmetics — and because they live on the shared Azure Postgres, they're deferred until we're ready to push changes upstream. For the cleanest visuals today, **Elasticsearch** avoids the lowercase-brand and noisy-autocomplete quirks.
