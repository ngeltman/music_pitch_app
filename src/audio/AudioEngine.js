import * as Tone from 'tone';

export class AudioEngine {
  constructor() {
    this.player = null; // For local files (GrainPlayer)
    this.mediaElement = null; // For streaming (HTMLAudioElement)
    this.mediaNode = null; // MediaElementAudioSourceNode (Native)
    this.pitchShift = null; // Tone.PitchShift for streaming

    this.mode = 'none'; // 'local' or 'stream'

    this.isPlaying = false;
    this.currentRate = 1.0;
    this.currentDetune = 0; // cents
  }

  async initialize() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
  }

  stopAndDispose() {
    // Stop Transport
    Tone.Transport.stop();
    Tone.Transport.cancel();

    // Dispose local player
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }

    // Dispose streaming nodes
    if (this.mediaNode) {
      this.mediaNode.disconnect();
      this.mediaNode = null;
    }
    if (this.pitchShift) {
      this.pitchShift.dispose();
      this.pitchShift = null;
    }
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = '';
      this.mediaElement = null;
    }

    this.isPlaying = false;
    this.mode = 'none';
  }

  async loadFile(file) {
    await this.initialize();
    this.stopAndDispose();
    this.mode = 'local';

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);

    this.player = new Tone.GrainPlayer(audioBuffer).toDestination();
    this.player.playbackRate = this.currentRate;
    this.player.detune = this.currentDetune;

    this.player.sync().start(0);

    return this.player.buffer.duration;
  }

  async loadUrl(url, onProgress) {
    await this.initialize();
    this.stopAndDispose();
    this.mode = 'stream';

    if (onProgress) onProgress('Connecting...');

    this.mediaElement = new Audio(url);
    this.mediaElement.crossOrigin = "anonymous";
    this.mediaElement.playbackRate = this.currentRate;
    this.mediaElement.preservesPitch = true;

    // Use native context to create source
    this.mediaNode = Tone.context.createMediaElementSource(this.mediaElement);

    this.pitchShift = new Tone.PitchShift({
      pitch: this.currentDetune / 100, // semitones
      windowSize: 0.1,
      delayTime: 0,
      feedback: 0
    }).toDestination();

    // Connect native node to Tone node
    Tone.connect(this.mediaNode, this.pitchShift);

    // Wait for metadata to get duration
    return new Promise((resolve, reject) => {
      const onMetadata = () => {
        console.log("Metadata loaded, duration:", this.mediaElement.duration);
        if (onProgress) onProgress('Metadata loaded');
        resolve(this.mediaElement.duration);
      };

      // Debug events & Progress feedback
      this.mediaElement.onwaiting = () => {
        console.log("MediaElement waiting...");
        if (onProgress) onProgress('Buffering...');
      };
      this.mediaElement.onplaying = () => {
        console.log("MediaElement playing");
        if (onProgress) onProgress('Playing');
      };
      this.mediaElement.oncanplay = () => {
        console.log("MediaElement can play");
        if (onProgress) onProgress('Ready to play');
      };
      this.mediaElement.onstalled = () => {
        console.log("MediaElement stalled");
        if (onProgress) onProgress('Connection stalled...');
      };

      if (this.mediaElement.readyState >= 1) {
        onMetadata();
      } else {
        this.mediaElement.onloadedmetadata = onMetadata;
      }

      this.mediaElement.onerror = (e) => {
        console.error("MediaElement error:", e);
        if (onProgress) onProgress('Error loading stream');
        reject(e);
      };
    });
  }

  play() {
    if (this.mode === 'local') {
      if (Tone.Transport.state !== 'started') {
        Tone.Transport.start();
      }
    } else if (this.mode === 'stream') {
      if (Tone.context.state === 'suspended') {
        Tone.context.resume();
      }
      this.mediaElement.play();
    }
    this.isPlaying = true;
  }

  pause() {
    if (this.mode === 'local') {
      Tone.Transport.pause();
    } else if (this.mode === 'stream') {
      this.mediaElement.pause();
    }
    this.isPlaying = false;
  }

  stop() {
    if (this.mode === 'local') {
      Tone.Transport.stop();
    } else if (this.mode === 'stream') {
      this.mediaElement.pause();
      this.mediaElement.currentTime = 0;
    }
    this.isPlaying = false;
  }

  setPlaybackRate(rate) {
    this.currentRate = rate;
    if (this.mode === 'local' && this.player) {
      this.player.playbackRate = rate;
    } else if (this.mode === 'stream' && this.mediaElement) {
      this.mediaElement.playbackRate = rate;
    }
  }

  setDetune(cents) {
    this.currentDetune = cents;
    if (this.mode === 'local' && this.player) {
      this.player.detune = cents;
    } else if (this.mode === 'stream' && this.pitchShift) {
      this.pitchShift.pitch = cents / 100; // PitchShift takes semitones
    }
  }

  seek(seconds) {
    if (this.mode === 'local') {
      Tone.Transport.seconds = seconds;
    } else if (this.mode === 'stream' && this.mediaElement) {
      this.mediaElement.currentTime = seconds;
    }
  }

  getCurrentTime() {
    if (this.mode === 'local') {
      return Tone.Transport.seconds;
    } else if (this.mode === 'stream' && this.mediaElement) {
      return this.mediaElement.currentTime;
    }
    return 0;
  }

  getDuration() {
    if (this.mode === 'local' && this.player) {
      return this.player.buffer.duration;
    } else if (this.mode === 'stream' && this.mediaElement) {
      return this.mediaElement.duration;
    }
    return 0;
  }
}
