import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeProduct as geminiAnalyze, askQuestion, generateMarketplaceUrls } from './services/gemini.js';
import { scrapeProduct } from './services/scraper.js';
import type { AnalyzeRequest, AnalyzeResponse, ProductData, PriceData, AskAIRequest, AskAIResponse } from './types/index.js';

// Load environment variables
dotenv.config();

// Prevent process crash on unhandled errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 3005;

// In-memory cache for analyzed products (used by /api/prices/:productId)
const productCache = new Map<string, { product: ProductData; prices: PriceData[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3005'],
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /api/analyze
 * Analyze a product from a URL using web scraping + Gemini AI
 */
app.post('/api/analyze', async (req, res) => {
    const startTime = Date.now();

    try {
        const { url } = req.body as AnalyzeRequest;

        if (!url) {
            res.status(400).json({ message: 'URL is required' });
            return;
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            res.status(400).json({ message: 'Invalid URL format' });
            return;
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`Analyzing product: ${url}`);
        console.log(`${'='.repeat(60)}`);

        // Detect marketplace
        const marketplace = detectMarketplace(url);
        console.log(`Detected marketplace: ${marketplace}`);

        // Step 1: Try Cheerio scraping (best effort, often fails for JS-rendered sites)
        console.log('\nStep 1: Attempting HTML scraping (best effort)...');
        let scrapedData = null;
        try {
            scrapedData = await scrapeProduct(url);
            if (scrapedData) {
                console.log(`✓ Scraper found: title="${scrapedData.title?.substring(0, 40)}", price=${scrapedData.price.current}`);
            } else {
                console.log('✗ Scraper returned null (expected for JS-rendered sites)');
            }
        } catch (err) {
            console.log('✗ Scraper error (non-fatal):', err);
        }

        // Step 2: Get AI analysis using Gemini with Google Search grounding (PRIMARY data source)
        console.log('\nStep 2: Getting AI analysis via Gemini (primary data source)...');
        const geminiResult = await geminiAnalyze(url);
        console.log(`✓ Gemini returned: title="${geminiResult.product.title?.substring(0, 40)}", price=${geminiResult.product.price.current}, images=${geminiResult.product.images.length}, prices=${geminiResult.prices.length}`);

        const productId = Buffer.from(url).toString('base64').slice(0, 16);

        // Step 3: Merge data — prioritize scraped data for fields where it's available, fall back to Gemini
        console.log('\nStep 3: Merging data sources...');

        const hasScrapedTitle = scrapedData?.title && scrapedData.title !== 'Product';
        const hasScrapedPrice = scrapedData?.price?.current && scrapedData.price.current > 0;
        const hasGeminiTitle = geminiResult.product.title && geminiResult.product.title !== 'Product';
        const hasGeminiPrice = geminiResult.product.price.current > 0;

        const productData: ProductData = {
            id: productId,
            title: hasScrapedTitle ? scrapedData!.title : (hasGeminiTitle ? geminiResult.product.title : extractTitleFromUrl(url)),
            brand: scrapedData?.brand || geminiResult.product.brand || '',
            model: '',
            price: {
                current: hasScrapedPrice ? scrapedData!.price.current : (hasGeminiPrice ? geminiResult.product.price.current : 0),
                original: scrapedData?.price?.original || geminiResult.product.price.original,
                currency: scrapedData?.price?.currency || geminiResult.product.price.currency || 'INR'
            },
            images: pickBest(
                scrapedData?.images,
                geminiResult.product.images
            ),
            specifications: pickBestObject(
                scrapedData?.specifications,
                geminiResult.product.specifications
            ),
            ratings: {
                average: scrapedData?.ratings?.average || geminiResult.product.ratings.average || 0,
                count: scrapedData?.ratings?.count || geminiResult.product.ratings.count || 0
            },
            highlights: pickBest(
                scrapedData?.highlights,
                geminiResult.product.highlights
            ),
            source: {
                marketplace,
                url
            },
            scrapedAt: new Date().toISOString()
        };

        console.log(`Final product: "${productData.title?.substring(0, 40)}", price=${productData.price.current}, images=${productData.images.length}`);

        // Step 4: Build price comparison from Gemini's data
        console.log('\nStep 4: Building price comparison...');

        let prices: PriceData[] = geminiResult.prices.map(p => ({
            store: p.store,
            price: p.price,
            currency: p.currency,
            url: p.url,
            availability: p.availability,
            savings: undefined,
            isBestPrice: false
        }));

        // If Gemini didn't find the source store, add it
        const sourceInPrices = prices.some(p =>
            p.store.toLowerCase() === marketplace.toLowerCase()
        );
        if (!sourceInPrices && productData.price.current > 0) {
            prices.unshift({
                store: marketplace,
                price: productData.price.current,
                currency: 'INR',
                url: url,
                availability: 'in-stock',
                savings: undefined,
                isBestPrice: false
            });
        }

        // Calculate best price and savings
        if (prices.length > 0) {
            const validPrices = prices.filter(p => p.price > 0);
            if (validPrices.length > 0) {
                const bestPrice = Math.min(...validPrices.map(p => p.price));
                const maxPrice = Math.max(...validPrices.map(p => p.price));
                prices.forEach(p => {
                    if (p.price > 0) {
                        p.isBestPrice = p.price === bestPrice;
                        p.savings = p.price > bestPrice ? Math.round(p.price - bestPrice) : undefined;
                    }
                });
            }
        }

        // If no price comparison found, add search links as fallback
        if (prices.length <= 1 && productData.title !== 'Product') {
            console.log('No other prices found, adding search links as fallback');
            const marketplaceUrls = generateMarketplaceUrls(productData.title, marketplace);
            for (const mp of marketplaceUrls.slice(0, 3)) {
                prices.push({
                    store: mp.name,
                    price: 0,
                    currency: 'INR',
                    url: mp.searchUrl,
                    availability: 'in-stock',
                    savings: undefined,
                    isBestPrice: false
                });
            }
        }

        console.log(`Price comparison: ${prices.length} stores`);
        prices.forEach(p => console.log(`  ${p.store}: ₹${p.price} ${p.isBestPrice ? '(BEST)' : ''}`));

        const processingTime = (Date.now() - startTime) / 1000;

        // Cache the result for the /api/prices endpoint
        productCache.set(productId, {
            product: productData,
            prices,
            timestamp: Date.now()
        });

        const response: AnalyzeResponse = {
            product: productData,
            prices,
            aiAnalysis: {
                content: geminiResult.analysis,
                sources: geminiResult.sources,
                timestamp: geminiResult.timestamp
            },
            processingTime
        };

        console.log(`\n✓ Analysis completed in ${processingTime.toFixed(1)}s`);
        console.log(`${'='.repeat(60)}\n`);

        res.json(response);

    } catch (error) {
        console.error('Error analyzing product:', error);
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Failed to analyze product'
        });
    }
});

/**
 * POST /api/ask-ai
 * Ask a follow-up question about a product
 */
app.post('/api/ask-ai', async (req, res) => {
    try {
        const { productData, question } = req.body as AskAIRequest;

        if (!question) {
            res.status(400).json({ message: 'Question is required' });
            return;
        }

        console.log(`AI Question: ${question}`);

        const response = await askQuestion(productData, question);

        const result: AskAIResponse = {
            answer: response.answer,
            confidence: response.confidence
        };

        res.json(result);

    } catch (error) {
        console.error('Error in ask-ai:', error);
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Failed to get AI response'
        });
    }
});

/**
 * GET /api/prices/:productId
 * Get cached price comparison for a product
 */
app.get('/api/prices/:productId', async (req, res) => {
    try {
        const { productId } = req.params;

        console.log(`Fetching prices for product: ${productId}`);

        // Look up in cache
        const cached = productCache.get(productId);

        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            console.log('Returning cached price data');
            res.json({
                productId,
                prices: cached.prices,
                lastUpdated: new Date(cached.timestamp).toISOString()
            });
            return;
        }

        // If not in cache, return empty with a helpful message
        console.log('Product not found in cache');
        res.status(404).json({
            message: 'Price data not found. Please analyze the product first using POST /api/analyze',
            productId
        });

    } catch (error) {
        console.error('Error fetching prices:', error);
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Failed to fetch prices'
        });
    }
});

// ============= Helper functions =============

function detectMarketplace(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('amazon')) return 'Amazon';
    if (lowerUrl.includes('flipkart')) return 'Flipkart';
    if (lowerUrl.includes('myntra')) return 'Myntra';
    if (lowerUrl.includes('meesho')) return 'Meesho';
    if (lowerUrl.includes('croma')) return 'Croma';
    if (lowerUrl.includes('reliancedigital') || lowerUrl.includes('reliance digital')) return 'Reliance Digital';
    if (lowerUrl.includes('jiomart')) return 'JioMart';
    return 'Generic';
}

function extractTitleFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const productPart = pathParts.find(part =>
            part.length > 10 && !part.match(/^[a-zA-Z0-9]{10}$/)
        );
        if (productPart) {
            return productPart.replace(/-/g, ' ').replace(/_/g, ' ');
        }
        return `Product from ${urlObj.hostname}`;
    } catch {
        return 'Product';
    }
}

/**
 * Pick the best array — prefer the one with more items, but only if it has real content
 */
function pickBest(a?: string[], b?: string[]): string[] {
    const aValid = a && a.length > 0;
    const bValid = b && b.length > 0;

    if (aValid && bValid) {
        return a!.length >= b!.length ? a! : b!;
    }
    return (aValid ? a! : bValid ? b! : []);
}

/**
 * Pick the best object — prefer the one with more keys
 */
function pickBestObject(a?: Record<string, string>, b?: Record<string, string>): Record<string, string> {
    const aKeys = a ? Object.keys(a).length : 0;
    const bKeys = b ? Object.keys(b).length : 0;

    if (aKeys >= bKeys && aKeys > 0) return a!;
    if (bKeys > 0) return b!;
    return {};
}

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 BuySense backend running at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔑 Gemini API key: ${process.env.GEMINI_API_KEY ? '✓ Set' : '✗ Missing!'}`);
});
