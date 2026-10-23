// A brief sound must not finish a recording; require sustained speech, then a natural pause.
export function voiceActivity() {
  let speechFrames = 0;
  let heardSpeech = false;
  let lastVoice = 0;
  return (rms: number, now: number) => {
    if (rms > 0.018) {
      speechFrames++;
      lastVoice = now;
      if (speechFrames >= 5) heardSpeech = true;
    }
    return heardSpeech && now - lastVoice > 1700;
  };
}
