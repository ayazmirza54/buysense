const platforms = [
  { name: 'Amazon', color: 'text-orange-400' },
  { name: 'Flipkart', color: 'text-blue-400' },
  { name: 'Myntra', color: 'text-pink-400' },
  { name: 'Meesho', color: 'text-purple-400' },
  { name: 'Croma', color: 'text-green-400' },
  { name: 'Reliance Digital', color: 'text-red-400' },
];

export default function SupportedPlatforms() {
  return (
    <div className="mt-16">
      <p className="text-gray-400 mb-6">Supported platforms</p>
      <div className="flex flex-wrap justify-center items-center gap-8">
        {platforms.map((platform) => (
          <span
            key={platform.name}
            className={`text-lg font-medium ${platform.color} opacity-80 hover:opacity-100 transition-opacity duration-200`}
          >
            {platform.name}
          </span>
        ))}
      </div>
    </div>
  );
}
