export const DISCLAIMER_PATH = "/disclaimer";

export function currentPath() {
  return window.location.pathname.replace(/\/$/, "") || "/";
}

export function isReservedPath(pathname) {
  return pathname === DISCLAIMER_PATH;
}

export function tickerFromPath(pathname) {
  const path = pathname.replace(/^\//, "").replace(/\/$/, "");
  if (!path || path.includes("/")) return null;
  const normalized = `/${path}`;
  if (isReservedPath(normalized)) return null;
  return decodeURIComponent(path).toUpperCase();
}
