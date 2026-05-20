import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './pages/Auth/LoginPage';
import { RegisterPage } from './pages/Auth/RegisterPage';
import { ForgotPasswordPage } from './pages/Auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/Auth/ResetPasswordPage';
import { OAuthAuthorizePage } from './pages/Auth/OAuthAuthorizePage';
import { AppLayout } from './pages/App/AppLayout';
import { AdminLayout } from './pages/Admin/AdminLayout';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { AdminUsersPage } from './pages/Admin/AdminUsersPage';
import { AdminBadgesPage } from './pages/Admin/AdminBadgesPage';
import { AdminGuildsPage } from './pages/Admin/AdminGuildsPage';
import { AdminReportsPage } from './pages/Admin/AdminReportsPage';
import { AdminPluginsPage } from './pages/Admin/AdminPluginsPage';
import { AdminAnnouncementsPage } from './pages/Admin/AdminAnnouncementsPage';
import { AdminAuditLogsPage } from './pages/Admin/AdminAuditLogsPage';
import { AdminSettingsPage } from './pages/Admin/AdminSettingsPage';
import { AdminBackupsPage } from './pages/Admin/AdminBackupsPage';
import { PremiumPage } from './pages/PremiumPage/PremiumPage';
import { FriendsPage } from './pages/FriendsPage/FriendsPage';
import { InviteAcceptPage } from './pages/Invite/InviteAcceptPage';
import { DiscoveryPage } from './pages/Discovery/DiscoveryPage';
import './utils/i18n';
import './styles/global.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/oauth2/authorize" element={<OAuthAuthorizePage />} />
          <Route path="/discover" element={<DiscoveryPage />} />
          <Route path="/channels/*" element={<AppLayout />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/invite/:code" element={<InviteAcceptPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="badges" element={<AdminBadgesPage />} />
            <Route path="guilds" element={<AdminGuildsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="plugins" element={<AdminPluginsPage />} />
            <Route path="announcements" element={<AdminAnnouncementsPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="backups" element={<AdminBackupsPage />} />
          </Route>
          <Route path="/premium" element={<PremiumPage />} />
          <Route path="*" element={<Navigate to="/channels/@me" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
