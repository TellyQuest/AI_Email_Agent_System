import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDashboardActivity } from '@/hooks/useDashboard';
import { formatDate } from '@/lib/utils';
import type { EventCategory } from '@/types';

const categoryColors: Record<EventCategory, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  email: 'info',
  classification: 'secondary',
  extraction: 'secondary',
  matching: 'secondary',
  action: 'default',
  saga: 'default',
  approval: 'success',
  system: 'warning',
  auth: 'destructive',
};

export default function AuditLog() {
  const [hours, setHours] = useState(24);
  const { data: activity, isLoading } = useDashboardActivity(hours);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last hour</SelectItem>
            <SelectItem value="6">Last 6 hours</SelectItem>
            <SelectItem value="24">Last 24 hours</SelectItem>
            <SelectItem value="72">Last 3 days</SelectItem>
            <SelectItem value="168">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>
              {activity?.events.length ?? 0} events in the selected time range
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : activity?.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity in this time range</p>
            ) : (
              <div className="space-y-4">
                {activity?.events.map((event) => (
                  <div key={event.id} className="flex items-start gap-4 rounded-lg border p-4">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={categoryColors[event.eventCategory]}>
                          {event.eventCategory}
                        </Badge>
                        <span className="text-sm font-medium">{event.eventType}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(event.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Event Counts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(activity?.counts ?? {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground truncate">{type}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
