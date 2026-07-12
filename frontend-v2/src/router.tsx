import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Home from './pages/Home';
import PapersList from './pages/PapersList';
import PaperDetail from './pages/PaperDetail';
import PaperChat from './pages/PaperChat';
import GroupRedirect from './pages/GroupRedirect';

// Lazy: the Finder pulls in the file-system block, document viewers, and
// hugeicons — they must not join the main chunk.
const GroupsFinder = lazy(() => import('./pages/GroupsFinder'));

// Dev-only review surfaces; the conditional imports keep them out of
// production builds entirely.
const IconSheet = import.meta.env.DEV ? lazy(() => import('./pages/dev/IconSheet')) : null;
const KitchenSink = import.meta.env.DEV ? lazy(() => import('./pages/dev/KitchenSink')) : null;
import Search from './pages/Search';
import Dashboard from './pages/Dashboard';
import Annotations from './pages/Annotations';
import Citations from './pages/Citations';
import Ingest from './pages/Ingest';
import Export from './pages/Export';
import Discovery from './pages/Discovery';
import Recommendations from './pages/Recommendations';
import DiscoveryArchive from './pages/DiscoveryArchive';
import HuggingFacePapers from './pages/HuggingFacePapers';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import ErrorPage from './pages/ErrorPage';
import AuthorDetail from './pages/AuthorDetail';
import AuthorSearch from './pages/AuthorSearch';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/admin/login', element: <AdminLogin /> },
  ...(IconSheet
    ? [
        {
          path: '/dev/icons',
          element: (
            <Suspense fallback={null}>
              <IconSheet />
            </Suspense>
          ),
        },
      ]
    : []),
  ...(KitchenSink
    ? [
        {
          path: '/dev/ui',
          element: (
            <Suspense fallback={null}>
              <KitchenSink />
            </Suspense>
          ),
        },
      ]
    : []),
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: 'papers', element: <PapersList /> },
      { path: 'papers/:id', element: <PaperDetail /> },
      { path: 'papers/:id/chat', element: <PaperChat /> },
      {
        path: 'groups',
        element: (
          <Suspense fallback={null}>
            <GroupsFinder />
          </Suspense>
        ),
      },
      { path: 'groups/:id', element: <GroupRedirect /> },
      { path: 'search', element: <Search /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'annotations', element: <Annotations /> },
      { path: 'citations', element: <Citations /> },
      { path: 'ingest', element: <Ingest /> },
      { path: 'export', element: <Export /> },
      { path: 'discovery', element: <Discovery /> },
      { path: 'recommendations', element: <Recommendations /> },
      { path: 'discovery-archive', element: <DiscoveryArchive /> },
      { path: 'huggingface-papers', element: <HuggingFacePapers /> },
      { path: 'settings', element: <Settings /> },
      { path: 'author', element: <AuthorSearch /> },
      { path: 'author/search', element: <AuthorSearch /> },
      { path: 'author/:id', element: <AuthorDetail /> },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requireAdmin>
            <UserManagement />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
