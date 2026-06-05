import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export const MobileApp = () => {
  const location = useLocation();
  const hideNav = location.pathname.includes('/workout');

  return (
    <div style={{ height: '100dvh' }} className="bg-[var(--bg-oled)] text-[var(--text-primary)] flex flex-col overflow-hidden relative">
      <div 
        className="flex-1 overflow-y-auto" 
        style={{ paddingBottom: hideNav ? '0px' : 'calc(64px + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </div>

      {!hideNav && <BottomNav />}
    </div>
  );
};
