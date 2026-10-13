import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import {encryptState,decryptState} from '../server/vault.js';

test('AES-256-GCM compatible with reference native Node/OpenSSL',()=>{
 const secret='mocno-losowy-sekret-'+crypto.randomBytes(24).toString('hex');
 const ciphertext=encryptState('UMBRA native format test',secret);
 const salt=ciphertext.subarray(4,20),iv=ciphertext.subarray(20,32),body=ciphertext.subarray(32);
 const key=crypto.scryptSync(secret,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
 const dec=crypto.createDecipheriv('aes-256-gcm',key,iv);dec.setAuthTag(body.subarray(-16));
 assert.equal(Buffer.concat([dec.update(body.subarray(0,-16)),dec.final()]).toString(),'UMBRA native format test');
 assert.equal(decryptState(ciphertext,secret),'UMBRA native format test');
});

test('migracja starych danych oraz brak klucza odszyfrowania powoduje bezpieczne przerwanie startu',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'umbra-migration-'));
 try{
  fs.writeFileSync(path.join(dir,'user.json'),JSON.stringify({users:[{id:'u1',key:'11111',pin:'testpass123',displayName:'Legacy'}],invites:[]}));
  const run=()=>spawnSync(process.execPath,['--input-type=module','-e',"import('./store.js').then(m=>m.initStore())"],{cwd:path.resolve('server'),env:{...process.env,DATA_DIR:dir},encoding:'utf8',timeout:10000});
  const init=run();assert.equal(init.status,0,init.stderr);
  assert.ok(fs.existsSync(path.join(dir,'state.enc')));assert.ok(!fs.existsSync(path.join(dir,'state.json')));
  assert.equal(fs.existsSync(path.join(dir,'user.json')),false,'stara baza z jawnymi PIN-ami jest usunięta');
  const secret=JSON.parse(fs.readFileSync(path.join(dir,'secrets.json'),'utf8')).jwtSecret;
  const state=JSON.parse(decryptState(fs.readFileSync(path.join(dir,'state.enc')),secret));
  assert.equal(state.users[0].displayName,'Legacy');assert.equal(state.users[0].pinHash.startsWith('$2'),true);
  assert.equal(state.invites[0].code,'67767');
  fs.renameSync(path.join(dir,'secrets.json'),path.join(dir,'secrets.missing'));
  const missing=run();assert.notEqual(missing.status,0);assert.match(missing.stderr,/Brak secrets.json/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
