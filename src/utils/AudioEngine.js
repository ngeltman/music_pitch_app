import * as Tone from 'tone';

class AudioEngine {
    constructor() {
        this.player = new Tone.Player();
        this.pitchShift = new Tone.PitchShift();

        // Connect player to pitch shift, then to master output
        this.player.connect(this.pitchShift);
        this.pitchShift.toDestination();

        this.onProgress = null;
    }

    async load(url) {
        await this.player.load(url);
    }

    play() {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }
        this.player.start();
    }

    pause() {
        this.player.stop(); // Tone.Player stop is immediate pause/stop
    }

    setPitch(semitones) {
        this.pitchShift.pitch = semitones;
    }

    setPlaybackRate(rate) {
        this.player.playbackRate = rate;
    }

    get duration() {
        return this.player.buffer.duration;
    }

    get progress() {
        if (!this.player.buffer.duration) return 0;
        // Note: Tone.Player playhead is not easily accessible for real-time progress
        // We'll manage progress via WaveSurfer in the UI, but engine holds state
        return 0;
    }
}

export const audioEngine = new AudioEngine();
