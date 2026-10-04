/* Wall-clock care is independent of animation, navigation and whether the page is open. */
(function(H){
  'use strict';
  const G=H.GridSystem,HOUR=60*60*1000;
  class AnimalSystem {
    static status(animal,now=Date.now()){
      const age=Math.max(0,now-animal.lastFedAt),remaining=Math.max(0,24*HOUR-age);
      return {placed:animal.placed,hunger:age<6*HOUR?'full':age<12*HOUR?'ok':age<18*HOUR?'hungry':'horrible',health:animal.health,remaining,expired:remaining===0||animal.health<=0};
    }
    constructor(h){this.events=[];this.elapsed=0;this.rebuild(h);}
    rebuild(h){
      this.house=h;this.nav=new H.NavigationSystem(h);this.path=[];this.goal=null;this.transition=null;
      this.grid={...h.animal.grid};this.position=G.world(this.grid);
      this.visible=!!(h.animal.placed&&this.nav.walkable(this.grid));
      if(!this.visible){h.animal.placed=false;h.animal.absentSince??=Date.now();}else h.animal.absentSince=null;
      this.state=this.visible?'Looking around':'Not placed';this.wait=1.2;this.foodCheck=0;
    }
    checkVitals(now=Date.now()){
      if(this.house.animal.placed&&AnimalSystem.status(this.house.animal,now).expired){
        this.house.animal.placed=false;this.house.animal.absentSince=Math.min(now,this.house.animal.lastFedAt+24*HOUR);this.house.animal.health=0;this.visible=false;this.path=[];this.goal=null;this.transition=null;this.state='Not placed';
        this.events.push({type:'expired',lifeId:this.house.animal.lifeId});
      }
    }
    takeEvents(){return this.events.splice(0);}
    go(type,objectId=null){
      if(!this.visible)throw new Error('Pip needs an unoccupied floor cell first.');
      let path,object=null;
      if(type==='wander'){
        const choices=this.nav.reachable(this.grid).filter(p=>G.key(p)!==G.key(this.grid));
        if(!choices.length){this.wait=3;return false;}
        path=this.nav.path(this.grid,choices[Math.floor(Math.random()*choices.length)]);
      }else{
        object=objectId?this.house.objects.find(o=>o.id===objectId&&o.objectType===type):null;
        const next=objectId?(object?{object,path:this.nav.interactionPath(this.grid,object)}:null):this.nav.nearestGoal(this.grid,type);
        if(!next?.path)throw new Error('Pip cannot reach this '+(H.Catalog[type]?.name||type)+'. Keep a clear route beside it.');
        object=next.object;path=next.path;
      }
      const start=G.world(this.grid);
      this.transition=this.position.y>0?{from:{...this.position},to:start,elapsed:0,rest:false}:null;
      if(!this.transition)this.position=start;
      this.path=path.slice(1);this.goal=object?.id||null;this.state=object?'Going to '+H.Catalog[type].name:'Wandering';this.wait=0;
      if(!this.path.length&&!this.transition)this.arrive();return true;
    }
    arrive(){
      const object=this.house.objects.find(o=>o.id===this.goal);
      if(!object){this.state='Looking around';this.wait=1.5;return;}
      this.heading=Math.atan2(object.grid.x+.5-this.position.x,object.grid.z+.5-this.position.z);
      if(['bed','sofa'].includes(object.objectType)){
        const angle=object.rotation*Math.PI/180;
        const to={x:object.grid.x+.5-Math.sin(angle)*.08,y:object.objectType==='sofa'?.47:.42,z:object.grid.z+.5+Math.cos(angle)*.08};
        this.transition={from:{...this.position},to,elapsed:0,rest:true};this.state='Hopping up';
      }else this.state=H.Catalog[object.objectType].animalAction||'Resting';
      this.wait=object.objectType==='bowl'?2:4;
    }
    eat(now){
      const bowl=this.house.objects.find(o=>o.id===this.goal&&o.objectType==='bowl');if(!bowl)return;
      this.house.objects=this.house.objects.filter(o=>o.id!==bowl.id);this.house.animal.lastFedAt=now;
      this.nav=new H.NavigationSystem(this.house);this.goal=null;this.state='Looking around';this.wait=1.5;this.foodCheck=0;
      this.events.push({type:'fed',lifeId:this.house.animal.lifeId,bowlId:bowl.id,lastFedAt:now});
    }
    update(dt,now=Date.now(),allowWander=true){
      this.checkVitals(now);if(!this.visible)return;
      this.elapsed+=dt;this.foodCheck-=dt;
      // New food takes priority, including while decorating. Unreachable bowls remain available.
      const current=this.house.objects.find(o=>o.id===this.goal);
      if(current?.objectType!=='bowl'&&this.foodCheck<=0){
        this.foodCheck=1;const food=this.nav.nearestGoal(this.grid,'bowl');
        if(food)this.go('bowl',food.object.id);
      }
      if(this.transition){
        const jump=this.transition;jump.elapsed+=dt;const t=Math.min(1,jump.elapsed/.4);
        this.position={x:jump.from.x+(jump.to.x-jump.from.x)*t,y:(jump.from.y||0)+(jump.to.y-(jump.from.y||0))*t+Math.sin(Math.PI*t)*.16,z:jump.from.z+(jump.to.z-jump.from.z)*t};
        if(t===1){this.position={...jump.to};this.transition=null;if(jump.rest){const object=this.house.objects.find(o=>o.id===this.goal);this.state=H.Catalog[object?.objectType]?.animalAction||'Resting';}else if(!this.path.length)this.arrive();}
        return;
      }
      if(this.path.length){
        const next=this.path[0];
        if(!this.nav.neighbours(this.grid).some(p=>G.key(p)===G.key(next))){this.rebuild(this.house);return;}
        const target=G.world(next),dx=target.x-this.position.x,dz=target.z-this.position.z,distance=Math.hypot(dx,dz),step=dt*1.5;
        this.heading=Math.atan2(dx,dz);
        if(distance<=step){this.position=target;this.grid={...next};this.house.animal.grid={...next};this.path.shift();if(!this.path.length)this.arrive();}
        else{this.position.x+=dx/distance*step;this.position.z+=dz/distance*step;}
      }else{
        this.wait-=dt;
        if(this.wait<=0){
          if(this.state==='Eating'){this.eat(now);return;}
          if(!allowWander)return;
          const types=[...new Set(this.house.objects.filter(o=>H.Catalog[o.objectType].animalAction).map(o=>o.objectType))];
          const action=Math.random()<.55||!types.length?'wander':types[Math.floor(Math.random()*types.length)];
          try{this.go(action);}catch(_){this.go('wander');}
        }
      }
    }
    view(){return {position:this.position,visible:this.visible,heading:this.heading||0,state:this.state,path:this.path,elapsed:this.elapsed,moving:!!this.path.length};}
  }
  H.AnimalSystem=AnimalSystem;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
