import { createBrowserRouter } from 'react-router-dom';
import PapersList from './pages/PapersList';
import PaperDetail from './pages/PaperDetail';
import Search from './pages/Search';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import AllAnnotations from './pages/AllAnnotations';
import Dashboard from './pages/Dashboard';
import PaperCitations from './pages/PaperCitations';
import IngestPaper from './pages/IngestPaper';
import ExportPapers from './pages/ExportPapers';
import Layout from './components/Layout';

import ErrorPage from './pages/ErrorPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <PapersList />,
      },
      {
        path: 'papers/:id',
        element: <PaperDetail />,
      },
      {
        path: 'search',
        element: <Search />,
      },
      {
        path: 'groups',
        element: <Groups />,
      },
      {
        path: 'groups/:id',
        element: <GroupDetail />,
      },
      {
        path: 'annotations',
        element: <AllAnnotations />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'citations',
        element: <PaperCitations />,
      },
      {
        path: 'ingest',
        element: <IngestPaper />,
      },
      {
        path: 'export',
        element: <ExportPapers />,
      },
    ],
  },
]);


