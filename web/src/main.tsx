import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './i18n'
import './index.css'
import { router } from './router.tsx'
import { CurrentUserProvider } from './context/CurrentUserContext.tsx'
import { ToastProvider } from './components/Toast.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The mock API adds latency and flakiness; retry reads a little.
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations are user-confirmed workflow actions; auto-retrying could
      // double-apply one or mask the conflict responses the API returns.
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </CurrentUserProvider>
    </QueryClientProvider>
  </StrictMode>,
)
