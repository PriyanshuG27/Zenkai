import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { House, TrendingUp, Calendar, Dumbbell, User, LogOut, Flame } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const DesktopSidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navItems = [
    { path: '/home', label: 'Home', Icon: House },
    { path: '/progress', label: 'Progress', Icon: TrendingUp },
    { path: '/plan', label: 'Weekly Plan', Icon: Calendar },
    { path: '/challenges', label: 'Challenges', Icon: Dumbbell },
    { path: '/profile', label: 'Profile Settings', Icon: User },
  ];

  return (
    <aside
      style={{ height: '100dvh' }}
      className="w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col justify-between sticky top-0 shrink-0 z-50 font-sans"
    >
      <div className="flex flex-col">
        {/* Logo Header */}
        <div className="h-16 flex items-center px-6 border-b border-[var(--border)]">
          <span className="font-display text-2xl font-bold tracking-wider text-[var(--primary)]">
            FITDESI
          </span>
        </div>

        {/* Start Workout Button Section */}
        <div className="p-4 border-b border-[var(--border)]">
          <Link
            to="/workout"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-semibold tracking-wide text-white bg-[var(--primary)] hover:brightness-110 active:scale-[0.98] transition-all"
            style={{
              boxShadow: '0 0 16px var(--primary-glow)',
            }}
          >
            <Flame size={18} className="fill-white" />
            <span>START WORKOUT</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const { path, label, Icon } = item;

            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-4 h-12 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--bg-elevated)] border-l-4 border-[var(--primary)] text-[var(--primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout Bottom Section */}
      <div className="p-4 border-t border-[var(--border)]">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 h-12 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--destructive)] w-full transition-all"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
