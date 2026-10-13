
import React, { useState } from 'react'
import { api } from '../api.js'
import classNames from 'classnames'

export default function SidebarGroups({ groups, onCreated, onSelect }){
  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const createGroup = async () => { if (!name.trim()) return; await api('/api/groups', { method:'POST', body: JSON.stringify({ name }) }); setName(''); setCreating(false); onCreated && onCreated() }
  const createChannel = async (gid) => { const nm = prompt('Nazwa kanału:'); if (!nm) return; await api(`/api/groups/${gid}/channels`, { method:'POST', body: JSON.stringify({ name: nm }) }); onCreated && onCreated() }

  return (
    <div className={classNames('h-screen bg-black/40 backdrop-blur border-r border-crimson/30 transition-all', expanded ? 'w-72' : 'w-16')}>
      <div className="h-14 flex items-center justify-between px-2">
        <button className="p-2 hover:bg-crimson/30 rounded-lg" onClick={()=>setExpanded(!expanded)} title="Pokaż/ukryj nazwy"><span className="text-lg">☰</span></button>
        {expanded && <div className="text-sm opacity-80 pr-2">Grupy</div>}
      </div>
      <div className="px-2">
        <button onClick={()=>setCreating(v=>!v)} className="w-full mb-2 px-3 py-2 rounded-lg bg-crimson/40 hover:bg-crimson/60">{creating? 'Anuluj' : 'Nowa grupa'}</button>
        {creating && (<div className="mb-3 space-y-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nazwa grupy" className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
          <button onClick={createGroup} className="w-full px-3 py-2 rounded-lg bg-crimson/60 hover:bg-crimson/80">Utwórz</button>
        </div>)}
      </div>
      <div className="overflow-y-auto scroll-thin pb-6" style={{height:'calc(100vh - 140px)'}}>
        {groups.map(g => (
          <div key={g.id} className="px-2">
            <div className="mt-3 mb-1 flex items-center gap-2 px-2">
              <div className="w-8 h-8 rounded-lg bg-crimson/30 grid place-items-center">#</div>
              {expanded && <div className="font-medium">{g.name}</div>}
              <button onClick={()=>createChannel(g.id)} className="ml-auto text-sm opacity-80 hover:opacity-100 px-2 py-1 rounded bg-crimson/20">+ kanał</button>
            </div>
            <div className="ml-2">
              {g.channels.map(ch => (
                <div key={ch.id} onClick={()=>onSelect && onSelect(ch)} className={classNames('cursor-pointer flex items-center gap-2 px-2 py-1 rounded-md hover:bg-crimson/20', expanded ? '' : 'justify-center')}>
                  <div className="w-6 h-6 rounded bg-crimson/20 grid place-items-center">⋯</div>
                  {expanded && <div className="text-sm opacity-90">{ch.name}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
