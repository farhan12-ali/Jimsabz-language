export function initTheme(host, onChange = () => {}) {
  const valid = (theme) => (theme === "light" ? "light" : "dark");
  const apply = (theme) => {
    const selected = valid(theme);
    host.document.documentElement.dataset.theme = selected;
    onChange(selected);
    return selected;
  };
  let saved = "dark";
  try {
    saved = host.localStorage.getItem("jimsabz-theme") || "dark";
  } catch {}
  apply(saved);
  host.addEventListener("storage", (event) => {
    if (event.key === "jimsabz-theme") apply(event.newValue);
  });
  return (theme) => {
    const selected = apply(theme);
    try {
      host.localStorage.setItem("jimsabz-theme", selected);
    } catch {}
    return selected;
  };
}
