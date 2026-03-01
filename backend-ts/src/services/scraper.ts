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
 * Fetch HTML content from a URL with proper headers.
 * Note: This only works for pages that serve server-rendered HTML.
 * Most modern e-commerce sites (Flipkart, Myntra, Meesho) use JavaScript rendering
 * and will return empty/skeletal HTML. For those, we rely on Gemini with Google Search.
 */
async function fetchPage(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    try {
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
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
        }

        return response.text();
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Parse price string to number.
 * Handles Indian formats like ₹1,23,499 and ₹1,23,499.00
 */
function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;

    let cleaned = priceStr
        .replace(/[₹$€£]/g, '')
        .replace(/MRP:?/gi, '')
        .replace(/Rs\.?/gi, '')
        .replace(/INR/gi, '')
        .replace(/,/g, '')
        .trim();

    const match = cleaned.match(/(\d+\.?\d*)/);
    if (!match) return 0;

    const price = parseFloat(match[1]);
    return isNaN(price) ? 0 : Math.round(price * 100) / 100;
}

/**
 * Parse rating count string to number
 */
function parseRatingCount(countStr: string): number {
    if (!countStr) return 0;
    const cleaned = countStr.replace(/[,\s]/g, '').toLowerCase();
    const match = cleaned.match(/([\d.]+)([km]?)/);
    if (!match) return 0;

    let count = parseFloat(match[1]);
    if (match[2] === 'k') count *= 1000;
    if (match[2] === 'm') count *= 1000000;
    return Math.round(count);
}

/**
 * Extract price from JSON-LD structured data (most reliable for SSR pages)
 */
function extractPriceFromJsonLd($: cheerio.CheerioAPI): { current: number; original?: number } | null {
    try {
        const scripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < scripts.length; i++) {
            const scriptContent = $(scripts[i]).html();
            if (!scriptContent) continue;

            try {
                const jsonData = JSON.parse(scriptContent);
                const items = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of items) {
                    if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
                        const offers = item.offers;
                        if (offers) {
                            const offerList = Array.isArray(offers) ? offers : [offers];
                            for (const offer of offerList) {
                                const price = offer.price || offer.lowPrice;
                                if (price && !isNaN(parseFloat(price))) {
                                    return {
                                        current: parseFloat(price),
                                        original: offer.highPrice ? parseFloat(offer.highPrice) : undefined
                                    };
                                }
                            }
                        }
                    }
                }
            } catch {
                continue;
            }
        }
    } catch (error) {
        console.log('JSON-LD extraction failed:', error);
    }
    return null;
}

/**
 * Extract product data from JSON-LD structured data.
 * This is the most reliable way to get data from SSR pages.
 */
function extractProductFromJsonLd($: cheerio.CheerioAPI): Partial<ScrapedProduct> | null {
    try {
        const scripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < scripts.length; i++) {
            const scriptContent = $(scripts[i]).html();
            if (!scriptContent) continue;

            try {
                const jsonData = JSON.parse(scriptContent);
                const items = Array.isArray(jsonData) ? jsonData : [jsonData];

                for (const item of items) {
                    if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
                        const result: Partial<ScrapedProduct> = {};

                        if (item.name) result.title = item.name;
                        if (item.brand?.name) result.brand = item.brand.name;
                        else if (typeof item.brand === 'string') result.brand = item.brand;

                        // Images
                        if (item.image) {
                            const imgs = Array.isArray(item.image) ? item.image : [item.image];
                            result.images = imgs.filter((img: any) => typeof img === 'string' && img.startsWith('http'));
                        }

                        // Rating
                        if (item.aggregateRating) {
                            result.ratings = {
                                average: parseFloat(item.aggregateRating.ratingValue) || 0,
                                count: parseInt(item.aggregateRating.reviewCount || item.aggregateRating.ratingCount) || 0
                            };
                        }

                        // Description as highlight
                        if (item.description) {
                            result.highlights = [item.description.substring(0, 200)];
                        }

                        return result;
                    }
                }
            } catch {
                continue;
            }
        }
    } catch {
        // ignore
    }
    return null;
}


// ============= AMAZON SCRAPER (best effort) =============

export async function scrapeAmazonProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Amazon product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        // Try JSON-LD first (most reliable)
        const jsonLdProduct = extractProductFromJsonLd($);
        const jsonLdPrice = extractPriceFromJsonLd($);

        const title = $('#productTitle').text().trim() ||
            $('h1.a-size-large').text().trim() ||
            jsonLdProduct?.title || '';

        if (!title) {
            console.log('Amazon: Could not extract title, page likely needs JS rendering');
            return null;
        }

        const brand = $('#bylineInfo').text().replace(/^(Visit the |Brand: )/, '').trim() ||
            $('a#bylineInfo').text().trim() ||
            jsonLdProduct?.brand || '';

        // Price extraction
        let currentPrice = 0;

        const priceWhole = $('.a-price-whole').first().text().replace(/[^\d]/g, '');
        const priceFraction = $('.a-price-fraction').first().text().replace(/[^\d]/g, '');
        if (priceWhole) {
            currentPrice = parseFloat(priceWhole + '.' + (priceFraction || '00'));
        }

        if (currentPrice === 0) {
            const altPriceSelectors = [
                '#priceblock_ourprice', '#priceblock_dealprice', '#priceblock_saleprice',
                '.a-price .a-offscreen', '#corePrice_feature_div .a-offscreen',
                '#corePriceDisplay_desktop_feature_div .a-offscreen',
                '.reinventPricePriceToPayMargin .a-offscreen'
            ];
            for (const selector of altPriceSelectors) {
                const priceText = $(selector).first().text().trim();
                if (priceText) {
                    const parsed = parsePrice(priceText);
                    if (parsed > 0) { currentPrice = parsed; break; }
                }
            }
        }

        if (currentPrice === 0 && jsonLdPrice) {
            currentPrice = jsonLdPrice.current;
        }

        const originalPriceStr = $('.a-text-price .a-offscreen').first().text().trim() || '';
        const originalPrice = parsePrice(originalPriceStr);

        // Images
        const images: string[] = jsonLdProduct?.images || [];
        if (images.length === 0) {
            $('#altImages img, #imageBlock img, #landingImage').each((_, el) => {
                let src = $(el).attr('data-old-hires') || $(el).attr('src') || '';
                if ($(el).attr('data-a-dynamic-image')) {
                    try {
                        const imgData = JSON.parse($(el).attr('data-a-dynamic-image') || '{}');
                        const urls = Object.keys(imgData);
                        if (urls.length > 0) src = urls[0];
                    } catch { }
                }
                if (src && !images.includes(src) && !src.includes('grey-pixel') && !src.includes('spinner')) {
                    images.push(src);
                }
            });
        }

        // Ratings
        const ratingText = $('#acrPopover').attr('title') || $('span[data-hook="rating-out-of-text"]').text().trim() || '';
        const ratingMatch = ratingText.match(/([\d.]+)/);
        const average = jsonLdProduct?.ratings?.average || (ratingMatch ? parseFloat(ratingMatch[1]) : 0);

        const countText = $('#acrCustomerReviewText').text().trim() || '';
        const count = jsonLdProduct?.ratings?.count || parseRatingCount(countText);

        // Specifications
        const specifications: Record<string, string> = {};
        $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each((_, el) => {
            const key = $(el).find('th').text().trim();
            const value = $(el).find('td').text().trim();
            if (key && value) specifications[key] = value;
        });

        // Highlights
        const highlights: string[] = [];
        $('#feature-bullets li span.a-list-item').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 10 && text.length < 500 && !text.includes('›')) {
                highlights.push(text);
            }
        });

        console.log('Amazon scraped:', { title: title?.substring(0, 40), price: currentPrice, images: images.length });

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
        console.error('Error scraping Amazon:', error);
        return null;
    }
}

// ============= FLIPKART SCRAPER (best effort) =============

export async function scrapeFlipkartProduct(url: string): Promise<ScrapedProduct | null> {
    try {
        console.log('Scraping Flipkart product:', url);
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        const jsonLdProduct = extractProductFromJsonLd($);
        const jsonLdPrice = extractPriceFromJsonLd($);

        const title = $('span.VU-ZEz').text().trim() ||
            $('span.B_NuCI').text().trim() ||
            $('h1.yhB1nd span').text().trim() ||
            jsonLdProduct?.title || '';

        if (!title) {
            console.log('Flipkart: Could not extract title, page likely needs JS rendering');
            return null;
        }

        const brand = $('span._2WkVRV').text().trim() || jsonLdProduct?.brand || '';

        let currentPrice = 0;
        const priceSelectors = [
            'div.Nx9bqj.CxhGGd', 'div.Nx9bqj', 'div._30jeq3._16Jk6d', 'div._30jeq3'
        ];
        for (const selector of priceSelectors) {
            const priceText = $(selector).first().text().trim();
            if (priceText) {
                const parsed = parsePrice(priceText);
                if (parsed > 0) { currentPrice = parsed; break; }
            }
        }
        if (currentPrice === 0 && jsonLdPrice) {
            currentPrice = jsonLdPrice.current;
        }

        const images: string[] = jsonLdProduct?.images || [];
        if (images.length === 0) {
            $('img._0DkuPH, img._396cs4, img.q6DClP').each((_, el) => {
                let src = $(el).attr('src') || '';
                if (src.includes('/128/')) src = src.replace('/128/', '/832/');
                if (src.includes('/416/')) src = src.replace('/416/', '/832/');
                if (src && !images.includes(src) && src.includes('rukminim')) images.push(src);
            });
        }

        const ratingText = $('div.XQDdHH').text().trim() || $('div._3LWZlK').first().text().trim() || '';
        const average = jsonLdProduct?.ratings?.average || (parseFloat(ratingText) || 0);

        const specifications: Record<string, string> = {};
        $('div._4gvKMe table tr, div.GNDEQ- table tr').each((_, el) => {
            const key = $(el).find('td:first-child').text().trim();
            const value = $(el).find('td:last-child').text().trim();
            if (key && value) specifications[key] = value;
        });

        const highlights: string[] = [];
        $('li._7eSDEz, li.rgWa7D').each((_, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 5 && text.length < 300) highlights.push(text);
        });

        console.log('Flipkart scraped:', { title: title?.substring(0, 40), price: currentPrice, images: images.length });

        return {
            title: title || 'Product',
            brand,
            price: { current: currentPrice, original: undefined, currency: 'INR' },
            images: images.slice(0, 6),
            specifications,
            ratings: { average, count: jsonLdProduct?.ratings?.count || 0 },
            highlights: highlights.slice(0, 6)
        };

    } catch (error) {
        console.error('Error scraping Flipkart:', error);
        return null;
    }
}


// ============= MAIN SCRAPER ROUTER =============

/**
 * Attempt to scrape product data from a URL.
 * This is "best effort" — many sites use JS rendering and will return null.
 * The main data source is Gemini with Google Search grounding.
 */
export async function scrapeProduct(url: string): Promise<ScrapedProduct | null> {
    const lowerUrl = url.toLowerCase();

    try {
        if (lowerUrl.includes('amazon')) {
            return await scrapeAmazonProduct(url);
        }
        if (lowerUrl.includes('flipkart')) {
            return await scrapeFlipkartProduct(url);
        }
    } catch (error) {
        console.error('Scraper error (non-fatal):', error);
    }

    // For all other sites, return null and let Gemini handle it
    console.log('Scraping not supported for this site, Gemini will handle data extraction');
    return null;
}
