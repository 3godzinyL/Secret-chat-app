import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { encryptState, decryptState } from './vault.js';

const home = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(process.env.DATA_DIR || path.join(home, 'data'));
const stateFile = path.join(dataDir, 'state.json');
const sealedFile = path.join(dataDir, 'state.enc');
const secretFile = path.join(dataDir, 'secrets.json');
const firstPasswordFile = path.join(dataDir, 'INITIAL_ADMIN_PASSWORD.txt');
let state;
let secrets;

function json(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function save(file, value) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value,null,2)+'\n', {mode:0o600});
    fs.renameSync(tmp, file);
  } catch(err) { try {fs.unlinkSync(tmp);} catch{} throw err; }
}
function migrate(){
  const old = json(path.join(dataDir,'user.json'),{users:[],invites:[]});
  const users = (old.users || []).map(({pin, ...u})=> ({...u, pinHash: u.pinHash || (typeof pin === 'string' && pin ? bcrypt.hashSync(pin,12) : '')}));
  return {
    version:2,
    users,
    invites: old.invites || json(path.join(dataDir,'invites.json'),[]),
    groups: json(path.join(dataDir,'groups.json'),[]),
    channels: json(path.join(dataDir,'channels.json'),[]),
    contacts: json(path.join(dataDir,'contacts.json'),[]),
    messages: json(path.join(dataDir,'messages.json'),[])
  };
}
export function initStore(){
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  // Import legacy plaintext once; encrypted state is the only authoritative source afterwards.
  // A leftover plaintext file after interruption is wiped on the next successful startup.
  if(!fs.existsSync(stateFile) && !fs.existsSync(sealedFile)) save(stateFile,migrate());

  // Po udanej migracji pozbądź się jawnego PIN-u również w starym pliku.
  const oldFile=path.join(dataDir,'user.json');
  if(fs.existsSync(oldFile)){
    const old=json(oldFile,{});
    if(Array.isArray(old.users) && old.users.some(u=>Object.hasOwn(u,'pin'))){
      old.users=old.users.map(({pin,...u})=>u);
      save(oldFile,old);
    }
  }
  if(fs.existsSync(sealedFile) && !fs.existsSync(secretFile)) throw new Error('Brak secrets.json: zaszyfrowana baza nie może zostać otwarta. Przywróć właściwy plik secrets.json z kopii.');
  if (!fs.existsSync(secretFile)) {
    const adminPassword = crypto.randomBytes(18).toString('base64url');
    secrets={jwtSecret:crypto.randomBytes(48).toString('base64url'),adminHash:bcrypt.hashSync(adminPassword,12)};
    save(secretFile,secrets);
    fs.writeFileSync(firstPasswordFile,`UMBRA — PIERWSZE LOGOWANIE ADMINA\nAdres: http://127.0.0.1:3000/panel\nHaslo: ${adminPassword}\n\nPo zalogowaniu zmien haslo w panelu. Ten plik zostanie wtedy usuniety.\n`,{mode:0o600});
    console.log('\n[UMBRA] Pierwsze haslo administratora:',adminPassword);
    console.log('[UMBRA] Kopia hasla:',firstPasswordFile,'\n');
  } else secrets=json(secretFile,null);
  if(!secrets?.jwtSecret || !secrets?.adminHash) throw new Error('Nieprawidłowe secrets.json');
  if(fs.existsSync(sealedFile)){
    state=JSON.parse(decryptState(fs.readFileSync(sealedFile),process.env.UMBRA_DATA_PASSPHRASE||secrets.jwtSecret));
  }else{
    state=json(stateFile,null);
    if(!state || !Array.isArray(state.users)) throw new Error('Nieprawidłowy plik state.json');
    saveEncrypted(state);
  }
  if(!state || !Array.isArray(state.users)) throw new Error('Nieprawidłowy plik state.enc');
  // Reserve one known first-use invitation without weakening account passwords.
  if(!state.initialInviteInitialized){
    transact(d=>{d.initialInviteInitialized=true;if(!d.users.some(u=>u.key==='67767') && !d.invites.some(i=>i.code==='67767'))d.invites.push({code:'67767',claimed:false,createdAt:Date.now(),initial:true});});
  }
  if(fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  // Old split JSON files can contain plaintext messages and old tokens.
  // They are obsolete after successful encrypted migration.
  for(const name of ['messages.json','tokens.json','contacts.json','groups.json','channels.json','users.json','invites.json','user.json']){
    const legacy=path.join(dataDir,name);
    if(fs.existsSync(legacy))fs.unlinkSync(legacy);
  }
}
function saveEncrypted(value){
  const content=encryptState(JSON.stringify(value),process.env.UMBRA_DATA_PASSPHRASE||secrets.jwtSecret);
  const tmp=`${sealedFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try{
    const fd=fs.openSync(tmp,'wx',0o600);
    try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(tmp,sealedFile);
  }catch(e){try{fs.unlinkSync(tmp);}catch{} throw e;}
}

export function current(){ if(!state) throw new Error('Store not initialized'); return state; }
export function transact(fn){
  const draft=structuredClone(current());
  const result=fn(draft);
  if(result instanceof Promise) throw new Error('transact must be synchronous');
  saveEncrypted(draft);
  state=draft;
  return result;
}
export function jwtSecret(){return secrets.jwtSecret;}
export function verifyAdmin(password){return typeof password === 'string' && bcrypt.compareSync(password,secrets.adminHash);}
export function adminRevision(){return crypto.createHash('sha256').update(secrets.adminHash).digest('hex').slice(0,24);}
export function changeAdminPassword(newPassword){
  secrets={...secrets,adminHash:bcrypt.hashSync(newPassword,12)};
  save(secretFile,secrets);
  try {fs.unlinkSync(firstPasswordFile);} catch{}
}
export function publicUser(u){const {pinHash,pin,...safe}=u;return safe;}
