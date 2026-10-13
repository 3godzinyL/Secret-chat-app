(()=>{
 const $=id=>document.getElementById(id);let token=sessionStorage.getItem('umbra:admin')||'';
 const badge=document.querySelector('.admin-topline .pill');if(badge)badge.lastChild.textContent=location.hostname==='localhost'||location.hostname==='127.0.0.1'?' LOKALNA INSTANCJA':' INSTANCJA HTTPS';
 function notify(t,error=false){const n=document.createElement('div');n.className='toast'+(error?' err':'');n.textContent=t;$('toast').appendChild(n);setTimeout(()=>n.remove(),4500);}
 async function api(url,method='GET',data){const r=await fetch(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:data?JSON.stringify(data):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;}
 const td=(row,value)=>{const cell=document.createElement('td');cell.textContent=value??'—';row.appendChild(cell);return cell;};
 async function refresh(){try{
  const {users,invites,messages}=await api('/api/admin/summary');
  $('adminLogin').classList.add('hidden');$('adminDashboard').classList.remove('hidden');$('adminLogout').classList.remove('hidden');
  const active=invites.filter(i=>!i.claimed);$('totalUsers').textContent=users.length;$('totalInvites').textContent=active.length;$('totalMessages').textContent=messages;
  $('invitesTable').replaceChildren();$('usersTable').replaceChildren();
  for(const invite of active){const row=document.createElement('tr');td(row,invite.code).className='mono';td(row,new Date(invite.createdAt).toLocaleString('pl-PL'));
   const cell=document.createElement('td'),link=location.origin+'/k/'+invite.code;const b=document.createElement('button');b.className='btn quiet';b.textContent='Kopiuj link';b.addEventListener('click',()=>navigator.clipboard.writeText(link).then(()=>notify('Skopiowano link')).catch(()=>notify('Kopiowanie niedostępne',true)));cell.appendChild(b);row.appendChild(cell);
   const action=document.createElement('td'),del=document.createElement('button');del.className='btn danger';del.textContent='Usuń';del.addEventListener('click',async()=>{if(!confirm('Unieważnić klucz '+invite.code+'?'))return;try{await api('/api/admin/invite/'+invite.code,'DELETE');await refresh();}catch(e){notify(e.message,true)}});action.appendChild(del);row.appendChild(action);$('invitesTable').appendChild(row);}
  if(!active.length){const row=document.createElement('tr');const cell=td(row,'Brak oczekujących zaproszeń');cell.colSpan=4;$('invitesTable').appendChild(row);}
  for(const u of users){const row=document.createElement('tr');td(row,u.displayName);td(row,u.sid).className='mono';td(row,u.key).className='mono';td(row,new Date(u.createdAt).toLocaleString('pl-PL'));$('usersTable').appendChild(row);}
  if(!users.length){const row=document.createElement('tr');td(row,'Brak użytkowników').colSpan=4;$('usersTable').appendChild(row);}
 }catch(e){if(e.message.includes('sesji')||e.message.includes('dostępu')||e.message.includes('HTTP 401')||e.message.includes('HTTP 403'))logout();else notify(e.message,true);}}
 function logout(){token='';sessionStorage.removeItem('umbra:admin');$('adminLogin').classList.remove('hidden');$('adminDashboard').classList.add('hidden');$('adminLogout').classList.add('hidden');}
 $('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const j=await api('/api/admin/login','POST',{password:$('adminPassword').value});token=j.token;sessionStorage.setItem('umbra:admin',token);$('adminPassword').value='';$('loginError').classList.add('hidden');await refresh();}catch(err){$('loginError').textContent=err.message;$('loginError').classList.remove('hidden');}});
 $('adminLogout').addEventListener('click',logout);
 $('generateInvite').addEventListener('click',async()=>{try{const j=await api('/api/admin/invite','POST');await refresh();const link=location.origin+'/k/'+j.invite.code;await navigator.clipboard.writeText(link).then(()=>notify('Nowy link skopiowany: '+j.invite.code)).catch(()=>notify('Utworzono klucz '+j.invite.code));}catch(err){notify(err.message,true);}});
 $('changePasswordForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/admin/password','POST',{oldPassword:$('oldAdminPass').value,newPassword:$('newAdminPass').value});$('oldAdminPass').value='';$('newAdminPass').value='';notify('Hasło zmienione');}catch(err){notify(err.message,true);}});
 if(token)refresh();
})();
