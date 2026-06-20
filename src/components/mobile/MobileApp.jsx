import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { NeubrutalistSkeleton } from '../shared/NeubrutalistSkeleton';

export const MobileApp = () => {
  const location = useLocation();
  const hideNav = location.pathname.includes('/workout');

  return (
    <div style={{ height: '100dvh' }} className="bg-[var(--bg-oled)] text-[var(--text-primary)] flex flex-col overflow-hidden relative">
      <div 
        className={`flex-1 overflow-y-auto ${hideNav ? '' : 'pb-safe-nav'}`}
      >
        <Suspense fallback={<NeubrutalistSkeleton />}>
          <Outlet />
        </Suspense>
      </div>

      {!hideNav && <BottomNav />}
    </div>
  );
};

export default MobileApp;
