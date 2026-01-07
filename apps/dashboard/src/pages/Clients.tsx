import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useClients, useClient, useCreateClient, useClientMappings } from '@/hooks/useClients';
import { formatDate, formatCurrency } from '@/lib/utils';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import type { Client } from '@/types';

export default function Clients() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: clients, isLoading } = useClients({
    search: search || undefined,
    limit: 50,
  });

  const { data: selectedClient, isLoading: clientLoading } = useClient(id);

  const handleRowClick = (client: Client) => {
    navigate(`/clients/${client.id}`);
  };

  if (id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/clients')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Clients
        </Button>

        {clientLoading ? (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-1/2 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ) : selectedClient ? (
          <ClientDetail client={selectedClient} />
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Client not found</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <CreateClientDialog onClose={() => setCreateDialogOpen(false)} />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>
            {clients?.total ?? 0} total clients
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
                  <TableHead>Name</TableHead>
                  <TableHead>Email Domains</TableHead>
                  <TableHead>Approval Threshold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients?.data.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(client)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {client.displayName || client.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {client.emailDomains.slice(0, 2).map((domain) => (
                          <Badge key={domain} variant="outline" className="text-xs">
                            {domain}
                          </Badge>
                        ))}
                        {client.emailDomains.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{client.emailDomains.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(client.approvalThreshold)}</TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? 'success' : 'secondary'}>
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(client.createdAt)}</TableCell>
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

function ClientDetail({ client }: { client: Client }) {
  const { data: mappings } = useClientMappings(client.id);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{client.displayName || client.name}</CardTitle>
              <CardDescription>{client.name}</CardDescription>
            </div>
            <Badge variant={client.isActive ? 'success' : 'secondary'}>
              {client.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Email Domains</h4>
              <div className="flex gap-1 flex-wrap">
                {client.emailDomains.length > 0 ? (
                  client.emailDomains.map((domain) => (
                    <Badge key={domain} variant="outline">
                      {domain}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No domains configured</span>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Known Emails</h4>
              <div className="flex gap-1 flex-wrap">
                {client.knownEmails.length > 0 ? (
                  client.knownEmails.map((email) => (
                    <Badge key={email} variant="outline">
                      {email}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No emails configured</span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">Auto-Approve Vendors</h4>
            <div className="flex gap-1 flex-wrap">
              {client.autoApproveVendors.length > 0 ? (
                client.autoApproveVendors.map((vendor) => (
                  <Badge key={vendor} variant="secondary">
                    {vendor}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No auto-approve vendors</span>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-2">Email Mappings</h4>
            {mappings?.data.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.data.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell className="font-mono text-sm">{mapping.emailPattern}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{mapping.patternType}</Badge>
                      </TableCell>
                      <TableCell>{mapping.source}</TableCell>
                      <TableCell>{(mapping.confidence * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No email mappings</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Approval Threshold</span>
              <span className="text-sm font-medium">{formatCurrency(client.approvalThreshold)}</span>
            </div>
            {client.defaultExpenseAccount && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Expense Account</span>
                <span className="text-sm">{client.defaultExpenseAccount}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {client.quickbooksId && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">QuickBooks ID</span>
                <span className="text-sm font-mono">{client.quickbooksId}</span>
              </div>
            )}
            {client.billcomId && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Bill.com ID</span>
                <span className="text-sm font-mono">{client.billcomId}</span>
              </div>
            )}
            {!client.quickbooksId && !client.billcomId && (
              <p className="text-sm text-muted-foreground">No integrations configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatDate(client.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Updated</span>
              <span className="text-sm">{formatDate(client.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CreateClientDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailDomains, setEmailDomains] = useState('');
  const createClient = useCreateClient();

  const handleSubmit = () => {
    createClient.mutate(
      {
        name,
        displayName: displayName || undefined,
        emailDomains: emailDomains.split(',').map((d) => d.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          onClose();
          setName('');
          setDisplayName('');
          setEmailDomains('');
        },
      }
    );
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create Client</DialogTitle>
        <DialogDescription>Add a new client to the system.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Name *</label>
          <Input
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Display Name</label>
          <Input
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email Domains</label>
          <Input
            placeholder="example.com, another.com"
            value={emailDomains}
            onChange={(e) => setEmailDomains(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Comma-separated list of domains</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!name.trim() || createClient.isPending}>
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
