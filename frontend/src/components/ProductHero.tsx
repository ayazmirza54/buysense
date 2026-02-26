import { useState } from 'react';
import type { Product } from '../types';

interface ProductHeroProps {
    product: Product;
}

export default function ProductHero({ product }: ProductHeroProps) {
    const [currentImage, setCurrentImage] = useState(0);

    const discount = product.price.original
        ? Math.round(((product.price.original - product.price.current) / product.price.original) * 100)
        : 0;

    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-6">
            <div className="grid md:grid-cols-2 gap-8">
                {/* Image Carousel */}
                <div className="space-y-4">
                    <div className="aspect-square bg-white/10 rounded-xl overflow-hidden flex items-center justify-center">
                        <img
                            src={product.images[currentImage]}
                            alt={product.title}
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                    {product.images.length > 1 && (
                        <div className="flex gap-2 justify-center">
                            {product.images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentImage(i)}
                                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all bg-white/5 flex items-center justify-center ${i === currentImage ? 'border-blue-500' : 'border-white/20 opacity-60 hover:opacity-100'
                                        }`}
                                >
                                    <img src={img} alt="" className="max-w-full max-h-full object-contain" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="space-y-4">
                    <div>
                        <span className="text-sm text-gray-400 uppercase tracking-wide">{product.source.marketplace}</span>
                        <h2 className="text-xl md:text-2xl font-bold text-white mt-1 leading-tight">{product.title}</h2>
                    </div>

                    {/* Rating */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-lg">
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-green-400 font-semibold">{product.ratings.average}</span>
                        </div>
                        <span className="text-gray-400 text-sm">({product.ratings.count.toLocaleString()} reviews)</span>
                    </div>

                    {/* Price */}
                    <div className="space-y-1">
                        <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-3xl font-bold text-white">
                                ₹{product.price.current.toLocaleString()}
                            </span>
                            {product.price.original && (
                                <span className="text-lg text-gray-500 line-through">
                                    ₹{product.price.original.toLocaleString()}
                                </span>
                            )}
                            {discount > 0 && (
                                <span className="text-green-400 font-semibold">{discount}% off</span>
                            )}
                        </div>
                    </div>

                    {/* Highlights */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Highlights</h3>
                        <ul className="space-y-2">
                            {product.highlights.slice(0, 4).map((highlight, i) => (
                                <li key={i} className="flex items-start gap-3 text-gray-300 text-sm leading-relaxed">
                                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>{highlight}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* View on Store Button */}
                    <a
                        href={product.source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all font-medium shadow-lg shadow-green-500/25"
                    >
                        View on {product.source.marketplace}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>
            </div>

            {/* Specifications */}
            <div className="mt-8 pt-6 border-t border-white/10">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Specifications</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(product.specifications).slice(0, 8).map(([key, value]) => (
                        <div key={key} className="bg-white/5 rounded-lg p-4 border border-white/5">
                            <p className="text-xs text-gray-500 mb-1">{key}</p>
                            <p className="text-white font-medium text-sm leading-relaxed">{value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
