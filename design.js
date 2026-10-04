/* The designer's paper world: local assets, two moods and restrained Anime.js motion. */
(() => {
  'use strict';
  const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),animations=new Set();
  let introTimeline=null,finishIntro=null,keyIdle=null,hubAnimation=null,mood='macaron';
  let cursorEnabled=false,cursorPoint=null,keyCursor=null;
  let roomEntry=null;
  // Two views of the supplied crayon artwork; changing Mood updates every mark.
  const logoSource='assets/design/house-logos.png',logoViews={macaron:[982,165,560,660],woodland:[200,185,580,660]};
  function updateHouseLogos(){
    document.querySelectorAll('[data-house-logo]').forEach(logo=>{logo.setAttribute('viewBox',logoViews[mood].join(' '));logo.dataset.houseLogo=mood;});
    document.querySelector('link[rel="icon"]')?.setAttribute('href','assets/design/logo-'+mood+'.svg');
  }
  try{mood=localStorage.getItem('roombloom-mood-v1')==='woodland'?'woodland':'macaron';}catch(_){}
  function setMood(value){mood=value==='woodland'?'woodland':'macaron';document.documentElement.dataset.mood=mood;try{localStorage.setItem('roombloom-mood-v1',mood);}catch(_){}document.querySelectorAll('[data-mood-select]').forEach(select=>select.value=mood);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',mood==='woodland'?'#213722':'#FFF8E7');updateHouseLogos();}
  setMood(mood);
  const art=(name,cls='')=>name==='key'?`<svg class="key-art ${cls}" viewBox="723 338 664 1572" aria-hidden="true"><image href="assets/design/key.png" width="2048" height="2048"/></svg>`:`<img class="sketch-${name} ${cls}" src="assets/design/${name}.png" alt="" draggable="false">`;
  const house=(cls='')=>`<svg class="sketch-house ${cls}" data-house-logo="${mood}" viewBox="${logoViews[mood].join(' ')}" aria-hidden="true" focusable="false"><image href="${logoSource}" width="1721" height="914"/></svg>`;
  const moodSelect=(compact=false)=>`<label class="mood-picker${compact?' compact':''}"><span class="mood-dot" aria-hidden="true"></span><span class="sr-only">Choose your mood</span><select data-mood-select aria-label="Choose your mood"><option value="macaron"${mood==='macaron'?' selected':''}>Mood 1 · Macaron</option><option value="woodland"${mood==='woodland'?' selected':''}>Mood 2 · Woodland</option></select></label>`;
  function animate(target,options){if(!globalThis.anime||reduced.matches)return null;let animation;animation=anime.animate(target,{...options,onComplete:()=>{animations.delete(animation);options.onComplete?.();}});animations.add(animation);return animation;}
  function cleanup({keepRoomEntry=false}={}){if(!keepRoomEntry)cancelRoomEntry();for(const a of animations)a?.cancel();animations.clear();hubAnimation=null;introTimeline?.cancel();introTimeline=null;finishIntro=null;}
  function pageIn(root){if(!root||root.querySelector('.house-shell')||root.querySelector('.welcome-stage'))return;animate(root,{opacity:[0,1],y:[8,0],duration:420,ease:'outCubic'});}
  const cloudShape='M86 380C26 380 4 344 18 308C28 278 59 266 88 270C70 211 109 160 163 162C192 163 220 180 235 205C219 121 271 55 338 61C391 67 426 114 428 159C456 128 514 141 532 184C568 144 620 156 649 194C673 227 670 263 655 281C705 246 769 267 784 313C798 358 757 391 710 391C679 396 652 384 638 365C628 411 578 432 537 410C518 443 465 447 434 422C405 449 356 444 334 416C305 444 257 433 245 404C205 432 161 420 149 392C121 408 98 397 86 380Z';
  function cloudBank(name,index){return `<div class="room-cloud-bank ${name}"><svg viewBox="0 0 800 460" aria-hidden="true"><defs><linearGradient id="room-cloud-${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cloud-light)"/><stop offset=".56" stop-color="var(--cloud-light)"/><stop offset="1" stop-color="var(--cloud-shade)"/></linearGradient></defs><path d="${cloudShape}" fill="url(#room-cloud-${index})"/><path d="M111 284C131 266 161 263 187 277M254 192C261 128 305 102 345 109M461 233C481 211 511 211 532 228" fill="none" stroke="var(--cloud-light)" stroke-width="10" stroke-linecap="round" opacity=".5"/></svg></div>`;}
  function cancelRoomEntry(){
    const entry=roomEntry;if(!entry)return;roomEntry=null;
    clearTimeout(entry.timeout);cancelAnimationFrame(entry.frame);entry.cover?.cancel();entry.reveal?.cancel();entry.overlay.remove();
    entry.app.inert=entry.wasInert;document.body.classList.remove('is-entering-room');updateCursor();
  }
  function mountCoveredRoom(entry){
    if(roomEntry!==entry||entry.mounted)return;
    entry.mounted=true;
    try{entry.commit();}catch(error){cancelRoomEntry();throw error;}
  }
  function finishRoomEntry(entry){
    if(roomEntry!==entry)return;
    cancelRoomEntry();
    if(!entry.wasInert&&document.activeElement===document.body)document.getElementById('main')?.focus({preventScroll:true});
  }
  function enterRoom(commit,{leaving=false}={}){
    cancelRoomEntry();setCursorEnabled(false);
    if(reduced.matches||!globalThis.anime){commit();return;}
    const app=document.getElementById('app'),overlay=document.createElement('div');overlay.className='room-cloud-transition';overlay.dataset.direction=leaving?'out':'in';overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="room-cloud-haze"></div>'+['cloud-far-ne','cloud-far-sw','cloud-near-nw','cloud-near-se'].map(cloudBank).join('');
    const entry={app,overlay,commit,wasInert:app.inert,mounted:false};roomEntry=entry;app.inert=true;
    document.body.classList.add('is-entering-room');document.body.append(overlay);
    const haze=overlay.querySelector('.room-cloud-haze'),banks=[...overlay.querySelectorAll('.room-cloud-bank')],w=innerWidth,h=innerHeight;
    const reveal=()=>{
      if(roomEntry!==entry)return;
      entry.reveal=anime.createTimeline({defaults:{ease:'inOutSine'},onComplete:()=>finishRoomEntry(entry)});
      entry.reveal.add(haze,{opacity:[1,0],duration:leaving?380:820},leaving?0:80);
      banks.forEach((bank,i)=>{
        const dx=(leaving?[.15,-.15,-.2,.2]:[.36,-.36,-.55,.55])[i]*w,dy=(leaving?[-.1,.1,-.12,.12]:[-.24,.24,-.42,.42])[i]*h;
        entry.reveal.add(bank,{x:dx,y:dy,scale:leaving?.9:i<2?1.35:1.6,duration:leaving?480:i<2?1050:1300,ease:leaving?'inOutCubic':'inCubic'},0)
          .add(bank,{opacity:0,duration:leaving?480:560},leaving?0:i<2?480:740);
      });
    };
    entry.cover=anime.createTimeline({defaults:{ease:'inOutCubic'},onComplete:()=>{
      mountCoveredRoom(entry);
      // Paint the destination under full cover before the cloud layers part.
      entry.frame=requestAnimationFrame(()=>{entry.frame=requestAnimationFrame(reveal);});
    }});
    entry.cover.add(haze,{opacity:[0,1],duration:leaving?820:380},leaving?400:100);
    banks.forEach((bank,i)=>{
      const dx=(leaving?[.36,-.36,-.55,.55]:[.15,-.15,-.2,.2])[i]*w,dy=(leaving?[-.24,.24,-.42,.42]:[-.1,.1,-.12,.12])[i]*h;
      entry.cover.add(bank,{x:[dx,0],y:[dy,0],scale:[leaving?(i<2?1.35:1.6):.9,1],duration:leaving?(i<2?1050:1300):480,ease:leaving?'outCubic':'inOutCubic'},leaving&&i<2?250:0)
        .add(bank,{opacity:[0,1],duration:leaving?560:480},leaving&&i<2?260:0);
    });
    // An interrupted animation or backgrounded tab must never strand an inert page.
    entry.timeout=setTimeout(()=>{mountCoveredRoom(entry);finishRoomEntry(entry);},6500);
  }
  const leaveRoom=commit=>enterRoom(commit,{leaving:true});
  function hubSwitch(root,mode){
    if(root.dataset.hubMode===mode)return;
    hubAnimation?.cancel();animations.delete(hubAnimation);hubAnimation=null;
    root.dataset.hubMode=mode;
    for(const button of root.querySelectorAll('.journey-choice')){
      const selected=button.dataset.go==='/'+mode;button.classList.toggle('is-current',selected);button.setAttribute('aria-expanded',String(selected));
    }
    for(const panel of root.querySelectorAll('[data-hub-panel]')){
      panel.hidden=panel.dataset.hubPanel!==mode;panel.style.removeProperty('opacity');panel.style.removeProperty('transform');
      if(!panel.hidden)hubAnimation=animate(panel,{opacity:[0,1],y:[48,0],duration:620,ease:'outCubic'});
    }
  }
  function hideCursor(){
    document.documentElement.classList.remove('key-cursor-active');
    if(keyCursor){if(keyCursor.hasAttribute('popover')&&keyCursor.matches(':popover-open'))keyCursor.hidePopover();keyCursor.hidden=true;}
  }
  function updateCursor(lift=false){
    if(!cursorEnabled||!cursorPoint||roomEntry){hideCursor();return;}
    if(!keyCursor){
      keyCursor=document.createElement('div');keyCursor.id='key-cursor';keyCursor.setAttribute('aria-hidden','true');keyCursor.innerHTML=art('key');
      if(typeof keyCursor.showPopover==='function')keyCursor.setAttribute('popover','manual');
      document.body.append(keyCursor);
    }
    // The top layer keeps the key visible above native dialogs without intercepting clicks.
    if(!keyCursor.hasAttribute('popover')&&document.querySelector('dialog[open]')){hideCursor();return;}
    keyCursor.hidden=false;keyCursor.style.transform=`translate(${cursorPoint.x-13}px,${cursorPoint.y-3}px)`;
    if(keyCursor.hasAttribute('popover')){
      if(lift&&keyCursor.matches(':popover-open'))keyCursor.hidePopover();
      if(!keyCursor.matches(':popover-open'))keyCursor.showPopover();
    }
    document.documentElement.classList.add('key-cursor-active');
  }
  function setCursorEnabled(enabled){cursorEnabled=!!enabled;updateCursor();}
  function login(replay=false){
    const stage=document.querySelector('.welcome-stage');if(!stage)return;
    const form=stage.querySelector('.login-entry'),key=stage.querySelector('.flying-key'),mark=stage.querySelector('.bloom-lockup'),our=stage.querySelector('.our-home'),stars=stage.querySelectorAll('.login-star');
    let seen=false;try{seen=sessionStorage.getItem('roombloom-intro-seen')==='yes';}catch(_){}
    const w=stage.clientWidth,h=stage.clientHeight,landingX=w/2-20,landingY=h*.79;
    const ready=()=>{
      const endH=stage.clientHeight,endX=stage.clientWidth/2-20;keyIdle?.cancel();animations.delete(keyIdle);
      stage.classList.add('intro-complete');form.inert=false;form.style.cssText='opacity:1;transform:none';our.style.opacity=0;mark.style.cssText='opacity:1;transform:translateY(-'+endH*.16+'px)';
      key.style.cssText='opacity:1;transform:translate('+endX+'px,'+endH*.79+'px) rotate(0deg)';stars.forEach(s=>s.style.opacity=1);
      stage.querySelector('[data-action="skip-intro"]').hidden=true;stage.querySelector('[data-action="replay-intro"]').hidden=false;
      try{sessionStorage.setItem('roombloom-intro-seen','yes');}catch(_){}
      keyIdle=animate(key.querySelector('svg'),{rotateY:[0,360],duration:14000,loop:true,ease:'linear'});
    };
    finishIntro=()=>{introTimeline?.cancel();introTimeline=null;ready();};
    if(reduced.matches||!globalThis.anime||seen&&!replay){ready();return;}
    form.inert=true;stage.classList.add('intro-playing');
    introTimeline=anime.createTimeline({defaults:{ease:'inOutSine'},onComplete:ready});
    introTimeline.add(our,{opacity:[0,1],y:[10,0],duration:1100},0)
      .add(key,{opacity:[.8,1],x:[w*.1,w+100],y:[h*.75,h*.75],rotate:[-90,-90],duration:5100},200)
      .add(our,{opacity:0,y:-28,duration:1200},2200)
      .add(mark,{opacity:[0,1],y:[18,0],duration:1700},2450)
      .add(mark,{y:-h*.16,duration:2100},4800)
      // Two separate flights: leave through the right edge, then reset below the screen while hidden.
      .set(key,{opacity:0},5300)
      .set(key,{x:landingX,y:h+95,rotate:0},6000)
      .set(key,{opacity:1},7000)
      .add(key,{y:landingY,duration:1800},7000)
      .add(form,{opacity:[0,1],y:[20,0],duration:1300},6800)
      .add(stars,{opacity:[0,1],rotate:[-12,0],duration:1400},6900);
  }
  document.addEventListener('change',e=>{if(e.target.matches('[data-mood-select]'))setMood(e.target.value);});
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-action="skip-intro"]'))finishIntro?.();
    if(e.target.closest('[data-action="replay-intro"]')){cleanup();const stage=document.querySelector('.welcome-stage');stage.classList.remove('intro-complete');stage.querySelector('[data-action="skip-intro"]').hidden=false;stage.querySelector('[data-action="replay-intro"]').hidden=true;for(const el of stage.querySelectorAll('[style]'))el.removeAttribute('style');login(true);}
  });
  window.addEventListener('resize',()=>finishIntro?.());
  const dialogs=new MutationObserver(records=>{for(const {target} of records)if(target.tagName==='DIALOG'){if(target.open)animate(target,{opacity:[0,1],y:[7,0],duration:230,ease:'outCubic'});updateCursor(true);}});dialogs.observe(document.body,{attributes:true,attributeFilter:['open'],subtree:true});
  reduced.addEventListener('change',()=>{if(reduced.matches){if(roomEntry){const entry=roomEntry;mountCoveredRoom(entry);finishRoomEntry(entry);}finishIntro?.();for(const a of animations)a?.cancel();animations.clear();const main=document.getElementById('main');if(main){main.style.opacity='1';main.style.transform='none';}for(const dialog of document.querySelectorAll('dialog[open]')){dialog.style.opacity='1';dialog.style.transform='none';}}});
  const trackPointer=e=>{cursorPoint=e.pointerType==='mouse'?{x:e.clientX,y:e.clientY}:null;updateCursor();};
  document.addEventListener('pointermove',trackPointer);document.addEventListener('pointerdown',trackPointer);
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget){cursorPoint=null;hideCursor();}});
  window.addEventListener('blur',hideCursor);
  window.BloomDesign={art,house,moodSelect,setMood,cleanup,pageIn,login,animate,hubSwitch,setCursorEnabled,enterRoom,leaveRoom,cancelRoomEntry,escape:E};
})();
