const colorNames = {
  violet: "#9474ff",
  cyan: "#63dce3",
  lime: "#b6e879",
  amber: "#ffc473",
  white: "#fff",
  black: "#080a13",
  red: "#fc7185",
  blue: "#699df8",
  green: "#53ce98",
  gray: "#8d94ac",
  yellow: "#ffe083",
  orange: "#ffab68",
};
const color = (value) => colorNames[value] || value || "#9474ff";
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.images = new Map();
    this.meshes = new Map();
    this.urls = [];
  }
  async assets(files) {
    this.urls.forEach(URL.revokeObjectURL);
    this.urls = [];
    this.images.clear();
    this.meshes.clear();
    await Promise.all(
      files.map(async (f) => {
        if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.path)) {
          try {
            const image = await createImageBitmap(new Blob([f.bytes]));
            this.images.set(f.path, image);
          } catch {}
        } else if (/\.obj$/i.test(f.path)) {
          const vertices = [],
            faces = [];
          for (const line of (
            f.text || new TextDecoder().decode(f.bytes)
          ).split("\n")) {
            const p = line.trim().split(/\s+/);
            if (p[0] === "v") vertices.push(p.slice(1, 4).map(Number));
            if (p[0] === "f") {
              const ids = p.slice(1).map((s) => {
                const n = Number(s.split("/")[0]);
                return n < 0 ? vertices.length + n : n - 1;
              });
              for (let i = 1; i + 1 < ids.length; i++)
                if ([ids[0], ids[i], ids[i + 1]].every((id) => vertices[id]))
                  faces.push([
                    vertices[ids[0]],
                    vertices[ids[i]],
                    vertices[ids[i + 1]],
                  ]);
            }
          }
          this.meshes.set(f.path, faces.slice(0, 150000));
        }
      }),
    );
  }
  draw(world) {
    const canvas = this.canvas,
      c = this.ctx;
    if (canvas.width !== world.width || canvas.height !== world.height) {
      canvas.width = world.width;
      canvas.height = world.height;
    }
    c.fillStyle = color(world.background);
    c.fillRect(0, 0, canvas.width, canvas.height);
    if (world.dimension === 3) this.three(world);
    else this.two(world);
    c.font = "16px system-ui";
    world.hud.forEach((h, i) => {
      const text = `${h.name}: ${h.value}`,
        x = 16,
        y = 16 + i * 36;
      c.fillStyle = "#0b1029dc";
      c.fillRect(x, y, c.measureText(text).width + 24, 30);
      c.fillStyle = "#f5f4ff";
      c.fillText(text, x + 12, y + 21);
    });
    if (world.paused || world.over) {
      c.fillStyle = "#080b1ac7";
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "#fff";
      c.font = "600 30px system-ui";
      c.textAlign = "center";
      c.fillText(
        world.over ? world.message || "Game over" : "Paused",
        canvas.width / 2,
        canvas.height / 2,
      );
      c.font = "16px system-ui";
      c.fillText(
        world.over ? "Edit your code and run again" : "Press Esc to resume",
        canvas.width / 2,
        canvas.height / 2 + 32,
      );
      c.textAlign = "left";
    }
  }
  two(w) {
    const c = this.ctx;
    let ox = 0,
      oy = 0;
    if (w.camera?.follow) {
      const p = w.camera.follow.jagah || { x: 0, y: 0 };
      ox = p.x - w.width / 2;
      oy = p.y - w.height / 2;
    }
    for (const grid of w.tilemaps || [])
      grid.forEach((row, y) =>
        row.forEach((id, x) => {
          c.fillStyle = ["#123e35", "#293347", "#f4e6b4", "#54c7a8"][
            Math.abs(id) % 4
          ];
          c.fillRect(x * 32 - ox, y * 32 - oy, 32, 32);
        }),
      );
    for (const a of w.actors) {
      const d = a.data;
      if (d.visible === false || (d.__scene && d.__scene !== w.scene)) continue;
      const p = d.jagah || {},
        x = (p.x || 0) - ox,
        y = (p.y || 0) - oy,
        width = Math.max(0, d.width ?? 40),
        height = Math.max(0, d.height ?? 40),
        image = this.images.get(d.tasveer);
      if (image) {
        const ranges = Object.keys(d).filter((k) => k.startsWith("anim_")),
          allFrames = Math.max(1, ...ranges.map((k) => d[k]?.y + 1 || 1)),
          range =
            d["anim_" + (d.forced_animation || d.animation)] ||
            d[
              "anim_" +
                Object.keys(d)
                  .find((k) => k.startsWith("anim_"))
                  ?.slice(5)
            ],
          frame = range
            ? range.x +
              (Math.floor(a.age * (range.z || 12)) %
                Math.max(1, range.y - range.x + 1))
            : 0,
          sw = image.width / allFrames;
        c.save();
        if (d.flip) {
          c.translate(x + width, y);
          c.scale(-1, 1);
          c.drawImage(
            image,
            frame * sw,
            0,
            sw,
            image.height,
            0,
            0,
            width,
            height,
          );
        } else
          c.drawImage(
            image,
            frame * sw,
            0,
            sw,
            image.height,
            x,
            y,
            width,
            height,
          );
        c.restore();
      } else {
        c.fillStyle = color(d.rang);
        c.fillRect(x, y, width, height);
      }
    }
    for (const p of w.particles) {
      c.globalAlpha = Math.max(0, p.life);
      c.fillStyle = "#ffc473";
      c.fillRect(p.x - ox, p.y - oy, 4, 4);
    }
    c.globalAlpha = 1;
  }
  three(w) {
    const c = this.ctx,
      camera = w.camera || {},
      follow = camera.follow3d?.jagah3d || null,
      offset = camera.jagah3d || { x: 0, y: 4, z: 10 },
      eye = {
        x: offset.x + (follow?.x || 0),
        y: offset.y + (follow?.y || 0),
        z: offset.z + (follow?.z || 0),
      },
      target = camera.look_at || follow || { x: 0, y: 0, z: 0 },
      fov = ((camera.fov || 62) * Math.PI) / 180,
      scale = w.height / (2 * Math.tan(fov / 2));
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
      cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ],
      norm = (a) => {
        const l = Math.hypot(...a) || 1;
        return a.map((x) => x / l);
      },
      dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0),
      e = [eye.x, eye.y, eye.z],
      forward = norm(sub([target.x, target.y, target.z], e)),
      right = norm(cross(forward, [0, 1, 0])),
      up = cross(right, forward),
      light = norm(Object.values(w.light?.simt || { x: 0.4, y: -1, z: -0.6 })),
      faces = [];
    const project = (v) => {
      const r = sub(v, e),
        z = dot(r, forward);
      if (z < 0.1) return null;
      return {
        x: w.width / 2 + (dot(r, right) * scale) / z,
        y: w.height / 2 - (dot(r, up) * scale) / z,
        z,
      };
    };
    for (const actor of w.actors) {
      const d = actor.data;
      if (
        !actor.mesh ||
        d.visible === false ||
        (d.__scene && d.__scene !== w.scene)
      )
        continue;
      const p = d.jagah3d || {},
        s = d.paimano || { x: 1, y: 1, z: 1 },
        r = d.ghumao || {};
      let mesh = this.meshes.get(d.shakal3d) || primitive(d.shakal3d);
      const transform = (v) => {
        let [x, y, z] = v;
        x *= s.x ?? 1;
        y *= s.y ?? 1;
        z *= s.z ?? 1;
        for (const axis of ["x", "y", "z"]) {
          const angle = ((r[axis] || 0) * Math.PI) / 180,
            co = Math.cos(angle),
            si = Math.sin(angle);
          if (axis === "x") [y, z] = [y * co - z * si, y * si + z * co];
          if (axis === "y") [x, z] = [x * co + z * si, -x * si + z * co];
          if (axis === "z") [x, y] = [x * co - y * si, x * si + y * co];
        }
        return [x + (p.x || 0), y + (p.y || 0), z + (p.z || 0)];
      };
      for (const face of mesh) {
        const points = face.map(transform),
          q = points.map(project);
        if (q.some((x) => !x)) continue;
        const normal = norm(
            cross(sub(points[1], points[0]), sub(points[2], points[0])),
          ),
          illum = Math.min(
            1,
            Math.max(
              0.18,
              (w.light?.ambient ?? 0.35) + Math.abs(dot(normal, light)) * 0.65,
            ),
          );
        faces.push({
          q,
          depth: q.reduce((sum, p) => sum + p.z, 0) / 3,
          fill: shade(color(d.rang), illum),
        });
      }
    }
    faces.sort((a, b) => b.depth - a.depth);
    for (const face of faces) {
      c.beginPath();
      face.q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fillStyle = face.fill;
      c.fill();
      c.strokeStyle = face.fill;
      c.lineWidth = 0.7;
      c.stroke();
    }
  }
}
function shade(hex, amount) {
  const c = hex.replace("#", ""),
    full =
      c.length === 3
        ? c
            .split("")
            .map((s) => s + s)
            .join("")
        : c;
  if (!/^[a-f0-9]{6}$/i.test(full)) return hex;
  return (
    "#" +
    [0, 2, 4]
      .map((i) =>
        Math.round(parseInt(full.slice(i, i + 2), 16) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const cache = new Map();
function primitive(shape = "cube") {
  if (cache.has(shape)) return cache.get(shape);
  let faces = [];
  const triangle = (a, b, c) => faces.push([a, b, c]);
  if (shape === "plane") {
    triangle([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5]);
    triangle([-0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]);
  } else if (shape === "sphere") {
    const v = (lat, lon) => {
      const p = -Math.PI / 2 + (lat * Math.PI) / 8,
        t = (lon * 2 * Math.PI) / 12;
      return [
        Math.cos(p) * Math.cos(t) * 0.5,
        Math.sin(p) * 0.5,
        Math.cos(p) * Math.sin(t) * 0.5,
      ];
    };
    for (let lat = 0; lat < 8; lat++)
      for (let lon = 0; lon < 12; lon++) {
        triangle(v(lat, lon), v(lat + 1, lon), v(lat + 1, lon + 1));
        triangle(v(lat, lon), v(lat + 1, lon + 1), v(lat, lon + 1));
      }
  } else if (shape === "pyramid") {
    const v = [
      [-0.5, -0.3, -0.5],
      [0.5, -0.3, -0.5],
      [0.5, -0.3, 0.5],
      [-0.5, -0.3, 0.5],
      [0, 0.7, 0],
    ];
    [
      [0, 4, 1],
      [1, 4, 2],
      [2, 4, 3],
      [3, 4, 0],
      [0, 1, 2],
      [0, 2, 3],
    ].forEach((ids) => triangle(...ids.map((i) => v[i])));
  } else {
    const v = [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ];
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [3, 7, 6, 2],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
    ].forEach((q) => {
      triangle(v[q[0]], v[q[1]], v[q[2]]);
      triangle(v[q[0]], v[q[2]], v[q[3]]);
    });
  }
  cache.set(shape, faces);
  return faces;
}
