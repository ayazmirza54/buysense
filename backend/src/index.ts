import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeProduct as geminiAnalyze, askQuestion, generateMarketplaceUrls } from './services/gemini.js';
import { scrapeProduct, searchProductPrices } from './services/scraper.js';
import type { AnalyzeRequest, AnalyzeResponse, ProductData, PriceData, AskAIRequest, AskAIResponse } from './types/index.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
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

        console.log(`Analyzing product: ${url}`);

        // Detect marketplace
        const marketplace = detectMarketplace(url);

        // Step 1: Try to scrape real product data from the page
        console.log('Step 1: Scraping product data...');
        const scrapedData = await scrapeProduct(url);

        // Step 2: Get AI analysis using Gemini with Google Search grounding
        console.log('Step 2: Getting AI analysis...');
        const aiAnalysis = await geminiAnalyze(url);

        // Use scraped data if available, otherwise fall back to AI extracted data
        const extractedData = aiAnalysis.extractedData;
        const productId = Buffer.from(url).toString('base64').slice(0, 12);

        // Prioritize scraped data over AI-extracted data for accuracy
        const productData: ProductData = {
            id: productId,
            title: scrapedData?.title || extractedData?.title || extractTitleFromUrl(url),
            brand: scrapedData?.brand || extractedData?.brand || '',
            model: '',
            price: {
                current: scrapedData?.price?.current || extractedData?.price?.current || 0,
                original: scrapedData?.price?.original || extractedData?.price?.original,
                currency: scrapedData?.price?.currency || extractedData?.price?.currency || 'INR'
            },
            images: scrapedData?.images?.length ? scrapedData.images : (extractedData?.images || []),
            specifications: scrapedData?.specifications && Object.keys(scrapedData.specifications).length > 0
                ? scrapedData.specifications
                : (extractedData?.specifications || {}),
            ratings: {
                average: scrapedData?.ratings?.average || extractedData?.ratings?.average || 0,
                count: scrapedData?.ratings?.count || extractedData?.ratings?.count || 0
            },
            highlights: scrapedData?.highlights?.length ? scrapedData.highlights : (extractedData?.highlights || []),
            source: {
                marketplace,
                url
            },
            scrapedAt: new Date().toISOString()
        };

        console.log('Product data source:', scrapedData ? 'Scraped' : 'AI-extracted');
        console.log('Price:', productData.price.current);

        // Step 3: Search for real prices across marketplaces
        console.log('Step 3: Searching for prices across marketplaces...');
        const searchedPrices = await searchProductPrices(
            productData.title,
            marketplace,
            productData.price.current,
            url
        );

        // Convert to PriceData format and add best price indicator
        const prices: PriceData[] = searchedPrices.map(p => ({
            store: p.store,
            price: p.price,
            currency: p.currency,
            url: p.url,
            availability: p.availability,
            savings: undefined,
            isBestPrice: false
        }));

        // Find best price and calculate savings
        if (prices.length > 0) {
            const bestPrice = Math.min(...prices.map(p => p.price));
            prices.forEach(p => {
                p.isBestPrice = p.price === bestPrice;
                if (p.price > bestPrice) {
                    p.savings = Math.round(p.price - bestPrice);
                }
            });
        }

        // If no prices found from search, fall back to source price with search links
        if (prices.length === 1) {
            console.log('No other marketplace prices found, using search URLs as fallback');
            const marketplaceUrls = generateMarketplaceUrls(productData.title, marketplace);
            for (const mp of marketplaceUrls.slice(0, 3)) {
                prices.push({
                    store: mp.name,
                    price: 0, // Unknown price
                    currency: 'INR',
                    url: mp.searchUrl,
                    availability: 'in-stock',
                    savings: undefined,
                    isBestPrice: false
                });
            }
        }

        const processingTime = (Date.now() - startTime) / 1000;

        const response: AnalyzeResponse = {
            product: productData,
            prices,
            aiAnalysis: {
                content: aiAnalysis.content,
                sources: aiAnalysis.sources,
                timestamp: aiAnalysis.timestamp
            },
            processingTime
        };

        console.log(`Analysis completed in ${processingTime}s`);
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
 * Get updated price comparison for a product
 */
app.get('/api/prices/:productId', async (req, res) => {
    try {
        const { productId } = req.params;

        console.log(`Fetching prices for product: ${productId}`);

        // In production, this would fetch from a cache or database
        // For now, return mock data based on productId
        const mockPrices: PriceData[] = [
            {
                store: 'Amazon',
                price: 299.99,
                currency: 'INR',
                url: `https://amazon.in/dp/${productId}`,
                availability: 'in-stock',
                savings: 10,
                isBestPrice: true
            },
            {
                store: 'Flipkart',
                price: 319.99,
                currency: 'INR',
                url: `https://flipkart.com/product/${productId}`,
                availability: 'in-stock',
                savings: 5,
                isBestPrice: false
            },
            {
                store: 'Walmart',
                price: 329.99,
                currency: 'INR',
                url: `https://walmart.com/ip/${productId}`,
                availability: 'in-stock',
                savings: 0,
                isBestPrice: false
            }
        ];

        res.json({
            productId,
            prices: mockPrices,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error fetching prices:', error);
        res.status(500).json({
            message: error instanceof Error ? error.message : 'Failed to fetch prices'
        });
    }
});

/**
 * Generate real price comparison with actual marketplace SEARCH URLs
 */
function generatePriceComparison(marketplace: string, productTitle: string, productUrl: string, basePrice: number): PriceData[] {
    // Get real marketplace search URLs
    const marketplaceUrls = generateMarketplaceUrls(productTitle, marketplace);

    // Use the extracted price or a default
    const actualPrice = basePrice > 0 ? basePrice : 1999;

    // Create price data for each marketplace with REAL search URLs
    const prices: PriceData[] = marketplaceUrls.slice(0, 4).map((mp, index) => {
        // Simulate slight price variations (since we can't actually scrape real prices)
        const priceVariation = actualPrice * (0.95 + Math.random() * 0.15);
        const price = Math.round(priceVariation);

        return {
            store: mp.name,
            price,
            currency: 'INR',
            url: mp.searchUrl, // REAL search URL for this marketplace
            availability: 'in-stock' as const,
            savings: price < actualPrice ? Math.round(actualPrice - price) : undefined,
            isBestPrice: false
        };
    });

    // Add source marketplace price (original product)
    prices.unshift({
        store: marketplace,
        price: actualPrice,
        currency: 'INR',
        url: productUrl, // Original product URL
        availability: 'in-stock',
        savings: 0,
        isBestPrice: false
    });

    // Find the best price
    const bestPrice = Math.min(...prices.map(p => p.price));
    prices.forEach(p => {
        p.isBestPrice = p.price === bestPrice;
        if (p.price > bestPrice) {
            p.savings = undefined; // No savings if not the best
        }
    });

    return prices;
}

// Helper functions
function detectMarketplace(url: string): string {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('amazon')) return 'Amazon';
    if (lowerUrl.includes('flipkart')) return 'Flipkart';
    if (lowerUrl.includes('myntra')) return 'Myntra';
    if (lowerUrl.includes('meesho')) return 'Meesho';
    if (lowerUrl.includes('croma')) return 'Croma';
    if (lowerUrl.includes('reliancedigital')) return 'Reliance Digital';
    if (lowerUrl.includes('ebay')) return 'eBay';
    if (lowerUrl.includes('walmart')) return 'Walmart';
    if (lowerUrl.includes('bestbuy')) return 'Best Buy';
    return 'Generic';
}

function extractTitleFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        // Try to find product name in path
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

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 BuySense backend running at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
