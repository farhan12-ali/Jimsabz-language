// Local, procedural 3D factory. No graphics service or downloaded engine is needed.
// Robots share the same blue/silver materials, visor, antenna and J chest badge.
export const ROOM_POSITIONS = [[-5, 0, 2.5], [0, 0, 2.5], [5, 0, 2.5], [5, 0, -2.5], [0, 0, -2.5], [-5, 0, -2.5]];
export const ENTRANCE = [-5, 0, 7.0], EXECUTION = [0, 0, -7.6];
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export function factoryCamera(width, height, { angle = -.30, elevation = .77, zoom = .90, target = [0, .3, 0] } = {}) {
  const d = 24 / zoom, eye = [target[0] + Math.sin(angle) * Math.cos(elevation) * d, target[1] + Math.sin(elevation) * d, target[2] + Math.cos(angle) * Math.cos(elevation) * d];
  const forward = unit(sub(target, eye)), right = unit(cross(forward, [0, 1, 0])), up = cross(right, forward);
  return { eye, forward, right, up, width, height, focal: Math.min(width / 1.35, height) * 1.45 };
}
export function project(point, c) { const p = sub(point, c.eye), depth = dot(p, c.forward); return depth <= .15 ? null : { x: c.width / 2 + dot(p, c.right) * c.focal / depth, y: c.height / 2 - dot(p, c.up) * c.focal / depth, depth }; }
export function packagePosition(position) {
  if (position < 0) return mix(ENTRANCE, ROOM_POSITIONS[0], Math.max(0, position + 1));
  const i = Math.min(5, Math.floor(position)), a = ROOM_POSITIONS[i], b = i === 5 ? EXECUTION : ROOM_POSITIONS[i + 1];
  return mix(a, b, Math.max(0, Math.min(1, position - i)));
}
const BLUE = [.06, .34, .82], CYAN = [.10, .88, 1], SILVER = [.74, .83, .91], DARK = [.012, .028, .07], GREEN = [.12, .89, .57], RED = [1, .19, .30];
const statusColor = state => state === 'passed' ? GREEN : state === 'failed' ? RED : state === 'blocked' ? [.29, .35, .45] : CYAN;
const rotate = (p, angle) => [p[0] * Math.cos(angle) + p[2] * Math.sin(angle), p[1], -p[0] * Math.sin(angle) + p[2] * Math.cos(angle)];

class Geometry {
  constructor() { this.faces = []; }
  face(points, color, alpha = 1, emission = 0) { this.faces.push({ points, color, alpha, emission }); }
  box(center, size, color, alpha = 1, angle = 0, emission = 0) {
    const p = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(v => add(center, rotate(v.map((x, i) => x * size[i] / 2), angle)));
    for (const ids of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]]) this.face(ids.map(i => p[i]), color, alpha, emission);
  }
  sphere(center, size, color, segments = 12, rings = 7, alpha = 1, emission = 0) {
    const p = (a, b) => [center[0] + Math.cos(a) * Math.sin(b) * size[0] / 2, center[1] + Math.cos(b) * size[1] / 2, center[2] + Math.sin(a) * Math.sin(b) * size[2] / 2];
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = x / segments * Math.PI * 2, b = y / rings * Math.PI, an = (x + 1) / segments * Math.PI * 2, bn = (y + 1) / rings * Math.PI;
      this.face([p(a,b),p(an,b),p(an,bn),p(a,bn)], color, alpha, emission);
    }
  }
  beam(a, b, width, height, color, alpha = 1, emission = 0) {
    const mid = mix(a, b, .5), length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    this.box(mid, [width, height, length], color, alpha, Math.atan2(b[0] - a[0], b[2] - a[2]), emission);
  }
}
function robot(g, at, { yaw = 0, walk = 0, work = 0, failed = false, document = false, source = '', scale = 1 } = {}) {
  const point = p => add(at, rotate(p.map(v => v * scale), yaw));
  const box = (p, size, color, alpha = 1, emission = 0) => g.box(point(p), size.map(n => n * scale), color, alpha, yaw, emission);
  const ball = (p, size, color, emission = 0) => g.sphere(point(p), size.map(n => n * scale), color, 12, 7, 1, emission);
  // Feet, knees and articulated blue legs. Officers sit slightly above their chair.
  for (const side of [-1, 1]) {
    const stride = side * Math.sin(walk) * (walk ? .22 : 0);
    ball([side * .19, .18, .09 + stride], [.34,.22,.48], BLUE);
    box([side * .19, .47, stride / 2], [.21,.43,.23], SILVER);
    ball([side * .19, .40, .12 + stride], [.25,.24,.25], BLUE);
    ball([side * .19, .76, 0], [.26,.31,.28], [.29,.42,.60]);
  }
  ball([0,1.05,0], [.79,.77,.48], SILVER);
  box([0,1.14,.245], [.42,.37,.05], BLUE);
  // A geometric J, matching the language badge without raster text textures.
  box([.07,1.16,.282], [.045,.20,.016], [1,1,1], 1, .5); box([.005,1.06,.282], [.16,.04,.016], [1,1,1], 1, .5); box([-.07,1.10,.282], [.04,.09,.016], [1,1,1], 1, .5);
  ball([0,1.48,0], [.29,.18,.29], BLUE);
  ball([0,1.86,0], [1.04,.82,.82], SILVER);
  // Dark wraparound visor and emissive expressive eyes.
  ball([0,1.84,.22], [.89,.59,.52], DARK);
  for (const side of [-1, 1]) {
    ball([side * .51,1.86,0], [.18,.43,.45], BLUE);
    ball([side * .52,1.86,.03], [.11,.28,.28], CYAN, .55);
    ball([side * .22,1.88,.47], [.22,.12,.045], failed ? RED : CYAN, .95);
  }
  box([0,1.70,.465], [.20,.025,.02], failed ? RED : CYAN, 1, 1);
  ball([0,2.28,-.04], [.10,.18,.10], SILVER); ball([0,2.39,-.04], [.15,.15,.15], CYAN, 1);
  for (const side of [-1, 1]) {
    const lift = document ? .18 : side * Math.sin(work) * .05;
    ball([side * .48,1.20,0], [.28,.30,.30], BLUE);
    box([side * .52,1.02 + lift,.10 + (document ? .15 : 0)], [.19,.38,.22], SILVER);
    ball([side * .52,.86 + lift,.20 + (document ? .16 : 0)], [.22,.20,.23], BLUE);
  }
  if (document) {
    box([0,1.04,.48], [.83,.67,.035], [.91,.97,1]); box([0,1.32,.505], [.76,.09,.018], BLUE, 1, .2);
    const lines = source.split('\n').filter(Boolean).slice(0, 6);
    lines.forEach((line, i) => box([-.04,1.20 - i * .065,.51], [Math.min(.65, .05 + line.length * .012),.018,.014], [.12,.36,.55]));
  }
}
function room(g, p, index, state, active, time, evidence, light) {
  const [x,,z] = p, metal = light ? [.72,.81,.88] : [.16,.25,.38], glass = light ? [.22,.59,.77] : [.11,.52,.77], glow = statusColor(state);
  g.box([x,-.10,z], [4.5,.24,3.8], metal); g.box([x,.04,z], [4.32,.055,3.62], light ? [.91,.96,.98] : [.035,.07,.13]);
  for (const dx of [-2.22, 2.22]) for (const dz of [-1.83, 1.83]) {
    g.box([x + dx,1.22,z + dz], [.075,2.55,.075], SILVER); g.box([x + dx,2.48,z], [.075,.07,3.72], metal);
    g.box([x + dx,.1,z + dz], [.14,.11,.14], glow, 1, 0, .85);
  }
  // Glass walls with real door-sized openings on all connected sides.
  for (const dx of [-2.21, 2.21]) for (const dz of [-1.19, 1.19]) g.box([x + dx,1.20,z + dz], [.026,2.35,1.20], glass, .13);
  for (const dz of [-1.83, 1.83]) {
    for (const dx of [-1.43,1.43]) g.box([x + dx,1.20,z + dz], [1.51,2.35,.026], glass, .13);
    g.box([x,2.47,z + dz], [4.49,.07,.075], metal);
    for (const dx of [-.65,.65]) g.box([x + dx,1.1,z + dz], [.035,2.1,.04], glow, .8, 0, .6);
  }
  g.box([x,.10,z + 1.60], [3.9,.035,.035], glow, 1, 0, 1);
  // Workstation, pedestal, keyboard, metallic chair and monitor.
  g.box([x - .30,.85,z - .72], [2.65,.13,1.03], metal); g.box([x - 1.30,.43,z - .72], [.16,.84,.78], SILVER); g.box([x + .72,.43,z - .72], [.16,.84,.78], SILVER);
  g.box([x - .40,1.20,z - 1.10], [.16,.65,.13], SILVER);
  g.box([x - .40,1.62,z - 1.10], [1.42,.90,.10], [.10,.20,.34]);
  g.box([x - .40,1.62,z - 1.035], [1.29,.77,.024], [.015,.10,.18], 1, 0, .4);
  g.box([x - .35,.95,z - .42], [1.08,.025,.35], BLUE);
  for (let row = 0; row < 3; row++) for (let key = 0; key < 8; key++) g.box([x - .76 + key * .12,.975,z - .53 + row * .11], [.08,.012,.065], [.43,.71,.86]);
  g.box([x + .93,.63,z + .30], [.65,.13,.64], [.14,.24,.38]); g.box([x + .93,1.00,z - .04], [.65,.71,.10], BLUE);
  robot(g, [x + .95,.18,z + .32], { work: active ? time * .006 : 0, yaw: -.28, failed: state === 'failed', scale: .78 });
  // Holographic work tools. Their amount is derived from actual artifacts.
  const count = Math.min(7, evidence?.count || 0);
  for (let n = 0; n < count; n++) {
    if (index === 1 || index === 2) {
      const point = [x - .8 + (n % 3) * .43, 1.25 + Math.floor(n / 3) * .33, z + .80];
      g.sphere(point, [.15,.15,.15], glow, 8, 5, .8, .8);
      if (n > 0) g.beam([x - .8 + ((n - 1) % 3) * .43,1.25 + Math.floor((n - 1) / 3) * .33,z + .80], point, .018,.018,glow,.65,.8);
    } else g.box([x - 1.70 + (n % 3) * .32,.45 + Math.floor(n / 3) * .24,z + .72], [.23,.12,.30], glow, .65, Math.sin(time * .001 + n) * .05, .5);
  }
  // Room-specific scanners / symbol tables / instruction printer / asset shelf.
  if (index === 0 || index === 5) {
    g.box([x - 1.25,.45,z + .65], [1.15,.10,.65], metal); g.box([x - 1.25,1.17,z + .65], [1.15,.09,.65], SILVER);
    for (const dx of [-.53,.53]) g.box([x - 1.25 + dx,.82,z + .65], [.07,.76,.64], BLUE);
    g.box([x - 1.25,.98,z + .65], [1.02,.012,.52], glow, .20, 0, .9);
  } else if (index === 3) {
    g.box([x - 1.36,.63,z + .75], [1.10,1.12,.15], BLUE, .45);
    for (let r = 0; r < Math.min(5, count); r++) g.box([x - 1.36,.30 + r * .18,z + .84], [.88,.035,.018], glow, .8, 0, .9);
  } else if (index === 4) {
    g.box([x - 1.25,.43,z + .75], [1.05,.78,.85], SILVER); g.box([x - 1.25,.85,z + .75], [.80,.03,.55], DARK);
    g.box([x - 1.25,1.05,z + .85], [.61,.37,.026], [.88,.96,1]);
  }
}

export class FactoryScene {
  constructor(canvas, { labels, packetLabel, entranceLabel, executionLabel, onSelect, onCameraChange = () => {} }) {
    Object.assign(this, { canvas, labels, packetLabel, entranceLabel, executionLabel, onSelect, onCameraChange });
    this.angle = -.30; this.elevation = .77; this.zoom = .90; this.target = [0,.3,0]; this.goal = [...this.target]; this.auto = false; this.position = -1; this.selected = 0; this.stages = []; this.evidence = [];
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'low-power' });
    if (this.gl) { try { this.initializeGL(); } catch {
      this.gl = null;
      // A canvas cannot switch context types after WebGL initialization.
      const fallback = canvas.cloneNode(false); canvas.replaceWith(fallback); canvas = fallback; this.canvas = canvas;
    } }
    if (!this.gl) this.ctx = canvas.getContext('2d');
    this.resize = new ResizeObserver(() => this.render(performance.now())); this.resize.observe(canvas);
    let drag;
    canvas.onpointerdown = event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); this.auto = false; this.onCameraChange(false); };
    canvas.onpointermove = event => { if (!drag) return; this.angle += (event.clientX - drag.x) * .006; this.elevation = Math.max(.30, Math.min(1.30, this.elevation + (event.clientY - drag.y) * .004)); drag = { x: event.clientX, y: event.clientY }; this.render(performance.now()); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    canvas.onwheel = event => { event.preventDefault(); this.changeZoom(event.deltaY > 0 ? -.08 : .08); };
    canvas.onkeydown = event => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(event.key)) return;
      event.preventDefault(); this.auto = false; this.onCameraChange(false);
      if (event.key === 'Home') this.reset(); else if (['+','-'].includes(event.key)) this.changeZoom(event.key === '+' ? .1 : -.1);
      else { this.angle += event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0; this.elevation = Math.max(.30, Math.min(1.30, this.elevation + (event.key === 'ArrowUp' ? .09 : event.key === 'ArrowDown' ? -.09 : 0))); }
    };
  }
  initializeGL() {
    const gl = this.gl, shader = (kind, text) => { const s = gl.createShader(kind); gl.shaderSource(s, text); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Factory shader failed.'); return s; };
    this.program = gl.createProgram();
    gl.attachShader(this.program, shader(gl.VERTEX_SHADER, 'attribute vec3 a_position; attribute vec4 a_color; varying vec4 v_color; void main(){gl_Position=vec4(a_position,1.0);v_color=a_color;}'));
    gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec4 v_color; void main(){gl_FragColor=v_color;}'));
    gl.linkProgram(this.program); if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Factory shader link failed.');
    gl.useProgram(this.program); this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, size, offset] of [['a_position',3,0],['a_color',4,12]]) { const at = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, size, gl.FLOAT, false, 28, offset); }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  reset() { this.angle = -.30; this.elevation = .77; this.zoom = .90; this.goal = [0,.3,0]; this.target = [...this.goal]; this.auto = false; this.onCameraChange(false); }
  changeZoom(delta) { this.zoom = Math.max(.62, Math.min(2.25, this.zoom + delta)); }
  focus(index) { const p = ROOM_POSITIONS[index]; this.goal = [p[0],.7,p[2]]; this.zoom = 1.75; this.auto = false; this.onCameraChange(false); }
  update({ stages, result, position, selected, source, reducedMotion }) { Object.assign(this, { stages, evidence: result?.trace || [], position, selected, source, reducedMotion }); }
  render(time) {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const light = document.documentElement.dataset.theme === 'light', ratio = Math.min(devicePixelRatio || 1, 1.7);
    const w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio); if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const packet = packagePosition(this.position);
    if (this.auto) { this.goal = [packet[0] * .60,.5,packet[2] * .56]; this.zoom += (1.20 - this.zoom) * .03; }
    this.target = mix(this.target, this.goal, this.reducedMotion ? 1 : .08);
    const c = this.camera = factoryCamera(rect.width, rect.height, this), g = new Geometry(), floor = light ? [.83,.89,.94] : [.025,.045,.085];
    g.box([0,-.40,-.4], [18,.40,20], floor);
    for (let i = -8; i <= 8; i++) {
      g.box([i,-.18,-.4], [.012,.008,19], light ? [.61,.73,.83] : [.07,.17,.27]);
      g.box([0,-.18,i], [17,.008,.012], light ? [.61,.73,.83] : [.07,.17,.27]);
    }
    const route = [ENTRANCE, ...ROOM_POSITIONS, EXECUTION];
    for (let i = 0; i < route.length - 1; i++) {
      const a = [...route[i]], b = [...route[i + 1]]; a[1] = b[1] = .15;
      g.beam(a,b,.66,.15,light ? [.51,.64,.76] : [.10,.18,.28]);
      g.beam(add(a,[0,.09,0]),add(b,[0,.09,0]),.055,.025,i - 1 < this.position ? CYAN : [.13,.36,.49],1,.8);
      const distance = Math.hypot(b[0]-a[0],b[2]-a[2]);
      for (let j = .4; j < distance; j += .40) { const p = mix(a,b,j/distance); g.box(add(p,[0,.08,0]),[.70,.018,.08], SILVER,.7,Math.atan2(b[0]-a[0],b[2]-a[2])); }
    }
    for (const [i, p] of ROOM_POSITIONS.entries()) room(g,p,i,this.stages[i]?.state || 'pending',Math.floor(Math.max(0,this.position))===i,this.reducedMotion ? 0 : time,this.evidence[i],light);
    // Main gate and the two entrance officers.
    for (const x of [-6.8,-3.2]) { g.box([x,1.35,7.4],[.19,2.8,.32],SILVER); g.box([x,1.35,7.18],[.055,2.6,.035],CYAN,1,0,.9); }
    g.box([-5,2.81,7.4],[3.95,.28,.40],BLUE); g.box([-5,2.82,7.17],[3.50,.12,.025],CYAN,1,0,.8);
    robot(g,[-2.60,0,6.3],{yaw:-.16,scale:.94});
    const courierPosition = this.position < 0 ? packet : mix(ROOM_POSITIONS[0], ENTRANCE, Math.min(1, this.position / .65));
    robot(g,add(courierPosition,[-.60,0,0]),{yaw:this.position<0?Math.PI:0,walk:this.position<.65&&!this.reducedMotion?time*.007:0,document:this.position<0,source:this.source || '',scale:.94});
    // Execution landing pad and a tall blue/silver processing tower.
    g.box([0,.03,-7.6],[4.5,.25,2.2],light?[.65,.78,.87]:[.10,.20,.32]);
    for (const x of [-1.4,1.4]) { g.box([x,1.05,-8.0],[.65,2.0,.65],SILVER); g.box([x,1.05,-7.66],[.40,1.60,.035],BLUE); for(let r=0;r<6;r++)g.box([x,.48+r*.22,-7.63],[.29,.04,.02],CYAN,1,0,.8); }
    g.box([0,1.40,-8.1],[1.80,.96,.10],BLUE); g.box([0,1.40,-8.03],[1.60,.77,.022],CYAN,.7,0,.6);
    // The package is always located at the real reached/failed room or its route.
    if (this.position >= 0) {
      const at = add(packet,[0,1.16,0]), failed = this.stages[Math.floor(Math.min(5,this.position))]?.state === 'failed';
      g.box(at,[.66,.12,.48],failed?RED:SILVER); g.box(add(at,[0,.075,0]),[.59,.025,.42],failed?RED:CYAN,1,0,.8);
      for(let line=0;line<4;line++)g.box(add(at,[-.02,.093,-.13+line*.08]),[.44,.009,.019],BLUE);
    }
    const faces = this.shade(g.faces,c,light);
    if (this.gl) this.drawGL(faces,c,light); else this.drawCanvas(faces,c,ratio,light);
    for (let i=0;i<6;i++) this.label(this.labels[i],add(ROOM_POSITIONS[i],[0,2.85,0]),c);
    this.label(this.entranceLabel,[-5,3.2,7.3],c); this.label(this.executionLabel,[0,2.50,-8],c);
    const docAt=this.position<0?add(courierPosition,[-.6,2.5,0]):add(packet,[0,1.85,0]); this.label(this.packetLabel,docAt,c);
  }
  label(node,p,c) { if(!node)return;const q=project(p,c);node.hidden=!q||q.x<-80||q.x>c.width+80||q.y<-30||q.y>c.height+30;if(q){node.style.left=q.x+'px';node.style.top=q.y+'px';node.style.zIndex=String(Math.round(1000-q.depth*10));} }
  shade(faces,c,light) {
    const lamp=unit([-.4,.8,.55]);
    return faces.map(f=>{const mid=f.points.reduce((a,p)=>add(a,p.map(v=>v/f.points.length)),[0,0,0]),normal=unit(cross(sub(f.points[1],f.points[0]),sub(f.points.at(-1),f.points[0]))),view=unit(sub(c.eye,mid));
      const diffuse=Math.abs(dot(normal,lamp)),spec=Math.pow(Math.max(0,dot(normal,unit(add(lamp,view)))),24)*.32;
      return {...f,color:f.color.map((v,i)=>Math.min(1,v*((light?.62:.46)+diffuse*.48+f.emission*.45)+spec+(i===2?.035:0))),depth:dot(sub(mid,c.eye),c.forward)};});
  }
  drawGL(faces,c,light) {
    const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(...(light?[.89,.94,.97,1]:[.018,.033,.065,1]));gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const draw=(list,alpha)=>{const data=[];for(const f of list){const points=f.points.map(p=>project(p,c));if(points.some(p=>!p))continue;for(let n=1;n<points.length-1;n++)for(const i of [0,n,n+1]){const p=points[i];data.push(p.x/c.width*2-1,1-p.y/c.height*2,1-.35/p.depth,...f.color,f.alpha);}}gl.depthMask(!alpha);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,data.length/7);};
    draw(faces.filter(f=>f.alpha>=.99),false);draw(faces.filter(f=>f.alpha<.99).sort((a,b)=>b.depth-a.depth),true);gl.depthMask(true);
  }
  drawCanvas(faces,c,ratio,light) {
    const ctx=this.ctx;if(!ctx)return;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle=light?'#e2eef7':'#07101e';ctx.fillRect(0,0,c.width,c.height);
    for(const f of faces.sort((a,b)=>b.depth-a.depth)){const points=f.points.map(p=>project(p,c));if(points.some(p=>!p))continue;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=`rgba(${f.color.map(n=>Math.round(n*255)).join(',')},${f.alpha})`;ctx.fill();}
  }
  dispose(){this.resize.disconnect();if(this.gl){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}}
}
