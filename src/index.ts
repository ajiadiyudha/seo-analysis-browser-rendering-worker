import { Hono } from 'hono';
import puppeteer from "@cloudflare/puppeteer";
import { serveStatic } from '@hono/node-server/serve-static'

interface Env {
    BROWSER: any;
	BUCKET: any;
    BROWSERDO: any;
    AI: any;
}

const KEEP_BROWSER_ALIVE_IN_SECONDS = 60;

export class BrowserDo {
    private browser: any;
    private keptAliveInSeconds: number;
    private storage: any;

    constructor(private env: Env, state: any) {
        this.keptAliveInSeconds = 0;
        this.storage = state?.storage;
		this.env = env;
    }
	async fetch(request: Request) {
        if (!this.browser || !this.browser.isConnected()) {
            try {
                this.browser = await puppeteer.launch(this.env.BROWSER);
            } catch (e: any) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500 });
            }
        }
        return new Response(JSON.stringify({ status: 'ok' }));
    }

    async initBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            console.log(`Browser Manager: Starting new instance`);
            try {
                this.browser = await puppeteer.launch(this.env.BROWSER);
            } catch (e) {
                console.log(`Browser Manager: Could not start browser instance. Error: ${e}`);
                throw e;
            }
        }
        return this.browser;
    }

    async takeScreenshots(url: string) {
        const width = [1920, 1366, 1536, 360, 414];
        const height = [1080, 768, 864, 640, 896];
        
        const nowDate = new Date();
        const coeff = 1000 * 60 * 5;
        const roundedDate = new Date(Math.round(nowDate.getTime() / coeff) * coeff).toString();
        const folder = roundedDate.split(" GMT")[0];

        const browser = await this.initBrowser();
        const page = await browser.newPage();

        const screenshots = [];
        for (let i = 0; i < width.length; i++) {
            await page.setViewport({ width: width[i], height: height[i] });
            await page.goto(url);
            const fileName = `screenshot_${width[i]}x${height[i]}`;
            const sc = await page.screenshot();
            await this.env.BUCKET.put(`${folder}/${fileName}.jpg`, sc);
            screenshots.push(`${folder}/${fileName}.jpg`);
        }

        await page.close();
        return screenshots;
    }
	async alarm() {
		this.keptAliveInSeconds += 10;
	
		// Extend browser DO life
		if (this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
		  console.log(
			`Browser DO: has been kept alive for ${this.keptAliveInSeconds} seconds. Extending lifespan.`,
		  );
		  await this.storage.setAlarm(Date.now() + 10 * 1000);
		  // You could ensure the ws connection is kept alive by requesting something
		  // or just let it close automatically when there  is no work to be done
		  // for example, `await this.browser.version()`
		} else {
		  console.log(
			`Browser DO: exceeded life of ${KEEP_BROWSER_ALIVE_IN_SECONDS}s.`,
		  );
		  if (this.browser) {
			console.log(`Closing browser.`);
			await this.browser.close();
		  }
		}
	  }

    async cleanup() {
        if (this.browser) {
            console.log('Closing browser.');
            await this.browser.close();
        }
    }
}

const app = new Hono<{ Bindings: Env }>();

// Serve the / HTML form 
app.get('/', serveStatic({ root: './assets' }));

app.post('/screenshot', async (c) => {
    const formData = await c.req.formData();
    const url = formData.get('url')?.toString();

    if (!url) {
        return c.text('URL is required', 400);
    }

    try {
        const id = c.env.BROWSER.idFromName("browser");
        const browserObj = c.env.BROWSER.get(id);
        const state = await browserObj.fetch(new Request(url)).then((r: Response) => r.json());
        
        const browserManager = new BrowserDo(c.env, state);
        const screenshots = await browserManager.takeScreenshots(url);
        
        return c.json({
            success: true,
            screenshots
        });
    } catch (error) {
        console.error('Screenshot error:', error);
        return c.text(`Error taking screenshots: ${error}`, 500);
    }
});

// Handle the analysis
app.post('/analyze', async (c) => {
    const formData = await c.req.formData();
    const url = formData.get('url')?.toString();

    if (!url) {
        return c.text('URL is required', 400);
    }

    try {
        const id = c.env.BROWSERDO.idFromName("browser");
       	const browserObj = c.env.BROWSERDO.get(id);
        const state = await browserObj.fetch(new Request(url)).then((r: Response) => r.json());
        
        const browserManager = new BrowserDo(c.env, state);
        const browser = await browserManager.initBrowser();
        const page = await browser.newPage();
        await page.goto(url);

        const seoData = await page.evaluate((): any => {
            // Get performance metrics
            const performance = window.performance;
            const timing = performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            const domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
            
            // Get page metrics
            const pageSize = document.documentElement.innerHTML.length;
            const wordCount = document.body.innerText
                .trim()
                .split(/\s+/)
                .length;
            
            // Check for common SEO issues
            const brokenImages = Array.from(document.querySelectorAll('img'))
                .filter(img => !img.complete || !img.naturalWidth)
                .length;
            
            // Check for mobile-friendly features
            const hasTouchIcons = !!document.querySelector('link[rel*="apple-touch-icon"]');
            const hasManifest = !!document.querySelector('link[rel="manifest"]');
            const fontSizes = Array.from(document.querySelectorAll('*'))
                .map(el => window.getComputedStyle(el).fontSize)
                .filter(size => parseInt(size) < 12).length;
            
            // Check for security features
            const hasHttps = window.location.protocol === 'https:';
            const hasCsp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            
            // Get meta tags and favicons
            const favicons = Array.from(document.querySelectorAll('link[rel*="icon"]'))
                .map(link => link.getAttribute('href'));
            const metaKeywords = document.querySelector('meta[name="keywords"]')?.getAttribute('content');
            const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content');
            
            // Get all existing data
            const existingData = {
                // ... previous seoData properties ...
                title: document.title,
                metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content'),
                canonicalUrl: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
                h1Count: document.querySelectorAll('h1').length,
                h2Count: document.querySelectorAll('h2').length,
                h3Count: document.querySelectorAll('h3').length,
                imagesWithoutAlt: Array.from(document.querySelectorAll('img')).filter(img => !img.getAttribute('alt')).length,
            };
			// Fix link counting
            const allLinks = Array.from(document.querySelectorAll('a'));
            const currentDomain = window.location.hostname;
            const internalLinks = allLinks.filter(link => {
                try {
                    const url = new URL(link.href);
                    return url.hostname === currentDomain;
                } catch {
                    return true; // Count relative URLs as internal
                }
            });

            // Return enhanced data
            return {
                ...existingData,
				internalLinks: internalLinks.length,
                externalLinks: allLinks.length - internalLinks.length,
                performance: {
                    loadTime,
                    domContentLoaded,
                    pageSize,
                    wordCount
                },
                security: {
                    hasHttps,
                    hasCsp
                },
                mobile: {
                    hasTouchIcons,
                    hasManifest,
                    smallFontCount: fontSizes,
                    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content')
                },
                issues: {
                    brokenImages
                },
                meta: {
                    keywords: metaKeywords,
                    author: metaAuthor,
                    favicons
                }
            };
        });

        // Add console coverage data
        const client = await page.target().createCDPSession();
        await client.send('Console.enable');
        await client.send('Runtime.enable');
        const consoleMessages: any[] = [];
        client.on('Console.messageAdded', (message: any) => {
            consoleMessages.push(message);
        });

        // Get network stats
        const networkStats = await page.metrics();

		// Combine networkStats with seoData
        const combinedData = {
            ...seoData,
            network: {
                JSHeapUsedSize: Math.round((networkStats as any).JSHeapUsedSize / 1024 / 1024),
                JSHeapTotalSize: Math.round((networkStats as any).JSHeapTotalSize / 1024 / 1024),
                ScriptDuration: Math.round((networkStats as any).ScriptDuration * 1000),
                TaskDuration: Math.round((networkStats as any).TaskDuration * 1000)
            }
        };

        // Get AI analysis
        const messages = [
            { role: "system", content: "You are an SEO expert. Analyze websites and provide a score from 1-100 where 100 is perfect SEO. Score based on these criteria:\n- Title (20 points): Exists, 50-60 chars, relevant\n- Meta Description (20 points): Exists, 150-160 chars, informative\n- H1 Usage (20 points): Exactly one H1 tag\n- Images (20 points): All images have alt text\n- Link Structure (20 points): Reasonable number of internal/external links\n\nRespond ONLY with valid JSON: {\"score\": number, \"analysis\": string[]}" },
            {
                role: "user",
                content: `Analyze the following SEO data and respond ONLY with valid JSON in the following format: {\"score\": number, \"analysis\": string[]}":
                    Title: ${seoData.title}
                    Meta Description: ${seoData.metaDescription || 'Not found'}
                    Number of H1 Tags: ${seoData.h1Count}
                    Images without Alt Text: ${seoData.imagesWithoutAlt}
					Internal Links: ${seoData.internalLinks}
                    External Links: ${seoData.externalLinks}`
            }
        ];

        const aiResponse = await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages });
        let analysis;
        try {
            analysis = JSON.parse(aiResponse.response);
			if (!Array.isArray(analysis.analysis)) {
                throw new Error('Analysis is not in expected format');
            }
        } catch (e) {
            analysis = {
                score: 0,
                analysis: ["Error processing AI response. Please try again."]
            };
        }

        const resultHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>SEO Analysis Result</title>
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: 'Segoe UI', system-ui, sans-serif;
                            min-height: 100vh;
                            background: linear-gradient(135deg, #1e1e2e 0%, #2d2b55 100%);
                            color: #fff;
                            display: flex;
                            flex-direction: column;
                        }

                        .container {
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 40px 20px;
                            flex: 1;
                        }

                        h1, h2 {
                            background: linear-gradient(90deg, #ff6b6b, #4ecdc4);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            margin-bottom: 20px;
                        }

                        .card {
                            background: rgba(255, 255, 255, 0.1);
                            backdrop-filter: blur(10px);
                            border-radius: 15px;
                            padding: 30px;
                            margin: 20px 0;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.1);
                        }

                        .score {
                            font-size: 3em;
                            font-weight: bold;
                            text-align: center;
                            margin: 20px 0;
                            background: linear-gradient(90deg, #4ecdc4, #2cb5e8);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }

                        .analysis-item {
                            background: rgba(255, 255, 255, 0.05);
                            padding: 15px;
                            margin: 10px 0;
                            border-radius: 8px;
                            transition: transform 0.2s ease;
                        }

                        .analysis-item:hover {
                            transform: translateX(10px);
                        }

                        .back-button {
                            margin-top: 30px;
                            text-align: center;
                        }

                        .back-button a {
                            color: #4ecdc4;
                            text-decoration: none;
                            padding: 10px 20px;
                            border: 2px solid #4ecdc4;
                            border-radius: 8px;
                            transition: all 0.3s ease;
                        }

                        .back-button a:hover {
                            background: #4ecdc4;
                            color: #1e1e2e;
                        }

                        footer {
                            text-align: center;
                            padding: 20px;
                            background: rgba(0, 0, 0, 0.2);
                            color: rgba(255, 255, 255, 0.7);
                            font-size: 0.9em;
                        }

                        footer span {
                            color: #ff6b6b;
                        }
							.metric-grid {
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                            gap: 20px;
                            margin: 20px 0;
                        }

                        .metric-card {
                            background: rgba(255, 255, 255, 0.05);
                            padding: 20px;
                            border-radius: 10px;
                            transition: transform 0.2s;
                        }

                        .metric-card:hover {
                            transform: translateY(-5px);
                        }

                        .metric-title {
                            color: #4ecdc4;
                            margin-bottom: 15px;
                            font-size: 1.2em;
                        }

                        .status-good {
                            color: #4ecdc4;
                        }

                        .status-warning {
                            color: #ffd93d;
                        }

                        .status-bad {
                            color: #ff6b6b;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>SEO Analysis Results</h1>
                        <div class="card">
                            <div class="score">${analysis.score}/100</div>
                            
                            <div class="metric-grid">
                                <div class="metric-card">
                                    <div class="metric-title">🎯 Basic SEO</div>
                                    <div class="analysis-item">
                                        <strong>Title:</strong> ${seoData.title || 'Not found'} (${seoData.title?.length || 0} chars)
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Meta Description:</strong> ${seoData.metaDescription || 'Not found'} (${seoData.metaDescription?.length || 0} chars)
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Canonical URL:</strong> ${seoData.canonicalUrl || 'Not found'}
                                    </div>
                                </div>

                                <div class="metric-card">
                                    <div class="metric-title">⚡ Performance</div>
                                    <div class="analysis-item">
                                        <strong>Load Time:</strong> ${Math.round(seoData.performance.loadTime / 1000)}s
                                    </div>
                                    <div class="analysis-item">
                                        <strong>DOM Content Loaded:</strong> ${Math.round(seoData.performance.domContentLoaded / 1000)}s
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Page Size:</strong> ${Math.round(seoData.performance.pageSize / 1024)}KB
                                    </div>
                                </div>

                                <div class="metric-card">
                                    <div class="metric-title">📱 Mobile Optimization</div>
                                    <div class="analysis-item">
                                        <strong>Viewport Meta:</strong> ${seoData.mobile.viewport ? '✅' : '❌'}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Touch Icons:</strong> ${seoData.mobile.hasTouchIcons ? '✅' : '❌'}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Small Font Issues:</strong> ${seoData.mobile.smallFontCount} elements
                                    </div>
                                </div>

                                <div class="metric-card">
                                    <div class="metric-title">🔒 Security</div>
                                    <div class="analysis-item">
                                        <strong>HTTPS:</strong> ${seoData.security.hasHttps ? '✅' : '❌'}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Content Security Policy:</strong> ${seoData.security.hasCsp ? '✅' : '❌'}
                                    </div>
                                </div>

                                <div class="metric-card">
                                    <div class="metric-title">🔗 Content Structure</div>
                                    <div class="analysis-item">
                                        <strong>Word Count:</strong> ${seoData.performance.wordCount}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Heading Structure:</strong> 
                                        H1: ${seoData.h1Count} | 
                                        H2: ${seoData.h2Count} | 
                                        H3: ${seoData.h3Count}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Links:</strong> 
                                        Internal: ${seoData.internalLinks} | 
                                        External: ${seoData.externalLinks}
                                    </div>
                                </div>

                                <div class="metric-card">
                                    <div class="metric-title">⚠️ Issues</div>
                                    <div class="analysis-item">
                                        <strong>Images without Alt:</strong> ${seoData.imagesWithoutAlt}
                                    </div>
                                    <div class="analysis-item">
                                        <strong>Broken Images:</strong> ${seoData.issues.brokenImages}
                                    </div>
                                </div>
								<div class="metric-card">
									<div class="metric-title">🌐 Network Stats</div>
									<div class="analysis-item">
										<strong>JS Heap Used:</strong> ${combinedData.network.JSHeapUsedSize}MB
									</div>
									<div class="analysis-item">
										<strong>JS Heap Total:</strong> ${combinedData.network.JSHeapTotalSize}MB
									</div>
									<div class="analysis-item">
										<strong>Script Duration:</strong> ${combinedData.network.ScriptDuration}ms
									</div>
									<div class="analysis-item">
										<strong>Task Duration:</strong> ${combinedData.network.TaskDuration}ms
									</div>
								</div>
                            </div>

                            <h2>AI Analysis</h2>
                            ${analysis.analysis.map((item: string) => `<div class="analysis-item">• ${item}</div>`).join('')}
                            
                            <div class="back-button">
                                <a href="/">← Analyze another URL</a>
                            </div>
                        </div>
                    </div>
                    <footer>
                        made w/ ♥ in sf🌁 with cloudflare -> <a href="https://github.com/elizabethsiegle/seo-analysis-browser-rendering-worker">code🧑🏻‍💻</a>
                    </footer>
                </body>
            </html>
        `;

        return c.html(resultHtml);

    } catch (error) {
        return c.text(`Error analyzing URL: ${error}`, 500);
    }
});

export default app;
