export function applyContentSizeClass(size: "md" | "lg") {
  const html = document.documentElement;
  html.classList.remove("content-md", "content-lg");
  html.classList.add(`content-${size}`);
}
