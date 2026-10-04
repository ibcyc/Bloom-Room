/* Persistent interaction data and domain operations. No DOM, playback, or network side effects. */
(function(H){
 'use strict';
 const MAX_AUDIO=10*1024*1024;
 class HouseFeatures {
  static validate(h){
   const fail=m=>{throw new Error(m);},plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
   const text=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n;
   const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s)&&!(s in Object.prototype);
   const time=n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000;
   const members=a=>Array.isArray(a)&&a.length>0&&a.length<=4&&new Set(a).size===a.length&&a.every(id);
   const unique=a=>new Set(a.map(x=>x.id)).size===a.length;
   if(h.lighting===undefined)h.lighting={mode:'auto',level:1};
   if(!plain(h.lighting)||!['auto','manual'].includes(h.lighting.mode)||!Number.isFinite(h.lighting.level)||h.lighting.level<0||h.lighting.level>1)fail('Invalid room lighting.');
   if(h.weather===undefined)h.weather=this.newWeather();
   if(!plain(h.weather)||!['auto','manual'].includes(h.weather.mode)||!['sunny','rain','snow'].includes(h.weather.kind)||!time(h.weather.nextChangeAt))fail('Invalid window weather.');
   for(const o of h.objects){
    const c=o.customState;
    if(o.objectType==='plant'&&c.growth===undefined)c.growth={placedAt:Date.now(),score:100,deadAt:null,history:[]};
    if(c.growth!==undefined){
     const g=c.growth;
     if(o.objectType!=='plant'||!plain(g)||!time(g.placedAt)||!Number.isInteger(g.score)||g.score<0||g.score>100||(g.deadAt!==null&&!time(g.deadAt))||!Array.isArray(g.history))fail('Invalid plant history.');
     let score=100,last=g.placedAt;const keys=new Set();
     for(const e of g.history){
      if(!plain(e)||!text(e.key,500)||keys.has(e.key)||!time(e.at)||e.at<g.placedAt||e.at<last||!id(e.memberId)||!text(e.title,240)||![1,-1].includes(e.delta)||!Number.isInteger(e.change)||!Number.isInteger(e.score))fail('Invalid chore record.');
      const next=score===0?0:Math.max(0,Math.min(100,score+e.delta));if(e.score!==next||e.change!==next-score)fail('Invalid chore score.');score=next;last=e.at;keys.add(e.key);
     }
     if(score!==g.score||(score===0)!==(g.deadAt!==null))fail('Invalid plant score.');
    }
    if(c.inventory!==undefined){
     if(o.objectType!=='fridge'||!Array.isArray(c.inventory)||c.inventory.length>100||!unique(c.inventory))fail('Invalid refrigerator inventory.');
     for(const item of c.inventory)if(!plain(item)||!id(item.id)||!text(item.name,80)||!['chilled','frozen'].includes(item.section)||!Number.isSafeInteger(item.quantity)||item.quantity<0||item.quantity>9999)fail('Inventory needs an item name and quantity from 0 to 9,999.');
    }
    if(o.objectType==='custom'){
     const m=c.model;if(!plain(m)||!id(m.id)||!m.id.startsWith('model-')||!text(m.name,80)||!Number.isInteger(m.bytes)||m.bytes<20||m.bytes>10*1024*1024)fail('Invalid custom model.');
    }else if(c.model!==undefined)fail('Only custom objects can contain a model.');
    if(c.light!==undefined&&(!['lamp','floorlamp'].includes(o.objectType)||!plain(c.light)||typeof c.light.on!=='boolean'||!Number.isFinite(c.light.brightness)||c.light.brightness<0||c.light.brightness>2))fail('Invalid lamp settings.');
    if(c.bill!==undefined){const b=c.bill;if(!['water','electricity'].includes(o.objectType)||!plain(b)||!id(b.memberId)||!time(b.dueAt)||!['none','monthly'].includes(b.repeat)||!Number.isInteger(b.anchorDay)||b.anchorDay<1||b.anchorDay>31||typeof b.note!=='string'||b.note.length>160||(b.paidAt!==null&&!time(b.paidAt)))fail('Invalid utility bill.');}

    if(o.supportId!==undefined&&(!id(o.supportId)||!H.Catalog[o.objectType].tabletop||!Number.isInteger(o.supportSlot)||o.supportSlot<0||o.supportSlot>=H.tableSlots(h.objects.find(t=>t.id===o.supportId)||{})))fail('Invalid tabletop support.');
    if(c.image!==undefined&&(o.objectType!=='art'||typeof c.image!=='string'||c.image.length>250000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(c.image)))fail('Use a valid picture for wall art.');
    if(c.schedule){const s=c.schedule;if(s.intervalHours!==undefined&&(!Number.isInteger(s.intervalHours)||s.intervalHours<1||s.intervalHours>720))fail('Trash interval must be 1–720 hours.');if(s.nextDueAt!==undefined&&!time(s.nextDueAt))fail('Invalid trash due time.');}
    if(c.machines!==undefined){
     if(!['laundry','oven'].includes(o.objectType)||!plain(c.machines))fail('Invalid appliance schedule.');
     for(const machine of this.machineKeys(o)){
      const list=c.machines[machine];if(!Array.isArray(list)||list.length>100||!unique(list))fail('Invalid laundry reservations.');
      for(const r of list)if(!plain(r)||!id(r.id)||!id(r.memberId)||!time(r.startAt)||!time(r.endAt)||r.endAt<=r.startAt||r.endAt-r.startAt>1440*60000||['startedAt','completedAt'].some(k=>r[k]!==undefined&&r[k]!==null&&!time(r[k])))fail('Invalid appliance reservation.');
      const sorted=list.filter(r=>!r.completedAt).sort((a,b)=>a.startAt-b.startAt);for(let i=1;i<sorted.length;i++)if(sorted[i].startAt<sorted[i-1].endAt)fail('Appliance reservations cannot overlap.');
     }
    }
    if(c.tasks!==undefined){
     if(o.objectType!=='board'||!Array.isArray(c.tasks)||c.tasks.length>60||!unique(c.tasks))fail('Invalid board tasks.');
     for(const t of c.tasks)if(!plain(t)||!id(t.id)||!text(t.text,160)||!members(t.assignees)||!time(t.dueAt)||!time(t.createdAt)||(t.completedAt!==null&&!time(t.completedAt)))fail('Invalid board task.');
     for(const t of c.tasks)if(t.completedBy!==undefined&&(!Array.isArray(t.completedBy)||t.completedBy.some(w=>!t.assignees.includes(w))||new Set(t.completedBy).size!==t.completedBy.length))fail('Invalid task completion.');
    }
    if(c.music!==undefined){
     const m=c.music;if(o.objectType!=='speaker'||!plain(m)||!['off','track','playlist'].includes(m.loop)||typeof m.volume!=='number'||m.volume<0||m.volume>1||!Array.isArray(m.tracks)||m.tracks.length>10||!unique(m.tracks))fail('Invalid speaker playlist.');
     if(m.enabled!==undefined&&typeof m.enabled!=='boolean')fail('Invalid music setting.');
     for(const t of m.tracks)if(!plain(t)||!id(t.id)||!t.id.startsWith('audio-')||!text(t.name,80)||!Number.isFinite(t.duration)||t.duration<=0||t.duration>3600||!Number.isInteger(t.bytes)||t.bytes<1||t.bytes>MAX_AUDIO||!['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/webm','audio/flac'].includes(t.mime))fail('Invalid audio track.');
    }
   }
   if(h.social===undefined)h.social={isPublic:false,requests:[]};
   if(!plain(h.social)||typeof h.social.isPublic!=='boolean'||!Array.isArray(h.social.requests)||h.social.requests.length>100||!unique(h.social.requests))fail('Invalid door message board.');
   for(const r of h.social.requests){
    if(!plain(r)||!id(r.id)||!id(r.authorId)||!text(r.text,240)||!time(r.createdAt)||!Array.isArray(r.recipients)||!members(r.recipients.map(x=>x.memberId)))fail('Invalid roommate request.');
    if(r.dueAt!==undefined&&!time(r.dueAt))fail('Invalid request deadline.');
    for(const who of r.recipients)if(!['pending','accepted','declined'].includes(who.response)||(who.respondedAt!==null&&!time(who.respondedAt))||(who.completedAt!==undefined&&who.completedAt!==null&&!time(who.completedAt)))fail('Invalid request response.');
   }
   if(h.assets!==undefined){
    if(!plain(h.assets)||Object.keys(h.assets).length>100)fail('Invalid media bundle.');
    for(const [key,a] of Object.entries(h.assets))if(!id(key)||!(key.startsWith('audio-')||key.startsWith('model-'))||!plain(a)||!(key.startsWith('model-')?a.mime==='model/gltf-binary':['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/webm','audio/flac'].includes(a.mime))||typeof a.data!=='string'||a.data.length>Math.ceil(MAX_AUDIO/3)*4||!a.data.length||a.data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(a.data))fail('Invalid bundled audio.');
   }
  }
  static addInventory(o,name,section,quantity){
   name=String(name||'').trim();quantity=Number(quantity);
   if(o.objectType!=='fridge'||!name||name.length>80||!['chilled','frozen'].includes(section)||!Number.isSafeInteger(quantity)||quantity<1||quantity>9999)throw new Error('Enter an item name and a quantity from 1 to 9,999.');
   const list=o.customState.inventory||=[];if(list.length>=100)throw new Error('Keep up to 100 items in this refrigerator.');
   const item={id:H.uid('food'),name,section,quantity};list.push(item);return item;
  }
  static changeInventory(o,id,delta){
   const item=o.customState.inventory?.find(i=>i.id===id);if(!item||![1,-1].includes(delta))throw new Error('Choose an inventory item.');
   if(item.quantity+delta<0)throw new Error('This item is already out of stock.');
   if(item.quantity+delta>9999)throw new Error('The maximum quantity is 9,999.');
   item.quantity+=delta;return item.quantity>0;
  }
  static member(members,id){if(!members.some(m=>m.id===id))throw new Error('Choose a current roommate.');return id;}
  static machineKeys(o){return o.objectType==='oven'?['oven']:o.objectType==='laundry'?['washer','dryer']:[];}
  static newWeather(now=Date.now(),random=Math.random){
   return {mode:'auto',kind:['sunny','rain','snow'][Math.floor(random()*3)],nextChangeAt:now+Math.round((30+random()*30)*60000)};
  }
  static advanceWeather(h,now=Date.now(),random=Math.random){
   const w=h.weather;
   if(w.mode!=='auto'||now<w.nextChangeAt)return false;
   // A long absence starts one fresh, lasting spell; never replay missed changes.
   const choices=['sunny','rain','snow'].filter(kind=>kind!==w.kind);
   w.kind=choices[Math.floor(random()*choices.length)];w.nextChangeAt=now+Math.round((30+random()*30)*60000);return true;
  }
  static setWeather(h,value,now=Date.now()){
   if(!['auto','sunny','rain','snow'].includes(value))throw new Error('Choose sunny, rain, snow or automatic weather.');
   h.weather.mode=value==='auto'?'auto':'manual';
   if(value!=='auto')h.weather.kind=value;
   h.weather.nextChangeAt=now+Math.round((30+Math.random()*30)*60000);
  }
  static lightLevel(lighting,date=new Date()){
   if(lighting.mode==='manual')return lighting.level;
   const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
   return .05+.95*Math.max(0,Math.sin((hour-6)/12*Math.PI));
  }
  static skyColor(lighting,date=new Date()){
   const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
   if(lighting.mode==='manual')return mix([10,15,25],[239,244,248],lighting.level);
   const hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
   const stops=[[0,[10,15,29]],[5,[22,30,55]],[6,[179,135,151]],[8,[166,206,230]],[12,[210,231,243]],[16,[176,210,229]],[18,[222,160,131]],[20,[34,42,72]],[24,[10,15,29]]];
   const i=stops.findIndex(([h])=>h>hour),a=stops[i-1],b=stops[i];return mix(a[1],b[1],(hour-a[0])/(b[0]-a[0]));
  }
  static reservationStatus(r,now=Date.now()){return r.completedAt?'Completed':r.endAt<=now?'Ready to collect':Math.min(r.startAt,r.startedAt??r.startAt)<=now?'Running':'Reserved';}
  static busy(o,machine,now=Date.now()){return (o.customState.machines?.[machine]||[]).some(r=>!r.completedAt&&Math.min(r.startAt,r.startedAt??r.startAt)<=now&&r.endAt>now);}
  static nextBill(b,now){
   const d=new Date(b.dueAt),hours=d.getHours(),minutes=d.getMinutes();
   do{d.setDate(1);d.setMonth(d.getMonth()+1);const days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(b.anchorDay,days));d.setHours(hours,minutes,0,0);}while(d.getTime()<=now);
   return d.getTime();
  }
  static reserve(o,machine,memberId,startAt,minutes,{queue=false,now=Date.now()}={}){
   if(!this.machineKeys(o).includes(machine))throw new Error('Choose an appliance.');
   if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('Enter a duration from 1 to 1,440 minutes.');
   if(!Number.isSafeInteger(startAt)||startAt<now-60000||startAt>now+90*86400000)throw new Error('Choose a time within the next 90 days.');
   const busy=this.busy(o,machine,now);if(busy&&!queue)throw new Error('This appliance is in use. Join the queue instead.');if(!busy&&queue)throw new Error('This appliance is available. Reserve a time instead.');
   const machines=o.customState.machines||=Object.fromEntries(this.machineKeys(o).map(key=>[key,[]]));
   const list=machines[machine].filter(r=>r.endAt>now-7*86400000);if(list.length>=100)throw new Error('This machine has too many reservations.');
   let start=Math.max(now,startAt);const duration=minutes*60000;
   for(const r of list.filter(r=>!r.completedAt).sort((a,b)=>a.startAt-b.startAt)){
    if(start<r.endAt&&start+duration>Math.min(r.startAt,r.startedAt??r.startAt)){if(!queue)throw new Error('That time overlaps another reservation. Choose another time or join the queue.');start=r.endAt;}
   }
   const r={id:H.uid('booking'),memberId,startAt:start,endAt:start+duration};machines[machine]=[...list,r].sort((a,b)=>a.startAt-b.startAt);return r;
  }
  static addTask(o,text,assignees,dueAt,members,now=Date.now()){
   text=String(text||'').trim();if(!text||text.length>160)throw new Error('Write a task in 160 characters or fewer.');
   if(!assignees.length)throw new Error('Assign at least one roommate.');assignees.forEach(id=>this.member(members,id));
   if(!Number.isSafeInteger(dueAt)||dueAt<now)throw new Error('Choose a future deadline.');
   const tasks=o.customState.tasks||=[];if(tasks.length>=60)throw new Error('Keep up to 60 tasks on this board.');
   const task={id:H.uid('task'),text,assignees:[...new Set(assignees)],dueAt,createdAt:now,completedAt:null};tasks.push(task);return task;
  }
  static send(h,text,authorId,recipients,members,now=Date.now(),dueAt=now+86400000){
   text=String(text||'').trim();if(!text||text.length>240)throw new Error('Write a message in 240 characters or fewer.');
   this.member(members,authorId);recipients=[...new Set(recipients)].filter(id=>id!==authorId);if(!recipients.length)throw new Error('Choose at least one other roommate.');recipients.forEach(id=>this.member(members,id));
   if(h.social.requests.length>=100)throw new Error('Remove an old request before creating another.');
   if(!Number.isSafeInteger(dueAt)||dueAt<now)throw new Error('Choose a future deadline.');
   const request={id:H.uid('request'),authorId,text,createdAt:now,dueAt,recipients:recipients.map(memberId=>({memberId,response:'pending',respondedAt:null}))};h.social.requests.push(request);return request;
  }
  static respond(h,id,memberId,response,now=Date.now()){
   if(!['accepted','declined'].includes(response))throw new Error('Choose Accept or Decline.');
   const r=h.social.requests.find(r=>r.id===id),recipient=r?.recipients.find(r=>r.memberId===memberId);if(!recipient)throw new Error('This request was not addressed to this roommate.');
   if(recipient.response!=='pending')throw new Error('This request already has a response.');recipient.response=response;recipient.respondedAt=now;
  }
 }
 H.HouseFeatures=HouseFeatures;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
