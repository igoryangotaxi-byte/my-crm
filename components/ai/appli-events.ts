export const APPLI_OPEN_EVENT = "appli:open";

export function requestOpenAppli() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APPLI_OPEN_EVENT));
}
