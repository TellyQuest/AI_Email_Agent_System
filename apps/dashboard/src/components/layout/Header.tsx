import { useLocation } from 'react-router-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/emails': 'Emails',
  '/actions': 'Actions',
  '/clients': 'Clients',
  '/audit': 'Audit Log',
  '/settings': 'Settings',
};

export default function Header() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const basePath = '/' + location.pathname.split('/')[1];
  const title = titles[basePath] || 'Dashboard';

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handleRefresh}>
          <RefreshCw className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
