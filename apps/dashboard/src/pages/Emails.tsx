import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
import { useEmails, useEmail } from '@/hooks/useEmails';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Mail, Paperclip, ArrowLeft } from 'lucide-react';
import type { EmailStatus, EmailType, Urgency, Email } from '@/types';

const statusColors: Record<EmailStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  pending: 'secondary',
  processing: 'default',
  classified: 'default',
  matched: 'default',
  extracted: 'default',
  planned: 'default',
  completed: 'success',
  failed: 'destructive',
  archived: 'secondary',
};

const urgencyColors: Record<Urgency, 'default' | 'secondary' | 'warning' | 'destructive'> = {
  low: 'secondary',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
};

const emailTypeLabels: Record<EmailType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  payment_notice: 'Payment Notice',
  bank_notice: 'Bank Notice',
  inquiry: 'Inquiry',
  irrelevant: 'Irrelevant',
};

export default function Emails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<EmailStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: emails, isLoading } = useEmails({
    status: statusFilter === 'all' ? undefined : statusFilter,
    senderEmail: search || undefined,
    limit: 50,
  });

  const { data: selectedEmail, isLoading: emailLoading } = useEmail(id);

  const handleRowClick = (email: Email) => {
    navigate(`/emails/${email.id}`);
  };

  if (id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/emails')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Emails
        </Button>

        {emailLoading ? (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-1/2 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : selectedEmail ? (
          <EmailDetail email={selectedEmail} />
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Email not found</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by sender email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EmailStatus | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription>
            {emails?.total ?? 0} total emails
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
                  <TableHead>Subject</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails?.data.map((email) => (
                  <TableRow
                    key={email.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(email)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {email.hasAttachments && <Paperclip className="h-4 w-4 text-muted-foreground" />}
                        <span className="truncate max-w-[300px]">{email.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell>{email.senderEmail}</TableCell>
                    <TableCell>
                      {email.classification?.emailType && (
                        <Badge variant="outline">
                          {emailTypeLabels[email.classification.emailType]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[email.status]}>{email.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(email.receivedAt)}</TableCell>
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

function EmailDetail({ email }: { email: Email }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {email.subject}
              </CardTitle>
              <CardDescription>
                From: {email.senderName ? `${email.senderName} <${email.senderEmail}>` : email.senderEmail}
              </CardDescription>
            </div>
            <Badge variant={statusColors[email.status]}>{email.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap bg-muted p-4 rounded-lg text-sm">
              {email.bodyText || 'No body content'}
            </pre>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {email.classification && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Type</span>
                <Badge variant="outline">
                  {emailTypeLabels[email.classification.emailType]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Urgency</span>
                <Badge variant={urgencyColors[email.classification.urgency]}>
                  {email.classification.urgency}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Confidence</span>
                <span className="text-sm">{(email.classification.confidence * 100).toFixed(0)}%</span>
              </div>
              <Separator />
              <div>
                <span className="text-sm text-muted-foreground">Intent</span>
                <p className="text-sm mt-1">{email.classification.intent}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {email.extractedData && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Extracted Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {email.extractedData.vendorName.value && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Vendor</span>
                  <span className="text-sm">{email.extractedData.vendorName.value}</span>
                </div>
              )}
              {email.extractedData.amount.value && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(
                      email.extractedData.amount.value,
                      email.extractedData.currency.value || 'USD'
                    )}
                  </span>
                </div>
              )}
              {email.extractedData.invoiceNumber.value && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Invoice #</span>
                  <span className="text-sm">{email.extractedData.invoiceNumber.value}</span>
                </div>
              )}
              {email.extractedData.dueDate.value && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Due Date</span>
                  <span className="text-sm">{email.extractedData.dueDate.value}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Confidence</span>
                <span className="text-sm">{(email.extractedData.overallConfidence * 100).toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Received</span>
              <span className="text-sm">{formatDate(email.receivedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Attachments</span>
              <span className="text-sm">{email.hasAttachments ? 'Yes' : 'No'}</span>
            </div>
            {email.matchMethod && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Match Method</span>
                <span className="text-sm">{email.matchMethod}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
