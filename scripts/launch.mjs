/** Single-window launcher. The server stays attached to this process, so
 * Ctrl+C / closing this console stops both Node server and ngrok.
 */
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]==='ngrok'?'ngrok':'local';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535){console.error('[UMBRA] Nieprawidłowy PORT (1024–65535)');process.exit(1);}
const local=`http://127.0.0.1:${port}`;
console.log(`\n[UMBRA] Tryb: ${mode.toUpperCase()} | Klucz pierwszego konta: 67767`);
console.log('[UMBRA] Start serwera...');
const server=spawn(process.execPath,['index.js'],{cwd:path.join(root,'server'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:'inherit',windowsHide:false});
let tunnel=null,stopping=false;
const cleanup=()=>{if(stopping)return;stopping=true;try{tunnel?.kill();}catch{}try{server.kill();}catch{}};
process.on('SIGINT',()=>{cleanup();process.exit(0);});
process.on('SIGTERM',()=>{cleanup();process.exit(0);});
process.on('exit',cleanup);
let startError=null;
server.once('error',e=>startError=e);
server.once('exit',code=>{if(!stopping)startError=Error('Serwer zakończył pracę (kod '+code+')');});
async function waitFor(url,tries=45){
  for(let i=0;i<tries;i++){
    if(startError)throw startError;
    try {const r=await fetch(url,{signal:AbortSignal.timeout(900)});if(r.ok)return await r.json();}catch{}
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  throw Error('Serwer nie odpowiada. Sprawdź komunikat w konsoli.');
}
function open(url){if(process.platform!=='win32')return;try{spawn('cmd.exe',['/c','start','""',url],{detached:true,stdio:'ignore',windowsHide:true}).unref();}catch(e){console.warn('Otwórz przeglądarkę ręcznie:',e.message);}}
try{
  await waitFor(local+'/healthz');
  console.log('\n=========================================================');
  console.log('  SERWER DZIALA');
  console.log('  Lokalnie:        '+local);
  console.log('  Aplikacja:       '+local+'/k/67767');
  console.log('  Panel admina:    '+local+'/panel');
  console.log('=========================================================\n');
  open(local);
  if(mode==='ngrok'){
    console.log('[UMBRA] Uruchamiam ngrok (musi być zainstalowany i skonfigurowany)...');
    tunnel=spawn('ngrok',['http',String(port),'--log=stdout'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
    let tunnelError=null;
    tunnel.on('error',e=>{tunnelError=e;console.error('[NGROK] Nie udało się uruchomić ngrok:',e.message);});
    tunnel.stdout?.on('data',d=>{for(const line of String(d).split('\n'))if(/error|failed|ERR_NGROK/i.test(line))console.error('[NGROK]',line.trim());});
    tunnel.stderr?.on('data',d=>console.error('[NGROK]',String(d).trim()));
    let publicUrl=null;
    for(let i=0;i<32&&!publicUrl;i++){
      if(tunnelError||tunnel.exitCode!==null)break;
      try{
        const r=await fetch('http://127.0.0.1:4040/api/tunnels',{signal:AbortSignal.timeout(800)});
        if(r.ok){const json=await r.json();publicUrl=json.tunnels?.find(t=>t.proto==='https'&&String(t.public_url).startsWith('https://'))?.public_url;}
      }catch{}
      if(!publicUrl)await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(publicUrl){
      console.log('\n  ================== LINKI NGROK ==================');
      console.log('  Publiczny URL:   '+publicUrl);
      console.log('  Klucz 67767:     '+publicUrl+'/k/67767');
      console.log('  Panel:           '+publicUrl+'/panel');
      console.log('  ================================================\n');
    }else console.warn('[NGROK] Nie potwierdzono publicznego URL. Sprawdź authtoken, połączenie i logi ngrok. Serwer lokalny nadal działa.');
  }
  console.log('[UMBRA] Zatrzymanie: Ctrl+C lub zamknij to okno.');
  await new Promise(resolve=>server.once('exit',resolve));
}catch(e){console.error('[UMBRA] Błąd uruchomienia:',e.message);process.exitCode=1;}finally{cleanup();}
