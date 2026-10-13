import Fastify from 'fastify';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
db.initStore();
const app=Fastify({logger:false,bodyLimit:16000,trustProxy:false});
const io=new Server(app.server,{serveClient:true,transports:['polling','websocket'],maxHttpBufferSize:20000});
const bad=(status,error)=>Object.assign(new Error(error),{statusCode:status});
const rand=()=>crypto.randomUUID();
const rate=new Map();
const userRate=new Map();
const validName=v=>typeof v==='string'&&v.trim().length>=2&&v.trim().length<=48;
const validSid=v=>typeof v==='string'&&/^[a-z0-9]{10}$/i.test(v);
const validKey=v=>typeof v==='string'&&/^\d{5}$/.test(v);
const cleanName=v=>v.trim().replace(/\s+/g,' ');
const creds=(id)=>jwt.sign({uid:id,typ:'user'},db.jwtSecret(),{expiresIn:'7d'});
const adminJwt=()=>jwt.sign({typ:'admin',rev:db.adminRevision()},db.jwtSecret(),{expiresIn:'8h'});

app.setErrorHandler((err,req,reply)=>{
  if (err.validation) return reply.code(400).send({error:'Nieprawidłowe dane formularza'});
  const status=(err.statusCode>=400 && err.statusCode<500)?err.statusCode:500;
  if(status===500) console.error('[UMBRA]',err);
  reply.code(status).send({error:status===500?'Błąd wewnętrzny serwera':err.message});
});
app.addHook('onSend',async (req,reply,payload)=>{
  reply.header('X-Content-Type-Options','nosniff');
  reply.header('X-Frame-Options','DENY');
  reply.header('Referrer-Policy','no-referrer');
  reply.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  reply.header('Cross-Origin-Resource-Policy','same-origin');
  reply.header('Cross-Origin-Opener-Policy','same-origin');
  reply.header('Cache-Control',req.url.startsWith('/assets/')?'public, max-age=3600':'no-store');
  return payload;
});
function attempt(req,kind,limit=12){
  const now=Date.now(),ip=req.ip||req.socket.remoteAddress||'unknown';
  const key=`${kind}:${ip}`;let x=rate.get(key);
  if(!x||now>x.until){x={n:0,until:now+60000};rate.set(key,x);}
  x.n++;
  if(x.n>limit) throw bad(429,'Za dużo prób. Spróbuj ponownie za minutę.');
  if(rate.size>4000) for(const [k,v] of rate) if(v.until<now)rate.delete(k);
}
function messageLimit(uid){
  const now=Date.now();let x=userRate.get(uid);
  if(!x||now>x.until){x={n:0,until:now+60000};userRate.set(uid,x);}
  if(++x.n>45)throw bad(429,'Limit 45 wiadomości na minutę.');
  if(userRate.size>5000)for(const [k,v] of userRate)if(v.until<now)userRate.delete(k);
}
function auth(req){
  const header=req.headers.authorization;
  if(!header?.startsWith('Bearer '))throw bad(401,'Brak sesji');
  let token;
  try{token=jwt.verify(header.slice(7),db.jwtSecret());}catch{throw bad(401,'Sesja wygasła');}
  if(token.typ!=='user')throw bad(403,'Brak uprawnień');
  const user=db.current().users.find(u=>u.id===token.uid&&!u.disabled);
  if(!user)throw bad(401,'Konto niedostępne');
  return user;
}
function admin(req){
  const header=req.headers.authorization;
  if(!header?.startsWith('Bearer '))throw bad(401,'Brak sesji administratora');
  try{const t=jwt.verify(header.slice(7),db.jwtSecret());if(t.typ==='admin'&&t.rev===db.adminRevision())return;}catch{}
  throw bad(403,'Odmowa dostępu');
}
function channelFor(state,cid,uid){
  const ch=state.channels.find(c=>c.id===cid);
  const group=ch&&state.groups.find(g=>g.id===ch.groupId);
  if(!group||!Array.isArray(group.members)||!group.members.includes(uid))throw bad(403,'Brak dostępu do kanału');
  return {ch,group};
}
function asMessage(m){ return {id:m.id,kind:m.kind,channelId:m.channelId,pair:m.pair,senderId:m.senderId,senderSid:m.senderSid,content:m.deleted?'':m.content,deleted:!!m.deleted,createdAt:m.createdAt}; }
function saveMessage(user,payload){
  messageLimit(user.id);
  if(typeof payload?.content!=='string')throw bad(400,'Nieprawidłowa wiadomość');
  const content=payload.content.trim();
  if(!content||content.length>2000)throw bad(400,'Wiadomość musi mieć 1–2000 znaków');
  const kind=payload?.kind;
  const clientMessageId=payload?.clientMessageId;
  if(clientMessageId!==undefined && (typeof clientMessageId!=='string'||!(/^[0-9a-f-]{36}$/i.test(clientMessageId))))throw bad(400,'Niepoprawny identyfikator wiadomości');
  return db.transact(s=>{
    if(clientMessageId){const existing=s.messages.find(m=>m.senderId===user.id&&m.clientMessageId===clientMessageId);if(existing)return {...existing,replayed:true};}
    const message={id:rand(),kind,clientMessageId,senderId:user.id,senderSid:user.sid,content,createdAt:Date.now()};
    if(kind==='dm'){
      const target=s.users.find(u=>u.sid===payload.toSid&&!u.disabled);
      if(!target||target.id===user.id)throw bad(400,'Niepoprawny odbiorca');
      if(!s.contacts.some(c=>(c.userId===user.id&&c.contactSid===target.sid)||(c.userId===target.id&&c.contactSid===user.sid)))throw bad(403,'Najpierw dodaj kontakt');
      message.pair=[user.id,target.id].sort().join(':');
    }else if(kind==='channel'){
      if(typeof payload.channelId!=='string')throw bad(400,'Brak kanału');
      channelFor(s,payload.channelId,user.id);
      message.channelId=payload.channelId;
    }else throw bad(400,'Niepoprawny typ rozmowy');
    s.messages.push(message);
    return message;
  });
}
function announceMessage(m){
  if(m.replayed)return;
  const msg=asMessage(m);
  if(m.kind==='dm') for(const uid of m.pair.split(':'))io.to('u:'+uid).emit('message:new',msg);
  else io.to('ch:'+m.channelId).emit('message:new',msg);
}

const publicDir=path.resolve(root,'web');
function file(reply,filename,type){return reply.type(type).send(fs.readFileSync(path.join(publicDir,filename)));}
app.get('/assets/:filename',(req,reply)=>{
  const types={'app.css':'text/css; charset=utf-8','client.js':'text/javascript; charset=utf-8','auth.js':'text/javascript; charset=utf-8','admin.js':'text/javascript; charset=utf-8','logo.svg':'image/svg+xml','manifest.webmanifest':'application/manifest+json','icon-192.svg':'image/svg+xml'};
  const type=types[req.params.filename]; if(!type)throw bad(404,'Nie znaleziono');
  return file(reply,req.params.filename,type);
});
app.get('/manifest.webmanifest',(req,reply)=>file(reply,'manifest.webmanifest','application/manifest+json'));
app.get('/',(req,reply)=>file(reply,'index.html','text/html; charset=utf-8'));
app.get('/panel',(req,reply)=>file(reply,'panel.html','text/html; charset=utf-8'));
app.get('/k/:key',(req,reply)=>{if(!validKey(req.params.key))throw bad(404,'Niepoprawny link');return file(reply,'auth.html','text/html; charset=utf-8');});
app.get('/k/:key/app',(req,reply)=>{if(!validKey(req.params.key))throw bad(404,'Niepoprawny link');return file(reply,'chat.html','text/html; charset=utf-8');});
app.get('/:key',(req,reply)=>{if(!validKey(req.params.key))throw bad(404,'Niepoprawny link');return reply.redirect('/k/'+req.params.key);});
app.get('/:key/app',(req,reply)=>{if(!validKey(req.params.key))throw bad(404,'Niepoprawny link');return reply.redirect('/k/'+req.params.key+'/app');});
app.get('/healthz',()=>({ok:true,version:'3.0.0',time:Date.now()}));
app.get('/api/key/:key/status',(req)=>{
  const key=req.params.key;
  if(!validKey(key))throw bad(404,'Niepoprawny klucz');
  const s=db.current();
  return {mode:s.users.some(u=>u.key===key&&!u.disabled)?'login':s.invites.some(i=>i.code===key&&!i.claimed)?'claim':'unknown'};
});
app.post('/api/admin/login',(req)=>{
  attempt(req,'admin',8);
  if(!db.verifyAdmin(req.body?.password))throw bad(401,'Nieprawidłowe hasło administratora');
  return {token:adminJwt()};
});
app.get('/api/admin/summary',(req)=>{
  admin(req); const s=db.current();
  return {users:s.users.map(db.publicUser),invites:s.invites,groups:s.groups.length,messages:s.messages.length};
});
app.post('/api/admin/invite',(req)=>{
  admin(req);
  const s=db.current();
  if(s.invites.filter(i=>!i.claimed).length>=100)throw bad(400,'Limit 100 aktywnych zaproszeń');
  let code;do{code=crypto.randomInt(0,100000).toString().padStart(5,'0');}while(s.invites.some(i=>i.code===code)||s.users.some(u=>u.key===code));
  const inv={code,claimed:false,createdAt:Date.now()};
  db.transact(d=>d.invites.push(inv));return {invite:inv};
});
app.delete('/api/admin/invite/:code',(req)=>{
  admin(req);
  const code=req.params.code;
  db.transact(s=>{const i=s.invites.findIndex(x=>x.code===code&&!x.claimed);if(i<0)throw bad(404,'Zaproszenie nie istnieje');s.invites.splice(i,1);});
  return {ok:true};
});
app.post('/api/admin/password',(req)=>{
  admin(req);attempt(req,'change-password',5);
  const {oldPassword,newPassword}=req.body||{};
  if(!db.verifyAdmin(oldPassword))throw bad(401,'Błędne dotychczasowe hasło');
  if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)throw bad(400,'Nowe hasło musi mieć 12–128 znaków');
  db.changeAdminPassword(newPassword);return {ok:true};
});
app.post('/api/key/:key/claim',async (req)=>{
  attempt(req,'claim',10);
  const key=req.params.key,{displayName,pin}=req.body||{};
  if(!validKey(key)||!validName(displayName)||typeof pin!=='string'||pin.length<8||pin.length>128)throw bad(400,'Nazwa 2–48 znaków, hasło 8–128 znaków');
  const pinHash=await bcrypt.hash(pin,12);
  const user=db.transact(s=>{
    const inv=s.invites.find(i=>i.code===key&&!i.claimed);
    if(!inv||s.users.some(u=>u.key===key))throw bad(409,'Zaproszenie wygasło lub już użyte');
    let sid;do{sid=crypto.randomBytes(8).toString('hex').slice(0,10);}while(s.users.some(u=>u.sid===sid));
    const u={id:rand(),sid,key,displayName:cleanName(displayName),pinHash,createdAt:Date.now()};
    s.users.push(u);inv.claimed=true;inv.claimedBy=u.id;inv.claimedAt=Date.now();return u;
  });
  return {token:creds(user.id),user:db.publicUser(user)};
});
app.post('/api/key/:key/login',async(req)=>{
  attempt(req,'login',15);
  const key=req.params.key,pin=req.body?.pin;
  const user=db.current().users.find(u=>u.key===key&&!u.disabled);
  if(!user||typeof pin!=='string'||!(await bcrypt.compare(pin,user.pinHash||'')))throw bad(401,'Niepoprawny klucz lub hasło');
  return {token:creds(user.id),user:db.publicUser(user)};
});
app.get('/api/me',(req)=>({me:db.publicUser(auth(req))}));
app.patch('/api/me',(req)=>{
  const me=auth(req), name=req.body?.displayName;
  if(!validName(name))throw bad(400,'Nazwa musi mieć 2–48 znaków');
  const user=db.transact(s=>{const u=s.users.find(x=>x.id===me.id);u.displayName=cleanName(name);return u;});
  return {me:db.publicUser(user)};
});
app.get('/api/contacts',(req)=>{
  const me=auth(req),s=db.current();
  return {contacts:s.contacts.filter(c=>c.userId===me.id).map(c=>s.users.find(u=>u.sid===c.contactSid&&!u.disabled)).filter(Boolean).map(db.publicUser)};
});
app.post('/api/contacts',(req)=>{
  const me=auth(req),sid=String(req.body?.sid||'').trim().toLowerCase();
  if(!validSid(sid)||sid===me.sid)throw bad(400,'Nieprawidłowy SID');
  const user=db.transact(s=>{const target=s.users.find(u=>u.sid===sid&&!u.disabled);if(!target)throw bad(404,'Nie znaleziono użytkownika');if(!s.contacts.some(c=>c.userId===me.id&&c.contactSid===sid))s.contacts.push({userId:me.id,contactSid:sid,createdAt:Date.now()});return target;});
  io.to('u:'+me.id).emit('contacts:changed');return {contact:db.publicUser(user)};
});
app.get('/api/groups',(req)=>{
  const me=auth(req),s=db.current();
  return {groups:s.groups.filter(g=>g.members?.includes(me.id)).map(g=>({...g,channels:s.channels.filter(c=>c.groupId===g.id)}))};
});
app.post('/api/groups',(req)=>{
  const me=auth(req),name=req.body?.name;
  if(!validName(name))throw bad(400,'Nazwa grupy musi mieć 2–48 znaków');
  const group=db.transact(s=>{const g={id:rand(),name:cleanName(name),ownerId:me.id,members:[me.id],createdAt:Date.now()};s.groups.push(g);s.channels.push({id:rand(),groupId:g.id,name:'general',createdAt:Date.now()});return g;});
  io.to('u:'+me.id).emit('groups:changed');return {group};
});
app.post('/api/groups/:gid/channels',(req)=>{
  const me=auth(req),gid=req.params.gid,name=req.body?.name;
  if(!validName(name))throw bad(400,'Nazwa kanału musi mieć 2–48 znaków');
  const channel=db.transact(s=>{const g=s.groups.find(g=>g.id===gid);if(!g||g.ownerId!==me.id)throw bad(403,'Tylko właściciel może tworzyć kanały');if(s.channels.some(c=>c.groupId===gid&&c.name.toLowerCase()===cleanName(name).toLowerCase()))throw bad(409,'Taki kanał już istnieje');const ch={id:rand(),groupId:gid,name:cleanName(name),createdAt:Date.now()};s.channels.push(ch);return ch;});
  const g=db.current().groups.find(g=>g.id===gid);for(const uid of g.members){io.in('u:'+uid).socketsJoin('ch:'+channel.id);io.to('u:'+uid).emit('groups:changed');}
  return {channel};
});
app.post('/api/groups/:gid/members',(req)=>{
  const me=auth(req),gid=req.params.gid,sid=String(req.body?.sid||'').trim().toLowerCase();
  if(!validSid(sid))throw bad(400,'Niepoprawny SID');
  const {member,channels}=db.transact(s=>{
    const g=s.groups.find(g=>g.id===gid);if(!g||g.ownerId!==me.id)throw bad(403,'Tylko właściciel może zapraszać');
    const target=s.users.find(u=>u.sid===sid&&!u.disabled);if(!target)throw bad(404,'Nie znaleziono SID');
    if(!g.members.includes(target.id))g.members.push(target.id);
    return {member:target,channels:s.channels.filter(ch=>ch.groupId===gid).map(ch=>ch.id)};
  });
  for(const cid of channels)io.in('u:'+member.id).socketsJoin('ch:'+cid);
  io.to('u:'+member.id).emit('groups:changed');return {member:db.publicUser(member)};
});
app.get('/api/channels/:cid/messages',(req)=>{
  const me=auth(req),s=db.current();channelFor(s,req.params.cid,me.id);
  return {messages:s.messages.filter(m=>m.kind==='channel'&&m.channelId===req.params.cid).slice(-500).map(asMessage)};
});
app.get('/api/dm/:sid/messages',(req)=>{
  const me=auth(req),s=db.current();const target=s.users.find(u=>u.sid===req.params.sid&&!u.disabled);
  if(!target)throw bad(404,'Nie znaleziono użytkownika');
  if(!s.contacts.some(c=>(c.userId===me.id&&c.contactSid===target.sid)||(c.userId===target.id&&c.contactSid===me.sid)))throw bad(403,'Dodaj kontakt');
  const pair=[me.id,target.id].sort().join(':');
  return {messages:s.messages.filter(m=>m.kind==='dm'&&m.pair===pair).slice(-500).map(asMessage)};
});
app.post('/api/messages',(req)=>{
  const me=auth(req);const m=saveMessage(me,req.body);announceMessage(m);return {message:asMessage(m)};
});
app.delete('/api/messages/:id',(req)=>{
  const me=auth(req),id=req.params.id;
  const m=db.transact(s=>{const x=s.messages.find(m=>m.id===id);if(!x)throw bad(404,'Brak wiadomości');if(x.senderId!==me.id)throw bad(403,'Można usuwać tylko swoje wiadomości');x.content='';x.deleted=true;return x;});
  const event={id:m.id,kind:m.kind,channelId:m.channelId,pair:m.pair};
  if(m.kind==='channel')io.to('ch:'+m.channelId).emit('message:deleted',event);
  else for(const uid of m.pair.split(':'))io.to('u:'+uid).emit('message:deleted',event);
  return {ok:true};
});

io.use((socket,next)=>{
  try{
    const t=jwt.verify(socket.handshake.auth?.token||'',db.jwtSecret());
    const u=t.typ==='user'&&db.current().users.find(x=>x.id===t.uid&&!x.disabled);
    if(!u)throw new Error('Sesja nieprawidłowa');socket.data.uid=u.id;next();
  }catch{next(new Error('Odmowa połączenia'));}
});
io.on('connection',socket=>{
  const uid=socket.data.uid;
  socket.join('u:'+uid);
  for(const g of db.current().groups.filter(g=>g.members?.includes(uid)))for(const c of db.current().channels.filter(c=>c.groupId===g.id))socket.join('ch:'+c.id);
  socket.on('message:send',(payload,ack)=>{
    try{jwt.verify(socket.handshake.auth?.token||'',db.jwtSecret());const user=db.current().users.find(u=>u.id===uid&&!u.disabled);if(!user)throw bad(401,'Sesja nieprawidłowa');const m=saveMessage(user,payload);announceMessage(m);if(typeof ack==='function')ack({ok:true,message:asMessage(m)});}
    catch(e){if(typeof ack==='function')ack({ok:false,error:e.message});}
  });
});

export {app,io};
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3000);
  const host=process.env.HOST||'127.0.0.1';
  try{
    await app.listen({port,host});
    console.log(`[UMBRA] Gotowe: http://127.0.0.1:${port}`);
    console.log('[UMBRA] Admin: /panel | 5-cyfrowe linki: /k/12345');
  }catch(err){console.error('[UMBRA] Nie można uruchomić:',err);process.exitCode=1;}
}
