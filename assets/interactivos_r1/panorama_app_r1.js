
/* Reversible clean image mode shared by both offline viewers. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.ViewChrome=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  function next(state) {return !state;}
  function bind(document,window) {
    const button=document.querySelector('#interfaz');
    let clean=false;
    function toggle() {
      clean=next(clean);document.body.classList.toggle('clean-view',clean);
      button.setAttribute('aria-pressed',String(clean));
      button.setAttribute('aria-label',clean?'Mostrar interfaz (H)':'Ocultar interfaz (H)');
      button.title=clean?'Mostrar interfaz (H)':'Ocultar interfaz (H)';
      if(clean)document.querySelector('#vista')?.focus?.();
    }
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggle();});
    for(const type of ['pointerdown','dblclick','wheel'])button.addEventListener(type,event=>event.stopPropagation());
    window.addEventListener('keydown',event=>{
      if(event.code==='KeyH' && !event.repeat && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey &&
          !event.target?.closest?.('textarea,[contenteditable=true]')) {
        event.preventDefault();event.stopPropagation();toggle();
      }
    },true);
    return {toggle,isClean:()=>clean};
  }
  return {next,bind};
});

const POINTS = [{"id": "centro", "label": "Centro", "file": "pano_centro_r1.webp", "image": "assets/interactivos_r1/pano_centro_r1.webp", "resourceKey": "pano:centro", "originalImage": "assets/interactivos_r1/originales/panorama_360.png", "originalFile": "panorama_360.png"}, {"id": "entrada", "label": "Entrada", "file": "pano_entrada_r1.webp", "image": "assets/interactivos_r1/pano_entrada_r1.webp", "resourceKey": "pano:entrada", "originalImage": "assets/interactivos_r1/originales/panorama_entrada.png", "originalFile": "panorama_entrada.png"}, {"id": "lateral", "label": "Lateral", "file": "pano_lateral_r1.webp", "image": "assets/interactivos_r1/pano_lateral_r1.webp", "resourceKey": "pano:lateral", "originalImage": "assets/interactivos_r1/originales/panorama_lateral.png", "originalFile": "panorama_lateral.png"}, {"id": "estaciones", "label": "Estaciones", "file": "pano_estaciones_r1.webp", "image": "assets/interactivos_r1/pano_estaciones_r1.webp", "resourceKey": "pano:estaciones", "originalImage": "assets/interactivos_r1/originales/panorama_estaciones.png", "originalFile": "panorama_estaciones.png"}];
const canvas=document.querySelector('#vista');
ViewChrome.bind(document,window);
const status=document.querySelector('#estado');
const select=document.querySelector('#punto');
const loading=document.querySelector('#cargando');
const fallback=document.querySelector('#fallback');
const alternative=document.querySelector('#alternativa');
let renderer,activePoint=POINTS[0],loadVersion=0,currentTexture=null;
let lon=180,lat=-12,touring=false,lastTime=0,currentPanoURL=null,currentPanoKey=null;
const pointers=new Map();
let pinchDistance=0;
function stopTour() {
  touring=false;
  const button=document.querySelector('#recorrer');
  button.setAttribute('aria-pressed','false');button.textContent='Recorrer';
}
function showFallback(message) {
  status.textContent=message;loading.hidden=true;fallback.hidden=false;
  document.querySelector('#fallo').textContent=message;
  alternative.href=activePoint.originalImage;alternative.download=activePoint.originalFile;
  document.querySelector('#fallback_image').src=activePoint.image;
  document.querySelectorAll('#acercar,#alejar,#volver,#recorrer').forEach(button=>{button.disabled=true;});
}
try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
} catch(error) { showFallback('Este navegador no permite la vista WebGL. Puedes abrir la panorámica.'); }
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(55,1,.1,20);
const geometry=new THREE.SphereGeometry(10,96,64);
geometry.scale(-1,1,1);
const material=new THREE.MeshBasicMaterial();
scene.add(new THREE.Mesh(geometry,material));
const direction=new THREE.Vector3();
function reset() {
  stopTour();lon=180;lat=-12;camera.fov=55;
  camera.updateProjectionMatrix();
}
async function selectPoint(id) {
  activePoint=POINTS.find(p=>p.id===id)||POINTS[0];
  select.value=activePoint.id;reset();
  canvas.setAttribute('aria-label','Panorámica desde '+activePoint.label+'. Arrastra o usa las flechas para mirar.');
  alternative.href=activePoint.originalImage;alternative.download=activePoint.originalFile;
  if(!renderer) { showFallback('Este navegador no permite la vista WebGL. Puedes abrir la panorámica.');return; }
  const version=++loadVersion;
  loading.hidden=false;fallback.hidden=true;
  status.textContent='Abriendo '+activePoint.label.toLowerCase()+'…';
  let imageURL;
  const selectedPoint=activePoint;
  try {
    await CORAL_R1.afterPaint();
    imageURL=await CORAL_R1.blobURL(selectedPoint.resourceKey);
    if(version!==loadVersion){CORAL_R1.revoke(imageURL);CORAL_R1.release(selectedPoint.resourceKey);return;}
  }catch(error){if(version===loadVersion)showFallback('No fue posible cargar este punto. Elige otro o vuelve a abrir la carpeta completa.');return;}
  const texture=new THREE.TextureLoader().load(imageURL,()=>{
    if(version!==loadVersion) {texture.dispose();CORAL_R1.revoke(imageURL);return;}
    if(currentTexture) currentTexture.dispose();
    if(currentPanoURL)CORAL_R1.revoke(currentPanoURL);
    if(currentPanoKey&&currentPanoKey!==selectedPoint.resourceKey)CORAL_R1.release(currentPanoKey);
    currentPanoURL=imageURL;currentPanoKey=selectedPoint.resourceKey;
    currentTexture=texture;material.map=texture;material.needsUpdate=true;CORAL_R1.ready();
    document.querySelectorAll('#acercar,#alejar,#volver,#recorrer').forEach(button=>{button.disabled=false;});
    loading.hidden=true;
    status.textContent=activePoint.label+' · Arrastra para mirar. Rueda o + / − para acercarte.';
  },undefined,()=>{
    texture.dispose();CORAL_R1.revoke(imageURL);
    if(version===loadVersion) showFallback('No fue posible cargar este punto. Elige otro o abre su panorámica.');
  });
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.wrapS=THREE.RepeatWrapping;
}
function zoom(delta) {
  camera.fov=THREE.MathUtils.clamp(camera.fov+delta,35,75);camera.updateProjectionMatrix();
}
function resize() {
  if(!renderer)return;
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
}
select.addEventListener('change',()=>selectPoint(select.value));
canvas.addEventListener('pointerdown',event=>{
  canvas.focus();canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pinchDistance=0;
});
canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  const previous=pointers.get(event.pointerId);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===1) {lon-=(event.clientX-previous.x)*.14;lat+=(event.clientY-previous.y)*.14;}
  else if(pointers.size===2) {
    const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinchDistance)zoom((pinchDistance-distance)*.055);pinchDistance=distance;
  }
  lat=THREE.MathUtils.clamp(lat,-85,85);
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture']) {
  canvas.addEventListener(eventName,event=>{pointers.delete(event.pointerId);pinchDistance=0;});
}
canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY*.025);},{passive:false});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stopTour();showFallback('Se perdió el contexto WebGL. Puedes abrir la panorámica.');});
canvas.addEventListener('webglcontextrestored',()=>selectPoint(activePoint.id));
document.querySelector('#acercar').onclick=()=>zoom(-5);
document.querySelector('#alejar').onclick=()=>zoom(5);
document.querySelector('#volver').onclick=reset;
document.querySelector('#recorrer').onclick=event=>{
  touring=!touring;event.currentTarget.setAttribute('aria-pressed',String(touring));
  event.currentTarget.textContent=touring?'Pausar recorrido':'Recorrer';
};
document.querySelector('#pantalla').onclick=async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch(error) {status.textContent='Este navegador no permite pantalla completa.';}
};
window.addEventListener('keydown',event=>{
  if(event.target.closest('a,button,select,input'))return;
  let handled=true;
  switch(event.key) {
    case 'ArrowLeft':lon+=4;break;case 'ArrowRight':lon-=4;break;
    case 'ArrowUp':lat+=4;break;case 'ArrowDown':lat-=4;break;
    case '+':case '=':zoom(-5);break;case '-':zoom(5);break;
    case 'Home':reset();break;default:handled=false;
  }
  lat=THREE.MathUtils.clamp(lat,-85,85);if(handled)event.preventDefault();
});
window.addEventListener('resize',resize);
window.addEventListener('blur',()=>{pointers.clear();pinchDistance=0;});
resize();selectPoint(activePoint.id);
function frame(time) {
  const elapsed=lastTime?Math.min((time-lastTime)/1000,.1):0;lastTime=time;
  if(touring && !pointers.size && !document.hidden)lon+=elapsed*6;
  const phi=THREE.MathUtils.degToRad(90-lat),theta=THREE.MathUtils.degToRad(lon);
  direction.set(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
  camera.lookAt(direction);
  if(renderer)renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
if(renderer)requestAnimationFrame(frame);
