// VibeSphere WebXR – Clean version with debug + error handling

import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { VRButton } from "https://unpkg.com/three@0.161.0/examples/jsm/webxr/VRButton.js";

// ------- Helper logging & error reporting -------
const overlayError = document.getElementById("overlay-error");
function log(stage, msg) {
  console.log(`[VibeSphere][${stage}] ${msg}`);
}
function reportError(stage, error) {
  console.error(`[VibeSphere ERROR][${stage}]`, error);
  if (overlayError) {
    const msg = error?.message || String(error);
    overlayError.textContent = `⚠ ${stage}: ${msg}`;
  }
}


// ------- Globals -------
let scene, camera, renderer;
let panelGroup;
let panels = [];
let curvedScreen;
let videoTexture;
let htmlVideo;
let currentItem = null;
let currentPlaylistId = null;
let currentPlaylistIndex = 0;
let audioEnabled = false;



const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const controllers = [];
const tmpMatrix = new THREE.Matrix4();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();

// ----- Online playlists (free, legal sample videos) -----
const playlists = {
  creators: [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  ],
  music: [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  ],
  gaming: [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  ],
  news: [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  ],
};


// Public sample MP4s so it works even with no local files
const trendingItems = [
  {
    id: 1,
    title: "Top Creator Clips",
    color: 0xff7b7b,
    description: "A curated wall of viral creator moments.",
    playlistId: "creators",
  },
  {
    id: 2,
    title: "Global Music Vibes",
    color: 0x7be0ff,
    description: "Relaxing ocean view loop.",
    playlistId: "music",
  },
  {
    id: 3,
    title: "Gaming Highlights",
    color: 0x9d7bff,
    description: "Fast paced race footage.",
    playlistId: "gaming",
  },
  {
    id: 4,
    title: "News & Explainers",
    color: 0xffc857,
    description: "Short explainer style clip.",
    playlistId: "news",
  },
];


// ------- Init pipeline with try/catch per phase -------
try {
  setupRendererAndScene();
  setupRoom();
  setupPanels();
  setupVideoScreen();
  setupXRControllers();
  setupDOMControls();
  setupDesktopInteraction();
  startLoop();
} catch (err) {
  reportError("Top-level init", err);
}

// ------- Phase 1: renderer + scene -------
function setupRendererAndScene() {
  try {
    log("Renderer", "Initializing renderer and camera");

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050814);

    camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.6, 4);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // VR button
    try {
      const vrButton = VRButton.createButton(renderer);
      const container = document.getElementById("vr-button-container");
      if (container) container.appendChild(vrButton);
    } catch (err) {
      reportError("VRButton", err);
    }

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x202028, 0.9);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    window.addEventListener("resize", onWindowResize);
  } catch (err) {
    reportError("Renderer/Scene setup", err);
    throw err;
  }
}

function onWindowResize() {
  try {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  } catch (err) {
    reportError("Resize", err);
  }
}

// ------- Phase 2: room -------
function setupRoom() {
  try {
    log("Room", "Building floor and back wall");

    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x101320,
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    const backWallGeo = new THREE.PlaneGeometry(20, 6);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x111628,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 3, -6);
    scene.add(backWall);

    const glowGeo = new THREE.PlaneGeometry(12, 3);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4048ff,
      transparent: true,
      opacity: 0.15,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 2.5, -5.9);
    scene.add(glow);
  } catch (err) {
    reportError("Room setup", err);
    throw err;
  }
}

// ------- Phase 3: panels -------
function setupPanels() {
  try {
    log("Panels", "Creating trending category panels");

    panels = [];
    panelGroup = new THREE.Group();
    scene.add(panelGroup);

    const panelWidth = 1.4;
    const panelHeight = 0.8;
    const panelGeo = new THREE.PlaneGeometry(panelWidth, panelHeight);

    const spacing = 1.8;
    const startX = -((trendingItems.length - 1) * spacing) / 2;

    trendingItems.forEach((item, index) => {
      const tex = createPanelTexture(item.title, item.color);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.5,
        metalness: 0.1,
      });
      mat.emissive = new THREE.Color(0x000000); // start with no glow
      mat.emissiveIntensity = 0.0;


      const mesh = new THREE.Mesh(panelGeo, mat);
      mesh.position.set(startX + index * spacing, 1.0, -4);
      mesh.userData.item = item;
      mesh.userData.baseScale = 1.0;
      mesh.rotation.y = THREE.MathUtils.degToRad((index - 1.5) * 5);

      panelGroup.add(mesh);
      panels.push(mesh);
    });

    currentItem = trendingItems[0];
  } catch (err) {
    reportError("Panels setup", err);
    throw err;
  }
}

function createPanelTexture(title, colorHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#050714";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#0c1028");
  grad.addColorStop(1, `#${colorHex.toString(16).padStart(6, "0")}`);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title.slice(0, 30), 60, canvas.height / 2 - 20);

  ctx.fillStyle = "rgba(220,220,255,0.85)";
  ctx.font = "32px system-ui";
  ctx.fillText("Click or pinch to play", 60, canvas.height / 2 + 70);

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

// ------- Phase 4: curved video screen -------
function setupVideoScreen() {
  try {
    log("Video", "Setting up HTML video and curved screen");

    htmlVideo = document.getElementById("vs-video");
    if (!htmlVideo) throw new Error("Missing #vs-video element");

    htmlVideo.crossOrigin = "anonymous";
    htmlVideo.muted = true;
    htmlVideo.loop = true;
    htmlVideo.playsInline = true;

    // pick an initial video
    const firstItem = trendingItems[0];
    let initialUrl = null;

    if (firstItem && firstItem.playlistId) {
      const list = playlists[firstItem.playlistId];
      if (list && list.length > 0) {
        initialUrl = list[0];
        currentPlaylistId = firstItem.playlistId;
        currentPlaylistIndex = 0;
      }
    }

    // Fallback to a known-good sample if anything is missing
    if (!initialUrl) {
      initialUrl =
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
    }

    htmlVideo.src = initialUrl;
    htmlVideo.load();

    // Wait until the video has data before creating the texture + mesh
    htmlVideo.addEventListener("loadeddata", () => {
      log("Video", "loadeddata for " + htmlVideo.currentSrc);

      // create texture ONLY now
      videoTexture = new THREE.VideoTexture(htmlVideo);
      videoTexture.colorSpace = THREE.SRGBColorSpace; // new name instead of encoding

      const screenRadius = 3.2;
      const screenHeight = 2.2;

      const screenGeo = new THREE.PlaneGeometry(4.0, 1.6);

      const screenMat = new THREE.MeshBasicMaterial({
          map: videoTexture,
          side: THREE.DoubleSide,    // make sure we always see it
        });

      curvedScreen = new THREE.Mesh(screenGeo, screenMat);
      curvedScreen.position.set(0, 3.0, -4.4);
      curvedScreen.rotation.y = Math.PI;
      scene.add(curvedScreen);

      playVideo(); // start playback after we’re fully ready
    });

    // also listen for errors
    htmlVideo.addEventListener("error", () => {
      const err = htmlVideo.error;
      if (err) {
        reportError("Video element", new Error(`code=${err.code}`));
      }
    });
  } catch (err) {
    reportError("Video screen setup", err);
    throw err;
  }
}



// ------- Video control helpers -------
let isPlaying = false;

function playVideo() {
  if (!htmlVideo) return;

  htmlVideo
    .play()
    .then(() => {
      isPlaying = true;
      const btn = document.getElementById("play-pause");
      if (btn) btn.textContent = "Pause";
      if (overlayError) overlayError.textContent = "";
      log("Video", "Playback started: " + htmlVideo.currentSrc);
    })
    .catch((err) => {
      const msg = err?.message || "";
      // Ignore noisy "interrupted by a new load request" / AbortError
      if (
        err.name === "AbortError" ||
        msg.includes("interrupted by a new load request")
      ) {
        console.warn(
          "[VibeSphere][Video] Play interrupted by new load request (safe to ignore)"
        );
        return;
      }
      reportError("Video play", err);
    });
}

function ensureAudioEnabled() {
  try {
    if (!htmlVideo || audioEnabled) return;
    htmlVideo.muted = false;
    htmlVideo.volume = 1.0;
    audioEnabled = true;
    log("Audio", "Audio unmuted and volume set to 1.0");
    updateAudioButtonLabel();
  } catch (err) {
    reportError("ensureAudioEnabled", err);
  }
}


function updateAudioButtonLabel() {
  const btn = document.getElementById("unmute");
  if (!btn || !htmlVideo) return;
  btn.textContent = htmlVideo.muted ? "Unmute" : "Mute";
}

function toggleMute() {
  try {
    if (!htmlVideo) return;

    if (htmlVideo.muted || htmlVideo.volume === 0) {
      htmlVideo.muted = false;
      htmlVideo.volume = 1.0;
      audioEnabled = true;
      log("Audio", "Unmuted");
    } else {
      htmlVideo.muted = true;
      log("Audio", "Muted");
    }

    updateAudioButtonLabel();
  } catch (err) {
    reportError("toggleMute", err);
  }
}

function updateVolumeLabel() {
  const label = document.getElementById("volume-label");
  if (!label || !htmlVideo) return;

  const percent = Math.round(htmlVideo.volume * 100);
  label.textContent = `Vol: ${percent}%`;
}


function changeVolume(delta) {
  try {
    if (!htmlVideo) return;

    let newVol = htmlVideo.volume + delta;
    newVol = Math.max(0, Math.min(1, newVol));
    htmlVideo.volume = newVol;

    if (newVol > 0) {
      htmlVideo.muted = false;
      audioEnabled = true;
    }

    log("Volume", `Set volume to ${Math.round(newVol * 100)}%`);

    updateAudioButtonLabel();
    updateVolumeLabel();   // <-- update the UI
  } catch (err) {
    reportError("changeVolume", err);
  }
}



function seekBy(deltaSeconds) {
  try {
    if (!htmlVideo) return;

    if (Number.isNaN(htmlVideo.currentTime)) return;

    const duration = htmlVideo.duration || 0;
    let target = htmlVideo.currentTime + deltaSeconds;

    if (target < 0) target = 0;
    if (duration && target > duration - 0.1) {
      // avoid instantly triggering "ended" event
      target = duration - 0.1;
    }

    htmlVideo.currentTime = target;
    log("Seek", `Jumped by ${deltaSeconds}s to ${target.toFixed(2)}s`);
  } catch (err) {
    reportError("Seek", err);
  }
}

function playFromPlaylist(playlistId, startIndex = 0) {
  try {
    const list = playlists[playlistId];
    if (!list || list.length === 0) {
      reportError("Playlist", new Error(`No videos for playlist '${playlistId}'`));
      return;
    }

    currentPlaylistId = playlistId;
    currentPlaylistIndex = startIndex % list.length;

    const url = list[currentPlaylistIndex];
    log("Playlist", `Playing [${playlistId}] index ${currentPlaylistIndex}: ${url}`);

    htmlVideo.pause();
    isPlaying = false;
    htmlVideo.src = url;
    htmlVideo.load();
    videoTexture.needsUpdate = true;

    htmlVideo.onloadeddata = () => {
      playVideo();
    };

    // when video ends, jump to next video in the same playlist
    htmlVideo.onended = () => {
      const nextIndex = (currentPlaylistIndex + 1) % list.length;
      playFromPlaylist(playlistId, nextIndex);
    };
  } catch (err) {
    reportError("playFromPlaylist", err);
  }
}


function pauseVideo() {
  if (!htmlVideo) return;
  htmlVideo.pause();
  isPlaying = false;
  const btn = document.getElementById("play-pause");
  if (btn) btn.textContent = "Play";
  log("Video", "Playback paused");
}

// ------- Phase 5: XR controllers (also handle hand pinch via select events) -------
function setupXRControllers() {
  try {
    log("XR", "Configuring controllers");

    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      controller.addEventListener("selectstart", () => onXRSelect(controller));

      // simple debug ray
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ linewidth: 2 })
      );
      line.name = "ray";
      line.scale.z = 5;
      controller.add(line);

      scene.add(controller);
      controllers.push(controller);
    }
  } catch (err) {
    reportError("XR controllers setup", err);
    // don't rethrow; app can still run on desktop
  }
}


function onXRSelect(controller) {
  try {
    tmpMatrix.identity().extractRotation(controller.matrixWorld);
    origin.setFromMatrixPosition(controller.matrixWorld);
    direction.set(0, 0, -1).applyMatrix4(tmpMatrix);

    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(panels, false);
    if (hits.length > 0) {
      activatePanel(hits[0].object);
    }
  } catch (err) {
    reportError("XR select", err);
  }
}

// ------- Phase 6: DOM controls -------
function setupDOMControls() {
  try {
    log("DOM", "Wiring buttons and input");

    const urlInput = document.getElementById("video-url");
    const loadBtn = document.getElementById("load-video");
    const playPauseBtn = document.getElementById("play-pause");
    const unmuteBtn = document.getElementById("unmute");
    const backBtn = document.getElementById("seek-back");
    const fwdBtn = document.getElementById("seek-forward");
    const volDownBtn = document.getElementById("vol-down");
    const volUpBtn = document.getElementById("vol-up");




    if (loadBtn) {
      loadBtn.addEventListener("click", () => {
        try {
          const customUrl = urlInput ? urlInput.value.trim() : "";
      
          if (customUrl) {
            // Single custom video (not part of playlist)
            log("Video", "Manual URL: " + customUrl);
            htmlVideo.pause();
            isPlaying = false;
            currentPlaylistId = null; // stop playlist logic
            htmlVideo.src = customUrl;
            htmlVideo.load();
            videoTexture.needsUpdate = true;
            htmlVideo.onloadeddata = () => playVideo();
            htmlVideo.onended = null; // no auto-next
          } else if (currentItem && currentItem.playlistId) {
            // If no URL typed, restart current card's playlist
            playFromPlaylist(currentItem.playlistId, 0);
          } else {
            // Fallback to creators playlist
            playFromPlaylist("creators", 0);
          }
        } catch (err) {
          reportError("Load video button", err);
        }
      });
      
    }

    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        try {
          if (isPlaying) pauseVideo();
          else playVideo();
          ensureAudioEnabled();
        } catch (err) {
          reportError("Play/Pause button", err);
        }
      });
    }
    if (unmuteBtn) {
      unmuteBtn.addEventListener("click", () => {
        try {
          toggleMute();
        } catch (err) {
          reportError("Unmute button", err);
        }
      });
    }
    
    updateAudioButtonLabel();
    updateVolumeLabel();

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        try {
          seekBy(-10); // rewind 10 seconds
        } catch (err) {
          reportError("Seek back button", err);
        }
      });
    }

    if (fwdBtn) {
      fwdBtn.addEventListener("click", () => {
        try {
          seekBy(10); // fast-forward 10 seconds
        } catch (err) {
          reportError("Seek forward button", err);
        }
      });
    }

    if (volDownBtn) {
      volDownBtn.addEventListener("click", () => {
        try {
          changeVolume(-0.1); // reduce volume by 10%
        } catch (err) {
          reportError("Volume down button", err);
        }
      });
    }
    
    if (volUpBtn) {
      volUpBtn.addEventListener("click", () => {
        try {
          changeVolume(0.1); // increase volume by 10%
        } catch (err) {
          reportError("Volume up button", err);
        }
      });
    }
    

    updateAudioButtonLabel();


    
  } catch (err) {
    reportError("DOM controls setup", err);
  }
}

// ------- Phase 7: desktop mouse interaction -------
function setupDesktopInteraction() {
  try {
    log("Desktop", "Pointer hover + click enabled");

    window.addEventListener("pointermove", (event) => {
      try {
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = -(event.clientY / window.innerHeight) * 2 + 1;
        mouse.set(x, y);
      } catch (err) {
        reportError("Pointermove", err);
      }
    });

    window.addEventListener("click", () => {
      try {
        const hit = getHoveredPanel();
        if (hit) activatePanel(hit);
      } catch (err) {
        reportError("Click handler", err);
      }
    });
  } catch (err) {
    reportError("Desktop interaction setup", err);
  }
}

let hoveredPanel = null;

function getHoveredPanel() {
  // 1) Desktop pointer hover
  raycaster.setFromCamera(mouse, camera);
  let hits = raycaster.intersectObjects(panels, false);
  if (hits.length > 0) {
    return hits[0].object;
  }

  // 2) XR controllers / hands hover (select rays)
  for (const controller of controllers) {
    if (!controller.visible) continue;

    tmpMatrix.identity().extractRotation(controller.matrixWorld);
    origin.setFromMatrixPosition(controller.matrixWorld);
    direction.set(0, 0, -1).applyMatrix4(tmpMatrix);

    raycaster.set(origin, direction);
    hits = raycaster.intersectObjects(panels, false);
    if (hits.length > 0) {
      return hits[0].object;
    }
  }

  return null;
}


function updateHover() {
  try {
    const hit = getHoveredPanel();

    if (hit) {
      if (hoveredPanel && hoveredPanel !== hit) {
        // reset previous
        hoveredPanel.scale.set(1, 1, 1);
        if (hoveredPanel.material && hoveredPanel.material.emissive) {
          hoveredPanel.material.emissiveIntensity = 0.0;
        }
      }

      hoveredPanel = hit;
      hoveredPanel.scale.set(1.05, 1.05, 1.05);

      if (hoveredPanel.material && hoveredPanel.material.emissive) {
        hoveredPanel.material.emissive = new THREE.Color(0xffffff);
        hoveredPanel.material.emissiveIntensity = 0.25; // subtle glow
      }
    } else {
      if (hoveredPanel) {
        hoveredPanel.scale.set(1, 1, 1);
        if (hoveredPanel.material && hoveredPanel.material.emissive) {
          hoveredPanel.material.emissiveIntensity = 0.0;
        }
      }
      hoveredPanel = null;
    }
  } catch (err) {
    reportError("Hover update", err);
  }
}


function activatePanel(panel) {
  try {
    if (!panel || !panel.userData.item) return;
    const item = panel.userData.item;
    currentItem = item;

    ensureAudioEnabled();

    // 🔁 NEW: play from the associated playlist
    if (item.playlistId) {
      playFromPlaylist(item.playlistId, 0);
    }

    // overlay text still fine
    const overlayText = document.getElementById("overlay-text");
    if (overlayText) {
      overlayText.innerHTML =
        `<strong>${item.title}</strong><br/>${item.description}<br/><br/>` +
        `Click or pinch another card to switch playlists.`;
    }

    log("Panel", `Activated: ${item.title}`);
  } catch (err) {
    reportError("Activate panel", err);
  }
}


// ------- Animation loop -------
function startLoop() {
  try {
    log("Loop", "Starting render loop");
    renderer.setAnimationLoop(render);
  } catch (err) {
    reportError("Start loop", err);
    throw err;
  }
}

function render() {
  try {
    const t = performance.now() * 0.001;

    if (panelGroup) {
      panelGroup.children.forEach((panel, i) => {
        panel.position.y = 0.65 + Math.sin(t + i) * 0.03;
      });
    }
    if (curvedScreen) {
      curvedScreen.position.y = 2.1 + Math.sin(t * 0.5) * 0.05;
    }

    updateHover();
    renderer.render(scene, camera);
  } catch (err) {
    reportError("Render", err);
  }
}
