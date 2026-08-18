# Integrations

Interakt sits between your **content** and your **users**: something feeds documents into a search
index, and something puts search and chat in front of visitors. The integration guides in this
section cover both halves, grouped by the kind of system you're connecting.

## Pick your starting point

| You want to… | Go to |
|---|---|
| Keep a **CMS / DXP**'s content in sync with an Interakt index (backfill + webhooks) | [CMS & DXP](./cms-dxp/storyblok/how-to-integrate-interakt-with-storyblok) |
| Keep an **e-commerce catalog** in sync (products, collections, prices) | E-commerce *(coming soon)* |
| Put search or chat **into your app's frontend** (React, Next.js, …) | [Frontend frameworks](./frontend/) |

## The two sides of an integration

Most real deployments use one guide from each group:

1. **Ingestion** — a CMS, DXP, or e-commerce integration pushes your content into an Interakt
   **Search Index** and keeps it fresh as editors publish. These integrations run on your **server**
   and use a per-index **ingestion key**.
2. **Presentation** — a frontend integration renders search and chat for visitors, either with the
   **drop-in widget** or by **calling the APIs** directly. These run in the **browser** and use an
   experience's public **access token**.

The [Storyblok guide](./cms-dxp/storyblok/how-to-integrate-interakt-with-storyblok) walks the
ingestion side end to end; the [Frontend frameworks](./frontend/) guides walk the presentation side.
You can read them independently.
