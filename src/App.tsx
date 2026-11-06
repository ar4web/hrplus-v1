import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { PrefsProvider, usePrefs } from './lib/prefs';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Spinner, ErrorBox, Btn } from './components/ui';
import Shell from './components/Shell';
import Login, { Splash } from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Leave = lazy(() => import('./pages/Leave'));
const Directory = lazy(() => import('./pages/Directory'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Timesheets = lazy(() => import('./pages/Timesheets'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Assets = lazy(() => import('./pages/Assets'));
const Documents = lazy(() => import('./pages/Documents'));
const Chat = lazy(() => import('./pages/Chat'));
const Company = lazy(() => import('./pages/Company'));
const Policies = lazy(() => import('./pages/Policies'));
const Support = lazy(() => import('./pages/Support'));
const Settings = lazy(() => import('./pages/Settings'));

function RoleGate({ roles, children }: any) {
  const { role, me } = useAuth();
  if (!roles.includes(role)) return <Navigate to="/" replace />;
  if (me?.profile?.status === 'pending' && !['/support', '/settings'].some((p) => window.location.pathname.startsWith(p))) return <Navigate to="/settings" replace />;
  return children;
}

function Gate() {
  const { session, me, loading, mfaNeeded, error, reloadMe, signOut } = useAuth();
  const { L, prefs } = usePrefs();
  if (loading) return <Splash />;
  if (!session || mfaNeeded) return <Login />;
  if (!me) {
    if (error) return (
      <div className="min-h-screen grid place-items-center p-6"><div className="max-w-md w-full flex flex-col gap-3"><ErrorBox error={error} retry={reloadMe} /><Btn variant="ghost" onClick={() => signOut()}>{L('Sign out', 'تسجيل الخروج')}</Btn></div></div>
    );
    return <Splash />;
  }
  const A = ['admin'], AE = ['admin', 'employee'], AV = ['admin', 'vendor'], ALL = ['admin', 'employee', 'vendor'];
  return (
    <MotionConfig reducedMotion={prefs.reduceMotion ? 'always' : 'user'}>
      <Shell>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={me.profile.status === 'pending' ? <Navigate to="/settings" replace /> : <Dashboard />} />
            <Route path="/attendance" element={<RoleGate roles={AE}><Attendance /></RoleGate>} />
            <Route path="/leave" element={<RoleGate roles={AE}><Leave /></RoleGate>} />
            <Route path="/directory" element={<RoleGate roles={AE}><Directory /></RoleGate>} />
            <Route path="/payroll" element={<RoleGate roles={AE}><Payroll /></RoleGate>} />
            <Route path="/timesheets" element={<RoleGate roles={ALL}><Timesheets /></RoleGate>} />
            <Route path="/invoices" element={<RoleGate roles={AV}><Invoices /></RoleGate>} />
            <Route path="/expenses" element={<RoleGate roles={AE}><Expenses /></RoleGate>} />
            <Route path="/assets" element={<RoleGate roles={AE}><Assets /></RoleGate>} />
            <Route path="/documents" element={<RoleGate roles={AE}><Documents /></RoleGate>} />
            <Route path="/chat" element={<RoleGate roles={ALL}><Chat /></RoleGate>} />
            <Route path="/company" element={<RoleGate roles={A}><Company /></RoleGate>} />
            <Route path="/policies" element={<RoleGate roles={AE}><Policies /></RoleGate>} />
            <Route path="/support" element={<Support />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Shell>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Gate />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}
