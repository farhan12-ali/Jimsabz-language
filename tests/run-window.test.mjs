import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RunWindow,
  RUN_CHANNEL,
  initialRun,
  updateRun,
} from "../studio/core/run-window.mjs";
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log("PASS " + name);
};
function setup(blocked = false) {
  const events = {},
    posts = [],
    calls = [],
    actions = [],
    closed = [];
  const popup = {
    closed: false,
    focus() {},
    postMessage(data, origin) {
      posts.push({ data: structuredClone(data), origin });
    },
  };
  const host = {
    crypto: { randomUUID },
    location: { origin: "https://studio.example" },
    open(...args) {
      calls.push(args);
      return blocked ? null : popup;
    },
    addEventListener(type, fn) {
      events[type] = fn;
    },
    removeEventListener() {},
    setInterval(fn) {
      this.poll = fn;
      return 1;
    },
    clearInterval() {},
  };
  const runner = new RunWindow(host, {
    onAction: (d) => actions.push(d),
    onClose: () => closed.push(true),
  });
  const receive = (type, extra = {}) =>
    events.message({
      origin: host.location.origin,
      source: popup,
      data: {
        channel: RUN_CHANNEL,
        session: runner.session,
        runId: runner.state.runId,
        type,
        ...extra,
      },
    });
  return {
    runner,
    host,
    popup,
    posts,
    calls,
    actions,
    closed,
    receive,
    events,
  };
}
test("Run opens a popup synchronously with the requested size", () => {
  const x = setup();
  assert.ok(x.runner.begin({ file: "farhan.jimsabz" }));
  assert.equal(x.calls.length, 1);
  assert.match(x.calls[0][0], /run\.html\?session=/);
  assert.match(x.calls[0][2], /popup=yes/);
  x.runner.dispose();
});
test("blocked popup is reported before execution starts", () => {
  const x = setup(true);
  assert.equal(x.runner.begin({ file: "test.jimsabz" }), false);
  assert.equal(x.runner.popup, null);
  x.runner.dispose();
});
test("output and pending input survive a late console handshake", () => {
  const x = setup();
  x.runner.begin({ file: "test.jimsabz" });
  x.runner.send({ type: "output", text: "Name: " });
  x.runner.send({ type: "input-request" });
  assert.equal(x.posts.length, 0);
  x.receive("ready");
  assert.equal(x.posts[0].data.state.output, "Name: ");
  assert.equal(x.posts[0].data.state.waiting, true);
  x.runner.dispose();
});
test("other origins, windows and sessions cannot control the program", () => {
  const x = setup();
  x.runner.begin({});
  const data = {
    channel: RUN_CHANNEL,
    session: x.runner.session,
    runId: x.runner.state.runId,
    type: "stop",
  };
  for (const event of [
    { origin: "https://other.example", source: x.popup, data },
    { origin: x.host.location.origin, source: {}, data },
    {
      origin: x.host.location.origin,
      source: x.popup,
      data: { ...data, session: "old" },
    },
  ])
    x.events.message(event);
  assert.equal(x.actions.length, 0);
  x.runner.dispose();
});
test("rerun reuses its window and resets output with a new run id", () => {
  const x = setup();
  x.runner.begin({ file: "a.jimsabz" });
  x.receive("ready");
  const oldId = x.runner.state.runId;
  x.runner.send({ type: "output", text: "old" });
  assert.ok(x.runner.begin({ file: "b.jimsabz" }, true));
  assert.equal(x.calls.length, 1);
  assert.equal(x.runner.state.output, "");
  assert.notEqual(x.runner.state.runId, oldId);
  x.receive("input", { runId: oldId, value: "stale" });
  assert.equal(x.actions.length, 0);
  x.receive("input", { value: "fresh" });
  assert.equal(x.actions[0].value, "fresh");
  x.runner.dispose();
});
test("closing the output window reports one cancellation", () => {
  const x = setup();
  x.runner.begin({});
  x.popup.closed = true;
  x.host.poll();
  x.host.poll();
  assert.equal(x.closed.length, 1);
  assert.equal(x.runner.focus(), false);
  x.runner.dispose();
});
test("finished execution keeps its result readable and ends input", () => {
  const state = initialRun();
  updateRun(state, { type: "output", text: "20\n" });
  updateRun(state, { type: "input-request" });
  updateRun(state, { type: "finished" });
  assert.equal(state.output, "20\n");
  assert.equal(state.status, "Finished");
  assert.equal(state.waiting, false);
});
test("errors retain source locations and output buffers are bounded", () => {
  const state = initialRun();
  updateRun(state, { type: "output", text: "a".repeat(300000) });
  assert.ok(state.output.length < 250000);
  const diagnostic = {
    stage: 3,
    code: "SEM-03",
    at: { file: "test.jimsabz", line: 2, col: 3 },
    message: "Wrong type",
  };
  updateRun(state, { type: "fault", diagnostic });
  assert.equal(state.status, "Compilation failed");
  assert.deepEqual(state.diagnostic.at, diagnostic.at);
});
test("debug commands cross the authenticated run-window bridge",()=>{const x=setup();x.runner.begin({file:'main.jimsabz'});x.receive('ready');x.runner.send({type:'debug-paused',at:{file:'main.jimsabz',line:3},frames:[]});assert.equal(x.runner.state.status,'Paused');x.receive('debug-command',{action:'over'});assert.equal(x.actions.at(-1).action,'over');x.receive('ready');assert.equal(x.posts.at(-1).data.state.debugSnapshot.at.line,3);x.runner.send({type:'debug-resumed'});assert.equal(x.runner.state.status,'Running');assert.equal(x.runner.state.debugSnapshot,null);x.runner.dispose();});
console.log(`${passed}/${passed} separate-window lifecycle checks passed.`);
