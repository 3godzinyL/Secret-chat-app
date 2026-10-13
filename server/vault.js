/**
 * AES-256-GCM envelope with scrypt-derived keys. No cryptographic secret is sent
 * to the browser. A native C++ OpenSSL addon is optional; Node crypto uses the
 * same OpenSSL-native algorithms and exactly the same wire format.
 *
 * Envelope: UTF8 "UMB3" | salt[16] | IV[12] | ciphertext | tag[16].
 * Keep server/data/secrets.json separately and securely: compromise of BOTH
 * that file and state.enc means encryption at rest is not protective.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const magic=Buffer.from('UMB3');
const addon=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../native/build/umbra_crypto.node');
let native=null;
try {if(fs.existsSync(addon)) {const {createRequire}=await import('node:module');native=createRequire(import.meta.url)(addon);}} catch(e) {console.warn('[UMBRA] C++ addon niedostępny. Używam Node/OpenSSL:',e.message);}
const kdf=(secret,salt)=>crypto.scryptSync(secret,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024});
export function encryptState(plaintext,secret){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=kdf(secret,salt),data=Buffer.from(plaintext,'utf8');
  try{
    let body;
    if(native?.seal)body=native.seal(key,iv,data);
    else{const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);body=Buffer.concat([cipher.update(data),cipher.final(),cipher.getAuthTag()]);}
    return Buffer.concat([magic,salt,iv,body]);
  }finally {key.fill(0);data.fill(0);}
}
export function decryptState(encrypted,secret){
  if(!Buffer.isBuffer(encrypted)||encrypted.length<48||!encrypted.subarray(0,4).equals(magic))throw Error('Nieobsługiwany format bazy UMBRA');
  const salt=encrypted.subarray(4,20),iv=encrypted.subarray(20,32),body=encrypted.subarray(32),key=kdf(secret,salt);
  try{
    let plain;
    if(native?.unseal)plain=native.unseal(key,iv,body);
    else{const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(body.subarray(-16));plain=Buffer.concat([decipher.update(body.subarray(0,-16)),decipher.final()]);}
    const decoded=plain.toString('utf8');plain.fill(0);return decoded;
  }catch {throw Error('Nie można odszyfrować bazy: nieprawidłowy klucz lub naruszona integralność danych.');}
  finally{key.fill(0);}
}
export const nativeCryptoAvailable=Boolean(native?.seal&&native?.unseal);
