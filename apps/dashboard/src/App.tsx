import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Emails from './pages/Emails';
import Actions from './pages/Actions';
import Clients from './pages/Clients';
import AuditLog from './pages/AuditLog';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="emails" element={<Emails />} />
        <Route path="emails/:id" element={<Emails />} />
        <Route path="actions" element={<Actions />} />
        <Route path="actions/:id" element={<Actions />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<Clients />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
    </Routes>
  );
}

export default App;
