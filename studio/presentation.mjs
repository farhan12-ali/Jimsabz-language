import { examples } from "./core/examples.mjs";

const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export class LanguageExamples {
  constructor({ modal, onOpen, onFolder, notify, canOpen }) {
    Object.assign(this, { modal, onOpen, onFolder, notify, canOpen });
    this.dialog = document.querySelector("#modal");
    this.results = new Map();
    this.dialog.addEventListener("close", () => {
      this.stopChecks(false);
      this.dialog.classList.remove("examples-modal");
    });
  }
  show() {
    if (!this.canOpen()) return;
    const cards = [examples.at(-1), ...examples.slice(0, -1)];
    this.modal("Explore your language", `<p>Open editable examples for variables, conditions, loops, functions, arrays and objects. The complete marksheet combines all six.</p><div class="examples-toolbar"><button class="button primary" id="open-demo-folder">Open demo folder</button><button class="button secondary" id="check-examples">Check all examples</button><button class="button secondary" id="stop-example-checks" hidden>Stop checks</button></div><p class="example-check-status" id="example-check-status" role="status">Checks compile and run these examples with their sample inputs.</p><div class="example-grid">${cards.map(example => `<article class="example-card ${example.id === '07_marksheet' ? 'example-featured' : ''}" data-example-card="${example.id}"><div class="example-title"><h3>${esc(example.title)}</h3><span class="example-state" data-example-state="${example.id}">Not checked</span></div><p>${esc(example.description)}</p><div class="example-tags">${example.features.map(feature => `<span>${esc(feature)}</span>`).join("")}</div><p class="example-inputs"><strong>Sample input:</strong> ${example.inputs.length ? esc(example.inputs.join(", ")) : "None needed"}</p><details><summary>Expected output</summary><pre>${esc(example.result || example.expected)}</pre></details><p class="example-error" role="alert" data-example-error="${example.id}"></p><button class="button secondary" data-open-example="${example.id}" aria-label="Open ${esc(example.title)}">Open example</button></article>`).join("")}</div><p class="examples-note">The checks cover these seven programs. Run your own edited code to check its behavior. Each example opens in a new file.</p><div class="modal-actions"><button class="button secondary" id="close-examples">Close</button></div>`, "JIMSABZ LANGUAGE EXAMPLES");
    this.dialog.classList.add("examples-modal");
    this.results.clear();
    document.querySelector("#check-examples").onclick = () => this.startChecks();
    document.querySelector("#stop-example-checks").onclick = () => this.stopChecks();
    document.querySelector("#close-examples").onclick = () => this.dialog.close();
    document.querySelector("#open-demo-folder").onclick = () => this.open(async () => this.onFolder(examples));
    document.querySelectorAll("[data-open-example]").forEach(button => {
      button.onclick = () => this.open(async () => {
        const example = examples.find(item => item.id === button.dataset.openExample);
        await this.onOpen(example);
        this.notify(example.inputs.length ? "Press Run. Sample inputs: " + example.inputs.join(", ") : "Example opened. Press Run to see its output.");
      });
    });
    document.querySelector("#open-demo-folder").focus();
  }
  async open(action) {
    if (this.opening) return;
    this.opening = true;
    this.stopChecks(false);
    try { await action(); this.dialog.close(); }
    catch (error) { document.querySelector("#example-check-status").textContent = error.message; }
    finally { this.opening = false; }
  }
  stopChecks(announce = true) {
    const wasRunning = !!this.worker;
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timeout);
    const start = document.querySelector("#check-examples"), stop = document.querySelector("#stop-example-checks");
    if (start) start.disabled = false;
    if (stop) stop.hidden = true;
    if (announce && wasRunning) {
      document.querySelectorAll('[data-example-state][data-state="running"]').forEach(node => {
        node.textContent = "Stopped"; node.dataset.state = "pending";
      });
      document.querySelector("#example-check-status").textContent = `Stopped. ${this.results.size} of ${examples.length} examples completed.`;
    }
  }
  startChecks() {
    if (this.worker) return;
    this.results.clear();
    document.querySelectorAll("[data-example-state]").forEach(node => { node.textContent = "Waiting"; node.dataset.state = "pending"; });
    document.querySelectorAll("[data-example-error]").forEach(node => node.textContent = "");
    document.querySelector("#check-examples").disabled = true;
    document.querySelector("#stop-example-checks").hidden = false;
    document.querySelector("#example-check-status").textContent = "Compiling and running the actual source with sample inputs…";
    let worker;
    try { worker = new Worker(new URL("./core/example-check.worker.mjs", import.meta.url), { type: "module" }); }
    catch (error) { this.stopChecks(false); document.querySelector("#example-check-status").textContent = "Could not start checks: " + error.message; return; }
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== this.worker || !this.dialog.open) return;
      if (data.type === "checking") {
        const node = document.querySelector(`[data-example-state="${data.id}"]`);
        if (node) { node.textContent = "Checking…"; node.dataset.state = "running"; }
      } else if (data.type === "result") {
        const result = data.result;
        this.results.set(result.id, result);
        const node = document.querySelector(`[data-example-state="${result.id}"]`);
        if (node) { node.textContent = result.ok ? "Passed" : "Needs a fix"; node.dataset.state = result.ok ? "passed" : "failed"; }
        const error = document.querySelector(`[data-example-error="${result.id}"]`);
        if (error) error.textContent = result.ok ? "" : result.message;
      } else if (data.type === "complete") {
        // Count the received results, so incomplete/stale messages cannot claim success.
        const passed = [...this.results.values()].filter(result => result.ok).length;
        const complete = this.results.size === examples.length;
        this.stopChecks(false);
        document.querySelector("#example-check-status").textContent = complete
          ? `${passed}/${examples.length} examples passed compilation and output checks.`
          : `Only ${this.results.size}/${examples.length} check results arrived. Run the checks again.`;
      }
    };
    worker.onerror = event => {
      if (worker !== this.worker) return;
      this.stopChecks(false);
      document.querySelector("#example-check-status").textContent = "The example checks stopped: " + (event.message || "worker unavailable");
    };
    this.timeout = setTimeout(() => {
      if (worker !== this.worker) return;
      this.stopChecks();
      document.querySelector("#example-check-status").textContent = "Checks exceeded 20 seconds and stopped. Open the example and inspect it individually.";
    }, 20000);
    worker.postMessage({ type: "start" });
  }
}
