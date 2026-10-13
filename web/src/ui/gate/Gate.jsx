
import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Gate({ onReady }){
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('api_url') || 'http://localhost:8787')
  const [sid, setSid] = useState('')
  const [pin, setPin] = useState('')
  const [invite, setInvite] = useState('')
  const [claimToken, setClaimToken] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [stage, setStage] = useState('info') // info -> setup (after claim)
  const [err, setErr] = useState('')

  useEffect(() => {
    localStorage.setItem('api_url', apiUrl)
    const url = new URL(window.location.href)
    const inv = url.searchParams.get('invite')
    if (inv) { setInvite(inv); setStage('info') } // show same info screen, invite prefilled
  }, [])

  const claim = async(code) => {
    setErr(''); try {
      const res = await api('/api/invite/claim', { method:'POST', body: JSON.stringify({ code }) })
      setClaimToken(res.claimToken); setStage('setup')
    } catch (e) { setErr(e.message) }
  }
  const complete = async () => {
    setErr(''); try {
      const res = await api('/api/invite/complete', { method:'POST', body: JSON.stringify({ claimToken, displayName, pin }) })
      localStorage.setItem('token', res.token); onReady()
    } catch (e) { setErr(e.message) }
  }
  const login = async () => {
    setErr(''); try {
      const res = await api('/api/login', { method:'POST', body: JSON.stringify({ sid, pin }) })
      localStorage.setItem('token', res.token); onReady()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-wine to-mulberry grid place-items-center text-mist">
      <div className="w-full max-w-xl p-6 rounded-2xl bg-black/50 shadow-glow backdrop-blur border border-crimson/30">
        <div className="text-xl font-semibold mb-4">Umbra • Wejście</div>

        {stage==='info' && (
          <div className="grid gap-4">
            <div className="text-sm opacity-90">
              <b>Bez specjalnego linku nie wejdziesz.</b> Jeśli masz konto → <b>SID+PIN</b>. Jeśli masz <b>5‑klucz</b> (puste zaproszenie w JSON), wpisz go i odbierz zaproszenie.
            </div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">SID + PIN (dla istniejących kont)</label>
              <input placeholder="SID" value={sid} onChange={e=>setSid(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
              <input placeholder="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
              <button onClick={login} className="px-4 py-2 rounded-lg bg-crimson/60 hover:bg-crimson/80">Wejdź</button>
            </div>

            <div className="border-t border-crimson/30"></div>

            <div className="grid gap-2">
              <label className="text-xs opacity-70">Odbierz zaproszenie (5‑klucz)</label>
              <input placeholder="5‑klucz" value={invite} onChange={e=>setInvite(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
              <button onClick={()=>claim(invite)} className="px-4 py-2 rounded-lg bg-crimson/40 hover:bg-crimson/60">Odbierz</button>
            </div>
          </div>
        )}

        {stage==='setup' && (
          <div className="grid gap-3">
            <div className="text-sm">Zostałeś zaproszony. Ustaw nazwę i PIN:</div>
            <input placeholder="Nazwa wyświetlana" value={displayName} onChange={e=>setDisplayName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
            <input placeholder="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-black/40 border border-crimson/40 outline-none" />
            <button onClick={complete} className="px-4 py-2 rounded-lg bg-crimson/60 hover:bg-crimson/80">Zakończ i wejdź</button>
          </div>
        )}

        {!!err && <div className="mt-3 text-sm text-red-300">{err}</div>}
      </div>
    </div>
  )
}
