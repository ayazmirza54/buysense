import * as cheerio from 'cheerio';

export interface ScrapedProduct {
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

// User agents to mimic real browser requests
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Fetch HTML content from a URL with proper headers
 */
async function fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }

    return response.text();
}

/**
 * Parse price string to number
 * Handles Indian formats like ₹1,23,499 and ₹1,23,499.00
 */
function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;

    // Remove currency symbols and text, keep only digits, commas, and dots
    let cleaned = priceStr
        .replace(/[₹$€£]/g, '')  // Remove currency symbols
        .replace(/MRP:?/gi, '')   // Remove MRP text
        .replace(/Rs\.?/gi, '')   // Remove Rs or Rs.
        .replace(/INR/gi, '')     // Remove INR
        .trim();

    // Handle Indian format: 1,23,499 or 1,23,499.00
    // Remove all commas first
    cleaned = cleaned.replace(/,/g, '');

    // Extract the first valid number (handles cases like "₹1999 ₹2499" where first is current price)
    const match = cleaned.match(/(\d+\.?\d*)/);
    if (!match) return 0;

    const price = parseFloat(match[1]);
    return isNaN(price) ? 0 : Math.round(price * 100) / 100;  // Round to 2 decimal places
}

/**
 * Parse rating count string to number
 */
function parseRatingCount(countStr: string): number {
    if (!countStr) return 0;
    // Handle formats like "1,234 ratings" or "1.2K ratings"
    const cleaned = countStr.replace(/[,\s]/g, '').toLowerCase();
    const match = cleaned.match(/([\d.]+)([km]?)/);
    if (!match) return 0;

    let count = parseFloat(match[1]);
    if (match[2] === 'k') count *= 1000;
    if (match[2] === 'm') count *= 1000000;
    return Math.round(count);
}

// ============= JSON-LD STRUCTURED DATA EXTRACTION =============

/**
 * Extract price from JSON-LD structured data (most reliable source)
 */
function extractPriceFromJsonLd($: cheerio.CheerioAPI): { current: number; original?: number } | null {
    try {
        const scripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < scripts.length; i++) {
            const scriptContent = $(scripts[i]).html();
            if (!scriptContent) continue;

            try {
                const jsonData = JSON.parse(scriptContent);

                // Handle array of JSON-LD objects
                const items = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of items) {
                    // Look for Product type
                    if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
                        const offers = item.offers;
                        if (offers) {
                            // Handle single offer or array of offers
                            const offerList = Array.isArray(offers) ? offers : [offers];
                            for (const offer of offerList) {
                                const price = offer.price || offer.lowPrice;
                                if (price && !isNaN(parseFloat(price))) {
                                    console.log('Found price in JSON-LD:', price);
                                    return {
                                        current: parseFloat(price),
                                        original: offer.highPrice ? parseFloat(offer.highPrice) : undefined
                                    };
                                }
                            }
                        }
                    }
                }
            } catch (parseError) {
                // JSON parse failed, try next script
                continue;
            }
        }
    } catch (error) {
        console.log('JSON-LD extraction failed:', error);
    }
    return null;
}

// ============= AMAZON SCRAPER =============

export async function scrapeAmazonProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Amazon product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        // Try JSON-LD first (most reliable)
        const jsonLdPrice = extractPriceFromJsonLd($);

        const title = $('#productTitle').text().trim() ||
            $('h1.a-size-large').text().trim() ||
            $('h1[data-hook="product-title"]').text().trim() || '';

        const brand = $('#bylineInfo').text().replace(/^(Visit the |Brand: )/, '').trim() ||
            $('a#bylineInfo').text().trim() || '';

        // Price extraction with multiple fallbacks
        let currentPrice = 0;

        // Method 1: Standard Amazon price elements (clean the text first)
        const priceWhole = $('.a-price-whole').first().text().replace(/[^\d]/g, '');
        const priceFraction = $('.a-price-fraction').first().text().replace(/[^\d]/g, '');
        if (priceWhole) {
            currentPrice = parseFloat(priceWhole + '.' + (priceFraction || '00'));
        }

        // Method 2: Alternative price selectors
        if (currentPrice === 0) {
            const altPriceSelectors = [
                '#priceblock_ourprice',
                '#priceblock_dealprice',
                '#priceblock_saleprice',
                '.a-price .a-offscreen',
                'span.a-price span.a-offscreen',
                '#corePrice_feature_div .a-offscreen',
                '#corePriceDisplay_desktop_feature_div .a-offscreen',
                '.reinventPricePriceToPayMargin .a-offscreen',
                '#apex_offerDisplay_desktop .a-offscreen'
            ];

            for (const selector of altPriceSelectors) {
                const priceText = $(selector).first().text().trim();
                if (priceText) {
                    const parsed = parsePrice(priceText);
                    if (parsed > 0) {
                        currentPrice = parsed;
                        console.log(`Found price using selector: ${selector} = ${currentPrice}`);
                        break;
                    }
                }
            }
        }

        // Method 3: Use JSON-LD price if DOM parsing failed
        if (currentPrice === 0 && jsonLdPrice) {
            currentPrice = jsonLdPrice.current;
            console.log('Using JSON-LD price:', currentPrice);
        }

        const finalCurrentPrice = currentPrice;

        const originalPriceStr = $('.a-text-price .a-offscreen').first().text().trim() ||
            $('span.a-price.a-text-price span.a-offscreen').first().text().trim() ||
            $('#listPrice').text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        const images: string[] = [];
        $('#altImages img, #imageBlock img, #landingImage').each((_, el) => {
            let src = $(el).attr('data-old-hires') ||
                $(el).attr('data-a-dynamic-image') ||
                $(el).attr('src') || '';

            if ($(el).attr('data-a-dynamic-image')) {
                try {
                    const imgData = JSON.parse($(el).attr('data-a-dynamic-image') || '{}');
                    const urls = Object.keys(imgData);
                    if (urls.length > 0) {
                        src = urls.reduce((a, b) => imgData[a] > imgData[b] ? a : b);
                    }
                } catch { }
            }

            if (src && src.includes('._')) {
                src = src.replace(/\._[^.]+\./, '.');
            }

            if (src && !images.includes(src) && !src.includes('grey-pixel') && !src.includes('spinner')) {
                images.push(src);
            }
        });

        if (images.length === 0) {
            const mainImg = $('#landingImage').attr('data-old-hires') ||
                $('#landingImage').attr('src') ||
                $('#imgBlkFront').attr('src') || '';
            if (mainImg) images.push(mainImg);
        }

        const ratingText = $('#acrPopover').attr('title') ||
            $('span[data-hook="rating-out-of-text"]').text().trim() ||
            $('.a-icon-star span.a-icon-alt').first().text().trim() || '';
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const average = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        const countText = $('#acrCustomerReviewText').text().trim() ||
            $('span[data-hook="total-review-count"]').text().trim() || '';
        const count = parseRatingCount(countText);

        const specifications: Record<string, string> = {};
        $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each((_, el) => {
            const key = $(el).find('th').text().trim();
            const value = $(el).find('td').text().trim();
            if (key && value) specifications[key] = value;
        });

        $('#tech-specs-mobile tr, .prodDetTable tr').each((_, el) => {
            const key = $(el).find('td:first-child, th').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value && key !== value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('#feature-bullets li span.a-list-item, #feature-bullets ul li').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 10 && text.length < 500 && !text.includes('›')) {
                highlights.push(text);
            }
        });

        if (highlights.length === 0) {
            $('div[id*="aboutThisItem"] li, #aplus-feature-bullets li').each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 10 && text.length < 500) highlights.push(text);
            });
        }

        console.log('Amazon scraped:', { title: title?.substring(0, 40), price: finalCurrentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: finalCurrentPrice, original: originalPrice > finalCurrentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Amazon:', error);
        return null;
    }
}

// ============= FLIPKART SCRAPER =============

export async function scrapeFlipkartProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Flipkart product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        // Try JSON-LD first (most reliable)
        const jsonLdPrice = extractPriceFromJsonLd($);

        // Title - Flipkart uses various selectors (updated for 2024/2025)
        const title = $('span.VU-ZEz').text().trim() ||
            $('span.B_NuCI').text().trim() ||
            $('h1.yhB1nd span').text().trim() ||
            $('h1._9E25nV').text().trim() ||
            $('h1[class*="title"]').text().trim() ||
            $('div._2WkVRV').text().trim() || '';

        // Brand - Usually in the title or separate element
        const brand = $('span._2WkVRV').text().trim() ||
            $('a._1fGeJ_').text().trim() || '';

        // Price extraction with multiple fallbacks
        let currentPrice = 0;

        // Method 1: Modern Flipkart price selectors (2024/2025)
        const priceSelectors = [
            'div.Nx9bqj.CxhGGd',           // Current offer price
            'div.Nx9bqj',                   // Price container
            'div._30jeq3._16Jk6d',          // Discounted price
            'div._30jeq3',                  // General price
            'div.CEmiEU div.UOCQB1',        // Price in product details
            'div._25b18c div._30jeq3',      // Price in product card
            'span._2WkVRV + span',          // Price after brand
            'div[class*="price"] span',     // Generic price selector
            'div._16Jk6d'                   // Sale price
        ];

        for (const selector of priceSelectors) {
            const priceText = $(selector).first().text().trim();
            if (priceText) {
                const parsed = parsePrice(priceText);
                if (parsed > 0) {
                    currentPrice = parsed;
                    console.log(`Flipkart: Found price using selector: ${selector} = ${currentPrice}`);
                    break;
                }
            }
        }

        // Method 2: Use JSON-LD price if DOM parsing failed
        if (currentPrice === 0 && jsonLdPrice) {
            currentPrice = jsonLdPrice.current;
            console.log('Flipkart: Using JSON-LD price:', currentPrice);
        }

        // Original price (MRP) - multiple selectors
        let originalPrice = 0;
        const originalPriceSelectors = [
            'div.yRaY8j.A6\\+E6v',          // MRP with strikethrough
            'div._3I9_wc._2p6lqe',          // Old MRP selector
            'div.yRaY8j',                   // MRP container
            'span.B_NuCI + div span',       // MRP after title
            'div.UOCQB1 span'               // MRP in details
        ];

        for (const selector of originalPriceSelectors) {
            const priceText = $(selector).first().text().trim();
            if (priceText && priceText.includes('₹')) {
                const parsed = parsePrice(priceText);
                if (parsed > currentPrice) {  // MRP should be higher
                    originalPrice = parsed;
                    break;
                }
            }
        }

        // Images
        const images: string[] = [];
        $('img._0DkuPH, img._396cs4, img.q6DClP, div._3kidJX img').each((_, el) => {
            let src = $(el).attr('src') || '';
            // Convert to high-res URL
            if (src.includes('/128/')) src = src.replace('/128/', '/832/');
            if (src.includes('/416/')) src = src.replace('/416/', '/832/');
            if (src && !images.includes(src) && src.includes('rukminim')) {
                images.push(src);
            }
        });

        // Ratings
        const ratingText = $('div.XQDdHH').text().trim() ||
            $('div._3LWZlK').first().text().trim() || '';
        const average = parseFloat(ratingText) || 0;

        const countText = $('span.Wphh3N span').text().trim() ||
            $('span._2_R_DZ span').first().text().trim() || '';
        const countMatch = countText.match(/([\d,]+)\s*(ratings?|reviews?)/i);
        const count = countMatch ? parseRatingCount(countMatch[1]) : 0;

        // Specifications
        const specifications: Record<string, string> = {};
        $('div._4gvKMe table tr, div.GNDEQ- table tr').each((_, el) => {
            const key = $(el).find('td:first-child').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        // Highlights
        const highlights: string[] = [];
        $('li._7eSDEz, li.rgWa7D').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5 && text.length < 300) highlights.push(text);
        });

        console.log('Flipkart scraped:', { title: title?.substring(0, 40), price: currentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: originalPrice > currentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Flipkart:', error);
        return null;
    }
}

// ============= CROMA SCRAPER =============

export async function scrapeCromaProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Croma product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        const title = $('h1.pd-title').text().trim() ||
            $('h1[data-testid="pdp-product-title"]').text().trim() || '';

        const brand = $('a.pd-brand').text().trim() ||
            $('p.pd-brand').text().trim() || '';

        const currentPriceStr = $('span.amount').first().text().trim() ||
            $('span[data-testid="new-price"]').text().trim() ||
            $('span.new-price').text().trim() || '';
        const currentPrice = parsePrice(currentPriceStr);

        const originalPriceStr = $('span.old-price').text().trim() ||
            $('span[data-testid="old-price"]').text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        const images: string[] = [];
        $('img.pd-image, div.product-gallery img, img[data-testid="product-image"]').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            if (src && !images.includes(src)) images.push(src);
        });

        const ratingText = $('span.rating-value').text().trim() ||
            $('div.rating span').first().text().trim() || '';
        const average = parseFloat(ratingText) || 0;

        const countText = $('span.review-count').text().trim() || '';
        const count = parseRatingCount(countText);

        const specifications: Record<string, string> = {};
        $('div.specifications tr, table.specifications tr').each((_, el) => {
            const key = $(el).find('td:first-child, th').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('ul.key-features li, div.product-highlights li').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5) highlights.push(text);
        });

        console.log('Croma scraped:', { title: title?.substring(0, 40), price: currentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: originalPrice > currentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Croma:', error);
        return null;
    }
}

// ============= MEESHO SCRAPER =============

export async function scrapeMeeshoProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Meesho product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        const title = $('span.sc-eDvSVe').first().text().trim() ||
            $('h1[class*="ProductTitle"]').text().trim() ||
            $('p[class*="Text__StyledText"]').first().text().trim() || '';

        const brand = $('p[class*="BrandName"]').text().trim() || '';

        // Meesho uses dynamic class names, try multiple patterns
        const currentPriceStr = $('h4[class*="Price"]').text().trim() ||
            $('span[class*="discountedPrice"]').text().trim() ||
            $('h5').filter((_, el) => $(el).text().includes('₹')).first().text().trim() || '';
        const currentPrice = parsePrice(currentPriceStr);

        const originalPriceStr = $('p[class*="originalPrice"]').text().trim() ||
            $('span[class*="strikethrough"]').text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        const images: string[] = [];
        $('img[class*="ProductImage"], div[class*="ImageContainer"] img').each((_, el) => {
            const src = $(el).attr('src') || '';
            if (src && !images.includes(src) && src.includes('meesho')) images.push(src);
        });

        const ratingText = $('span[class*="RatingValue"]').text().trim() || '';
        const average = parseFloat(ratingText) || 0;

        const countText = $('span[class*="RatingCount"]').text().trim() || '';
        const count = parseRatingCount(countText);

        const specifications: Record<string, string> = {};
        $('div[class*="ProductDescription"] tr').each((_, el) => {
            const key = $(el).find('td:first-child').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('div[class*="ProductDetails"] li, ul[class*="Features"] li').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5) highlights.push(text);
        });

        console.log('Meesho scraped:', { title: title?.substring(0, 40), price: currentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: originalPrice > currentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Meesho:', error);
        return null;
    }
}

// ============= RELIANCE DIGITAL SCRAPER =============

export async function scrapeRelianceDigitalProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Reliance Digital product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        const title = $('h1.pdp__title').text().trim() ||
            $('h1[class*="product-title"]').text().trim() || '';

        const brand = $('a.pdp__brand-link').text().trim() ||
            $('span[class*="brand"]').text().trim() || '';

        const currentPriceStr = $('span.pdp__offerPrice').text().trim() ||
            $('span[class*="sp"]').first().text().trim() || '';
        const currentPrice = parsePrice(currentPriceStr);

        const originalPriceStr = $('span.pdp__mrp').text().trim() ||
            $('span[class*="mrp"]').text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        const images: string[] = [];
        $('img.pdp__image, div.pdp-carousel img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            if (src && !images.includes(src)) images.push(src);
        });

        const ratingText = $('span.pdp__rating-value').text().trim() || '';
        const average = parseFloat(ratingText) || 0;

        const countText = $('span.pdp__review-count').text().trim() || '';
        const count = parseRatingCount(countText);

        const specifications: Record<string, string> = {};
        $('div.pdp__specs tr, table.specifications tr').each((_, el) => {
            const key = $(el).find('td:first-child').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('ul.pdp__highlights li, div.key-features li').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5) highlights.push(text);
        });

        console.log('Reliance Digital scraped:', { title: title?.substring(0, 40), price: currentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: originalPrice > currentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Reliance Digital:', error);
        return null;
    }
}

// ============= MYNTRA SCRAPER =============

export async function scrapeMyntraProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Myntra product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        const title = $('h1.pdp-title').text().trim() ||
            $('h1[class*="product-title"]').text().trim() || '';

        const brand = $('h1.pdp-name').text().trim() ||
            $('a.pdp-brand').text().trim() || '';

        const currentPriceStr = $('span.pdp-price strong').text().trim() ||
            $('span[class*="discounted-price"]').text().trim() || '';
        const currentPrice = parsePrice(currentPriceStr);

        const originalPriceStr = $('span.pdp-mrp s').text().trim() ||
            $('span[class*="striked"]').text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        const images: string[] = [];
        $('div.image-grid img, div.pdp-image img').each((_, el) => {
            const src = $(el).attr('src') || '';
            if (src && !images.includes(src)) images.push(src);
        });

        const ratingText = $('div.index-overallRating span').first().text().trim() || '';
        const average = parseFloat(ratingText) || 0;

        const countText = $('div.index-ratingsCount').text().trim() || '';
        const count = parseRatingCount(countText);

        const specifications: Record<string, string> = {};
        $('div.index-row, div.pdp-specs tr').each((_, el) => {
            const key = $(el).find('div.index-rowKey, td:first-child').text().trim();
            const value = $(el).find('div.index-rowValue, td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('ul.pdp-features li').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5) highlights.push(text);
        });

        console.log('Myntra scraped:', { title: title?.substring(0, 40), price: currentPrice });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: originalPrice > currentPrice ? originalPrice : undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Myntra:', error);
        return null;
    }
}

// ============= MAIN SCRAPER ROUTER =============

/**
 * Scrape product from any supported marketplace
 */
export async function scrapeProduct(url: string): Promise<ScrapedProduct | null> {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('amazon')) {
        return scrapeAmazonProduct(url);
    }

    if (lowerUrl.includes('flipkart')) {
        return scrapeFlipkartProduct(url);
    }

    if (lowerUrl.includes('croma')) {
        return scrapeCromaProduct(url);
    }

    if (lowerUrl.includes('meesho')) {
        return scrapeMeeshoProduct(url);
    }

    if (lowerUrl.includes('reliancedigital')) {
        return scrapeRelianceDigitalProduct(url);
    }

    if (lowerUrl.includes('myntra')) {
        return scrapeMyntraProduct(url);
    }

    console.log('Scraping not yet supported for this marketplace, falling back to AI extraction');
    return null;
}

// ============= SEARCH-BASED PRICE COMPARISON =============

export interface MarketplacePrice {
    store: string;
    price: number;
    currency: string;
    url: string;
    availability: 'in-stock' | 'out-of-stock' | 'limited';
    productTitle?: string;
}

/**
 * Search for a product on Amazon and get the first result's price
 */
async function searchAmazonPrice(productTitle: string): Promise<MarketplacePrice | null> {
    try {
        const searchQuery = encodeURIComponent(productTitle.substring(0, 100));
        const searchUrl = `https://www.amazon.in/s?k=${searchQuery}`;

        console.log('Searching Amazon for:', productTitle.substring(0, 40));
        const html = await fetchPage(searchUrl);
        const $ = cheerio.load(html);

        // Find first product result
        const firstResult = $('div[data-component-type="s-search-result"]').first();
        if (!firstResult.length) {
            console.log('Amazon: No search results found');
            return null;
        }

        // Try multiple price selectors for search results
        let price = 0;
        const priceSelectors = [
            '.a-price-whole',
            '.a-price .a-offscreen',
            'span.a-price span.a-offscreen',
            '.a-price[data-a-color="price"] .a-offscreen'
        ];

        for (const selector of priceSelectors) {
            const priceText = firstResult.find(selector).first().text().trim();
            if (priceText) {
                const parsed = parsePrice(priceText);
                if (parsed > 0) {
                    price = parsed;
                    console.log(`Amazon search: Found price using ${selector} = ${price}`);
                    break;
                }
            }
        }

        const productLink = firstResult.find('a.a-link-normal.s-no-outline, a.a-link-normal[href*="/dp/"]').first().attr('href');
        const resultUrl = productLink ? `https://www.amazon.in${productLink.split('?')[0]}` : searchUrl;
        const title = firstResult.find('h2 span, span.a-size-medium').text().trim();

        if (price > 0) {
            return {
                store: 'Amazon',
                price,
                currency: 'INR',
                url: resultUrl,
                availability: 'in-stock',
                productTitle: title
            };
        }
        return null;
    } catch (error) {
        console.error('Error searching Amazon:', error);
        return null;
    }
}

/**
 * Search for a product on Flipkart and get the first result's price
 */
async function searchFlipkartPrice(productTitle: string): Promise<MarketplacePrice | null> {
    try {
        const searchQuery = encodeURIComponent(productTitle.substring(0, 100));
        const searchUrl = `https://www.flipkart.com/search?q=${searchQuery}`;

        console.log('Searching Flipkart for:', productTitle.substring(0, 40));
        const html = await fetchPage(searchUrl);
        const $ = cheerio.load(html);

        // Try multiple price selectors for search results (updated for 2024/2025)
        let price = 0;
        const priceSelectors = [
            'div.Nx9bqj._4b5DiR',           // Search result price
            'div.Nx9bqj',                    // General price container
            'div._30jeq3._1_WHN1',           // Old search result price
            'div._30jeq3',                   // General price
            'div._25b18c div._30jeq3',       // Price in card
            'div[class*="price"]'            // Generic price
        ];

        for (const selector of priceSelectors) {
            const priceText = $(selector).first().text().trim();
            if (priceText) {
                const parsed = parsePrice(priceText);
                if (parsed > 0) {
                    price = parsed;
                    console.log(`Flipkart search: Found price using ${selector} = ${price}`);
                    break;
                }
            }
        }

        // Try to find product link
        const productLink = $('a._1fQZEK, a.s1Q9rs, a._2rpwqI, a.CGtC98, a[href*="/p/"]').first().attr('href');
        const resultUrl = productLink ? `https://www.flipkart.com${productLink.split('?')[0]}` : searchUrl;

        // Try to find product title
        const title = $('div.KzDlHZ').first().text().trim() ||
            $('a.s1Q9rs').first().text().trim() ||
            $('div._2WkVRV').first().text().trim() || '';

        if (price > 0) {
            return {
                store: 'Flipkart',
                price,
                currency: 'INR',
                url: resultUrl,
                availability: 'in-stock',
                productTitle: title
            };
        }
        return null;
    } catch (error) {
        console.error('Error searching Flipkart:', error);
        return null;
    }
}

/**
 * Search for a product on Croma and get the first result's price
 */
async function searchCromaPrice(productTitle: string): Promise<MarketplacePrice | null> {
    try {
        const searchQuery = encodeURIComponent(productTitle.substring(0, 80));
        const searchUrl = `https://www.croma.com/search/?q=${searchQuery}`;

        console.log('Searching Croma for:', productTitle.substring(0, 40));
        const html = await fetchPage(searchUrl);
        const $ = cheerio.load(html);

        const priceStr = $('span.amount').first().text().trim();
        const price = parsePrice(priceStr);

        const productLink = $('a.product-link, a[class*="product"]').first().attr('href');
        const resultUrl = productLink ? `https://www.croma.com${productLink}` : searchUrl;
        const title = $('h3.product-title').first().text().trim();

        if (price > 0) {
            return {
                store: 'Croma',
                price,
                currency: 'INR',
                url: resultUrl,
                availability: 'in-stock',
                productTitle: title
            };
        }
        return null;
    } catch (error) {
        console.error('Error searching Croma:', error);
        return null;
    }
}

/**
 * Search for a product on Reliance Digital and get the first result's price
 */
async function searchReliancePrice(productTitle: string): Promise<MarketplacePrice | null> {
    try {
        const searchQuery = encodeURIComponent(productTitle.substring(0, 80));
        const searchUrl = `https://www.reliancedigital.in/search?q=${searchQuery}`;

        console.log('Searching Reliance Digital for:', productTitle.substring(0, 40));
        const html = await fetchPage(searchUrl);
        const $ = cheerio.load(html);

        const priceStr = $('span[class*="price"], span.sp').first().text().trim();
        const price = parsePrice(priceStr);

        const productLink = $('a[class*="product"]').first().attr('href');
        const resultUrl = productLink ? `https://www.reliancedigital.in${productLink}` : searchUrl;
        const title = $('p[class*="product-title"]').first().text().trim();

        if (price > 0) {
            return {
                store: 'Reliance Digital',
                price,
                currency: 'INR',
                url: resultUrl,
                availability: 'in-stock',
                productTitle: title
            };
        }
        return null;
    } catch (error) {
        console.error('Error searching Reliance Digital:', error);
        return null;
    }
}

/**
 * Search for product prices across multiple marketplaces
 */
export async function searchProductPrices(
    productTitle: string,
    sourceMarketplace: string,
    sourcePrice: number,
    sourceUrl: string
): Promise<MarketplacePrice[]> {
    console.log('Searching for prices across marketplaces...');

    const prices: MarketplacePrice[] = [];

    // Add source marketplace price first
    prices.push({
        store: sourceMarketplace,
        price: sourcePrice,
        currency: 'INR',
        url: sourceUrl,
        availability: 'in-stock'
    });

    // Search for prices in parallel (with timeout)
    const searchPromises: Promise<MarketplacePrice | null>[] = [];

    // Don't search the source marketplace
    if (!sourceMarketplace.toLowerCase().includes('amazon')) {
        searchPromises.push(searchAmazonPrice(productTitle));
    }
    if (!sourceMarketplace.toLowerCase().includes('flipkart')) {
        searchPromises.push(searchFlipkartPrice(productTitle));
    }
    if (!sourceMarketplace.toLowerCase().includes('croma')) {
        searchPromises.push(searchCromaPrice(productTitle));
    }
    if (!sourceMarketplace.toLowerCase().includes('reliance')) {
        searchPromises.push(searchReliancePrice(productTitle));
    }

    // Wait for all searches with a 10 second timeout
    const timeoutPromise = new Promise<null[]>((resolve) => {
        setTimeout(() => resolve([]), 10000);
    });

    try {
        const results = await Promise.race([
            Promise.all(searchPromises),
            timeoutPromise
        ]) as (MarketplacePrice | null)[];

        // Add successful results
        for (const result of results) {
            if (result && result.price > 0) {
                prices.push(result);
            }
        }
    } catch (error) {
        console.error('Error in parallel price search:', error);
    }

    console.log(`Found ${prices.length} prices from different marketplaces`);
    return prices;
}

