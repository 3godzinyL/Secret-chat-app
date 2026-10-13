
import { io } from 'socket.io-client';
let socket = null;
export function getSocket(){
  if (!socket){
    socket = io(localStorage.getItem('api_url') || 'http://localhost:8787', {
      autoConnect: false, transports: ['websocket'],
      auth: { token: localStorage.getItem('token') || '' }
    });
  }
  return socket;
}
export function resetSocket(){ if (socket){ try{ socket.disconnect(); }catch{} } socket = null; }
