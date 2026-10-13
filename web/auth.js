(()=>{
  const $=id=>document.getElementById(id);
  const safe=async(res)=>{let j={};try{j=await res.json();}catch{}if(!res.ok)throw Error(j.error||`HTTP ${res.status}`);return j;};
  const key=location.pathname.match(/\/k\/(\d{5})/)?.[1];
  if(!key){
    $('enterKey')?.addEventListener('click',()=>{const v=$('keyEntry').value.trim();if(!/^\d{5}$/.test(v)){alert('Wpisz dokładnie 5 cyfr.');return;}location.href='/k/'+v;});
    $('keyEntry')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('enterKey').click();});
    return;
  }
  const badge=$('keyBadge'),form=$('userForm'),title=$('formTitle'),hint=$('formHint'),err=$('formError');
  badge.textContent='ACCESS KEY · '+key;
  let mode='unknown';
  (async()=>{
    try{
      const result=await safe(await fetch(`/api/key/${key}/status`));mode=result.mode;
      if(mode==='unknown'){title.textContent='Klucz niedostępny';hint.textContent='Ten klucz nie istnieje lub zaproszenie wygasło. Poproś administratora o nowy link.';return;}
      if(mode==='login'){
        title.textContent='Witaj ponownie';hint.textContent='Podaj hasło przypisane do tego klucza, aby wejść do aplikacji.';
        $('formSubmit').textContent='Zaloguj się →';
      }else{
        title.textContent='Aktywuj konto';hint.textContent='To zaproszenie jeszcze nie zostało użyte. Wybierz nazwę i silne hasło.';
        $('nameGroup').classList.remove('hidden');$('pass').autocomplete='new-password';
        $('formSubmit').textContent='Utwórz konto →';
      }
      form.classList.remove('hidden');
      const existing=sessionStorage.getItem('umbra:token:'+key);
      if(existing){const r=await fetch('/api/me',{headers:{Authorization:'Bearer '+existing}});if(r.ok){location.href=`/k/${key}/app`;return;}}
    }catch(e){title.textContent='Serwer niedostępny';hint.textContent=e.message;}
  })();
  form.addEventListener('submit',async e=>{
    e.preventDefault();err.classList.add('hidden');
    const pin=$('pass').value,displayName=$('displayName').value.trim();
    if(mode==='claim' && (displayName.length<2 || pin.length<8)){err.textContent='Nazwa min. 2 znaki i hasło min. 8 znaków.';err.classList.remove('hidden');return;}
    $('formSubmit').disabled=true;
    try{
      const endpoint=`/api/key/${key}/${mode==='claim'?'claim':'login'}`;
      const {token}=await safe(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='claim'?{displayName,pin}:{pin})}));
      sessionStorage.setItem('umbra:token:'+key,token);
      location.href=`/k/${key}/app`;
    }catch(e){err.textContent=e.message;err.classList.remove('hidden');$('formSubmit').disabled=false;}
  });
})();
