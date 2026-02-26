import { useState } from 'react'
import {
  Header,
  URLInput,
  SupportedPlatforms,
  LoadingState,
  ProductHero,
  PriceComparison,
  AIRecommendation,
  AskAI,
  FeedbackRating
} from './components'
import './App.css'
import { Beams } from './components/Beams'
import { api } from './services/api'
import type { AnalysisResult } from './types'

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async (url: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await api.analyzeProduct(url)
      setAnalysisResult(result)
    } catch (err) {
      setError('Failed to analyze product. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToSearch = () => {
    setAnalysisResult(null)
    setError(null)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0">
        <Beams
          beamWidth={3}
          beamHeight={30}
          beamNumber={20}
          lightColor="#ffffff"
          speed={2}
          noiseIntensity={1.75}
          scale={0.2}
          rotation={30}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />

        {/* Loading Overlay */}
        {isLoading && <LoadingState message="Scraping product data and analyzing..." />}

        {/* Main Content */}
        <main className="flex-grow max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Analysis Results View */}
          {analysisResult ? (
            <div>
              {/* Back Button */}
              <button
                onClick={handleBackToSearch}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to search
              </button>

              {/* Product Hero - Full Width */}
              <ProductHero product={analysisResult.product} />

              {/* Two Column Layout for Price & AI Analysis */}
              <div className="grid lg:grid-cols-2 gap-6 mt-6">
                <div>
                  {/* Price Comparison */}
                  <PriceComparison data={analysisResult.priceComparison} />
                </div>
                <div>
                  {/* AI Recommendation */}
                  <AIRecommendation analysis={analysisResult.aiAnalysis} />
                </div>
              </div>

              {/* Ask AI Chatbot */}
              <div className="mt-6">
                <AskAI
                  productId={analysisResult.product.id}
                  productData={{
                    title: analysisResult.product.title,
                    price: analysisResult.product.price,
                    specifications: analysisResult.product.specifications,
                    ratings: analysisResult.product.ratings,
                    highlights: analysisResult.product.highlights
                  }}
                />
              </div>

              {/* Feedback */}
              <FeedbackRating onSubmit={(rating, feedback) => {
                console.log('Feedback submitted:', { rating, feedback })
              }} />

              {/* Processing Time */}
              <p className="text-center text-gray-500 text-sm mt-6">
                Analysis completed in {analysisResult.processingTime}s
              </p>
            </div>
          ) : (
            /* Landing Page View */
            <div className="text-center py-8">
              {/* Hero Section */}
              <div className="mb-12">
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
                  Ask <span className="italic bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">BuySense</span>
                </h1>
                <p className="text-xl md:text-2xl text-gray-300 mb-12">
                  if it's worth buying or skipping
                </p>
              </div>

              {/* URL Input Form */}
              <URLInput
                onSubmit={handleAnalyze}
                isLoading={isLoading}
              />

              {/* Error Message */}
              {error && (
                <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                  {error}
                </div>
              )}

              {/* Alternative Method */}
              <div className="text-center">
                <p className="text-gray-500 mb-2">OR</p>
                <p className="text-gray-400">
                  Add{' '}
                  <span className="font-mono bg-white/10 px-2 py-1 rounded text-blue-400 border border-white/10">
                    buysense.co/
                  </span>{' '}
                  in front of a product URL to get instant analysis
                </p>
              </div>

              {/* Supported Platforms */}
              <SupportedPlatforms />

              {/* Features Preview */}
              <div className="mt-20 grid md:grid-cols-3 gap-6 text-left">
                <div className="group bg-white/5 backdrop-blur-lg p-6 rounded-2xl border border-white/10 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Smart Analysis</h3>
                  <p className="text-gray-400">Detailed product analysis including specifications, ratings, and features</p>
                </div>

                <div className="group bg-white/5 backdrop-blur-lg p-6 rounded-2xl border border-white/10 hover:border-green-500/50 hover:bg-white/10 transition-all duration-300">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Price Comparison</h3>
                  <p className="text-gray-400">Find the best deals across multiple marketplaces instantly</p>
                </div>

                <div className="group bg-white/5 backdrop-blur-lg p-6 rounded-2xl border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition-all duration-300">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">Instant Results</h3>
                  <p className="text-gray-400">Get comprehensive product analysis in seconds, not hours</p>
                </div>
              </div>

              {/* Tagline */}
              <div className="mt-20">
                <p className="text-lg text-gray-500 italic">
                  "Sense before you spend."
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
