import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import { Layout } from '@/components/layout'
import { Workspaces } from '@/pages/workspaces'
import { Repositorios } from '@/pages/repositorios'
import { Tickets } from '@/pages/tickets'
import { NovoTicket } from '@/pages/novo-ticket'
import { Ticket } from '@/pages/ticket'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Workspaces />} />
          <Route path="w/:id/tickets" element={<Tickets />} />
          <Route path="w/:id/tickets/novo" element={<NovoTicket />} />
          <Route path="w/:id/tickets/:ticketId" element={<Ticket />} />
          <Route path="w/:id/repos" element={<Repositorios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
