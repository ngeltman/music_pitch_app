import { useState, useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import * as Tone from 'tone'
import { Play, Pause, Youtube, Loader2, Music2, RefreshCcw } from 'lucide-react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function App() {
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [pitch, setPitch] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)

  const waveformRef = useRef(null)
  const wavesurfer = useRef(null)
  const player = useRef(null)
  const pitchShift = useRef(null)

  useEffect(() => {
    // Tone.js Setup
    player.current = new Tone.Player()
    pitchShift.current = new Tone.PitchShift(0)
    player.current.connect(pitchShift.current)
    pitchShift.current.toDestination()

    // WaveSurfer Setup
    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#475569',
      progressColor: '#38bdf8',
      cursorColor: '#38bdf8',
      barWidth: 2,
      barRadius: 3,
      responsive: true,
      height: 80,
    })

    return () => {
      wavesurfer.current?.destroy()
      player.current?.dispose()
      pitchShift.current?.dispose()
    }
  }, [])

  const handleLoadVideo = async () => {
    if (!url) return
    setIsLoading(true)
    setIsReady(false)
    setVideoInfo(null)

    try {
      // 1. Get Metadata
      const infoRes = await fetch(`${API_BASE}/info?url=${encodeURIComponent(url)}`)
      const info = await infoRes.json()
      if (info.error) throw new Error(info.error)
      setVideoInfo(info)

      // 2. Load Audio for Tone.js and WaveSurfer
      const streamUrl = `${API_BASE}/stream?url=${encodeURIComponent(url)}`

      // Load Waveview
      wavesurfer.current.load(streamUrl)

      // Load Tone player
      await player.current.load(streamUrl)

      setIsReady(true)
    } catch (err) {
      console.error('Load error:', err)
      alert('Error loading video. Make sure the backend is running.')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePlayback = async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start()
    }

    if (isPlaying) {
      player.current.stop()
      wavesurfer.current.pause()
    } else {
      player.current.start()
      wavesurfer.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const updatePitch = (val) => {
    const p = parseFloat(val)
    setPitch(p)
    if (pitchShift.current) pitchShift.current.pitch = p
  }

  const updateSpeed = (val) => {
    const s = parseFloat(val)
    setSpeed(s)
    if (player.current) {
      player.current.playbackRate = s
      wavesurfer.current.setPlaybackRate(s)
    }
  }

  return (
    <div className="app-container">
      <div className="glass-panel">
        <header className="header">
          <h1>PITCH SHIFT <span className="highlight">YT</span></h1>
          <p className="subtitle">Premium YouTube Audio Engine</p>
        </header>

        <section className="input-section">
          <div className="url-bar">
            <Youtube className="yt-icon" />
            <input
              type="text"
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
            />
            <button
              className="btn btn-primary"
              onClick={handleLoadVideo}
              disabled={isLoading || !url}
            >
              {isLoading ? <Loader2 className="animate-spin" /> : 'LOAD'}
            </button>
          </div>
        </section>

        {videoInfo && (
          <section className="player-section animate-fade-in">
            <div className="video-meta">
              <img src={videoInfo.thumbnail} alt="thumbnail" className="thumbnail" />
              <div className="meta-text">
                <h3>{videoInfo.title}</h3>
                <p>{videoInfo.author.name}</p>
              </div>
            </div>

            <div className="waveform-container" ref={waveformRef}></div>

            <div className="controls-grid">
              <div className="control-group">
                <div className="label-row">
                  <span>Pitch</span>
                  <span className="badge">{pitch > 0 ? `+${pitch}` : pitch} semi</span>
                </div>
                <input
                  type="range" min="-12" max="12" step="1"
                  value={pitch} onChange={(e) => updatePitch(e.target.value)}
                />
              </div>

              <div className="control-group">
                <div className="label-row">
                  <span>Speed</span>
                  <span className="badge">{speed}x</span>
                </div>
                <input
                  type="range" min="0.5" max="2" step="0.05"
                  value={speed} onChange={(e) => updateSpeed(e.target.value)}
                />
              </div>
            </div>

            <div className="actions">
              <button
                className="btn-play-large"
                onClick={togglePlayback}
                disabled={!isReady}
              >
                {isPlaying ? <Pause size={32} /> : <Play size={32} />}
              </button>
            </div>
          </section>
        )}

        {!videoInfo && !isLoading && (
          <div className="empty-state">
            <Music2 size={48} className="dim-icon" />
            <p>Enter a YouTube link to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
