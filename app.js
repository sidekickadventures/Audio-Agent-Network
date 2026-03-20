// ======= Config =======
const API_BASE = 'http://localhost:3456';
const AGENT_LOOP_INTERVAL = 45000; // 45s between agent actions

// ======= Router =======
class Router {
  constructor() {
    this.routes = [];
    window.onpopstate = () => this.resolve(location.pathname);
  }
  register(path, handler) { this.routes.push({ path, handler }); }
  resolve(path) {
    const route = this.routes.find(r => new RegExp(r.path.replace(/:\w+/g, "\\w+")).test(path));
    if (route) route.handler(this.extractParams(route.path, path));
  }
  extractParams(routePath, actualPath) {
    const keys = (routePath.match(/:\w+/g) || []).map(k => k.slice(1));
    const values = actualPath.split("/").slice(1);
    const params = {};
    keys.forEach((k, i) => params[k] = values[i]);
    return params;
  }
  navigate(path) {
    history.pushState({}, "", path);
    this.resolve(path);
  }
}
const router = new Router();
router.register("/", () => renderFeed());
router.register("/audio/:id", ({ id }) => renderAudioPost(id));

// ======= OpenClaw =======
const OpenClaw = {
  routes: {},
  register(type, handler) { this.routes[type] = handler; },
  async route(intent) {
    if (intent.payload?.id) router.navigate(`/audio/${intent.payload.id}`);
    return this.routes[intent.type]?.(intent);
  }
};

// ======= AudioContext Unlock =======
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  Tone.start().then(() => { audioUnlocked = true; console.log("AudioContext unlocked"); }).catch(() => {});
};
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ======= Style Tags (Color Coding) =======
const STYLE_COLORS = {
  trap:     { bg: '#7b0000', text: '#ff5555', label: 'TRAP' },
  lofi:     { bg: '#0d3d2d', text: '#50fa7b', label: 'LOFI' },
  synthwave:{ bg: '#2d0d5c', text: '#bd93f9', label: 'SYNTHWAVE' },
  drill:    { bg: '#3d0d35', text: '#ff79c6', label: 'DRILL' },
  hiphop:   { bg: '#1a3a0a', text: '#98fb98', label: 'HIPHOP' },
  dubstep:  { bg: '#3d1a00', text: '#ffb86c', label: 'DUBSTEP' },
  human:    { bg: '#0a2d4d', text: '#00d4ff', label: 'HUMAN' },
  default:  { bg: '#1a1a2e', text: '#888888', label: 'UNKNOWN' }
};

function getStyleInfo(style) {
  return STYLE_COLORS[style?.toLowerCase()] || STYLE_COLORS.default;
}

// ======= Agent System =======
const agentTemplates = [
  { name: "TrapKing",   style: "trap",      genre: "trap",      bpmRange: [130, 150], personalityTraits: { boldness: 0.8, remixRate: 0.35 } },
  { name: "LoFiLounge",style: "lofi",      genre: "lofi",      bpmRange: [65, 90],  personalityTraits: { boldness: 0.3, remixRate: 0.25 } },
  { name: "SynthWave", style: "synthwave", genre: "synthwave", bpmRange: [100, 128],personalityTraits: { boldness: 0.6, remixRate: 0.40 } },
  { name: "DrillSquad",style: "drill",     genre: "drill",     bpmRange: [140, 160],personalityTraits: { boldness: 0.9, remixRate: 0.50 } },
  { name: "BeatLab",   style: "hiphop",    genre: "hiphop",    bpmRange: [85, 100], personalityTraits: { boldness: 0.7, remixRate: 0.45 } },
  { name: "BassDrop",  style: "dubstep",   genre: "dubstep",   bpmRange: [138, 145],personalityTraits: { boldness: 0.85, remixRate: 0.30 } }
];

let agents = [];
function initAgents() {
  const stored = localStorage.getItem('aan_agents');
  if (stored) {
    agents = JSON.parse(stored);
  } else {
    agents = agentTemplates.map(a => ({ ...a, tracksCreated: 0, remixesDone: 0 }));
    saveAgents();
  }
}
function saveAgents() { localStorage.setItem('aan_agents', JSON.stringify(agents)); }

// ======= Feed =======
let feed = [];
function loadFeed() {
  const stored = localStorage.getItem('aan_feed');
  feed = stored ? JSON.parse(stored) : [];
}
function saveFeed() { localStorage.setItem('aan_feed', JSON.stringify(feed)); }

function renderFeed() {
  const el = document.getElementById("feed");
  if (!el) return;
  if (feed.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎵</div>
      <div class="empty-title">No tracks yet</div>
      <div class="empty-sub">Click "Generate Sound" or wait for agents to start creating</div>
    </div>`;
    return;
  }
  el.innerHTML = feed.map(p => {
    const style = getStyleInfo(p.style);
    return `
    <div class="post" data-id="${p.id}">
      <div class="post-header">
        <strong class="agent-name">${p.agent}</strong>
        <span class="style-tag" style="background:${style.bg};color:${style.text}">${style.label}</span>
        <span class="meta">${p.bpm} BPM</span>
        ${p.isRemix && p.parentId ? '<span class="remix-badge">🔄 Remix</span>' : ''}
        ${p.generating ? '<span class="gen-badge">⚙️ Generating...</span>' : ''}
      </div>
      <div class="post-actions">
        <button class="play-btn" onclick="playTrack(${p.id})" ${p.generating ? 'disabled' : ''}>▶ Play</button>
        <button class="stop-btn" onclick="stopTrack()">■ Stop</button>
        <button class="remix-btn" onclick="manualRemix(${p.id})" ${p.generating ? 'disabled' : ''}>🔄 Remix</button>
      </div>
    </div>`;
  }).join("");
}

function renderAudioPost(id) {
  const post = feed.find(p => p.id == id);
  if (!post) return renderFeed();
  const style = getStyleInfo(post.style);
  const el = document.getElementById("feed");
  el.innerHTML = `
    <div class="post-detail">
      <h2>${post.agent} <span class="style-tag" style="background:${style.bg};color:${style.text}">${style.label}</span></h2>
      <p class="track-meta">${post.bpm} BPM | ${post.isRemix ? '🔄 Remix' : 'Original'}</p>
      <div class="controls">
        <button class="play-btn" onclick="playTrack(${post.id})" ${post.generating ? 'disabled' : ''}>▶ Play</button>
        <button class="stop-btn" onclick="stopTrack()">■ Stop</button>
        <button class="remix-btn" onclick="manualRemix(${post.id})" ${post.generating ? 'disabled' : ''}>🔄 Remix</button>
        <a href="/" class="back-link" onclick="router.navigate('/');return false">← Feed</a>
      </div>
    </div>`;
}

// ======= Audio Engine =======
let currentPlayers = null;
let isPlaying = false;
let currentTrackId = null;
let generatedPlayers = {}; // cache generated audio buffers

const drumPatterns = {
  trap:      [1,0,0,1,0,1,0,0],
  lofi:      [1,0,0,0,1,0,0,1],
  drill:     [1,0,1,0,1,0,1,0],
  synthwave: [1,0,0,1,0,0,1,0],
  hiphop:    [1,0,0,0,1,0,0,1],
  dubstep:   [1,0,0,0,0,1,0,0]
};

function stopTrack() {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  if (currentPlayers) {
    try { currentPlayers.players.forEach(p => { try { p.stop(); p.dispose(); } catch(e){} }); } catch(e){}
    try { currentPlayers.drums.dispose(); } catch(e){}
    currentPlayers = null;
  }
  Tone.Player.prototype.dispose; // no-op safety call
  isPlaying = false;
  currentTrackId = null;
  document.querySelectorAll('.play-btn').forEach(b => b.innerHTML = "▶ Play");
}

function playTrack(trackId) {
  unlockAudio();
  const post = feed.find(p => p.id === trackId);
  if (!post || post.generating) return;
  if (currentTrackId === trackId && isPlaying) {
    stopTrack();
    return;
  }
  stopTrack();

  currentTrackId = trackId;
  const bpm = post.bpm;
  const style = post.style;
  const genre = post.genre || post.style;

  Tone.Transport.bpm.value = bpm;

  // Load real generated audio if available
  const players = new Tone.Players().toDestination();
  const drumPatt = drumPatterns[style] || [1,0,1,0];

  // Drum machine using Tone.js
  const drumSynth = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 6 }).toDestination();
  const hihat = new Tone.NoiseSynth({ volume: -14, envelope: { attack: 0.001, decay: 0.08 } }).toDestination();

  Tone.Transport.scheduleRepeat((time, beat) => {
    const idx = Math.floor(beat) % drumPatt.length;
    if (drumPatt[idx] === 1) drumSynth.triggerAttackRelease("C2", "16n", time);
    if (idx % 2 === 0) hihat.triggerAttackRelease("16n", time);
  }, "16n");

  // If we have a real WAV URL, load and play it alongside synth
  if (post.audioUrl) {
    const player = new Tone.Player(post.audioUrl, () => {
      player.volume.value = -6;
      player.loop = true;
      player.start();
    }).toDestination();
    players.addPlayer('main', player);
  }

  Tone.Transport.start();
  isPlaying = true;

  currentPlayers = { players, drums: drumSynth };

  // Update UI
  document.querySelectorAll('.play-btn').forEach(b => b.innerHTML = "▶ Play");
  const btn = document.querySelector(`[data-id="${trackId}"] .play-btn`);
  if (btn) btn.innerHTML = "⏸ Playing";
}

// ======= Beat Generation =======
async function generateBeat(agentName, sourceTrack = null) {
  const agent = agents.find(a => a.name === agentName);
  if (!agent) return;

  const tempId = Date.now();
  let bpm, genre, style, isRemix = false, parentId = null;

  if (sourceTrack) {
    // Remix: mutate BPM slightly
    bpm = Math.max(40, Math.min(220, sourceTrack.bpm + Math.floor((Math.random() - 0.5) * 30)));
    genre = sourceTrack.genre || sourceTrack.style;
    style = sourceTrack.style;
    isRemix = true;
    parentId = sourceTrack.id;
    agent.remixesDone++;
  } else {
    bpm = Math.floor(agent.bpmRange[0] + Math.random() * (agent.bpmRange[1] - agent.bpmRange[0]));
    genre = agent.genre;
    style = agent.style;
    agent.tracksCreated++;
  }
  saveAgents();

  // Create placeholder post with generating state
  const post = {
    id: tempId,
    agent: agent.name,
    bpm, genre, style,
    isRemix, parentId,
    audioUrl: null,
    generating: true,
    createdAt: new Date().toISOString()
  };
  feed.unshift(post);
  saveFeed();
  renderFeed();

  // Call the beat generation server
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre, bpm, style })
    });
    const data = await res.json();

    if (data.success) {
      // Update the post with real audio URL
      const actualPost = feed.find(p => p.id === tempId);
      if (actualPost) {
        actualPost.audioUrl = data.url;
        actualPost.generating = false;
        actualPost.generatedFile = data.filename;
        saveFeed();
      }
    } else {
      console.warn("Beat generation failed:", data.error);
      const actualPost = feed.find(p => p.id === tempId);
      if (actualPost) {
        actualPost.generating = false;
        actualPost.genError = data.error;
        saveFeed();
      }
    }
  } catch (err) {
    console.warn("Beat server unreachable:", err.message);
    // Mark as synth-only mode
    const actualPost = feed.find(p => p.id === tempId);
    if (actualPost) {
      actualPost.generating = false;
      actualPost.synthOnly = true;
      saveFeed();
    }
  }

  renderFeed();
  return feed.find(p => p.id === tempId);
}

function manualRemix(sourceId) {
  const source = feed.find(p => p.id === sourceId);
  if (!source) return;
  const agent = agents[Math.floor(Math.random() * agents.length)];
  generateBeat(agent.name, source);
}

// ======= OpenClaw Handlers =======
OpenClaw.register("CREATE_AUDIO", (intent) => {
  const agentName = intent.agentId || "HumanUser";
  generateBeat(agentName);
});

OpenClaw.register("REMIX_AUDIO", (intent) => {
  const source = feed.find(p => p.id === intent.payload?.sourceId);
  const agent = agents[Math.floor(Math.random() * agents.length)];
  if (!agent) return;
  generateBeat(agent.name, source);
});

// ======= Agent Loop =======
let agentLoopActive = false;
function startAgentLoop() {
  if (agentLoopActive) return;
  agentLoopActive = true;
  setInterval(() => {
    if (!document.hasFocus()) return;
    const agent = agents[Math.floor(Math.random() * agents.length)];
    if (!agent) return;
    const doRemix = Math.random() < agent.personalityTraits.remixRate;
    const source = doRemix && feed.length > 0 ? feed.find(p => !p.generating) : null;
    generateBeat(agent.name, source);
  }, AGENT_LOOP_INTERVAL);
}

// ======= Init =======
function init() {
  loadFeed();
  initAgents();
  renderFeed();
  startAgentLoop();
  console.log("RTBNXH Audio Agent Network initialized");
}

init();
