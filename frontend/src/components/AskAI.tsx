import { useState } from 'react';
import { api } from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
interface AskAIProps {
    productId: string;
    productData?: {
        title: string;
        price: { current: number; currency: string };
        specifications?: Record<string, string>;
        ratings?: { average: number; count: number };
        highlights?: string[];
    };
}

const suggestedQuestions = [
    'Is the battery life really that good?',
    'How comfortable are these for long use?',
    'Are they worth the price?',
    'How good is the noise cancellation?',
];

export default function AskAI({ productId, productData }: AskAIProps) {
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [confidence, setConfidence] = useState<number | null>(null);

    const handleAsk = async (q: string) => {
        if (!q.trim() || isLoading) return;

        setIsLoading(true);
        setAnswer(null);

        try {
            const response = await api.askAI(productId, q, productData);
            setAnswer(response.answer);
            setConfidence(response.confidence);
        } catch (error) {
            setAnswer('Sorry, I couldn\'t process your question. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleAsk(question);
    };

    // Format answer text with proper line breaks
    const formatAnswer = (text: string) => {
        return text.split('\n').map((line, i) => (
            <span key={i}>
                {line}
                {i < text.split('\n').length - 1 && <br />}
            </span>
        ));
    };

    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Ask AI</h3>
                    <p className="text-sm text-gray-400">Get answers to your product questions</p>
                </div>
            </div>

            {/* Suggested Questions */}
            <div className="flex flex-wrap gap-2 mb-4">
                {suggestedQuestions.map((q, i) => (
                    <button
                        key={i}
                        onClick={() => {
                            setQuestion(q);
                            handleAsk(q);
                        }}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-full text-gray-300 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50"
                    >
                        {q}
                    </button>
                ))}
            </div>

            {/* Custom Question Input */}
            <form onSubmit={handleSubmit} className="mb-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ask anything about this product..."
                        className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500/50"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!question.trim() || isLoading}
                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>

            {/* Answer */}
            {answer && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <div className="flex-1 prose-dark text-sm">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                            {confidence && (
                                <p className="text-xs text-gray-500 mt-2">Confidence: {Math.round(confidence * 100)}%</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

