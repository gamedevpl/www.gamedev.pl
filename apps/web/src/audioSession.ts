type AudioSessionNav = Navigator & { audioSession?: { type: string } };

export function setCaptureAudioSession(): void {
  const session = (navigator as AudioSessionNav).audioSession;
  if (!session) return;
  try {
    session.type = 'play-and-record';
  } catch (err) {
    void err;
  }
}
