import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export interface ServiceFields {
  is_service: boolean;
  service_duration_minutes: string;
  slot_capacity: string;
  buffer_minutes: string;
  advance_booking_days: string;
}

export interface AvailabilityWindow {
  id?: string; // existing rows have id; new rows do not
  weekday: number;
  start_time: string; // "HH:mm"
  end_time: string;
  is_active: boolean;
}

interface ServiceFormSectionProps {
  menuItemId?: string; // present when editing
  values: ServiceFields;
  onChange: (next: ServiceFields) => void;
  availability: AvailabilityWindow[];
  onAvailabilityChange: (next: AvailabilityWindow[]) => void;
}

export function ServiceFormSection({
  menuItemId,
  values,
  onChange,
  availability,
  onAvailabilityChange,
}: ServiceFormSectionProps) {
  const [loadingAvail, setLoadingAvail] = useState(false);

  // Load existing availability when editing a service item
  useEffect(() => {
    if (!menuItemId || !values.is_service) return;
    if (availability.length > 0) return;
    setLoadingAvail(true);
    (async () => {
      const { data } = await (supabase as any)
        .from("service_availability")
        .select("id, weekday, start_time, end_time, is_active")
        .eq("menu_item_id", menuItemId);
      if (data && data.length > 0) {
        onAvailabilityChange(
          data.map((r: any) => ({
            id: r.id,
            weekday: r.weekday,
            start_time: (r.start_time as string).slice(0, 5),
            end_time: (r.end_time as string).slice(0, 5),
            is_active: r.is_active,
          }))
        );
      }
      setLoadingAvail(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuItemId, values.is_service]);

  // Default availability when toggling service on for the first time (no windows yet)
  useEffect(() => {
    if (values.is_service && availability.length === 0 && !loadingAvail && !menuItemId) {
      onAvailabilityChange(
        [1, 2, 3, 4, 5].map((d) => ({
          weekday: d,
          start_time: "09:00",
          end_time: "17:00",
          is_active: true,
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.is_service]);

  const addWindow = (weekday: number) => {
    onAvailabilityChange([
      ...availability,
      { weekday, start_time: "09:00", end_time: "17:00", is_active: true },
    ]);
  };

  const removeWindow = (index: number) => {
    onAvailabilityChange(availability.filter((_, i) => i !== index));
  };

  const updateWindow = (index: number, patch: Partial<AvailabilityWindow>) => {
    onAvailabilityChange(
      availability.map((w, i) => (i === index ? { ...w, ...patch } : w))
    );
  };

  const toggleService = (next: boolean) => {
    onChange({ ...values, is_service: next });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="is_service" className="text-sm font-medium flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            This is a service (bookable timeslots)
          </Label>
          <p className="text-xs text-muted-foreground">
            Customers pick a date &amp; time. Each booking takes a slot instead of stock.
          </p>
        </div>
        <Switch
          id="is_service"
          checked={values.is_service}
          onCheckedChange={toggleService}
        />
      </div>

      {values.is_service && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="duration" className="text-xs">Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                min={5}
                max={1440}
                step={5}
                value={values.service_duration_minutes}
                onChange={(e) => onChange({ ...values, service_duration_minutes: e.target.value })}
                placeholder="60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="capacity" className="text-xs">Capacity per slot</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={500}
                value={values.slot_capacity}
                onChange={(e) => onChange({ ...values, slot_capacity: e.target.value })}
                placeholder="1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="buffer" className="text-xs">Buffer between bookings (min)</Label>
              <Input
                id="buffer"
                type="number"
                min={0}
                max={240}
                value={values.buffer_minutes}
                onChange={(e) => onChange({ ...values, buffer_minutes: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advance" className="text-xs">Bookable up to (days ahead)</Label>
              <Input
                id="advance"
                type="number"
                min={1}
                max={365}
                value={values.advance_booking_days}
                onChange={(e) => onChange({ ...values, advance_booking_days: e.target.value })}
                placeholder="30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Weekly availability
            </Label>
            <p className="text-xs text-muted-foreground">
              Add the open time windows for each day. Customers can only book inside these windows.
            </p>
            <div className="space-y-2">
              {WEEKDAYS.map((day) => {
                const dayWindows = availability
                  .map((w, i) => ({ w, i }))
                  .filter(({ w }) => w.weekday === day.value);
                return (
                  <div key={day.value} className="rounded-md border bg-background p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{day.label}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => addWindow(day.value)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add window
                      </Button>
                    </div>
                    {dayWindows.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Closed</p>
                    ) : (
                      <div className="space-y-1.5">
                        {dayWindows.map(({ w, i }) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={w.start_time}
                              onChange={(e) => updateWindow(i, { start_time: e.target.value })}
                              className="h-8 w-28"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="time"
                              value={w.end_time}
                              onChange={(e) => updateWindow(i, { end_time: e.target.value })}
                              className="h-8 w-28"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeWindow(i)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const DEFAULT_SERVICE_FIELDS: ServiceFields = {
  is_service: false,
  service_duration_minutes: "60",
  slot_capacity: "1",
  buffer_minutes: "0",
  advance_booking_days: "30",
};
