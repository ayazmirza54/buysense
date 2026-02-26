import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIAnalysis } from '../types';

interface AIRecommendationProps {
    analysis: AIAnalysis;
}

export default function AIRecommendation({ analysis }: AIRecommendationProps) {
    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 h-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-white">AI Analysis</h3>
            </div>

            {/* Markdown Content */}
            <div className="prose-dark max-w-none mb-6 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis.content}</ReactMarkdown>
            </div>

            {/* Sources */}
            {analysis.sources && analysis.sources.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {analysis.sources.map((source, i) => (
                            <a
                                key={i}
                                href={source.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-xs hover:bg-blue-500/20 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                {source.title || 'Source'}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Timestamp */}
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Generated: {new Date(analysis.timestamp).toLocaleString()}
            </div>
        </div>
    );
}
