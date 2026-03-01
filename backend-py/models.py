"""
Pydantic data models for BuySense API.
Matches the exact API contract of the TypeScript backend so the frontend works without changes.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Product Models ──────────────────────────────────────────────

class PriceInfo(BaseModel):
    current: float = 0
    original: Optional[float] = None
    currency: str = "INR"


class RatingsInfo(BaseModel):
    average: float = 0
    count: int = 0


class SourceInfo(BaseModel):
    marketplace: str = ""
    url: str = ""


class ProductData(BaseModel):
    id: str = ""
    title: str = "Product"
    brand: Optional[str] = ""
    model: Optional[str] = ""
    price: PriceInfo = Field(default_factory=PriceInfo)
    images: list[str] = Field(default_factory=list)
    specifications: dict[str, str] = Field(default_factory=dict)
    ratings: RatingsInfo = Field(default_factory=RatingsInfo)
    highlights: list[str] = Field(default_factory=list)
    source: SourceInfo = Field(default_factory=SourceInfo)
    scrapedAt: str = ""


# ── Price Comparison Models ─────────────────────────────────────

class PriceData(BaseModel):
    store: str = ""
    price: float = 0
    currency: str = "INR"
    url: str = ""
    availability: str = "in-stock"  # 'in-stock' | 'out-of-stock' | 'limited'
    savings: Optional[float] = None
    isBestPrice: bool = False


# ── AI Analysis Models ──────────────────────────────────────────

class AnalysisSource(BaseModel):
    title: str = "Reference"
    uri: str = ""


class AnalysisResult(BaseModel):
    content: str = ""
    sources: list[AnalysisSource] = Field(default_factory=list)
    timestamp: str = ""


# ── API Request / Response Models ───────────────────────────────

class AnalyzeRequest(BaseModel):
    url: str


class AnalyzeResponse(BaseModel):
    product: ProductData
    prices: list[PriceData]
    aiAnalysis: AnalysisResult
    processingTime: float


class AskAIProductData(BaseModel):
    title: str = "Product"
    price: PriceInfo = Field(default_factory=PriceInfo)
    specifications: Optional[dict[str, str]] = None
    ratings: Optional[RatingsInfo] = None
    highlights: Optional[list[str]] = None


class AskAIRequest(BaseModel):
    productData: AskAIProductData
    question: str


class AskAIResponse(BaseModel):
    answer: str
    confidence: float


class GetPricesResponse(BaseModel):
    productId: str
    prices: list[PriceData]
    lastUpdated: str
