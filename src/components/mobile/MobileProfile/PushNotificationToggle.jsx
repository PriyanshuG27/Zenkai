import React, { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { useUIStore } from '../../../stores/useUIStore';
import { isPushEnabled, enablePushNotifications, disablePushNotifications } from '../../../hooks/useFCM';

export function PushNotificationToggle() {
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);
  const [enabled, setEnabled] = useState(() => isPushEnabled());
  const [loading, setLoading] = useState(false);
  const browserBlocked = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied';

  const handleToggle = async () => {
    if (loading || !user) return;
    setLoading(true);
    try {
      if (enabled) {
        await disablePushNotifications(user.uid);
        setEnabled(false);
        addToast('🔕 Push notifications turned off.', 'info');
      } else {
        const success = await enablePushNotifications(user.uid, addToast);
        if (success) {
          setEnabled(true);
          addToast('🔔 Push notifications turned on!', 'success');
        } else {
          addToast('⚠️ Could not enable — check browser notification permissions.', 'warning');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-4 rounded-xl shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {enabled
            ? <Bell size={16} className="text-[var(--primary)] shrink-0" />
            : <BellOff size={16} className="text-neutral-500 shrink-0" />
          }
          <div className="flex flex-col">
            <span className="font-display text-xs font-black uppercase tracking-wide text-white">
              Push Notifications
            </span>
            <span className="text-[9px] text-neutral-400 font-sans mt-0.5">
              {browserBlocked
                ? 'Blocked in browser settings — reset to enable'
                : enabled ? 'Squad updates, gym reminders & app news' : 'Currently off for this device'}
            </span>
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={handleToggle}
          disabled={loading || browserBlocked}
          aria-label={enabled ? 'Turn off push notifications' : 'Turn on push notifications'}
          className={`relative w-12 h-6 rounded-full border-2 border-black transition-all duration-200 shrink-0 cursor-pointer
            ${enabled ? 'bg-[var(--primary)]' : 'bg-neutral-700'}
            ${(loading || browserBlocked) ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full border border-black shadow transition-all duration-200
            ${enabled ? 'left-6' : 'left-0.5'}`}
          />
        </button>
      </div>
    </div>
  );
}
