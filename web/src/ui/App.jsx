
import React, { useState } from 'react'
import { api } from './api.js'
import { getSocket, resetSocket } from './socket.js'
import Gate from './gate/Gate.jsx'
import SidebarGroups from './layout/SidebarGroups.jsx'
import SidebarUsers from './layout/SidebarUsers.jsx'
import ChatWindow from './layout/ChatWindow.jsx'

export default function App(){
  const [me, setMe] = useState(null)
  const [groups, setGroups] = useState([])
  const [contacts, setContacts] = useState([])
  const [active, setActive] = useState({ type: null })

  async function refreshAll(){
    const { me } = await api('/api/me'); setMe(me)
    const gr = await api('/api/groups'); setGroups(gr.groups)
    const cc = await api('/api/contacts'); setContacts(cc.contacts)
    const sock = getSocket(); sock.auth = { token: localStorage.getItem('token') || '' }; sock.connect()
    sock.on('message:new', () => setActive(prev => ({...prev})))
  }
  const logout = () => { localStorage.removeItem('token'); resetSocket(); setMe(null) }

  if (!localStorage.getItem('token')) return <Gate onReady={refreshAll} />
  if (!me) return <div className="min-h-screen bg-ink text-mist grid place-items-center"><div className="animate-pulse text-mist/70">Ładowanie…</div></div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-wine to-mulberry text-mist flex">
      <SidebarGroups groups={groups} onCreated={refreshAll} onSelect={(ch)=> setActive({ type:'channel', id: ch.id, label: ch.name })} />
      <SidebarUsers contacts={contacts} onAdd={() => refreshAll()} onSelect={(u)=> setActive({ type:'dm', id: u.sid, label: u.displayName, toSid: u.sid })} />
      <div className="flex-1 flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-crimson/30 bg-black/40 backdrop-blur">
          <div className="font-semibold tracking-wide">{active.type ? (active.type==='dm' ? `DM: ${active.label}` : `Kanał: ${active.label}`) : 'Wybierz rozmowę'}</div>
          <div className="text-sm opacity-80 flex gap-3 items-center">
            <span className="hidden md:inline">Zalogowano jako</span>
            <span className="px-2 py-1 rounded-md bg-crimson/30">{me.displayName} • {me.sid}</span>
            <button className="px-3 py-1 bg-crimson/30 hover:bg-crimson/50 rounded-md" onClick={logout}>Wyloguj</button>
          </div>
        </div>
        <ChatWindow active={active} me={me} />
      </div>
    </div>
  )
}
