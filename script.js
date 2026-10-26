// ============================================================
// TACTICAL ARENA 8.0 — DIFFICULTY + SQUAD AI
// Three.js FPS prototype. Fictional game-only C4 objective.
// ============================================================
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const game = $("game");

  if (!window.THREE || !game) {
    document.body.innerHTML =
      "<p style='padding:24px;color:white'>Three.js не загрузился. Проверь интернет и обнови страницу.</p>";
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111c25);
  scene.fog = new THREE.FogExp2(0x111c25, 0.0085);

  const camera = new THREE.PerspectiveCamera(
    76,
    innerWidth / innerHeight,
    0.1,
    180
  );

  camera.position.set(0, 1.7, 16);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
  });

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  game.prepend(renderer.domElement);

  const clock = new THREE.Clock();
  const UP = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();

  const PLAYER_RADIUS = 0.43;
  const ARENA_LIMIT = 37;

  // ============================================================
  // GAME STATE
  // ============================================================

  const state = {
    active: false,
    locked: false,
    paused: false,
    roundEnded: false,

    difficulty: "operative",
    difficultyData: null,

    health: 100,
    armor: 100,
    stamina: 100,

    kills: 0,
    deaths: 0,

    alphaScore: 0,
    bravoScore: 0,
    round: 1,

    roundDuration: 120,
    roundTimeRemaining: 120,

    alphaRoundPoints: 0,
    bravoRoundPoints: 0,

    nextEnemyWaveAt: 0,

    playerDown: false,
    playerRespawnAt: 0,
    playerInvulnerableUntil: 0,

    yaw: 0,
    pitch: 0,

    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,

    shooting: false,
    aiming: false,

    weaponIndex: 0,
    lastShot: 0,
    reloading: false,

    damageFlash: 0,
    lastDamageAt: -Infinity,

    bombActive: false,
    bombTime: 25,

    planting: false,
    plantingTime: 0,
    plantingDuration: 2.1,
    plantStart: new THREE.Vector3(),

    recoil: 0,
    muzzleTimer: 0,

    fpsFrames: 0,
    fpsTime: performance.now(),

    messageTimer: null,
    assistKills: 0
  };

  // Four modes with different enemy behavior.
  const DIFFICULTIES = {
    recruit: {
      label: "RECRUIT",
      enemyHP: 85,
      enemySpeed: 1.65,
      damageMin: 4,
      damageMax: 7,
      accuracy: 0.31,
      fireMin: 1.85,
      fireMax: 2.5,
      enemyCount: 4,
      regenDelay: 3.5,
      regenRate: 24,
      allyRespawn: 7,
      allyAccuracy: 0.9,
      waveDelay: 4.5,
      reaction: 1.3
    },

    operative: {
      label: "OPERATIVE",
      enemyHP: 100,
      enemySpeed: 2.15,
      damageMin: 6,
      damageMax: 10,
      accuracy: 0.43,
      fireMin: 1.35,
      fireMax: 1.95,
      enemyCount: 5,
      regenDelay: 4.5,
      regenRate: 18,
      allyRespawn: 9,
      allyAccuracy: 0.82,
      waveDelay: 4.2,
      reaction: 1.0
    },

    veteran: {
      label: "VETERAN",
      enemyHP: 115,
      enemySpeed: 2.65,
      damageMin: 8,
      damageMax: 12,
      accuracy: 0.56,
      fireMin: 0.98,
      fireMax: 1.42,
      enemyCount: 6,
      regenDelay: 5.5,
      regenRate: 14,
      allyRespawn: 11,
      allyAccuracy: 0.72,
      waveDelay: 3.6,
      reaction: 0.7
    },

    nightmare: {
      label: "NIGHTMARE",
      enemyHP: 135,
      enemySpeed: 3.05,
      damageMin: 10,
      damageMax: 15,
      accuracy: 0.68,
      fireMin: 0.72,
      fireMax: 1.08,
      enemyCount: 7,
      regenDelay: 7,
      regenRate: 10,
      allyRespawn: 13,
      allyAccuracy: 0.63,
      waveDelay: 3.1,
      reaction: 0.45
    }
  };

  const keys = Object.create(null);

  const enemies = [];
  const allies = [];
  const obstacles = [];
  const obstacleMeshes = [];
  const tracers = [];
  const effects = [];

  let bombGroup = null;
  let bombLight = null;

  let weaponGroup = null;
  let muzzleLight = null;
  let muzzleMesh = null;

  let audioContext = null;
  let dustPoints = null;

  // ============================================================
  // MATERIALS AND PROCEDURAL TEXTURES
  // ============================================================

  function mat(
    color,
    roughness = 0.75,
    metalness = 0.1,
    extra = {}
  ) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      ...extra
    });
  }

  function noiseTexture(
    base,
    speckles,
    size = 512,
    count = 6500
  ) {
    const c = document.createElement("canvas");
    c.width = c.height = size;

    const ctx = c.getContext("2d");

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < count; i++) {
      ctx.fillStyle =
        `rgba(${speckles},${Math.random() * 0.14})`;

      const s = 1 + Math.random() * 4;

      ctx.fillRect(
        Math.random() * size,
        Math.random() * size,
        s,
        s
      );
    }

    for (let i = 0; i < 38; i++) {
      ctx.strokeStyle =
        `rgba(0,0,0,${Math.random() * 0.07})`;

      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();

      const x = Math.random() * size;
      const y = Math.random() * size;

      ctx.moveTo(x, y);
      ctx.lineTo(
        x + (Math.random() - 0.5) * 100,
        y + Math.random() * 70
      );

      ctx.stroke();
    }

    const t = new THREE.CanvasTexture(c);

    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.encoding = THREE.sRGBEncoding;

    return t;
  }

  const floorTexture = noiseTexture(
    "#42494d",
    "185,193,198",
    512,
    8500
  );

  floorTexture.repeat.set(14, 14);

  const wallTexture = noiseTexture(
    "#505960",
    "210,216,220",
    512,
    6000
  );

  wallTexture.repeat.set(2, 2);

  const M = {
    floor: mat(0xffffff, 0.97, 0.03, {
      map: floorTexture,
      bumpMap: floorTexture,
      bumpScale: 0.025
    }),

    concrete: mat(0xffffff, 0.9, 0.07, {
      map: wallTexture,
      bumpMap: wallTexture,
      bumpScale: 0.018
    }),

    dark: mat(0x29343c, 0.9, 0.12),
    steel: mat(0x35424c, 0.4, 0.78),
    steelLight: mat(0x77838a, 0.34, 0.83),
    black: mat(0x111a21, 0.32, 0.75),
    blue: mat(0x176f94, 0.48, 0.45),
    red: mat(0x803c3f, 0.68, 0.25),

    enemyArmor: mat(0x80383d, 0.7, 0.24),
    allyArmor: mat(0x245b78, 0.65, 0.32),
    operatorDark: mat(0x26343d, 0.62, 0.36),
    skin: mat(0x99745f, 0.9, 0.02),

    blueGlow: new THREE.MeshStandardMaterial({
      color: 0x60d4ff,
      emissive: 0x1680b3,
      emissiveIntensity: 1.8
    }),

    amberGlow: new THREE.MeshStandardMaterial({
      color: 0xffbd65,
      emissive: 0x9b5015,
      emissiveIntensity: 1.8
    })
  };

  // ============================================================
  // LIGHTING
  // ============================================================

  scene.add(
    new THREE.HemisphereLight(
      0xc2deee,
      0x26313a,
      1.5
    )
  );

  const sun = new THREE.DirectionalLight(0xe3f0fa, 2);

  sun.position.set(-24, 38, 18);
  sun.castShadow = true;

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.02;

  scene.add(sun);

  function addPointLight(x, y, z, color, intensity, distance) {
    const l = new THREE.PointLight(
      color,
      intensity,
      distance
    );

    l.position.set(x, y, z);
    scene.add(l);

    return l;
  }

  addPointLight(-18, 5, -18, 0x168bd0, 30, 28);
  addPointLight(19, 5, 14, 0xff923d, 24, 25);
  addPointLight(0, 7, -34, 0x4abfff, 28, 32);

  // ============================================================
  // ARENA CONSTRUCTION
  // ============================================================

  function addBox(
    x, y, z,
    sx, sy, sz,
    material,
    collidable = true
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);

    if (collidable) {
      obstacles.push({
        x,
        z,
        halfX: sx / 2,
        halfZ: sz / 2
      });

      obstacleMeshes.push(mesh);
    }

    return mesh;
  }

  function addCylinder(
    x, y, z,
    rt, rb, height,
    material,
    segments = 16
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        rt,
        rb,
        height,
        segments
      ),
      material
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    scene.add(mesh);

    return mesh;
  }

  function addCrate(x, z, sx, sy, sz, material) {
    addBox(x, sy / 2, z, sx, sy, sz, material, true);

    for (const side of [-1, 1]) {
      addBox(
        x + side * (sx / 2 - 0.055),
        sy / 2,
        z,
        0.09,
        sy + 0.02,
        sz + 0.05,
        M.steelLight,
        false
      );
    }

    addBox(
      x,
      sy - 0.035,
      z,
      sx + 0.04,
      0.07,
      sz + 0.04,
      M.steel,
      false
    );

    for (let i = -1; i <= 1; i++) {
      addBox(
        x + i * sx * 0.27,
        sy * 0.5,
        z - sz / 2 - 0.045,
        0.045,
        sy * 0.68,
        0.035,
        M.black,
        false
      );
    }
  }

  function addSign(x, y, z, text, color = "#62cfff", rotationY = 0) {
    const c = document.createElement("canvas");

    c.width = 512;
    c.height = 128;

    const ctx = c.getContext("2d");

    ctx.fillStyle = "#101a22";
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);

    ctx.fillStyle = color;
    ctx.font = "bold 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(c);
    texture.encoding = THREE.sRGBEncoding;

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.2),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
      })
    );

    sign.position.set(x, y, z);
    sign.rotation.y = rotationY;

    scene.add(sign);
  }

  function createWorld() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      M.floor
    );

    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;

    scene.add(floor);

    addBox(0, 4, -40, 82, 8, 1.4, M.dark);
    addBox(0, 4, 40, 82, 8, 1.4, M.dark);
    addBox(-40, 4, 0, 1.4, 8, 82, M.dark);
    addBox(40, 4, 0, 1.4, 8, 82, M.dark);

    for (let x = -32; x <= 32; x += 8) {
      addBox(x, 4, -39.1, 0.14, 6.2, 0.16, M.steelLight, false);
      addBox(x, 4, 39.1, 0.14, 6.2, 0.16, M.steelLight, false);
    }

    addBox(-10, 1.25, -8, 5.2, 2.5, 3.2, M.concrete);
    addBox(10, 1.25, -11, 6.2, 2.5, 3.2, M.concrete);
    addBox(0, 1.3, -15, 9, 2.6, 3, M.steel);
    addBox(-20, 1.2, 9, 5.2, 2.4, 5.2, M.dark);
    addBox(20, 1.2, 9, 5.2, 2.4, 5.2, M.dark);

    addBox(-27, 1.8, -20, 4.5, 3.6, 8, M.concrete);
    addBox(27, 1.8, -20, 4.5, 3.6, 8, M.concrete);
    addBox(-27, 1.8, 20, 4.5, 3.6, 8, M.concrete);
    addBox(27, 1.8, 20, 4.5, 3.6, 8, M.concrete);

    addCrate(-7, 5, 3.6, 1.4, 2.1, M.blue);
    addCrate(8, 2, 3.6, 1.4, 2.1, M.steel);
    addCrate(0, 27, 5.2, 1.4, 2.2, M.dark);
    addCrate(-16, -28, 4.2, 1.5, 2.3, M.steel);
    addCrate(16, -28, 4.2, 1.5, 2.3, M.steel);
    addCrate(-33, -5, 5, 3.2, 8, M.blue);
    addCrate(33, 5, 5, 3.2, 8, M.red);

    for (let x = -24; x <= 24; x += 12) {
      addCylinder(x, 5.5, -38.9, 0.16, 0.16, 7, M.steelLight, 12);
      addBox(x, 7.1, -38.5, 0.75, 0.16, 0.75, M.black, false);
    }

    const marking = new THREE.MeshBasicMaterial({
      color: 0x9db0b9,
      transparent: true,
      opacity: 0.13
    });

    for (let x = -35; x <= 35; x += 5) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.014, 70),
        marking
      );

      line.position.set(x, 0.014, 0);
      scene.add(line);
    }

    for (const [x, z, color] of [
      [-25, -34, 0x50bfff],
      [25, -34, 0xffa451],
      [-25, 34, 0x50bfff],
      [25, 34, 0xffa451]
    ]) {
      addCylinder(x, 3.1, z, 0.11, 0.17, 6.2, M.black, 12);
      addBox(x, 6.15, z, 0.75, 0.16, 0.45, M.steel, false);

      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.045, 0.27),
        M.blueGlow
      );

      lens.position.set(x, 6.04, z);
      scene.add(lens);

      addPointLight(x, 5.85, z, color, 12, 15);
    }

    addSign(0, 4.3, -39.15, "TACTICAL TRAINING FACILITY");
    addSign(-37.8, 3, 0, "SECTOR A", "#ffbd68", Math.PI / 2);
    addSign(37.8, 3, 0, "SECTOR B", "#67d1ff", -Math.PI / 2);

    const count = 130;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = 0.5 + Math.random() * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    dustPoints = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xb9d5e2,
        size: 0.035,
        transparent: true,
        opacity: 0.26
      })
    );

    scene.add(dustPoints);
  }

  // ============================================================
  // FICTIONAL C4 OBJECTIVE
  // ============================================================

  function createBombSite() {
    const site = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(4.35, 4.35, 0.12, 48),
      mat(0x765b35, 0.92, 0.16, {
        emissive: 0x261606,
        emissiveIntensity: 0.35
      })
    );

    base.position.y = 0.07;
    site.add(base);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.75, 0.075, 8, 64),
      M.amberGlow
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.17;
    site.add(ring);

    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.08, 24),
      M.steel
    );

    center.position.y = 0.18;
    site.add(center);

    site.position.set(0, 0, -25);
    scene.add(site);

    bombGroup = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.29, 0.44),
      M.black
    );

    body.castShadow = true;
    bombGroup.add(body);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.035, 0.29),
      M.steelLight
    );

    panel.position.y = 0.165;
    bombGroup.add(panel);

    const display = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.115, 0.025),
      M.blueGlow
    );

    display.position.set(0, 0.045, 0.225);
    bombGroup.add(display);

    bombLight = new THREE.PointLight(0xff7355, 2.5, 6);
    bombLight.position.set(0, 0.55, 0);
    bombGroup.add(bombLight);

    bombGroup.position.set(0, 0.38, -25);
    bombGroup.visible = false;

    scene.add(bombGroup);
  }

  // ============================================================
  // WEAPONS
  // ============================================================

  const weapons = [
    {
      name: "MK-01 VANGUARD",
      damage: 34,
      rate: 145,
      magazine: 30,
      ammo: 30,
      reserve: 120,
      reload: 1.8,
      spread: 0.012,
      pellets: 1,
      automatic: true,
      color: 0x35434d
    },
    {
      name: "DMR-07 SENTINEL",
      damage: 78,
      rate: 430,
      magazine: 12,
      ammo: 12,
      reserve: 60,
      reload: 1.65,
      spread: 0.003,
      pellets: 1,
      automatic: false,
      color: 0x28647d
    },
    {
      name: "SG-12 BREACH",
      damage: 15,
      rate: 720,
      magazine: 8,
      ammo: 8,
      reserve: 40,
      reload: 2.1,
      spread: 0.064,
      pellets: 8,
      automatic: false,
      color: 0x765638
    }
  ];

  function createWeapon() {
    if (weaponGroup) camera.remove(weaponGroup);

    weaponGroup = new THREE.Group();
    camera.add(weaponGroup);

    const w = weapons[state.weaponIndex];
    const bodyMat = mat(w.color, 0.34, 0.78);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.23, 0.76),
      bodyMat
    );

    body.position.set(0, 0, -0.28);
    body.castShadow = true;
    weaponGroup.add(body);

    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.09, 0.55),
      M.steelLight
    );

    receiver.position.set(0, 0.14, -0.25);
    weaponGroup.add(receiver);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.043, 0.72, 12),
      M.black
    );

    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.86);
    weaponGroup.add(barrel);

    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.12, 12),
      M.steelLight
    );

    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.025, -1.2);
    weaponGroup.add(muzzle);

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.16, 0.35),
      M.black
    );

    stock.position.set(0, 0, 0.22);
    weaponGroup.add(stock);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.28, 0.16),
      M.black
    );

    grip.position.set(0, -0.2, -0.08);
    grip.rotation.x = -0.18;
    weaponGroup.add(grip);

    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.31, 0.2),
      M.black
    );

    magazine.position.set(0, -0.21, -0.2);
    magazine.rotation.x = -0.12;
    weaponGroup.add(magazine);

    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.12, 0.14),
      M.black
    );

    sight.position.set(0, 0.235, -0.22);
    weaponGroup.add(sight);

    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.06, 0.012),
      M.blueGlow
    );

    lens.position.set(0, 0.235, -0.295);
    weaponGroup.add(lens);

    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.06, 0.47),
      M.steelLight
    );

    rail.position.set(0.125, 0.045, -0.27);
    weaponGroup.add(rail);

    muzzleLight = new THREE.PointLight(0xffb96d, 0, 5);
    muzzleLight.position.set(0, 0.02, -1.28);
    weaponGroup.add(muzzleLight);

    muzzleMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.36, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffd18b,
        transparent: true,
        opacity: 0.85
      })
    );

    muzzleMesh.rotation.x = -Math.PI / 2;
    muzzleMesh.position.set(0, 0.02, -1.31);
    muzzleMesh.visible = false;

    weaponGroup.add(muzzleMesh);
    weaponGroup.position.set(0.39, -0.34, -0.66);
  }

  function switchWeapon(index) {
    if (
      index < 0 ||
      index >= weapons.length ||
      index === state.weaponIndex ||
      state.reloading ||
      state.planting
    ) return;

    state.weaponIndex = index;
    createWeapon();
    updateHUD();
    showMessage(weapons[index].name);
  }

  // ============================================================
  // CHARACTER MODELS
  // ============================================================

  function createOperator(team, x, z, index, name) {
    const friendly = team === "alpha";
    const root = new THREE.Group();
    const armorMat = friendly ? M.allyArmor : M.enemyArmor;

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.78, 0.38),
      armorMat
    );

    torso.position.y = 1.18;
    torso.castShadow = true;
    root.add(torso);

    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.47, 0.42, 0.405),
      M.operatorDark
    );

    vest.position.set(0, 1.2, -0.01);
    root.add(vest);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 16, 16),
      M.skin
    );

    head.position.y = 1.78;
    head.castShadow = true;
    root.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.245,
        16,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      ),
      M.operatorDark
    );

    helmet.position.y = 1.87;
    root.add(helmet);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.075, 0.04),
      M.black
    );

    visor.position.set(0, 1.79, 0.19);
    root.add(visor);

    function limb(x, y) {
      const g = new THREE.Group();
      g.position.set(x, y, 0);

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.56, 0.2),
        M.operatorDark
      );

      mesh.position.y = -0.26;
      mesh.castShadow = true;
      g.add(mesh);
      root.add(g);

      return g;
    }

    const leftArm = limb(-0.42, 1.4);
    const rightArm = limb(0.42, 1.4);
    const leftLeg = limb(-0.18, 0.78);
    const rightLeg = limb(0.18, 0.78);

    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.13, 0.68),
      M.black
    );

    rifle.position.set(0.32, 1.16, 0.34);
    root.add(rifle);

    const shoulder = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.18, 0.24),
      armorMat
    );

    shoulder.position.set(-0.43, 1.52, 0);
    root.add(shoulder);

    const shoulder2 = shoulder.clone();
    shoulder2.position.x = 0.43;
    root.add(shoulder2);

    const barGroup = new THREE.Group();

    const barBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.82, 0.075),
      new THREE.MeshBasicMaterial({
        color: 0x111820,
        side: THREE.DoubleSide
      })
    );

    const barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.045),
      new THREE.MeshBasicMaterial({
        color: friendly ? 0x62d5ff : 0xff6268,
        side: THREE.DoubleSide
      })
    );

    barFill.position.z = 0.012;
    barGroup.add(barBack, barFill);
    barGroup.position.y = 2.32;
    root.add(barGroup);

    let nameTag = null;

    if (friendly) {
      nameTag = new THREE.Group();

      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.19),
        new THREE.MeshBasicMaterial({
          color: 0x123044,
          transparent: true,
          opacity: 0.82,
          side: THREE.DoubleSide
        })
      );

      nameTag.add(badge);

      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 64;

      const ctx = c.getContext("2d");
      ctx.fillStyle = "#8edfff";
      ctx.font = "bold 34px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, 128, 32);

      const tex = new THREE.CanvasTexture(c);

      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.18),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide
        })
      );

      label.position.z = 0.015;
      nameTag.add(label);
      nameTag.position.y = 2.56;
      root.add(nameTag);
    }

    root.position.set(x, 0, z);

    root.userData = {
      team,
      index,
      name,
      health: 100,
      maxHealth: 100,
      alive: true,
      speed: friendly ? 4.2 : state.difficultyData.enemySpeed,
      shootTimer: 0.6 + Math.random() * 1.2,
      phase: Math.random() * 8,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      barGroup,
      barFill,
      nameTag,
      hitFlash: 0,
      target: null,
      followOffset: 0,
      followDistance: 2.5,
      respawnAt: 0,
      role: "RIFLEMAN"
    };

    if (!friendly) {
      root.userData.health = root.userData.maxHealth =
        state.difficultyData.enemyHP;
    }

    const ratio = root.userData.health / root.userData.maxHealth;
    barFill.scale.x = ratio;

    scene.add(root);
    return root;
  }

  function spawnEnemies() {
    for (const bot of enemies) {
      scene.remove(bot);
    }

    enemies.length = 0;

    const positions = [
      [-23, -28],
      [23, -29],
      [-23, 0],
      [23, 0],
      [0, -34],
      [-8, -33],
      [8, -33],
      [0, -5]
    ];

    const count = state.difficultyData.enemyCount;

    for (let i = 0; i < count; i++) {
      enemies.push(
        createOperator(
          "bravo",
          positions[i][0],
          positions[i][1],
          i,
          `HOSTILE ${i + 1}`
        )
      );
    }

    state.nextEnemyWaveAt = 0;
    updateHUD();
  }

  function spawnAllies() {
    for (const ally of allies) {
      scene.remove(ally);
    }

    allies.length = 0;

    const squad = [
      {
        name: "RAVEN",
        x: -1.8,
        z: 14.3,
        offset: -2.3,
        back: 2.8,
        role: "RIFLEMAN"
      },
      {
        name: "GHOST",
        x: 1.8,
        z: 14.3,
        offset: 2.3,
        back: 2.8,
        role: "SUPPORT"
      },
      {
        name: "NOVA",
        x: 0,
        z: 12.7,
        offset: 0,
        back: 4.1,
        role: "SCOUT"
      }
    ];

    squad.forEach((m, i) => {
      const ally = createOperator(
        "alpha",
        m.x,
        m.z,
        i,
        m.name
      );

      ally.rotation.y = Math.PI;
      ally.userData.followOffset = m.offset;
      ally.userData.followDistance = m.back;
      ally.userData.role = m.role;
      ally.userData.speed = 4 + i * 0.12;
      ally.userData.respawnAt = 0;

      allies.push(ally);
    });

    updateSquadHUD();
  }

  function setCharacterHealth(character, value) {
    const d = character.userData;

    d.health = Math.max(
      0,
      Math.min(d.maxHealth, value)
    );

    const ratio = d.health / d.maxHealth;

    d.barFill.scale.x = Math.max(0.001, ratio);
    d.barFill.position.x = -(1 - ratio) * 0.39;

    if (d.health <= 0 && d.alive) {
      d.alive = false;

      d.respawnAt = d.team === "alpha"
        ? performance.now() +
          state.difficultyData.allyRespawn * 1000
        : 0;

      scene.remove(character);
    }
  }

  // ============================================================
  // SQUAD AI
  // ============================================================

  function desiredAllyPosition(ally) {
    const d = ally.userData;

    const forward = new THREE.Vector3(
      Math.sin(state.yaw),
      0,
      -Math.cos(state.yaw)
    );

    const right = new THREE.Vector3(
      Math.cos(state.yaw),
      0,
      Math.sin(state.yaw)
    );

    return camera.position.clone()
      .addScaledVector(forward, -d.followDistance)
      .addScaledVector(right, d.followOffset);
  }

  function hasLineOfSight(from, to) {
    const direction = to.clone().sub(from);
    const distance = direction.length();

    if (distance <= 0.1) return true;

    direction.normalize();
    raycaster.set(from, direction);
    raycaster.far = distance;

    return raycaster.intersectObjects(
      obstacleMeshes,
      false
    ).length === 0;
  }

  function nearestVisibleEnemy(origin, maxDistance = 26) {
    let chosen = null;
    let best = maxDistance;

    for (const enemy of enemies) {
      if (!enemy.userData.alive) continue;

      const point = enemy.position.clone().add(
        new THREE.Vector3(0, 1.25, 0)
      );

      const d = origin.distanceTo(point);

      if (
        d < best &&
        hasLineOfSight(origin, point)
      ) {
        best = d;
        chosen = enemy;
      }
    }

    return chosen;
  }

  function tryMoveCharacter(
    character,
    dx,
    dz,
    radius = 0.37
  ) {
    const x = character.position.x;
    const z = character.position.z;

    if (!collides(x + dx, z, radius)) {
      character.position.x += dx;
    }

    if (!collides(character.position.x, z + dz, radius)) {
      character.position.z += dz;
    }
  }

  function animateWalk(d, delta) {
    d.phase += delta * 8.5;

    d.leftLeg.rotation.x = Math.sin(d.phase) * 0.48;
    d.rightLeg.rotation.x = -Math.sin(d.phase) * 0.48;

    d.leftArm.rotation.x = -Math.sin(d.phase) * 0.16;
    d.rightArm.rotation.x = Math.sin(d.phase) * 0.16;
  }

  function animateIdle(d, delta) {
    d.leftLeg.rotation.x = THREE.MathUtils.lerp(
      d.leftLeg.rotation.x, 0, delta * 7
    );

    d.rightLeg.rotation.x = THREE.MathUtils.lerp(
      d.rightLeg.rotation.x, 0, delta * 7
    );

    d.leftArm.rotation.x = THREE.MathUtils.lerp(
      d.leftArm.rotation.x, 0, delta * 7
    );

    d.rightArm.rotation.x = THREE.MathUtils.lerp(
      d.rightArm.rotation.x, 0, delta * 7
    );
  }

  function allyShoot(ally, target, distance) {
    if (
      !ally.userData.alive ||
      !target.userData.alive ||
      state.roundEnded
    ) return;

    const start = ally.position.clone().add(
      new THREE.Vector3(0.2, 1.32, 0.28)
    );

    const end = target.position.clone().add(
      new THREE.Vector3(0, 1.2, 0)
    );

    const miss = distance * 0.022;

    end.x += (Math.random() - 0.5) * miss;
    end.y += (Math.random() - 0.5) * miss;
    end.z += (Math.random() - 0.5) * miss;

    addTracer(start, end, 0x67d7ff, 0.1);

    if (Math.random() < state.difficultyData.allyAccuracy) {
      damageEnemy(target, 13, true);
    }
  }

  function updateAllies(delta, now) {
    for (const ally of allies) {
      const d = ally.userData;

      if (!d.alive) {
        if (d.respawnAt && now >= d.respawnAt) {
          const pos = desiredAllyPosition(ally);

          ally.position.set(pos.x, 0, pos.z);

          d.health = 75;
          d.alive = true;
          d.respawnAt = 0;
          d.shootTimer = 0.8;

          d.barFill.scale.x = 0.75;
          d.barFill.position.x = -0.0975;

          scene.add(ally);

          updateSquadHUD();
          showMessage(`${d.name} ВЕРНУЛСЯ В ОТРЯД`);
        } else {
          continue;
        }
      }

      const origin = ally.position.clone().add(
        new THREE.Vector3(0, 1.4, 0)
      );

      const target = nearestVisibleEnemy(origin, 27);
      d.target = target;

      if (target) {
        const to = target.position.clone().sub(ally.position);
        const distance = Math.hypot(to.x, to.z);

        ally.rotation.y = Math.atan2(to.x, to.z);

        if (distance > 12) {
          const step = to.normalize().multiplyScalar(
            d.speed * delta
          );

          tryMoveCharacter(ally, step.x, step.z);
          animateWalk(d, delta);
        } else {
          animateIdle(d, delta);
        }

        d.shootTimer -= delta;

        if (d.shootTimer <= 0 && distance < 27) {
          d.shootTimer = 0.85 + Math.random() * 0.7;
          allyShoot(ally, target, distance);
        }
      } else {
        const desired = desiredAllyPosition(ally);

        const dx = desired.x - ally.position.x;
        const dz = desired.z - ally.position.z;
        const distance = Math.hypot(dx, dz);

        if (distance > 1.2) {
          const step = Math.min(d.speed * delta, distance);

          tryMoveCharacter(
            ally,
            dx / distance * step,
            dz / distance * step
          );

          ally.rotation.y = Math.atan2(dx, dz);
          animateWalk(d, delta);
        } else {
          animateIdle(d, delta);
        }
      }

      d.barGroup.quaternion.copy(camera.quaternion);

      if (d.nameTag) {
        d.nameTag.quaternion.copy(camera.quaternion);
        d.nameTag.visible =
          d.alive &&
          camera.position.distanceTo(ally.position) < 28;
      }
    }
  }

  // ============================================================
  // ENEMY AI — DIFFICULTY-BASED TARGETING
  // ============================================================

  function chooseEnemyTarget(enemy) {
    const candidates = [];

    if (!state.playerDown && state.health > 0) {
      candidates.push({
        object: null,
        position: camera.position,
        isPlayer: true
      });
    }

    for (const ally of allies) {
      if (ally.userData.alive) {
        candidates.push({
          object: ally,
          position: ally.position,
          isPlayer: false
        });
      }
    }

    let best = null;
    let bestDistance = 31;

    for (const item of candidates) {
      const d = enemy.position.distanceTo(item.position);

      const point = item.isPlayer
        ? item.position.clone()
        : item.position.clone().add(
            new THREE.Vector3(0, 1.3, 0)
          );

      if (
        d < bestDistance &&
        hasLineOfSight(
          enemy.position.clone().add(
            new THREE.Vector3(0, 1.4, 0)
          ),
          point
        )
      ) {
        best = { ...item, distance: d };
        bestDistance = d;
      }
    }

    return best;
  }

  function updateEnemies(delta) {
    for (const enemy of enemies) {
      const d = enemy.userData;

      if (!d.alive) continue;

      const target = chooseEnemyTarget(enemy);

      if (!target) continue;

      d.target = target;

      const dx = target.position.x - enemy.position.x;
      const dz = target.position.z - enemy.position.z;
      const distance = Math.hypot(dx, dz);

      enemy.rotation.y = Math.atan2(dx, dz);

      if (distance > 9) {
        const step = d.speed * delta;

        tryMoveCharacter(
          enemy,
          dx / Math.max(distance, 0.001) * step,
          dz / Math.max(distance, 0.001) * step
        );

        animateWalk(d, delta);
      } else {
        // Enemies make short lateral movements.
        const strafe =
          Math.sin(clock.elapsedTime * 1.5 + d.index) *
          0.55 * delta;

        tryMoveCharacter(
          enemy,
          Math.cos(enemy.rotation.y) * strafe,
          -Math.sin(enemy.rotation.y) * strafe,
          0.37
        );

        animateIdle(d, delta);
      }

      d.shootTimer -= delta;

      if (d.shootTimer <= 0 && distance < 29) {
        d.shootTimer =
          state.difficultyData.fireMin +
          Math.random() * (
            state.difficultyData.fireMax -
            state.difficultyData.fireMin
          );

        enemyShoot(enemy, target, distance);
      }

      d.barGroup.quaternion.copy(camera.quaternion);
    }
  }

  function enemyShoot(enemy, target, distance) {
    const start = enemy.position.clone().add(
      new THREE.Vector3(0, 1.42, 0)
    );

    const end = target.position.clone().add(
      new THREE.Vector3(
        0,
        target.isPlayer ? 0 : 1.25,
        0
      )
    );

    const miss =
      distance *
      (1 - state.difficultyData.accuracy) *
      0.11;

    end.x += (Math.random() - 0.5) * miss;
    end.y += (Math.random() - 0.5) * miss;
    end.z += (Math.random() - 0.5) * miss;

    addTracer(start, end, 0xff645e, 0.12);

    if (Math.random() < state.difficultyData.accuracy) {
      const cfg = state.difficultyData;

      const amount =
        cfg.damageMin +
        Math.floor(Math.random() * (
          cfg.damageMax - cfg.damageMin + 1
        ));

      if (target.isPlayer) {
        damagePlayer(amount);
      } else {
        damageAlly(target.object, amount);
      }
    }
  }

  function damageAlly(ally, amount) {
    if (
      !ally ||
      !ally.userData.alive ||
      state.roundEnded
    ) return;

    const wasAlive = ally.userData.alive;

    setCharacterHealth(
      ally,
      ally.userData.health - amount
    );

    updateSquadHUD();

    if (wasAlive && !ally.userData.alive) {
      state.bravoRoundPoints += 1;
      showMessage(
        `${ally.userData.name} ВЫБЫЛ — ВЕРНЁТСЯ ПОЗЖЕ`
      );
      updateHUD();
    }
  }

  function damageEnemy(enemy, amount, creditedToSquad = false) {
    if (
      !enemy ||
      !enemy.userData.alive ||
      state.roundEnded
    ) return;

    const wasAlive = enemy.userData.alive;

    setCharacterHealth(
      enemy,
      enemy.userData.health - amount
    );

    if (wasAlive && !enemy.userData.alive) {
      createImpact(
        enemy.position.clone().add(
          new THREE.Vector3(0, 1, 0)
        ),
        0x65cfff,
        0.35
      );

      state.alphaRoundPoints += 1;

      if (creditedToSquad) {
        state.assistKills++;
      } else {
        state.kills++;
      }

      updateHUD();

      if (enemies.every(bot => !bot.userData.alive)) {
        state.nextEnemyWaveAt =
          performance.now() +
          state.difficultyData.waveDelay * 1000;

        showMessage(
          "СЕКТОР ЧИСТ — ОЖИДАЙ НОВУЮ ВОЛНУ"
        );
      }
    }
  }

  function updateEnemyWaves(now) {
    if (
      state.nextEnemyWaveAt &&
      now >= state.nextEnemyWaveAt &&
      !state.roundEnded
    ) {
      spawnEnemies();
      showMessage("НОВАЯ ВОЛНА ПРОТИВНИКОВ");
    }
  }

  // ============================================================
  // PLAYER MOVEMENT, STAMINA AND COLLISIONS
  // ============================================================

  function collides(x, z, radius = PLAYER_RADIUS) {
    for (const item of obstacles) {
      const cx = Math.max(
        item.x - item.halfX,
        Math.min(x, item.x + item.halfX)
      );

      const cz = Math.max(
        item.z - item.halfZ,
        Math.min(z, item.z + item.halfZ)
      );

      const dx = x - cx;
      const dz = z - cz;

      if (dx * dx + dz * dz < radius * radius) {
        return true;
      }
    }

    return false;
  }

  function tryMoveCharacter(
    character,
    dx,
    dz,
    radius = 0.37
  ) {
    const x = character.position.x;
    const z = character.position.z;

    if (!collides(x + dx, z, radius)) {
      character.position.x += dx;
    }

    if (!collides(character.position.x, z + dz, radius)) {
      character.position.z += dz;
    }
  }

  function updatePlayer(delta) {
    if (state.playerDown) return;

    const dir = new THREE.Vector3();

    if (state.forward) dir.z -= 1;
    if (state.backward) dir.z += 1;
    if (state.left) dir.x -= 1;
    if (state.right) dir.x += 1;

    const moving = dir.lengthSq() > 0;

    const canSprint =
      state.sprint &&
      state.stamina > 1 &&
      moving;

    if (canSprint) {
      state.stamina = Math.max(
        0,
        state.stamina - 27 * delta
      );
    } else {
      state.stamina = Math.min(
        100,
        state.stamina + 19 * delta
      );
    }

    if (moving) {
      dir.normalize().applyAxisAngle(UP, state.yaw);

      const speed = canSprint ? 8.2 : 5.1;

      const dx = dir.x * speed * delta;
      const dz = dir.z * speed * delta;

      if (!collides(camera.position.x + dx, camera.position.z)) {
        camera.position.x += dx;
      }

      if (!collides(camera.position.x, camera.position.z + dz)) {
        camera.position.z += dz;
      }

      camera.position.y =
        1.7 +
        Math.sin(
          clock.elapsedTime * (canSprint ? 13 : 9)
        ) * (canSprint ? 0.05 : 0.025);
    } else {
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        1.7,
        delta * 8
      );
    }

    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      -ARENA_LIMIT,
      ARENA_LIMIT
    );

    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      -ARENA_LIMIT,
      ARENA_LIMIT
    );

    if (
      state.planting &&
      (
        camera.position.distanceTo(state.plantStart) > 0.28 ||
        state.shooting
      )
    ) {
      cancelPlanting("УСТАНОВКА ОТМЕНЕНА");
    }

    $("staminaValue").textContent =
      Math.round(state.stamina);

    $("staminaFill").style.width =
      `${state.stamina}%`;
  }

  // ============================================================
  // PLAYER SHOOTING AND WEAPON HANDLING
  // ============================================================

  function shoot() {
    if (
      !state.active ||
      !state.locked ||
      state.roundEnded ||
      state.playerDown ||
      state.reloading ||
      state.planting
    ) return;

    const w = weapons[state.weaponIndex];
    const now = performance.now();

    if (now - state.lastShot < w.rate) return;

    if (w.ammo <= 0) {
      showMessage("НЕТ ПАТРОНОВ — НАЖМИ R");
      return;
    }

    state.lastShot = now;
    w.ammo--;

    state.recoil = Math.min(
      0.13,
      state.recoil + 0.075
    );

    playShotSound(state.weaponIndex);

    if (muzzleLight) muzzleLight.intensity = 8;
    if (muzzleMesh) muzzleMesh.visible = true;

    state.muzzleTimer = 0.055;

    for (let p = 0; p < w.pellets; p++) {
      const spread = state.aiming ? 0.48 : 1;

      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * w.spread * spread,
        (Math.random() - 0.5) * w.spread * spread,
        -1
      ).applyQuaternion(camera.quaternion).normalize();

      raycaster.set(camera.position, direction);
      raycaster.far = 75;

      const wallHits = raycaster.intersectObjects(
        obstacleMeshes,
        false
      );

      let nearest = wallHits.length
        ? wallHits[0].distance
        : 75;

      let hitPoint = camera.position.clone().add(
        direction.clone().multiplyScalar(nearest)
      );

      let target = null;

      for (const enemy of enemies) {
        if (!enemy.userData.alive) continue;

        const hits = raycaster.intersectObject(enemy, true);

        if (hits.length && hits[0].distance < nearest) {
          nearest = hits[0].distance;
          hitPoint = hits[0].point.clone();
          target = enemy;
        }
      }

      if (target) {
        damageEnemy(target, w.damage, false);
        showHitMarker();
        createImpact(hitPoint, 0xffc46c, 0.2);
      }

      addTracer(
        camera.position.clone().add(
          direction.clone().multiplyScalar(0.45)
        ),
        hitPoint,
        0xffd18a,
        0.075
      );
    }

    updateHUD();
  }

  function showHitMarker() {
    const marker = $("hitMarker");

    marker.style.opacity = "1";

    clearTimeout(showHitMarker.timer);

    showHitMarker.timer = setTimeout(() => {
      marker.style.opacity = "0";
    }, 100);
  }

  function reloadWeapon() {
    if (
      !state.active ||
      state.roundEnded ||
      state.playerDown ||
      state.reloading ||
      state.planting
    ) return;

    const w = weapons[state.weaponIndex];

    if (w.ammo >= w.magazine || w.reserve <= 0) {
      return;
    }

    state.reloading = true;
    showMessage("ПЕРЕЗАРЯДКА...");
    playTone(180, 0.09, 0.018);

    setTimeout(() => {
      if (!state.reloading) return;

      const amount = Math.min(
        w.magazine - w.ammo,
        w.reserve
      );

      w.ammo += amount;
      w.reserve -= amount;
      state.reloading = false;

      updateHUD();
      showMessage("ОРУЖИЕ ГОТОВО");
    }, w.reload * 1000);
  }

  // ============================================================
  // HP REGENERATION
  // ============================================================

  function updateHealthRegeneration(delta) {
    const status = $("regenStatus");

    if (state.playerDown) {
      if (status) {
        status.textContent = "СТАТУС: ВОЗВРАЩЕНИЕ В БОЙ";
        status.classList.remove("healing");
      }
      return;
    }

    const elapsed =
      (performance.now() - state.lastDamageAt) / 1000;

    const cfg = state.difficultyData;

    if (state.health >= 100) {
      if (status) {
        status.textContent = "СТАТУС: СТАБИЛЬНО";
        status.classList.remove("healing");
      }
      return;
    }

    if (elapsed < cfg.regenDelay) {
      if (status) {
        status.textContent =
          `ВОССТАНОВЛЕНИЕ ЧЕРЕЗ ${(cfg.regenDelay - elapsed).toFixed(1)} С`;

        status.classList.remove("healing");
      }
      return;
    }

    state.health = Math.min(
      100,
      state.health + cfg.regenRate * delta
    );

    if (status) {
      status.textContent =
        `HP ВОССТАНАВЛИВАЕТСЯ · ${cfg.regenRate}/С`;

      status.classList.add("healing");
    }

    updateHUD();
  }

  function damagePlayer(amount) {
    if (
      state.roundEnded ||
      state.health <= 0 ||
      state.playerDown ||
      performance.now() < state.playerInvulnerableUntil
    ) return;

    let remaining = amount;

    const absorbed = Math.min(
      state.armor,
      remaining * 0.65
    );

    state.armor = Math.max(
      0,
      state.armor - absorbed
    );

    remaining -= absorbed;

    state.health = Math.max(
      0,
      state.health - remaining
    );

    state.lastDamageAt = performance.now();

    state.damageFlash = Math.min(
      0.88,
      state.damageFlash + 0.4
    );

    if (state.planting) {
      cancelPlanting("УСТАНОВКА ПРЕРВАНА — ПОЛУЧЕН УРОН");
    }

    const status = $("regenStatus");

    if (status) {
      status.textContent = "ПОЛУЧЕН УРОН";
      status.classList.remove("healing");
    }

    if (state.health <= 0) {
      state.deaths++;
      state.bravoRoundPoints++;

      state.playerDown = true;
      state.playerRespawnAt = performance.now() + 3200;

      state.shooting = false;
      state.aiming = false;

      showMessage(
        "ОПЕРАТОР ВЫВЕДЕН ИЗ СТРОЯ — ВОЗВРАЩЕНИЕ ЧЕРЕЗ 3 СЕК."
      );
    }

    updateHUD();
  }

  function updatePlayerRespawn(now) {
    const notice = $("respawnNotice");

    if (!state.playerDown) {
      if (notice) notice.classList.add("hidden");
      return;
    }

    const remaining = Math.max(
      0,
      (state.playerRespawnAt - now) / 1000
    );

    if (notice) {
      notice.classList.remove("hidden");
      $("respawnCountdown").textContent =
        Math.ceil(remaining);
    }

    if (now >= state.playerRespawnAt) {
      state.playerDown = false;

      state.health = 65;
      state.armor = 25;

      state.lastDamageAt = performance.now();

      state.playerInvulnerableUntil =
        performance.now() + 1800;

      camera.position.set(0, 1.7, 16);

      state.yaw = 0;
      state.pitch = 0;

      camera.rotation.set(0, 0, 0);

      if (notice) notice.classList.add("hidden");

      updateHUD();
      showMessage("ТЫ ВЕРНУЛСЯ В БОЙ");
    }
  }

  // ============================================================
  // C4 GAME OBJECTIVE
  // ============================================================

  function createPlantingPanel() {
    if ($("plantingPanel")) return;

    const panel = document.createElement("div");

    panel.id = "plantingPanel";
    panel.className = "hidden";

    panel.innerHTML = `
      <strong>УСТАНОВКА C4</strong>
      <small>Останься на месте, чтобы завершить игровое действие</small>
      <div id="plantingBar">
        <div id="plantingFill"></div>
      </div>
    `;

    game.appendChild(panel);
  }

  function startPlanting() {
    if (
      !state.active ||
      state.roundEnded ||
      state.playerDown ||
      state.bombActive ||
      state.planting ||
      state.reloading
    ) return;

    const distance = Math.hypot(
      camera.position.x,
      camera.position.z + 25
    );

    if (distance > 4.5) {
      showMessage("ПОДОЙДИ К ЗОНЕ A, ЧТОБЫ УСТАНОВИТЬ C4");
      return;
    }

    state.planting = true;
    state.plantingTime = 0;
    state.plantStart.copy(camera.position);

    $("plantingPanel").classList.remove("hidden");
    $("plantingFill").style.width = "0%";

    showMessage("УСТАНОВКА C4...");
  }

  function cancelPlanting(message) {
    if (!state.planting) return;

    state.planting = false;

    $("plantingPanel").classList.add("hidden");
    $("plantingFill").style.width = "0%";

    if (message) showMessage(message);
  }

  function finishPlanting() {
    state.planting = false;
    state.bombActive = true;
    state.bombTime = 25;

    bombGroup.visible = true;

    $("plantingPanel").classList.add("hidden");
    $("objectiveText").textContent =
      "C4 УСТАНОВЛЕН — ЗАЩИЩАЙ ЗОНУ";

    $("bombTimer").textContent =
      "ОБРАТНЫЙ ОТСЧЁТ: 25 СЕК.";

    showMessage("C4 УСТАНОВЛЕН — ЗАЩИЩАЙ ЗОНУ A!");

    playTone(620, 0.16, 0.035);
  }

  function updatePlanting(delta) {
    if (!state.planting) return;

    state.plantingTime += delta;

    const progress = Math.min(
      1,
      state.plantingTime / state.plantingDuration
    );

    $("plantingFill").style.width =
      `${progress * 100}%`;

    if (progress >= 1) finishPlanting();
  }

  function updateBomb(delta) {
    if (!state.bombActive || state.roundEnded) return;

    state.bombTime = Math.max(
      0,
      state.bombTime - delta
    );

    const pulse =
      0.5 + 0.5 * Math.sin(clock.elapsedTime * 8);

    bombGroup.position.y =
      0.38 + Math.sin(clock.elapsedTime * 7) * 0.035;

    if (bombLight) {
      bombLight.intensity = 2 + pulse * 6;
    }

    $("bombTimer").textContent =
      `ИГРОВОЙ ТАЙМЕР: ${Math.ceil(state.bombTime)} СЕК.`;

    if (state.bombTime <= 0) {
      state.bombActive = false;
      bombGroup.visible = false;

      createExplosion(
        new THREE.Vector3(0, 0.5, -25)
      );

      state.alphaRoundPoints += 3;

      $("objectiveText").textContent =
        "ЗАДАНИЕ ВЫПОЛНЕНО — +3 ОЧКА";

      $("bombTimer").textContent =
        "ЗОНА A ЗАХВАЧЕНА — РАУНД ПРОДОЛЖАЕТСЯ";

      showMessage("C4-ЗАДАНИЕ ВЫПОЛНЕНО — ALPHA +3");

      updateHUD();
    }
  }

  // ============================================================
  // VISUAL EFFECTS
  // ============================================================

  function createExplosion(position) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.11, 10, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffa64d,
        transparent: true,
        opacity: 0.9
      })
    );

    ring.position.copy(position);
    ring.position.y = 0.45;
    ring.rotation.x = Math.PI / 2;

    scene.add(ring);

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffd18a,
        transparent: true,
        opacity: 0.75
      })
    );

    flash.position.copy(position);
    flash.position.y = 0.8;

    scene.add(flash);

    const light = new THREE.PointLight(
      0xffa14b,
      35,
      40
    );

    light.position.copy(position);
    light.position.y = 1.2;

    scene.add(light);

    effects.push(
      {
        object: ring,
        light,
        life: 1.05,
        maxLife: 1.05,
        grow: 7,
        ring: true
      },
      {
        object: flash,
        life: 0.45,
        maxLife: 0.45,
        grow: 5
      }
    );
  }

  function addTracer(
    start,
    end,
    color = 0xffd18a,
    duration = 0.1
  ) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      start,
      end
    ]);

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });

    const line = new THREE.Line(geometry, material);

    scene.add(line);

    tracers.push({
      line,
      life: duration,
      duration
    });
  }

  function updateTracers(delta) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];

      t.life -= delta;

      t.line.material.opacity = Math.max(
        0,
        t.life / t.duration
      );

      if (t.life <= 0) {
        scene.remove(t.line);

        t.line.geometry.dispose();
        t.line.material.dispose();

        tracers.splice(i, 1);
      }
    }
  }

  function createImpact(
    position,
    color = 0xffb45d,
    life = 0.3
  ) {
    const object = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9
      })
    );

    object.position.copy(position);

    scene.add(object);

    effects.push({
      object,
      life,
      maxLife: life,
      grow: 2.6
    });
  }

  function updateEffects(delta) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];

      e.life -= delta;

      const p = 1 - e.life / e.maxLife;

      e.object.scale.setScalar(
        1 + p * e.grow
      );

      e.object.material.opacity = Math.max(
        0,
        e.life / e.maxLife
      );

      if (e.ring) {
        e.object.rotation.z += delta * 1.5;
      }

      if (e.light) {
        e.light.intensity = Math.max(
          0,
          e.life * 32
        );
      }

      if (e.life <= 0) {
        scene.remove(e.object);

        e.object.geometry.dispose();
        e.object.material.dispose();

        if (e.light) scene.remove(e.light);

        effects.splice(i, 1);
      }
    }
  }

  // ============================================================
  // AUDIO
  // ============================================================

  function ensureAudio() {
    if (!audioContext) {
      const C = window.AudioContext || window.webkitAudioContext;

      if (C) audioContext = new C();
    }

    if (
      audioContext &&
      audioContext.state === "suspended"
    ) {
      audioContext.resume();
    }
  }

  function playTone(
    frequency,
    duration = 0.08,
    volume = 0.025
  ) {
    try {
      ensureAudio();

      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "triangle";

      oscillator.frequency.setValueAtTime(
        frequency,
        audioContext.currentTime
      );

      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, frequency * 0.48),
        audioContext.currentTime + duration
      );

      gain.gain.setValueAtTime(
        volume,
        audioContext.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function playShotSound(index) {
    playTone(
      [125, 210, 85][index] || 120,
      index === 2 ? 0.14 : 0.085,
      0.025
    );
  }

  // ============================================================
  // HUD
  // ============================================================

  function showMessage(message) {
    const el = $("centerMessage");

    if (!el) return;

    el.textContent = message;

    clearTimeout(state.messageTimer);

    state.messageTimer = setTimeout(() => {
      el.textContent = "";
    }, 1900);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));

    const minutes = Math.floor(total / 60);
    const remaining = total % 60;

    return (
      `${String(minutes).padStart(2, "0")}:` +
      `${String(remaining).padStart(2, "0")}`
    );
  }

  function updateRoundClock(delta) {
    if (state.roundEnded) return;

    state.roundTimeRemaining = Math.max(
      0,
      state.roundTimeRemaining - delta
    );

    const clockElement = $("roundClock");

    if (clockElement) {
      clockElement.textContent =
        formatTime(state.roundTimeRemaining);
    }

    if (state.roundTimeRemaining <= 0) {
      const alpha = state.alphaRoundPoints;
      const bravo = state.bravoRoundPoints;

      const winner =
        alpha === bravo ? null : alpha > bravo;

      const summary =
        `Время вышло. ALPHA: ${alpha} очк. — BRAVO: ${bravo} очк.`;

      endRound(winner, summary);
    }
  }

  function updateSquadHUD() {
    const container = $("squadMembers");

    if (!container) return;

    const alive = allies.filter(
      a => a.userData.alive
    ).length;

    $("squadCount").textContent =
      `${String(alive).padStart(2, "0")} / 03`;

    container.innerHTML = allies.map(ally => {
      const d = ally.userData;
      const hp = Math.round(d.health);

      return `
        <div class="squad-member ${d.alive ? "" : "down"}">
          <div class="squad-member-top">
            <strong>${d.name}</strong>
            <span>${d.alive ? hp + "%" : "OUT"}</span>
          </div>
          <div class="squad-health">
            <div style="width:${hp}%"></div>
          </div>
          <small>${d.role}</small>
        </div>
      `;
    }).join("");
  }

  function updateHUD() {
    const w = weapons[state.weaponIndex];

    $("health").textContent = Math.ceil(state.health);
    $("healthFill").style.width = `${state.health}%`;

    $("armor").textContent = Math.ceil(state.armor);
    $("armorFill").style.width = `${state.armor}%`;

    $("staminaValue").textContent =
      Math.round(state.stamina);

    $("staminaFill").style.width =
      `${state.stamina}%`;

    $("kills").textContent =
      String(state.kills).padStart(2, "0");

    $("deaths").textContent =
      String(state.deaths).padStart(2, "0");

    $("botsAlive").textContent =
      String(enemies.filter(e => e.userData.alive).length)
        .padStart(2, "0");

    $("teamScore").textContent =
      String(state.alphaScore).padStart(2, "0");

    $("enemyScore").textContent =
      String(state.bravoScore).padStart(2, "0");

    $("roundText").textContent =
      `ROUND ${String(state.round).padStart(2, "0")}`;

    $("roundClock").textContent =
      formatTime(state.roundTimeRemaining);

    $("roundPoints").textContent =
      `ALPHA ${state.alphaRoundPoints} : ${state.bravoRoundPoints} BRAVO`;

    $("weaponName").textContent = w.name;
    $("ammoNow").textContent = w.ammo;
    $("ammoReserve").textContent = w.reserve;

    for (let i = 0; i < 3; i++) {
      $("slot" + (i + 1)).classList.toggle(
        "selected",
        i === state.weaponIndex
      );
    }

    $("difficultyReadout").textContent =
      state.difficultyData.label;

    updateSquadHUD();
  }

  // ============================================================
  // ROUND SYSTEM
  // ============================================================

  function endRound(won, description) {
    if (state.roundEnded) return;

    state.roundEnded = true;
    state.active = false;
    state.shooting = false;
    state.planting = false;
    state.playerDown = false;

    $("plantingPanel").classList.add("hidden");

    if (won === true) {
      state.alphaScore++;
    } else if (won === false) {
      state.bravoScore++;
    }

    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock();
    }

    const result = $("roundResult");

    result.textContent =
      won === null ? "DRAW" : won ? "VICTORY" : "DEFEAT";

    result.style.color =
      won === null
        ? "#ffb45d"
        : won
          ? "#55c8ff"
          : "#ff5965";

    $("roundDescription").textContent = description;

    $("resultKills").textContent =
      String(state.kills).padStart(2, "0");

    $("resultDeaths").textContent =
      String(state.deaths).padStart(2, "0");

    $("resultRound").textContent =
      String(state.round).padStart(2, "0");

    $("resultPoints").textContent =
      `${state.alphaRoundPoints} : ${state.bravoRoundPoints}`;

    $("roundScreen").classList.remove("hidden");

    updateHUD();
  }

  function restartRound() {
    state.round++;

    state.health = 100;
    state.armor = 100;
    state.stamina = 100;

    state.lastDamageAt = -Infinity;

    state.roundEnded = false;
    state.active = true;
    state.paused = false;

    state.bombActive = false;
    state.bombTime = 25;

    state.planting = false;
    state.reloading = false;
    state.shooting = false;
    state.aiming = false;

    state.playerDown = false;
    state.playerRespawnAt = 0;
    state.playerInvulnerableUntil = 0;

    state.recoil = 0;
    state.weaponIndex = 0;

    state.alphaRoundPoints = 0;
    state.bravoRoundPoints = 0;

    state.roundTimeRemaining = state.roundDuration;
    state.nextEnemyWaveAt = 0;

    camera.position.set(0, 1.7, 16);

    state.yaw = 0;
    state.pitch = 0;

    camera.rotation.set(0, 0, 0);

    for (const w of weapons) {
      w.ammo = w.magazine;
    }

    weapons[0].reserve = 120;
    weapons[1].reserve = 60;
    weapons[2].reserve = 40;

    bombGroup.visible = false;

    $("objectiveText").textContent =
      "ЭЛИМИНИРУЙ ПРОТИВНИКОВ ИЛИ УСТАНОВИ C4";

    $("bombTimer").textContent =
      "ЗОНА A — ДОСТУПНА ДЛЯ УСТАНОВКИ";

    $("roundScreen").classList.add("hidden");
    $("pauseScreen").classList.add("hidden");

    createWeapon();
    spawnEnemies();
    spawnAllies();
    updateHUD();

    showMessage(
      `РАУНД ${state.round} — КОМАНДА ALPHA ВЫДВИГАЕТСЯ`
    );
  }

  // ============================================================
  // DIFFICULTY MENU
  // ============================================================

  const difficultyDescriptions = {
    recruit:
      "Противники менее меткие, реже стреляют и имеют меньше здоровья.",

    operative:
      "Сбалансированный бой: враги меткие, союзники хорошо помогают.",

    veteran:
      "Более быстрые враги, точная стрельба и меньше времени на восстановление.",

    nightmare:
      "Экстремальный режим: больше противников, высокая точность и сильный урон."
  };

  $("difficultySelect").addEventListener("change", () => {
    $("difficultyDescription").textContent =
      difficultyDescriptions[$("difficultySelect").value] ||
      difficultyDescriptions.operative;
  });

  // ============================================================
  // PERFORMANCE HUD
  // ============================================================

  function updatePerformance(now) {
    state.fpsFrames++;

    const elapsed = now - state.fpsTime;

    if (elapsed >= 500) {
      $("fpsValue").textContent = String(
        Math.round(state.fpsFrames * 1000 / elapsed)
      );

      state.fpsFrames = 0;
      state.fpsTime = now;
    }
  }

  // ============================================================
  // INPUT
  // ============================================================

  const canvas = renderer.domElement;

  $("startButton").addEventListener("click", () => {
    ensureAudio();

    state.difficulty =
      $("difficultySelect").value || "operative";

    state.difficultyData =
      DIFFICULTIES[state.difficulty] ||
      DIFFICULTIES.operative;

    state.roundDuration =
      Number($("roundDurationSelect").value) === 300
        ? 300
        : 120;

    state.roundTimeRemaining = state.roundDuration;

    state.alphaRoundPoints = 0;
    state.bravoRoundPoints = 0;

    state.active = true;

    updateHUD();

    $("startScreen").classList.add("hidden");

    spawnEnemies();
    spawnAllies();

    canvas.requestPointerLock();
  });

  $("nextRoundButton").addEventListener("click", () => {
    restartRound();
    canvas.requestPointerLock();
  });

  $("resumeButton").addEventListener("click", () => {
    state.paused = false;
    state.active = true;

    $("pauseScreen").classList.add("hidden");

    canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    state.locked =
      document.pointerLockElement === canvas;

    if (
      !state.locked &&
      state.active &&
      !state.roundEnded
    ) {
      state.paused = true;
      state.active = false;

      $("pauseScreen").classList.remove("hidden");
    }
  });

  document.addEventListener("mousemove", event => {
    if (
      !state.locked ||
      !state.active ||
      state.roundEnded
    ) return;

    state.yaw -= event.movementX * 0.00175;
    state.pitch -= event.movementY * 0.00175;

    state.pitch = THREE.MathUtils.clamp(
      state.pitch,
      -Math.PI / 2 + 0.04,
      Math.PI / 2 - 0.04
    );

    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
  });

  document.addEventListener("keydown", event => {
    if (keys[event.code]) return;

    keys[event.code] = true;

    switch (event.code) {
      case "KeyW":
        state.forward = true;
        break;

      case "KeyS":
        state.backward = true;
        break;

      case "KeyA":
        state.left = true;
        break;

      case "KeyD":
        state.right = true;
        break;

      case "ShiftLeft":
      case "ShiftRight":
        state.sprint = true;
        break;

      case "KeyR":
        reloadWeapon();
        break;

      case "KeyE":
        startPlanting();
        break;

      case "Digit1":
        switchWeapon(0);
        break;

      case "Digit2":
        switchWeapon(1);
        break;

      case "Digit3":
        switchWeapon(2);
        break;
    }
  });

  document.addEventListener("keyup", event => {
    keys[event.code] = false;

    switch (event.code) {
      case "KeyW":
        state.forward = false;
        break;

      case "KeyS":
        state.backward = false;
        break;

      case "KeyA":
        state.left = false;
        break;

      case "KeyD":
        state.right = false;
        break;

      case "ShiftLeft":
      case "ShiftRight":
        state.sprint = false;
        break;
    }
  });

  document.addEventListener("mousedown", event => {
    if (
      !state.locked ||
      !state.active ||
      state.roundEnded
    ) return;

    if (event.button === 0) {
      state.shooting = true;
      shoot();
    }

    if (event.button === 2) {
      state.aiming = true;
    }
  });

  document.addEventListener("mouseup", event => {
    if (event.button === 0) state.shooting = false;
    if (event.button === 2) state.aiming = false;
  });

  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  window.addEventListener("blur", () => {
    if (
      state.active &&
      !state.roundEnded &&
      document.pointerLockElement === canvas
    ) {
      document.exitPointerLock();
    }
  });

  // ============================================================
  // MAIN LOOP
  // ============================================================

  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.04);
    const now = performance.now();

    if (
      state.active &&
      state.locked &&
      !state.roundEnded
    ) {
      updateRoundClock(delta);

      if (state.active && !state.roundEnded) {
        updatePlayerRespawn(now);
        updateEnemyWaves(now);

        updatePlayer(delta);
        updateAllies(delta, now);
        updateEnemies(delta);

        updatePlanting(delta);
        updateBomb(delta);

        updateHealthRegeneration(delta);
      }

      if (
        state.active &&
        state.shooting &&
        weapons[state.weaponIndex].automatic
      ) {
        shoot();
      }

      const targetX = state.aiming ? 0.12 : 0.39;
      const targetY = state.aiming ? -0.265 : -0.34;

      weaponGroup.position.x = THREE.MathUtils.lerp(
        weaponGroup.position.x,
        targetX,
        delta * 10
      );

      weaponGroup.position.y = THREE.MathUtils.lerp(
        weaponGroup.position.y,
        targetY,
        delta * 10
      );

      camera.fov = THREE.MathUtils.lerp(
        camera.fov,
        state.aiming ? 57 : 76,
        delta * 8
      );

      camera.updateProjectionMatrix();
    } else if (state.playerDown && !state.roundEnded) {
      updatePlayerRespawn(now);
    }

    updatePerformance(now);

    state.recoil = THREE.MathUtils.lerp(
      state.recoil,
      0,
      delta * 12
    );

    if (weaponGroup) {
      weaponGroup.position.z =
        -0.66 + state.recoil;

      weaponGroup.rotation.x =
        -state.recoil * 0.65;
    }

    if (state.muzzleTimer > 0) {
      state.muzzleTimer -= delta;

      if (state.muzzleTimer <= 0) {
        if (muzzleLight) muzzleLight.intensity = 0;
        if (muzzleMesh) muzzleMesh.visible = false;
      }
    }

    state.damageFlash = Math.max(
      0,
      state.damageFlash - delta * 1.65
    );

    $("damageOverlay").style.opacity =
      String(state.damageFlash);

    if (dustPoints) {
      dustPoints.rotation.y += delta * 0.0025;
    }

    updateTracers(delta);
    updateEffects(delta);

    renderer.render(scene, camera);
  }

  // ============================================================
  // RESIZE
  // ============================================================

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(innerWidth, innerHeight);

    renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, 1.65)
    );
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  function init() {
    state.roundDuration = 120;
    state.roundTimeRemaining = 120;
    state.difficultyData = DIFFICULTIES.operative;

    createWorld();
    createBombSite();
    createPlantingPanel();
    createWeapon();

    updateHUD();
    animate();
  }

  init();
})();