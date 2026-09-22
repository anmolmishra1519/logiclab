/* =========================================================
   LogicLab — script.js
   Digital Electronics Logic Gate Simulator
   (HTML + Tailwind CSS + vanilla JS + Three.js)

   All seven gates share one gate-agnostic 3D lab: the scene is
   torn down and rebuilt whenever a different gate is opened, so
   each gate gets its own IC label, input-switch count, wiring,
   and truth table without duplicating any code.
   ========================================================= */
(function () {
  'use strict';

  function safeBind(id, evt, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, handler);
  }

  function showPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex', 'flex-col', 'items-center', 'justify-center', 'gap-3');
  }

  /* =======================================================
     1. PAGE NAVIGATION (animated)
     ======================================================= */
  const pageEls = {
    landing: document.getElementById('page-landing'),
    select: document.getElementById('page-select'),
    lab: document.getElementById('page-lab'),
  };

  function currentVisiblePage() {
    return Object.values(pageEls).find((p) => p && !p.hidden) || null;
  }

  /* Pure visual swap — no history side effects */
  function renderPage(name) {
    const next = pageEls[name];
    if (!next) return;
    const current = currentVisiblePage();
    if (current === next) return;

    if (current) {
      current.classList.remove('page-enter', 'page-enter-active');
      current.classList.add('page-exit');
      setTimeout(() => {
        current.hidden = true;
        current.classList.remove('page-exit');
      }, 200);
    }

    next.hidden = false;
    next.classList.add('page-enter');
    next.classList.remove('page-enter-active');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        next.classList.add('page-enter-active');
      });
    });
    setTimeout(() => {
      next.classList.remove('page-enter', 'page-enter-active');
    }, 480);

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (name === 'lab') requestAnimationFrame(handleViewportResize);
  }

  /* User-triggered navigation — animates AND records history,
     so the browser's own Back/Forward buttons work correctly. */
  function navigateTo(name, opts) {
    opts = opts || {};
    renderPage(name);
    const state = { page: name, gate: opts.gate || circuitState.gate };
    history.pushState(state, '', '#' + name);
  }

  window.addEventListener('popstate', (event) => {
    const state = event.state || { page: 'landing' };
    if (state.page === 'lab') {
      circuitState.gate = state.gate || circuitState.gate;
      applyGateChrome(circuitState.gate);
      renderPage('lab');
      ensureSceneInitialized(circuitState.gate);
      updateUI();
    } else {
      renderPage(state.page || 'landing');
    }
  });
  history.replaceState({ page: 'landing' }, '', '#landing');

  safeBind('btn-enter-lab', 'click', () => navigateTo('select'));
  safeBind('btn-back-to-landing', 'click', () => navigateTo('landing'));
  safeBind('btn-back-to-select', 'click', () => navigateTo('select'));
  safeBind('btn-reset', 'click', () => resetCircuit());

  document.querySelectorAll('.gate-card').forEach((card) => {
    card.addEventListener('click', () => handleGateSelect(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleGateSelect(card);
      }
    });
  });

  function handleGateSelect(card) {
    const gateName = card.dataset.gate;
    if (!GATES[gateName]) return;
    playLabEntryTransition(gateName, () => openGateLab(gateName));
  }

  /* Full-screen "powering up" animation played while a gate lab boots */
  function playLabEntryTransition(gateName, done) {
    const overlay = document.getElementById('lab-transition');
    const text = document.getElementById('lab-transition-text');
    if (!overlay) {
      done();
      return;
    }
    if (text) text.textContent = 'Initializing ' + gateName + ' lab';

    overlay.hidden = false;
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    requestAnimationFrame(() => overlay.classList.add('lab-transition-active'));

    setTimeout(() => {
      done();
      requestAnimationFrame(() => {
        overlay.classList.add('lab-transition-out');
        setTimeout(() => {
          overlay.classList.remove('flex', 'lab-transition-active', 'lab-transition-out');
          overlay.classList.add('hidden');
        }, 380);
      });
    }, 820);
  }

  function openGateLab(gateName) {
    circuitState.gate = gateName;
    circuitState.A = 0;
    circuitState.B = 0;
    applyGateChrome(gateName);
    navigateTo('lab', { gate: gateName });
    ensureSceneInitialized(gateName);
    updateUI();
  }

  /* =======================================================
     2. GATE LOGIC DEFINITIONS
     Every gate is fully wired: real IC number, real compute
     function, and a complete truth table used both for the
     on-screen table and for building the 3D circuit.
     ======================================================= */
  const GATES = {
    AND: {
      ic: '7408',
      inputs: 2,
      expression: 'Y = A · B',
      note: 'Output is HIGH only when both inputs are HIGH.',
      compute: (a, b) => (a && b ? 1 : 0),
      truth: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
    },
    OR: {
      ic: '7432',
      inputs: 2,
      expression: 'Y = A + B',
      note: 'Output is HIGH when at least one input is HIGH.',
      compute: (a, b) => (a || b ? 1 : 0),
      truth: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]],
    },
    NOT: {
      ic: '7404',
      inputs: 1,
      expression: 'Y = A\u0304',
      note: 'Inverts the input signal.',
      compute: (a) => (a ? 0 : 1),
      truth: [[0, 1], [1, 0]],
    },
    NAND: {
      ic: '7400',
      inputs: 2,
      expression: 'Y = (A · B)\u0304',
      note: 'LOW only when all inputs are HIGH.',
      compute: (a, b) => (a && b ? 0 : 1),
      truth: [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
    },
    NOR: {
      ic: '7402',
      inputs: 2,
      expression: 'Y = (A + B)\u0304',
      note: 'HIGH only when all inputs are LOW.',
      compute: (a, b) => (a || b ? 0 : 1),
      truth: [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0]],
    },
    XOR: {
      ic: '7486',
      inputs: 2,
      expression: 'Y = A \u2295 B',
      note: 'HIGH only when the inputs differ.',
      compute: (a, b) => (a !== b ? 1 : 0),
      truth: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
    },
    XNOR: {
      ic: '4077',
      inputs: 2,
      expression: 'Y = (A \u2295 B)\u0304',
      note: 'HIGH only when the inputs match.',
      compute: (a, b) => (a !== b ? 0 : 1),
      truth: [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
    },
  };

  /* =======================================================
     3. CIRCUIT STATE + UI SYNC
     ======================================================= */
  const circuitState = { gate: 'AND', A: 0, B: 0, Y: 0 };

  function computeOutput() {
    const gate = GATES[circuitState.gate];
    circuitState.Y = gate.inputs === 1 ? gate.compute(circuitState.A) : gate.compute(circuitState.A, circuitState.B);
    return circuitState.Y;
  }

  function toggleInput(which) {
    const gate = GATES[circuitState.gate];
    if (which === 'B' && gate.inputs === 1) return;
    circuitState[which] = circuitState[which] ? 0 : 1;
    updateCircuit();
  }

  function resetCircuit() {
    circuitState.A = 0;
    circuitState.B = 0;
    updateCircuit();
  }

  function updateCircuit() {
    computeOutput();
    updateUI();
    if (sceneReady) {
      updateSwitchMeshes();
      updateWires();
      updateLED();
    }
  }

  const dom = {
    statusA: document.getElementById('status-a'),
    statusB: document.getElementById('status-b'),
    statusY: document.getElementById('status-y'),
    statusLed: document.getElementById('status-led'),
    switchA: document.getElementById('switch-a'),
    switchB: document.getElementById('switch-b'),
    truthTable: document.getElementById('truth-table'),
    rowInputB: document.getElementById('row-input-b'),
    gateTitle: document.getElementById('status-gate-title'),
    labGateName: document.getElementById('lab-gate-name'),
    exprFormula: document.getElementById('expr-formula'),
    exprNote: document.getElementById('expr-note'),
    icReadout: document.getElementById('ic-label-readout'),
    labelA: document.getElementById('label-input-a'),
  };

  const LOW_TEXT = 'text-ink3';
  const LOW_BG = 'bg-slate-500/10';
  const HIGH_TEXT = 'text-signal';
  const HIGH_BG = 'bg-signal/10';

  function setValueCell(el, isHigh, onLabel, offLabel) {
    if (!el) return;
    el.textContent = isHigh ? onLabel : offLabel;
    el.classList.toggle(HIGH_TEXT, isHigh);
    el.classList.toggle(HIGH_BG, isHigh);
    el.classList.toggle(LOW_TEXT, !isHigh);
    el.classList.toggle(LOW_BG, !isHigh);
  }

  function syncSwitchButton(button, value) {
    if (!button) return;
    const isHigh = !!value;
    button.setAttribute('aria-pressed', isHigh ? 'true' : 'false');
    const led = button.querySelector('.io-switch-led');
    const stateEl = button.querySelector('.io-switch-state');

    button.classList.toggle('border-signal', isHigh);
    button.classList.toggle('bg-signal/10', isHigh);
    button.classList.toggle('border-hair', !isHigh);

    if (led) {
      led.classList.toggle('bg-signal', isHigh);
      led.classList.toggle('bg-slate-400', !isHigh);
      led.classList.toggle('shadow-[0_0_10px_2px_rgba(5,150,105,0.5)]', isHigh);
    }
    if (stateEl) {
      stateEl.textContent = isHigh ? '1 / HIGH' : '0 / LOW';
      stateEl.classList.toggle('text-signal', isHigh);
      stateEl.classList.toggle('text-ink3', !isHigh);
    }
  }

  function truthKey(gate, A, B) {
    return gate.inputs === 1 ? String(A) : A + '-' + B;
  }

  function buildTruthTable(gate) {
    const table = dom.truthTable;
    if (!table) return;
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const headers = gate.inputs === 1 ? ['A', 'Y'] : ['A', 'B', 'Y'];
    headers.forEach((h) => {
      const th = document.createElement('th');
      th.className = 'text-ink3 font-medium text-xs tracking-wide pb-2';
      th.textContent = h;
      thead.appendChild(th);
    });

    gate.truth.forEach((row, i) => {
      const tr = document.createElement('tr');
      const isSingle = gate.inputs === 1;
      tr.dataset.row = isSingle ? String(row[0]) : row[0] + '-' + row[1];
      const isLastRow = i === gate.truth.length - 1;
      row.forEach((val) => {
        const td = document.createElement('td');
        td.className = 'text-center py-1.5 text-ink2' + (isLastRow ? '' : ' border-b border-hair');
        td.textContent = String(val);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function updateTruthTableHighlight() {
    const gate = GATES[circuitState.gate];
    if (!dom.truthTable) return;
    const key = truthKey(gate, circuitState.A, circuitState.B);
    dom.truthTable.querySelectorAll('tbody tr').forEach((row) => {
      const active = row.dataset.row === key;
      row.querySelectorAll('td').forEach((td) => {
        td.classList.toggle('text-signal', active);
        td.classList.toggle('bg-signal/10', active);
        td.classList.toggle('font-semibold', active);
        td.classList.toggle('text-ink2', !active);
      });
    });
  }

  function applyGateChrome(gateName) {
    const gate = GATES[gateName];
    if (dom.labGateName) dom.labGateName.textContent = gateName + ' GATE LAB';
    if (dom.gateTitle) dom.gateTitle.textContent = gateName + ' GATE';
    if (dom.exprFormula) dom.exprFormula.textContent = gate.expression;
    if (dom.exprNote) dom.exprNote.textContent = gate.note;
    if (dom.icReadout) dom.icReadout.textContent = 'IC ' + gate.ic;

    const singleInput = gate.inputs === 1;
    if (dom.rowInputB) dom.rowInputB.classList.toggle('hidden', singleInput);
    if (dom.switchB) dom.switchB.classList.toggle('hidden', singleInput);
    if (dom.labelA) dom.labelA.textContent = singleInput ? 'Input A' : 'Input A';

    const legendIc = document.getElementById('legend-ic');
    const legendGate = document.getElementById('legend-gate');
    const legendPinB = document.getElementById('legend-pin-b');
    if (legendIc) legendIc.textContent = gate.ic;
    if (legendGate) legendGate.textContent = gateName;
    if (legendPinB) legendPinB.classList.toggle('hidden', singleInput);

    buildTruthTable(gate);
    updateTruthTableHighlight();
  }

  function updateUI() {
    const { A, B, Y } = circuitState;
    setValueCell(dom.statusA, !!A, '1', '0');
    setValueCell(dom.statusB, !!B, '1', '0');
    setValueCell(dom.statusY, !!Y, '1', '0');
    setValueCell(dom.statusLed, !!Y, 'ON', 'OFF');
    syncSwitchButton(dom.switchA, A);
    syncSwitchButton(dom.switchB, B);
    updateTruthTableHighlight();
  }

  safeBind('switch-a', 'click', () => toggleInput('A'));
  safeBind('switch-b', 'click', () => toggleInput('B'));

  /* =======================================================
     4. THREE.JS 3D LABORATORY SCENE
     Rebuilt from scratch every time a different gate is opened.
     ======================================================= */
  let sceneReady = false;
  let currentGateKey = null;
  let scene, camera, renderer, controls;
  let canvasHost, resizeObserver, rafHandle;

  const meshes = {
    switchA: null,
    switchB: null,
    ledBulb: null,
    ledLight: null,
    wireA: null,
    wireB: null,
    wireOut: null,
  };

  const COLOR = {
    low: 0x39465c,
    high: 0x059669,
    ledOff: 0x4a1218,
    ledOn: 0xff3b4e,
  };

  function threeAvailable() {
    return typeof THREE !== 'undefined' && typeof THREE.OrbitControls !== 'undefined';
  }

  function ensureSceneInitialized(gateName) {
    if (sceneReady && currentGateKey === gateName) {
      updateSwitchMeshes();
      updateWires();
      updateLED();
      return;
    }

    if (!threeAvailable()) {
      showPanel('engine-error');
      return;
    }

    if (sceneReady) teardownScene();

    canvasHost = document.getElementById('canvas-host');
    if (!canvasHost) return;

    const loader = document.getElementById('lab-loader');
    if (loader) {
      loader.hidden = false;
      loader.classList.remove('opacity-0', 'pointer-events-none');
    }

    try {
      const gate = GATES[gateName];
      initScene();
      createLabEnvironment();
      createBreadboard();
      createPowerRails();
      createIC(gate.ic);
      createSwitch('A', gate.inputs === 1 ? -2.5 : -3.1);
      if (gate.inputs === 2) createSwitch('B', -1.9);
      createResistor();
      createLED();
      createWires(gate.inputs);
      setupInteraction();
      updateSwitchMeshes();
      updateWires();
      updateLED();

      sceneReady = true;
      currentGateKey = gateName;
      animate();
      hideLabLoader();
    } catch (err) {
      console.error('LogicLab 3D scene failed to initialize:', err);
      hideLabLoader();
      showPanel('webgl-fallback');
    }
  }

  function teardownScene() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    if (resizeObserver) resizeObserver.disconnect();
    window.removeEventListener('resize', handleViewportResize);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    meshes.switchA = null;
    meshes.switchB = null;
    meshes.ledBulb = null;
    meshes.ledLight = null;
    meshes.wireA = null;
    meshes.wireB = null;
    meshes.wireOut = null;
    sceneReady = false;
  }

  function hideLabLoader() {
    const loader = document.getElementById('lab-loader');
    if (!loader) return;
    loader.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
      loader.hidden = true;
    }, 320);
  }

  function initScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0f18, 14, 26);

    const rect = canvasHost.getBoundingClientRect();
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);

    camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    camera.position.set(6.2, 5.4, 7.4);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    canvasHost.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.4, 0);
    controls.minDistance = 5;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.minPolarAngle = Math.PI / 6;
    controls.update();

    const ambient = new THREE.AmbientLight(0x8fa4c2, 0.55);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x4fd8ea, 0.28);
    fill.position.set(-6, 3, -4);
    scene.add(fill);

    const rimLight = new THREE.PointLight(0x4fd8ea, 0.4, 12);
    rimLight.position.set(0, 3, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    scene.add(floor);

    const bench = new THREE.PointLight(0xffb37a, 0.5, 9);
    bench.position.set(3.6, 2.4, 3.2);
    scene.add(bench);

    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => handleViewportResize());
      resizeObserver.observe(canvasHost);
    }
    window.addEventListener('resize', handleViewportResize);
  }

  function handleViewportResize() {
    if (!renderer || !camera || !canvasHost) return;
    const rect = canvasHost.getBoundingClientRect();
    const w = Math.max(rect.width, 1);
    const h = Math.max(rect.height, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function createLabEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#131b2b');
    gradient.addColorStop(0.55, '#0b101b');
    gradient.addColorStop(1, '#05070c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);

    const texture = new THREE.CanvasTexture(canvas);
    const skyGeo = new THREE.SphereGeometry(24, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  function createBreadboard() {
    const board = new THREE.Group();
    board.name = 'breadboard';

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xede8da, roughness: 0.75, metalness: 0.02 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.28, 3.2), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    board.add(body);

    const gap = new THREE.Mesh(
      new THREE.BoxGeometry(6.05, 0.06, 0.32),
      new THREE.MeshStandardMaterial({ color: 0xcfc9b8, roughness: 0.9 })
    );
    gap.position.y = 0.15;
    board.add(gap);

    const holeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8);
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x2b2a26, roughness: 0.6 });
    const cols = 48;
    const rowOffsets = [-1.3, -1.05, -0.8, -0.55, 0.55, 0.8, 1.05, 1.3];
    const holes = new THREE.InstancedMesh(holeGeo, holeMat, cols * rowOffsets.length);
    holes.receiveShadow = true;
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let c = 0; c < cols; c++) {
      const x = -2.75 + c * (5.5 / (cols - 1));
      for (let r = 0; r < rowOffsets.length; r++) {
        dummy.position.set(x, 0.145, rowOffsets[r]);
        dummy.updateMatrix();
        holes.setMatrixAt(idx++, dummy.matrix);
      }
    }
    holes.instanceMatrix.needsUpdate = true;
    board.add(holes);

    scene.add(board);
  }

  function createPowerRails() {
    const railGeo = new THREE.BoxGeometry(6.1, 0.03, 0.12);
    const posMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.5, metalness: 0.2 });
    const negMat = new THREE.MeshStandardMaterial({ color: 0x2d64c9, roughness: 0.5, metalness: 0.2 });

    const posRail = new THREE.Mesh(railGeo, posMat);
    posRail.position.set(0, 0.155, -1.52);
    scene.add(posRail);

    const negRail = new THREE.Mesh(railGeo, negMat);
    negRail.position.set(0, 0.155, -1.42);
    scene.add(negRail);

    scene.add(makeTextSprite('+5V', { color: '#ff8a8a', fontSize: 46 }, 0.5).also((s) => s.position.set(-3.15, 0.35, -1.47)));
    scene.add(makeTextSprite('GND', { color: '#8ab4ff', fontSize: 46 }, 0.5).also((s) => s.position.set(3.15, 0.35, -1.47)));
  }

  function createIC(label) {
    const ic = new THREE.Group();
    ic.name = 'ic-' + label;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.55, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.24, 0.62), bodyMat);
    body.position.set(0, 0.3, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    ic.add(body);

    const notch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.6 })
    );
    notch.rotation.z = Math.PI / 2;
    notch.rotation.y = Math.PI / 2;
    notch.position.set(-0.86, 0.3, 0);
    ic.add(notch);

    const pinMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.35, metalness: 0.85 });
    const pinGeo = new THREE.BoxGeometry(0.05, 0.05, 0.22);
    for (let i = 0; i < 7; i++) {
      const x = -0.72 + i * 0.24;
      const pinFront = new THREE.Mesh(pinGeo, pinMat);
      pinFront.position.set(x, 0.18, 0.42);
      pinFront.castShadow = true;
      ic.add(pinFront);
      const pinBack = new THREE.Mesh(pinGeo, pinMat);
      pinBack.position.set(x, 0.18, -0.42);
      pinBack.castShadow = true;
      ic.add(pinBack);
    }

    ic.add(makeTextSprite(label, { color: '#ffffff', fontSize: 72 }, 0.78).also((s) => s.position.set(0, 0.46, 0)));

    ic.position.set(0.2, 0, 0);
    scene.add(ic);

    scene.userData.icInputA = new THREE.Vector3(-0.52, 0.18, 0.42);
    scene.userData.icInputB = new THREE.Vector3(-0.28, 0.18, 0.42);
    scene.userData.icOutput = new THREE.Vector3(0.44, 0.18, -0.42);
  }

  function createSwitch(id, xPos) {
    const group = new THREE.Group();
    group.name = 'switch-' + id;

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1c222f, roughness: 0.6, metalness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 24), baseMat);
    base.position.set(xPos, 0.2, 1.15);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const capMat = new THREE.MeshStandardMaterial({ color: COLOR.low, roughness: 0.4, metalness: 0.1, emissive: 0x000000 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 24), capMat);
    cap.position.set(xPos, 0.32, 1.15);
    cap.castShadow = true;
    cap.userData = { type: 'switch', id: id };
    group.add(cap);

    group.add(
      makeTextSprite('SW ' + id, { color: '#cfe0f5', fontSize: 54 }, 0.4).also((s) => s.position.set(xPos, 0.02, 1.5))
    );

    scene.add(group);
    if (id === 'A') meshes.switchA = cap;
    if (id === 'B') meshes.switchB = cap;
    return cap;
  }

  function createResistor() {
    const group = new THREE.Group();
    group.name = 'resistor';
    const x = 2.0;
    const y = 0.34;

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.55, metalness: 0.05 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 16), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(x, y, 0);
    body.castShadow = true;
    group.add(body);

    [0x5c3a21, 0x1a1a1a, 0xcc3b3b, 0xd8b34a].forEach((hex, i) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.093, 0.093, 0.035, 16),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4 })
      );
      band.rotation.z = Math.PI / 2;
      band.position.set(x - 0.15 + i * 0.09, y, 0);
      group.add(band);
    });

    const legMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, metalness: 0.85, roughness: 0.3 });
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), legMat);
    legL.rotation.z = Math.PI / 2;
    legL.position.set(x - 0.38, y, 0);
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), legMat);
    legR.rotation.z = Math.PI / 2;
    legR.position.set(x + 0.38, y, 0);
    group.add(legR);

    scene.add(group);
  }

  function createLED() {
    const group = new THREE.Group();
    group.name = 'led';
    const x = 2.9;

    const legMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, metalness: 0.85, roughness: 0.3 });
    for (const dz of [-0.06, 0.06]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), legMat);
      leg.position.set(x, 0.1, dz);
      leg.castShadow = true;
      group.add(leg);
    }

    const bulbMat = new THREE.MeshStandardMaterial({
      color: COLOR.ledOff,
      emissive: 0x000000,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), bulbMat);
    bulb.position.set(x, 0.26, 0);
    bulb.castShadow = true;
    group.add(bulb);

    const baseFlange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: 0x232733, roughness: 0.6 })
    );
    baseFlange.position.set(x, 0.2, 0);
    group.add(baseFlange);

    const glow = new THREE.PointLight(COLOR.ledOn, 0, 2.2);
    glow.position.set(x, 0.3, 0);
    group.add(glow);

    group.add(makeTextSprite('Y', { color: '#9fb0c4', fontSize: 42 }, 0.3).also((s) => s.position.set(x, 0.5, 0)));

    scene.add(group);
    meshes.ledBulb = bulb;
    meshes.ledLight = glow;
    scene.userData.ledAnchor = new THREE.Vector3(x, 0.2, 0);
  }

  function makeWireTube(start, mid, end) {
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const geo = new THREE.TubeGeometry(curve, 24, 0.028, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color: COLOR.low, roughness: 0.5, metalness: 0.1, emissive: 0x000000 });
    const tube = new THREE.Mesh(geo, mat);
    tube.castShadow = true;
    return tube;
  }

  function createWires(inputCount) {
    const icA = scene.userData.icInputA;
    const icB = scene.userData.icInputB;
    const icOut = scene.userData.icOutput;
    const ledAnchor = scene.userData.ledAnchor;

    if (inputCount === 1) {
      const wireA = makeWireTube(new THREE.Vector3(-2.5, 0.32, 1.15), new THREE.Vector3(-1.5, 0.55, 0.7), icA);
      scene.add(wireA);
      meshes.wireA = wireA;
      meshes.wireB = null;
    } else {
      const wireA = makeWireTube(new THREE.Vector3(-3.1, 0.32, 1.15), new THREE.Vector3(-1.9, 0.55, 0.7), icA);
      const wireB = makeWireTube(new THREE.Vector3(-1.9, 0.32, 1.15), new THREE.Vector3(-1.3, 0.5, 0.7), icB);
      scene.add(wireA, wireB);
      meshes.wireA = wireA;
      meshes.wireB = wireB;
    }

    const wireOut = makeWireTube(icOut, new THREE.Vector3(1.4, 0.5, -0.7), new THREE.Vector3(ledAnchor.x, 0.26, -0.2));
    scene.add(wireOut);
    meshes.wireOut = wireOut;
  }

  function setWireState(mesh, isHigh) {
    if (!mesh) return;
    mesh.material.color.setHex(isHigh ? COLOR.high : COLOR.low);
    mesh.material.emissive.setHex(isHigh ? 0x0c3a22 : 0x000000);
  }

  function updateWires() {
    setWireState(meshes.wireA, !!circuitState.A);
    setWireState(meshes.wireB, !!circuitState.B);
    setWireState(meshes.wireOut, !!circuitState.Y);
  }

  function updateSwitchMeshes() {
    [
      [meshes.switchA, circuitState.A],
      [meshes.switchB, circuitState.B],
    ].forEach(([cap, value]) => {
      if (!cap) return;
      const isHigh = !!value;
      cap.material.color.setHex(isHigh ? COLOR.high : COLOR.low);
      cap.material.emissive.setHex(isHigh ? 0x0d3d24 : 0x000000);
      cap.position.y = isHigh ? 0.28 : 0.32;
    });
  }

  function updateLED() {
    if (!meshes.ledBulb) return;
    const on = !!circuitState.Y;
    meshes.ledBulb.material.color.setHex(on ? COLOR.ledOn : COLOR.ledOff);
    meshes.ledBulb.material.emissive.setHex(on ? COLOR.ledOn : 0x000000);
    meshes.ledBulb.material.emissiveIntensity = on ? 0.85 : 0;
    if (meshes.ledLight) meshes.ledLight.intensity = on ? 1.1 : 0;
  }

  function setupInteraction() {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function onPointerDown(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const targets = [meshes.switchA, meshes.switchB].filter(Boolean);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0].object;
        if (hit.userData && hit.userData.id) toggleInput(hit.userData.id);
      }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
  }

  function makeTextSprite(text, opts, worldHeight) {
    opts = opts || {};
    const fontSize = opts.fontSize || 48;
    const color = opts.color || '#ffffff';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = fontSize + 'px "IBM Plex Mono", monospace';
    ctx.font = font;
    const padding = 16;
    const textWidth = ctx.measureText(text).width;
    canvas.width = Math.ceil(textWidth) + padding * 2;
    canvas.height = fontSize + padding * 2;

    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const aspect = canvas.width / canvas.height;
    const h = worldHeight || 0.4;
    sprite.scale.set(h * aspect, h, 1);

    sprite.also = function (fn) {
      fn(sprite);
      return sprite;
    };
    return sprite;
  }

  function animate() {
    rafHandle = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  /* ---------- Initial UI sync on load ---------- */
  applyGateChrome(circuitState.gate);
  updateUI();
})();
