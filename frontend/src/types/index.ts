// Core data types for BuySense application

export interface Product {
  id: string;
  title: string;
  images: string[];
  price: {
    current: number;
    original?: number;
    currency: string;
  };
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
  scrapedAt: Date;
}

export interface PriceComparison {
  productId: string;
  stores: Array<{
    name: string;
    price: number;
    currency: string;
    availability: 'in-stock' | 'out-of-stock' | 'limited';
    url: string;
    savings?: number;
    isBestPrice: boolean;
  }>;
  lastUpdated: Date;
}

export interface AIAnalysis {
  content: string;
  sources: {
    title: string;
    uri: string;
  }[];
  timestamp: string;
}

export interface AnalysisResult {
  product: Product;
  priceComparison: PriceComparison;
  aiAnalysis: AIAnalysis;
  processingTime: number;
}

export type SupportedMarketplace =
  | 'amazon'
  | 'flipkart'
  | 'myntra'
  | 'meesho'
  | 'croma'
  | 'reliance-digital'
  | 'generic';