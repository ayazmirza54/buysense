import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini AI client
const getAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    return new GoogleGenAI({ apiKey });
};

// Type for extracted product data from Gemini
export interface GeminiProductData {
    title: string;
    brand: string;
    price: {
        current: number;
        original?: number;
        currency: string;
    };
    images: string[];
    specifications: Record<string, string>;
    ratings: {
        average: number;
        count: number;
    };
    highlights: string[];
}

// Type for price comparison entry from Gemini
export interface GeminiPriceEntry {
    store: string;
    price: number;
    currency: string;
    url: string;
    availability: 'in-stock' | 'out-of-stock' | 'limited';
}

// Type for the full Gemini analysis result
export interface GeminiAnalysisResult {
    product: GeminiProductData;
    prices: GeminiPriceEntry[];
    analysis: string;
    sources: {
        title: string;
        uri: string;
    }[];
    timestamp: string;
}

/**
 * Analyze a product from a URL using Gemini with Google Search grounding.
 * This is the PRIMARY data source — it extracts real product data + prices + analysis.
 */
export const analyzeProduct = async (productUrl: string): Promise<GeminiAnalysisResult> => {
    const ai = getAIClient();

    const prompt = `You are a product data extraction and analysis engine for BuySense.

TASK: Extract REAL, ACCURATE data about the product at this URL: ${productUrl}

You MUST search the web for this exact product and return ONLY factual, verified information. Do NOT make up or estimate any numbers. If you cannot find a specific piece of data, use 0 for numbers and empty string for text.

Your response MUST be in exactly this format — a JSON code block followed by a markdown analysis:

\`\`\`json
{
    "product": {
        "title": "The exact full product name as listed on the store",
        "brand": "The brand name",
        "price": {
            "current": 0,
            "original": 0,
            "currency": "INR"
        },
        "images": [
            "direct URL to product image 1",
            "direct URL to product image 2"
        ],
        "specifications": {
            "Key Spec 1": "Value 1",
            "Key Spec 2": "Value 2"
        },
        "ratings": {
            "average": 0.0,
            "count": 0
        },
        "highlights": [
            "Key feature 1",
            "Key feature 2",
            "Key feature 3"
        ]
    },
    "prices": [
        {
            "store": "Store Name (e.g. Amazon, Flipkart, Croma, Reliance Digital, Myntra, Meesho, JioMart)",
            "price": 0,
            "currency": "INR",
            "url": "Direct URL to the product on that store OR search URL if exact product page not found",
            "availability": "in-stock"
        }
    ]
}
\`\`\`

CRITICAL RULES FOR THE JSON:
1. price.current MUST be the ACTUAL selling price shown on the product page. NOT 0, NOT estimated.
2. price.original is the MRP / strikethrough price if a discount is shown. Set to 0 if no discount.
3. images MUST be real, valid image URLs from the product page or product listing. Prefer high-resolution images. Include at least 1 image.
4. ratings.average must be the actual star rating (e.g., 4.2 out of 5). Set to 0 if not available.
5. ratings.count must be the actual number of ratings/reviews. Set to 0 if not available.
6. specifications should include 5-10 key technical specifications relevant to the product category.
7. highlights should be 3-6 key selling points or features of the product.
8. For the prices array: Search for this EXACT product (or very close match) on Amazon India, Flipkart, Croma, Reliance Digital, Myntra, and Meesho. Only include stores where you can find a real price. Include the source store from the URL as the first entry for the prices array.
9. Each price entry must have a real URL — either a direct product link or a search results link for that store.
10. Do NOT invent prices. Only include a store if you found an actual price for this product there.

After the JSON block, provide a markdown analysis with these sections:
## Product Overview
Brief overview of the product, its positioning, and reputation.

## Price Analysis
Is the current price good? Any known discounts or deals?

## Pros
- Pro 1
- Pro 2
- Pro 3

## Cons
- Con 1
- Con 2
- Con 3

## Recommendation
A clear BUY / SKIP / CONSIDER recommendation with brief reasoning.

## BuySense Score: X/10
One-line justification for the score.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-flash-lite-latest",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const fullContent = response.text || "No analysis available.";

        // Parse JSON from the response
        let product: GeminiProductData = {
            title: "Product",
            brand: "",
            price: { current: 0, currency: "INR" },
            images: [],
            specifications: {},
            ratings: { average: 0, count: 0 },
            highlights: []
        };
        let prices: GeminiPriceEntry[] = [];
        let analysisContent = fullContent;

        // Try to extract JSON from code block
        const jsonMatch = fullContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());

                if (parsed.product) {
                    product = {
                        title: parsed.product.title || "Product",
                        brand: parsed.product.brand || "",
                        price: {
                            current: parsed.product.price?.current || 0,
                            original: parsed.product.price?.original || undefined,
                            currency: parsed.product.price?.currency || "INR"
                        },
                        images: Array.isArray(parsed.product.images) ? parsed.product.images.filter((img: string) => img && img.startsWith('http')) : [],
                        specifications: parsed.product.specifications || {},
                        ratings: {
                            average: parsed.product.ratings?.average || 0,
                            count: parsed.product.ratings?.count || 0
                        },
                        highlights: Array.isArray(parsed.product.highlights) ? parsed.product.highlights : []
                    };

                    // Clean up original price — set to undefined if 0 or less than current
                    if (product.price.original && (product.price.original <= 0 || product.price.original <= product.price.current)) {
                        product.price.original = undefined;
                    }
                }

                if (Array.isArray(parsed.prices)) {
                    prices = parsed.prices
                        .filter((p: any) => p.price > 0)
                        .map((p: any) => ({
                            store: p.store || 'Unknown',
                            price: p.price || 0,
                            currency: p.currency || 'INR',
                            url: p.url || '',
                            availability: p.availability || 'in-stock'
                        }));
                }

                // Remove JSON block from the analysis content
                analysisContent = fullContent.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
            } catch (e) {
                console.error("Failed to parse JSON from Gemini response:", e);
                // Try a more lenient approach - look for { at start
                try {
                    const rawJson = jsonMatch[1].trim();
                    // Remove trailing commas before } or ]
                    const cleaned = rawJson.replace(/,\s*([}\]])/g, '$1');
                    const parsed = JSON.parse(cleaned);
                    if (parsed.product) {
                        product = {
                            title: parsed.product.title || "Product",
                            brand: parsed.product.brand || "",
                            price: {
                                current: parsed.product.price?.current || 0,
                                currency: parsed.product.price?.currency || "INR"
                            },
                            images: [],
                            specifications: parsed.product.specifications || {},
                            ratings: { average: 0, count: 0 },
                            highlights: []
                        };
                    }
                } catch {
                    console.error("Lenient JSON parsing also failed");
                }
            }
        }

        // Extract sources from grounding metadata
        const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks || [];
        const sources = groundingChunks
            .map((chunk: any) => ({
                title: chunk.web?.title || "Reference",
                uri: chunk.web?.uri || ""
            }))
            .filter((s: { title: string; uri: string }) => s.uri !== "");

        console.log(`Gemini extracted: title="${product.title?.substring(0, 50)}", price=${product.price.current}, images=${product.images.length}, prices=${prices.length}`);

        return {
            product,
            prices,
            analysis: analysisContent,
            sources,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error in analyzeProduct:", error);
        throw new Error("Failed to analyze product. Please try again later.");
    }
};

/**
 * Answer a follow-up question about a product using Gemini
 */
export const askQuestion = async (
    productData: {
        title: string;
        price: { current: number; currency: string };
        specifications?: Record<string, string>;
        ratings?: { average: number; count: number };
        highlights?: string[];
    },
    question: string
): Promise<{ answer: string; confidence: number }> => {
    const ai = getAIClient();

    const prompt = `You are a helpful shopping assistant for BuySense. Answer the following question about this product:

**Product:** ${productData.title}
**Price:** ${productData.price.currency} ${productData.price.current}
${productData.specifications ? `**Specifications:** ${JSON.stringify(productData.specifications)}` : ''}
${productData.ratings ? `**Ratings:** ${productData.ratings.average}/5 (${productData.ratings.count} reviews)` : ''}
${productData.highlights ? `**Key Features:** ${productData.highlights.join(', ')}` : ''}

**Question:** ${question}

Provide a helpful, accurate, and concise answer based on the product details and your web search results.
If you're not sure about something, say so honestly. Do NOT make up information.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-flash-lite-latest",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const answer = response.text || "I couldn't generate an answer. Please try again.";

        return {
            answer,
            confidence: 0.85
        };
    } catch (error) {
        console.error("Error in askQuestion:", error);
        throw new Error("Failed to get AI response. Please try again later.");
    }
};

/**
 * Generate marketplace search URLs for a product (fallback for price comparison)
 */
export function generateMarketplaceUrls(productTitle: string, sourceMarketplace: string): Array<{
    name: string;
    searchUrl: string;
}> {
    const encodedQuery = encodeURIComponent(productTitle);

    const marketplaces = [
        { name: 'Amazon', searchUrl: `https://www.amazon.in/s?k=${encodedQuery}` },
        { name: 'Flipkart', searchUrl: `https://www.flipkart.com/search?q=${encodedQuery}` },
        { name: 'Myntra', searchUrl: `https://www.myntra.com/${encodedQuery.replace(/%20/g, '-')}` },
        { name: 'Meesho', searchUrl: `https://www.meesho.com/search?q=${encodedQuery}` },
        { name: 'Croma', searchUrl: `https://www.croma.com/search/?q=${encodedQuery}` },
        { name: 'Reliance Digital', searchUrl: `https://www.reliancedigital.in/search?q=${encodedQuery}` },
    ];

    return marketplaces.filter(m => m.name.toLowerCase() !== sourceMarketplace.toLowerCase());
}
