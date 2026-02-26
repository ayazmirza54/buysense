# BuySense - Design Document

## Architecture Overview

BuySense follows a clean, modular architecture with clear separation of concerns between data extraction, analysis, and presentation layers.

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   External      │
│   (React/TS)    │◄──►│   (Node.js)     │◄──►│   Services      │
│                 │    │                 │    │                 │
│ • URL Input     │    │ • Scraping      │    │ • E-commerce    │
│ • Data Display  │    │ • Price Compare │    │   Sites         │
│ • AI Insights   │    │ • AI Analysis   │    │ • LLM API       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Data Models

### Product Schema
```typescript
interface Product {
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
```

### Price Comparison Schema
```typescript
interface PriceComparison {
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
```

### AI Analysis Schema
```typescript
interface AIAnalysis {
  productId: string;
  overallScore: number; // 0-100
  categoryScores: {
    design: number;
    comfort: number;
    performance: number;
    durability: number;
    value: number;
  };
  strengths: string[];
  limitations: string[];
  recommendation: 'buy' | 'skip' | 'consider';
  confidence: number; // 0-100
  generatedAt: Date;
}
```

## Component Architecture

### Frontend Components

```
App
├── Header
├── ProductAnalyzer
│   ├── URLInput
│   ├── LoadingState
│   └── AnalysisResults
│       ├── ProductHero
│       │   ├── ImageCarousel
│       │   └── BasicInfo
│       ├── PriceComparison
│       ├── AIRecommendation
│       │   ├── ScoreBar
│       │   ├── CategoryScores
│       │   ├── StrengthsSection
│       │   └── LimitationsSection
│       ├── AskAI
│       └── FeedbackRating
└── Footer
```

### Backend Services

```
API Layer
├── ProductController
├── ScrapingService
│   ├── MarketplaceAdapters
│   │   ├── AmazonAdapter
│   │   ├── FlipkartAdapter
│   │   ├── MyntraAdapter
│   │   ├── MeeshoAdapter
│   │   ├── CromaAdapter
│   │   ├── RelianceAdapter
│   │   └── GenericAdapter
│   └── DataNormalizer
├── PriceComparisonService
├── AIAnalysisService
└── CacheService
```

## API Contracts

### Analyze Product Endpoint
```typescript
POST /api/analyze
Request: {
  url: string;
}

Response: {
  product: Product;
  priceComparison: PriceComparison;
  aiAnalysis: AIAnalysis;
  processingTime: number;
}
```

### Get Price Updates Endpoint
```typescript
GET /api/prices/:productId
Response: PriceComparison
```

### Ask AI Follow-up Endpoint
```typescript
POST /api/ask-ai
Request: {
  productId: string;
  question: string;
}

Response: {
  answer: string;
  confidence: number;
}
```

## Scraping Strategy

### Marketplace Adapters

Each marketplace has a dedicated adapter implementing the `MarketplaceAdapter` interface:

```typescript
interface MarketplaceAdapter {
  canHandle(url: string): boolean;
  scrape(url: string): Promise<RawProductData>;
  searchProduct(query: string): Promise<SearchResult[]>;
}
```

### Data Extraction Points

**Amazon:**
- Title: `#productTitle`
- Price: `.a-price-current`
- Images: `#landingImage`
- Ratings: `.a-icon-alt`
- Specs: `#feature-bullets`

**Flipkart:**
- Title: `.B_NuCI`
- Price: `._30jeq3`
- Images: `._396cs4`
- Ratings: `._3LWZlK`
- Specs: `._21Ahn-`

### Error Handling Strategy

1. **Graceful Degradation**: If scraping fails, show partial data
2. **Retry Logic**: Implement exponential backoff for failed requests
3. **Fallback Sources**: Use alternative selectors or API endpoints
4. **User Feedback**: Clear error messages with suggested actions

## AI Integration

### LLM Service Abstraction

```typescript
interface LLMService {
  analyzeProduct(product: Product, reviews?: string[]): Promise<AIAnalysis>;
  answerQuestion(product: Product, question: string): Promise<string>;
}
```

### AI Prompt Templates

**Product Analysis Prompt:**
```
Analyze this product for a purchase decision:

Product: {title}
Price: {price}
Specifications: {specs}
Ratings: {ratings}
Reviews Summary: {reviews}

Provide:
1. Overall score (0-100)
2. Category scores for: Design, Comfort, Performance, Durability, Value
3. Top 3 strengths
4. Top 3 limitations
5. Buy/Skip/Consider recommendation

Use consumer-friendly language. Be honest and balanced.
```

## UI/UX Design Specifications

### Design System

**Colors:**
- Primary: #2563eb (Blue)
- Success: #16a34a (Green)
- Warning: #ea580c (Orange)
- Error: #dc2626 (Red)
- Neutral: #64748b (Slate)

**Typography:**
- Headings: Inter, sans-serif
- Body: Inter, sans-serif
- Code: JetBrains Mono, monospace

**Spacing:**
- Base unit: 4px
- Component spacing: 16px, 24px, 32px
- Section spacing: 48px, 64px

### Responsive Breakpoints

- Mobile: 320px - 768px
- Tablet: 768px - 1024px
- Desktop: 1024px+

### Loading States

1. **URL Processing**: Skeleton for input validation
2. **Data Scraping**: Progress indicator with steps
3. **AI Analysis**: Animated thinking indicator
4. **Price Comparison**: Shimmer effect for price cards

## Performance Considerations

### Caching Strategy

1. **Product Data**: Cache for 1 hour
2. **Price Data**: Cache for 15 minutes
3. **AI Analysis**: Cache for 24 hours
4. **Images**: CDN with 7-day cache

### Optimization Techniques

1. **Lazy Loading**: Images and non-critical components
2. **Code Splitting**: Route-based and component-based
3. **Compression**: Gzip for API responses
4. **Debouncing**: URL input validation

## Security Considerations

### Data Protection

1. **Input Sanitization**: Validate and sanitize all URLs
2. **Rate Limiting**: Prevent abuse of scraping endpoints
3. **CORS**: Restrict cross-origin requests
4. **Headers**: Security headers for XSS protection

### Privacy

1. **No User Tracking**: No persistent user identification
2. **Data Retention**: Clear scraped data after 24 hours
3. **Third-party APIs**: Minimize data sharing with external services

## Testing Strategy

### Unit Tests
- Component rendering and behavior
- Service layer functions
- Data transformation utilities
- Error handling scenarios

### Integration Tests
- API endpoint functionality
- Scraping adapter reliability
- AI service integration
- Database operations

### Property-Based Tests

**Property 1.1: URL Validation Consistency**
```typescript
// For any valid e-commerce URL, the system should consistently identify the marketplace
property("URL validation is consistent", (url: string) => {
  const result1 = validateURL(url);
  const result2 = validateURL(url);
  return result1.isValid === result2.isValid && 
         result1.marketplace === result2.marketplace;
});
```

**Property 1.2: Price Comparison Accuracy**
```typescript
// The best price should always be the lowest available price
property("Best price is always lowest", (prices: PriceData[]) => {
  const comparison = generatePriceComparison(prices);
  const bestPrice = comparison.stores.find(store => store.isBestPrice);
  const allPrices = comparison.stores.map(store => store.price);
  return bestPrice && bestPrice.price === Math.min(...allPrices);
});
```

**Property 1.3: AI Score Consistency**
```typescript
// AI scores should be within valid ranges and category scores should influence overall score
property("AI scores are valid and consistent", (product: Product) => {
  const analysis = generateAIAnalysis(product);
  const categoryAvg = Object.values(analysis.categoryScores).reduce((a, b) => a + b) / 5;
  
  return analysis.overallScore >= 0 && 
         analysis.overallScore <= 100 &&
         Math.abs(analysis.overallScore - categoryAvg) <= 20; // Allow some variance
});
```

### End-to-End Tests
- Complete user workflows
- Cross-browser compatibility
- Mobile responsiveness
- Performance benchmarks

## Deployment Architecture

### Environment Configuration

**Development:**
- Local Node.js server
- Mock scraping responses
- Test AI service

**Staging:**
- Docker containers
- Real scraping with rate limits
- Staging AI service

**Production:**
- Kubernetes deployment
- CDN for static assets
- Production AI service with monitoring

### Monitoring and Observability

1. **Application Metrics**: Response times, error rates
2. **Scraping Success Rates**: Per-marketplace reliability
3. **AI Service Performance**: Analysis quality and speed
4. **User Experience**: Core Web Vitals, conversion rates

## Future Enhancements

### Phase 2 Features
- User accounts and saved analyses
- Price drop alerts
- Product comparison tool
- Browser extension

### Phase 3 Features
- Mobile app
- Barcode scanning
- Social sharing
- Advanced filtering and search

## Correctness Properties

The system must maintain these invariants:

1. **Data Integrity**: Scraped data must be accurately normalized
2. **Price Accuracy**: Price comparisons must reflect real marketplace data
3. **AI Reliability**: Analysis scores must be consistent and explainable
4. **Performance**: Response times must stay under acceptable thresholds
5. **Availability**: System must handle marketplace failures gracefully