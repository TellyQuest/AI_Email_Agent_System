import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardSummary, useDashboardActivity, usePendingReviews } from '@/hooks/useDashboard';
import { useApproveAction, useRejectAction } from '@/hooks/useActions';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Mail, CheckSquare, Clock, AlertTriangle, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RiskLevel, ActionType } from '@/types';

const riskColors: Record<RiskLevel, 'default' | 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
};

const actionTypeLabels: Record<ActionType, string> = {
  create_bill: 'Create Bill',
  update_bill: 'Update Bill',
  delete_bill: 'Delete Bill',
  create_invoice: 'Create Invoice',
  update_invoice: 'Update Invoice',
  record_payment: 'Record Payment',
  schedule_payment: 'Schedule Payment',
  execute_payment: 'Execute Payment',
  reconcile: 'Reconcile',
  send_invoice: 'Send Invoice',
};

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useDashboardActivity(24);
  const { data: reviews, isLoading: reviewsLoading } = usePendingReviews(5);
  const approveAction = useApproveAction();
  const rejectAction = useRejectAction();

  const handleApprove = (id: string) => {
    approveAction.mutate({ id, approverId: 'dashboard-user' });
  };

  const handleReject = (id: string) => {
    rejectAction.mutate({ id, rejectedBy: 'dashboard-user', reason: 'Rejected from dashboard' });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary?.emails.pending ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {summary?.emails.processing ?? 0} processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary?.actions.pendingApproval ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Require review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Actions</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary?.actions.completed ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                {(summary?.emails.failed ?? 0) + (summary?.actions.failed ?? 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pending Reviews</CardTitle>
            <CardDescription>Actions requiring approval</CardDescription>
          </CardHeader>
          <CardContent>
            {reviewsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : reviews?.reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending reviews</p>
            ) : (
              <div className="space-y-4">
                {reviews?.reviews.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {actionTypeLabels[action.actionType] || action.actionType}
                        </span>
                        <Badge variant={riskColors[action.riskLevel]}>{action.riskLevel}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {(action.parameters.vendorName as string) ||
                          (action.parameters.customerName as string) ||
                          'Unknown'}
                        {action.parameters.amount ? (
                          <> - {formatCurrency(String(action.parameters.amount))}</>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(action.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(action.id)}
                        disabled={rejectAction.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(action.id)}
                        disabled={approveAction.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(reviews?.total ?? 0) > 5 && (
                  <Link to="/actions?requiresApproval=true">
                    <Button variant="outline" className="w-full">
                      View all {reviews?.total} pending
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activity?.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {activity?.events.slice(0, 10).map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{event.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(event.timestamp)}</p>
                    </div>
                  </div>
                ))}
                <Link to="/audit">
                  <Button variant="outline" className="w-full">
                    View full audit log
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
