/* Furniture-owned interaction views and actions; mutations still go through HouseEditor. */
(function(H){
 'use strict';
 const E=H.escape;
 const button=(action,label,extra='')=>'<button type="button" data-h-action="'+action+'" '+extra+'>'+label+'</button>';
 const date=n=>E(new Date(n).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
 const localDate=(n=Date.now()+3600000)=>{const d=new Date(n);return new Date(n-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 class InteractionSystem {
  constructor(controller,members){this.controller=controller;this.members=members;this.objectId=null;this.view=null;this.uploadToken=0;}
  get house(){return this.controller.house;}
  get ui(){return this.controller.ui;}
  get object(){const o=this.house.objects.find(o=>o.id===this.objectId);if(!o)throw new Error('This object is no longer in the room.');return o;}
  name(id){return this.members.find(m=>m.id===id)?.name||'Former roommate';}
  options(selected='self'){return this.members.map(m=>'<option value="'+E(m.id)+'"'+(m.id===selected?' selected':'')+'>'+E(m.name)+'</option>').join('');}
  checks(prefix,selected=[]){return '<div class="house-checks">'+this.members.map(m=>'<label><input type="checkbox" name="'+prefix+E(m.id)+'"'+(selected.includes(m.id)?' checked':'')+'>'+E(m.name)+'</label>').join('')+'</div>';}
  picked(values,prefix){return Object.keys(values).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));}
  commit(fn,message){this.controller.mutate(fn,message,false);if(!this.controller.state.editing)this.controller.save();}
  dialog(title,body,view){this.view=view;this.ui.dialog(title,body);}
  open(o){
   if(this.controller.state.editing||!o)return;this.objectId=o.id;
   switch(o.interactionType){
    case 'REST':this.controller.animal.go(o.objectType,o.id);break;
    case 'FEED':this.controller.animal.go('bowl',o.id);break;
    case 'FRIDGE':this.fridge();break;
    case 'TRASH_SCHEDULE':this.trash();break;
    case 'ART':if(o.customState.image)this.ui.showArt(o.customState.image);else this.artSetup(o.id);break;
    case 'LAUNDRY':case 'APPLIANCE':this.laundry();break;
    case 'LIGHTING':this.lighting();break;
    case 'MUSIC':this.music();break;
    case 'BOARD':this.board();break;
    case 'PLANT':this.plant();break;
    case 'LAMP':this.lamp();break;
    case 'BILL':this.bill();break;
   }
  }
  fridge(){
   this.restockItem=null;const list=this.object.customState.inventory||[];
   this.dialog('Refrigerator',['chilled','frozen'].map(section=>'<section class="house-fridge-section"><h3>'+ (section==='chilled'?'Refrigerated · 冷藏':'Frozen · 冷凍')+'</h3><ul class="house-item-list">'+(list.filter(i=>i.section===section).map(i=>'<li class="house-inventory-row"><strong>'+E(i.name)+'</strong><div>'+button('fridge-minus','−','data-id="'+i.id+'" aria-label="Use one '+E(i.name)+'"'+(i.quantity===0?' disabled':''))+'<output aria-label="Quantity">'+i.quantity+'</output>'+button('fridge-plus','＋','data-id="'+i.id+'" aria-label="Add one '+E(i.name)+'"')+'</div></li>').join('')||'<li class="help">No items here yet.</li>')+'</ul></section>').join('')+'<form data-h-form="fridge-add" class="house-interaction-form"><label>Item name<input name="name" maxlength="80" required></label><div class="house-inline-fields"><label>Section<select name="section"><option value="chilled">冷藏</option><option value="frozen">冷凍</option></select></label><label>Quantity<input name="quantity" type="number" min="1" max="9999" step="1" value="1" required></label></div><button type="submit">Add item</button></form>','fridge');
  }
  changeFood(id,delta){
   const item=this.object.customState.inventory?.find(i=>i.id===id);if(!item)throw new Error('This item is no longer in the refrigerator.');
   const depleted=item.quantity===1&&delta===-1,pending=H.clone(item);
   this.commit(()=>H.HouseFeatures.changeInventory(this.object,id,delta),'Inventory updated.');
   if(!depleted){this.fridge();return;}
   this.restockItem=pending;const boards=this.house.objects.filter(o=>o.objectType==='board');
   this.dialog('補貨 '+pending.name,'<p>'+E(pending.name)+' 的數量已歸零。要在 Message board 建立補貨任務嗎？</p>'+(boards.length?'<form data-h-form="fridge-restock" class="house-interaction-form"><label>Title<input name="title" value="'+E('補貨 '+pending.name)+'" maxlength="160" required></label><label>Assign to<select name="memberId">'+this.options(this.controller.tasks.memberId)+'</select></label><label>Complete before<input name="due" type="datetime-local" value="'+localDate(Date.now()+86400000)+'" required></label><label>Message board<select name="boardId">'+boards.map((b,i)=>'<option value="'+b.id+'">Message board '+(i+1)+'</option>').join('')+'</select></label><div class="house-action-row">'+button('fridge-return','×','aria-label="Skip restocking"')+'<button type="submit" aria-label="Create restocking task">✓</button></div></form>':'<p class="help">Place a Message board in the room to create restocking tasks.</p>'+button('fridge-return','×','aria-label="Return to refrigerator"')),'fridge-restock');
  }
  trash(){
   const o=this.object,s=o.customState.schedule||{},order=s.order||this.members.map(m=>m.id),current=order[(s.nextIndex||0)%order.length],hours=s.intervalHours||(s.frequency==='daily'?24:168),unit=hours%24===0?'days':'hours',interval=unit==='days'?hours/24:hours;
   const fields=this.members.map((m,i)=>'<label>Turn '+(i+1)+'<select name="turn'+i+'"><option value="">Skip</option>'+this.options(order[i]||'')+'</select></label>').join('');
   this.dialog(o.objectType==='vacuum'?'Cleaning rotation':'Trash rotation','<p>Next: <strong>'+E(this.name(current))+'</strong></p>'+(s.nextDueAt?'<p class="'+(s.nextDueAt<Date.now()?'house-overdue':'')+'">Due '+date(s.nextDueAt)+'</p>':'')+
    '<form data-h-form="trash-save" class="house-interaction-form">'+fields+'<div class="house-inline-fields"><label>Every <input type="number" name="interval" min="1" max="720" value="'+interval+'" required></label><label>Unit<select name="unit"><option value="days"'+(unit==='days'?' selected':'')+'>Days</option><option value="hours"'+(unit==='hours'?' selected':'')+'>Hours</option></select></label></div><label>Note<input name="note" maxlength="160" value="'+E(s.note||'')+'"></label><button type="submit">Save rotation</button></form>'+button('trash-done','Mark done',!s.nextDueAt||current!==this.controller.tasks.memberId?'disabled':'')+(s.completedAt?'<p class="help">Last completed '+date(Date.parse(s.completedAt))+'</p>':''),'trash');
  }
  saveTrash(v){
   const order=Object.keys(v).filter(k=>k.startsWith('turn')).sort().map(k=>v[k]).filter(Boolean),hours=Number(v.interval)*(v.unit==='days'?24:1);
   if(!order.length||new Set(order).size!==order.length)throw new Error('Choose an order with no duplicate roommates.');order.forEach(id=>H.HouseFeatures.member(this.members,id));
   if(!Number.isInteger(hours)||hours<1||hours>720)throw new Error('Choose an interval from 1 hour to 30 days.');
   this.commit(()=>{this.object.customState.schedule={order,intervalHours:hours,frequency:hours===24?'daily':'weekly',note:String(v.note||'').slice(0,160),nextIndex:0,nextDueAt:Date.now()+hours*3600000};},'Rotation saved.');this.trash();
  }
  done(){const who=this.controller.tasks.memberId,task=H.HouseTasks.forMember(this.house,who).find(t=>t.kind==='trash'&&t.objectId===this.objectId);if(!task)throw new Error('There is no rotation task assigned to you.');this.commit(()=>H.HouseTasks.complete(this.house,who,task.key),'Next roommate’s turn.');this.trash();}
  artSetup(id=null){
   this.artId=id;this.uploadToken++;this.dialog('Add a picture','<p>Choose one picture for this frame. Once saved, it cannot be replaced.</p><label class="house-file-label">Picture<input type="file" id="house-art-file" accept="image/png,image/jpeg,image/webp"></label>'+(id?'':button('art-empty','Place an empty frame')),'art');
  }
  async uploadArt(file){
   const id=this.artId,token=this.uploadToken,image=await H.MediaStore.picture(file);if(token!==this.uploadToken||this.controller.disposed)return;
   if(id){const o=this.house.objects.find(o=>o.id===id&&o.objectType==='art');if(!o)throw new Error('This frame was removed.');if(o.customState.image)throw new Error('This frame already has its picture.');this.commit(()=>{o.customState.image=image;},'Picture saved.');}
   else{if(this.controller.state.furniture!=='art')return;this.controller.state.artImage=image;}
   this.ui.closeModal();this.controller.render();
  }
  laundry(){
   const o=this.object,keys=o.objectType==='oven'?['oven']:['dryer','washer'],machines=o.customState.machines||{},now=Date.now();
   const sections=keys.map(machine=>{
    const busy=H.HouseFeatures.busy(o,machine,now);
    const list=(machines[machine]||[]).filter(r=>r.endAt>now-86400000).sort((a,b)=>a.startAt-b.startAt);
    const items=list.map(r=>'<li><div><strong>'+E(this.name(r.memberId))+'</strong> · '+'<span data-booking-status data-id="'+r.id+'">'+H.HouseFeatures.reservationStatus(r,now)+'</span>'+'<small>'+date(r.startAt)+' → '+date(r.endAt)+'</small></div>'+button('laundry-cancel','Cancel','data-key="'+machine+'" data-id="'+r.id+'"')+'</li>').join('');
    return '<section class="house-machine"><h3>'+ (machine==='oven'?'Oven':machine==='dryer'?'Dryer · upper':'Washer · lower')+'</h3><ol class="house-item-list">'+(items||'<li class="help">Available</li>')+'</ol><form data-h-form="laundry-book" class="house-interaction-form"><input type="hidden" name="machine" value="'+machine+'"><label>Roommate<select name="memberId">'+this.options()+'</select></label><div class="house-inline-fields"><label>Start<input name="start" data-booking-start'+(busy?' disabled':'')+' type="datetime-local" value="'+localDate(now)+'" required></label><label>Minutes<input type="number" name="minutes" min="1" max="1440" step="1" value="60" required placeholder="e.g. 43"></label></div><div class="house-action-row"><button type="submit" name="booking" value="reserve"'+(busy?' disabled':'')+'>Reserve time</button><button type="submit" name="booking" value="queue"'+(busy?'':' hidden')+'>Join queue</button></div></form></section>';
   }).join('');this.dialog(o.objectType==='oven'?'Oven':'Washer & dryer','<p class="help">Reserve starts now unless you choose a future time. While in use, join the queue. Enter any whole number of minutes. Your turn and finish reminders appear in your task cards 30 minutes ahead.</p>'+sections,'laundry');
  }
  book(v){const member=H.HouseFeatures.member(this.members,v.memberId),queue=v.booking==='queue';this.commit(()=>H.HouseFeatures.reserve(this.object,v.machine,member,queue?Date.now():Date.parse(v.start),Number(v.minutes),{queue}),'Appliance reserved.');this.laundry();}
  board(){
   const tasks=this.object.customState.tasks||[];
   const items=tasks.map(t=>'<li class="'+(t.completedAt?'is-done':'')+'"><div><strong>'+E(t.text)+'</strong><small>'+t.assignees.map(id=>E(this.name(id))+(t.completedBy?.includes(id)?' ✓':'')).join(', ')+'</small><small class="'+(!t.completedAt&&t.dueAt<Date.now()?'house-overdue':'')+'">Due '+date(t.dueAt)+'</small></div><div class="house-action-row">'+button('task-toggle',t.completedBy?.includes(this.controller.tasks.memberId)||t.completedAt?'Reopen my part':'My part done','data-id="'+t.id+'"'+(t.assignees.includes(this.controller.tasks.memberId)?'':' disabled'))+button('task-delete','Remove','data-id="'+t.id+'"')+'</div></li>').join('');
   this.dialog('Message board','<ul class="house-item-list">'+(items||'<li class="help">No tasks yet.</li>')+'</ul><form data-h-form="task-add" class="house-interaction-form"><label>Task<input name="text" maxlength="160" required placeholder="A short description"></label><fieldset><legend>Assign to</legend>'+this.checks('assignee:',['self'])+'</fieldset><label>Finish before<input type="datetime-local" name="due" value="'+localDate(Date.now()+86400000)+'" required></label><button type="submit">Add task</button></form>','board');
  }
  addTask(v){this.commit(()=>H.HouseFeatures.addTask(this.object,v.text,this.picked(v,'assignee:'),Date.parse(v.due),this.members),'Task added.');this.board();}
  door(){
   const social=this.house.social,items=social.requests.slice().reverse().map(r=>'<li><div><strong>'+E(r.text)+'</strong><small>From '+E(this.name(r.authorId))+' · '+date(r.createdAt)+'</small>'+r.recipients.map(w=>'<small>'+E(this.name(w.memberId))+' · '+E(w.response)+'</small>').join('')+'</div>'+button('request-delete','Remove','data-id="'+r.id+'"')+'</li>').join('');
   this.dialog('At the door','<form data-h-form="door-visibility" class="house-interaction-form"><label><input type="checkbox" name="public"'+(social.isPublic?' checked':'')+'>Public room</label><button type="submit">Save visibility</button></form><p class="help">Local preview: this setting does not publish the room online. Requests appear in the roommate inboxes in this browser.</p><details open><summary>Roommate requests</summary><ul class="house-item-list">'+(items||'<li class="help">No requests yet.</li>')+'</ul><form data-h-form="request-send" class="house-interaction-form"><label>From<select name="authorId">'+this.options()+'</select></label><label>Message<textarea name="text" maxlength="240" required placeholder="Could someone pick up milk?"></textarea></label><label>Finish before<input type="datetime-local" name="due" value="'+localDate(Date.now()+86400000)+'" required></label><fieldset><legend>Notify</legend>'+this.checks('recipient:',this.members.filter(m=>m.id!=='self').map(m=>m.id))+'</fieldset><button type="submit">Send to local inboxes</button></form></details>','door');
  }
  inbox(memberId){
   H.HouseFeatures.member(this.members,memberId);this.inboxMember=memberId;
   const requests=this.house.social.requests.filter(r=>r.recipients.some(w=>w.memberId===memberId));
   const items=requests.slice().reverse().map(r=>{const response=r.recipients.find(w=>w.memberId===memberId).response;return '<li><div><strong>'+E(r.text)+'</strong><small>From '+E(this.name(r.authorId))+' · '+date(r.createdAt)+'</small><small>'+E(response)+'</small></div>'+(response==='pending'?'<div class="house-action-row">'+button('request-respond','Accept','data-id="'+r.id+'" data-value="accepted"')+button('request-respond','Decline','data-id="'+r.id+'" data-value="declined"')+'</div>':'')+'</li>';}).join('');
   this.dialog(this.name(memberId)+' · Inbox',button('member-info','Info','data-id="'+E(memberId)+'"')+'<p class="help">Local roommate preview. Responses here are saved in this browser.</p><ul class="house-item-list">'+(items||'<li>No messages.</li>')+'</ul>','inbox');
  }
  memberInfo(memberId){
   const m=this.members.find(m=>m.id===memberId);if(!m)return;
   const fields=[['About',m.bio],['School / neighbourhood',m.campus],['Pronouns',m.pronouns],...Object.entries(m.habits||{}).map(([key,value])=>[key,value])].filter(([,value])=>typeof value==='string'&&value.trim());
   this.dialog(m.name+' · Info',(m.id===this.controller.tasks.memberId?'<p class="house-you-label">You</p>':'')+(fields.length?'<dl class="house-profile-info">'+fields.map(([label,value])=>'<dt>'+E(label)+'</dt><dd>'+E(value)+'</dd>').join('')+'</dl>':'<p>No profile details yet.</p>')+button('member','Local inbox','data-id="'+E(memberId)+'"'),'member-info');
  }
  applianceStatus(){
   if(this.view!=='laundry'||!this.ui.modal.open)return;
   const o=this.house.objects.find(o=>o.id===this.objectId);if(!o)return;
   for(const label of this.ui.modal.querySelectorAll('[data-booking-status]')){const r=Object.values(o.customState.machines||{}).flat().find(r=>r.id===label.dataset.id);if(r)label.textContent=H.HouseFeatures.reservationStatus(r);}
   for(const form of this.ui.modal.querySelectorAll('[data-h-form="laundry-book"]')){const busy=H.HouseFeatures.busy(o,form.elements.machine.value);form.querySelector('[value="reserve"]').disabled=busy;form.querySelector('[value="queue"]').hidden=!busy;form.elements.start.disabled=busy;if(!busy&&!form.elements.start.dataset.edited&&document.activeElement!==form.elements.start)form.elements.start.value=localDate(Date.now());}
  }
  bill(){
   const o=this.object,b=o.customState.bill||{dueAt:Date.now()+86400000,memberId:this.controller.tasks.memberId,repeat:'monthly',note:''},name=o.objectType==='water'?'Water':'Electricity';
   this.dialog(name+' bill','<form data-h-form="bill-save" class="house-interaction-form"><label>Pay before<input name="due" type="datetime-local" required value="'+localDate(b.dueAt)+'"></label><label>Responsible roommate<select name="memberId">'+this.options(b.memberId)+'</select></label><label>Repeat<select name="repeat"><option value="monthly"'+(b.repeat==='monthly'?' selected':'')+'>Every month</option><option value="none"'+(b.repeat==='none'?' selected':'')+'>Once</option></select></label><label>Note<input name="note" maxlength="160" value="'+E(b.note)+'"></label><button type="submit">Save bill schedule</button></form>'+(o.customState.bill&&!b.paidAt?button('bill-paid','Bill paid',b.memberId!==this.controller.tasks.memberId?'disabled':''):b.paidAt?'<p>Paid '+date(b.paidAt)+'</p>':''),'bill');
  }
  lamp(){
   const l=this.object.customState.light||{on:true,brightness:1};
   this.dialog(H.Catalog[this.object.objectType].name,'<form data-h-form="lamp-save" class="house-interaction-form"><label><input name="on" type="checkbox"'+(l.on?' checked':'')+'>Light on</label><label>Brightness <input type="range" name="brightness" min="0" max="200" step="10" value="'+Math.round(l.brightness*100)+'"></label><button type="submit">Save light</button></form>','lamp');
  }
  plant(){
   const g=this.object.customState.growth,totals=new Map();
   for(const e of g.history)totals.set(e.memberId,(totals.get(e.memberId)||0)+e.delta);
   const entry=e=>'<li><div><strong>'+E(this.name(e.memberId))+' · '+(e.delta>0?'+1':'−1')+'</strong><small>'+E(e.title)+' · '+(e.delta>0?'Completed':'Overdue by 3 hours')+'</small><small>'+date(e.at)+' · '+e.score+' / 100'+(e.change!==e.delta?' · '+(e.score===0?'Plant is dead':'Capped at 100'):'')+'</small></div></li>';
   this.dialog('Sprout · Chore points','<div class="house-growth"><strong>'+g.score+' / 100'+(g.score===0?' · Dead':'')+'</strong><progress max="100" value="'+g.score+'" aria-label="Sprout health"></progress></div><p class="help">Completed +1 · more than 3 hours overdue −1, once per task and roommate. Score stays between 0 and 100. A dead plant must be replaced.</p><h3>Roommate totals</h3><p>'+([...totals].map(([id,total])=>E(this.name(id))+': '+(total>0?'+':'')+total).join(' · ')||'No chores recorded yet.')+'</p><p class="help">Totals show earned and lost points, including points capped at 100.</p><h3>Recent activity</h3><ul class="house-item-list">'+(g.history.slice(-3).reverse().map(entry).join('')||'<li>Freshly planted · 100 points</li>')+'</ul><details><summary>History · '+g.history.length+' events</summary><ul class="house-item-list house-growth-history">'+g.history.slice().reverse().map(entry).join('')+'<li>Placed · '+date(g.placedAt)+' · 100 / 100</li></ul></details>','plant');
  }
  arrangementItems(day,scope){
   let rows=H.HouseChores.arrangement(this.house,this.members);if(scope==='mine')rows=rows.filter(t=>!t.members.length||t.members.includes(this.controller.tasks.memberId));
   if(day)rows=rows.filter(t=>{const first=localDate(t.startAt||t.dueAt).slice(0,10),last=localDate(t.endAt||t.dueAt).slice(0,10);return first<=day&&last>=day;});
   return rows.map(t=>'<li class="'+(t.dueAt<Date.now()?'house-overdue':'')+'"><div><strong>'+E(t.title)+'</strong><small>'+E(t.source)+' · '+(t.members.map(id=>E(this.name(id))).join(', ')||'Everyone')+'</small><small>'+date(t.startAt||t.dueAt)+(t.endAt?' → '+date(t.endAt):'')+'</small><p>'+E(t.description)+'</p>'+(t.dueAt<Date.now()?'<small>'+E(this.controller.tasks.timeLabel(t,Date.now()))+'</small>':'')+'</div>'+ (t.members.includes(this.controller.tasks.memberId)?button('personal-open','Details','data-key="'+E(t.key)+'"'):t.objectId?button('arrangement-object','Open','data-id="'+E(t.objectId)+'"'):'')+'</li>').join('');
  }
  arrangementCareKey(){return H.HouseChores.arrangement(this.house,this.members).filter(t=>['care','cat-missing'].includes(t.kind)).map(t=>t.key+':'+t.dueAt).join('|');}
  arrangementStatus(){
   const list=this.ui.modal.querySelector('.house-agenda');if(this.view!=='arrangement'||!this.ui.modal.open||!list)return;
   const key=this.arrangementCareKey();if(key===this.lastArrangementCare)return;this.lastArrangementCare=key;
   list.innerHTML=this.arrangementItems(this.arrangementDay,this.arrangementScope)||'<li>No scheduled items for this view.</li>';
  }
  arrangement(day=this.arrangementDay||'',scope=this.arrangementScope||'all'){
   this.arrangementDay=day;this.arrangementScope=scope;this.lastArrangementCare=this.arrangementCareKey();
   const items=this.arrangementItems(day,scope);
   this.dialog('Arrangement','<form data-h-form="arrangement-filter" class="house-interaction-form"><div class="house-inline-fields"><label>Date<input type="date" name="day" value="'+E(day)+'"></label><label>Show<select name="scope"><option value="all"'+(scope==='all'?' selected':'')+'>All roommates</option><option value="mine"'+(scope==='mine'?' selected':'')+'>Mine</option></select></label></div><div class="house-action-row"><button type="submit">View day</button>'+button('arrangement-all','All upcoming')+'</div></form><p class="help">Board tasks, trash and cleaning rotations, utility bills, appliance bookings, accepted requests and Pip’s feeding deadline. Recurring chores show their next deadline.</p><ul class="house-item-list house-agenda">'+(items||'<li>No scheduled items for this view.</li>')+'</ul>','arrangement');
  }
  lighting(){
   const l=this.house.lighting;
   this.dialog('Time & weather','<label class="house-follow-time"><input type="checkbox" data-h-light-mode'+(l.mode==='auto'?' checked':'')+'>Follow current time</label><p data-light-status></p><div class="house-light-labels"><span>Night</span><span>Day</span></div><input class="house-light-slider" type="range" min="0" max="100" step="1" aria-label="Room brightness" data-h-light-range><p class="help">Drag to set the light yourself, or follow the time on this device. Editing grid lines stay visible.</p><div class="house-weather-settings"><label for="house-weather">Outside the window</label><select id="house-weather" data-h-weather><option value="auto">Automatic · a changing sky</option><option value="sunny">☀ Sunny</option><option value="rain">☂ Rain</option><option value="snow">❄ Snow</option></select><p data-weather-status role="status"></p><p class="help">Automatic skies last 30–60 minutes and are saved with your room. Rain and snow stay outside the window.</p></div>','lighting');this.lightStatus();
  }
  lightStatus(){
   if(this.view!=='lighting'||!this.ui.modal.open)return;
   const l=this.controller.lightPreview||this.house.lighting,level=H.HouseFeatures.lightLevel(l),range=this.ui.modal.querySelector('[data-h-light-range]');if(!range)return;
   if(document.activeElement!==range||l.mode==='auto')range.value=Math.round(level*100);
   this.ui.modal.querySelector('[data-h-light-mode]').checked=l.mode==='auto';
   this.ui.modal.querySelector('[data-light-status]').textContent=l.mode==='auto'?new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · Following local time':'Manual · '+Math.round(level*100)+'%';
   const w=this.house.weather,weatherSelect=this.ui.modal.querySelector('[data-h-weather]');
   weatherSelect.value=w.mode==='auto'?'auto':w.kind;
   this.ui.modal.querySelector('[data-weather-status]').textContent=({sunny:'Clear skies',rain:'Soft rain',snow:'Gentle snow'})[w.kind]+(w.mode==='auto'?' · Next change around '+new Date(w.nextChangeAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):' · Stays until you change it');
  }
  previewLight(value){this.controller.lightPreview={mode:'manual',level:Math.max(0,Math.min(1,Number(value)/100))};this.controller.applyLighting();this.lightStatus();}
  music(){
   const o=this.object,s=this.controller.sound,m=s.settings(o),tracks=s.tracks(o);
   this.dialog('Music','<div class="house-player"><small>NOW PLAYING</small><h3 data-music-current></h3><p data-music-status></p><div class="house-player-controls">'+button('music-prev','⏮','aria-label="Previous song"')+button('music-toggle','Play music','class="house-primary" data-music-toggle')+button('music-next','⏭','aria-label="Next song"')+'</div><input type="range" min="0" max="1000" value="0" aria-label="Song position" data-music-seek><div class="house-playback-time"><span data-music-elapsed>0:00</span><span data-music-duration>0:00</span></div></div><div class="house-music-settings"><label>Volume <input type="range" name="volume" min="0" max="100" value="'+Math.round(m.volume*100)+'" data-h-music-setting="volume"></label><label>Repeat<select name="loop" data-h-music-setting="loop">'+[['playlist','Playlist'],['track','This song'],['off','Off']].map(([id,name])=>'<option value="'+id+'"'+(m.loop===id?' selected':'')+'>'+name+'</option>').join('')+'</select></label></div><h3 class="house-playlist-title">Your playlist</h3><ol class="house-playlist">'+tracks.map((t,i)=>'<li><button data-h-action="music-track" data-value="'+i+'" class="house-song" aria-label="Play '+E(t.name)+'"><span data-song-indicator>▷</span><span><strong>'+E(t.name)+'</strong><small>'+E(t.artist||'Your upload')+'</small></span></button>'+(t.id.startsWith('audio-')?'<div class="house-song-tools">'+button('music-up','↑','data-id="'+t.id+'" aria-label="Move '+E(t.name)+' up"')+button('music-remove','×','data-id="'+t.id+'" aria-label="Remove '+E(t.name)+'"')+'</div>':'')+'</li>').join('')+'</ol><label class="house-add-audio">＋ Add songs<input id="house-audio-files" type="file" accept="audio/*" multiple></label><p class="help">Up to 10 uploads · 10 MB each. Music starts when you enter the room and remembers when you pause it.</p><p class="help">Default lofi by <a href="https://opengameart.org/content/lo-fi-and-chill-collection" target="_blank" rel="noopener">Holizna · CC0</a>.</p>','music');this.musicStatus();
  }
  musicStatus(){
   if(this.view!=='music'||!this.ui.modal.open)return;const el=this.ui.modal.querySelector('[data-music-current]');if(!el)return;
   const s=this.controller.sound,o=this.house.objects.find(o=>o.id===this.objectId);if(!o)return;
   const same=s.objectId===o.id,active=same&&!s.audio.paused,track=s.tracks(o)[same?s.index:0],duration=same&&Number.isFinite(s.audio.duration)?s.audio.duration:0,elapsed=same?s.audio.currentTime:0;
   const stamp=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
   el.textContent=track?.name||'Your playlist';this.ui.modal.querySelector('[data-music-status]').textContent=s.lastError||(s.gestureNeeded?'Click Play or anywhere in the room to start.':s.loading&&same?'Loading…':active?'Playing':'Paused');
   const toggle=this.ui.modal.querySelector('[data-music-toggle]');toggle.textContent=active?'Pause music':'Play music';toggle.disabled=s.loading&&same;
   this.ui.modal.querySelector('[data-music-elapsed]').textContent=stamp(elapsed);this.ui.modal.querySelector('[data-music-duration]').textContent=stamp(duration);
   const seek=this.ui.modal.querySelector('[data-music-seek]');seek.disabled=!duration;if(document.activeElement!==seek)seek.value=duration?elapsed/duration*1000:0;
   for(const row of this.ui.modal.querySelectorAll('.house-song')){const current=same&&Number(row.dataset.value)===s.index;row.classList.toggle('is-current',current);row.querySelector('[data-song-indicator]').textContent=current&&active?'♫':'▷';if(current)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');}
  }
  musicConfig(){return this.object.customState.music||={tracks:[],loop:'playlist',volume:.25,enabled:true};}
  async uploadAudio(files){
   const id=this.objectId,o=this.object,current=o.customState.music?.tracks||[];if(current.length+files.length>10)throw new Error('Keep up to 10 custom tracks.');
   const tracks=[];for(const file of files)tracks.push(await H.MediaStore.audio(file));
   if(this.controller.disposed)return;const target=this.house.objects.find(o=>o.id===id&&o.objectType==='speaker');if(!target)throw new Error('This speaker was removed.');
   this.commit(()=>{const m=target.customState.music||={tracks:[],loop:'playlist',volume:.25,enabled:true};if(m.tracks.length+tracks.length>10)throw new Error('Keep up to 10 custom tracks.');m.tracks.push(...tracks);},'Audio added.');
   if(this.objectId===id&&this.ui.modal.open)this.music();
  }
  async action(action,p={}){
   switch(action){
    case 'bill-save':{
     const memberId=H.HouseFeatures.member(this.members,p.memberId),dueAt=Date.parse(p.due);if(!Number.isSafeInteger(dueAt)||dueAt<Date.now())throw new Error('Choose a future bill deadline.');
     this.commit(()=>{this.object.customState.bill={memberId,dueAt,repeat:p.repeat,anchorDay:new Date(dueAt).getDate(),note:String(p.note||'').slice(0,160),paidAt:null};},'Bill schedule saved.');this.bill();return true;
    }
    case 'bill-paid':{const task=H.HouseTasks.forMember(this.house,this.controller.tasks.memberId).find(t=>t.kind==='bill'&&t.objectId===this.objectId);if(!task)throw new Error('No unpaid bill is assigned to you.');this.commit(()=>H.HouseTasks.complete(this.house,this.controller.tasks.memberId,task.key),'Bill paid.');this.bill();return true;}
    case 'lamp-save':this.commit(()=>{this.object.customState.light={on:p.on==='on',brightness:Number(p.brightness)/100};},'Lamp updated.');this.lamp();return true;
    case 'arrangement-filter':this.arrangement(p.day,p.scope);return true;
    case 'arrangement-all':this.arrangement('','all');return true;
    case 'arrangement-object':this.open(this.house.objects.find(o=>o.id===p.id));return true;
    case 'fridge-add':this.commit(()=>H.HouseFeatures.addInventory(this.object,p.name,p.section,Number(p.quantity)),'Item added.');this.fridge();return true;
    case 'fridge-plus':case 'fridge-minus':this.changeFood(p.id,action==='fridge-plus'?1:-1);return true;
    case 'fridge-return':this.fridge();return true;
    case 'fridge-restock':{
     if(!this.restockItem)throw new Error('This restocking request is no longer open.');
     const board=this.house.objects.find(o=>o.id===p.boardId&&o.objectType==='board');if(!board)throw new Error('Choose a Message board.');
     this.commit(()=>H.HouseFeatures.addTask(board,p.title,[p.memberId],new Date(p.due).getTime(),this.members),'Restocking task added.');this.fridge();return true;
    }
    case 'trash-save':this.saveTrash(p);return true;
    case 'trash-done':this.done();return true;
    case 'art-empty':this.ui.closeModal();return true;
    case 'upload-art':await this.uploadArt(p.file);return true;
    case 'upload-audio':await this.uploadAudio(p.files);return true;
    case 'laundry-book':this.book(p);return true;
    case 'laundry-cancel':this.commit(()=>{if(!H.HouseFeatures.machineKeys(this.object).includes(p.key))throw new Error('Choose a machine.');this.object.customState.machines[p.key]=this.object.customState.machines[p.key].filter(r=>r.id!==p.id);},'Reservation cancelled.');this.laundry();return true;
    case 'task-add':this.addTask(p);return true;
    case 'task-toggle':this.commit(()=>{const t=this.object.customState.tasks.find(t=>t.id===p.id);if(!t)throw new Error('Task not found.');const who=this.controller.tasks.memberId;if(!t.assignees.includes(who))throw new Error('This task is not assigned to you.');if(t.completedAt||t.completedBy?.includes(who)){const done=t.completedBy||(t.completedAt?t.assignees:[]);t.completedAt=null;t.completedBy=done.filter(id=>id!==who);}else H.HouseTasks.complete(this.house,who,'board:'+this.objectId+':'+t.id+':'+t.dueAt);},'Task updated.');this.board();return true;
    case 'task-delete':this.commit(()=>{this.object.customState.tasks=this.object.customState.tasks.filter(t=>t.id!==p.id);},'Task removed.');this.board();return true;
    case 'door-visibility':this.commit(()=>{this.house.social.isPublic=p.public==='on';},'Visibility saved for the local preview.');this.door();return true;
    case 'request-send':this.commit(()=>H.HouseFeatures.send(this.house,p.text,p.authorId,this.picked(p,'recipient:'),this.members,Date.now(),Date.parse(p.due)),'Request added to local inboxes.');this.door();return true;
    case 'request-delete':this.commit(()=>{this.house.social.requests=this.house.social.requests.filter(r=>r.id!==p.id);},'Request removed.');this.door();return true;
    case 'request-respond':this.commit(()=>H.HouseFeatures.respond(this.house,p.id,this.inboxMember,p.value),'Response saved.');this.inbox(this.inboxMember);return true;
    case 'light-mode':case 'light-level':this.controller.lightPreview=null;this.commit(()=>{if(action==='light-mode'){if(!p.value)this.house.lighting.level=H.HouseFeatures.lightLevel(this.house.lighting);this.house.lighting.mode=p.value?'auto':'manual';}else this.house.lighting={mode:'manual',level:Number(p.value)/100};},'Room lighting saved.');this.lightStatus();return true;
    case 'weather':this.commit(()=>H.HouseFeatures.setWeather(this.house,p.value),'Window weather saved.');this.lightStatus();return true;
    case 'music-setting':this.commit(()=>{const m=this.musicConfig();if(p.key==='loop')m.loop=p.value;else if(p.key==='volume')m.volume=Number(p.value)/100;},'Music settings saved.');this.musicStatus();return true;
    case 'music-toggle':{const enabled=await this.controller.sound.toggle(this.objectId);this.commit(()=>{this.musicConfig().enabled=enabled;},enabled?'Music on.':'Music paused.');this.musicStatus();return true;}
    case 'music-track':this.controller.sound.setEnabled(true);await this.controller.sound.play(this.objectId,Number(p.value));this.commit(()=>{this.musicConfig().enabled=true;},'Now playing.');return true;
    case 'music-prev':case 'music-next':{const s=this.controller.sound,n=s.tracks(this.object).length;s.setEnabled(true);await s.play(this.objectId,s.objectId===this.objectId?(s.index+(action==='music-prev'?-1:1)+n)%n:0);this.commit(()=>{this.musicConfig().enabled=true;},'Now playing.');return true;}
    case 'music-remove':this.commit(()=>{const m=this.musicConfig();m.tracks=m.tracks.filter(t=>t.id!==p.id);},'Track removed.');this.controller.sound.sync();this.music();return true;
    case 'music-up':this.commit(()=>{const list=this.musicConfig().tracks,i=list.findIndex(t=>t.id===p.id);if(i>0)[list[i-1],list[i]]=[list[i],list[i-1]];},'Playlist reordered.');this.controller.sound.sync();this.music();return true;
   }
   return false;
  }
 }
 H.InteractionSystem=InteractionSystem;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
