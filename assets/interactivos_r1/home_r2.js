(() => {
  'use strict';
  const cards=[...document.querySelectorAll('.pdf-card')];
  const grid=document.querySelector('.document-grid'),previous=document.querySelector('#documentsPrevious'),next=document.querySelector('#documentsNext'),count=document.querySelector('#documentsCount');
  let page=0,size=6;
  function show() {
    const total=Math.ceil(cards.length/size);page=Math.max(0,Math.min(page,total-1));
    cards.forEach((card,index)=>{card.hidden=index<page*size||index>=(page+1)*size;});
    previous.disabled=page===0;next.disabled=page===total-1;
    count.value=`${page*size+1}–${Math.min(cards.length,(page+1)*size)} / ${cards.length}`;
  }
  function resize() {
    const first=page*size;
    size=innerWidth<=620?2:innerWidth<=1000?3:6;
    if(innerHeight<=550&&innerWidth>620)size=1;
    if(matchMedia('(max-width:620px), (max-width:1000px) and (pointer:coarse) and (max-height:550px)').matches)size=cards.length;
    page=Math.floor(first/size);show();
  }
  previous.addEventListener('click',()=>{page--;show();});next.addEventListener('click',()=>{page++;show();});
  new ResizeObserver(resize).observe(grid);window.addEventListener('resize',resize);resize();
})();
