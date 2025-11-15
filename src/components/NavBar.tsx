import { Logo } from './Logo';
import { Button } from './ui/button';
import { Search, User, Heart } from 'lucide-react';

export function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Logo size="sm" />

          {/* Search bar */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="영화, 장르 검색..."
                className="w-full bg-white/10 border border-white/20 rounded-full pl-10 pr-4 py-2 text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-400 transition-colors"
              />
            </div>
          </div>

          {/* Nav items */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
              <Heart className="w-4 h-4 mr-2" />
              찜 목록
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
              <User className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
