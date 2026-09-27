import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import '@/lib/theme'
import { Layout } from '@/components/layout'
import { Workspaces } from '@/pages/workspaces'
import { Repositorios } from '@/pages/repositorios'
import { Tickets } from '@/pages/tickets'
import { NovoTicket } from '@/pages/novo-ticket'
import { Ticket } from '@/pages/ticket'
import { Conexoes } from '@/pages/conexoes'
import { Perguntar } from '@/pages/perguntar'
import { Convite } from '@/pages/entrar'
import { Usuarios } from '@/pages/usuarios'
import { Conta } from '@/pages/conta'
import { AuthGate } from '@/components/auth-gate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="convite/:token" element={<Convite />} />
        <Route
          element={
            <AuthGate>
              <Layout />
            </AuthGate>
          }
        >
          <Route index element={<Workspaces />} />
          <Route path="conexoes" element={<Conexoes />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="conta" element={<Conta />} />
          <Route path="w/:id/tickets" element={<Tickets />} />
          <Route path="w/:id/tickets/novo" element={<NovoTicket />} />
          <Route path="w/:id/tickets/:ticketId" element={<Ticket />} />
          <Route path="w/:id/perguntar" element={<Perguntar />} />
          <Route path="w/:id/perguntar/:conversationId" element={<Perguntar />} />
          <Route path="w/:id/repos" element={<Repositorios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
