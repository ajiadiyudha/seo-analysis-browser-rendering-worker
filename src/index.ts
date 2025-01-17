import { Hono } from 'hono';
import puppeteer from "@cloudflare/puppeteer";
import { serveStatic } from '@hono/node-server/serve-static'

interface Env {
    BROWSER: any;
    AI: any;
}

const app = new Hono<{ Bindings: Env }>();

// Serve the / HTML form
app.get('/', serveStatic({ root: './assets' }));

// Handle the analysis
app.post('/analyze', async (c) => {
    const formData = await c.req.formData();
    const url = formData.get('url')?.toString();

    if (!url) {
        return c.text('URL is required', 400);
    }

    try {
        const browser = await puppeteer.launch(c.env.BROWSER);
        const page = await browser.newPage();
        await page.goto(url);

        const seoData = await page.evaluate((): any => {
            const title = document.title;
            const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
            const h1Tags = document.querySelectorAll('h1').length;
            const imgTags = Array.from(document.querySelectorAll('img')).filter(img => !img.getAttribute('alt')).length;
            const links = document.querySelectorAll('a').length;

            return {
                title,
                metaDescription,
                h1Count: h1Tags,
                imagesWithoutAlt: imgTags,
                linkCount: links
            };
        });

        // Get AI analysis
        const messages = [
            { role: "system", content: "You are an SEO expert. Analyze websites and provide a score from 1-100 where 100 is perfect SEO. Score based on these criteria:\n- Title (20 points): Exists, 50-60 chars, relevant\n- Meta Description (20 points): Exists, 150-160 chars, informative\n- H1 Usage (20 points): Exactly one H1 tag\n- Images (20 points): All images have alt text\n- Link Structure (20 points): Reasonable number of internal/external links\n\nRespond ONLY with valid JSON: {\"score\": number, \"analysis\": string[]}" },
            {
                role: "user",
                content: `Analyze this SEO data and respond with JSON only:
                    Title: ${seoData.title}
                    Meta Description: ${seoData.metaDescription}
                    Number of H1 Tags: ${seoData.h1Count}
                    Images without Alt Text: ${seoData.imagesWithoutAlt}
                    Number of Links: ${seoData.linkCount}`
            }
        ];

        const aiResponse = await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages });
        let analysis;
        try {
            analysis = JSON.parse(aiResponse.response);
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
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>SEO Analysis Results</h1>
                        <div class="card">
                            <div class="score">${analysis.score}/100</div>
                            
                            <h2>Page Data</h2>
                            <div class="analysis-item">
                                <strong>Title:</strong> ${seoData.title || 'Not found'}
                            </div>
                            <div class="analysis-item">
                                <strong>Meta Description:</strong> ${seoData.metaDescription || 'Not found'}
                            </div>
                            <div class="analysis-item">
                                <strong>H1 Tags:</strong> ${seoData.h1Count}
                            </div>
                            <div class="analysis-item">
                                <strong>Images Missing Alt Text:</strong> ${seoData.imagesWithoutAlt}
                            </div>
                            <div class="analysis-item">
                                <strong>Total Links:</strong> ${seoData.linkCount}
                            </div>

                            <h2>AI-Generated Findings</h2>
                            ${analysis.analysis.map((item: string) => `<div class="analysis-item">• ${item}</div>`).join('')}
                            <div class="back-button">
                                <a href="/">← Analyze another URL</a>
                            </div>
                        </div>
                    </div>
                    <footer>
                        made w/ ♥ in sf🌁 with cloudflare
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
