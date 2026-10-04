/* A* on floor cells. Walls and closed doors block their shared edges. */
(function(H){
  'use strict';
  const G=H.GridSystem;
  class NavigationSystem {
    constructor(h){
      this.house=h;this.floors=new Map(h.structure.floors.map(f=>[G.key(f.grid),f.grid]));
      this.blocked=new Set(h.objects.filter(o=>o.placement==='FLOOR'&&!o.supportId).flatMap(o=>G.footprint(o).map(p=>G.key(p))));
      this.walls=new Map(h.structure.walls.map(w=>[G.edge(w.grid,w.side),w]));
      this.doors=new Map(h.structure.doors.map(d=>[d.wallId,d]));
    }
    walkable(p){return this.floors.has(G.key(p))&&!this.blocked.has(G.key(p));}
    edgeOpen(a,b){
      return !this.walls.has(G.crossing(a,b));
    }
    neighbours(p){
      return G.neighbours(p).filter(n=>this.walkable(n)&&this.edgeOpen(p,n));
    }
    path(start,goal){
      if(!this.walkable(start)||!this.walkable(goal))return null;
      const goalKey=G.key(goal),startKey=G.key(start),cost=new Map([[startKey,0]]),from=new Map(),open=[start],closed=new Set();
      const distance=p=>Math.abs(p.x-goal.x)+Math.abs(p.z-goal.z);
      while(open.length){
        open.sort((a,b)=>(cost.get(G.key(a))+distance(a))-(cost.get(G.key(b))+distance(b)));
        const current=open.shift(),key=G.key(current);if(closed.has(key))continue;
        if(key===goalKey){const path=[{...goal,y:0}];let walk=key;while(walk!==startKey){const p=from.get(walk);path.unshift({...p,y:0});walk=G.key(p);}return path;}
        closed.add(key);
        for(const n of this.neighbours(current)){const next=G.key(n),g=cost.get(key)+1;if(g<(cost.get(next)??Infinity)){cost.set(next,g);from.set(next,current);open.push(n);}}
      }
      return null;
    }
    reachable(start){
      if(!this.walkable(start))return [];
      const seen=new Set(),queue=[start],result=[];
      while(queue.length){const p=queue.pop(),key=G.key(p);if(seen.has(key))continue;seen.add(key);result.push(p);for(const n of this.neighbours(p))if(!seen.has(G.key(n)))queue.push(n);}
      return result;
    }
    closestValid(p){return [...this.floors.values()].filter(n=>this.walkable(n)).sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.z-p.z))-(Math.abs(b.x-p.x)+Math.abs(b.z-p.z)))[0]||null;}
    interactionPath(start,o){
      const turns=o.rotation/90;
      const points=o.interactionConfig.interactionPoints.map(offset=>{let x=offset.x,z=offset.z;for(let i=0;i<turns;i++)[x,z]=[-z,x];return{x:o.grid.x+x,y:0,z:o.grid.z+z};});
      return points.filter(p=>this.edgeOpen(o.grid,p)).map(p=>this.path(start,p)).filter(Boolean).sort((a,b)=>a.length-b.length)[0]||null;
    }
    nearestGoal(start,type){
      return this.house.objects.filter(o=>o.objectType===type).map(object=>({object,path:this.interactionPath(start,object)})).filter(x=>x.path).sort((a,b)=>a.path.length-b.path.length)[0]||null;
    }
  }
  H.NavigationSystem=NavigationSystem;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
