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
    if(route) route.handler(this.extractParams(route.path,path));
  }

  extractParams(routePath, actualPath) {
    const keys = (routePath.match(/:\w+/g) || []).map(k=>k.slice(1));
    const values = actualPath.split("/").slice(1);
    const params = {};
    keys.forEach((k,i)=>params[k]=values[i]);
    return params;
  }

  navigate(path){
    history.pushState({}, "", path);
    this.resolve(path);
  }
}
const router = new Router();
router.register("/", ()=>renderFeed());
router.register("/audio/:id", ({id})=>renderAudioPost(id));

// ======= OpenClaw =======
const OpenClaw = {
  routes: {},
  register(type, handler){ this.routes[type]=handler; },
  async route(intent){
    router.navigate(`/audio/${intent.payload.id||Date.now()}`);
    return this.routes[intent.type]?.(intent);
  }
};

// ======= Agent System =======
const agents = [
  {name:"TrapKing", style:"trap", bpmRange:[130,150], melodyScale:["C4","D#4","G4","A#4"], personalityTraits:{boldness:0.8, remixRate:0.5}},
  {name:"LoFiLounge", style:"lofi", bpmRange:[60,90], melodyScale:["C3","E3","G3","A3"], personalityTraits:{boldness:0.3, remixRate:0.2}}
];

// ======= Feed =======
let feed=[];
function renderFeed(){
  const el = document.getElementById("feed");
  el.innerHTML = feed.map(p=>`
    <div class="post">
      <strong>${p.agent}</strong> | ${p.bpm} BPM | ${p.key} | ${p.style}
      <button onclick="playSequence('${p.agent}')">Play</button>
      <button onclick="remix(${p.id})">Remix</button>
    </div>`).join("");
}
function renderAudioPost(id){
  const post = feed.find(p=>p.id==id);
  if(!post) return renderFeed();
  document.getElementById("feed").innerHTML=`<h2>${post.agent} - ${post.style}</h2><button onclick="playSequence('${post.agent}')">Play</button>`;
}

// ======= Audio Sequencer =======
function playSequence(agentName){
  const agent = agents.find(a=>a.name===agentName);
  if(!agent) return;
  const synth = new Tone.Synth().toDestination();
  const drum = new Tone.MembraneSynth().toDestination();
  const seq = new Tone.Sequence(
    (time,n)=>synth.triggerAttackRelease(n,"8n",time),
    agent.melodyScale,
    "4n"
  );
  const drumSeq = new Tone.Sequence(
    (time,hit)=>{ if(hit) drum.triggerAttackRelease("C2","8n",time); },
    agent.drums||[1,0,1,0],
    "4n"
  );
  Tone.Transport.bpm.value = (agent.bpmRange[0]+agent.bpmRange[1])/2;
  seq.start(0);
  drumSeq.start(0);
  Tone.Transport.start();
}

// ======= Handlers =======
OpenClaw.register("CREATE_AUDIO",(intent)=>{
  const agent = agents.find(a=>a.name===intent.agentId)||{name:intent.agentId, style:"human", bpmRange:[100,140], melodyScale:["C4","E4","G4"]};
  const post = {id:Date.now(), agent:agent.name, bpm:(agent.bpmRange[0]+agent.bpmRange[1])/2, key:agent.melodyScale[0], style:agent.style};
  feed.unshift(post);
  renderFeed();
});

OpenClaw.register("REMIX_AUDIO",(intent)=>{
  const original = feed.find(p=>p.id===intent.payload.sourceId);
  if(!original) return;
  const remix = {...original, id:Date.now(), agent:intent.agentId};
  feed.unshift(remix);
  renderFeed();
});

// ======= Agent Loop =======
setInterval(()=>{
  agents.forEach(agent=>{
    const doRemix = Math.random()<agent.personalityTraits.remixRate;
    const action = doRemix?"REMIX_AUDIO":"CREATE_AUDIO";
    OpenClaw.route({type:action, agentId:agent.name, payload:{sourceId:feed[0]?.id}});
  });
},5000);