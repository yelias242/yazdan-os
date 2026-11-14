/* Orb: a living particle sphere (three.js, WebGL shaders) for the OS and the voice assistant.
   States: idle, listening, thinking, speaking. Falls back to a 2D canvas version if WebGL or the network is unavailable. */
(function (root) {
  'use strict';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function create(canvas, opts) {
    opts = Object.assign({ count: 9000, ring: true, color: [1.0, 0.78, 0.36], accent: [0.37, 0.92, 0.83], interactive: true }, opts);
    const api = { state: 'idle', energy: 0, target: 0, level: 0, setState(s) { api.state = s; api.target = { idle: 0, listening: 0.55, thinking: 0.35, speaking: 0.7 }[s] ?? 0; }, pulse(v) { api.level = Math.max(api.level, v); }, destroy() {} };
    let THREE = null;
    try { THREE = await import(THREE_URL); } catch (e) { THREE = null; }
    let gl = null; try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (e) {}
    if (!THREE || !gl) return fallback2D(canvas, opts, api);

    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100); cam.position.set(0, 0, opts.distance || 4.2);
    const group = new THREE.Group(); scene.add(group);

    // sphere of points (Fibonacci spiral = even spacing) with a little depth noise
    const N = opts.count, pos = new Float32Array(N * 3), rnd = new Float32Array(N);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i, j = 1 + (Math.random() - 0.5) * 0.06;
      pos[i * 3] = Math.cos(th) * r * j; pos[i * 3 + 1] = y * j; pos[i * 3 + 2] = Math.sin(th) * r * j; rnd[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    const uni = { uTime: { value: 0 }, uEnergy: { value: 0 }, uLevel: { value: 0 }, uPixel: { value: renderer.getPixelRatio() * 3.0 }, uCol: { value: new THREE.Vector3(...opts.color) }, uAcc: { value: new THREE.Vector3(...opts.accent) } };
    const vert = `
      uniform float uTime, uEnergy, uLevel, uPixel; attribute float aRand; varying float vA; varying float vMix;
      void main(){
        vec3 p = position;
        float n = sin(p.x*3.1 + uTime*0.9 + aRand*6.283)*0.5 + sin(p.y*2.7 - uTime*0.7)*0.5 + sin(p.z*3.7 + uTime*0.5 + aRand*3.0);
        float wave = sin(p.y*10.0 - uTime*6.0) * uEnergy * 0.035;
        float r = 1.0 + n*0.04*(1.0 + uEnergy*2.5) + wave + uLevel*0.12*sin(uTime*14.0 + aRand*20.0);
        p *= r;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPixel * (0.55 + aRand*0.9) * (3.2 / -mv.z) * (1.0 + uEnergy*0.35);
        vA = 0.18 + 0.82*smoothstep(-5.3, -3.1, mv.z);
        vMix = smoothstep(0.82, 1.0, aRand) + uEnergy*0.25;
      }`;
    const frag = `
      uniform vec3 uCol, uAcc; varying float vA; varying float vMix;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.05, d); vec3 col = mix(uCol, uAcc, clamp(vMix,0.0,1.0)); gl_FragColor = vec4(col * (0.85 + 0.6*(1.0-d)), a * vA); }`;
    const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); group.add(pts);

    // inner glow
    const gcv = document.createElement('canvas'); gcv.width = gcv.height = 128; const gx = gcv.getContext('2d');
    const gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,140,0.55)'); gr.addColorStop(0.35, 'rgba(245,170,60,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gcv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(3.2, 3.2, 1); scene.add(glow);

    // orbit ring of dust
    let ring = null;
    if (opts.ring) {
      const M = 2600, rp = new Float32Array(M * 3), rr = new Float32Array(M);
      for (let i = 0; i < M; i++) { const a = Math.random() * Math.PI * 2, R = 1.55 + (Math.random() - 0.5) * 0.22 + Math.random() * Math.random() * 0.35; rp[i * 3] = Math.cos(a) * R; rp[i * 3 + 1] = (Math.random() - 0.5) * 0.04; rp[i * 3 + 2] = Math.sin(a) * R; rr[i] = Math.random(); }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aRand', new THREE.BufferAttribute(rr, 1));
      const rm = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: `uniform float uTime, uPixel, uEnergy; attribute float aRand; varying float vA; varying float vMix; void main(){ vec3 p = position; float a = uTime*(0.05 + aRand*0.05)*(1.0+uEnergy); float c = cos(a), s = sin(a); p.xz = mat2(c,-s,s,c)*p.xz; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = uPixel*(0.35+aRand*0.6)*(3.2/-mv.z); vA = 0.25 + aRand*0.5; vMix = aRand; }`,
        fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      ring = new THREE.Points(rg, rm); ring.rotation.x = 1.18; ring.rotation.z = 0.22; scene.add(ring);
    }

    let mx = 0, my = 0, rx = 0, ry = 0;
    const onMove = e => { const r = canvas.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width - 0.5) * 2; my = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    if (opts.interactive) root.addEventListener('pointermove', onMove, { passive: true });
    const size = () => { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(canvas); size();
    let raf = 0, t0 = performance.now(), last = t0, visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }); io.observe(canvas);
    const still = reduced();
    function frame(t) {
      raf = requestAnimationFrame(frame); if (!visible || document.hidden) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      api.energy += (api.target - api.energy) * Math.min(1, dt * 3); api.level *= Math.pow(0.02, dt);
      uni.uTime.value = still ? 0 : (t - t0) / 1000; uni.uEnergy.value = api.energy; uni.uLevel.value = api.level;
      rx += (my * 0.25 - rx) * Math.min(1, dt * 2.5); ry += (mx * 0.35 - ry) * Math.min(1, dt * 2.5);
      if (!still) { group.rotation.y += dt * (0.12 + api.energy * 0.5); }
      group.rotation.x = rx; scene.rotation.y = ry * 0.4;
      glow.material.opacity = 0.75 + api.energy * 0.6 + api.level * 0.8;
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
    api.destroy = () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); root.removeEventListener('pointermove', onMove); renderer.dispose(); };
    api.webgl = true;
    return api;
  }

  function fallback2D(canvas, opts, api) {
    const c = canvas.getContext('2d'), N = 1400, P = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i; P.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random()]); }
    let a = 0, raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      const w = canvas.width = canvas.clientWidth * (root.devicePixelRatio || 1), h = canvas.height = canvas.clientHeight * (root.devicePixelRatio || 1), R = Math.min(w, h) * 0.32;
      api.energy += (api.target - api.energy) * 0.05; api.level *= 0.9; a += reduced() ? 0 : 0.004 + api.energy * 0.02;
      c.clearRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R * 1.4); g.addColorStop(0, 'rgba(255,200,110,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (const [x, y, z, rn] of P) { const ca = Math.cos(a), sa = Math.sin(a), X = x * ca - z * sa, Z = x * sa + z * ca, k = 1 + (Math.sin(y * 9 + a * 20) * 0.03 * api.energy) + api.level * 0.08 * Math.sin(rn * 40 + a * 90); const s = 2.4 / (3.2 - Z); c.fillStyle = `rgba(${rn > 0.85 ? '94,234,212' : '255,200,92'},${0.2 + 0.6 * (Z + 1) / 2})`; c.fillRect(w / 2 + X * R * k * s, h / 2 + y * R * k * s, 1.6 * s, 1.6 * s); }
    }
    frame(); api.destroy = () => cancelAnimationFrame(raf); api.webgl = false; return api;
  }

  root.Orb = { create };
})(window);
