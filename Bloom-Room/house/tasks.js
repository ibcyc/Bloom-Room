/* All personal reminders are derived from their source. Register future task producers here. */
(function(H){
 'use strict';
 const E=H.escape;
 class HouseTasks {
  static sources=new Map();
  static register(name,provider){this.sources.set(name,provider);}
  static forMember(h,memberId,now=Date.now(),options={}){
   if(!memberId)return [];
   return [...this.sources.values()].flatMap(provider=>provider(h,memberId,now,options)).sort((a,b)=>a.dueAt-b.dueAt||a.key.localeCompare(b.key));
  }
  static complete(h,memberId,key,now=Date.now()){
   const task=this.forMember(h,memberId,now).find(t=>t.key===key);if(!task)throw new Error('This task is no longer waiting for you.');
   if(task.kind==='cat-missing')throw new Error('Place Pip in the room to resolve this reminder.');
   const o=h.objects.find(o=>o.id===task.objectId);
   if(task.kind==='booking'&&task.phase==='start'){const r=o.customState.machines[task.machine].find(r=>r.id===task.sourceId);if(o.customState.machines[task.machine].some(other=>other.id!==r.id&&!other.completedAt&&Math.min(other.startAt,other.startedAt??other.startAt)<r.endAt&&other.endAt>now))throw new Error('This appliance has another reservation before yours. Wait for your turn.');}
   H.HouseChores.settle(h,now);
   if(task.kind==='board'){
    const t=o.customState.tasks.find(t=>t.id===task.sourceId);t.completedBy=[...new Set([...(t.completedBy||[]),memberId])];
    if(t.assignees.every(id=>t.completedBy.includes(id)))t.completedAt=now;
   }else if(task.kind==='trash'){
    const s=o.customState.schedule;s.nextIndex=((s.nextIndex||0)+1)%s.order.length;s.completedAt=new Date(now).toISOString();s.nextDueAt=now+(s.intervalHours||(s.frequency==='daily'?24:168))*3600000;
   }else if(task.kind==='booking'){
    const r=o.customState.machines[task.machine].find(r=>r.id===task.sourceId);
    if(task.phase==='start')r.startedAt=now;else r.completedAt=now;
   }else if(task.kind==='bill'){
    const b=o.customState.bill;b.paidAt=now;if(b.repeat==='monthly'){b.dueAt=H.HouseFeatures.nextBill(b,now);b.paidAt=null;}
   }else if(task.kind==='request'){
    h.social.requests.find(r=>r.id===task.sourceId).recipients.find(r=>r.memberId===memberId).completedAt=now;
   }
   H.HouseChores.record(h,memberId,task,1,now);return task;
  }
 }
 HouseTasks.register('board',(h,memberId)=>h.objects.flatMap(o=>(o.objectType==='board'?o.customState.tasks||[]:[])
  .filter(t=>!t.completedAt&&t.assignees.includes(memberId)&&!t.completedBy?.includes(memberId))
  .map(t=>({key:'board:'+o.id+':'+t.id+':'+t.dueAt,kind:'board',objectId:o.id,sourceId:t.id,title:t.text,description:t.text,source:'Message board',dueAt:t.dueAt,completeLabel:'Mark my part done'}))));
 HouseTasks.register('trash',(h,memberId)=>h.objects.flatMap(o=>{
  const s=['trash','vacuum'].includes(o.objectType)&&o.customState.schedule,cleaning=o.objectType==='vacuum';
  return s?.nextDueAt&&s.order[(s.nextIndex||0)%s.order.length]===memberId?[{key:'trash:'+o.id+':'+s.nextDueAt,kind:'trash',objectId:o.id,title:cleaning?'Clean the house':'Take out the trash',description:s.note||(cleaning?'Your turn in the cleaning rotation.':'Your turn in the trash rotation.'),source:H.Catalog[o.objectType].name,dueAt:s.nextDueAt,completeLabel:cleaning?'Cleaning finished':'Trash taken out'}]:[];
 }));
 HouseTasks.register('cat-missing',(h,memberId,now)=>!h.animal.placed&&h.animal.absentSince!=null&&now>=h.animal.absentSince+600000?[{key:'cat-missing:'+h.animal.absentSince,kind:'cat-missing',title:'Bring Pip home',description:'The room has been without a cat for ten minutes. Add Pip to an empty floor cell to resolve this reminder.',source:'Pip',dueAt:h.animal.absentSince+600000,completeLabel:'Add Pip',noScore:true}]:[]);
 HouseTasks.register('appliances',(h,memberId,now,options)=>h.objects.flatMap(o=>H.HouseFeatures.machineKeys(o).flatMap(machine=>(o.customState.machines?.[machine]||[])
  .filter(r=>r.memberId===memberId&&!r.completedAt)
  .flatMap(r=>{
   const phase=r.startedAt||now>=r.endAt?'finish':'start',dueAt=phase==='start'?r.startAt:r.endAt;
   if(!options.includeFuture&&dueAt>now+30*60000)return [];
   const name=machine[0].toUpperCase()+machine.slice(1);
   return [{key:'booking:'+o.id+':'+r.id+':'+phase+':'+dueAt,kind:'booking',objectId:o.id,sourceId:r.id,machine,phase,title:phase==='start'?name+' · your turn':name+' · finished',description:phase==='start'?'Your reserved time is ready. Confirm below when you have started.':'Your reserved cycle ends now. Collect your items and confirm below to finish.',source:name,dueAt,startAt:r.startAt,endAt:r.endAt,completeLabel:phase==='start'?'I have started':'Finished · release appliance'}];
  }))));
 HouseTasks.register('requests',(h,memberId)=>h.social.requests.flatMap(r=>{
  const who=r.recipients.find(w=>w.memberId===memberId&&w.response==='accepted'&&!w.completedAt),dueAt=r.dueAt||r.createdAt+86400000;
  return who?[{key:'request:'+r.id+':'+dueAt,kind:'request',sourceId:r.id,title:r.text,description:r.text,source:'Door · accepted request',dueAt,completeLabel:'Request completed'}]:[];
 }));
 HouseTasks.register('bills',(h,memberId)=>h.objects.flatMap(o=>{
  const b=o.customState.bill,name=o.objectType==='water'?'Water':'Electricity';
  return b&&!b.paidAt&&b.memberId===memberId?[{key:'bill:'+o.id+':'+b.dueAt,kind:'bill',objectId:o.id,title:name+' bill',description:b.note||'Pay the '+name.toLowerCase()+' bill.',source:name+' bill',dueAt:b.dueAt,completeLabel:'Bill paid'}]:[];
 }));
 class HouseChores {
  static members(h){return [...new Set(h.objects.flatMap(o=>[...(o.customState.tasks||[]).flatMap(t=>t.assignees),...(o.customState.schedule?.order||[]),...Object.values(o.customState.machines||{}).flat().map(r=>r.memberId),...(o.customState.bill?[o.customState.bill.memberId]:[])]).concat(h.social.requests.flatMap(r=>r.recipients.map(w=>w.memberId))))];}
  static record(h,memberId,task,delta,at){
   if(task.noScore)return false;
   let changed=false;const key=(delta>0?'done:':'late:')+memberId+':'+task.key;
   for(const o of h.objects.filter(o=>o.objectType==='plant')){
    const g=o.customState.growth||={placedAt:Date.now(),score:100,deadAt:null,history:[]};
    if(at<g.placedAt||g.history.some(e=>e.key===key))continue;
    g.history.push({key,at,memberId,title:task.title,delta,change:0,score:100});
    g.history.sort((a,b)=>a.at-b.at||a.delta-b.delta||a.key.localeCompare(b.key));
    let score=100;g.deadAt=null;
    for(const e of g.history){const next=score===0?0:Math.max(0,Math.min(100,score+e.delta));e.change=next-score;e.score=next;score=next;if(score===0&&g.deadAt===null)g.deadAt=e.at;}
    g.score=score;changed=true;
   }
   return changed;
  }
  static settle(h,now=Date.now()){
   if(!h.objects.some(o=>o.objectType==='plant'))return false;
   let changed=false;
   for(const memberId of this.members(h))for(const task of HouseTasks.forMember(h,memberId,now)){
    const at=task.dueAt+3*3600000;if(at<=now)changed=this.record(h,memberId,task,-1,at)||changed;
   }
   return changed;
  }
  static arrangement(h,members,now=Date.now()){
   const rows=new Map();
   for(const m of members)for(const task of HouseTasks.forMember(h,m.id,now,{includeFuture:true})){
    if(!rows.has(task.key))rows.set(task.key,{...task,members:[]});rows.get(task.key).members.push(m.id);
   }
   if(h.animal.placed&&h.animal.health>0&&now>=h.animal.lastFedAt+12*3600000&&now<h.animal.lastFedAt+24*3600000)rows.set('pip-care',{key:'pip-care',kind:'care',title:'Feed Pip',description:'A food bowl resets Pip’s hunger clock when he finishes eating.',source:'Pip',dueAt:h.animal.lastFedAt+24*3600000,members:[]});
   return [...rows.values()].sort((a,b)=>a.dueAt-b.dueAt||a.key.localeCompare(b.key));
  }
 }
 H.HouseChores=HouseChores;
 class TaskBell {
  unlock(){
   try{this.context||=new (window.AudioContext||window.webkitAudioContext)();return this.context.resume().then(()=>{if(this.pending){this.pending=false;this.ring();}}).catch(()=>{});}catch(_){}
  }
  ring(){
   if(!this.context||this.context.state!=='running'){this.pending=true;return false;}
   const c=this.context,t=c.currentTime;this.rings=(this.rings||0)+1;
   for(const [frequency,gain,decay] of [[880,.1,1.4],[1760,.045,.8],[2376,.02,.45]]){
    const oscillator=c.createOscillator(),envelope=c.createGain();oscillator.frequency.value=frequency;oscillator.connect(envelope);envelope.connect(c.destination);envelope.gain.setValueAtTime(.0001,t);envelope.gain.exponentialRampToValueAtTime(gain,t+.012);envelope.gain.exponentialRampToValueAtTime(.0001,t+decay);oscillator.start(t);oscillator.stop(t+decay+.03);oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
   }
   return true;
  }
  meow(volume=.7){
   const c=this.context;if(!c||c.state!=='running'||volume<=0)return false;
   this.silenceMeow();const t=c.currentTime,voice=c.createOscillator(),filter=c.createBiquadFilter(),gain=c.createGain(),output=c.createGain();output.gain.value=volume;voice.type='sawtooth';filter.type='bandpass';filter.Q.value=3;
   voice.frequency.setValueAtTime(520,t);voice.frequency.exponentialRampToValueAtTime(820,t+.14);voice.frequency.exponentialRampToValueAtTime(390,t+.65);
   filter.frequency.setValueAtTime(1700,t);filter.frequency.exponentialRampToValueAtTime(850,t+.65);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.18,t+.1);gain.gain.exponentialRampToValueAtTime(.0001,t+.7);
   voice.connect(filter);filter.connect(gain);gain.connect(output);output.connect(c.destination);this.voiceGain=output;voice.start(t);voice.stop(t+.72);voice.onended=()=>{voice.disconnect();filter.disconnect();gain.disconnect();output.disconnect();if(this.voiceGain===output)this.voiceGain=null;};return true;
  }
  silenceMeow(){if(this.voiceGain){this.voiceGain.gain.cancelScheduledValues(this.context.currentTime);this.voiceGain.gain.setValueAtTime(0,this.context.currentTime);}}
  destroy(){this.pending=false;this.context?.close().catch(()=>{});}
 }
 class PersonalTaskSystem {
  constructor(controller){
   this.controller=controller;this.memberId=controller.options.members.some(m=>m.id===(controller.options.memberId||'self'))?(controller.options.memberId||'self'):null;
   this.storageKey='roombloom-task-alerts-v1:'+controller.options.roomId+':'+this.memberId;this.seen=this.readSeen();this.bell=new TaskBell();this.items=[];this.nextWhisper=Date.now()+90000;this.nextMeow=Date.now()+45000+Math.random()*60000;this.muteKey='roombloom-pip-mute-v1:'+controller.options.roomId+':'+this.memberId;try{this.muted=localStorage.getItem(this.muteKey)==='true';}catch(_){this.muted=false;}
   this.volumeKey='roombloom-pip-volume-v1:'+controller.options.roomId+':'+this.memberId;this.meowVolume=.7;try{const saved=localStorage.getItem(this.volumeKey),n=Number(saved);if(saved!==null&&Number.isFinite(n)&&n>=0&&n<=1)this.meowVolume=n;}catch(_){}
   this.rail=document.createElement('aside');this.rail.className='house-personal-tasks';this.rail.setAttribute('aria-label','Your upcoming tasks');controller.root.append(this.rail);
   this.bubble=document.createElement('div');this.bubble.className='house-cat-bubble';this.bubble.hidden=true;this.bubble.setAttribute('role','status');controller.root.append(this.bubble);
   const opts={signal:controller.events.signal};
   const unlock=e=>{if(e.type==='keydown'&&e.repeat)return;this.bell.unlock();if(!e.target.closest('[data-h-action^="music-"]'))controller.sound.autoStart();};
   controller.root.addEventListener('pointerup',unlock,opts);window.addEventListener('keydown',unlock,opts);
   window.addEventListener('storage',e=>{if(e.key===this.storageKey)this.seen=this.readSeen();},opts);
  }
  setMuted(muted){this.muted=!!muted;if(this.muted)this.bell.silenceMeow();try{localStorage.setItem(this.muteKey,String(this.muted));}catch(_){}}
  setMeowVolume(value){const volume=Number(value);if(!Number.isFinite(volume))return;this.meowVolume=Math.max(0,Math.min(1,volume));if(this.bell.voiceGain)this.bell.voiceGain.gain.value=this.muted?0:this.meowVolume;try{localStorage.setItem(this.volumeKey,String(this.meowVolume));}catch(_){}}
  async previewMeow(){if(this.muted||!this.controller.house.animal.placed)return;await this.bell.unlock();if(!this.muted&&!this.controller.disposed)this.bell.meow(this.meowVolume);}
  readSeen(){try{return new Set(JSON.parse(localStorage.getItem(this.storageKey)||'[]').filter(k=>typeof k==='string').slice(-1000));}catch(_){return new Set();}}
  timeLabel(t,now){const delta=t.dueAt-now;if(delta<0){const minutes=Math.max(1,Math.floor(-delta/60000)),hours=Math.floor(minutes/60);return 'Overdue '+(hours?hours+'h ':'')+(minutes%60)+'m';}if(delta<=0)return 'Due now';if(delta<60000)return 'In less than 1 min';if(delta<3600000)return 'In '+Math.ceil(delta/60000)+' min';if(delta<86400000)return 'In '+Math.ceil(delta/3600000)+' hr';return new Date(t.dueAt).toLocaleDateString([], {month:'short',day:'numeric'});}
  tick(now=Date.now()){
   const c=this.controller;
   if(now>=this.nextMeow){if(!this.muted&&!document.hidden&&!c.state.editing&&c.house.animal.placed)this.bell.meow(this.meowVolume);this.nextMeow=now+90000+Math.random()*150000;}
   this.items=HouseTasks.forMember(c.house,this.memberId,now);
   const due=this.items.filter(t=>t.dueAt<=now&&!this.seen.has(t.key));
   if(due.length&&!document.hidden){
    const persisted=this.readSeen(),newDue=due.filter(t=>!persisted.has(t.key));for(const t of due)this.seen.add(t.key);for(const key of persisted)this.seen.add(key);
    try{localStorage.setItem(this.storageKey,JSON.stringify([...this.seen].slice(-1000)));}catch(_){}
    if(newDue.length){this.bell.ring();if(newDue.some(t=>t.key===this.items[0]?.key))this.whisper(this.items[0],now);}
   }
   if(now>=this.nextWhisper&&!document.hidden&&!c.state.editing){if(this.items[0])this.whisper(this.items[0],now);this.nextWhisper=now+120000+Math.random()*120000;}
   if(c.state.editing||!c.house.animal.placed||this.bubble.dataset.taskKey!==this.items[0]?.key||now>=(this.bubbleUntil||0))this.bubble.hidden=true;
   this.render(now);
  }
  render(now){
   this.rail.hidden=this.controller.state.editing||!this.items.length;
   const visible=this.items.slice(0,innerHeight<620?2:3),signature=visible.map(t=>t.key+'|'+t.title).join(';');
   if(signature!==this.signature){
    this.signature=signature;this.rail.innerHTML=visible.map((t,i)=>'<button type="button" class="house-task-card" data-h-action="personal-open" data-key="'+E(t.key)+'" data-task-key="'+E(t.key)+'" style="--task-index:'+i+'"><small>'+E(t.source)+'</small><strong>'+E(t.title)+'</strong><span data-task-time></span></button>').join('');
   }
   for(const card of this.rail.querySelectorAll('[data-task-key]')){
    const task=this.items.find(t=>t.key===card.dataset.taskKey);if(!task)continue;
    const label=this.timeLabel(task,now);card.classList.toggle('is-due',task.dueAt<=now);card.querySelector('[data-task-time]').textContent=label;card.setAttribute('aria-label',task.title+'. '+label+'. Click for details and completion options.');
   }
  }
  whisper(task,now){
   if(!task||this.controller.state.editing||!this.controller.house.animal.placed)return;
   this.bubble.innerHTML='<strong>Pip</strong><span>'+E(task.title)+' · '+E(this.timeLabel(task,now))+'</span>';this.bubble.dataset.taskKey=task.key;this.bubbleUntil=now+7000;this.bubble.hidden=false;
  }
  position(view){
   if(this.bubble.hidden||!this.controller.scene)return;
   const s=this.controller.scene,r=s.canvas.getBoundingClientRect(),root=this.controller.root.getBoundingClientRect(),v=new THREE.Vector3(view.position.x,(view.position.y||0)+.9,view.position.z).project(s.camera);
   const anchorX=r.left-root.left+(v.x+1)*r.width/2,anchorY=r.top-root.top+(1-v.y)*r.height/2,half=this.bubble.offsetWidth/2,height=this.bubble.offsetHeight;
   let x=Math.max(half+12,Math.min(root.width-half-12,anchorX)),y=Math.max(height+20,Math.min(root.height-90,anchorY));
   for(const obstacle of [this.rail,this.controller.root.querySelector('.house-residents')]){
    if(!obstacle||obstacle.hidden)continue;const b=obstacle.getBoundingClientRect(),left=b.left-root.left,right=b.right-root.left,top=b.top-root.top,bottom=b.bottom-root.top;
    if(x+half>left&&x-half<right&&y>top&&y-height<bottom){
     if(obstacle===this.rail&&right+2*half+22<=root.width)x=right+half+10;
     else y=Math.min(y,top-10);
    }
   }
   this.bubble.style.left=x+'px';this.bubble.style.top=y+'px';this.bubble.style.setProperty('--bubble-tail',Math.max(12,Math.min(half*2-12,anchorX-x+half))+'px');
  }
  open(key){
   const t=HouseTasks.forMember(this.controller.house,this.memberId,Date.now(),{includeFuture:true}).find(t=>t.key===key);if(!t)return;const available=this.items.some(item=>item.key===key);
   const date=n=>E(new Date(n).toLocaleString());
   this.controller.ui.dialog('Your task','<p class="help">'+E(t.source)+'</p><h3>'+E(t.title)+'</h3><p>'+E(t.description)+'</p><p>Due '+date(t.dueAt)+'</p>'+(t.startAt?'<p class="help">Reserved '+date(t.startAt)+' → '+date(t.endAt)+'</p>':'')+'<p class="help">'+E(this.timeLabel(t,Date.now()))+'</p>'+(available?'<p class="help">'+(t.kind==='cat-missing'?'This reminder stays until Pip is placed.':'Use the button below to confirm completion.')+'</p><button class="house-primary" data-h-action="personal-complete" data-key="'+E(t.key)+'">'+E(t.completeLabel)+'</button>':'<p class="help">Your turn reminder appears 30 minutes before the booking.</p>'));
  }
  complete(key){
   const c=this.controller,task=this.items.find(t=>t.key===key);if(task?.kind==='cat-missing'){if(c.house.animal.placed){this.tick();return;}c.dispatch('edit');c.dispatch('choose-object',{id:'cat'});return;}c.mutate(()=>HouseTasks.complete(c.house,this.memberId,key),'Task completed.',false);c.save();if(c.ui.modal.open)c.ui.closeModal();this.tick();
  }
  destroy(){this.bell.destroy();this.rail.remove();this.bubble.remove();}
 }
 Object.assign(H,{HouseTasks,PersonalTaskSystem});
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
