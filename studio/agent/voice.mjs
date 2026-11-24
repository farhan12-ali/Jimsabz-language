const messages = {
  "not-allowed":
    "Microphone access was denied. Allow it in your browser, or type your request.",
  "service-not-allowed":
    "Your browser’s speech service is unavailable. You can still type or attach a report.",
  "audio-capture":
    "No microphone was found. Connect a microphone or type your request.",
  "no-speech": "No speech was detected. Try again when you are ready.",
  network:
    "Voice recognition needs a working connection to your browser’s speech service.",
  "language-not-supported":
    "This recognition language is unavailable in your browser. Try English or Urdu.",
};
export class VoiceInput {
  constructor({ Recognition, onText, onState, onError }) {
    Object.assign(this, { Recognition, onText, onState, onError });
    this.recognition = null;
  }
  start(lang = "en-US") {
    if (this.recognition) return;
    if (!this.Recognition)
      return this.onError(
        "Voice input is unavailable in this browser. Try Chrome or Edge, or type your request.",
      );
    const recognition = new this.Recognition();
    this.recognition = recognition;
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      let final = "",
        interim = "";
      for (const result of Array.from(event.results)) {
        if (result.isFinal) final += result[0].transcript + " ";
        else interim += result[0].transcript + " ";
      }
      this.onText(final.trim(), interim.trim());
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      try {
        recognition.abort();
      } catch {}
      this.onState(false);
      if (event.error !== "aborted")
        this.onError(
          messages[event.error] ||
            "Voice recognition stopped. You can try again or type.",
        );
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      this.onState(false);
    };
    try {
      recognition.start();
      this.onState(true);
    } catch (error) {
      this.recognition = null;
      this.onState(false);
      this.onError(error.message);
    }
  }
  stop() {
    try {
      this.recognition?.stop();
    } catch {
      this.cancel();
    }
  }
  cancel() {
    const recognition = this.recognition;
    this.recognition = null;
    try {
      recognition?.abort();
    } catch {}
    if (recognition) this.onState(false);
  }
}
