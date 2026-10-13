(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const key=location.pathname.match(/\/k\/(\d{5})\/app/)?.[1];
 if(!key){location.replace('/');return;}
 const tokenKey='umbra:token:'+key;
 let token=sessionStorage.getItem(tokenKey);
 if(!token){location.replace('/k/'+key);return;}
 let me=null,groups=[],contacts=[],socket=null,active=null,messages=[],filter='',tab='all',loadSeq=0,modalSubmit=null,unread=new Map(),pending=false,retryId=null,previousFocus=null;
 const formatTime=n=>new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit'}).format(new Date(n));
 const dateText=n=>new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',year:'numeric'}).format(new Date(n));
 const el=(tag,cls='',text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;};
 const btn=(label,cls,action,title)=>{const b=el('button',cls,label);b.type='button';if(title)b.title=title;b.addEventListener('click',action);return b;};
 const first=(s)=>String(s||'?').trim().slice(0,1).toUpperCase();
 function toast(message,error=false){const n=el('div','toast'+(error?' err':''),message);$('toasts').appendChild(n);setTimeout(()=>n.remove(),4600);}
 function fail(e){if(/Sesja wygasła|Brak sesji|Konto niedostępne/i.test(e.message)){logout();return;}toast(e.message||'Nieznany błąd',true);}
 async function api(uri,method='GET',body){
  const r=await fetch(uri,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.error||`HTTP ${r.status}`);return result;
 }
 function logout(){socket?.disconnect();sessionStorage.removeItem(tokenKey);location.replace('/k/'+key);}
 function iconAvatar(t,teal=false){return el('div','avatar'+(teal?' teal':''),first(t));}
 function matchSearch(text){return String(text||'').toLocaleLowerCase('pl').includes($('conversationSearch').value.trim().toLocaleLowerCase('pl'));}
 function closeMobile(){$('navigation').classList.remove('mobile-open');$('mobileBackdrop').classList.remove('visible');}
 function renderNav(){
  $('groupsSection').classList.toggle('hidden',tab==='dms');$('dmsSection').classList.toggle('hidden',tab==='groups');
  $('groupsList').replaceChildren();$('contactsList').replaceChildren();
  const visibleGroups=groups.filter(g=>matchSearch(g.name)||g.channels.some(c=>matchSearch(c.name)));
  if(!visibleGroups.length)$('groupsList').appendChild(el('div','empty',groups.length?'Brak pasujących grup':'Nie masz jeszcze grup.'));
  for(const g of visibleGroups){
   const head=el('div','group-head');head.appendChild(el('span','', '⬡ '+g.name));
   const actions=el('div','group-actions');
   if(g.ownerId===me.id){actions.appendChild(btn('＋','icon-btn',()=>openModal({title:'Nowy kanał',hint:'Kanał będzie widoczny dla członków grupy '+g.name+'.',label:'Nazwa kanału',placeholder:'np. dyskusje',submit:'Utwórz kanał',onSubmit:async value=>{await api('/api/groups/'+encodeURIComponent(g.id)+'/channels','POST',{name:value});await refreshData();toast('Kanał utworzony');}}),'Dodaj kanał'));actions.appendChild(btn('♧','icon-btn',()=>openModal({title:'Zaproś do grupy',hint:'Dodaj użytkownika na podstawie jego SID. Uzyska dostęp do wszystkich kanałów grupy.',label:'SID użytkownika',placeholder:'10-znakowy SID',maxLength:10,submit:'Zaproś',onSubmit:async value=>{await api('/api/groups/'+encodeURIComponent(g.id)+'/members','POST',{sid:value});await refreshData();toast('Użytkownik dodany do grupy');}}),'Dodaj członka'));}
   head.appendChild(actions);$('groupsList').appendChild(head);
   const chList=el('div','channel-list');for(const ch of g.channels.filter(c=>matchSearch(g.name)||matchSearch(c.name))){const c=btn('', 'conversation'+(active?.type==='channel'&&active.id===ch.id?' active':''),()=>selectChannel(g,ch));c.appendChild(el('div','channel-icon','#'));const body=el('div','convo-body');body.appendChild(el('strong','',ch.name));body.appendChild(el('small','',g.name));c.appendChild(body);chList.appendChild(c);}
   $('groupsList').appendChild(chList);
  }
  const visibleContacts=contacts.filter(u=>matchSearch(u.displayName)||matchSearch(u.sid));
  if(!visibleContacts.length)$('contactsList').appendChild(el('div','empty',contacts.length?'Brak pasujących kontaktów':'Dodaj pierwszy kontakt przez SID.'));
  for(const u of visibleContacts){const c=btn('','conversation'+(active?.type==='dm'&&active.id===u.sid?' active':''),()=>selectDM(u));c.appendChild(iconAvatar(u.displayName));const info=el('div','convo-body');info.appendChild(el('strong','',u.displayName));info.appendChild(el('small','mono',u.sid));c.appendChild(info);if(unread.get('dm:'+u.sid)){const tag=el('span','pill',String(unread.get('dm:'+u.sid)));c.appendChild(tag);} $('contactsList').appendChild(c);}
 }
 function belongs(m,a=active){return !!a && ((a.type==='channel'&&m.kind==='channel'&&m.channelId===a.id)||(a.type==='dm'&&m.kind==='dm'&&m.pair===a.pair));}
 function mergeMessage(m){if(!messages.some(x=>x.id===m.id))messages.push(m);messages.sort((a,b)=>a.createdAt-b.createdAt);}
 function renderMessages(){const target=$('messages');
  const wasAtBottom=target.scrollHeight-target.scrollTop-target.clientHeight<100;
  const oldTop=target.scrollTop;
  target.replaceChildren();
  if(!active){const w=el('div','chat-welcome');w.appendChild(el('div','big-icon','✦'));w.appendChild(el('h2','','Twoje rozmowy zaczynają się tutaj.'));w.appendChild(el('p','','Wybierz kontakt lub kanał z lewej strony. Utwórz grupę, aby zorganizować własną przestrzeń.'));w.appendChild(el('span','pill','●  Oczekiwanie na rozmowę'));target.appendChild(w);return;}
  if(!messages.length){const w=el('div','chat-welcome');w.appendChild(el('div','big-icon','◈'));w.appendChild(el('h2','','Tu zaczyna się rozmowa.'));w.appendChild(el('p','','Nie ma jeszcze wiadomości. Napisz pierwszą.'));target.appendChild(w);return;}
  const term=$('messageSearch').value.trim().toLocaleLowerCase('pl');let prevDate='';let count=0;
  for(const m of messages){if(term&&!String(m.deleted?'':m.content).toLocaleLowerCase('pl').includes(term))continue;count++;
   const date=new Date(m.createdAt).toDateString();if(date!==prevDate){target.appendChild(el('div','chat-day',dateText(m.createdAt)));prevDate=date;}
   const mine=m.senderId===me.id,row=el('div','msg-row '+(mine?'mine':'other'));
   row.appendChild(iconAvatar(mine?me.displayName:(contacts.find(u=>u.sid===m.senderSid)?.displayName||m.senderSid),!mine));
   const bubble=el('div','message');if(!mine && active.type==='channel')bubble.appendChild(el('div','sender',contacts.find(u=>u.sid===m.senderSid)?.displayName||m.senderSid));
   bubble.appendChild(el('div','message-text'+(m.deleted?' deleted':''),m.deleted?'Wiadomość usunięta':m.content));
   const meta=el('div','message-meta');meta.appendChild(el('span','',formatTime(m.createdAt)));bubble.appendChild(meta);row.appendChild(bubble);
   if(mine&&!m.deleted)row.appendChild(btn('⋯','msg-delete',()=>{if(confirm('Usunąć tę wiadomość dla wszystkich uczestników?'))deleteMessage(m.id);},'Usuń wiadomość'));
   target.appendChild(row);
  }
  if(!count)target.appendChild(el('div','empty','Brak wiadomości pasujących do filtra.'));
  if(wasAtBottom)target.scrollTop=target.scrollHeight;else target.scrollTop=oldTop;
  updateJumpButton();
 }
 function updateJumpButton(){const box=$('messages');$('jumpLatestBtn').classList.toggle('hidden',!active || box.scrollHeight-box.scrollTop-box.clientHeight<135);}
 function applyTopic(){
  $('topicTitle').textContent=active?.label||'Umbra Messenger';$('topicSubtitle').textContent=active?(active.type==='dm'?'Prywatna rozmowa · '+active.id:'Kanał grupy · '+active.groupName):'Prywatna przestrzeń rozmów';
  $('topicAvatar').textContent=active?(active.type==='channel'?'#':first(active.label)):'◈';
  $('composer').classList.toggle('hidden',!active);$('searchMessagesBtn').disabled=!active;$('detailsBtn').disabled=!active;
 }
 async function activate(a,url){
  active=a;messages=[];$('messageSearch').value='';$('searchBox').classList.add('hidden');const seq=++loadSeq;applyTopic();renderNav();renderMessages();closeMobile();
  try{const j=await api(url);if(seq!==loadSeq)return;for(const m of j.messages)mergeMessage(m);renderMessages();$('messageText').focus();}
  catch(e){if(seq!==loadSeq)return;fail(e);}
 }
 function selectChannel(g,ch){activate({type:'channel',id:ch.id,label:'# '+ch.name,groupName:g.name,groupId:g.id},'/api/channels/'+encodeURIComponent(ch.id)+'/messages');}
 function selectDM(u){const pair=[me.id,u.id].sort().join(':');unread.delete('dm:'+u.sid);activate({type:'dm',id:u.sid,label:u.displayName,pair},'/api/dm/'+encodeURIComponent(u.sid)+'/messages');}
 async function refreshData(){
  const [g,c]=await Promise.all([api('/api/groups'),api('/api/contacts')]);groups=g.groups;contacts=c.contacts;
  if(active?.type==='channel'&&!groups.some(x=>x.channels.some(ch=>ch.id===active.id))){active=null;messages=[];applyTopic();renderMessages();}
  renderNav();
 }
 async function sendMessage(e){
  e?.preventDefault();if(pending||!active)return;
  const text=$('messageText').value.trim();if(!text)return;
  const payload=active.type==='channel'?{kind:'channel',channelId:active.id,content:text}:{kind:'dm',toSid:active.id,content:text};
  // Keep this ID after a timeout: retrying cannot create a duplicate delivery.
  if(!retryId||retryId.text!==text||retryId.destination!==active.type+':'+active.id){retryId={text,destination:active.type+':'+active.id,id:crypto.randomUUID()};}
  payload.clientMessageId=retryId.id;
  pending=true;$('sendBtn').disabled=true;
  try{
   let response;
   if(socket?.connected){response=await new Promise((resolve,reject)=>socket.timeout(7000).emit('message:send',payload,(err,result)=>err?reject(Error('Brak potwierdzenia serwera')):resolve(result)));if(!response?.ok)throw Error(response?.error||'Nie wysłano wiadomości');}
   else{response={ok:true,...await api('/api/messages','POST',payload)};}
   if(response.message&&belongs(response.message)){mergeMessage(response.message);renderMessages();}
   retryId=null;if($('messageText').value.trim()===text)$('messageText').value='';$('characters').textContent=$('messageText').value.length+' / 2000';
  }catch(e){fail(e);}finally{pending=false;$('sendBtn').disabled=false;$('messageText').focus();}
 }
 async function deleteMessage(id){try{await api('/api/messages/'+encodeURIComponent(id),'DELETE');const m=messages.find(x=>x.id===id);if(m){m.deleted=true;m.content='';renderMessages();}}catch(e){fail(e);}}
 function socketStart(){if(typeof io!=='function'){toast('Socket.IO niedostępne — użyję HTTP do wysyłania',true);$('connectionStatus').textContent='HTTP fallback';return;}
  socket=io({auth:{token},reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000});
  socket.on('connect',()=>{$('connectionDot').style.background='var(--green)';$('connectionStatus').textContent='Połączono na żywo';});
  socket.on('disconnect',()=>{$('connectionDot').style.background='var(--bad)';$('connectionStatus').textContent='Ponowne łączenie…';});
  socket.on('connect_error',e=>{$('connectionDot').style.background='var(--bad)';$('connectionStatus').textContent='Tryb HTTP · brak live';if(/Odmowa połączenia/.test(e.message))fail(Error('Sesja wygasła'));});
  socket.on('message:new',m=>{if(belongs(m)){mergeMessage(m);renderMessages();}else if(m.kind==='dm') {const from=m.senderSid===me.sid?null:m.senderSid;if(from)unread.set('dm:'+from,(unread.get('dm:'+from)||0)+1);renderNav();}});
  socket.on('message:deleted',m=>{if(!belongs(m))return;const old=messages.find(x=>x.id===m.id);if(old){old.deleted=true;old.content='';renderMessages();}});
  socket.on('groups:changed',()=>refreshData().catch(fail));socket.on('contacts:changed',()=>refreshData().catch(fail));
 }
 function openModal({title,hint,label='Nazwa',placeholder='',initial='',maxLength=48,submit='Zapisz',onSubmit}){
  previousFocus=document.activeElement;modalSubmit=onSubmit;$('dialogTitle').textContent=title;$('dialogHint').textContent=hint;$('dialogLabel').textContent=label;$('dialogInput').placeholder=placeholder;$('dialogInput').maxLength=maxLength;$('dialogInput').value=initial;$('dialogSubmit').textContent=submit;$('dialogBackdrop').classList.remove('hidden');$('dialogInput').focus();
 }
 function closeModal(){if($('dialogBackdrop').classList.contains('hidden'))return;$('dialogBackdrop').classList.add('hidden');$('dialogSubmit').disabled=false;modalSubmit=null;previousFocus?.focus?.();previousFocus=null;}
 const addContact=()=>openModal({title:'Nowy kontakt',hint:'Każdy użytkownik Umbry ma unikalny 10-znakowy SID. Wpisz go, aby rozpocząć rozmowę.',label:'SID użytkownika',placeholder:'np. a3c9e81bf2',maxLength:10,submit:'Dodaj kontakt',onSubmit:async value=>{const result=await api('/api/contacts','POST',{sid:value.toLowerCase()});await refreshData();toast('Dodano '+result.contact.displayName);selectDM(result.contact);}});
 const newGroup=()=>openModal({title:'Stwórz grupę',hint:'Utwórz prywatną przestrzeń. Kanał #general powstanie automatycznie.',label:'Nazwa grupy',placeholder:'np. NIGHT OPERATIONS',submit:'Utwórz grupę',onSubmit:async value=>{const result=await api('/api/groups','POST',{name:value});await refreshData();const g=groups.find(g=>g.id===result.group.id);if(g&&g.channels.length)selectChannel(g,g.channels[0]);toast('Grupa utworzona');}});
 const profile=()=>openModal({title:'Twój profil',hint:'Twoje SID: '+me.sid+' · Klucz konta: '+key+'. Zmień wyświetlaną nazwę lub skopiuj SID przyciskiem w menu.',label:'Nazwa wyświetlana',placeholder:'Twój nick',initial:me.displayName,submit:'Zapisz nazwę',onSubmit:async value=>{const j=await api('/api/me','PATCH',{displayName:value});me=j.me;fillMe();toast('Profil zaktualizowany');}});
 function fillMe(){$('myAvatar').textContent=first(me.displayName);$('mySid').textContent='SID  '+me.sid+' · '+key;renderNav();}
 async function boot(){try{
  const j=await api('/api/me');me=j.me;
  fillMe();await refreshData();applyTopic();socketStart();
 }catch(e){fail(e);}}
 $('sendForm').addEventListener('submit',sendMessage);
 $('messageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendMessage();}});
 $('messageText').addEventListener('input',()=>{$('characters').textContent=$('messageText').value.length+' / 2000';});
 $('conversationSearch').addEventListener('input',renderNav);
 $('messageSearch').addEventListener('input',renderMessages);
 $('searchMessagesBtn').addEventListener('click',()=>{$('searchBox').classList.toggle('hidden');if(!$('searchBox').classList.contains('hidden'))$('messageSearch').focus();else{$('messageSearch').value='';renderMessages();}});
 $('detailsBtn').addEventListener('click',()=>{if(!active)return;toast(active.type==='dm'?'SID rozmówcy: '+active.id:'Grupa: '+active.groupName+' · Kanał: '+active.label);});
 $('newChatBtn').addEventListener('click',addContact);$('addContactBtn').addEventListener('click',addContact);$('newGroupBtn').addEventListener('click',newGroup);
 $('settingsBtn').addEventListener('click',profile);$('avatarBtn').addEventListener('click',profile);$('logoutBtn').addEventListener('click',()=>{if(confirm('Wylogować się z Umbry?'))logout();});
 $('mySid').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(me.sid);toast('Skopiowano SID');}catch{toast('SID: '+me.sid);}});$('mySid').style.cursor='pointer';$('mySid').title='Kopiuj własny SID';
 for(const [name,filterName] of [['allTab','all'],['groupsTab','groups'],['dmsTab','dms']])$(name).addEventListener('click',()=>{tab=filterName;for(const id of ['allTab','groupsTab','dmsTab'])$(id).classList.toggle('active',id===name);renderNav();$('navigation').classList.add('mobile-open');$('mobileBackdrop').classList.add('visible');});
 $('mobileMenuBtn').addEventListener('click',()=>{$('navigation').classList.toggle('mobile-open');$('mobileBackdrop').classList.toggle('visible');});$('mobileBackdrop').addEventListener('click',closeMobile);
 $('dialogClose').addEventListener('click',closeModal);$('dialogCancel').addEventListener('click',closeModal);$('dialogBackdrop').addEventListener('click',e=>{if(e.target===$('dialogBackdrop'))closeModal();});
 $('dialogForm').addEventListener('submit',async e=>{e.preventDefault();const fn=modalSubmit;if(!fn)return;const value=$('dialogInput').value.trim();if(!value){toast('Uzupełnij pole',true);return;}$('dialogSubmit').disabled=true;try{await fn(value);closeModal();}catch(e){fail(e);$('dialogSubmit').disabled=false;}});
 $('messages').addEventListener('scroll',updateJumpButton,{passive:true});
 $('jumpLatestBtn').addEventListener('click',()=>{$('messages').scrollTo({top:$('messages').scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
 $('mySid').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('mySid').click();}});
 $('messageText').addEventListener('input',()=>{const input=$('messageText');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';});
 // Connected sockets are preferred; HTTP remains functional if WebSocket/polling fails.
 // Polling only runs when disconnected, so inbound messages are also visible offline from WS.
 setInterval(async()=>{if(socket?.connected||!active||!me)return;const seq=loadSeq;const endpoint=active.type==='channel'?'/api/channels/'+encodeURIComponent(active.id)+'/messages':'/api/dm/'+encodeURIComponent(active.id)+'/messages';
  try{const j=await api(endpoint);if(loadSeq!==seq)return;const ids=new Set(messages.map(m=>m.id));const changed=j.messages.length!==messages.length||j.messages.some(m=>!ids.has(m.id)||messages.find(x=>x.id===m.id)?.deleted!==m.deleted);if(changed){messages=j.messages;renderMessages();}}
  catch(e){if(e.message.includes('Sesja wygasła'))fail(e);}
 },8000);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeMobile();}
  if(e.key==='Tab'&&!$('dialogBackdrop').classList.contains('hidden')){const nodes=Array.from($('dialogBackdrop').querySelectorAll('button:not(:disabled),input:not(:disabled)'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
 });
 boot();
})();
