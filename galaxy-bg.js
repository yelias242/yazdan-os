/* Space background for My OS and the Trading Desk: a slow 3D colour galaxy (warm core, teal arms,
   violet edges), a starfield and soft nebula light, with gentle mouse parallax. Lighter on phones,
   off for "reduce motion", and it pauses when the tab is hidden. Usage: <script type="module" src="galaxy-bg.js"></script> */
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = innerWidth < 900;
const framed = window.top !== window;
const host = document.createElement('div');
host.className = 'space-bg'; host.setAttribute('aria-hidden', 'true');
host.innerHTML = '<i class="neb n1"></i><i class="neb n2"></i><i class="neb n3"></i>';
if (!framed) document.body.prepend(host);
if (!still && !framed) {
  (async () => {
    let THREE; try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'); } catch (e) { return; }
    const canvas = document.createElement('canvas'); host.appendChild(canvas);
    let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' }); } catch (e) { canvas.remove(); return; }
    const onHome = () => /os\.html$/.test(location.pathname) && (location.hash || '#home') === '#home';
    const dpr = Math.min(phone ? 1.5 : 2, devicePixelRatio || 1); renderer.setPixelRatio(dpr);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
    const N = phone ? 14000 : 34000, R = 5, ARMS = 3;
    const pos = new Float32Array(N * 3), rnd = new Float32Array(N * 3), col = new Float32Array(N * 3), scl = new Float32Array(N);
    const cIn = new THREE.Color('#ffe2b0'), cMid = new THREE.Color('#38e8d2'), cOut = new THREE.Color('#7a5cff'), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const r = Math.pow(Math.random(), 1.1) * R, a = (i % ARMS) / ARMS * Math.PI * 2 + r * 1.05;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 2] = Math.sin(a) * r;
      const k = .32 * r + .15, rr = () => Math.pow(Math.random(), 3) * (Math.random() < .5 ? 1 : -1) * k;
      rnd[i * 3] = rr(); rnd[i * 3 + 1] = rr() * .45; rnd[i * 3 + 2] = rr();
      const t = r / R; if (t < .45) c.copy(cIn).lerp(cMid, t / .45); else c.copy(cMid).lerp(cOut, (t - .45) / .55);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; scl[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRandom', new THREE.BufferAttribute(rnd, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aScale', new THREE.BufferAttribute(scl, 1));
    const U = { uRot: { value: 0 }, uTime: { value: 0 }, uSize: { value: 30 * dpr } };
    const galaxy = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: U, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uRot, uTime, uSize; attribute float aScale; attribute vec3 aRandom; varying vec3 vC; varying float vA;
        void main(){ vec4 m = modelMatrix * vec4(position, 1.0); float d = length(m.xz); float a = atan(m.z, m.x) + uRot / (d * .55 + .35);
          m.x = cos(a) * d; m.z = sin(a) * d; m.xyz += aRandom; vec4 v = viewMatrix * m; gl_Position = projectionMatrix * v;
          gl_PointSize = uSize * (.35 + aScale) / -v.z; vC = color; vA = .5 + .5 * sin(uTime * 1.6 + aScale * 40.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = distance(gl_PointCoord, vec2(.5)); float s = pow(max(0.0, 1.0 - d * 2.0), 2.4); gl_FragColor = vec4(vC * s * 2.1, s * (.35 + vA * .65)); }` }));
    scene.add(galaxy);
    const SN = phone ? 900 : 1800, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 40, q = Math.sqrt(1 - u * u); sp[i * 3] = q * Math.cos(th) * rr; sp[i * 3 + 1] = u * rr; sp[i * 3 + 2] = q * Math.sin(th) * rr; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.2 * dpr, sizeAttenuation: false, transparent: true, opacity: .65, depthWrite: false })); scene.add(stars);
    let mx = 0, my = 0, sx = 0, sy = 0; addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });
    function fit() { const W = innerWidth, H = innerHeight; renderer.setSize(W, H, false); camera.aspect = W / H;
      // galaxy sits to the right on wide screens, top-centre on phones
      camera.setViewOffset(W, H, phone ? 0 : -W * .29, phone ? H * .02 : H * .2, W, H); camera.updateProjectionMatrix(); }
    addEventListener('resize', fit); fit();
    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame); if (document.hidden) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now; const t = now / 1000;
      sx += (mx - sx) * .04; sy += (my - sy) * .04;
      U.uRot.value += .05 * dt; U.uTime.value = t;
      const d = phone ? 12 : 10.5, ang = .5 + sy * .12, yaw = t * .012 + sx * .25;
      camera.position.set(Math.sin(yaw) * Math.cos(ang) * d, Math.sin(ang) * d, Math.cos(yaw) * Math.cos(ang) * d); camera.lookAt(0, 0, 0);
      stars.rotation.y = t * .003; renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    window.SpaceBG = { set() {} };
  })();
}
