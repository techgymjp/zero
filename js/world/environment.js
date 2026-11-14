// 空・海・雲・光源
import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { TERRAIN } from './geo.js';
import { mulberry32 } from '../util.js';

export const SUN_DIR = new THREE.Vector3();
{
  const elev = 22 * Math.PI / 180, az = 108 * Math.PI / 180; // 朝の太陽: 東南東
  SUN_DIR.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
}
export const FOG_COLOR = new THREE.Color(0xa9bfd2);

export function buildSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sky);
  // 環境マップ
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(1000);
  Object.assign(sky2.material.uniforms.sunPosition.value, u.sunPosition.value);
  for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
  envScene.add(sky2);
  const env = pm.fromScene(envScene, 0, 0.1, 2000).texture;
  scene.environment = env;
  return sky;
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x5a6a4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.copy(SUN_DIR).multiplyScalar(2000);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 220;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 5000 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);
  return { hemi, sun };
}

// 太陽光の影をプレイヤー周辺に追従させる
export function updateSunShadow(sun, focus) {
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(SUN_DIR, 2000);
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(600000, 600000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSun: { value: SUN_DIR.clone() },
      uDeep: { value: new THREE.Color(0x0b3550) },
      uShallow: { value: new THREE.Color(0x1f6f7e) },
      uSky: { value: new THREE.Color(0x9fc0dc) },
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform vec3 uSun; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
      varying vec3 vW;
      vec2 wave(vec2 p, vec2 d, float f, float s, float a){
        float ph = dot(p,d)*f + uTime*s;
        return d * cos(ph) * a * f;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec2 p = vW.xz;
        float dist = length(cameraPosition - vW);
        float fade = 1.0 / (1.0 + dist/4000.0);
        vec2 g = vec2(0.0);
        g += wave(p, normalize(vec2(1.0,0.3)), 0.020, 1.1, 0.9);
        g += wave(p, normalize(vec2(-0.4,1.0)), 0.035, 1.5, 0.6);
        g += wave(p, normalize(vec2(0.8,-0.7)), 0.09, 2.3, 0.25) * fade;
        g += wave(p, normalize(vec2(-0.9,-0.2)), 0.21, 3.1, 0.12) * fade;
        g += wave(p, normalize(vec2(0.2,0.95)), 0.55, 4.7, 0.05) * fade;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 h = normalize(uSun + v);
        float spec = pow(max(dot(n,h),0.0), 400.0) * 3.0 + pow(max(dot(n,h),0.0), 40.0)*0.15;
        vec3 base = mix(uDeep, uShallow, 0.25 + 0.3*max(dot(n,uSun),0.0));
        vec3 col = mix(base, uSky, fres) + vec3(1.0,0.95,0.85) * spec;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

// 雲テクスチャ
export function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const rng = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const px = 64 + (rng() - 0.5) * 60, py = 64 + (rng() - 0.5) * 40, r = 14 + rng() * 26;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function cloudLayout() {
  // [x,y,z,size]
  const out = [];
  const rng = mulberry32(42);
  for (let i = 0; i < 70; i++) {
    const cx = TERRAIN.x0 - 20000 + rng() * (TERRAIN.size + 40000);
    const cz = TERRAIN.z0 - 30000 + rng() * (TERRAIN.size + 50000);
    const cy = 1600 + rng() * 900;
    const n = 6 + Math.floor(rng() * 8);
    for (let k = 0; k < n; k++) {
      out.push([cx + (rng() - 0.5) * 900, cy + (rng() - 0.3) * 160, cz + (rng() - 0.5) * 700, 350 + rng() * 450]);
    }
  }
  // 山にかかる雲
  for (let i = 0; i < 25; i++) {
    const t = rng();
    const cx = -1000 + t * 18000, cz = -34000 + t * 34000;
    for (let k = 0; k < 6; k++) out.push([cx + (rng() - 0.5) * 1500, 1100 + rng() * 300, cz + (rng() - 0.5) * 1500, 400 + rng() * 300]);
  }
  return out;
}
