"""
Helper / utility functions for BuySense backend.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse


def detect_marketplace(url: str) -> str:
    """Detect which marketplace a URL belongs to."""
    lower = url.lower()
    if "amazon" in lower:
        return "Amazon"
    if "flipkart" in lower:
        return "Flipkart"
    if "myntra" in lower:
        return "Myntra"
    if "meesho" in lower:
        return "Meesho"
    if "croma" in lower:
        return "Croma"
    if "reliancedigital" in lower or "reliance digital" in lower:
        return "Reliance Digital"
    if "jiomart" in lower:
        return "JioMart"
    return "Generic"


def extract_title_from_url(url: str) -> str:
    """Extract a human-readable product title from the URL path (fallback)."""
    try:
        parsed = urlparse(url)
        parts = [p for p in parsed.path.split("/") if p]
        product_part = next(
            (p for p in parts if len(p) > 10 and not re.match(r"^[a-zA-Z0-9]{10}$", p)),
            None,
        )
        if product_part:
            return product_part.replace("-", " ").replace("_", " ")
        return f"Product from {parsed.hostname}"
    except Exception:
        return "Product"


def pick_best(a: list[str] | None, b: list[str] | None) -> list[str]:
    """Pick the array with more items (prefer real content)."""
    a_valid = bool(a)
    b_valid = bool(b)

    if a_valid and b_valid:
        return a if len(a) >= len(b) else b  # type: ignore[arg-type]
    if a_valid:
        return a  # type: ignore[return-value]
    if b_valid:
        return b  # type: ignore[return-value]
    return []


def pick_best_object(
    a: dict[str, str] | None, b: dict[str, str] | None
) -> dict[str, str]:
    """Pick the dict with more keys."""
    a_keys = len(a) if a else 0
    b_keys = len(b) if b else 0

    if a_keys >= b_keys and a_keys > 0:
        return a  # type: ignore[return-value]
    if b_keys > 0:
        return b  # type: ignore[return-value]
    return {}
