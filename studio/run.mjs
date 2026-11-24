import { Renderer } from "./core/render.mjs";
import { RUN_CHANNEL, initialRun, updateRun } from "./core/run-window.mjs";
import { initTheme } from "./core/theme.mjs";
import { FactoryWindow } from "./factory/window.mjs";
initTheme(window);
const $ = (selector) => document.querySelector(selector),
  session = new URLSearchParams(location.search).get("session");
const parent = window.opener,
  renderer = new Renderer($("#game-canvas"));
let state = initialRun(),
  runId = "",
  view = "console",
  tickPending = false,
  connected = false,
  keys = new Set(),
  pressed = new Set(),
  mouse = [0, 0],
  epoch = 0;
function send(type, data = {}) {
  if (parent && !parent.closed)
    parent.postMessage(
      { channel: RUN_CHANNEL, session, runId, type, ...data },
      location.origin,
    );
}
const factory = new FactoryWindow({ root: $("#factory-root"), runtime: $("#factory-runtime"), getState: () => state, send });
function show(next) {
  factory.show('results');
  view = next;
  $("#console-view").hidden = view !== "console";
  $("#game-view").hidden = view !== "game";
  for (const name of ["console", "game"]) {
    $("#" + name + "-tab").classList.toggle("active", view === name);
    $("#" + name + "-tab").setAttribute("aria-pressed", String(view === name));
  }
}
function append(text, echo = false) {
  $("#empty").hidden = true;
  const span = document.createElement("span");
  span.textContent = text;
  if (echo) span.className = "input-echo";
  $("#output").append(span);
  if ($("#output").textContent.length > 250000)
    $("#output").textContent =
      "[Earlier output trimmed]\n" + $("#output").textContent.slice(-180000);
  $("#output").scrollTop = $("#output").scrollHeight;
}
function reflect() {
  $("#run-status").textContent = state.status;
  $("#status-dot").style.background = ["Finished"].includes(state.status)
    ? "#78d1ae"
    : ["Compilation failed", "Runtime error"].includes(state.status)
      ? "#f195af"
      : ["Stopped", "Editor closed"].includes(state.status)
        ? "#9d94a8"
        : "#b091ee";
  $("#compile-phase").textContent =
    state.status === "Compiling" ? "· " + state.phase : "";
  $("#stop").disabled = !["Compiling", "Ready to execute", "Running", "Paused", "Waiting for input"].includes(
    state.status,
  );
  $("#rerun").disabled = !connected || state.status === "Compiling";
  $("#input-form").hidden = !state.waiting;
  $("#game-tab").hidden = !state.game;
  $("#connection-state").textContent = connected
    ? "Jimsabz Studio"
    : "Editor disconnected";
  $("#back-editor").disabled = !connected;
  $("#process-message").textContent =
    {
      Finished:
        "Process finished successfully. This window stays open so you can read the output.",
      Stopped: "Process stopped. Your code is still open in the editor.",
      "Editor closed":
        "The editor was closed. Reopen Studio to run your code again.",
      "Waiting for input": "Type your answer above and press Enter.",
      "Compilation failed": "Fix the error in the editor, then run again.",
      "Runtime error":
        "The program stopped with an error. Your output stays here.",
    }[state.status] || "Your editor stays open while this program runs.";
  factory.update(state);
  if (!state.output) {
    $("#empty").hidden = false;
    $("#empty").textContent =
      state.status === "Compiling"
        ? "Compiling your program…"
        : state.status === "Finished"
          ? "Program finished without printing any output."
          : state.status === "Running"
            ? "Your program is running…"
            : "";
  }
}
function diagnostic(d) {
  $("#diagnostic").hidden = !d;
  if (!d) return;
  $("#error-title").textContent =
    (d.stage === 6 ? "Runtime error" : "Compilation failed") + " · " + d.code;
  $("#error-message").textContent =
    d.message + ` (${d.at?.file || state.file}:${d.at?.line || 1})`;
  $("#console-view").hidden = false;
  $("#game-view").hidden = true;
  if (d.stage === 6) factory.show('problems');
}
async function restore(next) {
  const version = ++epoch;
  stopAudio();
  state = next;
  runId = state.runId;
  keys.clear();
  pressed.clear();
  tickPending = false;
  connected = true;
  if (state.theme) document.documentElement.dataset.theme = state.theme;
  document.title = state.file + " — Compiler Factory";
  $("#filename").textContent = state.file;
  $("#project-name").textContent = state.project + " · Compiler Factory";
  $("#output").replaceChildren();
  if (state.output) append(state.output);
  $("#program-input").value = "";
  diagnostic(state.diagnostic);
  show(state.game && !state.waiting && !state.diagnostic ? "game" : "console");
  factory.restore(state);
  if (state.factory?.execution?.startedAt) factory.show('results');
  reflect();
  $("#debug-panel").hidden=!state.debugSnapshot;
  if(state.debugSnapshot)debugPaused(state.debugSnapshot);
  await renderer.assets(state.files);
  if (version !== epoch) return;
  if (state.world) renderer.draw(state.world);
  if (state.waiting) $("#program-input").focus();
  else if (state.game) $("#game-canvas").focus();
}
window.addEventListener("message", (event) => {
  const data = event.data;
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    data?.channel !== RUN_CHANNEL ||
    data.session !== session
  )
    return;
  if (data.type === "restore") {
    restore(data.state).catch(() => {
      state.status = "Runtime error";
      $("#empty").textContent =
        "The game assets could not be loaded. Return to the editor and run again.";
      reflect();
    });
    return;
  }
  if (data.runId !== runId) return;
  if(data.type==='theme'){updateRun(state,data);document.documentElement.dataset.theme=state.theme;factory.update(state,true);return;}
  if(data.type==="debug-paused"){updateRun(state,data);debugPaused(data);return;}
  if(data.type==="debug-resumed"){state.status="Running";$("#debug-location").textContent="Debugger running…";for(const b of document.querySelectorAll(".debug-toolbar button"))b.disabled=true;reflect();return;}
  updateRun(state, data);
  if (data.type === "output") append(data.text, data.echo);
  else if (data.type === "input-request") {
    show("console");
    $("#program-input").value = "";
    $("#input-form").hidden = false;
    $("#program-input").focus();
  } else if (data.type === "frame") {
    tickPending = false;
    renderer.draw(data.world);
    $("#game-title").textContent =
      data.world.title +
      (data.world.paused ? " · Paused" : data.world.over ? " · Finished" : "");
  } else if (data.type === "game-started") {
    show("game");
    $("#game-canvas").focus();
  } else if (data.type === "fault") diagnostic(data.diagnostic);
  else if (data.type === "sound") sound(data.command);
  else if (
    data.type === "stopped" ||
    data.type === "finished" ||
    data.type === "editor-closed"
  ) {
    tickPending = false;
    stopAudio();
    if(!$("#debug-panel").hidden)$("#debug-location").textContent=data.type==="finished"?"Debug session finished · last paused frame":"Debug session stopped";
    if (data.type === "editor-closed") connected = false;
    if (data.type === 'finished') factory.show('results');
  }
  reflect();
});
function animate() {
  requestAnimationFrame(animate);
  if (
    !connected ||
    !state.game ||
    state.status !== "Running" ||
    state.waiting ||
    tickPending
  )
    return;
  tickPending = true;
  send("tick", { input: { keys: [...new Set([...keys, ...pressed])], mouse } });
  pressed.clear();
}
requestAnimationFrame(animate);
$("#input-form").onsubmit = (event) => {
  event.preventDefault();
  if (!state.waiting) return;
  const value = $("#program-input").value;
  state.waiting = false;
  $("#input-form").hidden = true;
  send("input", { value });
};
$("#stop").onclick = () => send("stop");
$("#rerun").onclick = () => send("rerun");
$("#back-editor").onclick = () => {
  send("focus-editor");
  parent?.focus();
};
$("#close").onclick = () => {
  send("stop");
  window.close();
};
$("#clear").onclick = () => {
  $("#output").replaceChildren();
  state.output = "";
  reflect();
};
$("#locate").onclick = () => {
  send("locate", { at: state.diagnostic?.at });
  parent?.focus();
};
$("#console-tab").onclick = () => show("console");
$("#game-tab").onclick = () => {
  show("game");
  $("#game-canvas").focus();
};
const keyName = (event) =>
  ({
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    " ": "SPACE",
    Escape: "ESC",
  })[event.key] || event.key.toUpperCase();
$("#game-canvas").onkeydown = (e) => {
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Escape"].includes(
      e.key,
    )
  )
    e.preventDefault();
  keys.add(keyName(e));
  pressed.add(keyName(e));
};
window.addEventListener("keyup", (e) => keys.delete(keyName(e)));
window.addEventListener("blur", () => {
  keys.clear();
  pressed.clear();
});
$("#game-canvas").onpointerdown = (e) => {
  e.target.focus();
  const key = e.button === 2 ? "MOUSE_RIGHT" : "MOUSE_LEFT";
  keys.add(key);
  pressed.add(key);
};
window.addEventListener("pointerup", () => {
  keys.delete("MOUSE_LEFT");
  keys.delete("MOUSE_RIGHT");
});
$("#game-canvas").oncontextmenu = (e) => e.preventDefault();
$("#game-canvas").onpointermove = (e) => {
  const r = e.target.getBoundingClientRect(),
    aspect = e.target.width / e.target.height,
    w = Math.min(r.width, r.height * aspect),
    h = w / aspect;
  mouse = [
    ((e.clientX - r.left - (r.width - w) / 2) * e.target.width) / w,
    ((e.clientY - r.top - (r.height - h) / 2) * e.target.height) / h,
  ];
};
window.addEventListener("beforeunload", () => send("closing"));
setInterval(() => {
  if (!parent || parent.closed) {
    connected = false;
    if (state.status !== 'Editor closed') updateRun(state,{type:'editor-closed'});
    stopAudio();
    reflect();
  }
}, 800);
let audioContext,
  volume = 0.5,
  audios = [];
function stopAudio() {
  for (const { audio, url } of audios) {
    audio.pause();
    URL.revokeObjectURL(url);
  }
  audios = [];
}
function sound(command) {
  if (command.mute) {
    stopAudio();
    return;
  }
  if (command.volume !== undefined) {
    volume = command.volume / 100;
    audios.forEach(({ audio }) => (audio.volume = volume));
    return;
  }
  const file = state.files.find((f) => f.path === command.name);
  if (file?.bytes) {
    const url = URL.createObjectURL(new Blob([file.bytes])),
      audio = new Audio(url);
    audio.loop = !!command.loop;
    audio.volume = volume;
    audio.onended = () => URL.revokeObjectURL(url);
    audios.push({ audio, url });
    audio.play().catch(() => {});
  } else
    try {
      audioContext ??= new AudioContext();
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.frequency.value = /crash|hurt/i.test(command.name) ? 100 : 660;
      gain.gain.setValueAtTime(volume * 0.15, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.18,
      );
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {}
}
if (parent && session) send("ready");
else {
  connected = false;
  state.status = "Editor closed";
  reflect();
  $("#empty").textContent =
    "Open this window by pressing Run code in the Jimsabz editor.";
  factory.show('results');
}

let debugSnapshot=null;
function debugPaused(data){debugSnapshot=data;state.status="Paused";$("#debug-panel").hidden=false;$("#debug-location").textContent=data.at.file+":"+data.at.line;$("#debug-stack").replaceChildren();for(const[depth,frame]of [...data.frames].reverse().entries()){const b=document.createElement('button');b.textContent=debugFunction(frame.function)+" · "+(frame.at?.line||1);b.onclick=()=>debugLocals(frame);$("#debug-stack").append(b);if(depth===0)debugLocals(frame);}for(const b of document.querySelectorAll('.debug-toolbar button'))b.disabled=false;show('console');factory.show('debug');reflect();}
function debugLocals(frame){$("#debug-locals").replaceChildren();for(const[name,value]of Object.entries(frame.locals)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;$("#debug-locals").append(dt,dd);}}
for(const action of ['continue','into','over','out'])$("#debug-"+action).onclick=()=>send('debug-command',{action});
$("#debug-source").onclick=()=>{if(debugSnapshot){send('locate',{at:debugSnapshot.at});parent?.focus();}};
$("#breakpoint-form").onsubmit=e=>{e.preventDefault();const lines=$("#breakpoint-lines").value.split(',').map(s=>s.trim()).filter(Boolean);if(lines.some(s=>!/^.+\.jimsabz:[1-9]\d*$/.test(s))){$("#breakpoint-status").textContent='Use file.jimsabz:line';return;}send('debug-command',{action:'breakpoints',breakpoints:lines});$("#breakpoint-status").textContent=lines.length+' breakpoint(s) set';};
window.addEventListener('keydown',e=>{const action=({F5:'continue',F10:'over',F11:'into'})[e.key];if(action&&state.status==='Paused'){e.preventDefault();send('debug-command',{action});}});

function debugFunction(name){if(name.startsWith('$lambda:'))return 'Anonymous function';if(name.startsWith('$local:'))return name.split(':').at(-1);if(name.startsWith('$fields:'))return 'Initialize '+name.slice(8)+' fields';if(name.startsWith('$ctor:'))return 'Create '+name.split(':')[1];return name.split('$')[0];}
