"""
BuySense Python Backend — FastAPI application.

Endpoints:
  GET  /api/health             — health check
  POST /api/analyze            — analyze a product URL
  POST /api/ask-ai             — follow-up AI questions
  GET  /api/prices/{product_id} — cached price lookup
"""

from __future__ import annotations

import asyncio
import base64
import os
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from helpers import (
    detect_marketplace,
    extract_title_from_url,
    pick_best,
    pick_best_object,
)
from models import (
    AnalysisResult,
    AnalysisSource,
    AnalyzeRequest,
    AnalyzeResponse,
    AskAIRequest,
    AskAIResponse,
    GetPricesResponse,
    PriceData,
    PriceInfo,
    ProductData,
    RatingsInfo,
    SourceInfo,
)
from services.gemini import analyze_product as gemini_analyze
from services.gemini import ask_question, generate_marketplace_urls
from services.scraper import scrape_product, upscale_amazon_image_url, upscale_flipkart_image_url

# ── Load .env ───────────────────────────────────────────────────

load_dotenv()

# ── FastAPI app ─────────────────────────────────────────────────

app = FastAPI(title="BuySense Backend", version="1.0.0")

# CORS — allow the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://main.d2906mzyvvwogq.amplifyapp.com/", "https://buysense.onrender.com/"],
    allow_methods=["GET", "POST"],
    allow_credentials=True,
    allow_headers=["*"],
)

# ── In-memory cache ────────────────────────────────────────────

_product_cache: dict[str, dict] = {}
CACHE_TTL = 30 * 60  # 30 minutes in seconds


# ── Global error handler ───────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception):
    print(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"message": "Internal server error"},
    )


# ── Health check ────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── POST /api/analyze ──────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest):
    start_time = time.time()

    url = body.url
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # Validate URL format
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL format")

    print(f"\n{'=' * 60}")
    print(f"Analyzing product: {url}")
    print(f"{'=' * 60}")

    marketplace = detect_marketplace(url)
    print(f"Detected marketplace: {marketplace}")

    # Step 1: Try HTML scraping (best effort)
    print("\nStep 1: Attempting HTML scraping (best effort)...")
    scraped_data = None
    try:
        scraped_data = await scrape_product(url)
        if scraped_data:
            print(
                f'✓ Scraper found: title="{scraped_data.title[:40]}", '
                f"price={scraped_data.price_current}"
            )
        else:
            print("✗ Scraper returned None (expected for JS-rendered sites)")
    except Exception as e:
        print(f"✗ Scraper error (non-fatal): {e}")

    # Step 2: Get AI analysis via Gemini (PRIMARY data source)
    print("\nStep 2: Getting AI analysis via Gemini (primary data source)...")
    gemini_result = await gemini_analyze(url)
    gp = gemini_result.product
    print(
        f'✓ Gemini returned: title="{gp.title[:40]}", '
        f"price={gp.price_current}, images={len(gp.images)}, "
        f"prices={len(gemini_result.prices)}"
    )

    product_id = base64.urlsafe_b64encode(url.encode()).decode()[:16]

    # Step 3: Merge data — prioritize scraped data where available, fall back to Gemini
    print("\nStep 3: Merging data sources...")

    has_scraped_title = scraped_data and scraped_data.title and scraped_data.title != "Product"
    has_scraped_price = scraped_data and scraped_data.price_current and scraped_data.price_current > 0
    has_gemini_title = gp.title and gp.title != "Product"
    has_gemini_price = gp.price_current > 0

    # Title
    if has_scraped_title:
        title = scraped_data.title  # type: ignore[union-attr]
    elif has_gemini_title:
        title = gp.title
    else:
        title = extract_title_from_url(url)

    # Price
    if has_scraped_price:
        current_price = scraped_data.price_current  # type: ignore[union-attr]
    elif has_gemini_price:
        current_price = gp.price_current
    else:
        current_price = 0

    original_price = None
    if scraped_data and scraped_data.price_original:
        original_price = scraped_data.price_original
    elif gp.price_original:
        original_price = gp.price_original

    currency = "INR"
    if scraped_data and scraped_data.price_currency:
        currency = scraped_data.price_currency
    elif gp.price_currency:
        currency = gp.price_currency

    product_data = ProductData(
        id=product_id,
        title=title,
        brand=(scraped_data.brand if scraped_data and scraped_data.brand else "") or gp.brand,
        model="",
        price=PriceInfo(
            current=current_price,
            original=original_price,
            currency=currency,
        ),
        images=pick_best(
            scraped_data.images if scraped_data else None,
            gp.images,
        ),
        specifications=pick_best_object(
            scraped_data.specifications if scraped_data else None,
            gp.specifications,
        ),
        ratings=RatingsInfo(
            average=(scraped_data.rating_average if scraped_data and scraped_data.rating_average else 0)
            or gp.rating_average,
            count=(scraped_data.rating_count if scraped_data and scraped_data.rating_count else 0)
            or gp.rating_count,
        ),
        highlights=pick_best(
            scraped_data.highlights if scraped_data else None,
            gp.highlights,
        ),
        source=SourceInfo(marketplace=marketplace, url=url),
        scrapedAt=datetime.now(timezone.utc).isoformat(),
    )

    # Post-process: upscale any thumbnail images from Gemini
    if marketplace.lower() == "amazon":
        product_data.images = [upscale_amazon_image_url(img) for img in product_data.images]
    elif marketplace.lower() == "flipkart":
        product_data.images = [upscale_flipkart_image_url(img) for img in product_data.images]

    print(
        f'Final product: "{product_data.title[:40]}", '
        f"price={product_data.price.current}, images={len(product_data.images)}"
    )

    # Step 4: Build price comparison from Gemini's data
    print("\nStep 4: Building price comparison...")

    prices: list[PriceData] = [
        PriceData(
            store=p.store,
            price=p.price,
            currency=p.currency,
            url=p.url,
            availability=p.availability,
            savings=None,
            isBestPrice=False,
        )
        for p in gemini_result.prices
    ]

    # If Gemini didn't include the source store, add it
    source_in_prices = any(
        p.store.lower() == marketplace.lower() for p in prices
    )
    if not source_in_prices and product_data.price.current > 0:
        prices.insert(
            0,
            PriceData(
                store=marketplace,
                price=product_data.price.current,
                currency="INR",
                url=url,
                availability="in-stock",
                savings=None,
                isBestPrice=False,
            ),
        )

    # Calculate best price and savings
    if prices:
        valid_prices = [p for p in prices if p.price > 0]
        if valid_prices:
            best_price = min(p.price for p in valid_prices)
            for p in prices:
                if p.price > 0:
                    p.isBestPrice = p.price == best_price
                    p.savings = round(p.price - best_price) if p.price > best_price else None

    # Fallback: add search links if no comparison found
    if len(prices) <= 1 and product_data.title != "Product":
        print("No other prices found, adding search links as fallback")
        mp_urls = generate_marketplace_urls(product_data.title, marketplace)
        for mp in mp_urls[:3]:
            prices.append(
                PriceData(
                    store=mp["name"],
                    price=0,
                    currency="INR",
                    url=mp["searchUrl"],
                    availability="in-stock",
                    savings=None,
                    isBestPrice=False,
                )
            )

    print(f"Price comparison: {len(prices)} stores")
    for p in prices:
        best_tag = " (BEST)" if p.isBestPrice else ""
        print(f"  {p.store}: ₹{p.price}{best_tag}")

    processing_time = round(time.time() - start_time, 1)

    # Cache the result
    _product_cache[product_id] = {
        "product": product_data,
        "prices": prices,
        "timestamp": time.time(),
    }

    response = AnalyzeResponse(
        product=product_data,
        prices=prices,
        aiAnalysis=AnalysisResult(
            content=gemini_result.analysis,
            sources=[
                AnalysisSource(title=s.title, uri=s.uri) for s in gemini_result.sources
            ],
            timestamp=gemini_result.timestamp,
        ),
        processingTime=processing_time,
    )

    print(f"\n✓ Analysis completed in {processing_time}s")
    print(f"{'=' * 60}\n")

    return response


# ── POST /api/ask-ai ───────────────────────────────────────────

@app.post("/api/ask-ai")
async def ask_ai(body: AskAIRequest):
    if not body.question:
        raise HTTPException(status_code=400, detail="Question is required")

    print(f"AI Question: {body.question}")

    pd = body.productData
    product_dict = {
        "title": pd.title,
        "price": {"current": pd.price.current, "currency": pd.price.currency},
    }
    if pd.specifications:
        product_dict["specifications"] = pd.specifications
    if pd.ratings:
        product_dict["ratings"] = {"average": pd.ratings.average, "count": pd.ratings.count}
    if pd.highlights:
        product_dict["highlights"] = pd.highlights

    result = await ask_question(product_dict, body.question)

    return AskAIResponse(answer=result["answer"], confidence=result["confidence"])


# ── GET /api/prices/{product_id} ───────────────────────────────

@app.get("/api/prices/{product_id}")
async def get_prices(product_id: str):
    print(f"Fetching prices for product: {product_id}")

    cached = _product_cache.get(product_id)

    if cached and (time.time() - cached["timestamp"]) < CACHE_TTL:
        print("Returning cached price data")
        return GetPricesResponse(
            productId=product_id,
            prices=cached["prices"],
            lastUpdated=datetime.fromtimestamp(
                cached["timestamp"], tz=timezone.utc
            ).isoformat(),
        )

    print("Product not found in cache")
    raise HTTPException(
        status_code=404,
        detail="Price data not found. Please analyze the product first using POST /api/analyze",
    )


# ── Run with uvicorn ───────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3005"))
    print(f"🚀 BuySense backend running at http://localhost:{port}")
    print(f"📊 Health check: http://localhost:{port}/api/health")
    print(f"🔑 Gemini API key: {'✓ Set' if os.getenv('GEMINI_API_KEY') else '✗ Missing!'}")
    uvicorn.run(app, host="0.0.0.0", port=port)
