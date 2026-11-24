import { ProfessionalWorkbench } from './professional/workbench.mjs';
import { WindowsExecutableBuilder } from './exe-build.mjs';
import { StudioSurface } from './ide-workspace.mjs';
import {CompilerJourney} from "./core/compiler-journey.mjs";
import { STAGES } from "./core/compiler.mjs";
import { encodeBytecode, zipFiles } from "./core/binary.mjs";
import { RunWindow } from "./core/run-window.mjs";
import { WorkspaceStore, workspace as makeWorkspace } from "./core/storage.mjs";
import { vocabulary, suggestions, highlight } from "./core/suggestions.mjs";
import { normalizePath } from "./core/language.mjs";
import { FileExplorer } from "./core/explorer.mjs";
import { FileActions } from "./core/file-actions.mjs";
import { validateName, createItem } from "./core/files.mjs";
import { exampleFile } from "./core/examples.mjs";
import { LanguageExamples } from "./presentation.mjs";
import { blank2d, blank3d } from "./agent/builders.mjs";
import { loadModel, learnedNext } from "./agent/agent.mjs";
import { readAttachment, MAX_REPORT_TEXT } from "./agent/attachments.mjs";
import { VoiceInput } from "./agent/voice.mjs";
import { MadadgarPanel } from "./agent/panel.mjs";
import { initTheme } from "./core/theme.mjs";
const $ = (selector) => document.querySelector(selector),
  $$ = (selector) => [...document.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const editor = $("#editor"),
  store = await new WorkspaceStore().open();
let themeBridge = null;
const setTheme = initTheme(window, (theme) => {
  $("#theme-select").value = theme;
  themeBridge?.(theme);
});
$("#theme-select").onchange = (event) => setTheme(event.target.value);
let attachments = [],
  readingAttachments = false,
  voiceBase = "";
const voice = new VoiceInput({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  onText(final, interim) {
    $("#agent-prompt").value = [voiceBase, final]
      .filter(Boolean)
      .join(" ")
      .slice(0, 60000);
    $("#voice-status").textContent =
      interim || "Listening… press Stop voice when finished.";
  },
  onState(listening) {
    $("#agent-prompt").readOnly = listening;
    $("#agent-voice").setAttribute("aria-pressed", String(listening));
    $("#agent-voice-label").textContent = listening ? "Stop" : "Voice";
    $("#voice-language").disabled = listening;
    if (!listening)
      $("#voice-status").textContent =
        "Voice stopped. Review your text, then press Send request.";
  },
  onError(message) {
    $("#voice-status").textContent = message;
  },
});
let current,
  worker,
  lastResult = null,
  revision = 0,
  compiledRevision = -1,
  running = false,
  saveTimer,
  completionItems = [],
  completionIndex = 0,
  completionStart = 0,
  stageIndex = 0,
  model = null,
  world = null,
  writing = false,
  agentController = null,
  frameRequested = false,
  launchGeneration = 0,
  toastTimer,
  studioUI,
  windowsBuilder,
  professional;
const madadgar = new MadadgarPanel({
  store, getWorkspace: () => current, commit: commitFileChange, modal, toast,
  busy: () => !!agentController || writing || readingAttachments,
  ask: prompt => askAgent(prompt),
});
await madadgar.initialize();
let stages = STAGES.map(([name, help]) => ({
  name,
  help,
  state: "pending",
  detail: "Run your code to see this step.",
  ms: 0,
}));
const handles = new Map();
const filesUI = new FileActions({
  store, getWorkspace: () => current, commit: commitFileChange, select: setWorkspace,
  isWriting: () => writing, modal, toast, escape,
});
const explorer = new FileExplorer($("#file-tree"), $("#explorer-menu"), icon, {
  open: openActive,
  createFile: parent => filesUI.create("file", parent),
  createFolder: parent => filesUI.create("folder", parent),
  rename: (kind, path) => filesUI.rename(kind, path),
  delete: (kind, path) => filesUI.delete(kind, path),
});
const languageExamples = new LanguageExamples({
  modal, notify: toast,
  canOpen: () => { if (writing) { toast("Stop writing before opening an example."); return false; } return true; },
  onOpen: async example => {
    let path = example.id + ".jimsabz", suffix = 1;
    const exists = candidate => current.files.some(file => file.path.toLowerCase() === candidate.toLowerCase() || file.path.toLowerCase().startsWith(candidate.toLowerCase() + "/"));
    while (exists(path)) path = example.id + "-" + (++suffix) + ".jimsabz";
    const next = createItem(current, "file", path);
    next.files.find(file => file.path === path).text = example.code;
    await commitFileChange(next);
  },
  onFolder: async items => {
    clearTimeout(saveTimer); saveTimer = null;
    await store.save(current);
    const all = await store.list();
    let name = "Jimsabz presentation", suffix = 1;
    while (all.some(folder => folder.name.toLowerCase() === name.toLowerCase())) name = "Jimsabz presentation " + (++suffix);
    const entry = items.at(-1).id + ".jimsabz";
    await setWorkspace({ ...makeWorkspace(name, "folder", "", entry), files: items.map(exampleFile), active: entry, entry });
    toast("Seven editable examples opened. The marksheet asks for a name, subject count and marks.");
  },
});
const journey = new CompilerJourney($("#compiler-3d"), {
  getSource: () => {if (writing) {toast("Wait for Jimsa to finish writing before exploring the compiler.");return null;} const file = sourceFile(); if (!file) {toast("Open a .jimsabz file first."); return null;} return {entry:file.path,source:file.text};},
  onCompile: () => run("check"),
  onRun: () => run(),
  onGoTo: (at) => goTo(at),
});
const runWindow = new RunWindow(window, {
  onAction(data) {
    if (data.type === "input" && worker && runWindow.state.waiting) {
      print(String(data.value) + "\n", true);
      runWindow.send({ type: "input-accepted" });
      worker.postMessage({ type: "input", value: String(data.value) });
      journey.stage(6, {state:"running",detail:"Executing your compiled instructions."});
      runState("Running " + current.entry);
    } else if (
      data.type === "tick" &&
      worker &&
      running &&
      world &&
      !frameRequested &&
      runWindow.state.status === "Running"
    ) {
      frameRequested = true;
      worker.postMessage({ type: "tick", dt: 1 / 60, input: data.input });
    } else if (data.type === 'factory-execute') {
      if (worker && running && lastResult?.ok && runWindow.state.factory?.ready)
        worker.postMessage({ type: 'factory-execute', runId: runWindow.state.runId });
    } else if (data.type === "stop") stop();
    else if (data.type === "rerun") run("run", true,debugging);
    else if(data.type==="debug-command"&&worker)worker.postMessage(data);
    else if (data.type === "locate") {
      goTo(data.at);
      window.focus();
    } else if (data.type === "focus-editor") {
      window.focus();
      editor.focus();
    }
  },
  onClose() {
    if (running) stop();
    $("#show-run-window").disabled = true;
    runState(
      runWindow.state.diagnostic
        ? "Fix the highlighted step"
        : "Run window closed · editor ready",
      !runWindow.state.diagnostic,
    );
    if (!runWindow.state.diagnostic) status("Ready");
  },
});
themeBridge = theme => runWindow.send({ type: 'theme', theme });
const active = () => current?.files.find((f) => f.path === current.active);
const sourceFile = () =>
  active()?.path.endsWith(".jimsabz")
    ? active()
    : current?.files.find((f) => f.kind !== "folder" && f.path === current.entry && f.path.endsWith(".jimsabz"));
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4200);
}
function status(message) {
  $("#app-status").textContent = message;
}
function markSave(text, ok = true) {
  $("#save-state").innerHTML =
    `<span class="status-dot" style="background:${ok ? "#6dcaaa" : "#e5b280"}"></span>${escape(text)}`;
}
async function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await store.save(current);
    await store.setting("last", current.id);
    professional?.saved(current);
    markSave(
      store.persistent
        ? "Saved in this browser"
        : "Session only — export to save",
      store.persistent,
    );
  } catch {
    markSave("Browser save failed — export your file", false);
    toast(
      "The browser could not save this change. Use Save file or Export folder.",
    );
  }
}
function saveSoon() {
  markSave("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}
function changed() {
  const file = active();
  if (!file || typeof file.text !== "string") return;
  file.text = editor.value;
  revision++;
  if (runWindow.state.factory?.enabled && !runWindow.state.factory.editorChanged) runWindow.send({ type: 'source-edited' });
  journey.sourceChanged();
  $("#pipeline-status").textContent = lastResult
    ? "Code changed · run again"
    : "Ready for your first run";
  $("#pipeline-status").className = "compile-status";
  updateEditor();
  saveSoon();
}
function updateEditor() {
  const code = editor.value;
  $("#highlight").innerHTML = highlight(code);
  $("#line-numbers").textContent = Array.from(
    { length: code.split("\n").length },
    (_, i) => String(i + 1),
  ).join("\n");
  syncScroll();
  cursor();
  renderSuggestions();
}
function syncScroll() {
  $("#highlight").scrollTop = editor.scrollTop;
  $("#highlight").scrollLeft = editor.scrollLeft;
  $("#line-numbers").scrollTop = editor.scrollTop;
}
function cursor() {
  const before = editor.value.slice(0, editor.selectionStart),
    lines = before.split("\n");
  $("#cursor-position").textContent =
    `Ln ${lines.length}, Col ${lines.at(-1).length + 1}`;
}
function renderSuggestions() {
  const box = $("#suggestions");
  box.replaceChildren();
  for (const item of suggestions(editor.value)) {
    const button = document.createElement("button");
    button.textContent = item[2];
    button.title = item[1];
    button.onclick = () => {
      if (item[0] === "run") run();
      else insertSnippet(item[1], true);
    };
    box.append(button);
  }
}
function insertText(
  text,
  start = editor.selectionStart,
  end = editor.selectionEnd,
) {
  editor.focus();
  editor.setSelectionRange(start, end);
  if (!document.execCommand("insertText", false, text)) {
    editor.setRangeText(text, start, end, "end");
    changed();
  }
  hideCompletion();
}
function insertSnippet(text, gameAware = false) {
  if (writing) return;
  let position = editor.selectionStart;
  if (
    gameAware &&
    /^(kirdar|mujassamo|on_key|har)\b/.test(text) &&
    /khed(?:3d)?\s+"/.test(editor.value)
  ) {
    position = editor.value.lastIndexOf("}");
    text = "    " + text.replaceAll("\n", "\n    ") + "\n";
  } else {
    position = editor.value.length;
    text = (editor.value.endsWith("\n") ? "" : "\n") + text + "\n";
  }
  insertText(text, position, position);
}
function renderWorkspace() {
  window.dispatchEvent(new Event("studio-workspace-changed"));
  $("#workspace-label").textContent = current.name;
  $("#folder-name").textContent = current.name;
  $("#folder-name").title = current.name;
  $("#folder-kind").textContent =
    current.kind === "folder" ? "FOLDER" : current.kind.toUpperCase() + " GAME";
  $("#location-file").textContent = current.active;
  explorer.render(current);
  const tabs = $("#file-tabs");
  tabs.replaceChildren();
  for (const file of current.files.filter(f => f.kind !== "folder" && f.path.endsWith(".jimsabz"))) {
    const tab = document.createElement("button");
    tab.className = "file-tab" + (file.path === current.active ? " active" : "");
    tab.innerHTML = icon("file") + escape(file.path.split("/").at(-1));
    tab.title = file.path;
    tab.onclick = () => openActive(file.path);
    tabs.append(tab);
  }
  const file = active(),
    isSource = !!file?.path.endsWith(".jimsabz");
  $("#code-area").hidden = !isSource;
  $("#asset-view").hidden = isSource;
  $(".next-code").hidden = !isSource;
  $("#rename-file").disabled = !file;
  $("#save").disabled = !file;
  $("#run").disabled = !sourceFile() || writing;
  $("#editor-description").textContent =
    current.kind === "folder"
      ? "A simple program"
      : `Your ${current.kind.toUpperCase()} game`;
  if (isSource) {
    editor.value = file.text || "";
    updateEditor();
  } else if (file) {
    const box = $("#asset-view");
    box.replaceChildren();
    const p = document.createElement("p");
    p.textContent = file.path;
    box.append(p);
    if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.path)) {
      const image = document.createElement("img"),
        url = URL.createObjectURL(new Blob([file.bytes]));
      image.src = url;
      image.onload = () => URL.revokeObjectURL(url);
      box.append(image);
    } else {
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent =
        file.text ||
        `${file.bytes?.length.toLocaleString() || 0} bytes · Included when you export this folder.`;
      box.append(pre);
    }
  } else {
    $("#asset-view").textContent = "This folder has no open file. Use New file to start coding, or restore a file from Trash.";
    editor.value = "";
    updateEditor();
  }
}
async function openActive(path) {
  if (writing) return;
  hideCompletion();
  current.active = path;
  renderWorkspace();
  await persist();
}
async function setWorkspace(value) {
  if (writing) return;
  stop(false);
  current = value;
  hideCompletion();
  journey.reset();
  lastResult = null;
  compiledRevision = -1;
  revision++;
  stages = STAGES.map(([name, help]) => ({
    name,
    help,
    state: "pending",
    detail: "Run your code to see this step.",
    ms: 0,
  }));
  $("#pipeline-status").textContent = "Ready for your first run";
  $("#pipeline-status").className = "compile-status";
  $("#diagnostic").hidden = true;
  world = null;
  runState("Run opens a separate output window");
  renderWorkspace();
  renderPipeline();
  await persist();
  madadgar.changedProject();
}
function renderPipeline() {
  const node = $("#pipeline");
  node.replaceChildren();
  stages.forEach((stage, index) => {
    const button = document.createElement("button");
    button.className = "phase " + stage.state;
    button.title = stage.help;
    button.innerHTML = `<span class="phase-top"><span class="phase-index">0${index + 1}</span><span class="phase-state">${stage.state === "passed" ? icon("check") : stage.state === "failed" ? icon("x") : stage.state === "running" ? "" : index + 1}</span></span><span class="phase-name">${escape(stage.name)}</span><span class="phase-time">${stage.state === "passed" ? stage.ms?.toFixed(1) + " ms" : stage.state === "failed" ? "Needs a fix" : stage.state === "blocked" ? "Waiting" : stage.state === "running" ? "Running…" : stage.state === "ready" ? "Ready" : "Not run yet"}</span>`;
    button.setAttribute("aria-label", `${stage.name}: ${stage.state}`);
    button.onclick = () => inspect(index);
    node.append(button);
  });
}
function setEditorMaximized(maximized) {
  document.body.classList.toggle("editor-maximized", maximized);
  const button = $("#maximize-editor"),
    label = maximized ? "Restore panels" : "Maximize editor";
  button.setAttribute("aria-pressed", String(maximized));
  button.setAttribute("aria-label", label);
  button.title = label;
  button.querySelector("span").textContent = label;
  if (maximized) switchView("editor");
  requestAnimationFrame(syncScroll);
}
function switchView(next) {
  const open = next === "agent";
  if (!open) {
    voice.cancel();
    window.speechSynthesis?.cancel();
  }
  if (open && document.body.classList.contains("editor-maximized"))
    setEditorMaximized(false);
  $("#agent-panel").hidden = !open;
  $(".work-panels").classList.toggle("agent-visible", open);
  $("#toggle-agent").setAttribute("aria-expanded", String(open));
}
function print(text, echo = false) {
  runWindow.send({ type: "output", text, echo });
  studioUI?.update();
}
function runState(text, ok = true) {
  $("#run-state").innerHTML =
    `<span class="status-dot" style="background:${ok ? "#70c3a4" : "#e49caf"}"></span>${escape(text)}`;
}
function showDiagnostic(d) {
  journey.fail(d);
  setEditorMaximized(false);
  $("#compiler-panel").open = true;
  const name = STAGES[d.stage]?.[0] || "Runtime",
    box = $("#diagnostic");
  box.hidden = false;
  box.innerHTML = `<strong>${escape(name)} · ${escape(d.code)}</strong><span>${escape(d.message)}</span><button>Go to ${escape(d.at?.file || current.entry)}, line ${d.at?.line || 1} →</button>`;
  box.querySelector("button").onclick = () => goTo(d.at);
  stages[d.stage] = { ...stages[d.stage], state: "failed", detail: d.message };
  for (let i = d.stage + 1; i < 7; i++) stages[i].state = "blocked";
  $("#pipeline-status").className = "compile-status error";
  $("#pipeline-status").textContent = `Stopped at ${name.toLowerCase()}`;
  renderPipeline();
  switchView("terminal");
  runState("Fix the highlighted step", false);
  status("Compiler found an issue");
}
async function goTo(at) {
  if (!at) return;
  if (current.files.some((f) => f.path === at.file)) await openActive(at.file);
  const lines = editor.value.split("\n"),
    offset =
      lines.slice(0, at.line - 1).reduce((n, s) => n + s.length + 1, 0) +
      (at.col || 1) -
      1;
  editor.focus();
  editor.setSelectionRange(offset, Math.min(offset + 1, editor.value.length));
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
  editor.scrollTop = Math.max(0, (at.line - 4) * lineHeight);
  syncScroll();
  cursor();
  $("#modal").close();
}
function stop(announce = true) {
  launchGeneration++;
  const wasRunning = running;
  worker?.terminate();
  worker = null;
  frameRequested = false;
  running = false;
  $("#stop").disabled = true;
  $("#run").disabled = !sourceFile() || writing;
  if (
    wasRunning &&
    !["Finished", "Compilation failed", "Runtime error"].includes(
      runWindow.state.status,
    )
  )
    runWindow.send({ type: "stopped" });
  if (announce) {
    if (stages[6].state === "running")
      stages[6] = {
        ...stages[6],
        state: "ready",
        detail: "Stopped by you. Run again to restart.",
      };
    runState("Stopped · output stays in the run window");
    status("Stopped");
    if (wasRunning) journey.cancel();
    journey.stage(6, stages[6]);
    renderPipeline();
  }
}
let debugging=false;
async function run(mode = "run", reuse = false, debug=false, asTab=false) {
  debugging=debug;
  if (writing) return;
  const file = sourceFile();
  if (!file) {
    toast("Create or open a .jimsabz file first.");
    return;
  }
  stop(false);
  const generation = ++launchGeneration;
  // One immutable source snapshot drives the document, compiler, VM and report.
  const capturedFiles = structuredClone(current.files.map(({ handle, ...f }) => f));
  const capturedRevision = revision, capturedAt = Date.now();
  const capturedSource = capturedFiles.find(f => f.path === file.path)?.text || '';
  if (mode === "run") {
    // Open before awaiting storage: browsers require a direct user gesture.
    const opened = runWindow.begin(
      {
        file: file.path,
        project: current.name,
        files: capturedFiles, factory: true, debug, capturedAt, revision: capturedRevision, theme: document.documentElement.dataset.theme,
      },
      reuse, { asTab },
    );
    $("#popup-blocked").hidden = opened;
    $("#show-run-window").disabled = !opened;
    if (!opened) {
      toast("Allow pop-ups for Jimsabz, then click Run code again.");
      return;
    }
  }
  await persist();
  if (
    generation !== launchGeneration ||
    (mode === "run" && (!runWindow.popup || runWindow.popup.closed))
  )
    return;
  current.entry = file.path;
  compiledRevision = capturedRevision;
  journey.begin(capturedSource, file.path);
  lastResult = null;
  world = null;
  stages = STAGES.map(([name, help]) => ({
    name,
    help,
    state: "pending",
    detail: "Waiting for the previous step.",
    ms: 0,
  }));
  renderPipeline();
  $("#pipeline-status").textContent = "Compiling your code…";
  $("#pipeline-status").className = "compile-status";
  $("#diagnostic").hidden = true;
  runState(
    mode === "check" ? "Checking your code…" : "Compiling · see the run window",
  );
  $("#stop").disabled = false;
  running = true;
  status("Compiling " + file.path);
  const thisWorker = new Worker(new URL("./core/worker.mjs", import.meta.url), {
    type: "module",
  });
  worker = thisWorker;
  const emit = (data) => {
    if (mode === "run") {
      runWindow.send(data);
      if (!["frame", "sound", "output"].includes(data.type)) studioUI?.update();
    }
  };
  thisWorker.onmessage = ({ data }) => {
    if (worker !== thisWorker) return;
    switch (data.type) {
      case "debug-paused":
        emit(data);runState("Paused at "+data.at.file+":"+data.at.line);status("Debug paused");break;
      case "debug-resumed":
        emit(data);runState("Debugging "+file.path);status("Debugging");break;
      case "stage":
        emit(data);
        stages[data.index] = { ...stages[data.index], ...data.stage };
        journey.stage(data.index, data.stage);
        renderPipeline();
        if (data.stage.state === "running")
          emit({ type: "phase", name: STAGES[data.index][0] });
        break;
      case "compiled":
        lastResult = data.result;
        emit({ type: "compiled", result: data.result, atTime: data.atTime });
        stages = lastResult.stages;
        journey.finish(lastResult, stages);
        renderPipeline();
        if (!lastResult.ok) {
          emit({ type: "fault", diagnostic: lastResult.diagnostics[0] });
          showDiagnostic(lastResult.diagnostics[0]);
          stop(false);
        } else {
          $("#pipeline-status").textContent = "All compiler checks passed";
          $("#pipeline-status").className = "compile-status success";
          if (mode === "check") {
            runState("Compiler checks passed");
            status("Ready to export");
            stop(false);
          } else {
            emit({ type: "status", status: "Ready to execute" });
            runState("Compiler factory · ready for execution handoff");
            status("Factory journey ready");
          }
        }
        break;
      case 'factory-start':
      case 'warning':
        emit(data); break;
      case 'execution-ready':
        emit(data); runState('Compiler factory · finish the journey or choose Run now'); status('Waiting for factory handoff'); break;
      case 'execution-started':
        emit(data); runState('Running ' + file.path + ' · separate factory window'); status('Running ' + file.path); break;
      case "output":
        journey.appendOutput(data.text);
        print(data.text);
        break;
      case "input-request":
        journey.waiting();
        emit({ type: "input-request" });
        runState("Waiting for input in the run window");
        status("Waiting for input");
        break;
      case "finished":
        running = false;
        $("#stop").disabled = true;
        emit({ type: "finished", ms: data.ms, atTime: data.atTime });
        runState("Finished · " + file.path);
        status("Finished successfully");
        break;
      case "frame":
        world = data.world;
        frameRequested = false;
        emit({ type: "frame", world });
        break;
      case "game-started":
        emit({ type: "game-started" });
        status("Game running in its own window");
        $("#pipeline-status").textContent = "Compiled · game running";
        break;
      case "fault":
        if (lastResult) lastResult.diagnostics = [data.diagnostic];
        emit({ type: "fault", diagnostic: data.diagnostic, ms: data.ms, atTime: data.atTime });
        showDiagnostic(data.diagnostic);
        stop(false);
        break;
      case "file": {
        let file = current.files.find((f) => f.path === data.file.path);
        if (file) Object.assign(file, data.file);
        else current.files.push(data.file);
        saveSoon();
        renderWorkspace();
        break;
      }
      case "sound":
        emit({ type: "sound", command: data.command });
        break;
    }
  };
  thisWorker.onerror = (event) => {
    if (worker !== thisWorker) return;
    const diagnostic = {
      code: "RUN-LOAD",
      stage: 6,
      at: { file: file.path, line: 1, col: 1 },
      message:
        event.message ||
        "The compiler could not start. Reload the editor and try again.",
    };
    emit({ type: "fault", diagnostic });
    showDiagnostic(diagnostic);
    stop(false);
  };
  thisWorker.postMessage({
    type: mode, debug, factory: mode === "run", runId: runWindow.state.runId,
    files: capturedFiles,
    entry: file.path,
  });
}
function modal(title, html, eyebrow = "JIMSABZ STUDIO") {
  $("#modal-title").textContent = title;
  $("#modal-eyebrow").textContent = eyebrow;
  $("#modal-body").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}
function validName(name) {
  return validateName(name);
}
function newWorkspace(gameOnly = false) {
  if (writing) return toast("Stop writing before changing folders.");
  let kind = gameOnly ? "2d" : "folder";
  const options = [
    [
      "folder",
      "folder",
      "Program folder",
      "A regular folder and a .jimsabz file. Simple input and output.",
    ],
    [
      "2d",
      "layers",
      "2D game",
      "A blank canvas, with only the code needed to start.",
    ],
    [
      "3d",
      "cube",
      "3D game",
      "An empty scene with a camera and light. Yours to build.",
    ],
  ].filter((x) => !gameOnly || x[0] !== "folder");
  modal(
    gameOnly ? "What would you like to build?" : "Start something new",
    `<p>${gameOnly ? "Choose your canvas. Add your own characters, assets and game rules." : "For a small program, choose a regular folder. Choose 2D or 3D when you want to build a game."}</p><div class="creation-options">${options.map(([id, ico, title, help]) => `<button class="creation-option ${id === kind ? "selected" : ""}" data-kind="${id}">${icon(ico)}<strong>${title}</strong><span>${help}</span></button>`).join("")}</div><form id="create-form"><label for="create-name">${kind === "folder" ? "Folder name" : "Project folder name"}</label><input id="create-name" value="${gameOnly ? "my-game" : "farhan"}" maxlength="60" required autocomplete="off"><p id="create-path">${gameOnly ? "my-game/main.jimsabz" : "farhan/farhan.jimsabz"}</p><div class="modal-actions"><button type="button" class="button secondary" id="create-cancel">Cancel</button><button class="button primary" type="submit">Create ${gameOnly ? "project" : "folder"} ${icon("arrow")}</button></div></form>`,
  );
  const updatePath = () => {
    const name = $("#create-name").value || "untitled";
    $("#create-path").textContent =
      `${name}/${kind === "folder" ? name : "main"}.jimsabz`;
  };
  $$("[data-kind]").forEach(
    (button) =>
      (button.onclick = () => {
        kind = button.dataset.kind;
        $$("[data-kind]").forEach((b) =>
          b.classList.toggle("selected", b === button),
        );
        $("#create-form label").textContent =
          kind === "folder" ? "Folder name" : "Project folder name";
        $("#create-form button[type=submit]").innerHTML =
          "Create " +
          (kind === "folder" ? "folder" : "project") +
          icon("arrow");
        updatePath();
      }),
  );
  $("#create-name").oninput = updatePath;
  $("#create-cancel").onclick = () => $("#modal").close();
  $("#create-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const name = validName($("#create-name").value),
        code =
          kind === "2d"
            ? blank2d(name)
            : kind === "3d"
              ? blank3d(name)
              : '// Your first Jimsabz program\nbudhai = "Farhan"\n';
      await setWorkspace(
        makeWorkspace(
          name,
          kind,
          code,
          kind === "folder" ? name + ".jimsabz" : "main.jimsabz",
        ),
      );
      $("#modal").close();
      switchView(kind === "folder" ? "terminal" : "game");
      editor.focus();
      toast(
        kind === "folder"
          ? `Created ${name}/${name}.jimsabz`
          : `Created a blank ${kind.toUpperCase()} project. Add your code and run it.`,
      );
    } catch (error) {
      toast(error.message);
    }
  };
  $("#create-name").focus();
  $("#create-name").select();
}
async function home() {
  if (writing) return toast("Stop writing before changing folders.");
  await persist();
  const all = await store.list();
  modal(
    "Pick up where you left off",
    `<p>Every workspace is a folder. Your programs and games stay organized in separate files.</p><div class="workspace-list">${all.map((w) => `<button class="workspace-card" data-workspace="${escape(w.id)}">${icon(w.kind === "folder" ? "folder" : w.kind === "3d" ? "cube" : "game")}<span><strong>${escape(w.name)}</strong><small>${w.kind === "folder" ? "Program folder" : w.kind.toUpperCase() + " game"} · ${w.files.length} ${w.files.length === 1 ? "file" : "files"}</small></span>${icon("arrow")}</button>`).join("")}</div><div class="modal-actions"><button id="home-create" class="button primary">${icon("plus")}Create a new folder / project</button></div>`,
    "YOUR WORKSPACES",
  );
  $$("[data-workspace]").forEach(
    (b) =>
      (b.onclick = async () => {
        const w = all.find((w) => w.id === b.dataset.workspace);
        await setWorkspace(w);
        $("#modal").close();
      }),
  );
  $("#home-create").onclick = () => newWorkspace();
}
function askFilename(rename = false) {
  if (rename) filesUI.rename("file", active()?.path);
  else filesUI.create("file");
}
async function commitFileChange(next) {
  const wasReadOnly = editor.readOnly;
  editor.readOnly = true;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await professional?.vault.record(current, "Before file change").catch(() => {});
    await store.save(next);
    const old = current;
    for (const file of old.files)
      if (!next.files.some(f => f.path === file.path) || next.deletedAt)
        handles.delete(old.id + "/" + file.path);
    if (next.deletedAt) {
      const all = await store.list();
      next = all[0] || { ...makeWorkspace("untitled", "folder", ""), files: [], active: "", entry: "" };
    }
    await setWorkspace(next);
    markSave(store.persistent ? "Saved in this browser" : "Session only — export to save", store.persistent);
    status("Files updated");
  } finally { editor.readOnly = wasReadOnly; }
}
function download(data, name, type = "application/octet-stream") {
  const blob = new Blob([data], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function saveFile() {
  const file = active();
  if (!file) return;
  await persist();
  if (typeof showSaveFilePicker === "function") {
    try {
      const key = current.id + "/" + file.path,
        handle =
          handles.get(key) ||
          (await showSaveFilePicker({
            suggestedName: file.path.split("/").at(-1),
            types: file.path.endsWith(".jimsabz")
              ? [
                  {
                    description: "Jimsabz source",
                    accept: { "text/plain": [".jimsabz"] },
                  },
                ]
              : undefined,
          }));
      const stream = await handle.createWritable();
      await stream.write(file.bytes || file.text || "");
      await stream.close();
      handles.set(key, handle);
      markSave("Saved to your file");
      toast("Saved " + file.path);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
      if (error.name !== "SecurityError" && error.name !== "NotAllowedError") {
        toast("Could not write to that location. Downloading a copy.");
      }
    }
  }
  download(
    file.bytes || file.text || "",
    file.path.split("/").at(-1),
    "text/plain;charset=utf-8",
  );
  toast("Downloaded " + file.path);
}
async function checkForExport() {
  if (lastResult?.ok && compiledRevision === revision) return lastResult;
  await run("check");
  return await new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = setInterval(() => {
      if (lastResult) {
        clearInterval(poll);
        lastResult.ok
          ? resolve(lastResult)
          : reject(new Error("Fix the compiler error before exporting."));
      } else if (Date.now() - start > 20000) {
        clearInterval(poll);
        reject(
          new Error(
            "Compilation took too long. Check your code and try again.",
          ),
        );
      }
    }, 30);
  });
}
async function exportFile(kind) {
  if (writing)
    return toast("Let Jimsa finish, or stop writing before exporting.");
  $("#export-menu").hidden = true;
  $("#export").setAttribute("aria-expanded", "false");
  if (kind === "exe") { windowsBuilder.open(); return; }
  try {
    if (kind === "source") {
      const file = active();
      if (!file) throw new Error("Open a file first.");
      await persist();
      download(
        file.bytes || file.text || "",
        file.path.split("/").at(-1),
        "text/plain;charset=utf-8",
      );
      toast("Exported " + file.path);
      return;
    }
    if (kind === "folder") {
      await persist();
      download(
        zipFiles(current.name, current.files),
        current.name + ".zip",
        "application/zip",
      );
      toast("Exported the whole folder, including source and assets.");
      return;
    }
    const result = await checkForExport(),
      stem = current.entry
        .split("/")
        .at(-1)
        .replace(/\.jimsabz$/i, "");
    if (kind === "bytecode") {
      download(encodeBytecode(result.program), stem + ".jbc");
      toast("Exported " + stem + ".jbc. Run it with the Jimsabz runtime.");
    }
  } catch (error) {
    toast(error.message);
  }
}
async function fileData(file, path) {
  if (file.size > 32 * 1024 * 1024)
    throw new Error(`${file.name} is too large (32 MiB per file).`);
  const text = /\.(jimsabz|txt|json|obj|md|csv)$/i.test(path);
  return {
    path,
    kind: /\.jimsabz$/i.test(path) ? "source" : text ? "text" : "binary",
    ...(text
      ? { text: await file.text() }
      : { bytes: new Uint8Array(await file.arrayBuffer()) }),
  };
}
async function importFiles(files, folder = false) {
  if (writing) return toast("Stop writing before opening files.");
  if (!files.length) return;
  try {
    let mapped = [],
      name = "opened-folder";
    if (folder) {
      const first = files[0].webkitRelativePath;
      name = first?.split("/")[0] || "opened-folder";
      for (const file of files) {
        if (file.name.startsWith(".")) continue;
        const path = normalizePath(
          file.webkitRelativePath.split("/").slice(1).join("/"),
        );
        mapped.push(await fileData(file, path));
      }
      if (!mapped.some((f) => f.path.endsWith(".jimsabz")))
        mapped.push({ path: "main.jimsabz", text: "", kind: "source" });
      const entry =
        mapped.find((f) => f.path === "main.jimsabz") ||
        mapped.find((f) => f.path.endsWith(".jimsabz"));
      await setWorkspace({
        ...makeWorkspace(name),
        files: mapped,
        active: entry.path,
        entry: entry.path,
      });
    } else {
      for (const file of files) {
        const item = await fileData(file, file.name);
        let path = item.path,
          index = 2;
        while (current.files.some((f) => f.path === path))
          path = item.path.replace(
            /(\.[^.]+)?$/,
            (_all, ext = "") => `-${index++}${ext}`,
          );
        item.path = path;
        current.files.push(item);
        current.active = path;
      }
      renderWorkspace();
      revision++;
      await persist();
    }
    toast(folder ? "Opened " + name : "File added to " + current.name);
  } catch (error) {
    toast(error.message);
  }
}
async function openFolder() {
  if (writing) return toast("Stop writing before opening a folder.");
  if (typeof showDirectoryPicker === "function")
    try {
      const handle = await showDirectoryPicker({ mode: "readwrite" }),
        files = [],
        selectedHandles = new Map();
      async function scan(dir, prefix = "") {
        for await (const [name, h] of dir.entries()) {
          if (name.startsWith(".")) continue;
          const path = prefix + name;
          if (h.kind === "directory") await scan(h, path + "/");
          else {
            const file = await h.getFile();
            files.push(await fileData(file, path));
            selectedHandles.set(path, h);
          }
        }
      }
      await scan(handle);
      if (!files.some((f) => f.path.endsWith(".jimsabz")))
        files.push({ path: "main.jimsabz", text: "", kind: "source" });
      const entry =
        files.find((f) => f.path === "main.jimsabz") ||
        files.find((f) => f.path.endsWith(".jimsabz"));
      await setWorkspace({
        ...makeWorkspace(handle.name),
        files,
        entry: entry.path,
        active: entry.path,
      });
      for (const [path, h] of selectedHandles)
        handles.set(current.id + "/" + path, h);
      toast(
        "Opened " + handle.name + ". Use Save file to write changes to disk.",
      );
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  $("#folder-picker").click();
}
function guide() {
  modal(
    "A language that feels closer",
    `<p>Use a new line after each statement. A regular program needs only a .jimsabz file.</p><div class="guide-grid"><div class="guide-card"><h3>Show output</h3><code>budhai = "Farhan"\nbudhai "Hello"</code><p>Both print a simple line in the separate run window.</p></div><div class="guide-card"><h3>Take input</h3><code>lafz naam = budh("Your name: ")\nbudhai naam</code><p>Run opens a console window. Type your answer there. budh(...) reads input. budhai prints output.</p></div><div class="guide-card"><h3>Add two numbers</h3><code>adad pheru = budh("Pheru adad: ")\nadad biyo = budh("Biyo adad: ")\nbudhai pheru + biyo</code><button id="guide-sum" class="text-button">Write this in a new file →</button></div><div class="guide-card"><h3>If / else</h3><code>jey (pheru > 50) {\n    budhai "Pass"\n} na_ta {\n    budhai "Try again"\n}</code><p>jey means if, na_ta jey means else-if, and na_ta means else. Ask Jimsa for Marks &amp; grades for a complete example.</p></div><div class="guide-card"><h3>Roman Sindhi numbers</h3><code>adad tadaad = adad_satt\nbudhai sindhi_lafz(tadaad)\nbudhai sindhi_adad("hazar")</code><p>Number words cover 0–1000. Use loops and qatar arrays for any requested input count. Ordinary numeric values keep the full adad range.</p><a href="assets/Sindhi-Numbers-0-1000.csv" download>Download number words</a></div><div class="guide-card"><h3>Reusable functions</h3><code>kam jor(adad a, adad b) -> adad {\n    wapas a + b\n}\nbudhai jor(3, 4)</code><p>Parameters and return values are typed. Functions can receive arrays and objects and call themselves.</p></div><div class="guide-card"><h3>Classes and objects</h3><code>qism Talib {\n    adad nishan = 0\n    kam paas() -> isharo {\n        wapas paan.nishan >= 50\n    }\n}\nTalib pheru = naon Talib(86)\nbudhai pheru.paas()</code><p>Use qism for a class, naon to create an object, and paan inside a method for the current object. Trailing fields with defaults can be omitted.</p></div><div class="guide-card"><h3>Arrays and loops</h3><code>qatar adad ang = [10, 20, 30]\ngin (adad i = 0; i &lt; ang.lambai; i++) {\n    budhai ang[i]\n}</code><p>Arrays grow with .joryo(value). Use gin for counter/foreach loops, wori for while, rok to stop and agty to continue.</p></div><div class="guide-card"><h3>Arithmetic</h3><code>adad kul = 2 + 3 * 4\nkul += 6\nbudhai kul\nbudhai 7.0 / 2</code><p>Use + − * / %, compound assignment and ++/--. Integer division truncates; decimals preserve the fraction. Overflow and division by zero report runtime errors.</p></div><div class="guide-card"><h3>Save and take it with you</h3><p><strong>.jimsabz</strong> is editable source. Open it in Jimsabz anywhere.<br><strong>.zip</strong> includes the whole folder and your assets.<br><strong>.jbc</strong> runs with the Jimsabz runtime.<br><strong>.exe</strong> runs directly on Windows x64.</p></div><div class="guide-card"><h3>Build your own game</h3><p>New project → choose 2D or 3D → add your code → Run. A starter contains only an empty canvas or scene.</p><code>kirdar Player {\n    jagah: (100, 100)\n    rang: violet\n    raftar: 5.0\n    qabu: arrows\n}</code></div><div class="guide-card"><h3>Understand the compiler</h3><p>Lexical analysis reads tokens. Syntax analysis checks grammar. The AST organizes the code. Semantic analysis checks names and types. Code generation builds instructions. Assets are checked, then your program runs. Select 3D compiler to explore an animated view of the actual phase results.</p></div></div>`,
    "QUICK LANGUAGE GUIDE",
  );
  $("#guide-sum").onclick = () => {
    $("#modal").close();
    askAgent("Add two numbers from user input");
  };
}

function inspect(index = stageIndex) {
  stageIndex = index;
  const stage = stages[index];
  let text = "Run your code to inspect this step.";
  if (lastResult) {
    if (index === 0)
      text = lastResult.tokens
        .slice(0, 2000)
        .map(
          (t) =>
            `${String(t.at.line).padStart(3)}:${String(t.at.col).padEnd(3)} ${t.kind.padEnd(8)} ${JSON.stringify(t.text)}`,
        )
        .join("\n");
    if (index === 1)
      text =
        stage.state === "passed"
          ? "The parser accepted your program. Brackets, expressions and statements match the Jimsabz grammar.\n\n" +
            (lastResult.astText || "")
          : stage.detail;
    if (index === 2) text = lastResult.astText || stage.detail;
    if (index === 3)
      text = lastResult.analysis
        ? Object.entries(lastResult.analysis.globals)
            .map(
              ([name, s]) =>
                `${name.padEnd(20)} ${s.type}${s.fixed ? " (read only)" : ""}`,
            )
            .join("\n") +
          "\n\nImported libraries: " +
          (lastResult.analysis.libraries.join(", ") || "none")
        : stage.detail;
    if (index === 4) text = lastResult.bytecodeText || stage.detail;
    if (index === 5)
      text = lastResult.program
        ? "Files required by this program:\n" +
          (lastResult.program.assets.join("\n") || "No external assets.")
        : stage.detail;
    if (index === 6)
      text =
        stage.detail +
        "\n\nEntry file: " +
        current.entry +
        "\nExecution: actual stack VM in a dedicated worker.\nRun and check use your current source; exported bytecode uses the JBC2 format.";
  }
  modal(
    stage.name,
    `<div class="inspect-tabs">${STAGES.map(([name], i) => `<button data-inspect="${i}" class="${i === index ? "active" : ""}">${i + 1}. ${escape(name.replace(" analysis", "").replace(" generation", ""))}</button>`).join("")}</div><div class="inspect-summary">${escape(stage.help)}<br>${escape(stage.detail || "Run your code to see this step.")}</div><pre class="inspect-pre">${escape(text)}</pre>`,
    "INSIDE YOUR COMPILER",
  );
  $$("[data-inspect]").forEach(
    (b) => (b.onclick = () => inspect(Number(b.dataset.inspect))),
  );
}
async function aboutAgent() {
  modal("Jimsabz Code Madadgar", `<p>Your local Jimsabz language assistant is built into Studio and ready when you open it.</p><div class="guide-card"><h3>Language and code</h3><p>The included trained intent classifier, language references and parameterized generators support input/output, sums, simple percentage calculators, marksheets, runtime input counts, arrays, functions, classes, local login workflows and supported 2D/3D starters. Common request spelling and polite phrasing are normalized; generated source is visible in the response with Copy code. Local login is a temporary console demo with visible passphrases, not production authentication. The local compiler checks generated drafts. Supplied Jimsabz code can also be checked, run and tested.</p><h3>Project tools</h3><p>Ask “Check my code”, “Explain this code”, “Fix my code”, “Analyze my project”, or search Knowledge. Automatic repairs cover required imports, unmatched closing blocks and the old input spelling. Review changes before Apply; Undo restores the last agent edit while files still match.</p><h3>Local scope</h3><p>This is a small trained classifier with language-specific generators and compiler tools, rather than an arbitrary-code language model. It does not silently train on conversations. Unsupported requests receive an explanation. Training source and examples are included.</p><h3>History, notes and voice</h3><p>Local conversation history and project notes stay with each browser workspace. Save or export your files to keep a disk copy. Optional voice input uses your browser’s speech service.</p></div>`, "LOCAL JIMSABZ AGENT");
}

function agentMessage(text, user = false) {
  const row = document.createElement("div");
  row.className = user ? "agent-chat-row agent-chat-row-user" : "agent-chat-row";
  const avatar = document.createElement("span");
  avatar.className = "agent-chat-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = user ? "You" : "J";
  const node = document.createElement("div");
  node.className = user ? "user-message" : "agent-message";
  node.textContent = text;
  row.append(avatar, node);
  $("#agent-messages").append(row);
  $("#agent-messages").scrollTop = $("#agent-messages").scrollHeight;
  return node;
}
function readReply(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance)
    return toast("Reading aloud is unavailable in this browser.");
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = $("#voice-language").value;
  window.speechSynthesis.speak(speech);
}
function addReadReply(node, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "read-reply";
  button.textContent = "Read reply aloud";
  button.onclick = () => readReply(text);
  node.append(button);
}
function addAgentSuggestions(node, result) {
  if (result.followUps?.length) {
    const box = document.createElement("div");
    box.className = "agent-followups";
    for (const prompt of result.followUps) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = prompt;
      button.onclick = () => askAgent(prompt);
      box.append(button);
    }
    node.append(box);
  }
  for (const link of result.links || []) {
    const a = document.createElement("a");
    a.className = "agent-resource-link";
    a.textContent = link.label;
    a.href = link.url;
    a.download = "";
    node.append(a);
  }
}
function renderAttachments() {
  const box = $("#agent-attachments");
  box.replaceChildren();
  attachments.forEach((file, index) => {
    const chip = document.createElement("div"),
      label = document.createElement("span"),
      remove = document.createElement("button");
    chip.className = "attachment-chip";
    label.textContent =
      file.name + " · " + file.text.length.toLocaleString() + " characters";
    label.title = file.name;
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + file.name);
    remove.onclick = () => {
      if (agentController || readingAttachments) return;
      attachments.splice(index, 1);
      renderAttachments();
    };
    chip.append(label, remove);
    box.append(chip);
  });
  const sendLabel = attachments.length
    ? "Build from report"
    : "Send request";
  $("#agent-send .agent-send-label").textContent = sendLabel;
  $("#agent-send").setAttribute("aria-label", sendLabel);
  $("#agent-send").title = sendLabel;
}
async function attachReports(files) {
  if (agentController || readingAttachments) return;
  readingAttachments = true;
  $("#agent-send").disabled = true;
  $("#agent-attach").disabled = true;
  const errors = [];
  try {
    for (const file of files) {
      if (attachments.length >= 3) {
        errors.push("Attach up to three files at a time.");
        break;
      }
      $("#agent-attachment-status").textContent = "Reading " + file.name + "…";
      try {
        const report = await readAttachment(file);
        if (
          attachments.reduce((sum, f) => sum + f.text.length, 0) +
            report.text.length >
          MAX_REPORT_TEXT
        )
          throw new Error(
            "The combined report text is too long. Attach the relevant requirements section.",
          );
        attachments.push(report);
        renderAttachments();
      } catch (error) {
        errors.push(file.name + ": " + error.message);
      }
    }
    $("#agent-attachment-status").textContent = errors.length
      ? errors.join("\n")
      : "Reports ready. Add optional instructions, then select Build from report. Files are read locally.";
  } finally {
    readingAttachments = false;
    $("#agent-send").disabled = false;
    $("#agent-attach").disabled = false;
    $("#agent-file-input").value = "";
  }
}
async function askAgent(prompt) {
  if (
    (!prompt.trim() && !attachments.length) ||
    writing ||
    readingAttachments ||
    $("#agent-send").disabled
  )
    return;
  if (!prompt.trim())
    prompt = "Start a Jimsabz project from the attached report.";
  voice.cancel();
  $("#voice-status").textContent = "";
  const attached = attachments.map((file) => ({ ...file }));
  switchView("agent");
  $("#agent-prompt").value = "";
  agentMessage(
    prompt +
      (attached.length
        ? "\nAttached: " + attached.map((f) => f.name).join(", ")
        : ""),
    true,
  );
  const progress = agentMessage("Reading your request…");
  const controller = new AbortController();
  const requestedWorkspace = current;
  agentController = controller;
  $("#agent-send").disabled = true;
  $("#agent-prompt").disabled = true;
  $("#agent-writing").hidden = false;
  $("#agent-writing-label").textContent = "Code Madadgar is working locally…";
  $("#agent-cancel").disabled = false;
  $("#agent-messages").setAttribute("aria-busy", "true");
  $$("[data-prompt]").forEach((b) => (b.disabled = true));
  try {
    const result = await madadgar.run(prompt, {
      signal: controller.signal, attachments: attached,
    });
    controller.signal.throwIfAborted();
    if (current !== requestedWorkspace)
      throw new Error(
        "You changed folders. Ask again in the folder where you want the code.",
      );
    progress.textContent = result.message;
    addReadReply(progress, result.message);
    addAgentSuggestions(progress, result);
    madadgar.present(result, progress);
    attachments = [];
    renderAttachments();
    $("#agent-attachment-status").textContent = "";

  } catch (error) {
    progress.textContent = controller.signal.aborted
      ? "Stopped. No new code was written."
      : error.message;
  } finally {
    agentController = null;
    $("#agent-writing").hidden = true;
    $("#agent-send").disabled = false;
    $("#agent-prompt").disabled = false;
    $("#agent-messages").removeAttribute("aria-busy");
    $$("[data-prompt]").forEach((b) => (b.disabled = false));
    const conversation = $("#agent-messages"), row = progress.closest(".agent-chat-row");
    conversation.scrollTop += row.getBoundingClientRect().top - conversation.getBoundingClientRect().top - 8;
  }
}
function hideCompletion() {
  $("#completion").hidden = true;
  completionItems = [];
}
function showCompletion(force = false) {
  const before = editor.value.slice(0, editor.selectionStart),
    prefix = before.match(/[\p{L}_][\p{L}\p{N}_]*$/u)?.[0] || "";
  if (!force && prefix.length < 2) {
    hideCompletion();
    return;
  }
  completionStart = editor.selectionStart - prefix.length;
  const known = new Set();
  completionItems = vocabulary
    .filter(([word]) => word.startsWith(prefix) && word !== prefix)
    .slice(0, 7)
    .map(([word, text, help]) => ({ word, text, help }));
  const vars = [
    ...editor.value.matchAll(
      /\b(?:adad|dec|lafz|isharo)\s+([\p{L}_][\p{L}\p{N}_]*)/gu,
    ),
  ].map((m) => m[1]);
  for (const name of vars)
    if (name.startsWith(prefix) && name !== prefix && !known.has(name)) {
      completionItems.unshift({
        word: name,
        text: name,
        help: "Your variable",
      });
      known.add(name);
    }
  if (force && !prefix && model)
    for (const item of learnedNext(model, before)
      .filter((x) => /^\p{L}/u.test(x.text))
      .slice(0, 2))
      completionItems.push({
        word: item.text,
        text: item.text,
        help: "Learned from Jimsabz",
      });
  const smart = professional?.completion() || [];
  if (smart.length) {
    const names = new Set();
    completionItems = [...smart.map(([word, text, help]) => ({ word, text, help })), ...completionItems]
      .filter(item => { if (names.has(item.word)) return false; names.add(item.word); return true; });
  }
  completionItems = completionItems.slice(0, 8);
  completionIndex = 0;
  if (!completionItems.length) {
    hideCompletion();
    return;
  }
  const box = $("#completion");
  box.replaceChildren();
  completionItems.forEach((item, index) => {
    const b = document.createElement("button");
    b.innerHTML = `${escape(item.word)}<span>${escape(item.help)}</span>`;
    b.setAttribute("role", "option");
    b.onmousedown = (e) => {
      e.preventDefault();
      acceptCompletion(index);
    };
    box.append(b);
  });
  const line = before.split("\n").length - 1,
    lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
  box.style.top =
    Math.min(
      Math.max(8, (line + 1) * lineHeight - editor.scrollTop + 10),
      Math.max(8, $("#code-area").clientHeight - 200),
    ) + "px";
  box.hidden = false;
  renderCompletion();
}
function renderCompletion() {
  $$("#completion button").forEach((b, i) => {
    b.classList.toggle("selected", i === completionIndex);
    b.setAttribute("aria-selected", String(i === completionIndex));
  });
}
function acceptCompletion(index = completionIndex) {
  const item = completionItems[index];
  if (item) insertText(item.text, completionStart, editor.selectionStart);
}
$("#maximize-editor").onclick = () =>
  setEditorMaximized(!document.body.classList.contains("editor-maximized"));
$("#run").onclick = () => run();
$("#stop").onclick = () => stop();
$("#save").onclick = saveFile;
$("#export").onclick = () => {
  const menu = $("#export-menu");
  menu.hidden = !menu.hidden;
  $("#export").setAttribute("aria-expanded", String(!menu.hidden));
};
$$("[data-export]").forEach(
  (b) => (b.onclick = () => exportFile(b.dataset.export)),
);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".dropdown")) {
    $("#export-menu").hidden = true;
    $("#export").setAttribute("aria-expanded", "false");
  }
});
$("#new-workspace").onclick = () => newWorkspace();
$("#new-game").onclick = () => newWorkspace(true);
$("#home").onclick = home;
$("#switch-folder").onclick = home;
$("#new-file").onclick = () => askFilename();
$("#new-subfolder").onclick = () => filesUI.create("folder");
$("#open-trash").onclick = () => filesUI.showTrash();
$("#folder-actions").onclick = event => explorer.toggleMenu("workspace", "", event.currentTarget);
$(".folder-heading").oncontextmenu = event => {
  event.preventDefault();
  explorer.showMenu("workspace", "", $("#folder-actions"), { x: event.clientX, y: event.clientY });
};
$("#rename-file").onclick = () => askFilename(true);
$("#guide").onclick = guide;
$("#language-examples").onclick = () => languageExamples.show();
$("#open-folder").onclick = openFolder;
$("#open-file").onclick = () => $("#file-picker").click();
$("#file-picker").onchange = (event) => {
  importFiles([...event.target.files]);
  event.target.value = "";
};
$("#folder-picker").onchange = (event) => {
  importFiles([...event.target.files], true);
  event.target.value = "";
};
$("#modal-close").onclick = () => $("#modal").close();
$("#modal").addEventListener("click", (event) => {
  if (event.target === $("#modal")) {
    const r = $("#modal").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $("#modal").close();
  }
});
$("#toggle-agent").onclick = () => {
  switchView($("#agent-panel").hidden ? "agent" : "editor");
  if (!$("#agent-panel").hidden) $("#agent-prompt").focus();
};
$("#close-agent").onclick = () => switchView("editor");
$("#agent-attach").onclick = () => {
  if (!agentController) $("#agent-file-input").click();
};
$("#agent-file-input").onchange = (event) =>
  attachReports([...event.target.files]);
$("#read-greeting").onclick = () =>
  readReply(
    "Assalam-o-Alaikum from Jimsa! I am your Jimsabz Agent. Tell me what you want to make.",
  );
$("#agent-voice").onclick = () => {
  if (agentController || readingAttachments) return;
  if (voice.recognition) return voice.stop();
  voiceBase = $("#agent-prompt").value.trim();
  voice.start($("#voice-language").value);
};
$("#agent-cancel").onclick = () => {
  agentController?.abort();
  $("#agent-cancel").disabled = true;
};
$("#show-run-window").onclick = () => runWindow.focus();
$("#agent-about").onclick = aboutAgent;
$("#agent-form").onsubmit = (e) => {
  e.preventDefault();
  askAgent($("#agent-prompt").value);
};
$$("[data-prompt]").forEach(
  (b) => (b.onclick = () => askAgent(b.dataset.prompt)),
);
$("#agent-prompt").onkeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    askAgent(e.target.value);
  }
};
$("#inspect").onclick = () => inspect();
$("#visualize-compiler").onclick = () => journey.open();
$("#visualize-compiler-bottom").onclick = () => journey.open();
editor.addEventListener("input", () => {
  changed();
  showCompletion();
});
editor.addEventListener("scroll", () => {
  syncScroll();
  hideCompletion();
});
editor.addEventListener("click", () => {
  cursor();
  hideCompletion();
});
editor.addEventListener("keyup", cursor);
editor.addEventListener("blur", () => setTimeout(hideCompletion, 100));
editor.addEventListener("keydown", (event) => {
  if (writing && ["Tab", "Enter"].includes(event.key)) {
    event.preventDefault();
    return;
  }
  if (completionItems.length) {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      completionIndex =
        (completionIndex +
          (event.key === "ArrowDown" ? 1 : -1) +
          completionItems.length) %
        completionItems.length;
      renderCompletion();
      return;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      acceptCompletion();
      return;
    }
    if (event.key === "Escape") {
      hideCompletion();
      return;
    }
  }
  if (event.key === "Tab") {
    event.preventDefault();
    insertText("    ");
  }
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const before = editor.value.slice(0, editor.selectionStart),
      indent = before.split("\n").at(-1).match(/^\s*/)[0],
      extra = before.trimEnd().endsWith("{") ? "    " : "";
    insertText("\n" + indent + extra);
  }
});
document.addEventListener("keydown", (event) => {
  if ($("#modal").open && (event.ctrlKey || event.metaKey) && ["s", "enter"].includes(event.key.toLowerCase())) { event.preventDefault(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveFile();
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter" &&
    document.activeElement !== $("#agent-prompt")
  ) {
    event.preventDefault();
    run();
  }
  if (
    event.ctrlKey &&
    event.code === "Space" &&
    document.activeElement === editor
  ) {
    event.preventDefault();
    showCompletion(true);
  }
  if (event.key === "Escape") hideCompletion();
});
window.addEventListener("beforeunload", () => {
  voice.cancel();
  window.speechSynthesis?.cancel();
  // An unchanged second editor tab must not overwrite a newer saved workspace.
  if (current && saveTimer) store.save(current).catch(() => {});
  stop(false);
  runWindow.send({ type: "editor-closed" });
  runWindow.dispose();
});
const all = await store.list(),
  last = await store.setting("last");
await setWorkspace(
  all.find((w) => w.id === last) ||
    all[0] ||
    makeWorkspace(
      "farhan",
      "folder",
      '// Your first Jimsabz program\n// Press Run code to follow its compiler journey.\n\nbudhai = "Farhan"\n',
    ),
);
if (!store.persistent) {
  $("#storage-note").textContent = "Session mode · export your work";
  toast(
    "Browser storage is unavailable. Save or export your files before closing.",
  );
}
loadModel()
  .then((m) => (model = m))
  .catch(() => {});
if (!(await store.setting("jimsa-welcome-seen").catch(() => false))) {
  switchView("agent");
  await store.setting("jimsa-welcome-seen", true).catch(() => {});
}
if (new URLSearchParams(location.search).has("desktop")) {
  document.querySelector('.desktop-download').hidden = true;
  fetch("/__startup")
    .then((r) => (r.ok ? r.json() : null))
    .then(async (data) => {
      if (data?.text && data?.name) {
        const imported = makeWorkspace(
          data.name.replace(/\.jimsabz$/i, ""),
          "folder",
          data.text,
          data.name,
        );
        await setWorkspace(imported);
      }
      $("#version-label").textContent = "Jimsabz Studio 0.19.0 · Desktop";
    })
    .catch(() => {});
  const beat = () => fetch("/__heartbeat").catch(() => {});
  beat();
  setInterval(beat, 15000);
}

document.querySelector("#debug-run").onclick=()=>run("run",false,true);

$("#v3-examples").onclick=async()=>{
 const response=await fetch(new URL('./core/v3-examples.json',import.meta.url));if(!response.ok){toast('Examples could not be loaded.');return;}const examples=await response.json();
 modal('Language v3 preview',`<p>Try inheritance, interfaces, generics, closures, advanced parameters, collections and async tasks. Each example opens as a new source file. Use Debug to pause and inspect it.</p><div class="v3-example-list">${examples.map((e,i)=>`<button class="button" data-v3-example="${i}">${escape(e.title)}</button>`).join('')}</div><p><a href="core/v3-guide.html" target="_blank" rel="noopener">Read syntax, library contracts and current limits</a></p>`);
 for(const b of document.querySelectorAll('[data-v3-example]'))b.onclick=async()=>{if(writing)return;const ex=examples[Number(b.dataset.v3Example)];let path=ex.path.split('/').at(-1),suffix=1;while(current.files.some(f=>f.path===path))path=ex.path.split('/').at(-1).replace('.jimsabz','-'+suffix+++'.jimsabz');current.files.push({path,text:ex.code,kind:'file'});revision++;$("#modal").close();await openActive(path);editor.focus();toast('Example opened. Expected output: '+ex.expected.trim().split('\n').join(' · '));};
};

// Presentation adapter: reads existing compiler/run state; execution stays in the original worker and Run window.
studioUI = new StudioSurface({
  snapshot: () => ({ stages, result: lastResult, revision, compiledRevision, running, writing,
    project: current, code: editor.value, run: runWindow.state, popup: !!runWindow.popup && !runWindow.popup.closed }),
  build: () => run("check"),
  openAgent: () => switchView("agent"),
  tools: () => { switchView("agent"); madadgar.setToolsOpen(true); madadgar.selectTab("tools"); },
  locate: at => goTo(at),
  modal, toast,
});
studioUI.initialize();
switchView("agent");

windowsBuilder = new WindowsExecutableBuilder({
  snapshot: () => ({ entry: sourceFile()?.path || '', files: structuredClone(current?.files || []) }),
  compile: checkForExport, modal, toast, status,
});
$("#download-exe").onclick = () => windowsBuilder.open();

professional = new ProfessionalWorkbench({
  getWorkspace: () => current, store, commit: commitFileChange, select: setWorkspace,
  busy: () => writing || !!agentController,
  locate: at => goTo(at), toast, refreshCompletion: () => showCompletion(),
  backup: () => exportFile("folder"), exe: () => windowsBuilder.open(),
});
await professional.initialize();

$("#open-factory-tab").onclick = () => run("run", false, debugging, true);
