import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { CurrentUserProvider } from './context/CurrentUserContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CurrentUserProvider>
        <App />
      </CurrentUserProvider>
    </BrowserRouter>
  </StrictMode>,
)
