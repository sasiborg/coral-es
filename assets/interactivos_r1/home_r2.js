(() => {
  'use strict';
  const cards=[...document.querySelectorAll('.pdf-card')];
  const grid=document.querySelector('.document-grid'),previous=document.querySelector('#documentsPrevious'),next=document.querySelector('#documentsNext'),count=document.querySelector('#documentsCount'),pager=document.querySelector('.document-pages');
  let page=0,size=6;
  function show() {
    const total=Math.ceil(cards.length/size);page=Math.max(0,Math.min(page,total-1));
    cards.forEach((card,index)=>{card.hidden=index<page*size||index>=(page+1)*size;});
    previous.disabled=page===0;next.disabled=page===total-1;
    pager.hidden=total<=1;
    count.value=`${page*size+1}–${Math.min(cards.length,(page+1)*size)} / ${cards.length}`;
  }
  function resize() {
    const first=page*size;
    size=innerWidth<=620?2:innerWidth<=1000?3:6;
    if(innerHeight<=720&&innerWidth>620)size=1;
    if(matchMedia('(max-width:620px), (max-width:1000px) and (pointer:coarse) and (max-height:550px)').matches)size=cards.length;
    page=Math.floor(first/size);show();
  }
  previous.addEventListener('click',()=>{page--;show();});next.addEventListener('click',()=>{page++;show();});
  new ResizeObserver(resize).observe(grid);window.addEventListener('resize',resize);resize();

  const dialog=document.querySelector('#videoDialog'),player=document.querySelector('#videoPlayer');
  if(!dialog||typeof dialog.showModal!=='function')return;
  const title=document.querySelector('#videoDialogTitle'),meta=document.querySelector('#videoMeta'),file=document.querySelector('#videoFile'),notice=document.querySelector('#videoNotice'),fullscreen=document.querySelector('#videoFullscreen');
  let opener=null;
  function notify(text){notice.textContent=text;notice.hidden=false;}
  document.querySelectorAll('.video-card').forEach(card=>{
    card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-controls','videoDialog');
    card.addEventListener('click',event=>{
      if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();opener=card;notice.hidden=true;
      title.textContent=card.querySelector('h3').textContent;meta.textContent=card.querySelector('.video-copy p').textContent;
      file.href=card.href;player.poster=card.querySelector('img').src;player.src=card.href;
      player.setAttribute('aria-label',`Reproductor: ${title.textContent}`);
      fullscreen.hidden=!(document.fullscreenEnabled&&player.requestFullscreen)&&typeof player.webkitEnterFullscreen!=='function';
      document.documentElement.classList.add('video-open');dialog.showModal();player.load();
      player.play().catch(error=>{if(dialog.open&&error.name!=='AbortError')notify('Pulsa reproducir en el video para comenzar.');});
    });
  });
  document.querySelector('#videoClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{
    player.pause();player.removeAttribute('src');player.load();
    document.documentElement.classList.remove('video-open');notice.hidden=true;
    opener?.focus({preventScroll:true});opener=null;
  });
  player.addEventListener('playing',()=>{notice.hidden=true;});
  player.addEventListener('error',()=>{if(dialog.open)notify('No se pudo reproducir este video. Puedes usar «Abrir archivo» para verlo directamente.');});
  fullscreen.addEventListener('click',async()=>{
    try{
      if(document.fullscreenEnabled&&player.requestFullscreen)await player.requestFullscreen();
      else if(typeof player.webkitEnterFullscreen==='function')player.webkitEnterFullscreen();
    }catch{notify('Puedes ampliar el video con el control de pantalla completa del reproductor.');}
  });
})();
