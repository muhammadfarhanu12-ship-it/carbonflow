import { Bell, Search, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 flex items-center justify-between border-b border-gray-200 bg-white px-6 shrink-0">
      <div className="flex-1 flex items-center">
        <div className="max-w-md w-full relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm transition-colors"
            placeholder="Search users, records..."
          />
        </div>
      </div>
      <div className="ml-4 flex items-center space-x-4">
        <button className="relative p-2 text-gray-400 hover:text-gray-500 rounded-full hover:bg-gray-100 transition-colors">
          <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white" />
          <Bell className="h-5 w-5" />
        </button>
        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold border border-green-200">
          {user?.name?.charAt(0) || 'A'}
        </div>
        <button 
          onClick={logout}
          className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          title="Logout"
        >
          <LogOut className="h-5 w-5 ml-2" />
        </button>
      </div>
    </header>
  );
}
