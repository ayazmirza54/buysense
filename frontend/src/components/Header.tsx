export default function Header() {
  return (
    <header className="bg-white/5 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl font-bold text-white">BuySense</span>
            </div>
          </div>
          <nav className="hidden md:flex space-x-8">
            <a href="#" className="text-gray-400 hover:text-white px-3 py-2 text-sm font-medium transition-colors duration-200">
              How it works
            </a>
            <a href="#" className="text-gray-400 hover:text-white px-3 py-2 text-sm font-medium transition-colors duration-200">
              Supported sites
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
