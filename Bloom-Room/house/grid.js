/* Pure grid math. No DOM or Three.js dependencies; X/Z are cells, Y is a 0.5-unit step. */
(function (H) {
  'use strict';
  class GridSystem {
    static MIN = -8;
    static MAX = 11;
    static HEIGHT_STEP = 0.5;
    static key(p) { return p.x + ',' + p.z; }
    static edge(p, side) { return p.x + ',' + p.z + ',' + side; }
    static inside(p) { return Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= this.MIN && p.x <= this.MAX && p.z >= this.MIN && p.z <= this.MAX; }
    static world(p) { return {x:p.x + 0.5, y:(p.y || 0) * this.HEIGHT_STEP, z:p.z + 0.5}; }
    static cell(p) { return {x:Math.floor(p.x), y:0, z:Math.floor(p.z)}; }
    static neighbours(p) { return [{x:p.x-1,y:0,z:p.z},{x:p.x+1,y:0,z:p.z},{x:p.x,y:0,z:p.z-1},{x:p.x,y:0,z:p.z+1}]; }
    static crossing(a,b) {
      if (b.x === a.x + 1) return this.edge(b,'W');
      if (b.x === a.x - 1) return this.edge(a,'W');
      if (b.z === a.z + 1) return this.edge(b,'N');
      return this.edge(a,'N');
    }
    static endpoints(w) {
      const p=w.grid;
      return w.side==='N' ? [this.key(p),this.key({x:p.x+1,z:p.z})] : [this.key(p),this.key({x:p.x,z:p.z+1})];
    }
    static footprint(o) {
      let width=o.size.x, depth=o.size.z;
      if (o.rotation % 180) [width,depth]=[depth,width];
      const cells=[];
      for(let x=0;x<width;x++) for(let z=0;z<depth;z++) cells.push({x:o.grid.x+x,y:0,z:o.grid.z+z});
      return cells;
    }
    static connected(floors) {
      if(!floors.length) return true;
      const keys=new Set(floors.map(f=>this.key(f.grid))), seen=new Set(), queue=[floors[0].grid];
      while(queue.length){const p=queue.pop(), key=this.key(p); if(seen.has(key))continue; seen.add(key); for(const n of this.neighbours(p))if(keys.has(this.key(n))&&!seen.has(this.key(n)))queue.push(n);}
      return seen.size===keys.size;
    }
  }
  H.GridSystem=GridSystem;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
