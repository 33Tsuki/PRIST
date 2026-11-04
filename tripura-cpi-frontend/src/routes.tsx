import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/components/wrappers/protected-route'
import { PublicRoute } from '@/components/wrappers/public-route'
import LandingPage from '@/pages/landing'
import LoginPage from '@/pages/login'
import MasterDataPage from '@/pages/master-data'
import MarketDetailPage from '@/pages/master-data/market-detail'
import UserManagementPage from '@/pages/user-management'
import SurveyManagementPage from '@/pages/survey-management'
import MarketSetupDetailPage from '@/pages/survey-management/market-setup-detail'
import SurveyDashboardPage from '@/pages/survey-dashboard'
import DistrictDetailPage from '@/pages/survey-dashboard/district-detail'
import DashboardMarketDetailPage from '@/pages/survey-dashboard/market-detail'
import ReportsPage from '@/pages/reports'
import NotFoundPage from '@/pages/not-found'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <LandingPage />,
    },
    {
      element: <PublicRoute />,
      children: [{ path: '/login', element: <LoginPage /> }],
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          element: <AppLayout />,
          children: [
            { path: '/master-data', element: <MasterDataPage /> },
            { path: '/master-data/markets/:marketId', element: <MarketDetailPage /> },
            { path: '/user-management', element: <UserManagementPage /> },
            { path: '/survey-management', element: <SurveyManagementPage /> },
            {
              path: '/survey-management/setups/:roundId/:marketId',
              element: <MarketSetupDetailPage />,
            },
            { path: '/survey-dashboard', element: <SurveyDashboardPage /> },
            {
              path: '/survey-dashboard/:roundId/districts/:districtId',
              element: <DistrictDetailPage />,
            },
            {
              path: '/survey-dashboard/:roundId/markets/:marketId',
              element: <DashboardMarketDetailPage />,
            },
            { path: '/reports', element: <ReportsPage /> },
            { path: '/dashboard', element: <Navigate to="/survey-dashboard" replace /> },
          ],
        },
      ],
    },
    {
      path: '*',
      element: <NotFoundPage />,
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/+$/, '') },
)
