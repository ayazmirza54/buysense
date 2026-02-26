import type { PriceComparison, AnalysisResult } from '../types';

const API_BASE = 'http://localhost:3005';

// Transform backend response to frontend types
interface BackendResponse {
    product: {
        id: string;
        title: string;
        brand?: string;
        model?: string;
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
        source: {
            marketplace: string;
            url: string;
        };
        scrapedAt: string;
    };
    prices: Array<{
        store: string;
        price: number;
        currency: string;
        url: string;
        availability: 'in-stock' | 'out-of-stock' | 'limited';
        savings?: number;
        isBestPrice: boolean;
    }>;
    aiAnalysis: {
        content: string;
        sources: {
            title: string;
            uri: string;
        }[];
        timestamp: string;
    };
    processingTime: number;
}

interface PricesResponse {
    productId: string;
    prices: Array<{
        store: string;
        price: number;
        currency: string;
        url: string;
        availability: 'in-stock' | 'out-of-stock' | 'limited';
        savings?: number;
        isBestPrice: boolean;
    }>;
    lastUpdated: string;
}

function transformResponse(backend: BackendResponse): AnalysisResult {
    return {
        product: {
            id: backend.product.id,
            title: backend.product.title,
            images: backend.product.images,
            price: backend.product.price,
            specifications: backend.product.specifications,
            ratings: backend.product.ratings,
            highlights: backend.product.highlights,
            source: backend.product.source,
            scrapedAt: new Date(backend.product.scrapedAt),
        },
        priceComparison: {
            productId: backend.product.id,
            stores: backend.prices.map(p => ({
                name: p.store,
                price: p.price,
                currency: p.currency,
                availability: p.availability,
                url: p.url,
                savings: p.savings,
                isBestPrice: p.isBestPrice,
            })),
            lastUpdated: new Date(),
        },
        aiAnalysis: {
            content: backend.aiAnalysis.content,
            sources: backend.aiAnalysis.sources,
            timestamp: backend.aiAnalysis.timestamp,
        },
        processingTime: backend.processingTime,
    };
}

function transformPricesResponse(backend: PricesResponse): PriceComparison {
    return {
        productId: backend.productId,
        stores: backend.prices.map(p => ({
            name: p.store,
            price: p.price,
            currency: p.currency,
            availability: p.availability,
            url: p.url,
            savings: p.savings,
            isBestPrice: p.isBestPrice,
        })),
        lastUpdated: new Date(backend.lastUpdated),
    };
}

export const api = {
    /**
     * Analyze a product from a URL
     */
    async analyzeProduct(url: string): Promise<AnalysisResult> {
        console.log('Analyzing product:', url);

        const response = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        const data = await response.json() as BackendResponse;
        return transformResponse(data);
    },

    /**
     * Get updated prices for a product
     */
    async getPrices(productId: string): Promise<PriceComparison> {
        console.log('Fetching prices for:', productId);

        const response = await fetch(`${API_BASE}/api/prices/${productId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        const data = await response.json() as PricesResponse;
        return transformPricesResponse(data);
    },

    /**
     * Ask AI a question about a product
     */
    async askAI(
        _productId: string,
        question: string,
        productData?: {
            title: string;
            price: { current: number; currency: string };
            specifications?: Record<string, string>;
            ratings?: { average: number; count: number };
            highlights?: string[];
        }
    ): Promise<{ answer: string; confidence: number }> {
        console.log('Asking AI:', question);

        const response = await fetch(`${API_BASE}/api/ask-ai`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                productData: productData || {
                    title: 'Product',
                    price: { current: 0, currency: 'INR' }
                },
                question
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    },
};

export default api;
