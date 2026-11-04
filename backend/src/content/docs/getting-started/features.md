---
sidebar_position: 1.5
title: Features
---

# Features

Interakt adds **search** and an **AI assistant** to your website or app, both answering from your own content: a product catalogue, a knowledge base, support articles, documents or your own systems. Everything is managed from one admin dashboard, and going live means pasting a snippet into your site.

This page lists what Interakt can do, for the people who decide how search and chat should work. Each section links to the pages that explain it in detail.

## Site search

Give visitors a search box that finds the right thing, even when they don't use your words.

- **Searches by meaning as well as keywords.** Choose keyword, meaning-based (semantic) or hybrid search. Hybrid finds exact matches such as product codes, and also finds "warm jacket for hiking" when the product is called "insulated trail parka".
- **Filters with counts.** Shoppers can narrow by brand, size, category, price and similar, and see how many results each filter leaves.
- **Suggestions as you type.** Autocomplete offers likely searches while the visitor types.
- **Synonyms.** Teach search that "sofa" and "couch" mean the same thing, or that "tee" should find "t-shirt".
- **Stop words and language settings.** Ignore filler words and tune search for the language of your content.
- **Highlighted matches.** The words that matched are highlighted in each result.
- **AI summary of results.** Optionally show a short AI-written summary above the results, in the length and tone you choose (professional, casual, technical or friendly), with your own instructions such as "point out price differences".
- **Search several sources at once.** One search box can cover several collections (for example products and help articles), with control over which counts most.
- **Use the search engine you already have.** Interakt can search an existing Elasticsearch, Azure AI Search or Sitecore Search setup without copying the data.
- **Control how results look.** Choose which fields appear on result cards (title, image, price, description and so on) and in what order.

More: [Search indexes](../concepts/search-indexes) · [Search experiences](../concepts/search-experiences) · [Synonyms and stop words](../concepts/synonyms-and-stop-words) · [Display configuration](../concepts/display-configuration) · [Data sources](../concepts/data-sources)

## AI assistant (chat)

A chat assistant that answers from your content and your systems, in your brand's voice.

- **Answers from your data.** The assistant looks things up in your content before answering, so answers are based on what you sell or publish rather than general knowledge.
- **Shows its sources.** Answers can include citations, inline or as footnotes, so visitors can check where an answer came from.
- **Finds specific items.** Visitors can ask about a product by name or code ("What is SKU-12345?"), ask what brands you carry, or describe what they want.
- **Rich answers.** The assistant can reply with formatted text, a single product card, a grid of items or a comparison table.
- **Personality you control.** Write the assistant's instructions in plain language ("never guess prices", "always recommend a size guide") and pick a tone: professional, friendly, casual, enthusiastic or concise. Interakt drafts the first version of the instructions from a short description of what the assistant is for.
- **Remembers context.** It follows the thread of a conversation and can remember lasting preferences a visitor has shared, such as a favourite brand, to give better answers next time.
- **Connects to your systems.** Give the assistant access to your own APIs, such as order status, stock levels or account details, so it can answer with live information.
- **Searches the web when allowed.** Optionally let the assistant look up current information online, limited to sites you choose.
- **Plugs into third-party tools.** Connect services that support the Model Context Protocol (MCP) to give the assistant new abilities in one step.
- **Effort control.** Choose a Standard or Thorough setting for how hard the assistant works on each question, trading cost against persistence.
- **Answers appear as they're written.** Responses stream word by word, like other modern chat assistants.

More: [Chat experiences](../concepts/chat-experiences) · [Tools](../concepts/tools) · [MCP Connections](../concepts/mcp-connections) · [Turn budget and limits](../concepts/pipeline-modes)

## Safety and brand protection

- **Keeps the assistant on topic.** Define what the assistant is for (for example "fashion, shipping, returns") and it politely declines anything else with a message you write. Interakt can expand your topic list for you.
- **Blocked words and phrases.** Block, flag or blank out terms such as competitor names or sensitive words, in both what visitors type and what the assistant says.
- **Rules that can't be switched off.** Lock the safety rules on for an assistant so they always run, which helps with compliance reviews.
- **Rate limits.** Cap how many messages each visitor, and the assistant as a whole, can send per minute and per day.
- **Only your sites can use it.** Restrict each search box or assistant to your own website addresses.
- **Privacy controls.** Choose per experience whether to record full conversation text, only timings and counts, or nothing at all, and clear recorded data whenever you need to.

More: [Guardrails](../concepts/guardrails) · [Access tokens](../concepts/access-tokens) · [Analytics → What about PII?](../concepts/analytics#what-about-pii)

## Analytics and insights

See what people look for, what they can't find, and what the AI costs.

- **Search analytics.** Popular searches, searches that found nothing, and trends over time, compared with the previous period.
- **Visitor searches and assistant searches shown apart.** See what visitors typed separately from what the assistant searched for on their behalf.
- **Conversation insights.** What people ask the assistant about, how conversations went, and which ones failed.
- **AI cost tracking.** Usage and cost of the AI, per assistant and over time.
- **"What needs attention".** A nightly review flags content gaps, failing searches, unusual costs and odd AI behaviour, each with an explanation on request.
- **Ask your analytics in plain English.** Ask questions such as "Which searches most often find nothing?" or "How much did AI cost us last month?" and get answers with the figures behind them.
- **Conversation replay.** Step through any conversation to see what the assistant looked up and why it answered as it did, which is useful when a visitor reports a bad answer.
- **Test traffic stays out.** Searches and chats from your own testing are left out of the figures.
- **Shareable views.** Every analytics view has its own link, so you can send a colleague exactly what you're looking at.

More: [Analytics](../concepts/analytics)

## Adding it to your website

- **Copy-and-paste widgets.** A search widget and a chat widget that work on any website, with no developer framework required.
- **Matches your brand.** Set colours, fonts, rounded corners, light or dark mode, your logo, and whether "Powered by Interakt" shows.
- **Flexible placement.** Show search or chat as a pop-up from a button, or built into a page. The chat launcher can be a floating button in any corner or a tab on the side of the page.
- **Conversation starters.** Add suggested questions visitors can click instead of typing, plus a welcome message.
- **Live preview.** See changes to the widget's look as you make them, before publishing.
- **Custom builds.** Teams that want full control can build their own interface on Interakt's API instead of using the widgets.

More: [Embed widgets](../concepts/embed-widgets) · [Calling the search API](../guides/call-the-search-api) · [Calling the chat API](../guides/call-the-chat-api)

## Getting your content in

- **Upload or connect.** Bulk-load a catalogue, connect a database, upload documents (PDF, Word, Markdown, text), or keep content in sync automatically from your CMS or e-commerce platform.
- **Ready-made integrations.** Step-by-step guides for Medusa (e-commerce), Storyblok, Hygraph and Sanity (content management), and React / Next.js sites.
- **Keeps itself up to date.** Integrations push changes to Interakt as content is published or edited.
- **Separate keys for loading data.** The key that loads content is kept apart from the public keys used on your website, so the website can only read.

More: [Loading data into an index](../guides/bulk-load-data) · [Data sources](../concepts/data-sources) · [Integrations](../integrations/) · [Ingestion keys](../concepts/ingestion-keys)

## Managing it

- **One dashboard.** Search boxes, assistants, content, analytics and settings in one place.
- **Try before going live.** A playground to test searches, chats and widgets before visitors see them.
- **Tune without developers.** Edit the assistant's instructions and the wording behind each step in the dashboard, with full version history and one-click rollback.
- **Team roles.** Admins manage everything; Moderators run day-to-day content and experiences; Users can look but not change.
- **Secure secrets.** Passwords and API keys for connected systems are stored encrypted, never shown in plain text.
- **Built-in help.** Every screen links to its help page, and a help assistant answers questions about using Interakt.
- **Scheduled jobs.** Background tasks such as the nightly insights review and health checks run on a schedule you can change.
- **Demo data included.** A sample fashion catalogue with a ready-made search box and assistant, for exploring Interakt before connecting your own content.

More: [Playground](../concepts/playground) · [Prompt templates](../concepts/prompts) · [User management](../concepts/users) · [Secrets](../concepts/secrets) · [Background Jobs](../concepts/background-jobs) · [Initial setup](initial-setup)

## Your choice of AI and hosting

- **Pick your AI provider.** Connect any AI service that offers an OpenAI-compatible API, such as OpenAI, xAI (Grok), Groq, Mistral or OpenRouter, by entering its web address and key. You can also run models locally with Ollama, so no data leaves your servers.
- **Use several providers side by side.** Connect as many providers as you like at the same time, and give each assistant or search summary the model that suits it best. For example, a fast, low-cost model for simple questions and a more capable one for detailed product advice.
- **Self-hosted.** Interakt runs on your own infrastructure, so your content and conversations stay under your control.
- **Open source.** MIT licensed, with no licence fees.

More: [AI providers](../concepts/ai-providers) · [Architecture](architecture)
