
import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'
import { getSocket } from '../socket.js'

export default function ChatWindow({ active, me }){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    setMessages([])
    if (!active?.type) return
    const load = async () => {
      if (active.type === 'channel') {
        const res = await api(`/api/channels/${active.id}/messages`); setMessages(res.messages)
      } else if (active.type === 'dm') {
        const res = await api(`/api/dm/${active.id}/messages`); setMessages(res.messages)
      }
      setTimeout(()=> listRef.current?.scrollTo?.(0, 1e9), 0)
    }
    load()
  }, [active?.type, active?.id])

  useEffect(() => {
    const sock = getSocket()
    const onNew = (msg) => {
      if (active.type === 'channel' && msg.kind === 'channel' && msg.channelId === active.id) setMessages(prev => [...prev, msg])
      else if (active.type === 'dm' && msg.kind === 'dm') setMessages(prev => [...prev, msg])
      setTimeout(()=> listRef.current?.scrollTo?.(0, 1e9), 0)
    }
    sock.on('message:new', onNew)
    return () => { sock.off('message:new', onNew) }
  }, [active?.type, active?.id])

  const send = () => {
    if (!text.trim() || !active?.type) return
    const sock = getSocket()
    if (active.type === 'channel') sock.emit('message:send', { kind: 'channel', channelId: active.id, content: text }, ()=>{})
    else sock.emit('message:send', { kind: 'dm', toSid: active.toSid, content: text }, ()=>{})
    setText('')
  }

  return (
    <div className="flex-1 flex flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 scroll-thin">
        {messages.map(m => (
          <div key={m.id} className={`max-w-[75%] ${m.senderSid===me.sid ? 'ml-auto' : ''}`}>
            <div className={`px-3 py-2 rounded-xl ${m.senderSid===me.sid ? 'bg-crimson/60' : 'bg-crimson/20'}`}>
              <div className="text-xs opacity-70 mb-1">{m.senderSid===me.sid ? 'Ty' : (m.senderSid || '•')}</div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="h-16 border-t border-crimson/30 bg-black/40 flex items-center gap-2 px-3">
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=> e.key==='Enter' && send()}
               placeholder="Napisz wiadomość…" className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-crimson/40 outline-none" />
        <button onClick={send} className="px-4 py-3 rounded-xl bg-crimson/60 hover:bg-crimson/80">Wyślij</button>
      </div>
    </div>
  )
}
