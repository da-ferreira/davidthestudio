import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import './index.css'
import '@/lib/theme'
import { Layout } from '@/components/layout'
import { Workspaces } from '@/pages/workspaces'
import { Repositorios } from '@/pages/repositorios'
import { Tickets } from '@/pages/tickets'
import { NovoTicket } from '@/pages/novo-ticket'
import { Ticket } from '@/pages/ticket'
import { Conexoes } from '@/pages/conexoes'
import { Conversar } from '@/pages/conversar'
import { Melhorias } from '@/pages/melhorias'
import { Convite } from '@/pages/entrar'
import { Usuarios } from '@/pages/usuarios'
import { Conta } from '@/pages/conta'
import { AuthGate } from '@/components/auth-gate'

// O modo Perguntar virou Conversar; links antigos continuam abrindo a conversa.
function RedirectPerguntar() {
  const { id, conversationId } = useParams()
  return <Navigate replace to={`/w/${id}/conversar${conversationId ? `/${conversationId}` : ''}`} />
}

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
          <Route path="w/:id/conversar" element={<Conversar />} />
          <Route path="w/:id/conversar/:conversationId" element={<Conversar />} />
          <Route path="w/:id/perguntar/:conversationId?" element={<RedirectPerguntar />} />
          <Route path="w/:id/melhorias" element={<Melhorias />} />
          <Route path="w/:id/repos" element={<Repositorios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
