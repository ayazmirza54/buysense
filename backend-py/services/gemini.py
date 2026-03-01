"""
BuySense Gemini AI service — product analysis and Q&A using Google Search grounding.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote

from google import genai


# ── Types ───────────────────────────────────────────────────────

@dataclass
class GeminiProductData:
    title: str = "Product"
    brand: str = ""
    price_current: float = 0
    price_original: Optional[float] = None
    price_currency: str = "INR"
    images: list[str] = field(default_factory=list)
    specifications: dict[str, str] = field(default_factory=dict)
    rating_average: float = 0
    rating_count: int = 0
    highlights: list[str] = field(default_factory=list)


@dataclass
class GeminiPriceEntry:
    store: str = ""
    price: float = 0
    currency: str = "INR"
    url: str = ""
    availability: str = "in-stock"


@dataclass
class GeminiSource:
    title: str = "Reference"
    uri: str = ""


@dataclass
class GeminiAnalysisResult:
    product: GeminiProductData = field(default_factory=GeminiProductData)
    prices: list[GeminiPriceEntry] = field(default_factory=list)
    analysis: str = ""
    sources: list[GeminiSource] = field(default_factory=list)
    timestamp: str = ""


# ── Client ──────────────────────────────────────────────────────

def _get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return genai.Client(api_key=api_key)


# ── Analyze Product ─────────────────────────────────────────────

async def analyze_product(product_url: str) -> GeminiAnalysisResult:
    """
    Analyze a product from a URL using Gemini with Google Search grounding.
    PRIMARY data source — extracts real product data + prices + analysis.
    """
    client = _get_client()

    prompt = f"""You are a product data extraction and analysis engine for BuySense.

TASK: Extract REAL, ACCURATE data about the product at this URL: {product_url}

You MUST search the web for this exact product and return ONLY factual, verified information. Do NOT make up or estimate any numbers. If you cannot find a specific piece of data, use 0 for numbers and empty string for text.

Your response MUST be in exactly this format — a JSON code block followed by a markdown analysis:

```json
{{
    "product": {{
        "title": "The exact full product name as listed on the store",
        "brand": "The brand name",
        "price": {{
            "current": 0,
            "original": 0,
            "currency": "INR"
        }},
        "images": [
            "direct URL to product image 1",
            "direct URL to product image 2"
        ],
        "specifications": {{
            "Key Spec 1": "Value 1",
            "Key Spec 2": "Value 2"
        }},
        "ratings": {{
            "average": 0.0,
            "count": 0
        }},
        "highlights": [
            "Key feature 1",
            "Key feature 2",
            "Key feature 3"
        ]
    }},
    "prices": [
        {{
            "store": "Store Name (e.g. Amazon, Flipkart, Croma, Reliance Digital, Myntra, Meesho, JioMart)",
            "price": 0,
            "currency": "INR",
            "url": "Direct URL to the product on that store OR search URL if exact product page not found",
            "availability": "in-stock"
        }}
    ]
}}
```

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
One-line justification for the score."""

    from datetime import datetime, timezone

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config={
                "tools": [{"google_search": {}}],
            },
        )

        full_content = response.text or "No analysis available."

        # Parse JSON from the response
        product = GeminiProductData()
        prices: list[GeminiPriceEntry] = []
        analysis_content = full_content

        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", full_content)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1).strip())

                if "product" in parsed:
                    p = parsed["product"]
                    product = GeminiProductData(
                        title=p.get("title", "Product"),
                        brand=p.get("brand", ""),
                        price_current=p.get("price", {}).get("current", 0),
                        price_original=p.get("price", {}).get("original") or None,
                        price_currency=p.get("price", {}).get("currency", "INR"),
                        images=[
                            img for img in (p.get("images") or [])
                            if isinstance(img, str) and img.startswith("http")
                        ],
                        specifications=p.get("specifications") or {},
                        rating_average=p.get("ratings", {}).get("average", 0),
                        rating_count=p.get("ratings", {}).get("count", 0),
                        highlights=p.get("highlights") or [],
                    )
                    # Clean up original price
                    if product.price_original and (
                        product.price_original <= 0 or product.price_original <= product.price_current
                    ):
                        product.price_original = None

                if isinstance(parsed.get("prices"), list):
                    prices = [
                        GeminiPriceEntry(
                            store=pe.get("store", "Unknown"),
                            price=pe.get("price", 0),
                            currency=pe.get("currency", "INR"),
                            url=pe.get("url", ""),
                            availability=pe.get("availability", "in-stock"),
                        )
                        for pe in parsed["prices"]
                        if pe.get("price", 0) > 0
                    ]

                # Remove JSON block from analysis content
                analysis_content = re.sub(r"```json\s*[\s\S]*?\s*```", "", full_content).strip()

            except json.JSONDecodeError as e:
                print(f"Failed to parse JSON from Gemini response: {e}")
                # Try lenient parsing (remove trailing commas)
                try:
                    raw = json_match.group(1).strip()
                    cleaned = re.sub(r",\s*([}\]])", r"\1", raw)
                    parsed = json.loads(cleaned)
                    if "product" in parsed:
                        p = parsed["product"]
                        product = GeminiProductData(
                            title=p.get("title", "Product"),
                            brand=p.get("brand", ""),
                            price_current=p.get("price", {}).get("current", 0),
                            price_currency=p.get("price", {}).get("currency", "INR"),
                        )
                except json.JSONDecodeError:
                    print("Lenient JSON parsing also failed")

        # Extract sources from grounding metadata
        sources: list[GeminiSource] = []
        try:
            candidates = response.candidates or []
            if candidates:
                grounding_meta = getattr(candidates[0], "grounding_metadata", None)
                if grounding_meta:
                    chunks = getattr(grounding_meta, "grounding_chunks", []) or []
                    for chunk in chunks:
                        web = getattr(chunk, "web", None)
                        if web:
                            uri = getattr(web, "uri", "")
                            title = getattr(web, "title", "Reference")
                            if uri:
                                sources.append(GeminiSource(title=title, uri=uri))
        except Exception:
            pass

        print(
            f'Gemini extracted: title="{product.title[:50]}", '
            f"price={product.price_current}, images={len(product.images)}, prices={len(prices)}"
        )

        return GeminiAnalysisResult(
            product=product,
            prices=prices,
            analysis=analysis_content,
            sources=sources,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    except Exception as e:
        print(f"Error in analyze_product: {e}")
        raise RuntimeError("Failed to analyze product. Please try again later.") from e


# ── Ask Question ────────────────────────────────────────────────

async def ask_question(
    product_data: dict,
    question: str,
) -> dict:
    """Answer a follow-up question about a product using Gemini."""
    client = _get_client()

    specs_str = ""
    if product_data.get("specifications"):
        specs_str = f"**Specifications:** {json.dumps(product_data['specifications'])}"

    ratings_str = ""
    if product_data.get("ratings"):
        r = product_data["ratings"]
        ratings_str = f"**Ratings:** {r.get('average', 0)}/5 ({r.get('count', 0)} reviews)"

    highlights_str = ""
    if product_data.get("highlights"):
        highlights_str = f"**Key Features:** {', '.join(product_data['highlights'])}"

    prompt = f"""You are a helpful shopping assistant for BuySense. Answer the following question about this product:

**Product:** {product_data.get('title', 'Product')}
**Price:** {product_data.get('price', {}).get('currency', 'INR')} {product_data.get('price', {}).get('current', 0)}
{specs_str}
{ratings_str}
{highlights_str}

**Question:** {question}

Provide a helpful, accurate, and concise answer based on the product details and your web search results.
If you're not sure about something, say so honestly. Do NOT make up information."""

    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt,
            config={
                "tools": [{"google_search": {}}],
            },
        )

        answer = response.text or "I couldn't generate an answer. Please try again."
        return {"answer": answer, "confidence": 0.85}

    except Exception as e:
        print(f"Error in ask_question: {e}")
        raise RuntimeError("Failed to get AI response. Please try again later.") from e


# ── Marketplace URL Generator ──────────────────────────────────

def generate_marketplace_urls(
    product_title: str, source_marketplace: str
) -> list[dict[str, str]]:
    """Generate marketplace search URLs for a product (fallback for price comparison)."""
    encoded = quote(product_title)
    dash_encoded = encoded.replace("%20", "-")

    marketplaces = [
        {"name": "Amazon", "searchUrl": f"https://www.amazon.in/s?k={encoded}"},
        {"name": "Flipkart", "searchUrl": f"https://www.flipkart.com/search?q={encoded}"},
        {"name": "Myntra", "searchUrl": f"https://www.myntra.com/{dash_encoded}"},
        {"name": "Meesho", "searchUrl": f"https://www.meesho.com/search?q={encoded}"},
        {"name": "Croma", "searchUrl": f"https://www.croma.com/search/?q={encoded}"},
        {"name": "Reliance Digital", "searchUrl": f"https://www.reliancedigital.in/search?q={encoded}"},
    ]

    return [m for m in marketplaces if m["name"].lower() != source_marketplace.lower()]
