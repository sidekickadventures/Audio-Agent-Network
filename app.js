// ======= Router =======
class Router {
  constructor() {
    this.routes = [];
    window.onpopstate = () => this.resolve(location.pathname);
  }

  register(path, handler) {
    this.routes.push({ path, handler });
  }

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
    router.navigate(`/audio/${intent.payload.id || Date.now()}`);
    return this.routes[intent.type]?.(intent);
  }
};

// ======= AudioContext Unlock =======
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  Tone.start().then(() => {
    audioUnlocked = true;
    console.log("AudioContext unlocked");
  }).catch(() => {});
};
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ======= Agent System =======
const agentTemplates = [
  {
    name: "TrapKing",
    style: "trap",
    bpmRange: [130, 150],
    melodyScale: ["C4", "D#4", "G4", "A#4"],
    personalityTraits: { boldness: 0.8, remixRate: 0.3, aggression: 0.9 }
  },
  {
    name: "LoFiLounge",
    style: "lofi",
    bpmRange: [60, 90],
    melodyScale: ["C3", "E3", "G3", "A3"],
    personalityTraits: { boldness: 0.3, remixRate: 0.2, aggression: 0.2 }
  },
  {
    name: "SynthWave",
    style: "synthwave",
    bpmRange: [100, 130],
    melodyScale: ["C4", "E4", "G4", "B4"],
    personalityTraits: { boldness: 0.6, remixRate: 0.4, aggression: 0.5 }
  },
  {
    name: "DrillSquad",
    style: "drill",
    bpmRange: [140, 160],
    melodyScale: ["C3", "D#3", "F3", "G#3"],
    personalityTraits: { boldness: 0.9, remixRate: 0.5, aggression: 0.8 }
  }
];

// Load agents from localStorage or initialize fresh
let agents = [];
function initAgents() {
  const stored = localStorage.getItem('aan_agents');
  if (stored) {
    agents = JSON.parse(stored);
  } else {
    agents = agentTemplates.map(a => ({
      ...a,
      tracksCreated: 0,
      remixesDone: 0
    }));
    saveAgents();
  }
}
function saveAgents() {
  localStorage.setItem('aan_agents', JSON.stringify(agents));
}

// ======= Feed =======
let feed = [];
function loadFeed() {
  const stored = localStorage.getItem('aan_feed');
  feed = stored ? JSON.parse(stored) : [];
}
function saveFeed() {
  localStorage.setItem('aan_feed', JSON.stringify(feed));
}

function renderFeed() {
  const el = document.getElementById("feed");
  if (!el) return;
  if (feed.length === 0) {
    el.innerHTML = `<div class="post empty">No tracks yet. Click "Generate Sound" or wait for agents to create.</div>`;
    return;
  }
  el.innerHTML = feed.map(p => `
    <div class="post" data-id="${p.id}">
      <div class="post-header">
        <strong>${p.agent}</strong>
        <span class="style-tag ${p.style}">${p.style}</span>
        <span class="meta">${p.bpm} BPM | ${p.key}</span>
      </div>
      <div class="post-actions">
        <button class="play-btn" onclick="playTrack(${p.id})">▶ Play</button>
        <button class="stop-btn" onclick="stopTrack()">■ Stop</button>
        <button class="remix-btn" onclick="manualRemix(${p.id})">🔄 Remix</button>
      </div>
    </div>
  `).join("");
}

function renderAudioPost(id) {
  const post = feed.find(p => p.id == id);
  if (!post) return renderFeed();
  const el = document.getElementById("feed");
  el.innerHTML = `
    <div class="post-detail">
      <h2>${post.agent} <span class="style-tag ${post.style}">${post.style}</span></h2>
      <p>${post.bpm} BPM | Key: ${post.key}</p>
      <div class="controls">
        <button class="play-btn" onclick="playTrack(${post.id})">▶ Play</button>
        <button class="stop-btn" onclick="stopTrack()">■ Stop</button>
        <button class="remix-btn" onclick="manualRemix(${post.id})">🔄 Remix</button>
        <a href="/" class="back-link">← Back to Feed</a>
      </div>
    </div>
  `;
}

// ======= Audio Engine =======
let currentSynth = null;
let currentDrum = null;
let currentMelodySeq = null;
let currentDrumSeq = null;
let isPlaying = false;
let currentTrackId = null;

const drumPatterns = {
  trap:   [1, 0, 0, 1, 0, 1, 0, 0],
  lofi:   [1, 0, 0, 0, 1, 0, 0, 1],
  drill:  [1, 0, 1, 0, 1, 0, 1, 0],
  synthwave: [1, 0, 0, 1, 0, 0, 1, 0]
};

function playTrack(trackId) {
  unlockAudio();
  stopTrack();

  const post = feed.find(p => p.id === trackId);
  if (!post) return;

  currentTrackId = trackId;
  const bpm = post.bpm;
  const scale = post.melodyScale;
  const style = post.style;
  const drums = drumPatterns[style] || [1, 0, 1, 0];

  Tone.Transport.bpm.value = bpm;

  // Melody synth
  currentSynth = new Tone.PolySynth(Tone.Synth).toDestination();
  currentSynth.volume.value = -8;

  // Drum synth
  currentDrum = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 1.4 }
  }).toDestination();
  currentDrum.volume.value = -4;

  // Hi-hat synth
  const hihat = new Tone.NoiseSynth({
    volume: -12,
    envelope: { attack: 0.001, decay: 0.1, release: 0.1 }
  }).toDestination();

  // Sequences
  currentMelodySeq = new Tone.Sequence(
    (time, note) => currentSynth.triggerAttackRelease(note, "8n", time),
    scale,
    "4n"
  );

  currentDrumSeq = new Tone.Sequence(
    (time, hit) => {
      if (hit === 1) currentDrum.triggerAttackRelease("C2", "8n", time);
      if (hit === 2) hihat.triggerAttackRelease("8n", time);
    },
    drums.map((h, i) => i % 2 === 0 ? h : h * 2),
    "4n"
  );

  currentMelodySeq.start(0);
  currentDrumSeq.start(0);
  Tone.Transport.start();
  isPlaying = true;

  // Update UI
  const postEl = document.querySelector(`[data-id="${trackId}"] .play-btn`);
  if (postEl) postEl.innerHTML = "⏸ Playing";
}

function stopTrack() {
  Tone.Transport.stop();
  Tone.Transport.cancel();

  if (currentSynth) { currentSynth.dispose(); currentSynth = null; }
  if (currentDrum) { currentDrum.dispose(); currentDrum = null; }
  if (currentMelodySeq) { currentMelodySeq.stop(); currentMelodySeq.dispose(); currentMelodySeq = null; }
  if (currentDrumSeq) { currentDrumSeq.stop(); currentDrumSeq.dispose(); currentDrumSeq = null; }

  isPlaying = false;
  currentTrackId = null;

  // Reset all play buttons
  document.querySelectorAll('.play-btn').forEach(btn => btn.innerHTML = "▶ Play");
}

// ======= Create & Remix =======
function generateTrack(agentName, sourceTrack = null) {
  const agent = agents.find(a => a.name === agentName);
  if (!agent) return;

  let bpm, melodyScale, style;

  if (sourceTrack) {
    // Remix: mutate parameters
    bpm = sourceTrack.bpm + Math.floor((Math.random() - 0.5) * 40);
    melodyScale = [...sourceTrack.melodyScale];
    // Transpose some notes
    if (Math.random() > 0.5) {
      const idx = Math.floor(Math.random() * melodyScale.length);
      const note = melodyScale[idx];
      melodyScale[idx] = transposeNote(note, Math.random() > 0.5 ? 1 : -1);
    }
    style = sourceTrack.style;
    agent.remixesDone++;
  } else {
    // Fresh generation
    bpm = Math.floor(agent.bpmRange[0] + Math.random() * (agent.bpmRange[1] - agent.bpmRange[0]));
    melodyScale = [...agent.melodyScale];
    style = agent.style;
    agent.tracksCreated++;
  }

  saveAgents();

  const post = {
    id: Date.now(),
    agent: agent.name,
    bpm,
    key: melodyScale[0],
    melodyScale,
    style,
    isRemix: !!sourceTrack,
    parentId: sourceTrack?.id || null,
    createdAt: new Date().toISOString()
  };

  feed.unshift(post);
  saveFeed();
  renderFeed();
  return post;
}

function manualRemix(sourceId) {
  const source = feed.find(p => p.id === sourceId);
  if (!source) return;
  // Pick a random agent to do the remix
  const agent = agents[Math.floor(Math.random() * agents.length)];
  generateTrack(agent.name, source);
}

function transposeNote(note, semitones) {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) return note;
  const [, pitch, octave] = match;
  let idx = notes.indexOf(pitch);
  idx += semitones;
  const newOctave = parseInt(octave) + Math.floor(idx / 12);
  idx = ((idx % 12) + 12) % 12;
  return notes[idx] + newOctave;
}

// ======= Handlers =======
OpenClaw.register("CREATE_AUDIO", (intent) => {
  const agentName = intent.agentId || "HumanUser";
  generateTrack(agentName);
});

OpenClaw.register("REMIX_AUDIO", (intent) => {
  const source = feed.find(p => p.id === intent.payload?.sourceId);
  const agentName = intent.agentId || agents[Math.floor(Math.random() * agents.length)]?.name;
  if (!agentName) return;
  generateTrack(agentName, source);
});

// ======= Agent Loop =======
let agentLoopActive = false;
function startAgentLoop(intervalMs = 30000) {
  if (agentLoopActive) return;
  agentLoopActive = true;

  setInterval(() => {
    if (!document.hasFocus()) return; // Don't run if tab not visible
    agents.forEach(agent => {
      const doRemix = Math.random() < agent.personalityTraits.remixRate;
      const action = doRemix ? "REMIX_AUDIO" : "CREATE_AUDIO";
      OpenClaw.route({
        type: action,
        agentId: agent.name,
        payload: { sourceId: feed[0]?.id || null }
      });
    });
  }, intervalMs);
}

// ======= Init =======
function init() {
  loadFeed();
  initAgents();
  renderFeed();
  startAgentLoop(30000); // One agent action every 30 seconds
  console.log("RTBNXH Audio Agent Network initialized");
}

init();
