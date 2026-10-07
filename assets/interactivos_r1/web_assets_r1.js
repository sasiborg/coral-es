/* Recursos clásicos locales: funcionan con file:// sin fetch ni servidor. */
(() => {
  'use strict';
  const values = new Map(), pending = new Map(), urls = new Set();
  let manifest = {};
  function configure(next) { manifest = next; }
  function register(key, value) { values.set(key, value); }
  function load(key) {
    if (values.has(key)) return Promise.resolve(values.get(key));
    if (pending.has(key)) return pending.get(key);
    const file = manifest[key]?.file;
    if (!file) return Promise.reject(new Error('Recurso local desconocido: ' + key));
    const task = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.charset = 'utf-8';
      script.src = new URL(file, document.baseURI).href;
      script.onload = () => {
        script.remove();
        if (!values.has(key)) reject(new Error('El recurso local está incompleto: ' + key));
        else resolve(values.get(key));
      };
      script.onerror = () => {
        script.remove();
        pending.delete(key);
        reject(new Error('No se pudo abrir el recurso. Conserva la carpeta completa y vuelve a intentarlo.'));
      };
      document.head.appendChild(script);
    });
    pending.set(key, task);
    const clear = () => { if (pending.get(key) === task) pending.delete(key); };
    task.then(clear, clear);
    return task;
  }
  function release(key) { values.delete(key); pending.delete(key); }
  function fromBase64(text) {
    const decoded = atob(text), bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  }
  async function unpack(input) {
    let value = manifest[input] ? await load(input) : input;
    const text = typeof value === 'string' ? value : value.gzip;
    if (typeof DecompressionStream !== 'function') throw new Error('Este navegador no admite descompresión local.');
    const stream = new Blob([fromBase64(text)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function blobURL(key) {
    const value = await load(key);
    let bytes;
    if (value.gzip) bytes = await unpack(value);
    else bytes = fromBase64(value.base64);
    const url = URL.createObjectURL(new Blob([bytes], {type: value.mime || 'application/octet-stream'}));
    urls.add(url);
    return url;
  }
  function revoke(url) {
    if (url && urls.has(url)) { URL.revokeObjectURL(url); urls.delete(url); }
  }
  function afterPaint() {
    if (document.hidden) return new Promise(resolve => setTimeout(resolve, 0));
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  function ready() {
    const preview = document.getElementById('r1Preview');
    if (preview) preview.hidden = true;
  }
  globalThis.CORAL_R1 = {configure, register, load, release, fromBase64, unpack, blobURL, revoke, afterPaint, ready,
    state: () => ({loaded: [...values.keys()], pending: [...pending.keys()], blobURLs: urls.size})};
})();
