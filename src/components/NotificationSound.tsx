import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useRestaurantAndRole';
import { useRestaurantContext } from '@/hooks/useRestaurantContext';

// Looping notification alarm that repeats until stopped
class NotificationAlarm {
  private ctx: AudioContext | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.intervalId) return; // already playing
    this.playChime();
    this.intervalId = setInterval(() => this.playChime(), 2500);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private playChime() {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const now = this.ctx.currentTime;
      const frequencies = [587.33, 880, 587.33]; // D5, A5, D5
      frequencies.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.35, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.35);
      });
    } catch (e) {
      console.warn('Could not play notification sound:', e);
    }
  }
}

export const NotificationSound = () => {
  const { session } = useAuth();
  const { restaurantId } = useRestaurantContext();
  const alarmRef = useRef(new NotificationAlarm());

  // Listen for new public orders → start alarm
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
          alarmRef.current.start();
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

  // Listen for order status updates → stop alarm when no more pending orders
  useEffect(() => {
    if (!session?.user || !restaurantId) return;

    const channel = supabase
      .channel('order-status-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        async (payload) => {
          const newStatus = (payload.new as any)?.status;
          if (newStatus === 'confirmed' || newStatus === 'declined') {
            // Dismiss the specific toast
            toast.dismiss(`pending-order-${(payload.new as any)?.id}`);

            // Check if there are still pending orders
            const { count } = await supabase
              .from('orders')
              .select('id', { count: 'exact', head: true })
              .eq('restaurant_id', restaurantId)
              .eq('is_public_order', true)
              .eq('status', 'pending');

            if (!count || count === 0) {
              alarmRef.current.stop();
            }
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user, restaurantId]);

  // Cleanup on unmount
  useEffect(() => {
    const alarm = alarmRef.current;
    return () => alarm.stop();
  }, []);

  return null;
};
