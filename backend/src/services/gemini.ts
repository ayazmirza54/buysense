import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini AI client
const getAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    return new GoogleGenAI({ apiKey });
};

// Type for extracted product data
export interface ExtractedProductData {
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

// Type for AI analysis result
export interface AnalysisResult {
    content: string;
    sources: {
        title: string;
        uri: string;
    }[];
    timestamp: string;
    extractedData?: ExtractedProductData;
}

/**
 * Analyze a product from a URL using Gemini with Google Search grounding
 * Returns both markdown analysis and structured product data
 */
export const analyzeProduct = async (productUrl: string): Promise<AnalysisResult> => {
    const ai = getAIClient();

    const prompt = `
    You are an expert shopping analyst for BuySense. Analyze the product from this link: ${productUrl}
    
    IMPORTANT: Your response MUST be in TWO parts:
    
    PART 1 - JSON DATA (between <JSON_DATA> tags):
    Extract the following structured data about the product. Use real data from search results.
    <JSON_DATA>
    {
        "title": "Full product name",
        "brand": "Brand name",
        "price": {
            "current": 0,
            "original": 0,
            "currency": "INR"
        },
        "specifications": {
            "key1": "value1",
            "key2": "value2"
        },
        "ratings": {
            "average": 0,
            "count": 0
        },
        "highlights": [
            "Feature 1",
            "Feature 2",
            "Feature 3",
            "Feature 4"
        ],
        "imageSearchQuery": "exact product name for image search"
    }
    </JSON_DATA>
    
    PART 2 - MARKDOWN ANALYSIS (after the JSON):
    Provide a comprehensive, structured analysis including:
    1. **Product Overview**: Complete name, brand, key specifications, and market reputation
    2. **Price Analysis**: Current price, historical trends, and if it's a good deal
    3. **Market Comparison**: Prices from at least 3 other major marketplaces (Amazon, Flipkart, Myntra, Meesho, Croma, Reliance Digital)
    4. **Value Assessment**: Is this product worth buying? Why or why not?
    5. **Pros & Cons**: Top 3-5 advantages and disadvantages
    6. **BuySense Score**: A rating out of 10 based on value for money, quality, and availability
    7. **Recommendation**: Clear buy/skip advice with reasoning
    
    Structure the markdown with clear headings and bullet points for readability.
    Focus on factual information and practical advice for shoppers.
  `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const fullContent = response.text || "No analysis available.";

        // Extract JSON data from response
        let extractedData: ExtractedProductData | undefined;
        let markdownContent = fullContent;

        const jsonMatch = fullContent.match(/<JSON_DATA>([\s\S]*?)<\/JSON_DATA>/);
        if (jsonMatch) {
            try {
                const jsonStr = jsonMatch[1].trim();
                const parsed = JSON.parse(jsonStr);
                extractedData = {
                    title: parsed.title || "Product",
                    brand: parsed.brand || "",
                    price: {
                        current: parsed.price?.current || 0,
                        original: parsed.price?.original,
                        currency: parsed.price?.currency || "INR"
                    },
                    images: [],
                    specifications: parsed.specifications || {},
                    ratings: {
                        average: parsed.ratings?.average || 0,
                        count: parsed.ratings?.count || 0
                    },
                    highlights: parsed.highlights || []
                };
                // Remove JSON block from markdown content
                markdownContent = fullContent.replace(/<JSON_DATA>[\s\S]*?<\/JSON_DATA>/, '').trim();
            } catch (e) {
                console.error("Failed to parse JSON data from AI response:", e);
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

        // Try to get product images from grounding sources
        if (extractedData && sources.length > 0) {
            // Use the first image URL from sources if available
            const imageUrls = sources
                .filter((s: { uri: string }) => s.uri.match(/\.(jpg|jpeg|png|webp|gif)/i))
                .map((s: { uri: string }) => s.uri)
                .slice(0, 5);

            if (imageUrls.length > 0) {
                extractedData.images = imageUrls;
            }
        }

        return {
            content: markdownContent,
            sources,
            timestamp: new Date().toISOString(),
            extractedData
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

    const prompt = `
    You are a helpful shopping assistant for BuySense. Answer the following question about this product:

    **Product:** ${productData.title}
    **Price:** ${productData.price.currency} ${productData.price.current}
    ${productData.specifications ? `**Specifications:** ${JSON.stringify(productData.specifications)}` : ''}
    ${productData.ratings ? `**Ratings:** ${productData.ratings.average}/5 (${productData.ratings.count} reviews)` : ''}
    ${productData.highlights ? `**Key Features:** ${productData.highlights.join(', ')}` : ''}

    **Question:** ${question}

    Provide a helpful, accurate, and concise answer based on your knowledge and the product details provided.
    Use information from your training and web search to give the most relevant answer.
    If you're not sure about something, say so honestly.
  `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
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
 * Generate marketplace search URLs for a product
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

    // Filter out the source marketplace
    return marketplaces.filter(m => m.name.toLowerCase() !== sourceMarketplace.toLowerCase());
}
