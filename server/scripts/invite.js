
import * as store from '../store.js';
await store.initStore();
const invites = await store.getInvites();
function genFiveCode(){ return Math.floor(Math.random()*100000).toString().padStart(5,'0'); }
let code; do { code = genFiveCode(); } while (invites.find(i => i.code === code));
invites.push({ code, claimed:false, createdAt: Date.now() });
await store.saveInvites(invites);
console.log('Invite code:', code);
console.log('Link:', 'http://localhost:5173/?invite=' + code);
