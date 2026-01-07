import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useActions, useAction, useApproveAction, useRejectAction } from '@/hooks/useActions';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Check, X, AlertTriangle } from 'lucide-react';
import type { ActionStatus, RiskLevel, ActionType, Action, ActionWithContext } from '@/types';

const statusColors: Record<ActionStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  executing: 'default',
  completed: 'success',
  failed: 'destructive',
  compensated: 'warning',
};

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

export default function Actions() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'all'>(
    (searchParams.get('status') as ActionStatus) || 'all'
  );
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const requiresApproval = searchParams.get('requiresApproval') === 'true';

  const { data: actions, isLoading } = useActions({
    status: statusFilter === 'all' ? undefined : statusFilter,
    riskLevel: riskFilter === 'all' ? undefined : riskFilter,
    requiresApproval: requiresApproval || undefined,
    limit: 50,
  });

  const { data: selectedAction, isLoading: actionLoading } = useAction(id);

  const handleRowClick = (action: Action) => {
    navigate(`/actions/${action.id}`);
  };

  if (id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/actions')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Actions
        </Button>

        {actionLoading ? (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-1/2 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : selectedAction ? (
          <ActionDetail action={selectedAction} />
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Action not found</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ActionStatus | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskLevel | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            {actions?.total ?? 0} total actions
            {requiresApproval && ' (pending approval only)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions?.data.map((action) => (
                  <TableRow
                    key={action.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(action)}
                  >
                    <TableCell className="font-medium">
                      {actionTypeLabels[action.actionType]}
                    </TableCell>
                    <TableCell>{action.targetSystem}</TableCell>
                    <TableCell>
                      <Badge variant={riskColors[action.riskLevel]}>{action.riskLevel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[action.status]}>{action.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(action.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionDetail({ action }: { action: ActionWithContext }) {
  const navigate = useNavigate();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approveAction = useApproveAction();
  const rejectAction = useRejectAction();

  const handleApprove = () => {
    approveAction.mutate(
      { id: action.id, approverId: 'dashboard-user' },
      { onSuccess: () => navigate('/actions') }
    );
  };

  const handleReject = () => {
    rejectAction.mutate(
      { id: action.id, rejectedBy: 'dashboard-user', reason: rejectReason },
      { onSuccess: () => navigate('/actions') }
    );
  };

  const canApprove = action.status === 'pending' && action.requiresApproval;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{actionTypeLabels[action.actionType]}</CardTitle>
              <CardDescription>Target: {action.targetSystem}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={riskColors[action.riskLevel]}>{action.riskLevel} risk</Badge>
              <Badge variant={statusColors[action.status]}>{action.status}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-2">Parameters</h4>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
              {JSON.stringify(action.parameters, null, 2)}
            </pre>
          </div>

          {action.riskReasons.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Risk Reasons
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {action.riskReasons.map((reason, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {action.result && (
            <div>
              <h4 className="text-sm font-medium mb-2">Result</h4>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
                {JSON.stringify(action.result, null, 2)}
              </pre>
            </div>
          )}

          {action.error && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-destructive">Error</h4>
              <p className="text-sm text-destructive">{action.error}</p>
            </div>
          )}

          {canApprove && (
            <div className="flex gap-2 pt-4">
              <Button onClick={handleApprove} disabled={approveAction.isPending}>
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button variant="destructive" onClick={() => setRejectDialogOpen(true)}>
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatDate(action.createdAt)}</span>
            </div>
            {action.approvedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Approved</span>
                <span className="text-sm">{formatDate(action.approvedAt)}</span>
              </div>
            )}
            {action.rejectedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Rejected</span>
                <span className="text-sm">{formatDate(action.rejectedAt)}</span>
              </div>
            )}
            {action.executedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Executed</span>
                <span className="text-sm">{formatDate(action.executedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {action.email && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Source Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Subject</span>
                <p className="text-sm truncate">{action.email.subject}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">From</span>
                <p className="text-sm">{action.email.senderEmail}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate(`/emails/${action.emailId}`)}
              >
                View Email
              </Button>
            </CardContent>
          </Card>
        )}

        {action.client && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">Name</span>
                <p className="text-sm">{action.client.displayName || action.client.name}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate(`/clients/${action.client!.id}`)}
              >
                View Client
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Action</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={!rejectReason.trim()}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
