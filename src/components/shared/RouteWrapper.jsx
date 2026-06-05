import React from 'react';
import { useDeviceLayout } from '../../hooks/useDeviceLayout';

export const RouteWrapper = ({ mobile: MobileComponent, desktop: DesktopComponent }) => {
  const { isMobile } = useDeviceLayout();
  return isMobile ? <MobileComponent /> : <DesktopComponent />;
};
