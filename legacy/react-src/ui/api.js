
export async function api(path, opts={}){
  const base = localStorage.getItem('api_url') || 'http://localhost:8787';
  const token = localStorage.getItem('token');
  const headers = Object.assign({'Content-Type': 'application/json'}, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(base + path, { ...opts, headers });
  if (!res.ok) { let err; try { err = await res.json(); } catch {}; throw new Error(err?.error || ('HTTP '+res.status)); }
  return res.json();
}
