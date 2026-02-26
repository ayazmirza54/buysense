import { useState } from 'react';

interface FeedbackRatingProps {
    onSubmit?: (rating: number, feedback?: string) => void;
}

export default function FeedbackRating({ onSubmit }: FeedbackRatingProps) {
    const [rating, setRating] = useState<number | null>(null);
    const [feedback, setFeedback] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [hoveredRating, setHoveredRating] = useState<number | null>(null);

    const handleSubmit = () => {
        if (rating) {
            onSubmit?.(rating, feedback || undefined);
            setSubmitted(true);
        }
    };

    if (submitted) {
        return (
            <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Thank you for your feedback!</h3>
                <p className="text-gray-400">Your input helps us improve BuySense.</p>
            </div>
        );
    }

    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6">
            <h3 className="text-xl font-bold text-white text-center mb-2">How helpful was this analysis?</h3>
            <p className="text-gray-400 text-center mb-6">Rate from 1 (not helpful) to 10 (very helpful)</p>

            {/* Rating Buttons */}
            <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                        key={num}
                        onClick={() => setRating(num)}
                        onMouseEnter={() => setHoveredRating(num)}
                        onMouseLeave={() => setHoveredRating(null)}
                        className={`w-10 h-10 rounded-lg font-semibold transition-all ${rating === num
                                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white scale-110'
                                : (hoveredRating !== null && num <= hoveredRating)
                                    ? 'bg-white/20 text-white'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                    >
                        {num}
                    </button>
                ))}
            </div>

            {/* Feedback Text */}
            {rating && (
                <div className="space-y-4">
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Any additional feedback? (optional)"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-500/50 resize-none h-24"
                    />
                    <button
                        onClick={handleSubmit}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all font-medium"
                    >
                        Submit Feedback
                    </button>
                </div>
            )}
        </div>
    );
}
