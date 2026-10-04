(function(H){
  'use strict';
  class CameraController {
    constructor(camera,element){
      this.camera=camera;this.element=element;this.target=new THREE.Vector3(3,.6,2.5);this.minZoom=.55;this.maxZoom=2.5;this.span=9;this.update();
    }
    resize(width,height){
      const aspect=width/Math.max(height,1);
      // Refit projection when a sidebar, mobile breakpoint or toolbar changes the viewport.
      if(this.fitSize){const sum=this.fitSize.width+this.fitSize.depth;this.span=Math.max(7.8,sum*.44+3,(sum*.71+3)/Math.max(aspect,.15));}
      this.camera.left=-this.span*aspect/2;this.camera.right=this.span*aspect/2;this.camera.top=this.span/2;this.camera.bottom=-this.span/2;this.camera.updateProjectionMatrix();
    }
    update(){this.camera.position.copy(this.target).add(new THREE.Vector3(12,12,12));this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
    pan(dx,dy){
      const scale=this.span/(this.element.clientHeight*this.camera.zoom),right=new THREE.Vector3(1,0,-1).normalize(),forward=new THREE.Vector3(1,0,1).normalize();
      this.target.addScaledVector(right,-dx*scale);this.target.addScaledVector(forward,-dy*scale*1.73);
      this.target.x=THREE.MathUtils.clamp(this.target.x,-15,18);this.target.z=THREE.MathUtils.clamp(this.target.z,-15,18);this.update();
    }
    zoom(factor){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom*factor,this.minZoom,this.maxZoom);this.camera.updateProjectionMatrix();}
    frame(h){
      const floors=h.structure.floors, xs=floors.map(f=>f.grid.x),zs=floors.map(f=>f.grid.z);
      const minX=xs.length?Math.min(...xs):0,maxX=xs.length?Math.max(...xs)+1:1,minZ=zs.length?Math.min(...zs):0,maxZ=zs.length?Math.max(...zs)+1:1;
      const visualHeight=h.structure.walls.length?2.4:h.objects.length?1.1:.12;
      this.target.set((minX+maxX)/2,visualHeight/2,(minZ+maxZ)/2);
      const width=maxX-minX,depth=maxZ-minZ,aspect=this.element.clientWidth/Math.max(this.element.clientHeight,1);
      this.fitSize={width,depth};
      this.span=Math.max(7.8,(width+depth)*.44+3,((width+depth)*.71+3)/aspect);
      this.camera.zoom=1;this.resize(this.element.clientWidth,this.element.clientHeight);this.update();
    }
  }
  H.CameraController=CameraController;
})(globalThis.RoomBloomHouse=globalThis.RoomBloomHouse||{});
