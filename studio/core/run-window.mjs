import { initialFactory, recordFactoryMessage } from '../factory/model.mjs';
export const RUN_CHANNEL = "jimsabz-run-window-v1";
export function initialRun(meta = {}) {
  return {
    runId: meta.runId || "",
    file: meta.file || "",
    project: meta.project || "",
    files: meta.files || [],
    theme: meta.theme === "light" ? "light" : "dark",
    output: "",
    status: "Compiling",
    phase: "Preparing compiler",
    waiting: false,
    diagnostic: null,
    world: null,
    game: false, debugSnapshot:null,
    factory: initialFactory(meta),
  };
}
export function updateRun(state, message) {
  recordFactoryMessage(state, message);
  if (message.type === "theme") state.theme = message.theme === "light" ? "light" : "dark";
  if (message.type === "execution-ready") state.status = "Ready to execute";
  if (message.type === "execution-started") state.status = "Running";
  if(message.type==="debug-paused"){state.status="Paused";state.debugSnapshot=message;}
  else if(message.type==="debug-resumed"){state.status="Running";state.debugSnapshot=null;}
  else if (message.type === "output") {
    state.output += message.text;
    if (state.output.length > 250000)
      state.output = "[Earlier output trimmed]\n" + state.output.slice(-180000);
  } else if (message.type === "phase") state.phase = message.name;
  else if (message.type === "status") {
    state.status = message.status;
    if (message.status !== "Waiting for input") state.waiting = false;
  } else if (message.type === "input-request") {
    state.waiting = true;
    state.status = "Waiting for input";
  } else if (message.type === "input-accepted") {
    state.waiting = false;
    state.status = "Running";
  } else if (message.type === "frame") {
    state.world = message.world;
    state.game = true;
  } else if (message.type === "game-started") {
    state.game = true;
    state.status = "Running";
  } else if (message.type === "fault") {
    state.diagnostic = message.diagnostic;
    state.waiting = false;
    state.status =
      message.diagnostic.stage === 6 ? "Runtime error" : "Compilation failed";
  } else if (message.type === "finished") {
    state.debugSnapshot=null;state.status = "Finished";
    state.waiting = false;
  } else if (message.type === "stopped") {
    state.debugSnapshot=null;state.status = "Stopped";
    state.waiting = false;
  } else if (message.type === "editor-closed") {
    state.status = "Editor closed";
    state.waiting = false;
  }
  return state;
}
// A fresh session per Run prevents messages from an old console affecting a new run.
// Open is deliberately synchronous so a click/keyboard shortcut can open the window.
export class RunWindow {
  constructor(host, { onAction = () => {}, onClose = () => {} } = {}) {
    this.host = host;
    this.onAction = onAction;
    this.onClose = onClose;
    this.popup = null;
    this.ready = false;
    this.session = "";
    this.state = initialRun();
    this.name = "jimsabz-run-" + host.crypto.randomUUID();
    this.receive = (event) => {
      const data = event.data;
      if (
        event.origin !== host.location.origin ||
        event.source !== this.popup ||
        data?.channel !== RUN_CHANNEL ||
        data.session !== this.session
      )
        return;
      if (data.type === "ready") {
        this.ready = true;
        this.post({ type: "restore", state: this.state });
      } else if (data.runId !== this.state.runId) return;
      else if (data.type === "closing") {
        this.ready = false;
        this.onAction({ type: "stop" });
      } else if (
        ["input", "tick", "stop", "rerun", "locate", "focus-editor", "debug-command", "factory-execute"].includes(
          data.type,
        )
      )
        this.onAction(data);
    };
    host.addEventListener("message", this.receive);
    this.monitor = host.setInterval(() => {
      if (this.popup?.closed) this.closed();
    }, 600);
  }
  begin(meta, reuse = false, { asTab = false } = {}) {
    this.state = initialRun({ ...meta, runId: this.host.crypto.randomUUID() });
    if (reuse && this.ready && this.popup && !this.popup.closed) {
      this.post({ type: "restore", state: this.state });
      this.popup.focus();
      return true;
    }
    this.session = this.host.crypto.randomUUID();
    this.ready = false;
    const url = new URL("../run.html", import.meta.url);
    url.searchParams.set("session", this.session);
    this.popup = this.host.open(
      url.href,
      asTab ? "_blank" : this.name,
      asTab ? undefined : "popup=yes,width=1360,height=900,resizable=yes,scrollbars=yes",
    );
    if (!this.popup) return false;
    this.popup.focus();
    return true;
  }
  post(message) {
    if (this.popup && !this.popup.closed)
      this.popup.postMessage(
        {
          channel: RUN_CHANNEL,
          session: this.session,
          runId: this.state.runId,
          ...message,
        },
        this.host.location.origin,
      );
  }
  send(message) {
    updateRun(this.state, message);
    if (this.ready) this.post(message);
  }
  focus() {
    if (!this.popup || this.popup.closed) return false;
    this.popup.focus();
    return true;
  }
  closed() {
    if (!this.popup) return;
    this.popup = null;
    this.ready = false;
    this.onClose();
  }
  dispose() {
    this.host.clearInterval(this.monitor);
    this.host.removeEventListener("message", this.receive);
  }
}
