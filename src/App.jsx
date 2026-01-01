import { useState, useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'
import * as Tone from 'tone'
import { Play, Pause, Youtube, Loader2, Music2, RefreshCcw } from 'lucide-react'
import './App.css'

const getApiBase = () => {
  const url = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001'
  return url.endsWith('/api') ? url : `${url.replace(/\/$/, '')}/api`
}
const API_BASE = getApiBase()

function App() {
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [pitch, setPitch] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [backendStatus, setBackendStatus] = useState('checking')
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  const addLog = (msg) => setLogs(prev => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`])

  const waveformRef = useRef(null)
  const wavesurfer = useRef(null)
  const player = useRef(null)
  const pitchShift = useRef(null)

  useEffect(() => {
    console.log('[FRONTEND] API_BASE is:', API_BASE)
    checkBackend()
  }, [])

  const checkBackend = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (res.ok) setBackendStatus('online')
      else setBackendStatus('error')
    } catch (err) {
      console.error('[FRONTEND] Backend health check failed:', err)
      setBackendStatus('offline')
    }
  }

  useEffect(() => {
    // Tone.js Setup
    player.current = new Tone.Player()
    pitchShift.current = new Tone.PitchShift(0)
    player.current.connect(pitchShift.current)
    pitchShift.current.toDestination()

    return () => {
      player.current?.dispose()
      pitchShift.current?.dispose()
      wavesurfer.current?.destroy()
    }
  }, [])

  // Initialize WaveSurfer only when the container is available
  useEffect(() => {
    if (!waveformRef.current || wavesurfer.current) return

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
      wavesurfer.current = null
    }
  }, [videoInfo])

  const handleLoadVideo = async () => {
    if (!url) return
    setIsLoading(true)
    setIsReady(false)
    setVideoInfo(null)

    try {
      // 1. Get Metadata
      const infoRes = await fetch(`${API_BASE}/info?url=${encodeURIComponent(url)}`)
      if (!infoRes.ok) throw new Error('Failed to fetch video info from server')

      const info = await infoRes.json()
      if (info.error) throw new Error(info.error)
      setVideoInfo(info)
      addLog(`Metadata loaded: ${info.title}`)

      // 2. Load Audio for Tone.js and WaveSurfer
      const streamUrl = `${API_BASE}/stream?url=${encodeURIComponent(url)}`
      addLog(`Testing stream connectivity...`)

      // Pre-check stream to avoid "unable to decode" error
      const streamCheck = await fetch(streamUrl, { method: 'HEAD' })
      if (!streamCheck.ok) {
        // If HEAD fails, try a GET to capture the error JSON
        const errorRes = await fetch(streamUrl)
        const errorData = await errorRes.json().catch(() => ({ error: 'Unknown stream error' }))
        const specificError = errorData.details || errorData.error || errorRes.statusText
        addLog(`STREAM ERROR: ${specificError}`)
        throw new Error(`Stream check failed: ${specificError}`)
      }
      addLog(`Stream validated, loading audio...`)

      // Load Waveview
      if (wavesurfer.current) {
        wavesurfer.current.load(streamUrl)
      }

      // Load Tone player
      if (player.current) {
        await player.current.load(streamUrl)
      }

      setIsReady(true)
      addLog(`Audio engine ready`)
    } catch (err) {
      console.error('Load error:', err)
      addLog(`FATAL ERROR: ${err.message}`)
      setVideoInfo(null)
      const errorMsg = `Error connecting to: ${API_BASE}\n\nDetails: ${err.message}\n\nCheck 'View Technical Logs' for more info.`
      alert(errorMsg)
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
          <div className="status-badge-container">
            <span className={`status-badge ${backendStatus}`}>
              Backend: {backendStatus.toUpperCase()}
            </span>
            <button onClick={checkBackend} className="btn-refresh"><RefreshCcw size={14} /></button>
          </div>
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

        <div className="debug-footer">
          <button className="btn-text" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? 'Hide Logs' : 'View Technical Logs'}
          </button>
          {showLogs && (
            <div className="log-window">
              <div className="log-header">
                <span>System Logs</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(logs.join('\n'));
                  alert('Logs copied to clipboard');
                }}>Copy</button>
              </div>
              <pre>{logs.join('\n') || 'No logs yet...'}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
