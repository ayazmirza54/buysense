# BuySense - Product Decision Assistant

## Product Vision

BuySense helps users decide whether a product is worth buying or skipping. Users paste a product URL from any e-commerce marketplace, and BuySense scrapes and analyzes product data, compares prices across marketplaces, summarizes reviews and specs using AI, and generates a clear buy/skip recommendation with scoring.

The UX should feel fast, minimal, and confidence-inspiring.

## User Stories

### 1. Product Link Input
**As a user**, I want to paste a product URL into a single input field so that I can quickly analyze any product from supported marketplaces.

**Acceptance Criteria:**
- 1.1 The application displays a single, prominent input field for product URLs
- 1.2 The system supports URLs from Amazon, Flipkart, Myntra, Meesho, Croma, Reliance Digital, and generic e-commerce pages
- 1.3 The system validates URLs and shows helpful error messages for invalid or unsupported URLs
- 1.4 The input field provides visual feedback during URL processing

### 2. Product Data Extraction
**As a user**, I want the system to automatically extract comprehensive product information so that I have all relevant details for making a purchase decision.

**Acceptance Criteria:**
- 2.1 The system scrapes product title, images, price, specifications, ratings, review count, and key highlights
- 2.2 All scraped data is normalized into a standard schema regardless of source marketplace
- 2.3 The system handles missing or incomplete data gracefully with appropriate fallbacks
- 2.4 Product images are displayed in a carousel format

### 3. Price Comparison Engine
**As a user**, I want to see price comparisons across multiple marketplaces so that I can find the best deal available.

**Acceptance Criteria:**
- 3.1 The system searches and matches the same product across multiple marketplaces
- 3.2 Price comparison displays store name, current price, and savings compared to highest price
- 3.3 The best deal is clearly highlighted with visual emphasis
- 3.4 The system gracefully handles cases where the product is unavailable in certain stores
- 3.5 Price data includes any applicable discounts or offers

### 4. AI Product Intelligence Layer
**As a user**, I want AI-generated insights and recommendations so that I can make informed purchase decisions quickly.

**Acceptance Criteria:**
- 4.1 The system generates an overall recommendation score from 0-100
- 4.2 Category scores are provided for Design, Comfort, Performance, Durability, and Value
- 4.3 Key strengths (pros) and limitations (cons) are clearly listed
- 4.4 All AI-generated content uses concise, consumer-friendly language
- 4.5 The system avoids marketing fluff and provides honest assessments

### 5. User Interface and Experience
**As a user**, I want a clean, intuitive interface that presents information clearly so that I can quickly understand the analysis results.

**Acceptance Criteria:**
- 5.1 Product information is displayed in a hero card with image carousel
- 5.2 Price comparison is shown in a dedicated card with "best price" highlight
- 5.3 AI recommendation score is displayed as a prominent score bar
- 5.4 Score breakdown uses circular indicators for visual clarity
- 5.5 Expandable sections are provided for detailed strengths and limitations
- 5.6 FAQ-style "Ask AI" follow-up questions are available
- 5.7 Users can provide feedback using a 1-10 rating scale
- 5.8 The interface is mobile-first and fully responsive

### 6. Performance and Reliability
**As a user**, I want fast and reliable analysis so that I don't waste time waiting for results.

**Acceptance Criteria:**
- 6.1 Loading skeletons are displayed during data processing
- 6.2 The system provides graceful fallbacks for scraper failures
- 6.3 Error states are informative and suggest next steps
- 6.4 The perceived performance feels fast through progressive loading

## Technical Requirements

### Supported Marketplaces
- Amazon
- Flipkart
- Myntra
- Meesho
- Croma
- Reliance Digital
- Generic e-commerce pages

### Technology Stack
- Frontend: Vite + React with TypeScript
- Styling: Tailwind CSS
- State Management: React hooks
- API Layer: Fetch/Axios
- Backend: Express.js / Node.js
- Scraping: Headless browser or HTTP parser (marketplace-aware)
- AI: Gemini API

### Architecture Principles
- Clean separation between scraping, price comparison, and AI analysis logic
- Marketplace adapters for easy extensibility
- Defensive coding against scraper failures
- No affiliate links by default
- No hardcoded marketplace logic

## Business Rules

### Branding
- App name: BuySense
- Tagline options: "Sense before you spend.", "Know before you buy.", "Smart decisions. Zero regret."

### Content Guidelines
- Use honest, consumer-friendly language
- Avoid marketing fluff or misleading information
- Provide balanced pros and cons
- Focus on factual analysis over promotional content

### Privacy and Ethics
- No dark patterns or misleading CTAs
- Transparent about data sources and analysis methods
- Respect marketplace terms of service
- Protect user privacy and data