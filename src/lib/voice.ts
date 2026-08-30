let lastSpoken = "";

export function speak(text: string, enabled: boolean) {
  if (!enabled) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (text === lastSpoken) return;
  lastSpoken = text;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.04;
  u.pitch = 0.92;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

export function resetVoice() {
  lastSpoken = "";
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
