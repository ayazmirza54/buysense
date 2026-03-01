"""
BuySense Scraper — BeautifulSoup-based product scraping.

Supports Amazon and Flipkart with CSS/JSON-LD extraction.
For JS-rendered sites (Myntra, Meesho, etc.), returns None and lets Gemini handle it.
"""

from __future__ import annotations

import json
import math
import random
import re
from dataclasses import dataclass, field
from typing import Optional

import httpx
from bs4 import BeautifulSoup

# ── User agents to mimic real browsers ──────────────────────────

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


@dataclass
class ScrapedProduct:
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


# ── Image URL helpers ───────────────────────────────────────────

def upscale_amazon_image_url(url: str) -> str:
    """Replace Amazon image size suffixes (e.g. ._SL75_, ._SX38_) with high-res ._SL1500_."""
    if not url:
        return url
    # Match patterns like ._SL75_. or ._SX38_SY50_ or ._AC_SX38_ or ._AC_UL320_ or ._SS40_ etc.
    upgraded = re.sub(r'\._(?:[A-Z]{2,3}_)*[A-Z]{2}[\dA-Z_,]+_\.', '._SL1500_.', url)
    return upgraded


def upscale_flipkart_image_url(url: str) -> str:
    """Replace Flipkart thumbnail sizes with high-res /832/."""
    if not url:
        return url
    return (url
        .replace('/64/', '/832/')
        .replace('/100/', '/832/')
        .replace('/128/', '/832/')
        .replace('/200/', '/832/')
        .replace('/416/', '/832/')
    )


# ── HTTP Fetch ──────────────────────────────────────────────────

async def fetch_page(url: str, timeout: float = 8.0) -> str:
    """
    Fetch HTML content from a URL with browser-like headers.
    Only works for pages that serve server-rendered HTML.
    """
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text


# ── Price parsing ───────────────────────────────────────────────

def parse_price(price_str: str) -> float:
    """Parse Indian price formats like ₹1,23,499 or Rs. 1,23,499.00."""
    if not price_str:
        return 0.0

    cleaned = price_str
    for pattern in [r"[₹$€£]", r"MRP:?", r"Rs\.?", r"INR"]:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace(",", "").strip()

    match = re.search(r"(\d+\.?\d*)", cleaned)
    if not match:
        return 0.0

    price = float(match.group(1))
    return round(price, 2) if not math.isnan(price) else 0.0


def parse_rating_count(count_str: str) -> int:
    """Parse rating counts like '12,345' or '1.2K' or '1M'."""
    if not count_str:
        return 0
    cleaned = re.sub(r"[,\s]", "", count_str.lower())
    match = re.search(r"([\d.]+)([km]?)", cleaned)
    if not match:
        return 0

    count = float(match.group(1))
    suffix = match.group(2)
    if suffix == "k":
        count *= 1000
    elif suffix == "m":
        count *= 1_000_000
    return round(count)


# ── JSON-LD extraction ─────────────────────────────────────────

def extract_price_from_json_ld(soup: BeautifulSoup) -> Optional[dict]:
    """Extract price from JSON-LD structured data (most reliable for SSR pages)."""
    try:
        for script in soup.find_all("script", type="application/ld+json"):
            content = script.string
            if not content:
                continue
            try:
                json_data = json.loads(content)
                items = json_data if isinstance(json_data, list) else [json_data]

                for item in items:
                    item_type = item.get("@type", "")
                    is_product = item_type == "Product" or (
                        isinstance(item_type, list) and "Product" in item_type
                    )
                    if not is_product:
                        continue

                    offers = item.get("offers")
                    if not offers:
                        continue

                    offer_list = offers if isinstance(offers, list) else [offers]
                    for offer in offer_list:
                        price_val = offer.get("price") or offer.get("lowPrice")
                        if price_val is not None:
                            try:
                                current = float(price_val)
                                high = offer.get("highPrice")
                                original = float(high) if high else None
                                return {"current": current, "original": original}
                            except (ValueError, TypeError):
                                continue
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return None


def extract_product_from_json_ld(soup: BeautifulSoup) -> Optional[dict]:
    """Extract product data from JSON-LD structured data."""
    try:
        for script in soup.find_all("script", type="application/ld+json"):
            content = script.string
            if not content:
                continue
            try:
                json_data = json.loads(content)
                items = json_data if isinstance(json_data, list) else [json_data]

                for item in items:
                    item_type = item.get("@type", "")
                    is_product = item_type == "Product" or (
                        isinstance(item_type, list) and "Product" in item_type
                    )
                    if not is_product:
                        continue

                    result: dict = {}

                    if item.get("name"):
                        result["title"] = item["name"]

                    brand = item.get("brand")
                    if isinstance(brand, dict) and brand.get("name"):
                        result["brand"] = brand["name"]
                    elif isinstance(brand, str):
                        result["brand"] = brand

                    # Images (upscale to high-res)
                    img = item.get("image")
                    if img:
                        imgs = img if isinstance(img, list) else [img]
                        result["images"] = [
                            upscale_amazon_image_url(i) for i in imgs
                            if isinstance(i, str) and i.startswith("http")
                        ]

                    # Rating
                    agg = item.get("aggregateRating")
                    if agg:
                        try:
                            result["ratings"] = {
                                "average": float(agg.get("ratingValue", 0)),
                                "count": int(agg.get("reviewCount") or agg.get("ratingCount") or 0),
                            }
                        except (ValueError, TypeError):
                            pass

                    # Description as highlight
                    desc = item.get("description")
                    if desc:
                        result["highlights"] = [desc[:200]]

                    return result
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return None


# ── AMAZON SCRAPER ──────────────────────────────────────────────

async def scrape_amazon_product(url: str) -> Optional[ScrapedProduct]:
    """Best-effort scraping of Amazon product pages."""
    try:
        print(f"Scraping Amazon product: {url}")
        html = await fetch_page(url)
        soup = BeautifulSoup(html, "lxml")

        # Try JSON-LD first (most reliable)
        json_ld_product = extract_product_from_json_ld(soup) or {}
        json_ld_price = extract_price_from_json_ld(soup)

        # Title
        title_el = soup.select_one("#productTitle") or soup.select_one("h1.a-size-large")
        title = (title_el.get_text(strip=True) if title_el else "") or json_ld_product.get("title", "")

        if not title:
            print("Amazon: Could not extract title, page likely needs JS rendering")
            return None

        # Brand
        byline_el = soup.select_one("#bylineInfo") or soup.select_one("a#bylineInfo")
        brand = ""
        if byline_el:
            brand = re.sub(r"^(Visit the |Brand: )", "", byline_el.get_text(strip=True))
        brand = brand or json_ld_product.get("brand", "")

        # Price
        current_price: float = 0
        price_whole_el = soup.select_one(".a-price-whole")
        price_frac_el = soup.select_one(".a-price-fraction")
        if price_whole_el:
            whole = re.sub(r"[^\d]", "", price_whole_el.get_text())
            frac = re.sub(r"[^\d]", "", price_frac_el.get_text()) if price_frac_el else "00"
            if whole:
                current_price = float(f"{whole}.{frac}")

        if current_price == 0:
            alt_selectors = [
                "#priceblock_ourprice", "#priceblock_dealprice", "#priceblock_saleprice",
                ".a-price .a-offscreen", "#corePrice_feature_div .a-offscreen",
                "#corePriceDisplay_desktop_feature_div .a-offscreen",
                ".reinventPricePriceToPayMargin .a-offscreen",
            ]
            for sel in alt_selectors:
                el = soup.select_one(sel)
                if el:
                    parsed = parse_price(el.get_text(strip=True))
                    if parsed > 0:
                        current_price = parsed
                        break

        if current_price == 0 and json_ld_price:
            current_price = json_ld_price["current"]

        # Original price
        orig_el = soup.select_one(".a-text-price .a-offscreen")
        original_price = parse_price(orig_el.get_text(strip=True)) if orig_el else 0

        # Images (upscale all to high-res)
        images: list[str] = [upscale_amazon_image_url(u) for u in json_ld_product.get("images", [])]
        if not images:
            for img in soup.select("#altImages img, #imageBlock img, #landingImage"):
                src = img.get("data-old-hires") or img.get("src") or ""
                dyn = img.get("data-a-dynamic-image")
                if dyn:
                    try:
                        img_data = json.loads(dyn)
                        urls = list(img_data.keys())
                        if urls:
                            src = urls[0]
                    except (json.JSONDecodeError, TypeError):
                        pass
                if src and src not in images and "grey-pixel" not in src and "spinner" not in src:
                    images.append(upscale_amazon_image_url(src))

        # Ratings
        rating_el = soup.select_one("#acrPopover")
        rating_text = (rating_el.get("title", "") if rating_el else "") or ""
        if not rating_text:
            r_el = soup.select_one('span[data-hook="rating-out-of-text"]')
            rating_text = r_el.get_text(strip=True) if r_el else ""

        rating_match = re.search(r"([\d.]+)", rating_text)
        average = json_ld_product.get("ratings", {}).get("average", 0) or (
            float(rating_match.group(1)) if rating_match else 0
        )

        count_el = soup.select_one("#acrCustomerReviewText")
        count_text = count_el.get_text(strip=True) if count_el else ""
        count = json_ld_product.get("ratings", {}).get("count", 0) or parse_rating_count(count_text)

        # Specifications
        specifications: dict[str, str] = {}
        for row in soup.select(
            "#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr"
        ):
            key_el = row.select_one("th")
            val_el = row.select_one("td")
            if key_el and val_el:
                k = key_el.get_text(strip=True)
                v = val_el.get_text(strip=True)
                if k and v:
                    specifications[k] = v

        # Highlights
        highlights: list[str] = []
        for li in soup.select("#feature-bullets li span.a-list-item"):
            text = li.get_text(strip=True)
            if text and 10 < len(text) < 500 and "›" not in text:
                highlights.append(text)

        print(f"Amazon scraped: title={title[:40]!r}, price={current_price}, images={len(images)}")

        return ScrapedProduct(
            title=title or "Product",
            brand=brand,
            price_current=current_price,
            price_original=original_price if original_price > current_price else None,
            price_currency="INR",
            images=images[:6],
            specifications=specifications,
            rating_average=average,
            rating_count=count,
            highlights=highlights[:6],
        )

    except Exception as e:
        print(f"Error scraping Amazon: {e}")
        return None


# ── FLIPKART SCRAPER ────────────────────────────────────────────

async def scrape_flipkart_product(url: str) -> Optional[ScrapedProduct]:
    """Best-effort scraping of Flipkart product pages."""
    try:
        print(f"Scraping Flipkart product: {url}")
        html = await fetch_page(url)
        soup = BeautifulSoup(html, "lxml")

        json_ld_product = extract_product_from_json_ld(soup) or {}
        json_ld_price = extract_price_from_json_ld(soup)

        # Title
        title = ""
        for sel in ["span.VU-ZEz", "span.B_NuCI", "h1.yhB1nd span"]:
            el = soup.select_one(sel)
            if el:
                title = el.get_text(strip=True)
                if title:
                    break
        title = title or json_ld_product.get("title", "")

        if not title:
            print("Flipkart: Could not extract title, page likely needs JS rendering")
            return None

        # Brand
        brand_el = soup.select_one("span._2WkVRV")
        brand = (brand_el.get_text(strip=True) if brand_el else "") or json_ld_product.get("brand", "")

        # Price
        current_price: float = 0
        for sel in ["div.Nx9bqj.CxhGGd", "div.Nx9bqj", "div._30jeq3._16Jk6d", "div._30jeq3"]:
            el = soup.select_one(sel)
            if el:
                parsed = parse_price(el.get_text(strip=True))
                if parsed > 0:
                    current_price = parsed
                    break
        if current_price == 0 and json_ld_price:
            current_price = json_ld_price["current"]

        # Images (upscale all to high-res)
        images: list[str] = [upscale_flipkart_image_url(u) for u in json_ld_product.get("images", [])]
        if not images:
            for img in soup.select("img._0DkuPH, img._396cs4, img.q6DClP"):
                src = img.get("src") or ""
                src = upscale_flipkart_image_url(src)
                if src and src not in images and "rukminim" in src:
                    images.append(src)

        # Ratings
        rating_el = soup.select_one("div.XQDdHH") or soup.select_one("div._3LWZlK")
        rating_text = rating_el.get_text(strip=True) if rating_el else ""
        average = json_ld_product.get("ratings", {}).get("average", 0)
        if not average and rating_text:
            try:
                average = float(rating_text)
            except ValueError:
                average = 0

        # Specifications
        specifications: dict[str, str] = {}
        for row in soup.select("div._4gvKMe table tr, div.GNDEQ- table tr"):
            cells = row.select("td")
            if len(cells) >= 2:
                k = cells[0].get_text(strip=True)
                v = cells[-1].get_text(strip=True)
                if k and v:
                    specifications[k] = v

        # Highlights
        highlights: list[str] = []
        for li in soup.select("li._7eSDEz, li.rgWa7D"):
            text = li.get_text(strip=True)
            if text and 5 < len(text) < 300:
                highlights.append(text)

        print(f"Flipkart scraped: title={title[:40]!r}, price={current_price}, images={len(images)}")

        return ScrapedProduct(
            title=title or "Product",
            brand=brand,
            price_current=current_price,
            price_original=None,
            price_currency="INR",
            images=images[:6],
            specifications=specifications,
            rating_average=average,
            rating_count=json_ld_product.get("ratings", {}).get("count", 0),
            highlights=highlights[:6],
        )

    except Exception as e:
        print(f"Error scraping Flipkart: {e}")
        return None


# ── MAIN SCRAPER ROUTER ────────────────────────────────────────

async def scrape_product(url: str) -> Optional[ScrapedProduct]:
    """
    Attempt to scrape product data from a URL.
    Best-effort — many sites use JS rendering and will return None.
    The main data source is Gemini with Google Search grounding.
    """
    lower_url = url.lower()

    try:
        if "amazon" in lower_url:
            return await scrape_amazon_product(url)
        if "flipkart" in lower_url:
            return await scrape_flipkart_product(url)
    except Exception as e:
        print(f"Scraper error (non-fatal): {e}")

    # For all other sites, return None and let Gemini handle it
    print("Scraping not supported for this site, Gemini will handle data extraction")
    return None
