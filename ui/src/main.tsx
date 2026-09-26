import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import { Layout } from '@/components/layout'
import { Workspaces } from '@/pages/workspaces'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Workspaces />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
