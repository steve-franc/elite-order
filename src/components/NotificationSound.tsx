import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useRestaurantAndRole';

// Persistent alarm that loops until explicitly stopped
let globalAlarmInterval: ReturnType<typeof setInterval> | null = null;
let globalAudioCtx: AudioContext | null = null;

function startAlarm() {
  if (globalAlarmInterval) return;
  playChime();
  globalAlarmInterval = setInterval(playChime, 3000);
}

export function stopAlarm() {
  if (globalAlarmInterval) {
    clearInterval(globalAlarmInterval);
    globalAlarmInterval = null;
  }
  if (globalAudioCtx) {
    globalAudioCtx.close().catch(() => {});
    globalAudioCtx = null;
  }
}

function playChime() {
  try {
    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = globalAudioCtx;
    const now = ctx.currentTime;
    // Three-tone ascending chime
    [587.33, 880, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.35);
    });
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

export const NotificationSound = () => {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase
      .channel('public-orders-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: 'is_public_order=eq.true'
        },
        (payload) => {
          console.log('New public order received:', payload);
          startAlarm();
          const customerName = (payload.new as any)?.customer_name || 'A customer';
          toast.success(`🔔 New online order from ${customerName}!`, {
            duration: Infinity,
            description: 'Go to Order History to confirm or decline.',
            id: `pending-order-${(payload.new as any)?.id}`,
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAlarm();
  }, []);

  return null;
};
