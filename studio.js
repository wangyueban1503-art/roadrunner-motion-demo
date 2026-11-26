import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { makeModeMotion, makeRig } from './motion.js';

const $ = (id) => document.getElementById(id);
const host = $('scene'), status = $('status');
const LIMIT = 1.35;
const zero = () => ({x:0,z:0,yaw:0,left:0,right:0,hipYaw:0});
const clamp = (v,a,b) => Math.min(b, Math.max(a,v));
const angle = (v) => Math.atan2(Math.sin(v),Math.cos(v));
const deg = (v) => (v*180/Math.PI).toFixed(0)+'°';
const position = (x,z) => '('+x.toFixed(2)+', '+z.toFixed(2)+') m';

let scene,camera,renderer,controls,robot,posture,poseRig,marker,route;
let pose=zero(), motion=null, playing=false, elapsed=0, previous=0, frame=0;
const floor=new T.Plane(new T.Vector3(0,1,0),0);
const ray=new T.Raycaster();


function render(){renderer.render(scene,camera);}
function setView(){
  camera.position.set(.98,1.035,1.34);
  controls.target.set(.02,.145,.17);
  controls.update();
  render();
}
function resize(){
  const w=host.clientWidth,h=host.clientHeight;
  if(!w || !h) return;
  camera.aspect=w/h; camera.fov=camera.aspect<1.12 ? 54 : 43;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  render();
}
function update(p,time,length,label){
  pose=p;
  robot.position.x=p.x; robot.position.z=p.z; robot.rotation.y=p.yaw;
  const joints = poseRig(posture,p);
  $('knees').textContent = deg(joints.kneeLeft)+' / '+deg(joints.kneeRight);
  $('bank').textContent = deg(joints.bank);
  $('hip-yaw').textContent = deg(p.hipYawLeft ?? p.hipYaw ?? 0) + ' / ' + deg(p.hipYawRight ?? p.hipYaw ?? 0);
  $('pos').textContent=position(p.x,p.z);
  $('yaw').textContent=deg(angle(p.yaw));
  $('wheels').textContent=deg(p.left)+' / '+deg(p.right);
  $('contact').textContent='双轮贴地 · 视觉';
  $('time').value=length ? time/length : 0;
  $('clock').textContent=time.toFixed(2)+' / '+length.toFixed(2)+' s';
  if(status.textContent!==label) status.textContent=label;
  $('play').textContent=playing?'暂停':(length && time>=length?'重播':'播放');
  render();
}
function sample(t){
  if(!motion) return;
  const {duration, direction} = motion;
  const label = t >= duration ? '已到达目标' : !playing ? '已暂停' :
    motion.sample(t).phase;
  update(motion.sample(t), t, duration, label);
}
function tick(now){
  frame=0;
  if(!playing)return;
  if(previous)elapsed=Math.min(motion.duration,elapsed+Math.min(.08,(now-previous)/1000));
  previous=now;
  if(elapsed>=motion.duration) playing=false;
  sample(elapsed);
  if(playing)frame=requestAnimationFrame(tick);
}
function stop(){
  playing=false;previous=0;
  if(frame)cancelAnimationFrame(frame);
  frame=0;
}
function play(){
  if(!motion||playing)return;
  if(elapsed>=motion.duration)elapsed=0;
  playing=true;previous=0;sample(elapsed);frame=requestAnimationFrame(tick);
}
function plan(x,z){
  if(!robot)return;
  x=clamp(x,-LIMIT,LIMIT); z=clamp(z,-LIMIT,LIMIT);
  $('x').value=x.toFixed(2); $('z').value=z.toFixed(2);
  const next = makeModeMotion(pose, x, z, $('mode').value);
  if (!next) return;
  stop();
  motion = next;
  marker.visible = route.visible = true;
  const end = next.at(1);
  $('x').value = end.x.toFixed(2);
  $('z').value = end.z.toFixed(2);
  marker.position.set(end.x, .005, end.z);
  const vertices = route.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    const point = next.at(i / (vertices.count - 1));
    vertices.setXYZ(i, point.x, .007, point.z);
  }
  vertices.needsUpdate = true;
  route.computeLineDistances();
  elapsed=0;$('play').disabled=$('time').disabled=false;play();
}
function reset(){
  if(!robot)return;
  stop();motion=null;elapsed=0;
  route.visible=marker.visible=false;
  $('time').disabled=$('play').disabled=true;
  $('x').value='0.45';$('z').value='0.65';
  update(zero(),0,0,'已就绪');
}
function init(){
  scene=new T.Scene();scene.background=new T.Color(0xdce5eb);scene.fog=new T.Fog(0xdce5eb,3.7,7);
  camera=new T.PerspectiveCamera(43,1,.025,14);
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace=T.SRGBColorSpace;
  host.append(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.16;
  controls.minDistance=.55;controls.maxDistance=4;
  controls.addEventListener('change',render);
  scene.add(new T.HemisphereLight(0xf7faff,0x7d8696,2.35));
  const key=new T.DirectionalLight(0xfff5e7,2);key.position.set(2,4,1);scene.add(key);
  const base=new T.Mesh(new T.PlaneGeometry(24,24),new T.MeshBasicMaterial({color:0xdce5eb}));
  base.rotation.x=-Math.PI/2;base.position.y=-.004;scene.add(base);
  const grid=new T.GridHelper(2.7,18,0x8599a9,0xa3b5c3);scene.add(grid);
  const origin=new T.Mesh(new T.RingGeometry(.031,.036,36),new T.MeshBasicMaterial({color:0x748c9d}));
  origin.rotation.x=-Math.PI/2;origin.position.y=.001;scene.add(origin);
  marker=new T.Group();
  const accents=[[new T.RingGeometry(.040,.049,40),0x175fc6],[new T.CircleGeometry(.012,20),0x175fc6]];
  for(const [g,color] of accents){
    const m=new T.Mesh(g,new T.MeshBasicMaterial({color,depthWrite:false}));m.rotation.x=-Math.PI/2;marker.add(m);
  }
  route=new T.Line(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(65 * 3), 3)),new T.LineDashedMaterial({color:0x125ac5,dashSize:.034,gapSize:.024}));
  route.frustumCulled=false;route.visible=marker.visible=false;scene.add(route,marker);
  new ResizeObserver(resize).observe(host);
  setView();resize();

  let down=null;
  host.addEventListener('pointerdown',e=>{down=e.isPrimary&&e.button===0?{x:e.clientX,y:e.clientY,moved:false,id:e.pointerId}:null;});
  host.addEventListener('pointermove',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)down.moved=true;});
  host.addEventListener('pointercancel',()=>{down=null;});
  host.addEventListener('pointerup',e=>{
    const start=down;down=null;
    if(!start||start.id!==e.pointerId||start.moved||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
    const b=host.getBoundingClientRect(), ndc=new T.Vector2((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);
    ray.setFromCamera(ndc,camera);
    const point=ray.ray.intersectPlane(floor,new T.Vector3());
    if(point && Math.abs(point.x)<=LIMIT && Math.abs(point.z)<=LIMIT)
      plan(Math.round(point.x*100)/100,Math.round(point.z*100)/100);
  });
}
function fail(e){
  console.error(e);status.textContent='预览无法启动';
  $('failure').hidden=false;
  $('failure').textContent='无法加载三维场景。请检查浏览器的图形加速，或关闭页面后用项目启动文件重新打开。';
}
try{
  init();
  new GLTFLoader().load('./assets/Roadrunner-IROS.glb',(asset)=>{
    try{
      const model=asset.scene;
      const left=model.getObjectByName('L_Wheel_spin'), right=model.getObjectByName('R_Wheel_spin');
      if(!left||!right) throw new Error('Wheel nodes missing');
      model.updateMatrixWorld(true);
      const ground=Math.min(new T.Box3().setFromObject(left,true).min.y,new T.Box3().setFromObject(right,true).min.y);
      robot=new T.Group();
      posture = new T.Group();
      model.position.y -= .248;
      posture.add(model);
      robot.add(posture);
      poseRig = makeRig(model, ground);
      const shade=document.createElement('canvas'); shade.width=shade.height=64;
      const ctx=shade.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,31);
      gradient.addColorStop(0,'rgba(27,41,54,.30)'); gradient.addColorStop(.55,'rgba(27,41,54,.13)'); gradient.addColorStop(1,'rgba(27,41,54,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      const shadow=new T.Mesh(new T.PlaneGeometry(.43,.31),new T.MeshBasicMaterial({map:new T.CanvasTexture(shade),transparent:true,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;robot.add(shadow);
      scene.add(robot);
      $('go').disabled=$('reset').disabled=false;
      reset();
    }catch(e){fail(e);}
  },undefined,fail);
}catch(e){fail(e);}
$('target').addEventListener('submit',e=>{e.preventDefault();plan($('x').valueAsNumber,$('z').valueAsNumber);});
$('reset').addEventListener('click',reset);
$('view').addEventListener('click',()=>{if(controls)setView();});
$('play').addEventListener('click',()=>{if(playing){stop();sample(elapsed);}else play();});
$('time').addEventListener('input',()=>{if(!motion)return;const v=Number($('time').value);stop();elapsed=v*motion.duration;sample(elapsed);});


$('mode').addEventListener('change', () => {
  if (!robot) return;
  stop();
  const lateral = $('mode').value === 'lateral';
  const dx = lateral ? Math.cos(pose.yaw) + .45 * Math.sin(pose.yaw) : Math.sin(pose.yaw);
  const dz = lateral ? -Math.sin(pose.yaw) + .45 * Math.cos(pose.yaw) : Math.cos(pose.yaw);
  const sign = Math.abs(pose.x + dx * .55) > LIMIT || Math.abs(pose.z + dz * .55) > LIMIT ? -1 : 1;
  plan(pose.x + sign * dx * .55, pose.z + sign * dz * .55);
});

