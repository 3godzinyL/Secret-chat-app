import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptState, decryptState,nativeCryptoAvailable } from '../server/vault.js';

test('szyfrowanie AES-256-GCM: integralnosc, losowosc IV/salt, jawny tekst niewidoczny',()=>{
 const secret=crypto.randomBytes(32).toString('base64');
 const content='SEKRET: wiadomość poufna • ü — Ω — 🔐 '.repeat(80);
 const a=encryptState(content,secret),b=encryptState(content,secret);
 assert.equal(a.subarray(0,4).toString(),'UMB3');assert.notDeepEqual(a,b);
 assert.equal(a.includes(Buffer.from('SEKRET')),false);
 assert.equal(decryptState(a,secret),content);assert.equal(decryptState(b,secret),content);
 const copy=Buffer.from(a);copy[copy.length-17]^=0xff;
 assert.throws(()=>decryptState(copy,secret));
 assert.throws(()=>decryptState(a,secret+'inny'));
 console.log('Native C++ addon loaded:',nativeCryptoAvailable);
});
