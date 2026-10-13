
import React, { useState } from 'react'
import { api } from '../api.js'
import classNames from 'classnames'

export default function SidebarUsers({ contacts, onAdd, onSelect }){
  const [expanded, setExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const [sid, setSid] = useState('')
  const addUser = async () => { if (!sid.trim()) return; await api('/api/contacts/add', { method:'POST', body: JSON.stringify({ sid }) }); setSid(''); setAdding(false); onAdd && onAdd() }

  return (
    <div className={classNames('h-screen bg-black/30 backdrop-blur border-r border-crimson/30 transition-all', expanded ? 'w-64' : 'w-16')}>
      <div className="h-14 flex items-center justify-between px-2">
        <button className="p-2 hover:bg-crimson/30 rounded-lg" onClick={()=>setExpanded(!expanded)} title="Pokaż/ukryj nazwy"><span className="text-lg">☰</span></button>
        {expanded && <div className="text-sm opacity-80 pr-2">Użytkownicy</div>}
      </div>
      <div className="px-2">
        <button onClick={()=>setAdding(v=>!v)} className="w-full mb-2 px-3 py-2 rounded-lg bg-crimson/40 hover:bg-crimson/60">{adding? 'Anuluj' : 'Dodaj usera'}</button>
        {adding && (<div className="mb-3 space-y-2">
          <input value={sid} onChange={e=>setSid(e.target.value)} placeholder="SID użytkownika" className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
          <button onClick={addUser} className="w-full px-3 py-2 rounded-lg bg-crimson/60 hover:bg-crimson/80">Dodaj</button>
        </div>)}
      </div>
      <div className="overflow-y-auto scroll-thin pb-6" style={{height:'calc(100vh - 140px)'}}>
        {contacts.map(u => (
          <div key={u.id} onClick={()=>onSelect && onSelect(u)} className={classNames('cursor-pointer flex items-center gap-2 px-2 py-1 rounded-md hover:bg-crimson/20', expanded ? '' : 'justify-center')}>
            <div className="w-7 h-7 rounded-full bg-crimson/30 grid place-items-center">{u.displayName.slice(0,1).toUpperCase()}</div>
            {expanded && <div className="text-sm opacity-90">{u.displayName} <span className="opacity-60">• {u.sid}</span></div>}
          </div>
        ))}
      </div>
    </div>
  )
}
