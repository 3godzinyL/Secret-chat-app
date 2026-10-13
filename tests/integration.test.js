import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'umbra-test-'));
process.env.DATA_DIR=temp;
const {app}=await import('../server/index.js');
const {decryptState}=await import('../server/vault.js');
const savedState=()=>{const secret=JSON.parse(fs.readFileSync(path.join(temp,'secrets.json'),'utf8')).jwtSecret;return JSON.parse(decryptState(fs.readFileSync(path.join(temp,'state.enc')),secret));};
const base=await app.listen({host:'127.0.0.1',port:0});
const request=async (url,method='GET',body,token='')=>{
  const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json().catch(()=>({}))};
};
const auth=()=>({headers:{authorization:'Bearer '}});

test('integracja: admin, zaproszenia, konta, wiadomości, dostęp i zapis', async()=>{
 try {
  let r=await request('/api/admin/summary');assert.equal(r.status,401);
  assert.equal((await request('/api/key/67767/status')).data.mode,'claim');
  r=await request('/api/admin/login','POST',{password:'niepoprawne'});assert.equal(r.status,401);
  const init=fs.readFileSync(path.join(temp,'INITIAL_ADMIN_PASSWORD.txt'),'utf8').match(/Haslo: (\S+)/)[1];
  r=await request('/api/admin/login','POST',{password:init});assert.equal(r.status,200);const admin=r.data.token;assert.ok(admin);
  const codes=[];
  for(let i=0;i<3;i++){r=await request('/api/admin/invite','POST',{},admin);assert.equal(r.status,200);assert.match(r.data.invite.code,/^\d{5}$/);codes.push(r.data.invite.code);}
  assert.equal(new Set(codes).size,3);
  const users=[];
  for(let i=0;i<3;i++){
   r=await request(`/api/key/${codes[i]}/claim`,'POST',{displayName:'User '+i,pin:'A-Strong-Pass-'+i});
   assert.equal(r.status,200,JSON.stringify(r.data));users.push({token:r.data.token,user:r.data.user});
  }
  const [a,b,c]=users;
  const duplicate=await request(`/api/key/${codes[0]}/claim`,'POST',{displayName:'SPOOF',pin:'strong password'});assert.equal(duplicate.status,409);
  assert.equal((await request(`/api/key/${codes[0]}/status`)).data.mode,'login');
  r=await request(`/api/key/${codes[0]}/login`,'POST',{pin:'A-Strong-Pass-0'});assert.equal(r.status,200);
  const encrypted=fs.readFileSync(path.join(temp,'state.enc'),'utf8');assert.ok(!encrypted.includes('A-Strong-Pass-0'));assert.ok(!encrypted.includes('pinHash'));assert.equal(fs.existsSync(path.join(temp,'state.json')),false);assert.ok(savedState().users[0].pinHash);
  r=await request('/api/groups','POST',{name:'The Others'},a.token);assert.equal(r.status,200);
  const gid=r.data.group.id;
  let groups=await request('/api/groups','GET',undefined,a.token);assert.equal(groups.data.groups.length,1);
  assert.equal(groups.data.groups[0].channels.length,1);
  const cid=groups.data.groups[0].channels[0].id;
  r=await request('/api/channels/'+cid+'/messages','GET',undefined,b.token);assert.equal(r.status,403);
  r=await request('/api/messages','POST',{kind:'channel',channelId:cid,content:'hack channel'},b.token);assert.equal(r.status,403);
  r=await request('/api/groups/'+gid+'/channels','POST',{name:'unauthorized'},b.token);assert.equal(r.status,403);
  r=await request('/api/groups/'+gid+'/members','POST',{sid:b.user.sid},b.token);assert.equal(r.status,403);
  r=await request('/api/messages','POST',{kind:'channel',channelId:cid,content:'Hello group',clientMessageId:'20000000-0000-4000-8000-000000000001'},a.token);assert.equal(r.status,200);
  const repeat=await request('/api/messages','POST',{kind:'channel',channelId:cid,content:'Hello group',clientMessageId:'20000000-0000-4000-8000-000000000001'},a.token);assert.equal(repeat.status,200);assert.equal(repeat.data.message.id,r.data.message.id);
  r=await request('/api/groups/'+gid+'/members','POST',{sid:b.user.sid},a.token);assert.equal(r.status,200);
  r=await request('/api/channels/'+cid+'/messages','GET',undefined,b.token);assert.equal(r.status,200);assert.equal(r.data.messages.length,1);
  // Prawdziwy handshake Socket.IO przez transport Engine.IO WebSocket (bez mocków).
  const ws = new WebSocket(base.replace(/^http/,'ws')+'/socket.io/?EIO=4&transport=websocket');
  const nextFrame=(prefix)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.removeEventListener('message',fn);reject(Error('Socket.IO timeout: '+prefix));},6000);
    const fn=(event)=>{if(String(event.data).startsWith(prefix)){clearTimeout(timer);ws.removeEventListener('message',fn);resolve(String(event.data));}};
    ws.addEventListener('message',fn);
  });
  await once(ws,'open');
  await nextFrame('0');
  ws.send('40'+JSON.stringify({token:b.token}));
  await nextFrame('40');
  const gotNew=nextFrame('42["message:new"');
  r=await request('/api/messages','POST',{kind:'channel',channelId:cid,content:'REALTIME MESSAGE'},a.token);assert.equal(r.status,200);
  const frame=await gotNew;
  assert.match(frame,/REALTIME MESSAGE/);
  ws.close();
  r=await request('/api/groups','GET',undefined,c.token);assert.equal(r.data.groups.length,0);
  r=await request('/api/channels/'+cid+'/messages','GET',undefined,c.token);assert.equal(r.status,403);
  r=await request('/api/contacts','POST',{sid:b.user.sid},a.token);assert.equal(r.status,200);
  r=await request('/api/contacts','GET',undefined,a.token);assert.equal(r.data.contacts[0].sid,b.user.sid);
  r=await request('/api/messages','POST',{kind:'dm',toSid:c.user.sid,content:'not added'},a.token);assert.equal(r.status,403);
  r=await request('/api/messages','POST',{kind:'dm',toSid:b.user.sid,content:'Hello DM'},a.token);assert.equal(r.status,200);const mid=r.data.message.id;
  r=await request('/api/dm/'+a.user.sid+'/messages','GET',undefined,b.token);assert.equal(r.status,200);assert.equal(r.data.messages.length,1);
  r=await request('/api/messages/'+mid,'DELETE',undefined,b.token);assert.equal(r.status,403);
  r=await request('/api/messages/'+mid,'DELETE',undefined,a.token);assert.equal(r.status,200);
  r=await request('/api/dm/'+b.user.sid+'/messages','GET',undefined,a.token);assert.equal(r.data.messages[0].deleted,true);assert.equal(r.data.messages[0].content,'');
  r=await request('/api/messages','POST',{kind:'dm',toSid:b.user.sid,content:'x'.repeat(2100)},a.token);assert.equal(r.status,400);
  r=await request('/api/me','PATCH',{displayName:'New Test Name'},a.token);assert.equal(r.data.me.displayName,'New Test Name');
  r=await request('/api/admin/password','POST',{oldPassword:init,newPassword:'A-New-AdminPassword2026'},admin);assert.equal(r.status,200);assert.ok(!fs.existsSync(path.join(temp,'INITIAL_ADMIN_PASSWORD.txt')));
  r=await request('/api/admin/login','POST',{password:init});assert.equal(r.status,401);
  r=await request('/api/admin/login','POST',{password:'A-New-AdminPassword2026'});assert.equal(r.status,200);
  r=await request('/api/admin/summary','GET',undefined,admin);assert.equal(r.status,403,'stara sesja administratora uniewazniona');
  const saved=savedState();
  assert.equal(saved.invites.some(i=>i.code==='67767'),true);
  assert.equal(saved.users.length,3);assert.equal(saved.groups.length,1);assert.equal(saved.messages.length,3);
  // Start drugiego procesu na tej samej bazie: sprawdzenie zapisu po restarcie.
  const probe=spawnSync(process.execPath,['--input-type=module','-e',
    "import('./store.js').then(s=>{s.initStore();process.stdout.write(JSON.stringify({users:s.current().users.length,messages:s.current().messages.length,groups:s.current().groups.length}));})"],
    {cwd:path.join(root,'server'),env:{...process.env,DATA_DIR:temp},encoding:'utf8',timeout:15000});
  assert.equal(probe.status,0,probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout),{users:3,messages:3,groups:1});
  const html=await fetch(base+'/k/'+codes[0]+'/app');assert.equal(html.status,200);assert.match(await html.text(),/Umbra Messenger/);
  const staticFile=await fetch(base+'/assets/client.js');assert.equal(staticFile.status,200);
  const wrong=await fetch(base+'/assets/secrets.json');assert.equal(wrong.status,404);
 } finally { await app.close();fs.rmSync(temp,{recursive:true,force:true}); }
});
