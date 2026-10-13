import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import * as store from './store.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SUB_KEY = process.env.SUB_KEY;
const SUB_PORT = process.env.SUB_PORT ? Number(process.env.SUB_PORT) : 3001;

const app = Fastify({ logger: false });
await app.register(cors, { origin: true, credentials: true });

function cleanUser(u){ const { pinHash, ...rest } = u; return rest; }
function authHook(req, reply, done) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return reply.code(401).send({ error: 'No token' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); done(); } catch { reply.code(401).send({ error: 'Bad token' }); }
}

// HTML shell dla pod-serwera
function shell(body){
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Umbra • Klucz ${SUB_KEY}</title>
    <style>
      :root{--bg:#0a0a0a;--wine:#180a10;--crimson:#b5174a;--mist:#f3f0f6}
      *{box-sizing:border-box} body{margin:0;background:linear-gradient(135deg,#0a0a0a,#180a10);color:var(--mist);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
      .wrap{max-width:600px;margin:0 auto;padding:24px}
      .card{background:rgba(0,0,0,.45);border:1px solid rgba(181,23,74,.35);border-radius:14px;backdrop-filter:blur(6px);box-shadow:0 0 40px rgba(181,23,74,.18);padding:18px}
      input,button{font:inherit} input{background:rgba(0,0,0,.4);border:1px solid rgba(181,23,74,.35);color:var(--mist);padding:10px;border-radius:10px;width:100%}
      button{background:rgba(181,23,74,.6);border:none;color:#fff;padding:10px 14px;border-radius:10px;cursor:pointer}
      button:hover{background:rgba(181,23,74,.8)} a{color:#ff7aa7}
      .row{display:flex;gap:8px;align-items:center} .muted{opacity:.85}
      .form-group{margin-bottom:20px}
      .form-group label{display:block;margin-bottom:8px;color:var(--mist)}
      .error{color:#ff6b6b;margin-top:8px}
    </style></head><body><div class="wrap">${body}</div></body></html>`;
}

// Strona logowania/rejestracji
app.get('/', async (req, reply) => {
  const users = await store.getUsers();
  const user = users.find(u => u.key === SUB_KEY);
  
  if (user) {
    // Użytkownik istnieje - strona logowania
    const html = shell(`
      <div class="card" style="text-align: center;">
        <div style="font-size: 2.5em; margin-bottom: 20px;">🔐</div>
        <h1 style="color: var(--crimson); margin-bottom: 10px;">Logowanie</h1>
        <p class="muted" style="margin-bottom: 30px;">Wprowadź PIN aby się zalogować</p>
        
        <form id="loginForm">
          <div class="form-group">
            <label>PIN:</label>
            <input type="password" id="pin" placeholder="Wprowadź PIN" required>
          </div>
          <button type="submit" style="width: 100%;">Zaloguj się</button>
        </form>
        
        <div id="error" class="error" style="display: none;"></div>
      </div>
      
      <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          const pin = document.getElementById('pin').value;
          const errorDiv = document.getElementById('error');
          
          try {
            const response = await fetch('/api/auth/keypin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: '${SUB_KEY}', pin })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              localStorage.setItem('token', data.token);
              window.location.href = '/app';
            } else {
              errorDiv.textContent = data.error || 'Błąd logowania';
              errorDiv.style.display = 'block';
            }
          } catch (e) {
            errorDiv.textContent = 'Błąd połączenia';
            errorDiv.style.display = 'block';
          }
        };
      </script>
    `);
    reply.header('content-type','text/html').send(html);
  } else {
    // Użytkownik nie istnieje - strona rejestracji
    const html = shell(`
      <div class="card" style="text-align: center;">
        <div style="font-size: 2.5em; margin-bottom: 20px;">✨</div>
        <h1 style="color: var(--crimson); margin-bottom: 10px;">Rejestracja</h1>
        <p class="muted" style="margin-bottom: 30px;">Utwórz swoje konto</p>
        
        <form id="registerForm">
          <div class="form-group">
            <label>Nazwa wyświetlana:</label>
            <input type="text" id="displayName" placeholder="Twoja nazwa" required>
          </div>
          <div class="form-group">
            <label>PIN (hasło):</label>
            <input type="password" id="pin" placeholder="Wprowadź PIN" required>
          </div>
          <div class="form-group">
            <label>Potwierdź PIN:</label>
            <input type="password" id="pinConfirm" placeholder="Potwierdź PIN" required>
          </div>
          <button type="submit" style="width: 100%;">Utwórz konto</button>
        </form>
        
        <div id="error" class="error" style="display: none;"></div>
      </div>
      
      <script>
        document.getElementById('registerForm').onsubmit = async (e) => {
          e.preventDefault();
          const displayName = document.getElementById('displayName').value.trim();
          const pin = document.getElementById('pin').value;
          const pinConfirm = document.getElementById('pinConfirm').value;
          const errorDiv = document.getElementById('error');
          
          if (pin !== pinConfirm) {
            errorDiv.textContent = 'PINy nie są identyczne';
            errorDiv.style.display = 'block';
            return;
          }
          
          if (pin.length < 4) {
            errorDiv.textContent = 'PIN musi mieć co najmniej 4 znaki';
            errorDiv.style.display = 'block';
            return;
          }
          
          try {
            const response = await fetch('/api/claim/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: '${SUB_KEY}', displayName, pin })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              localStorage.setItem('token', data.token);
              window.location.href = '/app';
            } else {
              errorDiv.textContent = data.error || 'Błąd rejestracji';
              errorDiv.style.display = 'block';
            }
          } catch (e) {
            errorDiv.textContent = 'Błąd połączenia';
            errorDiv.style.display = 'block';
          }
        };
      </script>
    `);
    reply.header('content-type','text/html').send(html);
  }
});

// Aplikacja komunikatora
app.get('/app', async (req, reply) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return reply.redirect('/');
  }
  
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return reply.redirect('/');
  }
  
  // HTML aplikacji komunikatora
  const appHTML = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Umbra • Komunikator</title>
<style>
  :root{--bg:#0a0a0a;--panel:#0e0a0d;--wine:#180a10;--crimson:#b5174a;--mist:#f3f0f6}
  *{box-sizing:border-box} body{margin:0;background:linear-gradient(135deg,#0a0a0a,#180a10);color:var(--mist);font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .row{display:flex}
  .col{height:100vh;overflow:auto;border-right:1px solid rgba(181,23,74,.3);background:rgba(0,0,0,.35);backdrop-filter:blur(6px)}
  #groups{width:260px} #users{width:260px;border-right:none;border-left:1px solid rgba(181,23,74,.3)}
  #chat{flex:1;display:flex;flex-direction:column}
  .head{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid rgba(181,23,74,.3);background:rgba(0,0,0,.45)}
  .list{padding:8px} .item{padding:8px;border-radius:10px;cursor:pointer} .item:hover{background:rgba(181,23,74,.2)}
  .section{padding:8px;border-bottom:1px solid rgba(181,23,74,.2)}
  .msgs{flex:1;overflow:auto;padding:12px}
  .bubble{max-width:70%;margin:6px 0;padding:8px 10px;border-radius:12px;background:rgba(181,23,74,.2)}
  .mine{margin-left:auto;background:rgba(181,23,74,.6)}
  .composer{display:flex;gap:8px;padding:8px;border-top:1px solid rgba(181,23,74,.3);background:rgba(0,0,0,.45)}
  input,button{font:inherit} input{background:rgba(0,0,0,.4);border:1px solid rgba(181,23,74,.35);color:var(--mist);padding:10px;border-radius:10px;width:100%}
  button{background:rgba(181,23,74,.6);border:none;color:#fff;padding:10px 14px;border-radius:10px;cursor:pointer}
  button:hover{background:rgba(181,23,74,.8)}
</style>
</head><body>
<div class="row">
  <div id="groups" class="col">
    <div class="section">
      <div><b>🏠 Grupy</b></div>
      <div class="row" style="gap:6px;margin-top:6px">
        <input id="newGroup" placeholder="nazwa grupy"><button id="mkGroup">Utwórz</button>
      </div>
    </div>
    <div id="groupList" class="list"></div>
  </div>
  <div id="chat" class="col">
    <div class="head"><div id="topic">Wybierz rozmowę</div><div id="me"></div></div>
    <div id="msgs" class="msgs"></div>
    <div class="composer">
      <input id="text" placeholder="Napisz wiadomość…"><button id="send">Wyślij</button>
    </div>
  </div>
  <div id="users" class="col">
    <div class="section">
      <div><b>👥 Użytkownicy</b></div>
      <div class="row" style="gap:6px;margin-top:6px">
        <input id="addSid" placeholder="SID"><button id="addUser">Dodaj</button>
      </div>
    </div>
    <div id="userList" class="list"></div>
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const token = localStorage.getItem('token');
if (!token){ location.href = '/'; }
const H = (h, p={}) => fetch(h, { headers:{'Authorization':'Bearer '+token} }).then(r=>r.json());
const J = (h, m, b) => fetch(h, { method:m, headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}, body: JSON.stringify(b||{}) }).then(async r=>({ok:r.ok, data: await r.json()}));
let me = null, groups = [], contacts = [], active = null;

async function boot(){
  const m = await H('/api/me'); me = m.me; document.getElementById('me').innerText = me.displayName + ' • ' + me.sid;
  await refresh();
  const sio = io('/', { transports:['websocket'], auth:{ token } });
  sio.on('message:new', msg => {
    if (active && ((active.type==='channel' && msg.kind==='channel' && msg.channelId===active.id) || (active.type==='dm' && msg.kind==='dm'))) {
      appendMsg(msg);
    }
  });
}
async function refresh(){
  const gr = await H('/api/groups'); groups = gr.groups;
  const cc = await H('/api/contacts'); contacts = cc.contacts;
  renderGroups(); renderUsers();
}
function el(tag, cls, txt){ const e=document.createElement(tag); if(cls)e.className=cls; if(txt)e.textContent=txt; return e; }
function renderGroups(){
  const list = document.getElementById('groupList'); list.innerHTML='';
  groups.forEach(g => {
    const head = el('div','item'); head.innerHTML = '<b>🏠 '+g.name+'</b> <button data-g="'+g.id+'" class="mkch">+ kanał</button>'; list.appendChild(head);
    g.channels.forEach(ch => {
      const it = el('div','item'); it.textContent = '# ' + ch.name; it.onclick = ()=> openChannel(ch); list.appendChild(it);
    });
  });
  document.querySelectorAll('.mkch').forEach(b=> b.onclick = async (e)=> {
    const gid = e.target.getAttribute('data-g'); const name = prompt('Nazwa kanału:');
    if(!name) return; const r = await J('/api/groups/'+gid+'/channels','POST',{name}); if(r.ok) refresh();
  });
}
function renderUsers(){
  const list = document.getElementById('userList'); list.innerHTML='';
  contacts.forEach(u => {
    const it = el('div','item'); it.textContent = '👤 ' + u.displayName + ' • ' + u.sid; it.onclick = ()=> openDM(u); list.appendChild(it);
  });
}
async function openChannel(ch){
  active = { type:'channel', id: ch.id, label: ch.name };
  document.getElementById('topic').textContent = 'Kanał: '+ch.name;
  const js = await H('/api/channels/'+ch.id+'/messages');
  const box = document.getElementById('msgs'); box.innerHTML=''; js.messages.forEach(appendMsg);
}
async function openDM(u){
  active = { type:'dm', id: u.sid, toSid: u.sid, label: u.displayName };
  document.getElementById('topic').textContent = 'DM: '+u.displayName;
  const js = await H('/api/dm/'+u.sid+'/messages');
  const box = document.getElementById('msgs'); box.innerHTML=''; js.messages.forEach(appendMsg);
}
function appendMsg(m){
  const box = document.getElementById('msgs');
  const b = el('div','bubble'+(m.senderSid===me.sid?' mine':''));
  const who = el('div','muted'); who.textContent = (m.senderSid===me.sid?'Ty':m.senderSid||'•');
  b.appendChild(who); b.appendChild(el('div','',m.content));
  box.appendChild(b); box.scrollTop = 1e9;
}
document.getElementById('mkGroup').onclick = async () => {
  const name = document.getElementById('newGroup').value.trim(); if(!name) return;
  const r = await J('/api/groups','POST',{name}); if(r.ok) { document.getElementById('newGroup').value=''; refresh(); }
};
document.getElementById('addUser').onclick = async () => {
  const sid = document.getElementById('addSid').value.trim(); if(!sid) return;
  const r = await J('/api/contacts/add','POST',{sid}); if(r.ok){ document.getElementById('addSid').value=''; refresh(); }
};
document.getElementById('send').onclick = send;
document.getElementById('text').addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });
function send(){
  const t = document.getElementById('text'); const txt = t.value.trim(); if(!txt || !active) return;
  const sio = io('/', { transports:['websocket'], auth:{ token } }); // temp instance to emit quickly
  if (active.type==='channel') sio.emit('message:send', { kind:'channel', channelId: active.id, content: txt }, ()=>{});
  else sio.emit('message:send', { kind:'dm', toSid: active.toSid, content: txt }, ()=>{});
  t.value='';
}
boot();
</script>
</body></html>`;

  reply.header('content-type','text/html').send(appHTML);
});

// API endpoints
app.get('/api/me', { preHandler: authHook }, async (req, reply) => { reply.send({ me: req.user }); });
app.get('/api/contacts', { preHandler: authHook }, async (req, reply) => {
  const contacts = await store.getContacts(); const users = await store.getUsers();
  const mine = contacts.filter(c => c.userId === req.user.uid).map(c => users.find(u => u.sid === c.contactSid)).filter(Boolean).map(cleanUser);
  reply.send({ contacts: mine });
});
app.post('/api/contacts/add', { preHandler: authHook }, async (req, reply) => {
  const { sid } = req.body || {}; if (!sid) return reply.code(400).send({ error: 'sid required' });
  const users = await store.getUsers(); const target = users.find(u => u.sid === sid); if (!target) return reply.code(400).send({ error: 'no such sid' });
  const contacts = await store.getContacts(); if (!contacts.find(c => c.userId === req.user.uid && c.contactSid === sid)) { contacts.push({ userId: req.user.uid, contactSid: sid }); await store.saveContacts(contacts); }
  reply.send({ ok: true, contact: cleanUser(target) });
});
app.get('/api/groups', { preHandler: authHook }, async (req, reply) => {
  const groups = await store.getGroups(); const channels = await store.getChannels();
  reply.send({ groups: groups.map(g => ({ ...g, channels: channels.filter(ch => ch.groupId === g.id) })) });
});
app.post('/api/groups', { preHandler: authHook }, async (req, reply) => {
  const { name } = req.body || {}; if (!name) return reply.code(400).send({ error: 'name required' });
  const groups = await store.getGroups(); const g = { id:(Math.random().toString(36).slice(2,14)), name, ownerId:req.user.uid, members:[req.user.uid], createdAt:Date.now() };
  groups.push(g); await store.saveGroups(groups); reply.send({ group: g });
});
app.post('/api/groups/:gid/channels', { preHandler: authHook }, async (req, reply) => {
  const { name } = req.body || {}; const gid = req.params.gid; const groups = await store.getGroups(); const g = groups.find(x => x.id === gid);
  if (!g) return reply.code(404).send({ error: 'no group' }); const channels = await store.getChannels(); const ch = { id:(Math.random().toString(36).slice(2,14)), groupId:gid, name, createdAt:Date.now() };
  channels.push(ch); await store.saveChannels(channels); reply.send({ channel: ch });
});
app.get('/api/channels/:cid/messages', { preHandler: authHook }, async (req, reply) => {
  const cid = req.params.cid; const messages = await store.getMessages();
  reply.send({ messages: messages.filter(m => m.kind==='channel' && m.channelId===cid).slice(-500) });
});
app.get('/api/dm/:sid/messages', { preHandler: authHook }, async (req, reply) => {
  const sid = req.params.sid; const users = await store.getUsers(); const target = users.find(u => u.sid === sid); if (!target) return reply.code(400).send({ error:'no such sid' });
  const me = req.user.uid; const messages = await store.getMessages(); const pair = [me, target.id].sort().join(':');
  reply.send({ messages: messages.filter(m => m.kind==='dm' && m.pair===pair).slice(-500) });
});

// Auth endpoints
app.post('/api/auth/keypin', async (req, reply) => {
  const { key, pin } = req.body || {};
  if (!key || !pin) return reply.code(400).send({ error:'key, pin required' });
  const users = await store.getUsers();
  const user = users.find(u => u.key === key);
  if (!user) return reply.code(400).send({ error:'no such key' });
  const ok = await bcrypt.compare(pin, user.pinHash || '');
  if (!ok) return reply.code(401).send({ error:'bad pin' });
  const token = jwt.sign({ uid:user.id, sid:user.sid, key:user.key, displayName:user.displayName }, JWT_SECRET, { expiresIn:'7d' });
  reply.send({ token, user: cleanUser(user) });
});

app.post('/api/claim/complete', async (req, reply) => {
  const { key, displayName, pin } = req.body || {};
  if (!key || !displayName || !pin) return reply.code(400).send({ error:'key, displayName, pin required' });
  const invites = await store.getInvites();
  const inv = invites.find(i => i.code === key && !i.claimed);
  if (!inv) return reply.code(400).send({ error:'invalid or used key' });
  const users = await store.getUsers();
  const sid = (Math.random().toString(36).slice(2,8) + Math.random().toString(36).slice(2,8)).slice(0,10);
  const pinHash = await bcrypt.hash(pin, 10);
  const user = { id:(Math.random().toString(36).slice(2,14)), sid, key, displayName, pin, pinHash, createdAt: Date.now() };
  users.push(user);
  await store.saveUsers(users);
  inv.claimed = true; inv.claimedBy = user.id; inv.claimedAt = Date.now();
  await store.saveInvites(invites);
  const token = jwt.sign({ uid:user.id, sid:user.sid, key:user.key, displayName:user.displayName }, JWT_SECRET, { expiresIn:'7d' });
  reply.send({ token, user: cleanUser(user) });
});

// HTTP server + Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });
io.use((socket, next) => { const t = socket.handshake.auth?.token; if (!t) return next(new Error('No token')); try{ socket.user = jwt.verify(t, JWT_SECRET); next(); }catch{ next(new Error('Bad token')); }});
io.on('connection', async (socket) => {
  const me = socket.user; socket.join(`u:${me.uid}`);
  const groups = await store.getGroups(); const channels = await store.getChannels(); const myGroups = groups.filter(g => g.members.includes(me.uid));
  for (const g of myGroups) { const chs = channels.filter(ch => ch.groupId === g.id); for (const ch of chs) socket.join(`ch:${ch.id}`); }
  socket.on('message:send', async (payload, cb) => {
    try {
      const messages = await store.getMessages();
      const msg = { id:(Math.random().toString(36).slice(2,14)), kind: payload.kind, senderId: me.uid, senderSid: me.sid, content: String(payload.content||''), createdAt: Date.now() };
      if (payload.kind === 'dm') {
        const users = await store.getUsers(); const target = users.find(u => u.sid === payload.toSid); if (!target) throw new Error('no such sid');
        msg.pair = [me.uid, target.id].sort().join(':'); messages.push(msg); await store.saveMessages(messages); io.to(`u:${target.id}`).to(`u:${me.uid}`).emit('message:new', msg);
      } else if (payload.kind === 'channel') {
        msg.channelId = payload.channelId; messages.push(msg); await store.saveMessages(messages); io.to(`ch:${payload.channelId}`).emit('message:new', msg);
      } else throw new Error('bad kind');
      cb && cb({ ok: true });
    } catch (e) { cb && cb({ ok: false, error: e.message }); }
  });
});

httpServer.listen(SUB_PORT, '0.0.0.0', () => {
  console.log(`Sub-server for key ${SUB_KEY} listening on http://localhost:${SUB_PORT}`);
});
