# SEO Analysis Worker

A Cloudflare Worker that analyzes websites for SEO best practices using [Cloudflare's Browser Rendering API](https://developers.cloudflare.com/browser-rendering/), [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/), [Hono](https://hono.dev/), and [Durable Objects](https://developers.cloudflare.com/durable-objects/).

## Features
- Analyze SEO of any website
- Checks for common SEO elements:
  - Title tag optimization
  - Meta description
  - Heading structure
  - Image alt tags
  - Internal/external links
- Performance metrics analysis
- AI-powered scoring and improvementrecommendations
- Mobile-friendly analysis

## Prerequisites
- Node.js installed
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)

## Setup

1. Clone the repository:
```
git clone https://github.com/elizabethsiegle/seo-analysis-browser-rendering-worker.git
cd seo-analysis-worker
```

2. Install dependencies:
```
npm install
```

3. Configure your Cloudflare credentials:
```
wrangler login
```

4. Update `wrangler.toml` with your bindings:
```toml
[[durable_objects.bindings]]
name = "BROWSERDO"
class_name = "BrowserDo"
[[ai.bindings]]
name = "AI"
```

5. Deploy the worker to Cloudflare:
```
npx wrangler deploy
```
OR start the development server:
```
npx wrangler dev --remote
```
