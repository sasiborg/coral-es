
const offlineAssets=JSON.parse(document.getElementById('offlineAssets').textContent);
const offlineModelURLs=new Map(),offlineChunkCache=new Map();
async function unpackGzip(text){return CORAL_R1.unpack(text);}
async function offlineChunk(index){
 if(!offlineChunkCache.has(index))offlineChunkCache.set(index,unpackGzip(offlineAssets.chunks[index].gzip));
 return offlineChunkCache.get(index);
}
async function offlineModelData(name){
 const recipe=offlineAssets.models[name];if(!recipe)throw new Error('Modelo local desconocido: '+name);
 const output=new Uint8Array(recipe.bytes);let offset=0;
 for(const index of recipe.chunks){const chunk=await offlineChunk(index);output.set(chunk,offset);offset+=chunk.length;}
 if(offset!==recipe.bytes)throw new Error('El modelo local está incompleto.');
 if(!offlineModelURLs.has(name))offlineModelURLs.set(name,URL.createObjectURL(new Blob([output],{type:'model/gltf-binary'})));
 return output.buffer;
}
async function loadOfflineModel(name,loader){return loader.parseAsync(await offlineModelData(name),'');}
const {OrbitControls,GLTFLoader}=THREE;
document.querySelectorAll('#controls input:not([data-ui]),#controls select:not([data-ui]),#controls button:not([data-ui])').forEach(control=>{control.disabled=true;});
const ModelState=(()=>{

/** Pure view rules. Source vectors are XYZ mm; exported GLB is already Y-up m. */
const VARIANTS=Object.freeze(['T','R','G']);
const FEET=['fixed'];
const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,number(v)));
const role=p=>String(p.role||'').toLowerCase().replace(/[ -]/g,'_');
const COVER_ROLES=new Set(['access','access_cover','cover','register','tapa','register_screw','access_latch','cover_latch','register_latch','cover_guide']);
const FINISH_ROLES=new Set(['seat','seat_core','seat_finish','seat_edge','skin','side_skin','cap','end_cap','endcap','veneer','edge','finish','seat_board','seat_veneer']);
const isCover=p=>COVER_ROLES.has(role(p))||role(p).startsWith('access_cover');
const isFinish=p=>FINISH_ROLES.has(role(p))||isCover(p);

function modelPath(state={}) {
  const variant=VARIANTS.includes(state.variant)?state.variant:'G';
  const feet=FEET.includes(state.feet)?state.feet:'fixed';
  return `CORALES_${variant}_${feet}.glb`;
}

function normalizeState(design={},input={}) {
  const modules=design.modules||[],joints=design.joints||[];
  const state={variant:VARIANTS.includes(input.variant)?input.variant:'G',
    feet:'fixed',
    module:modules.some(m=>m.id===input.module)?input.module:'all',
    joint:joints.some(j=>j.id===input.joint)?input.joint:'',
    selected:input.selected||'',structure:Boolean(input.structure),covers:Boolean(input.covers),
    explode:clamp(input.explode,0,100),step:Math.max(0,Math.floor(number(input.step))),
    assembly:Boolean(input.assembly),humans:Boolean(input.humans),
    humanFacing:['mixed','inside','outside'].includes(input.humanFacing)?input.humanFacing:'mixed',
    humanDensity:input.humanDensity==='double'?'double':'single',
    view:['perspective','top','front','side','joint'].includes(input.view)?input.view:'perspective'};
  if(state.selected&&!eligibleParts(design,state).some(p=>p.id===state.selected))state.selected='';
  return state;
}

function moduleIds(design,state) {
  const joint=(design.joints||[]).find(j=>j.id===state.joint);
  return joint?[joint.a,joint.b]:state.module==='all'?(design.modules||[]).map(m=>m.id):[state.module];
}

function eligibleParts(design,state) {
  const modules=new Set(moduleIds(design,state));
  const ownership=new Map();
  if(state.joint)for(const joint of design.joints||[])for(const variant of Object.values(joint.variants||{}))for(const id of variant.part_ids||[])ownership.set(id,joint.id);
  const hidePins=state.assembly&&state.joint&&['R','G'].includes(state.variant)
    &&state.step<assemblyFor(design,state.variant).steps.length-1;
  return (design.parts||[]).filter(p=>['common',state.variant,state.feet].includes(p.variant||'common')
    &&modules.has(p.module)&&(!state.structure||!isFinish(p))&&(!state.covers||!isCover(p))
    &&(!state.joint||!ownership.has(p.id)||ownership.get(p.id)===state.joint)
    &&(!hidePins||role(p)!=='retention_pin'||ownership.get(p.id)!==state.joint));
}

function changeState(design,current,patch) {
  const next={...current,...patch};
  if('module' in patch&&!('joint' in patch)){next.joint='';next.assembly=false;}
  if('joint' in patch&&next.joint)next.module='all';
  if('variant' in patch||'joint' in patch||'module' in patch)next.step=0;
  return normalizeState(design,next);
}

const sourceToScene=p=>[number(p?.[0])/1000,number(p?.[2])/1000,-number(p?.[1])/1000];
const explosionOffset=(part,percent)=>[0,1,2].map(i=>number(part.explosion?.[i])*clamp(percent,0,100)/100);

/** Motion of the arriving module, in source mm. 0=present,1=insert,2+=seated. */
function assemblyOffset(part,joint,variant,phase,spec={}) {
  if(!joint||part.module!==joint.b)return [0,0,0];
  const tangent=joint.tangent||[1,0];
  const stage=Math.max(0,number(phase));
  const gap=stage===0?(variant==='T'?0:number(spec.insert_mm,variant==='G'?40:45)):0;
  const rise=stage<2?number(spec.drop_mm,variant==='R'?80:variant==='G'?20:0):0;
  return [number(tangent[0])*gap,number(tangent[1])*gap,rise];
}

const FALLBACKS={
  T:{name:'T · Pernos internos',summary:'Cuatro pernos M8 internos con placas de reparto y tuercas retenidas.',steps:[
    ['Presentar los dos módulos','Apoya cada módulo sobre sus cuatro patas. Conserva abierto el acceso superior antes de cerrar el asiento junto a la junta y presenta los testeros.','present'],
    ['Alinear los encuentros','Aproxima los módulos con el asiento enrasado. Comprueba los cuatro pasos de perno desde el acceso superior.','insert'],
    ['Insertar los cuatro pernos M8','Coloca los cuatro pernos con sus placas de reparto y tuercas retenidas. No uses el acabado exterior como unión estructural.','seated'],
    ['Revisar y cerrar','Comprueba fijaciones, apoyos y acceso real de la herramienta. Cierra el asiento después de verificar los seguros; el apriete definitivo requiere especificación y prototipo.','seated'],
  ]},
  R:{name:'R · Rieles de descenso',summary:'Dos rieles ocultos con entrada bajo el asiento, descenso de 80 mm y pasador de madera contra levantamiento.',steps:[
    ['Presentar el módulo elevado','Conserva abierto el acceso superior. Eleva el módulo entrante 80 mm con medios de manejo adecuados; la ventana de entrada queda bajo el asiento.','present'],
    ['Introducir los dos rieles','Aproxima el módulo elevado e introduce los dos rieles trapezoidales en sus entradas bajo el asiento. Mantén el apoyo de manejo.','insert'],
    ['Descender 80 mm','Baja el módulo de forma controlada 80 mm hasta el asiento nominal y sus cuatro apoyos. No fuerces el ajuste.','seated'],
    ['Bloquear y cerrar','Inserta el pasador de madera contra levantamiento desde el acceso superior. Comprueba la retención y cierra el asiento.','seated'],
  ]},
  G:{name:'G · Ganchos de madera',summary:'Tres ganchos internos: inserción horizontal de 40 mm, descenso de 20 mm y seguro de madera.',steps:[
    ['Presentar los tres ganchos','Conserva abierto el acceso superior. Presenta el módulo entrante 20 mm elevado, con los tres ganchos frente a las ventanas bajo el asiento.','present'],
    ['Insertar 40 mm','Avanza horizontalmente 40 mm para introducir los tres ganchos; conserva el módulo 20 mm elevado.','insert'],
    ['Descender 20 mm','Baja el módulo de forma controlada 20 mm hasta sus cuatro apoyos y comprueba el asiento enrasado.','seated'],
    ['Colocar el seguro','Inserta el seguro de madera contra levantamiento desde el acceso superior. Comprueba los tres enganches y cierra el asiento.','seated'],
  ]},
};

function inferPhase(title,text,index) {
  for(const value of [title,text]){
    if(/\b(?:baja(?:r)?|baje|desciend[ae]|descender|asentar|bloquear|asegura(?:r)?|seguros?|pasadores?|cerrar)(?=\b|\d)/i.test(value))return 'seated';
    if(/\b(?:entrar|introducir|insert[ae]r?|avanzar|aproxima[rs]?|alinear)(?=\b|\d)/i.test(value))return 'insert';
    if(/\b(?:presenta[rs]?|elevar|abrir|apoyar)(?=\b|\d)/i.test(value))return 'present';
  }
  return index<2?['present','insert'][index]:'seated';
}

function assemblyFor(design,variant) {
  const fallback=FALLBACKS[variant]||FALLBACKS.T;
  const source=design.assemblies?.[variant]||{};
  const list=Array.isArray(source.steps)&&source.steps.length?source.steps:fallback.steps;
  const steps=list.map((s,index)=>{
    if(Array.isArray(s))return {title:s[0],text:s[1],phase:s[2]};
    if(typeof s==='string')return {title:`Paso ${index+1}`,text:s,phase:inferPhase('',s,index)};
    const text=s.text||s.instruction||s.action||(Array.isArray(s.actions)?s.actions.join(' '):'');
    return {...s,title:s.title||s.name||`Paso ${index+1}`,text,
      phase:s.phase||inferPhase(s.title||'',text,index)};
  });
  return {...source,name:source.name||fallback.name,summary:source.summary||fallback.summary,steps};
}

function resolvePartId(object,partsById) {
  for(let cursor=object;cursor;cursor=cursor.parent){
    const candidates=[cursor.userData?.id,cursor.userData?.part_id,cursor.name];
    for(const candidate of candidates){
      if(partsById.has(candidate))return candidate;
      const unsuffixed=String(candidate||'').replace(/\.\d{3}$/,'');
      if(partsById.has(unsuffixed))return unsuffixed;
    }
  }
  return '';
}

class LatestRequest {
  #sequence=0;
  async run(load) {
    const sequence=++this.#sequence;
    try {const value=await load();return {current:sequence===this.#sequence,value};}
    catch(error){return {current:sequence===this.#sequence,error};}
  }
}

function partSize(part) {
  if(part.size)return part.size;
  if(part.kind==='cylinder')return [number(part.radius)*2,number(part.depth)];
  if(part.polygon?.length)return [0,1].map(i=>Math.max(...part.polygon.map(p=>p[i]))-Math.min(...part.polygon.map(p=>p[i]))).concat(number(part.height));
  return [];
}

return{VARIANTS,isCover,isFinish,modelPath,normalizeState,moduleIds,eligibleParts,changeState,sourceToScene,explosionOffset,assemblyOffset,assemblyFor,resolvePartId,LatestRequest,partSize};})();
const ModelHumans=(()=>{

// Illustrative dimensions; these figures are not certified anthropometric models.
const HUMAN_HEIGHTS_M = Object.freeze({male:1.75,female:1.63,child:1.10});
const KINDS=['male','female','child'];
const LABELS={male:'Adulto masculino',female:'Adulta femenina',child:'Niño/a'};
const count=x=>Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0;
const add=(p,v,k=1)=>p.map((x,i)=>x+k*v[i]);
const distance=(p,q)=>Math.hypot(...p.map((x,i)=>x-q[i]));

function inside(p,polygon){
  let c=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;
  }
  return c;
}
function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function polygonsOverlap(a,b){
  if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    if(cross(p,q,r)*cross(p,q,s)<0&&cross(r,s,p)*cross(r,s,q)<0)return true;
  }
  return false;
}
function footprintHitsBench(D,footprint){
  const lo=[0,1].map(k=>Math.min(...footprint.map(p=>p[k])));
  const hi=[0,1].map(k=>Math.max(...footprint.map(p=>p[k])));
  return D.modules.some(m=>{
    const poly=m.outline;
    if(!poly?.length)return false;
    const ml=[0,1].map(k=>Math.min(...poly.map(p=>p[k])));
    const mh=[0,1].map(k=>Math.max(...poly.map(p=>p[k])));
    if(hi.some((x,k)=>x<ml[k])||lo.some((x,k)=>x>mh[k]))return false;
    return polygonsOverlap(footprint,poly);
  });
}

function shape(kind,pose,seatHeight){
  const h=HUMAN_HEIGHTS_M[kind],seated=pose==='seated';
  const pelvisY=seated?seatHeight+.04*h:.515*h;
  const kneeY=seated?seatHeight+.024*h:.275*h;
  const ankleY=seated&&kind==='child'?Math.max(.055,kneeY-.245*h):.05;
  return {h,pelvisY,kneeY,ankleY,kneeZ:seated?.245*h:0,
    shoulderY:pelvisY+.285*h,headY:pelvisY+.413*h,
    shoulderHalf:(kind==='male'?.115:kind==='female'?.106:.105)*h,
    hipHalf:(kind==='female'?.08:.074)*h,shoeWidth:.061*h,shoeLength:.145*h};
}

function fillSpecs(config,pose,limit,warnings){
  const desired=Object.fromEntries(KINDS.map(k=>[k,count(config[pose+k[0].toUpperCase()+k.slice(1)])]));
  const total=Object.values(desired).reduce((a,b)=>a+b,0),result=[];
  // Round-robin preserves all requested types when a total needs capping.
  while(result.length<Math.min(total,limit))for(const k of KINDS){
    if(desired[k]>0&&result.length<limit){result.push(k);desired[k]--;}
  }
  if(total>limit)warnings.push(`Se solicitaron ${total} ${pose==='seated'?'sentados':'de pie'}; se muestran como máximo ${limit}.`);
  return result;
}

/** Exact source curve station. Module stations use a different (chord) datum. */
function seatFrameAt(D,module,offset=0){
  const p=D.parameters||{},a=p.r0_mm,b=p.b_mm_per_rad,maximum=p.theta_max_rad;
  const middle=(module.s0_mm+module.s1_mm)/2;
  const s=Math.max(module.s0_mm,Math.min(module.s1_mm,middle+offset));
  if(p.curve!=='Archimedes'||![a,b,maximum,s].every(Number.isFinite)||b<=0){
    return {center:add(module.center,[Math.cos(module.angle_rad),Math.sin(module.angle_rad)],offset),angle_rad:module.angle_rad,s_mm:s};
  }
  const integral=x=>(x*Math.hypot(x,b)+b*b*Math.asinh(x/b))/(2*b);
  const initial=integral(a);
  let low=0,high=maximum;
  for(let i=0;i<42;i++){
    const theta=(low+high)/2;
    if(integral(a+b*theta)-initial<s)low=theta;else high=theta;
  }
  const theta=(low+high)/2,r=a+b*theta,q=Math.hypot(r,b),mirror=p.mirror_axis==='X'?-1:1;
  const raw=[mirror*r*Math.cos(theta),r*Math.sin(theta)];
  const tangent=[mirror*(b*Math.cos(theta)-r*Math.sin(theta))/q,(b*Math.sin(theta)+r*Math.cos(theta))/q];
  const rotation=(p.rotation_deg||0)*Math.PI/180,c=Math.cos(rotation),sn=Math.sin(rotation);
  const rotate=v=>[c*v[0]-sn*v[1],sn*v[0]+c*v[1]];
  const v=rotate(tangent),center=rotate(raw).map((n,i)=>n+(p.translation_mm?.[i]||0));
  return {center,angle_rad:Math.atan2(v[1],v[0]),s_mm:s};
}

/** Returns {people,totals,warnings,limits}; all placement data uses source XYZ mm. */
function computePeople(D,config={}){
  const warnings=[],people=[],mods=D.modules||[];
  const perModule=config.seatedPerModule===2?2:1,seatedLimit=Math.min(17,mods.length)*perModule;
  if(!mods.length)return {people,totals:{total:0,seated:0,standing:0,companions:0},warnings:['No hay módulos para colocar referencias.'],limits:{seated:0,standing:60}};
  const seatHeight=(D.parameters?.seat_height_mm??450)/1000;
  const sideFor=index=>config.peopleFacing==='mixed'?(index%2?'outside':'inside'):config.peopleFacing==='outside'?'outside':'inside';
  const seated=fillSpecs(config,'seated',seatedLimit,warnings);
  const requestedStanding=fillSpecs(config,'standing',60,warnings);
  const childCount=seated.filter(k=>k==='child').length+requestedStanding.filter(k=>k==='child').length;
  let standing=requestedStanding;
  if(config.childCompanion&&standing.length+childCount>60){
    // Reserve one standing slot per displayed child; never silently omit a companion.
    standing=[...standing];
    while(standing.length+seated.filter(k=>k==='child').length+standing.filter(k=>k==='child').length>60)standing.pop();
    warnings.push('Se reservaron plazas dentro del límite de 60 de pie para los acompañantes; el total solicitado fue reducido.');
  }
  function inwardFor(m){
    const left=[-Math.sin(m.angle_rad),Math.cos(m.angle_rad)];
    const station=m.stations?.[Math.floor(m.stations.length/2)];
    let toward;
    if(station?.inner&&station?.outer&&m.datum_axis&&m.datum_normal){
      const local=station.inner.map((n,i)=>n-station.outer[i]);
      // Stations use the datum chord basis, not the exact center tangent angle.
      toward=[0,1].map(i=>local[0]*m.datum_axis[i]+local[1]*m.datum_normal[i]);
    }else{
      const origin=D.parameters?.translation_mm||[0,0];
      toward=origin.map((n,i)=>n-m.center[i]);
    }
    const sign=left[0]*toward[0]+left[1]*toward[1]<0?-1:1;
    return left.map(n=>n*sign);
  }
  const facingFor=(m,side)=>inwardFor(m).map(n=>n*(side==='outside'?-1:1));
  function build(kind,pose,m,xy,companionOf=null,facingSide='inside'){
    const facing=facingFor(m,facingSide),right=[-facing[1],facing[0]],s=shape(kind,pose,seatHeight);
    const feet=[],footprints=[];
    for(const side of [-1,1]){
      const center=add(add(xy,right,side*s.hipHalf*1000),facing,(s.kneeZ+s.shoeLength*.18)*1000);
      feet.push([...center,(s.ankleY-.025)*1000]);
      const polygon=[];
      for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]])polygon.push(add(add(center,right,u*s.shoeWidth*500),facing,v*s.shoeLength*500));
      footprints.push(polygon);
    }
    return {id:`H${String(people.length+1).padStart(2,'0')}`,kind,pose,label:LABELS[kind],module:m.id,
      height_m:s.h,position_mm:[...xy,0],facing_xy:facing,facing_side:facingSide,feet,footprints_mm:footprints,
      footCollision:footprints.some(p=>footprintHitsBench(D,p)),companionOf,
      seat_surface_mm:pose==='seated'?seatHeight*1000:null,body:s};
  }
  function placeStanding(kind,m,near=null,companionOf=null,facingSide=sideFor(people.length)){
    const f=facingFor(m,facingSide),t=[Math.cos(m.angle_rad),Math.sin(m.angle_rad)];
    const origin=near||m.center;
    let candidate;
    // Deterministic local search checks shoe polygons against every module.
    for(let layer=0;layer<18;layer++)for(const along of (near?[450,-450,900,-900,0]:[0,450,-450,900,-900])){
      const offset=near?(430+layer*200):(750+layer*250);
      const xy=add(add(origin,f,offset),t,along);
      candidate=build(kind,'standing',m,xy,companionOf,facingSide);
      const separated=people.every(p=>distance(p.position_mm.slice(0,2),xy)>(p.kind==='child'||kind==='child'?310:390));
      if(!candidate.footCollision&&separated){people.push(candidate);return candidate;}
    }
    // Explicit failure: no intersecting or hidden unreported figure is added.
    warnings.push(`No se encontró posición libre para ${LABELS[kind]} cerca de ${m.id}; referencia omitida.`);
    return null;
  }
  seated.forEach((kind,i)=>{
    const module=mods[Math.floor((Math.floor(i/perModule)+.5)*mods.length/Math.ceil(seated.length/perModule))];
    const offset=perModule===2?(i%2?275:-275):0;
    const frame=perModule===2?seatFrameAt(D,module,offset):{center:module.center,angle_rad:module.angle_rad,s_mm:(module.s0_mm+module.s1_mm)/2};
    const m={...module,...frame},side=sideFor(i),f=facingFor(m,side);
    const p=build(kind,'seated',m,add(m.center,f,110),null,side);
    p.arc_offset_mm=offset;p.station_s_mm=frame.s_mm;p.seat_axis_mm=[...frame.center];
    if(p.footCollision){warnings.push(`Pies de ${p.id} no caben fuera de la planta; referencia omitida.`);return;}
    people.push(p);
  });
  standing.forEach((kind,i)=>placeStanding(kind,mods[Math.floor((i+.5)*mods.length/standing.length)]));
  if(config.childCompanion){
    for(const child of people.filter(p=>p.kind==='child')){
      const m=mods.find(m=>m.id===child.module);
      placeStanding('female',m,child.position_mm.slice(0,2),child.id,child.facing_side);
    }
  }
  const totals={total:people.length,seated:people.filter(p=>p.pose==='seated').length,
    standing:people.filter(p=>p.pose==='standing').length,companions:people.filter(p=>p.companionOf).length,
    male:people.filter(p=>p.kind==='male').length,female:people.filter(p=>p.kind==='female').length,child:people.filter(p=>p.kind==='child').length};
  return {people,totals,warnings,limits:{seated:seatedLimit,standing:60},
    note:'Ocupación espacial ilustrativa 1,75/1,63/1,10 m; no acredita capacidad de carga, percentiles antropométricos, aforo autorizado ni accesibilidad. Los acompañantes se suman al total.'};
}

const sphereGeometry=new THREE.SphereGeometry(1,12,8);
const cylinderGeometry=new THREE.CylinderGeometry(1,1,1,12,1);
const cubeGeometry=new THREE.BoxGeometry(1,1,1);
const colors={male:0x58758c,female:0x9c6659,child:0xc39848};
const skinMaterial=new THREE.MeshStandardMaterial({color:0xc8af93,roughness:.85});
const shoeMaterial=new THREE.MeshStandardMaterial({color:0x333a40,roughness:.9});
const clothes=Object.fromEntries(KINDS.map(k=>[k,new THREE.MeshStandardMaterial({color:colors[k],roughness:.82})]));

function personGeometry(person){
  const g=new THREE.Group();g.name=`${person.id} · ${person.label} · ${person.pose==='seated'?'sentado/a':'de pie'}`;
  const b=person.body,h=b.h,material=clothes[person.kind],seated=person.pose==='seated';
  function ellipsoid(name,position,scale,mat=material){
    const mesh=new THREE.Mesh(sphereGeometry,mat);mesh.name=name;mesh.position.set(...position);mesh.scale.set(...scale);g.add(mesh);return mesh;
  }
  function bone(name,a,b,r,mat=material){
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);
    const mesh=new THREE.Mesh(cylinderGeometry,mat);mesh.name=name;
    mesh.position.copy(va.add(vb).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
    mesh.scale.set(r,delta.length(),r);g.add(mesh);
  }
  ellipsoid('Pelvis',[0,b.pelvisY,0],[b.hipHalf*1.35,.04*h,.06*h]);
  ellipsoid('Torso',[0,b.pelvisY+.15*h,-.008*h],[b.shoulderHalf*.86,.155*h,.069*h]);
  bone('Cuello',[0,b.shoulderY,0],[0,b.headY-.06*h,0],.031*h,skinMaterial);
  ellipsoid('Cabeza',[0,b.headY,0],[.057*h,.072*h,.063*h],skinMaterial);
  // A small neutral face direction cue avoids an unreadable sphere-only silhouette.
  ellipsoid('Nariz',[0,b.headY-.008*h,.061*h],[.013*h,.013*h,.016*h],skinMaterial);
  for(const side of [-1,1]){
    const x=side*b.hipHalf,knee=[x,b.kneeY,b.kneeZ],ankle=[x,b.ankleY,b.kneeZ];
    bone('Muslo',[x,b.pelvisY,0],knee,.036*h);ellipsoid('Rodilla',knee,[.038*h,.038*h,.038*h]);
    bone('Pierna',knee,ankle,.028*h);ellipsoid('Tobillo',ankle,[.025*h,.025*h,.025*h],shoeMaterial);
    const shoe=new THREE.Mesh(cubeGeometry,shoeMaterial);shoe.name='Zapato';
    shoe.position.set(x,b.ankleY-.025,b.kneeZ+b.shoeLength*.18);shoe.scale.set(b.shoeWidth,.05,b.shoeLength);g.add(shoe);
    const shoulder=[side*b.shoulderHalf,b.shoulderY,0];
    const elbow=seated?[side*(b.shoulderHalf+.015*h),b.pelvisY+.10*h,.11*h]:[side*(b.shoulderHalf+.018*h),b.shoulderY-.15*h,.01*h];
    const hand=seated?[side*b.hipHalf,b.kneeY+.07*h,b.kneeZ*.8]:[side*(b.shoulderHalf+.008*h),b.shoulderY-.29*h,.025*h];
    ellipsoid('Hombro',shoulder,[.04*h,.04*h,.04*h]);bone('Brazo',shoulder,elbow,.026*h);
    ellipsoid('Codo',elbow,[.027*h,.027*h,.027*h],skinMaterial);bone('Antebrazo',elbow,hand,.022*h,skinMaterial);
    ellipsoid('Mano',hand,[.025*h,.036*h,.022*h],skinMaterial);
  }
  g.updateMatrixWorld(true);
  const finalBounds=new THREE.Box3().setFromObject(g);
  g.userData={person,localBounds:{height_m:finalBounds.max.y-finalBounds.min.y,min:finalBounds.min.toArray(),max:finalBounds.max.toArray()}};
  return g;
}

/** Purely local Three geometry; source XY(mm) -> Three X,-Z(m), source Z -> Y. */
function createHumanGroup(D,config={}){
  const summary=computePeople(D,config),group=new THREE.Group();group.name='Referencias humanas';group.visible=config.visible!==false;
  group.userData.peopleSummary=summary;
  for(const p of summary.people){
    const figure=personGeometry(p);
    figure.position.set(p.position_mm[0]/1000,0,-p.position_mm[1]/1000);
    figure.rotation.y=Math.atan2(p.facing_xy[0],-p.facing_xy[1]);
    group.add(figure);
  }
  group.updateMatrixWorld(true);
  return group;
}

return{HUMAN_HEIGHTS_M,footprintHitsBench,seatFrameAt,computePeople,createHumanGroup};})();
const ModelParts=(()=>{
const {resolvePartId}=ModelState;
/** Keep every primitive of a part, including face/edge materials and native UVs. */
function preparePartModel(source,partsById){
  const group=new THREE.Group();group.name='CORAL-ES V5';
  const index=new Map();let unknown=0;
  source.updateMatrixWorld(true);
  source.traverse(object=>{
    if(!object.isMesh)return;
    const id=resolvePartId(object,partsById);if(!id){unknown++;return;}
    // The exported GLTF is already Y-up metres. UV attributes remain unchanged.
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    const material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=id;mesh.userData.id=id;group.add(mesh);
    if(!index.has(id))index.set(id,[]);index.get(id).push(mesh);
  });
  return {group,index,unknown};
}

const emissions=new WeakMap(),highlight=new THREE.Color('#89501f');

function setPartHighlight(mesh,selected){
  for(const material of (Array.isArray(mesh.material)?mesh.material:[mesh.material]))if(material.emissive){
    if(!emissions.has(material))emissions.set(material,{color:material.emissive.clone(),intensity:material.emissiveIntensity});
    const native=emissions.get(material);
    material.emissive.copy(native.color);
    if(selected)material.emissive.lerp(highlight,.7);
    material.emissiveIntensity=selected?Math.max(native.intensity,.5):native.intensity;
  }
}

return{preparePartModel,setPartHighlight};})();
const ModelLayout=(()=>{

// Display transforms only. Native part geometry and relative frame poses stay intact.
const finite=n=>Number.isFinite(Number(n))?Number(n):0;

function frameGroups(design){
 const groups=new Map();
 for(const part of design.parts||[])if(part.role==='rib'&&part.frame_id){
  if(!groups.has(part.frame_id))groups.set(part.frame_id,[]);
  groups.get(part.frame_id).push(part);
 }
 for(const [frame,members] of groups)if(members.length!==4)throw new Error('El marco debe contener cuatro listones: '+frame);
 return groups;
}

function groupedExplosionOffset(part,percent,groups,separateMembers=false){
 const amount=Math.max(0,Math.min(100,finite(percent)))/100;
 const members=!separateMembers&&part.role==='rib'&&part.frame_id?groups.get(part.frame_id):null;
 const vector=members?.length?[0,1,2].map(axis=>members.reduce((sum,member)=>sum+finite(member.explosion?.[axis]),0)/members.length):[0,1,2].map(axis=>finite(part.explosion?.[axis]));
 return vector.map(value=>value*amount);
}

function ribMemberSpread(part){
 if(part.role!=='rib')return [0,0,0];
 if(part.subrole==='frame_top')return [0,0,160];
 if(part.subrole==='frame_bottom')return [0,0,-120];
 const side=part.id.endsWith('_IZQ')?-1:part.id.endsWith('_DER')?1:0;
 if(!side)throw new Error('Listón vertical sin lado identificable: '+part.id);
 const angle=finite(part.angle_rad);
 return [-Math.sin(angle)*side*180,Math.cos(angle)*side*180,0];
}

function sourceDeltaToGltf(matrix){
 if(!Array.isArray(matrix)||matrix.length!==4||matrix.some(row=>!Array.isArray(row)||row.length!==4||row.some(value=>!Number.isFinite(value))))throw new Error('Matriz de disposición inválida.');
 // Blender XYZ-m -> exported GLTF X,Z,-Y-m. Return Three column-major order.
 const axes=[0,2,1,3],signs=[1,1,-1,1],output=[];
 for(let column=0;column<4;column++)for(let row=0;row<4;row++)output.push(signs[row]*signs[column]*matrix[axes[row]][axes[column]]);
 return output;
}

function commonFrameFloorMatrices(parts,matrices){
 const output=new Map(matrices),groups=frameGroups({parts});
 for(const [frame,members] of groups){
  const values=members.map(member=>matrices.get(member.id));
  if(values.some(value=>!value))throw new Error('Marco sin disposición completa: '+frame);
  if(values.some(value=>value.some((number,index)=>Math.abs(number-values[0][index])>1e-7)))throw new Error('La disposición separaría los listones del marco: '+frame);
  for(const member of members)output.set(member.id,values[0].slice());
 }
 return output;
}

function layoutMatrices(design,layout){
 if(layout.units!=='Blender metres'||layout.mesh_changes!==false)throw new Error('Unidades o alcance de la disposición incorrectos.');
 const modules=new Map(),allParts=new Map((design.parts||[]).map(part=>[part.id,part]));
 for(const module of design.modules||[]){
  const row=layout.modules?.[module.id];if(!row)throw new Error('Módulo sin disposición: '+module.id);
  const selected=(design.parts||[]).filter(part=>part.module===module.id&&['common','G','fixed'].includes(part.variant||'common'));
  const expected=new Set(selected.map(part=>part.id));
  if(row.part_ids.length!==expected.size||row.part_ids.some(id=>!expected.has(id)))throw new Error('La disposición no contiene las piezas reales del módulo: '+module.id);
  const states={};
  for(const kind of ['exploded','floor_layout']){
   const entries=Object.entries(row[kind]?.parts||{});
   if(entries.length!==expected.size||entries.some(([id])=>!expected.has(id)))throw new Error('Disposición incompleta: '+module.id+'/'+kind);
   const matrices=new Map(entries.map(([id,value])=>[id,sourceDeltaToGltf(value.delta_matrix)]));
   states[kind]=commonFrameFloorMatrices(selected,matrices);
   if(kind==='exploded')for(const [id,value] of entries){
    const matrix=value.delta_matrix;
    for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(c!==3&&Math.abs(matrix[r][c]-(r===c?1:0))>1e-9)throw new Error('El despiece requiere desplazamientos rígidos sin giro: '+id);
   }
  }
  for(const [frame,ids] of Object.entries(row.grouped_frames||{})){
   if(ids.length!==4||ids.some(id=>allParts.get(id)?.frame_id!==frame))throw new Error('Identidad del marco incorrecta: '+frame);
  }
  modules.set(module.id,{...states,record:row});
 }
 return modules;
}

// A separate web display view: parts keep their native sizes and stay aligned
// with the datum of one isolated module. The published floor poses are intact.
const MODULE_LAYERS=[
 {id:1,title:'Apoyos fijos',text:'Patas de madera, placas y protección del piso.'},
 {id:2,title:'Bastidor en I',text:'Dos travesaños rectos y un larguero central recto.'},
 {id:3,title:'Base y lastres',text:'Base, bandejas y fijaciones interiores antes del cierre.'},
 {id:4,title:'Costillas completas',text:'Cada costilla reúne sus cuatro listones en un marco.'},
 {id:5,title:'Testeros',text:'Caras de los extremos que reciben las uniones.'},
 {id:6,title:'Uniones y seguros',text:'Garfios, receptores y seguros; G es la unión principal.'},
 {id:7,title:'Caras laterales',text:'Piel curva continua del interior y del exterior.'},
 {id:8,title:'Asiento y acabado',text:'Tapa superior y acabado Flor Morado. Verificar el interior antes de cerrar.'},
 {id:9,title:'Módulo armado',text:'Todas las piezas vuelven a su posición y altura reales.'},
];

function moduleLayer(part){
 const role=part.role||'';
 if(role.startsWith('foot'))return 1;
 if(role==='chassis')return 2;
 if(role==='base'||role.startsWith('ballast'))return 3;
 if(role==='rib')return 4;
 if(role==='end')return 5;
 if(role==='skin')return 7;
 if(role==='seat'||role==='finish')return 8;
 return 6;
}

function isolatedModuleId(design,state){
 if(state.module&&state.module!=='all'&&design.modules.some(m=>m.id===state.module))return state.module;
 const selected=design.parts.find(p=>p.id===state.selected);
 if(selected)return selected.module;
 const joint=design.joints.find(j=>j.id===state.joint);
 return joint?.a||'M09';
}

function layerOffset(part,module,percent,joints=[],guideStep=0){
 const amount=Math.max(0,Math.min(100,finite(percent)))/100;
 const layer=moduleLayer(part);
 if(guideStep===9||(guideStep&&layer<guideStep))return [0,0,0];
 const axis=module.datum_axis,normal=module.datum_normal;
 const along=distance=>axis.map(value=>value*distance);
 const side=distance=>normal.map(value=>value*distance);
 let x=0,y=0,z=0;
 if(layer===2)z=160;
 else if(layer===3)z=part.role==='base'?340:510;
 else if(layer===4)z=870;
 else if(layer===5){
  const end=/_IN(?:_|$)/.test(part.id)?-1:1;
  [x,y]=along(end*330);z=870;
 }else if(layer===6){
  const joint=joints.find(j=>j.id===part.joint);
  const end=joint?.a===module.id?1:joint?.b===module.id?-1:0;
  [x,y]=along(end*680);z=920;
 }else if(layer===7){
  [x,y]=side((part.id.includes('INTERIOR')?-1:1)*790);z=400;
 }else if(layer===8)z=part.role==='finish'?1880:1490;
 return [x*amount,y*amount,z*amount];
}

function guidePartVisible(part,step){
 return step===0||step===9||moduleLayer(part)<=step;
}

return{frameGroups,groupedExplosionOffset,ribMemberSpread,sourceDeltaToGltf,commonFrameFloorMatrices,layoutMatrices,MODULE_LAYERS,moduleLayer,isolatedModuleId,layerOffset,guidePartVisible};})();
const ModelSurface=(()=>{

// Appearance derivative only: original sampled Blender Noise + per-piece
// Generated coordinates. GLB position/index/normal/UV data and native PBR
// parameters are preserved. No renderer, browser, or network is needed here.
const WOOD_MATERIALS=new Set(['wood','plywood','skin']);
const PROGRAM='corales-native-wood-volume-v5';

function volumeShape(bytes,record){
 const dimensions=record.dimensions,columns=record.tiles_x;
 if(!(bytes instanceof Uint8Array)||!Array.isArray(dimensions)||dimensions.length!==3||
    dimensions.some(n=>!Number.isInteger(n)||n<2)||!Number.isInteger(columns)||columns<1)
  throw new Error('El volumen Noise nativo requiere bytes y dimensiones válidas.');
 const [nx,ny,nz]=dimensions;
 if(bytes.length!==nx*ny*nz||record.bytes!==bytes.length)throw new Error('Volumen Noise nativo incompleto.');
 if(record.format!=='uint8 R, x fastest; then y; then z' && !/uint8.*x.*y.*z/i.test(record.format||''))
  throw new Error('Orden de voxeles nativo desconocido.');
 return {nx,ny,nz,columns,rows:Math.ceil(nz/columns)};
}

function noiseVolumeToAtlas(bytes,record){
 const {nx,ny,nz,columns,rows}=volumeShape(bytes,record);
 const width=nx*columns,height=ny*rows,data=new Uint8Array(width*height);
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
  const start=(z*ny+y)*nx;
  data.set(bytes.subarray(start,start+nx),(Math.floor(z/columns)*ny+y)*width+(z%columns)*nx);
 }
 return {data,width,height,dimensions:[nx,ny,nz],tiles_x:columns};
}

function createNativeNoiseTexture(THREE,bytes,record){
 const atlas=noiseVolumeToAtlas(bytes,record);
 const texture=new THREE.DataTexture(atlas.data,atlas.width,atlas.height,THREE.RedFormat,THREE.UnsignedByteType);
 texture.name='Noise nativo Flor Morado · volumen Generated V5';
 texture.colorSpace=THREE.NoColorSpace;
 texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
 texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 texture.generateMipmaps=false;texture.unpackAlignment=1;texture.needsUpdate=true;
 texture.userData={source_sha256:record.sha256,dimensions:record.dimensions.slice(),tiles_x:record.tiles_x,
                   kind:'sampled_native_noise_factor',new_bake:false};
 return texture;
}

// CPU reference of the fragment sampler; texture interpolation is bilinear in
// X/Y and explicitly linear between adjacent Z slices. Values are centred at
// voxels, clamped at the boundary, with no atlas tile bleeding.
function sampleNativeNoiseCPU(bytes,record,coordinate){
 const {nx,ny,nz}=volumeShape(bytes,record);
 const p=coordinate.map((v,a)=>Math.max(0,Math.min([nx,ny,nz][a]-1,v*[nx,ny,nz][a]-.5)));
 const low=p.map(Math.floor),high=low.map((v,a)=>Math.min(v+1,[nx,ny,nz][a]-1)),fraction=p.map((v,a)=>v-low[a]);
 let value=0;
 for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
  const indices=[x,y,z],corner=indices.map((upper,a)=>upper?high[a]:low[a]);
  const weight=indices.reduce((v,upper,a)=>v*(upper?fraction[a]:1-fraction[a]),1);
  value+=bytes[(corner[2]*ny+corner[1])*nx+corner[0]]/255*weight;
 }
 return value;
}

function generatedDomain(THREE,record){
 const bounds=record.local_bounds_m,matrix=record.blender_matrix_m;
 if(!Array.isArray(bounds)||bounds.length!==2||bounds.some(v=>v.length!==3||v.some(n=>!Number.isFinite(n)))||
    !Array.isArray(matrix)||matrix.length!==4||matrix.some(row=>row.length!==4||row.some(n=>!Number.isFinite(n))))
  throw new Error('Dominio Generated nativo inválido: '+(record.id||''));
 const span=bounds[1].map((n,a)=>n-bounds[0][a]);
 if(span.some(n=>n<=1e-8))throw new Error('Dominio Generated degenerado: '+(record.id||''));
 const original=new THREE.Matrix4().set(...matrix.flat());
 if(Math.abs(original.determinant())<1e-8)throw new Error('Matriz nativa singular: '+(record.id||''));
 return {inverse:original.invert(),low:bounds[0],high:bounds[1],span,point:new THREE.Vector3()};
}

function localPoint(domain,x,y,z){
 // Exported GLTF/Three axes X,Z,-Y -> original Blender XYZ.
 return domain.point.set(x,-z,y).applyMatrix4(domain.inverse);
}

function generatedForGltfPoint(THREE,point,record){
 const domain=generatedDomain(THREE,record),local=localPoint(domain,...point);
 return [0,1,2].map(a=>(local.getComponent(a)-domain.low[a])/domain.span[a]);
}

function attachGenerated(THREE,geometry,record){
 const position=geometry.getAttribute('position');
 if(!position||position.itemSize!==3)throw new Error('La pieza carece de posición XYZ: '+record.id);
 const domain=generatedDomain(THREE,record),data=new Float32Array(position.count*3);
 let maximumExcess=0;
 for(let index=0;index<position.count;index++){
  const local=localPoint(domain,position.getX(index),position.getY(index),position.getZ(index));
  for(let axis=0;axis<3;axis++){
   const value=local.getComponent(axis),excess=Math.max(0,domain.low[axis]-value,value-domain.high[axis]);
   maximumExcess=Math.max(maximumExcess,excess);
   // Permit floating-point export rounding only, not an incorrect source box.
   if(excess>5e-6)throw new Error('Vértice fuera del dominio Generated nativo: '+record.id+' ('+excess+' m)');
   data[index*3+axis]=Math.max(0,Math.min(1,(value-domain.low[axis])/domain.span[axis]));
  }
 }
 geometry.setAttribute('_nativegenerated',new THREE.BufferAttribute(data,3));
 return maximumExcess;
}

const FRAGMENT_DECLARATIONS=`
uniform sampler2D coralesNativeWoodNoise;
uniform vec3 coralesNativeNoiseSize;
uniform float coralesNativeNoiseColumns;
uniform float coralesNativeFlor;
uniform vec2 coralesNativeRampPositions;
uniform vec3 coralesNativeRampDark;
uniform vec3 coralesNativeRampLight;
varying vec3 vCoralesNativeGenerated;
float coralesNativeLayer(sampler2D image,vec3 size,float columns,vec2 coordinate,float layer){
 vec2 pixel=clamp(coordinate*size.xy-0.5,vec2(0.0),size.xy-1.0)+0.5;
 vec2 tile=vec2(mod(layer,columns),floor(layer/columns));
 vec2 dimensions=vec2(size.x*columns,size.y*ceil(size.z/columns));
 return texture2D(image,(tile*size.xy+pixel)/dimensions).r;
}
float coralesNativeNoise(sampler2D image,vec3 size,float columns,vec3 coordinate){
 float layer=clamp(coordinate.z*size.z-0.5,0.0,size.z-1.0);
 float first=floor(layer),last=min(first+1.0,size.z-1.0);
 return mix(coralesNativeLayer(image,size,columns,coordinate.xy,first),
            coralesNativeLayer(image,size,columns,coordinate.xy,last),fract(layer));
}
`;

function materialSurface(material,record){
 const matches=record.materials.filter(row=>row.name===material.name);
 if(matches.length!==1)throw new Error('Material GLTF sin correspondencia nativa: '+record.id+' / '+material.name);
 const kind=matches[0].surface;
 if(!['flor','plywood'].includes(kind))throw new Error('Superficie nativa desconocida: '+kind);
 return kind;
}

function installMaterial(THREE,material,kind,texture,record){
 if(!material.isMeshStandardMaterial)throw new Error('La madera debe conservar su material PBR MeshStandard: '+material.name);
 if(material.userData.corales_native_surface)throw new Error('La textura de madera ya está instalada.');
 const originalCompile=material.onBeforeCompile,originalKey=material.customProgramCacheKey();
 material.customProgramCacheKey=()=>originalKey+'|'+PROGRAM+'|'+kind;
 material.onBeforeCompile=function(shader,renderer){
  originalCompile.call(this,shader,renderer);
  for(const marker of ['#include <common>','#include <begin_vertex>'])
   if(!shader.vertexShader.includes(marker))throw new Error('Shader vertex estándar incompatible: '+marker);
  for(const marker of ['#include <common>','#include <color_fragment>'])
   if(!shader.fragmentShader.includes(marker))throw new Error('Shader fragment estándar incompatible: '+marker);
  shader.uniforms.coralesNativeWoodNoise={value:texture};
  shader.uniforms.coralesNativeNoiseSize={value:new THREE.Vector3(...record.dimensions)};
  shader.uniforms.coralesNativeNoiseColumns={value:record.tiles_x};
  shader.uniforms.coralesNativeFlor={value:kind==='flor'?1:0};
  shader.uniforms.coralesNativeRampPositions={value:new THREE.Vector2(...record.ramp_positions)};
  shader.uniforms.coralesNativeRampDark={value:new THREE.Vector3(...record.ramp_dark)};
  shader.uniforms.coralesNativeRampLight={value:new THREE.Vector3(...record.ramp_light)};
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nattribute vec3 _nativegenerated;\nvarying vec3 vCoralesNativeGenerated;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvCoralesNativeGenerated=_nativegenerated;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\n'+FRAGMENT_DECLARATIONS)
   .replace('#include <color_fragment>',`#include <color_fragment>
    float coralesGrain=coralesNativeNoise(coralesNativeWoodNoise,coralesNativeNoiseSize,coralesNativeNoiseColumns,vCoralesNativeGenerated);
    float coralesRamp=clamp((coralesGrain-coralesNativeRampPositions.x)/(coralesNativeRampPositions.y-coralesNativeRampPositions.x),0.0,1.0);
    vec3 coralesFlorColour=mix(coralesNativeRampDark,coralesNativeRampLight,coralesRamp);
    // Native ramp colours are linear scene values; Noise has no colour space.
    // Plywood keeps its exported base tone, with deliberately moderate grain.
    diffuseColor.rgb=mix(diffuseColor.rgb*(0.90+0.20*coralesGrain),coralesFlorColour,coralesNativeFlor);`);
 };
 material.userData.corales_native_surface={kind,noise_sha256:record.sha256,
  source:'native_sampled_Noise_Generated',plywood_appearance_approximation:kind==='plywood',
  native_pbr_parameters_preserved:true};
 material.needsUpdate=true;
}

function applyNativeWoodSurfaces(THREE,group,partsById,native,texture,volumeRecord){
 if(!texture?.isDataTexture||!native?.parts)throw new Error('Textura o dominios Generated no preparados.');
 const ids=new Set(),byRole={},palettes={flor:0,plywood:0};
 let meshes=0,materials=0,maximumExcess=0;
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const id=mesh.userData.id||mesh.name,part=partsById.get(id);
  if(!part)throw new Error('Pieza GLTF sin ID de diseño: '+id);
  if(!WOOD_MATERIALS.has(part.material))return;
  const record=native.parts[id];
  if(!record||record.role!==part.role||record.design_material!==part.material)
   throw new Error('Madera sin dominio nativo por ID: '+id);
  maximumExcess=Math.max(maximumExcess,attachGenerated(THREE,mesh.geometry,record));
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   const kind=materialSurface(material,record);
   installMaterial(THREE,material,kind,texture,volumeRecord);palettes[kind]++;materials++;
  }
  if(!ids.has(id)){ids.add(id);byRole[part.role]=(byRole[part.role]||0)+1;}
  meshes++;
 });
 return {ids:[...ids],meshes,materials,by_role:byRole,palettes,uncovered:[],
         maximum_domain_excess_m:maximumExcess,geometry_modified:false,
         source:'native Noise volume and original per-piece Generated coordinates',
         webgl_validation:'pending'};
}

return{noiseVolumeToAtlas,createNativeNoiseTexture,sampleNativeNoiseCPU,generatedForGltfPoint,applyNativeWoodSurfaces};})();

(()=>{const {VARIANTS,isCover,isFinish,modelPath,normalizeState,moduleIds,eligibleParts,changeState,sourceToScene,explosionOffset,assemblyOffset,assemblyFor,resolvePartId,LatestRequest,partSize}=ModelState;const {createHumanGroup}=ModelHumans;const {preparePartModel,setPartHighlight}=ModelParts;

const v5MaterialOpacity=new WeakMap();
function setV5Explanation(mesh,part,active){
 const shell=['skin','seat','finish','end','base'].includes(part.role),receiver=part.role==='hook_receiver';
 for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
  if(!v5MaterialOpacity.has(material))v5MaterialOpacity.set(material,{opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
  const native=v5MaterialOpacity.get(material),show=active&&(shell||receiver);
  material.opacity=show?(receiver ? 0.38 : 0.12):native.opacity;
  material.transparent=show||native.transparent;material.depthWrite=show?false:native.depthWrite;material.needsUpdate=true;
 }
}

let v5NativeGenerated=null,v5NativeNoiseTexture=null;
async function initializeV5Surfaces(){
 const bytes=await unpackGzip(offlineAssets.native_wood.gzip);
 v5NativeGenerated=JSON.parse(new TextDecoder().decode(await unpackGzip(offlineAssets.native_generated)));
 v5NativeNoiseTexture=ModelSurface.createNativeNoiseTexture(THREE,bytes,offlineAssets.native_wood);
}
// Native meshes retain their exact world vertices. Only rigid display poses
// change for the isolated module, the guided assembly and the floor layout.
let v5FloorLayout=false,v5SeparateMembers=false,v5Display=null,v5Frames=null,v5ModuleGuideStep=0;

async function initializeV5Display(){
 const layout=JSON.parse(new TextDecoder().decode(await unpackGzip(offlineAssets.display_layout)));
 v5Frames=ModelLayout.frameGroups(design);v5Display=ModelLayout.layoutMatrices(design,layout);
}

function v5ExplosionOffset(part){
 const module=design.modules.find(item=>item.id===part.module);
 const offset=ModelLayout.layerOffset(part,module,state.explode,design.joints,v5ModuleGuideStep);
 const spread=v5SeparateMembers&&!v5ModuleGuideStep?ModelLayout.ribMemberSpread(part):[0,0,0];
 return offset.map((value,index)=>value+spread[index]*state.explode/100);
}

function v5GuidePartVisible(part){return ModelLayout.guidePartVisible(part,v5ModuleGuideStep);}

function applyV5PartPose(mesh,part,offset){
 if(v5FloorLayout&&part.module===state.module){
  const matrix=v5Display.get(state.module)?.floor_layout.get(part.id);
  if(!matrix)throw new Error('Pieza sin disposición en el suelo: '+part.id);
  mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(matrix);
 }else{
  mesh.matrixAutoUpdate=true;mesh.quaternion.identity();mesh.scale.set(1,1,1);mesh.position.copy(vec(offset));
  mesh.updateMatrix();
 }
}

function syncV5DisplayControls(){
 const layered=!v5FloorLayout&&!v5ModuleGuideStep&&state.explode>0;
 $('layeredModule').textContent=layered?'Volver al módulo montado':'Despiece por capas';
 $('layeredModule').setAttribute('aria-pressed',String(layered));
 $('floorLayout').textContent=v5FloorLayout?'Volver al módulo montado':'Piezas en el suelo';
 $('floorLayout').setAttribute('aria-pressed',String(v5FloorLayout));
 $('separateMembers').checked=v5SeparateMembers;$('separateMembers').disabled=v5FloorLayout||!!v5ModuleGuideStep;
 $('explode').disabled=v5FloorLayout||!!v5ModuleGuideStep;$('humans').disabled=v5FloorLayout||!!v5ModuleGuideStep;
 $('floorFamilies').hidden=!v5FloorLayout;
 if(v5FloorLayout){
  const list=$('floorFamilyList');list.replaceChildren();
  for(const group of v5Display.get(state.module).record.floor_layout.groups){
   const item=document.createElement('li');item.textContent=group.group_id+' · '+group.family_label+(group.part_ids.length===4?' · marco completo de 4 listones':'');list.append(item);
  }
 }
 const step=ModelLayout.MODULE_LAYERS.find(item=>item.id===v5ModuleGuideStep);
 $('moduleGuideToggle').textContent=step?'Volver al módulo montado':'Mostrar armado del módulo';
 $('moduleGuideToggle').setAttribute('aria-pressed',String(!!step));
 $('moduleGuideCount').textContent=step?`${step.id} / ${ModelLayout.MODULE_LAYERS.length}`:'';
 $('moduleGuideTitle').textContent=step?`${state.module} · ${step.title}`:'Un módulo, paso a paso';
 $('moduleGuideText').textContent=step?step.text:'Muestra una familia de piezas a la vez y comprueba su lugar en el conjunto.';
 $('moduleGuidePrevious').disabled=!step||step.id===1;
 $('moduleGuideNext').disabled=!step||step.id===ModelLayout.MODULE_LAYERS.length;
}

function v5Isolate(changes={},view='perspective'){
 const module=ModelLayout.isolatedModuleId(design,state);
 patch({feet:'fixed',module,joint:'',assembly:false,structure:false,covers:false,humans:false,selected:'',view,...changes},{frame:true});
}

function toggleV5LayeredModule(){
 if(!design||busy||!v5Display)return;
 const active=!v5FloorLayout&&!v5ModuleGuideStep&&state.explode>0;
 v5FloorLayout=false;v5ModuleGuideStep=0;v5SeparateMembers=false;
 v5Isolate({explode:active?0:100});
}

function v5SetExplosion(value){
 if(!design||busy||!v5Display)return;
 const percent=Math.max(0,Math.min(100,Number(value)||0));
 v5FloorLayout=false;v5ModuleGuideStep=0;
 if(percent>0){
  const module=ModelLayout.isolatedModuleId(design,state),changed=state.module!==module||state.assembly||!!state.joint;
  patch({module,joint:'',assembly:false,structure:false,covers:false,humans:false,selected:'',explode:percent},{frame:changed});
 }else{patch({explode:0});}
}

function toggleV5ModuleGuide(){
 if(!design||busy||!v5Display)return;
 v5ModuleGuideStep=v5ModuleGuideStep?0:1;v5FloorLayout=false;v5SeparateMembers=false;
 if(v5ModuleGuideStep)CoralUI.openModelTab('moduleGuideDetails');
 v5Isolate({explode:v5ModuleGuideStep?100:0});
}

function setV5ModuleGuideStep(step){
 if(!design||busy||!v5ModuleGuideStep)return;
 v5ModuleGuideStep=Math.max(1,Math.min(ModelLayout.MODULE_LAYERS.length,step));
 patch({selected:'',explode:v5ModuleGuideStep===9?0:100},{frame:true});
}

function toggleV5Floor(){
 if(!design||busy||!v5Display)return;
 v5FloorLayout=!v5FloorLayout;v5ModuleGuideStep=0;v5SeparateMembers=false;
 if(v5FloorLayout){
  v5Isolate({variant:'G',explode:0},'top');
 }else{apply();fit(state.view);}
}

function toggleV5Interface(){CoralUI.toggleInterface();requestAnimationFrame(resize);}

function bindV5Display(){
 $('layeredModule').addEventListener('click',toggleV5LayeredModule);
 $('floorLayout').addEventListener('click',toggleV5Floor);
 $('moduleGuideToggle').addEventListener('click',toggleV5ModuleGuide);
 $('moduleGuidePrevious').addEventListener('click',()=>setV5ModuleGuideStep(v5ModuleGuideStep-1));
 $('moduleGuideNext').addEventListener('click',()=>setV5ModuleGuideStep(v5ModuleGuideStep+1));
 $('separateMembers').addEventListener('change',()=>{v5SeparateMembers=$('separateMembers').checked;apply();fit(state.view);});

}
const $=id=>document.getElementById(id);
const viewport=$('viewport'),canvas=$('scene');
const request=new LatestRequest(),loader=new GLTFLoader();
const errors=[];
const fmt=(v,places=1)=>Number(v).toLocaleString('es-CO',{maximumFractionDigits:places});
const vec=p=>new THREE.Vector3(...sourceToScene(p));
const scene=new THREE.Scene();scene.background=new THREE.Color('#f4f0e7');
const perspective=new THREE.PerspectiveCamera(38,1,.01,500);
const orthographic=new THREE.OrthographicCamera(-5,5,5,-5,.01,500);
let camera=perspective,renderer,controls,design,partsById,model,humans,state,loadedKey='';
let meshIndex=new Map(),visibleParts=[],busy=false,renderScheduled=false,orthoSpan=10;
let pointerStart=null,humanKey='',previousExploration=null,previousViewportAspect=null;
const selectionPointers=new Set();let multipleSelectionPointers=false;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();

function status(text){if($('status').textContent!==text)$('status').textContent=text;}
function message(title,text,error=false){
  $('modelMessage').hidden=false;$('modelMessage').classList.toggle('has-error',error);
  $('messageTitle').textContent=title;$('messageText').textContent=text;
  $('errorActions').hidden=!error;$('retry').hidden=false;
  status(title);
}
function reportError(title,text,error){if(error)errors.push(String(error));message(title,text,true);}

function dispose(object,disposeTextures=true){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  object?.traverse(node=>{
    if(node.geometry)geometries.add(node.geometry);
    for(const material of (Array.isArray(node.material)?node.material:[node.material]).filter(Boolean)){
      materials.add(material);
      if(disposeTextures)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
}

function render(){
  if(!renderer||renderScheduled)return;
  renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;renderer.render(scene,camera);});
}

function resize(){
  if(!renderer)return;
  const width=Math.max(1,viewport.clientWidth),height=Math.max(1,viewport.clientHeight);
  const aspect=width/height;
  if(model&&controls&&previousViewportAspect!==null&&Math.abs(aspect-previousViewportAspect)>.001){
    const scale=Math.min(1,previousViewportAspect)/Math.min(1,aspect);
    if(camera.isPerspectiveCamera)camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
    else orthoSpan*=scale;
  }
  previousViewportAspect=aspect;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setSize(width,height,false);perspective.aspect=aspect;perspective.updateProjectionMatrix();
  orthographic.left=-orthoSpan*width/height/2;orthographic.right=orthoSpan*width/height/2;
  orthographic.top=orthoSpan/2;orthographic.bottom=-orthoSpan/2;orthographic.updateProjectionMatrix();render();
}

function visibleBounds(){
  const bounds=new THREE.Box3();
  model?.updateMatrixWorld(true);
  for(const list of meshIndex.values())for(const mesh of list)if(mesh.visible)bounds.union(new THREE.Box3().setFromObject(mesh));
  if(humans?.visible)for(const figure of humans.children)if(figure.visible)bounds.union(new THREE.Box3().setFromObject(figure));
  return bounds;
}

function fit(view=state?.view||'perspective'){
  if(!controls||!model||busy)return;
  let bounds=visibleBounds();if(bounds.isEmpty())return;
  const joint=design.joints.find(j=>j.id===state.joint);
  if(view==='joint'&&joint){
    const connectorIds=new Set(joint.variants?.[state.variant]?.part_ids||[]),detail=new THREE.Box3();
    for(const [id,list] of meshIndex)if(connectorIds.has(id)||id.startsWith(`${joint.id}_${state.variant}_`))for(const mesh of list)if(mesh.visible)detail.union(new THREE.Box3().setFromObject(mesh));
    if(!detail.isEmpty()){detail.expandByScalar(.14);bounds=detail;}
  }
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const radius=Math.max(.12,size.length()/2),aspect=Math.max(.1,viewport.clientWidth/Math.max(1,viewport.clientHeight));
  const module=design.modules.find(m=>m.id===(joint?.a||state.module));
  const angle=module?.angle_rad||0;
  const tangent=vec([Math.cos(angle)*1000,Math.sin(angle)*1000,0]);
  const normal=vec([-Math.sin(angle)*1000,Math.cos(angle)*1000,0]);
  let direction=new THREE.Vector3(1,.85,1.25),up=new THREE.Vector3(0,1,0);
  camera=view==='perspective'?perspective:orthographic;
  if(view==='top'){direction.set(0,1,.00001);up.set(0,0,-1);}
  if(view==='front')direction.copy(normal);
  if(view==='side')direction.copy(tangent);
  if(view==='joint'){direction.copy(normal).multiplyScalar(-1).add(new THREE.Vector3(0,.6,0));}
  camera.up.copy(up);camera.zoom=1;
  const distance=camera.isPerspectiveCamera?radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))/Math.min(1,aspect)*1.2:Math.max(8,radius*2);
  camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
  orthoSpan=radius*2.3/Math.min(1,aspect);
  controls.object=camera;controls.target.copy(center);resize();controls.update();render();
}

function selectPiece(id,open=false){
  state=changeState(design,state,{selected:id});apply();
  if(open)CoralUI.openModelTab('pieceDetails','partInfo');
  if(state.selected)status(`Pieza ${state.selected} · ${partsById.get(state.selected)?.label||'Selección'}`);
}

function syncControls(){
  document.querySelector(`input[name="variant"][value="${state.variant}"]`).checked=true;
  for(const id of ['feet','module','joint','explode','humanFacing','humanDensity'])$(id).value=state[id];
  for(const id of ['structure','covers','humans'])$(id).checked=state[id];
  $('explodeValue').value=`${fmt(state.explode,0)} %`;
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-pressed',String(button.dataset.view===state.view));
  $('glbLink').href=offlineModelURLs.get(modelPath(state))||'#';$('glbLink').download=modelPath(state);syncV5DisplayControls();
}

function updateHumans(){
  $('humanFacingField').hidden=!state.humans;
  $('humanDensityField').hidden=!state.humans;
  if(!state.humans){if(humans)humans.visible=false;$('humanSummary').hidden=true;return;}
  const key=JSON.stringify([state.module,state.joint,state.explode,state.assembly,state.humanFacing,state.humanDensity]);
  if(!humans||key!==humanKey){
    if(humans)scene.remove(humans);
    const double=state.humanDensity==='double';
    humans=createHumanGroup(design,{seatedMale:double?17:8,seatedFemale:double?17:8,seatedChild:double?0:1,seatedPerModule:double?2:1,standingMale:0,standingFemale:0,standingChild:0,childCompanion:false,peopleFacing:state.humanFacing,visible:true});
    scene.add(humans);humanKey=key;
  }
  const ids=new Set(visibleParts.map(p=>p.module));
  for(const figure of humans.children)figure.visible=ids.has(figure.userData.person?.module)&&state.explode===0&&!state.assembly;
  humans.visible=true;
  const shown=humans.children.filter(h=>h.visible),count=shown.length,summary=humans.userData.peopleSummary;
  const inside=shown.filter(h=>h.userData.person.facing_side==='inside').length,outside=shown.filter(h=>h.userData.person.facing_side==='outside').length;
  $('humanSummary').hidden=false;
  const heights=state.humanDensity==='double'?'1,75 / 1,63':'1,75 / 1,63 / 1,10';
  $('humanSummary').textContent=count?`${count} referencias sentadas: ${inside} hacia dentro y ${outside} hacia fuera. Alturas ilustrativas ${heights} m. Ocupación espacial ilustrativa; no acredita capacidad de carga, aforo ni accesibilidad.${shown.some(figure=>figure.userData.person.kind==='child')?' La figura infantil conserva los pies colgantes.':''}${summary.warnings.length?' Algunas figuras se omitieron al no encontrar una posición libre.':''}`:'La escala humana se muestra con el banco montado, sin despiece ni secuencia.';
}

function updatePieceMenu(){
  const query=$('search').value.trim().toLocaleLowerCase('es');
  const list=visibleParts.filter(p=>`${p.id} ${p.label||''} ${p.role} ${p.material}`.toLocaleLowerCase('es').includes(query));
  $('pieceSelect').replaceChildren(new Option(list.length?'Selecciona una pieza':'No hay coincidencias',''));
  if(state.selected&&!list.some(p=>p.id===state.selected)){
    const part=partsById.get(state.selected);$('pieceSelect').add(new Option(`${part.id} · ${part.label||part.role}`,part.id));
  }
  const fragment=document.createDocumentFragment();
  for(const part of list)fragment.append(new Option(`${part.id} · ${part.label||part.role}`,part.id));
  $('pieceSelect').append(fragment);$('pieceSelect').value=state.selected;
  $('partCount').textContent=`${fmt(list.length,0)} coincidencias · ${fmt(visibleParts.length,0)} piezas de la vista actual`;
}

function updatePartInfo(){
  const part=partsById.get(state.selected);$('partInfo').replaceChildren();$('clearSelection').hidden=!part;
  if(!part){const paragraph=document.createElement('p');paragraph.textContent='Haz clic en el modelo o elige una pieza en la lista. La ficha muestra el mismo ID que los planos.';$('partInfo').append(paragraph);return;}
  const heading=document.createElement('h3');heading.textContent=part.label||part.role;
  const id=document.createElement('p');id.textContent=part.id;
  const data=document.createElement('dl');data.className='piece-data';
  const dimensions=partSize(part),values=[['Módulo',part.module],['Material',part.material||'Consultar atlas'],['Alternativa',part.variant==='common'?'Común a T / R / G':part.variant==='fixed'?'Apoyo fijo':part.variant]];
  if(dimensions.length)values.push(['Cota nominal',`${dimensions.map(v=>fmt(v)).join(' × ')} mm`]);
  if(Number.isFinite(part.mass_kg))values.push(['Masa estimada',`${fmt(part.mass_kg,2)} kg`]);
  for(const [label,value] of values){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);data.append(row);}
  $('partInfo').append(heading,id,data);
}

function updateAssembly(){
  const assembly=assemblyFor(design,state.variant),index=Math.min(state.step,assembly.steps.length-1);
  state.step=Math.max(0,index);const step=assembly.steps[state.step];
  $('variantDescription').textContent=assembly.summary;$('assemblySummary').textContent=assembly.summary;
  const joint=design.joints.find(j=>j.id===state.joint);
  $('assemblyContext').textContent=joint?`Encuentro ${joint.id} · ${joint.a} / ${joint.b}. Usa Ver encuentro para elegir otra junta.`:'Al iniciar se muestra el encuentro J08; puedes elegir otro en Ver encuentro.';
  $('assemblyToggle').textContent=state.assembly?'Volver a la exploración libre':'Mostrar secuencia en el modelo';
  $('assemblyToggle').setAttribute('aria-pressed',String(state.assembly));
  $('stepCount').textContent=`${state.step+1} / ${assembly.steps.length}`;
  $('stepTitle').textContent=step.title;$('stepText').textContent=step.text;
  $('stepCheck').textContent=step.check||'Comprobar apoyo, asiento enrasado y retención. El ajuste propuesto requiere una probeta y una pareja de prototipos.';
  $('previous').disabled=state.step===0;$('next').disabled=state.step>=assembly.steps.length-1;
  $('unionImage').href=offlineAssets.union_images[state.variant];$('unionImage').textContent=`Ver imagen de la unión ${state.variant}`;
  $('stepList').replaceChildren();
  assembly.steps.forEach((item,i)=>{const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=item.title;if(i===state.step)button.setAttribute('aria-current','step');button.addEventListener('click',()=>setAssemblyStep(i));li.append(button);$('stepList').append(li);});
}

function apply(rebuildList=true){
  if(!design)return;
  visibleParts=eligibleParts(design,state).filter(v5GuidePartVisible);const visible=new Set(visibleParts.map(p=>p.id));
  const joint=design.joints.find(j=>j.id===state.joint),assembly=assemblyFor(design,state.variant);
  const phase=assembly.steps[Math.min(state.step,assembly.steps.length-1)]?.phase;
  const phaseNumber={present:0,insert:1,seated:2}[phase]??Math.min(state.step,2);
  for(const [id,list] of meshIndex){
    const part=partsById.get(id);let offset=v5ExplosionOffset(part);
    if(state.assembly){const motion=assemblyOffset(part,joint,state.variant,phaseNumber,assembly);offset=offset.map((n,i)=>n+motion[i]);}
    for(const mesh of list){
      mesh.visible=visible.has(id);applyV5PartPose(mesh,part,offset);
      setPartHighlight(mesh,id===state.selected);setV5Explanation(mesh,part,state.assembly&&state.joint&&state.variant==='G'&&state.step<assembly.steps.length-1);
    }
  }
  model?.updateMatrixWorld(true);syncControls();updateAssembly();updateHumans();updatePartInfo();if(rebuildList)updatePieceMenu();
  if(!busy&&loadedKey)status(`${state.variant} · ${'patas fijas'} · ${fmt([...meshIndex.keys()].filter(id=>visible.has(id)).length,0)} piezas visibles`);
  render();
}

function prepareModel(gltf){
  const {group,index,unknown}=preparePartModel(gltf.scene,partsById);
  ModelSurface.applyNativeWoodSurfaces(THREE,group,partsById,v5NativeGenerated,v5NativeNoiseTexture,offlineAssets.native_wood);
  dispose(gltf.scene,false);
  if(!index.size){dispose(group);throw new Error('El GLB no contiene piezas con ID reconocido.');}
  if(unknown)errors.push(`${unknown} mallas del GLB sin ficha reconocida.`);
  return {group,index,unknown};
}

async function loadModel(){
  if(!renderer||!design)return;
  busy=true;if(model)model.visible=false;
  const path=modelPath(state),key=`${state.variant}_${state.feet}`;
  message(`Cargando unión ${state.variant}…`,'Preparando el modelo local y las fichas de sus piezas.');render();
  const result=await request.run(()=>loadOfflineModel(path,loader));
  if(!result.current){if(result.value)dispose(result.value.scene);return;}
  busy=false;
  if(result.error){loadedKey='';reportError('No se pudo cargar el modelo 3D.','Cierra y vuelve a abrir este HTML V5. Conserva juntas las carpetas html, datos y modelos. Puedes seguir consultando los documentos y los renders.',result.error);return;}
  try{
    const next=prepareModel(result.value);if(model){scene.remove(model);dispose(model);}model=next.group;meshIndex=next.index;
    model.visible=true;scene.add(model);loadedKey=key;CORAL_R1.ready();$('modelMessage').hidden=true;
    apply();fit(state.view);
    if(next.unknown)status(`${key} · ${next.unknown} mallas sin ficha; revisar coherencia de la entrega`);
  }catch(error){loadedKey='';dispose(result.value.scene);reportError('Modelo y fichas no coinciden.','Conserva los modelos y los datos de la misma versión V5. Consulta el manual y vuelve a abrir este HTML V5.',error);}
}

function patch(changes,{frame=false}={}){
  if(changes.variant&&changes.variant!==state.variant)v5ModuleGuideStep=0;
  if(changes.joint||changes.assembly===true){v5ModuleGuideStep=0;changes={...changes,explode:0};}
  if(changes.module==='all'&&(v5ModuleGuideStep||state.explode>0)){v5ModuleGuideStep=0;changes={...changes,explode:0};}
  if(v5FloorLayout){if((changes.variant&&changes.variant!=='G')||changes.joint||changes.assembly)v5FloorLayout=false;else if(changes.module==='all')changes={...changes,module:'M09'};}
  const previousPath=modelPath(state);state=changeState(design,state,changes);
  if(modelPath(state)!==previousPath){apply();loadModel();return;}
  apply();if(frame)fit(state.view);
}

function startAssembly(){
  v5FloorLayout=false;v5ModuleGuideStep=0;
  if(!state.assembly){
    previousExploration={...state};
    const joint=state.joint||design.joints.find(j=>j.id==='J08')?.id||design.joints[Math.floor(design.joints.length/2)]?.id;
    state=changeState(design,state,{assembly:true,joint,module:'all',explode:0,covers:true,structure:true,humans:false,view:'joint',selected:''});
  }else{
    state=normalizeState(design,{...previousExploration,variant:state.variant,feet:state.feet,assembly:false});previousExploration=null;
  }
  apply();fit(state.view);
}

function setAssemblyStep(index){
  if(!state.assembly)startAssembly();
  state=changeState(design,state,{step:index});apply();
}

function keyboard(event){
  if(!controls||busy||!model)return;
  const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Home','Escape'].includes(key))return;
  event.preventDefault();
  if(key==='Home'){fit('perspective');state.view='perspective';syncControls();return;}
  if(key==='Escape'){selectPiece('');return;}
  const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
  if(key==='ArrowLeft')spherical.theta+=.08;if(key==='ArrowRight')spherical.theta-=.08;
  if(key==='ArrowUp')spherical.phi=Math.max(.01,spherical.phi-.08);if(key==='ArrowDown')spherical.phi=Math.min(Math.PI-.01,spherical.phi+.08);
  if(['+','=','-','_'].includes(key)){
    const factor=['+','='].includes(key)?.9:1.1;
    if(camera.isOrthographicCamera){camera.zoom=Math.max(.1,Math.min(30,camera.zoom/factor));camera.updateProjectionMatrix();}
    else spherical.radius=Math.max(.025,Math.min(150,spherical.radius*factor));
  }
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();render();
}

function bind(){
  bindV5Display();
  $('viewForm').addEventListener('submit',event=>event.preventDefault());
  for(const input of document.querySelectorAll('input[name="variant"]'))input.addEventListener('change',()=>patch({variant:input.value}));
  for(const id of ['feet','module','joint'])$(id).addEventListener('change',()=>patch({[id]:$(id).value},{frame:id!=='feet'}));
  for(const id of ['humanFacing','humanDensity'])$(id).addEventListener('change',()=>patch({[id]:$(id).value}));
  for(const id of ['structure','covers','humans'])$(id).addEventListener('change',()=>patch({[id]:$(id).checked}));
  $('explode').addEventListener('input',()=>v5SetExplosion($('explode').value));
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{
    const changes={view:button.dataset.view};
    if(changes.view==='joint'){changes.joint=state.joint||design.joints.find(j=>j.id==='J08')?.id||design.joints[0]?.id;changes.structure=true;changes.covers=true;changes.humans=false;}
    patch(changes,{frame:true});
  });
  $('frame').addEventListener('click',()=>fit(state.view));
  $('reset').addEventListener('click',()=>{v5FloorLayout=false;v5SeparateMembers=false;v5ModuleGuideStep=0;const before=modelPath(state);state=normalizeState(design);previousExploration=null;$('search').value='';apply();if(before!==modelPath(state))loadModel();else fit('perspective');});
  $('assemblyToggle').addEventListener('click',startAssembly);
  $('previous').addEventListener('click',()=>setAssemblyStep(Math.max(0,state.step-1)));
  $('next').addEventListener('click',()=>setAssemblyStep(state.step+1));
  $('search').addEventListener('input',updatePieceMenu);
  $('pieceSelect').addEventListener('change',()=>selectPiece($('pieceSelect').value));
  $('clearSelection').addEventListener('click',()=>selectPiece(''));
  $('retry').addEventListener('click',()=>design?loadModel():initialize());
  canvas.addEventListener('keydown',keyboard);
  canvas.addEventListener('pointerdown',event=>{
    selectionPointers.add(event.pointerId);
    if(selectionPointers.size>1){multipleSelectionPointers=true;pointerStart=null;}
    else pointerStart=[event.clientX,event.clientY,event.pointerId];
  });
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{
    selectionPointers.delete(event.pointerId);pointerStart=null;
    if(!selectionPointers.size)multipleSelectionPointers=false;
  });
  canvas.addEventListener('pointerup',event=>{
    selectionPointers.delete(event.pointerId);
    if(multipleSelectionPointers){if(!selectionPointers.size)multipleSelectionPointers=false;pointerStart=null;return;}
    if(!pointerStart||pointerStart[2]!==event.pointerId)return;
    const travel=Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1]);pointerStart=null;
    if(travel>5||busy||!model)return;
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const meshes=[...meshIndex.values()].flat().filter(mesh=>mesh.visible);
    const hit=raycaster.intersectObjects(meshes,false)[0];if(hit)selectPiece(hit.object.userData.id,true);else selectPiece('');
  });
}

async function initialize(){
  message('Preparando datos…','Los recursos de esta entrega funcionan sin internet.');
  try{
    await CORAL_R1.afterPaint();
    const data=JSON.parse(new TextDecoder().decode(await unpackGzip(offlineAssets.design)));
    if(data.modules?.length!==17||data.joints?.length!==16||!data.parts?.length)throw new Error('La fuente debe contener 17 módulos, 16 juntas y sus piezas.');
    design=data;partsById=new Map(design.parts.map(p=>[p.id,p]));state=normalizeState(design);await initializeV5Display();await initializeV5Surfaces();
    $('module').replaceChildren(new Option('Conjunto completo','all'));for(const module of design.modules)$('module').add(new Option(`${module.id} · ${module.label||'Módulo'}`,module.id));
    $('joint').replaceChildren(new Option('Ninguno',''));for(const joint of design.joints)$('joint').add(new Option(`${joint.id} · ${joint.a} / ${joint.b}`,joint.id));
    document.querySelectorAll('#controls input:not([data-ui]),#controls select:not([data-ui]),#controls button:not([data-ui])').forEach(control=>{control.disabled=false;});
    apply();await loadModel();
  }catch(error){reportError('No se pudieron leer los datos del banco.','Conserva la carpeta completa y vuelve a intentarlo desde el inicio.',error);}
}

try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  camera.position.set(7,6,9);controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.minDistance=.025;controls.maxDistance=150;controls.minZoom=.1;controls.maxZoom=30;
  controls.addEventListener('change',render);
  scene.add(new THREE.HemisphereLight('#fff7e8','#716355',2.4));
  for(const [position,power] of [[[3,10,5],2.8],[[-6,5,-5],1.5]]){const light=new THREE.DirectionalLight('#ffffff',power);light.position.set(...position);scene.add(light);}
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();reportError('Se interrumpió la vista 3D.','La conexión con WebGL se perdió. Cierra y vuelve a abrir esta vista.');$('retry').hidden=true;});
  bind();new ResizeObserver(resize).observe(viewport);resize();initialize();
}catch(error){reportError('WebGL no está disponible.','El modelo 3D necesita aceleración gráfica compatible. Puedes volver al inicio para elegir otra vista.',error);$('retry').hidden=true;}

window.CORALES={getState:()=>({...state,loaded:loadedKey,busy,floorLayout:v5FloorLayout,moduleGuideStep:v5ModuleGuideStep,separateMembers:v5SeparateMembers,uiHidden:document.body.classList.contains('v5-ui-hidden'),visiblePieces:visibleParts.length,meshIds:meshIndex.size,errors:[...errors],three:THREE.REVISION})};

})();
