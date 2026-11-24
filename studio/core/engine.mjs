import {
  field,
  set,
  number,
  format,
  decimal,
  integer,
  bool,
  vector,
  string,
  raw,
} from "./vm.mjs";
const num = (v, key, fallback = 0) => number(field(v, key, decimal(fallback)));
export const visible = (actor, world) =>
  field(actor.data, "visible", bool(true)).value &&
  (!field(actor.data, "__scene", string("")).value ||
    field(actor.data, "__scene").value === world.scene);
function bounds(actor) {
  const d = actor.data,
    p = field(d, actor.mesh ? "jagah3d" : "jagah");
  if (actor.mesh) {
    const s = field(d, "paimano", vector(1, 1, 1));
    return {
      x: num(p, "x") - num(s, "x", 1) / 2,
      y: num(p, "y") - num(s, "y", 1) / 2,
      z: num(p, "z") - num(s, "z", 1) / 2,
      w: Math.abs(num(s, "x", 1)),
      h: Math.abs(num(s, "y", 1)),
      depth: Math.abs(num(s, "z", 1)),
    };
  }
  return {
    x: num(p, "x"),
    y: num(p, "y"),
    z: 0,
    w: num(d, "width", 40),
    h: num(d, "height", 40),
    depth: 0,
  };
}
function collision(a, b) {
  const x = bounds(a),
    y = bounds(b);
  return (
    x.x + x.w > y.x &&
    x.x < y.x + y.w &&
    x.y + x.h > y.y &&
    x.y < y.y + y.h &&
    (!a.mesh || (x.z + x.depth > y.z && x.z < y.z + y.depth))
  );
}
export async function tick(vm, dt, input = { keys: [], mouse: [0, 0] }) {
  const world = vm.world,
    keys = new Set(input.keys.map((k) => k.toUpperCase())),
    held = (k) => keys.has(k),
    pressed = (k) => held(k) && !vm.previousKeys?.has(k);
  vm.instructions = 0;
  world.time += dt;
  await vm.pumpTasks();
  vm.globals.find("dt").value = decimal(dt);
  vm.globals.find("mouse_x").value = integer(Math.round(input.mouse[0]));
  vm.globals.find("mouse_y").value = integer(Math.round(input.mouse[1]));
  if (pressed("ESC")) world.paused = !world.paused;
  if (world.shop?.length) {
    const items = world.shop;
    if (pressed(format(items[0]))) world.paused = !world.paused;
    if (world.paused)
      for (let i = 1; i + 2 < items.length; i += 3)
        if (pressed(String((i - 1) / 3 + 1))) {
          const wallet = vm.globals.find(vm.wallet),
            cost = number(items[i + 1]);
          if (wallet && cost >= 0 && number(wallet.value) >= cost) {
            wallet.value =
              wallet.type === "adad"
                ? integer(BigInt(Math.floor(number(wallet.value) - cost)))
                : decimal(number(wallet.value) - cost);
            await vm.invoke(format(items[i + 2]), [], {});
          }
        }
  }
  if (!world.paused && !world.over) {
    for (const source of [...world.actors])
      if (source.spawnEvery) {
        source.elapsed += dt;
        if (source.elapsed >= source.spawnEvery) {
          source.elapsed -= source.spawnEvery;
          const spawned = await vm.builtin("paida", [source.data], {}),
            width = num(spawned, "width", 40);
          set(
            spawned,
            "jagah",
            vector(
              20 + Math.random() * Math.max(0, world.width - width - 40),
              -num(spawned, "height", 40),
            ),
          );
        }
      }
    for (const actor of [...world.actors]) {
      if (!visible(actor, world)) continue;
      const d = actor.data,
        mesh = actor.mesh,
        p = field(d, mesh ? "jagah3d" : "jagah"),
        controls = field(d, "qabu", string("none")).value,
        speed = num(d, "raftar") * (mesh ? 1 : 60);
      let x = num(p, "x"),
        y = num(p, "y"),
        z = num(p, "z"),
        dx = 0,
        dy = 0,
        dz = 0;
      if (controls !== "none") {
        const wasd = controls === "wasd" || controls === "wasd_3d";
        dx = +held(wasd ? "D" : "RIGHT") - held(wasd ? "A" : "LEFT");
        if (mesh) dz = +held(wasd ? "S" : "DOWN") - held(wasd ? "W" : "UP");
        else if (controls !== "arrows_platformer")
          dy = +held(wasd ? "S" : "DOWN") - held(wasd ? "W" : "UP");
        if (dx && dy) {
          dx *= Math.SQRT1_2;
          dy *= Math.SQRT1_2;
        }
        x += dx * speed * dt;
        y += dy * speed * dt;
        z += dz * speed * dt;
        set(d, "flip", bool(dx < 0));
        set(d, "animation", string(dx || dy || dz ? "run" : "idle"));
      } else if (actor.spawned && !mesh) y += speed * dt;
      const ai = field(d, "chal_ai");
      if (ai.fields) {
        const kind = field(ai, "kind").value;
        if (kind === "patrol") {
          const low = num(ai, "arg0"),
            high = num(ai, "arg1", world.width);
          let dir = num(d, "$direction", 1);
          x += dir * speed * dt;
          if (x < low) {
            x = low;
            dir = 1;
          }
          if (x > high) {
            x = high;
            dir = -1;
          }
          set(d, "$direction", decimal(dir));
        } else if (kind === "chase") {
          const q = field(field(ai, "arg0"), mesh ? "jagah3d" : "jagah"),
            vx = num(q, "x") - x,
            vy = num(q, "y") - y,
            vz = num(q, "z") - z,
            length = Math.hypot(vx, vy, vz);
          if (length > 0.01) {
            x += (vx / length) * speed * dt;
            y += (vy / length) * speed * dt;
            z += (vz / length) * speed * dt;
          }
        }
      }
      const gravity = num(d, "wazan");
      if (gravity) {
        let velocity = num(d, "vy");
        if (pressed("SPACE") && field(d, "$grounded", bool(false)).value)
          velocity = mesh ? num(d, "chhal", 8) : -num(d, "chhal", 500);
        velocity += (mesh ? -gravity : gravity) * dt;
        y += velocity * dt;
        set(d, "vy", decimal(velocity));
        set(d, "$grounded", bool(false));
      }
      if (!mesh && controls !== "none") {
        x = Math.max(0, Math.min(world.width - num(d, "width", 40), x));
        if (!gravity)
          y = Math.max(0, Math.min(world.height - num(d, "height", 40), y));
      }
      set(d, mesh ? "jagah3d" : "jagah", mesh ? vector(x, y, z) : vector(x, y));
      actor.age += dt;
      if (actor.spawned && !mesh && y > world.height + 100)
        set(d, "visible", bool(false));
      const forced = field(d, "forced_animation", string("")).value;
      if (forced) {
        const range = field(d, "anim_" + forced),
          elapsed = num(d, "animation_time") + dt,
          duration =
            (num(range, "y") - num(range, "x") + 1) /
            Math.max(1, num(range, "z", 12));
        set(d, "animation_time", decimal(elapsed));
        if (elapsed >= duration) set(d, "forced_animation", string(""));
      }
    }
    for (const body of world.actors) {
      if (!visible(body, world) || !num(body.data, "wazan")) continue;
      const velocity = num(body.data, "vy");
      if (body.mesh ? velocity > 0 : velocity < 0) continue;
      const b = bounds(body),
        last = (body.mesh ? b.y : b.y + b.h) - velocity * dt;
      for (const platform of world.actors) {
        if (
          platform === body ||
          body.mesh !== platform.mesh ||
          !visible(platform, world) ||
          !field(platform.data, "thandho", bool(false)).value
        )
          continue;
        const f = bounds(platform);
        if (b.x + b.w <= f.x || b.x >= f.x + f.w) continue;
        const surface = body.mesh ? f.y + f.h : f.y;
        if (
          body.mesh
            ? b.z + b.depth <= f.z ||
              b.z >= f.z + f.depth ||
              b.y > surface ||
              last < surface - 0.02
            : b.y + b.h < surface || last > surface + 2
        )
          continue;
        const p = field(body.data, body.mesh ? "jagah3d" : "jagah");
        set(
          p,
          "y",
          decimal(body.mesh ? num(p, "y") + surface - b.y : surface - b.h),
        );
        set(body.data, "vy", decimal(0));
        set(body.data, "$grounded", bool(true));
      }
    }
    for (const handler of world.handlers) {
      if (handler.scene && handler.scene !== world.scene) continue;
      const invoke = () => vm.invoke(handler.fn, [], {});
      if (handler.kind === "timer") {
        handler.elapsed += dt;
        let count = 0;
        const interval = number(handler.args[0]);
        while (handler.elapsed >= interval && count++ < 4) {
          handler.elapsed -= interval;
          await invoke();
        }
      } else if (handler.kind === "on_key" || handler.kind === "on_click") {
        const key = format(handler.args[0]).toUpperCase(),
          button =
            handler.kind === "on_click" && ["LEFT", "RIGHT"].includes(key)
              ? "MOUSE_" + key
              : key;
        if (pressed(button)) await invoke();
      } else if (handler.kind === "level") {
        const level = vm.globals.find("level");
        if (
          level &&
          number(level.value) === number(handler.args[0]) &&
          !handler.elapsed
        ) {
          handler.elapsed = 1;
          await invoke();
        }
      } else if (["takkar", "takkar3d"].includes(handler.kind)) {
        const a = format(handler.args[0]),
          b = format(handler.args[1]);
        for (const first of [...world.actors])
          for (const second of [...world.actors]) {
            if (
              first === second ||
              first.name !== a ||
              second.name !== b ||
              !visible(first, world) ||
              !visible(second, world) ||
              !collision(first, second)
            )
              continue;
            const ac = vm.globals.find(a),
              bc = vm.globals.find(b),
              oldA = ac.value,
              oldB = bc.value;
            ac.value = first.data;
            bc.value = second.data;
            try {
              await invoke();
            } finally {
              ac.value = oldA;
              bc.value = oldB;
            }
          }
      }
    }
    world.actors = world.actors.filter(
      (a) => !a.spawned || field(a.data, "visible", bool(true)).value,
    );
    for (const p of world.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    world.particles = world.particles.filter((p) => p.life > 0);
  }
  vm.previousKeys = keys;
  return vm.snapshot();
}
