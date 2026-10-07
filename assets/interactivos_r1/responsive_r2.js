/* Navegación de interfaz sin desplazar la página. No modifica geometrías ni materiales. */
(() => {
  'use strict';
  const compact = matchMedia('(max-width:1000px), (max-height:600px)');
  const model = document.body.classList.contains('model-view');
  const canvas = document.querySelector(model ? '#scene' : '#vista');
  const toggle = document.querySelector(model ? '#hideInterface' : '#interfaz');
  const nav = document.querySelector(model ? '#controls' : '.viewer-nav');
  const tools = document.querySelector('#toolsToggle');
  const help = document.querySelector('#instrucciones');
  const person = document.querySelector('#persona');
  const hiddenClass = model ? 'v5-ui-hidden' : 'clean-view';
  let clean = false;
  function closePanels() {
    if(help){help.hidden=true;document.querySelector('#ayuda')?.setAttribute('aria-expanded','false');}
    if(person){person.hidden=true;document.querySelector('#ajustesPersona')?.setAttribute('aria-expanded','false');}
  }
  function setTools(open, focus = false) {
    nav.hidden = !open;
    if(model)document.body.classList.toggle('controls-closed',!open);
    tools.setAttribute('aria-expanded', String(open));
    if(open)closePanels();
    if (focus) (open ? nav.querySelector('select,button') : tools)?.focus({preventScroll:true});
  }
  function toggleInterface() {
    clean = !clean;
    document.body.classList.toggle(hiddenClass, clean);
    toggle.setAttribute('aria-pressed', String(clean));
    toggle.setAttribute('aria-label', (clean ? 'Mostrar' : 'Ocultar') + ' interfaz (H)');
    toggle.title = toggle.getAttribute('aria-label');
    toggle.querySelector('span').textContent = clean ? 'Mostrar interfaz' : 'Ocultar interfaz';
    if(clean){closePanels();canvas.focus({preventScroll:true});}
    else if(compact.matches)setTools(false);
    else setTools(true);
    window.dispatchEvent(new CustomEvent('coral-interfacechange', {detail:{hidden:clean}}));
    window.dispatchEvent(new Event('resize'));
  }
  toggle.addEventListener('click', toggleInterface);
  tools.addEventListener('click', () => setTools(nav.hidden, true));
  document.addEventListener('keydown', event => {
    if(event.isComposing || event.ctrlKey || event.altKey || event.metaKey)return;
    if(event.code==='KeyH'&&!event.repeat&&!event.target.closest('input,select,textarea,[contenteditable]')){event.preventDefault();toggleInterface();}
    if(event.code==='Escape') {
      if(help&&!help.hidden){help.hidden=true;document.querySelector('#ayuda')?.setAttribute('aria-expanded','false');tools.focus({preventScroll:true});}
      if(person&&!person.hidden){person.hidden=true;document.querySelector('#ajustesPersona')?.setAttribute('aria-expanded','false');tools.focus({preventScroll:true});}
      if(compact.matches&&!nav.hidden)setTools(false,true);
    }
  });
  for(const element of [toggle,tools,nav,help,person,document.querySelector('#movil')].filter(Boolean)) {
    element.addEventListener('pointerdown',event=>event.stopPropagation());
  }
  function adapt() {if(!clean)setTools(!compact.matches);}
  compact.addEventListener('change', adapt);
  adapt();
  if(help) {
    help.hidden=true;
    document.querySelector('#ayuda').setAttribute('aria-expanded','false');
    document.querySelector('#ayuda').addEventListener('click',event=>{
      event.stopImmediatePropagation();
      const open=help.hidden;closePanels();
      setTools(false);
      help.hidden=!open;
      event.currentTarget.setAttribute('aria-expanded',String(open));
      helpPager?.refresh();
    },true);
  }
  if(person) {
    person.hidden=true;
    document.querySelector('#ajustesPersona').addEventListener('click',event=>{
      const open=person.hidden;closePanels();setTools(false);person.hidden=!open;
      event.currentTarget.setAttribute('aria-expanded',String(open));
    });
    person.querySelector('.panel-close').addEventListener('click',()=>{person.hidden=true;tools.focus({preventScroll:true});document.querySelector('#ajustesPersona').setAttribute('aria-expanded','false');});
  }
  // Unidades semánticas: etiquetas y campos viajan juntos; las fichas y listas se dividen por filas.
  class Pager {
    constructor(host,body) {
      this.host=host;this.body=body;this.index=0;this.pages=[];
      this.footer=document.createElement('div');this.footer.className='panel-pages';
      this.footer.innerHTML='<button type="button" data-ui="page" aria-label="Página anterior de controles">Anterior</button><output aria-live="polite"></output><button type="button" data-ui="page" aria-label="Página siguiente de controles">Siguiente</button>';
      host.append(this.footer);[this.prev,this.next]=this.footer.querySelectorAll('button');this.count=this.footer.querySelector('output');
      this.prev.addEventListener('click',()=>this.show(this.index-1));this.next.addEventListener('click',()=>this.show(this.index+1));
      this.observer=new MutationObserver(()=>this.schedule());
      this.observer.observe(body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
      new ResizeObserver(()=>this.schedule()).observe(host);
      this.refresh();
    }
    schedule() {if(this.pending)return;this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.refresh();});}
    units(parent=this.body) {
      return [...parent.children].flatMap(element=>element.matches('#partInfo,.piece-data,.step-list,[data-page-split]') ? this.units(element) : [element]);
    }
    refresh() {
      if(!this.host.getClientRects().length)return;
      const all=this.units();all.forEach(unit=>unit.classList.remove('page-off'));
      const available=this.body.clientHeight;
      this.pages=[];let page=[],height=0;
      for(const unit of all) {
        if(unit.hidden||!unit.getClientRects().length)continue;
        const style=getComputedStyle(unit),size=unit.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
        if(height+size>available-2&&page.length){this.pages.push(page);page=[];height=0;}
        page.push(unit);height+=size;
      }
      if(page.length)this.pages.push(page);
      if(!this.pages.length)this.pages=[[]];
      this.show(Math.min(this.index,this.pages.length-1));
    }
    show(index) {
      this.index=Math.max(0,Math.min(this.pages.length-1,index));
      const visible=new Set(this.pages[this.index]);
      const active=document.activeElement;
      this.units().forEach(unit=>unit.classList.toggle('page-off',!visible.has(unit)));
      this.prev.disabled=this.index===0;this.next.disabled=this.index===this.pages.length-1;
      this.count.value=`${this.index+1} / ${this.pages.length}`;
      if(active&&this.body.contains(active)&&!active.getClientRects().length) (this.next.disabled?this.prev:this.next).focus({preventScroll:true});
    }
    reveal(element) {
      this.refresh();const index=this.pages.findIndex(page=>page.some(unit=>unit===element||element.contains(unit)||unit.contains(element)));
      if(index>=0)this.show(index);
    }
  }
  let helpPager;
  if(help) {
    const body=document.createElement('div');body.className='panel-body';
    body.append(...help.children);help.append(body);helpPager=new Pager(help,body);
  }
  const panels=new Map();
  if(model) {
    const picker=document.querySelector('#modelPanel');
    for(const panel of document.querySelectorAll('.model-panel'))panels.set(panel.id,new Pager(panel,panel.querySelector('.panel-body')));
    function choose(id, reveal) {
      picker.value=id;
      for(const [name,pager] of panels){pager.host.hidden=name!==id;}
      setTools(true);
      const pager=panels.get(id);pager.refresh();if(reveal)pager.reveal(document.getElementById(reveal));
    }
    picker.addEventListener('change',()=>choose(picker.value));
    document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();setTools(true);picker.focus({preventScroll:true});});
    window.addEventListener('resize',()=>{for(const pager of panels.values())pager.schedule();});
    window.CoralUI={toggleInterface,openModelTab:choose};
    panels.get(picker.value).host.hidden=false;
    panels.get(picker.value).schedule();
  } else window.CoralUI={toggleInterface};
  window.visualViewport?.addEventListener('resize',()=>window.dispatchEvent(new Event('resize')));
})();
