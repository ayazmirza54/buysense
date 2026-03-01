// Type definitions for BuySense backend

export interface AnalysisResult {
    content: string;
    sources: {
        title: string;
        uri: string;
    }[];
    timestamp: string;
}

export interface ProductData {
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
}

export interface PriceData {
    store: string;
    price: number;
    currency: string;
    url: string;
    availability: 'in-stock' | 'out-of-stock' | 'limited';
    savings?: number;
    isBestPrice: boolean;
}

export interface AnalyzeRequest {
    url: string;
}

export interface AnalyzeResponse {
    product: ProductData;
    prices: PriceData[];
    aiAnalysis: AnalysisResult;
    processingTime: number;
}

export interface GetPricesResponse {
    productId: string;
    prices: PriceData[];
    lastUpdated: string;
}

export interface AskAIRequest {
    productData: {
        title: string;
        price: { current: number; currency: string };
        specifications?: Record<string, string>;
        ratings?: { average: number; count: number };
        highlights?: string[];
    };
    question: string;
}

export interface AskAIResponse {
    answer: string;
    confidence: number;
}

