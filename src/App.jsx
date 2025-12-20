import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Upload, RotateCcw, Music, Link as LinkIcon, Square, LogIn, LogOut, User, Check, ExternalLink } from 'lucide-react';
import { AudioEngine } from './audio/AudioEngine';

function App() {
  const API_URL = import.meta.env.VITE_API_URL || '';
  const [engine] = useState(() => new AudioEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [detune, setDetune] = useState(0); // In semitones for UI, cents for engine
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // YouTube state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isLoadingYoutube, setIsLoadingYoutube] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Auth state
  const [user, setUser] = useState(null);
  const [authData, setAuthData] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const animationRef = useRef();
  const fileInputRef = useRef(null);
  const pollInterval = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      if (engine && isPlaying) {
        setCurrentTime(engine.getCurrentTime());
        animationRef.current = requestAnimationFrame(updateTime);
      }
    };

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateTime);
    } else {
      cancelAnimationFrame(animationRef.current);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, engine]);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
    return () => stopPolling();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/status`);
      const data = await res.json();
      if (data.logged_in) {
        setUser({ name: data.name });
        setAuthData(null);
        stopPolling();
      }
    } catch (err) {
      console.error("Error checking auth status:", err);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollInterval.current = setInterval(checkAuthStatus, 5000);
  };

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`);
      const data = await res.json();
      setAuthData(data);
      startPolling();
    } catch (err) {
      console.error("Error starting login:", err);
      alert("Failed to start login process");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`);
      setUser(null);
      setAuthData(null);
    } catch (err) {
      console.error("Error logging out:", err);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      setMetadata(null);
      setIsPlaying(false);
      engine.stop();
      setCurrentTime(0);
      setStatusMessage('Loading file...');

      try {
        const dur = await engine.loadFile(file);
        setDuration(dur);
        setIsLoaded(true);
        setStatusMessage('Ready to play');
      } catch (err) {
        console.error("Error loading file:", err);
        alert("Error loading audio file.");
        setStatusMessage('Error loading file');
      }
    }
  };

  const getYoutubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleYoutubeLoad = async () => {
    if (!youtubeUrl) return;

    setIsLoadingYoutube(true);
    setIsPlaying(false);
    engine.stop();
    setCurrentTime(0);
    setFileName('Loading YouTube...');
    setStatusMessage('Connecting...');

    // Immediate UI feedback: Generate thumbnail from URL directly
    const videoId = getYoutubeId(youtubeUrl);
    if (videoId) {
      setMetadata({
        title: 'Loading info...',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        uploader: 'YouTube'
      });
    } else {
      setMetadata(null);
    }

    // 1. Start fetching metadata in parallel (for title/uploader)
    fetch(`${API_URL}/api/info?url=${encodeURIComponent(youtubeUrl)}`)
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        // Update with full metadata from backend
        setMetadata(prev => ({
          ...prev,
          title: data.title,
          uploader: data.uploader,
          thumbnail: data.thumbnail || prev?.thumbnail // Keep frontend thumbnail if backend fails
        }));
        setFileName(data.title);
      })
      .catch(err => {
        console.error("Error fetching metadata:", err);
        // If backend fails, we at least have the thumbnail from frontend logic
        if (videoId && !metadata) {
          setFileName('YouTube Stream');
        }
      });

    try {
      // 2. Start streaming audio immediately
      const streamUrl = `${API_URL}/api/youtube?url=${encodeURIComponent(youtubeUrl)}`;

      const dur = await engine.loadUrl(streamUrl, (msg) => setStatusMessage(msg));

      setDuration(dur);
      setIsLoaded(true);

      // Auto-play
      engine.play();
      setIsPlaying(true);

    } catch (err) {
      console.error("Error loading YouTube:", err);
      alert("Error loading YouTube video. Make sure the backend is running.");
      setFileName('');
      setStatusMessage('Error loading stream');
    } finally {
      setIsLoadingYoutube(false);
    }
  };

  const togglePlay = () => {
    if (!isLoaded) return;
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    if (!isLoaded) return;
    engine.stop();
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRateChange = (e) => {
    const rate = parseFloat(e.target.value);
    setPlaybackRate(rate);
    engine.setPlaybackRate(rate);
  };

  const handleDetuneChange = (e) => {
    const semitones = parseFloat(e.target.value);
    setDetune(semitones);
    engine.setDetune(semitones * 100);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    engine.seek(time);
  };

  const handleResetSpeed = () => {
    setPlaybackRate(1.0);
    engine.setPlaybackRate(1.0);
  };

  const handleResetPitch = () => {
    setDetune(0);
    engine.setDetune(0);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card">
      <div className="header">
        <div style={{ background: 'var(--accent-gradient)', padding: '8px', borderRadius: '10px' }}>
          <Music size={24} color="white" />
        </div>
        <h1>Pitch Master</h1>

        {/* Auth Status */}
        <div style={{ marginLeft: 'auto' }}>
          {user ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="auth-badge success" title={`Signed in as ${user.name}`}>
                <User size={14} />
                <span>{user.name}</span>
              </div>
              <button className="auth-btn" onClick={handleLogout} title="Sign Out">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              className="auth-btn"
              onClick={handleLogin}
              disabled={isAuthenticating}
            >
              <LogIn size={14} />
              <span>{isAuthenticating ? '...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Modal / Overlay */}
      {authData && !user && (
        <div className="auth-overlay">
          <div className="auth-card">
            <h3>Connect YouTube</h3>
            <p>To access restricted content, please authorize this app.</p>

            <div className="code-display">
              {authData.user_code}
            </div>

            <p className="instruction">
              1. Copy the code above<br />
              2. Go to <a href={authData.verification_url} target="_blank" rel="noreferrer" className="link">
                {authData.verification_url} <ExternalLink size={12} />
              </a><br />
              3. Enter the code to sign in
            </p>

            <div className="loading-spinner">
              <div className="spinner"></div>
              <span>Waiting for authorization...</span>
            </div>

            <button className="btn-text" onClick={() => setAuthData(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="input-group">
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', color: 'var(--text-tertiary)' }}>
            <LinkIcon size={16} />
          </div>
          <input
            className="text-input"
            type="text"
            placeholder="Paste YouTube Link..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={handleYoutubeLoad}
            disabled={isLoadingYoutube || !youtubeUrl}
            style={{ margin: '4px', borderRadius: '8px' }}
          >
            {isLoadingYoutube ? 'Loading...' : 'Load'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className="btn-icon"
            onClick={() => fileInputRef.current.click()}
            title="Upload Local File"
            style={{ width: '100%', gap: '8px', height: '48px' }}
          >
            <Upload size={18} />
            <span>Upload Audio File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Metadata / Status */}
      {(metadata || fileName) && (
        <div className="metadata-card">
          {metadata ? (
            <img
              src={metadata.thumbnail}
              alt="Cover"
              className="thumbnail"
              onError={(e) => {
                console.error("Error loading image:", metadata.thumbnail);
                // Don't hide, just set opacity to show it exists but failed
                e.target.style.opacity = '0.5';
                e.target.style.border = '2px solid red';
              }}
            />
          ) : (
            <div className="thumbnail" style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music size={24} color="var(--text-secondary)" />
            </div>
          )}
          <div className="meta-info">
            <div className="meta-title">{metadata ? metadata.title : fileName}</div>
            <div className="meta-artist">
              {metadata ? metadata.uploader : (isLoaded ? 'Local File' : 'No file loaded')}
            </div>
          </div>
        </div>
      )}

      {/* Seek Bar */}
      <div className="slider-group">
        <div className="slider-header">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          className="seek-slider"
          type="range"
          min="0"
          max={duration || 100}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          disabled={!isLoaded}
        />
      </div>

      {/* Main Controls */}
      <div className="controls-row">
        <button
          className="btn-icon"
          onClick={handleStop}
          disabled={!isLoaded}
          title="Stop"
          style={{ width: '48px', height: '48px', borderRadius: '50%' }}
        >
          <Square size={20} fill="currentColor" />
        </button>

        <button
          className="btn-primary btn-play"
          onClick={togglePlay}
          disabled={!isLoaded}
        >
          {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" style={{ marginLeft: '4px' }} />}
        </button>
      </div>

      {/* Effects Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px' }}>
        {/* Speed */}
        <div className="slider-group">
          <div className="slider-header">
            <span>Speed</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="slider-value">{playbackRate.toFixed(2)}x</span>
              <button className="reset-btn" onClick={handleResetSpeed} title="Reset">
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
          <input
            className="control-slider"
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={playbackRate}
            onChange={handleRateChange}
            disabled={!isLoaded}
          />
        </div>

        {/* Pitch */}
        <div className="slider-group">
          <div className="slider-header">
            <span>Pitch</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="slider-value">{detune > 0 ? '+' : ''}{detune} st</span>
              <button className="reset-btn" onClick={handleResetPitch} title="Reset">
                <RotateCcw size={12} />
              </button>
            </div>
          </div>
          <input
            className="control-slider"
            type="range"
            min="-12"
            max="12"
            step="1"
            value={detune}
            onChange={handleDetuneChange}
            disabled={!isLoaded}
          />
        </div>
      </div>

      <div className={`status-badge ${isPlaying ? 'active' : ''}`}>
        {statusMessage || (isLoaded ? (isPlaying ? "Playing" : "Paused") : "Waiting for media...")}
      </div>
    </div>
  );
}

export default App;
