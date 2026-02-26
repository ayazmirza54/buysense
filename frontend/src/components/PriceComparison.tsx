import type { PriceComparison as PriceComparisonType } from '../types';

interface PriceComparisonProps {
    data: PriceComparisonType;
}

export default function PriceComparison({ data }: PriceComparisonProps) {
    const sortedStores = [...data.stores].sort((a, b) => a.price - b.price);

    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white">Price Comparison</h3>
                </div>
                <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-lg">
                    Updated {new Date(data.lastUpdated).toLocaleTimeString()}
                </span>
            </div>

            <div className="space-y-3">
                {sortedStores.map((store, i) => (
                    <a
                        key={store.name}
                        href={store.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block group relative p-4 rounded-xl border transition-all ${store.isBestPrice
                            ? 'bg-green-500/10 border-green-500/30 hover:border-green-500/50'
                            : 'bg-white/5 border-white/10 hover:border-white/30'
                            }`}
                    >
                        {store.isBestPrice && (
                            <span className="absolute -top-2 left-4 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-bold px-3 py-0.5 rounded-full shadow-lg shadow-green-500/25">
                                BEST PRICE
                            </span>
                        )}

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${i === 0 ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'
                                    }`}>
                                    {i + 1}
                                </div>
                                <div>
                                    <p className="font-semibold text-white">{store.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${store.availability === 'in-stock'
                                            ? 'bg-green-500/20 text-green-400'
                                            : store.availability === 'limited'
                                                ? 'bg-yellow-500/20 text-yellow-400'
                                                : 'bg-red-500/20 text-red-400'
                                            }`}>
                                            {store.availability === 'in-stock' ? 'In Stock' :
                                                store.availability === 'limited' ? 'Limited Stock' : 'Out of Stock'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right flex items-center gap-4">
                                <div>
                                    <p className={`text-xl font-bold ${store.isBestPrice ? 'text-green-400' : 'text-white'}`}>
                                        {store.price > 0 ? `₹${store.price.toLocaleString()}` : 'Check Price →'}
                                    </p>
                                    {store.savings && store.savings > 0 && (
                                        <p className="text-sm text-gray-400">
                                            Save ₹{store.savings.toLocaleString()}
                                        </p>
                                    )}
                                </div>

                                <svg
                                    className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
