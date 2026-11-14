// インスタンス化ビルボード粒子 / 曳光弾ストリーク
import * as THREE from 'three';

const BILL_VS = `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 iPos; attribute vec4 iColor; attribute vec2 iSizeRot;
  varying vec2 vUv; varying vec4 vColor;
  void main(){
    vUv = uv; vColor = iColor;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    float c = cos(iSizeRot.y), s = sin(iSizeRot.y);
    vec2 q = vec2(position.x*c - position.y*s, position.x*s + position.y*c);
    mvPosition.xy += q * iSizeRot.x;
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;
const BILL_FS = `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D map; uniform float uLit;
  varying vec2 vUv; varying vec4 vColor;
  void main(){
    #include <logdepthbuf_fragment>
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor.rgb * mix(vec3(1.0), t.rgb, uLit), t.a * vColor.a);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }`;

export class ParticleSystem {
  constructor(max, texture, { additive = false, fog = true, lit = 1 } = {}) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iSizeRot', this.aSR);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, uLit: { value: lit } }]),
      vertexShader: BILL_VS, fragmentShader: BILL_FS,
      transparent: true, depthWrite: false, fog,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = texture;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = g;
    // CPU 状態
    this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.rot = new Float32Array(max); this.rv = new Float32Array(max);
    this.drag = new Float32Array(max); this.buoy = new Float32Array(max);
  }
  // o: {x,y,z, vx,vy,vz, life, s0,s1, c0:[r,g,b,a], c1:[r,g,b,a], drag, buoy}
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, drag = 0.5, buoy = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = Math.floor(Math.random() * this.max);
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = c0[k]; this.c1[i * 4 + k] = c1[k]; }
    this.rot[i] = Math.random() * 6.28; this.rv[i] = (Math.random() - 0.5) * 0.6;
    this.drag[i] = drag; this.buoy[i] = buoy;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        const j = --this.n;
        if (i !== j) this._copy(j, i);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d + this.buoy[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.rv[i] * dt;
      i++;
    }
    const P = this.aPos.array, C = this.aCol.array, S = this.aSR.array;
    for (let k = 0; k < this.n; k++) {
      const t = this.life[k] / this.maxLife[k];
      P[k * 3] = this.p[k * 3]; P[k * 3 + 1] = this.p[k * 3 + 1]; P[k * 3 + 2] = this.p[k * 3 + 2];
      for (let q = 0; q < 4; q++) C[k * 4 + q] = this.c0[k * 4 + q] + (this.c1[k * 4 + q] - this.c0[k * 4 + q]) * t;
      // フェードイン
      if (t < 0.08) C[k * 4 + 3] *= t / 0.08;
      S[k * 2] = this.s0[k] + (this.s1[k] - this.s0[k]) * Math.sqrt(t);
      S[k * 2 + 1] = this.rot[k];
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true;
  }
  _copy(src, dst) {
    for (let k = 0; k < 3; k++) { this.p[dst * 3 + k] = this.p[src * 3 + k]; this.v[dst * 3 + k] = this.v[src * 3 + k]; }
    for (let k = 0; k < 4; k++) { this.c0[dst * 4 + k] = this.c0[src * 4 + k]; this.c1[dst * 4 + k] = this.c1[src * 4 + k]; }
    this.life[dst] = this.life[src]; this.maxLife[dst] = this.maxLife[src];
    this.s0[dst] = this.s0[src]; this.s1[dst] = this.s1[src];
    this.rot[dst] = this.rot[src]; this.rv[dst] = this.rv[src];
    this.drag[dst] = this.drag[src]; this.buoy[dst] = this.buoy[src];
  }
}

// 静的ビルボード (雲)
export function staticBillboards(items, texture, color = [1, 1, 1, 0.85]) {
  const ps = new ParticleSystem(items.length, texture, { lit: 1 });
  for (const [x, y, z, s] of items) ps.emit(x, y, z, 0, 0, 0, 1e9, s, s, color, color, 0, 0);
  ps.update(0);
  ps.update = () => {};
  return ps;
}

// 曳光弾 (A→B の帯)
export class StreakSystem {
  constructor(max) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aW = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB); g.setAttribute('iC', this.aC); g.setAttribute('iW', this.aW);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 iA; attribute vec3 iB; attribute vec4 iC; attribute float iW;
        varying vec4 vC; varying float vY;
        void main(){
          vec4 a = modelViewMatrix * vec4(iA,1.0);
          vec4 b = modelViewMatrix * vec4(iB,1.0);
          vec4 mvPosition = mix(a, b, position.x);
          vec2 d = b.xy/ max(-b.z,0.1) - a.xy / max(-a.z,0.1);
          vec2 side = normalize(vec2(-d.y, d.x) + 1e-6);
          float w = iW * max(1.0, -mvPosition.z * 0.0018);
          mvPosition.xy += side * position.y * w;
          vC = iC; vY = position.y;
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        varying vec4 vC; varying float vY;
        void main(){
          #include <logdepthbuf_fragment>
          float a = 1.0 - abs(vY);
          gl_FragColor = vec4(vC.rgb, vC.a * a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = g; this.n = 0;
  }
  begin() { this.n = 0; }
  add(ax, ay, az, bx, by, bz, r, g, b, a, w) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const A = this.aA.array, B = this.aB.array, C = this.aC.array;
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az;
    B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
    this.aW.array[i] = w;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aA.needsUpdate = this.aB.needsUpdate = this.aC.needsUpdate = this.aW.needsUpdate = true;
  }
}

export function softTexture(kind = 'smoke') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  if (kind === 'smoke') {
    for (let i = 0; i < 14; i++) {
      const px = 32 + (Math.random() - 0.5) * 22, py = 32 + (Math.random() - 0.5) * 22, r = 10 + Math.random() * 14;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const v = 200 + Math.random() * 55;
      g.addColorStop(0, `rgba(${v},${v},${v},0.35)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
  } else {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}
