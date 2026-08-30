export function registerVillagerServiceWorker() {
  // Registration is owned by the static page shell so it follows the same
  // startup sequence as the archived installable Villager build.
}

export function installDesktopPrompt() {
  // Intentionally do not intercept beforeinstallprompt. Chrome's native
  // install UX is the proven Android path used by the archived game.
}
