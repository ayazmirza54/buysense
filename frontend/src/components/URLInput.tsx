import { useState } from 'react';

interface URLInputProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function URLInput({
  onSubmit,
  isLoading = false,
  placeholder = "Paste a product link here to see the magic"
}: URLInputProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isLoading) return;
    onSubmit(url.trim());
  };

  const isValidUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const isValid = !url || isValidUrl(url);

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="relative max-w-2xl mx-auto">
        <div className={`flex items-center bg-white/10 backdrop-blur-md rounded-2xl border shadow-lg hover:shadow-xl transition-all duration-300 ${!isValid ? 'border-red-400/50' : 'border-white/20 hover:border-white/40'
          }`}>
          <div className="flex items-center pl-5 text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 px-4 py-4 text-lg bg-transparent border-0 rounded-2xl focus:outline-none focus:ring-0 text-white placeholder-gray-400 ${!isValid ? 'text-red-400' : ''
              }`}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!url.trim() || isLoading || !isValid}
            className="m-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-300 flex items-center font-medium shadow-lg hover:shadow-blue-500/25"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        {!isValid && url && (
          <p className="text-red-400 text-sm mt-2 text-left">Please enter a valid URL</p>
        )}
      </div>
    </form>
  );
}
