import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../firebase';
import { uploadToSupabase } from '../supabase';
import {
  collection, addDoc, deleteDoc, doc, query,
  orderBy, onSnapshot, serverTimestamp, limit,
  getDocs, where
} from 'firebase/firestore';
import { sendNotificationToUser } from '../services/notificationService';
import {
  SendIcon, MicIcon, StopIcon, ImageIcon, CameraIcon,
  PlayIcon, PauseIcon, CloseIcon, AttachIcon,
} from './Icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const MESSAGES_LIMIT  = 100;
const MAX_IMAGE_SIZE  = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_SIZE  = 20 * 1024 * 1024; // 20 MB
const MAX_RECORD_SECS = 120;              // 2-min cap
const LONG_PRESS_MS   = 500;             // ms before long-press fires

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function formatDateSeparator(timestamp) {
  if (!timestamp) return null;
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgD  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff  = today - msgD;
    if (diff === 0)        return 'Today';
    if (diff === 86400000) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return null; }
}

function formatDuration(s) {
  if (!s || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function getAvatarColor(userId = '') {
  const palette = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = userId.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, userId, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: getAvatarColor(userId),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>
      {getInitials(name)}
    </div>
  );
}

function AudioPlayer({ audioUrl, duration }) {
  const audioRef = useRef(null);
  const [playing, setPlaying]     = useState(false);
  const [current, setCurrent]     = useState(0);
  const [total,   setTotal]       = useState(duration || 0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onLoadedMetadata={e => setTotal(e.target.duration)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
      />
      <button className="audio-play-btn" onClick={toggle}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-progress-wrap">
        <div className="audio-waveform">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="audio-bar"
              style={{
                height: `${Math.sin(i * 0.8) * 50 + 55}%`,
                opacity: total > 0 && (i / 20) <= (current / total) ? 1 : 0.35,
              }}
            />
          ))}
        </div>
        <div className="audio-time">{formatDuration(playing ? current : total)}</div>
      </div>
    </div>
  );
}

function ImageMessage({ imageUrl, fileName }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="image-message" onClick={() => setOpen(true)}>
        <img src={imageUrl} alt={fileName || 'Image'} />
        <div className="image-overlay"><span>Tap to expand</span></div>
      </div>
      {open && (
        <div className="image-lightbox" onClick={() => setOpen(false)}>
          <button className="lightbox-close"><CloseIcon /></button>
          <img src={imageUrl} alt={fileName || 'Image'} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function UploadingOverlay({ type }) {
  return (
    <div className="upload-progress">
      <div className="upload-progress-icon">
        {type === 'image' ? <ImageIcon /> : <MicIcon />}
      </div>
      <div className="upload-progress-bar-wrap">
        <div className="upload-progress-label">
          Uploading {type === 'image' ? 'image' : 'voice message'}…
        </div>
        <div className="upload-progress-track">
          <div className="upload-progress-fill indeterminate" />
        </div>
      </div>
      <div className="upload-progress-pct">⏳</div>
    </div>
  );
}

// ─── Context Menu (delete popup) ─────────────────────────────────────────────
function MessageContextMenu({ menu, onDelete, onClose, isAdmin }) {
  const menuRef = useRef(null);
  const canDelete = menu.isOwn || isAdmin;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  return (
    <>
      {/* Dark overlay */}
      <div className="ctx-backdrop" onClick={onClose} />
      {/* Popup */}
      <div
        ref={menuRef}
        className="ctx-menu"
        style={{
          top:  Math.min(menu.y, window.innerHeight - 160),
          left: Math.min(Math.max(menu.x - 80, 8), window.innerWidth - 200),
        }}
      >
        <div className="ctx-menu-label">{menu.msg.userName || 'Message'}</div>
        {canDelete && (
          <button
            className="ctx-menu-item danger"
            onClick={() => { onDelete(menu.msg); onClose(); }}
          >
            🗑 Delete Message
          </button>
        )}
        <button className="ctx-menu-item" onClick={onClose}>
          ✕ Cancel
        </button>
      </div>
    </>
  );
}

// ─── Main Chat Component ──────────────────────────────────────────────────────
function Chat({ currentUser }) {
  const [message,       setMessage]       = useState('');
  const [messages,      setMessages]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [sending,       setSending]       = useState(false);
  const [uploading,     setUploading]     = useState(null);
  const [imagePreview,  setImagePreview]  = useState(null);
  const [showAttach,    setShowAttach]    = useState(false);
  const [recording,     setRecording]     = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview,  setAudioPreview]  = useState(null);
  const [ctxMenu,       setCtxMenu]       = useState(null); // context menu state

  const messagesEndRef    = useRef(null);
  const fileInputRef      = useRef(null);
  const cameraInputRef    = useRef(null);
  const mediaRecorderRef  = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef    = useRef([]);
  const longPressTimer    = useRef(null);
  const attachBtnRef      = useRef(null);
  const attachMenuRef     = useRef(null);

  const isAdmin = currentUser?.userType === 'admin' || currentUser?.role === 'admin';

  // ── Auto-scroll ──────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── Close attach menu on outside click ───────────────────────
  useEffect(() => {
    if (!showAttach) return;
    const handler = (e) => {
      if (
        attachMenuRef.current?.contains(e.target) ||
        attachBtnRef.current?.contains(e.target)
      ) return;
      setShowAttach(false);
    };
    // slight delay so the click that opened it doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 10);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showAttach]);

  // ── Firestore real-time listener ─────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(MESSAGES_LIMIT)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Chat listener error:', err);
        setError(
          err.code === 'permission-denied'
            ? 'Permission denied. Please re-login and try again.'
            : 'Could not load messages. Check your connection.'
        );
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ── Delete message ───────────────────────────────────────────
  const handleDeleteMessage = async (msg) => {
    const confirmDelete = window.confirm(
      'Delete this message for everyone?'
    );
    if (!confirmDelete) return;
    try {
      await deleteDoc(doc(db, 'messages', msg.id));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete: ' + err.message);
    }
  };

  // ── Long press handlers (mobile) ─────────────────────────────
  const handleTouchStart = (e, msg, isOwn) => {
    if (!isOwn && !isAdmin) return; // only own msgs or admin
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      setCtxMenu({
        msg,
        isOwn,
        x: touch.clientX,
        y: touch.clientY,
      });
    }, LONG_PRESS_MS);
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  // ── Right-click handler (desktop) ────────────────────────────
  const handleContextMenu = (e, msg, isOwn) => {
    if (!isOwn && !isAdmin) return;
    e.preventDefault();
    setCtxMenu({ msg, isOwn, x: e.clientX, y: e.clientY });
  };

  // ── Sender metadata ──────────────────────────────────────────
  const senderMeta = () => ({
    userId:    currentUser?.uid,
    userName:  currentUser?.name || currentUser?.username || 'User',
    isAdmin:   currentUser?.userType === 'admin' || currentUser?.role === 'admin',
    timestamp: serverTimestamp(),
  });

  const notifyOtherUsers = async (msgText, msgType) => {
    try {
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('__name__', '!=', currentUser.uid))
      );
      const title = `${currentUser?.name || 'A member'} sent a message 💬`;
      const body = msgType === 'text' ? msgText : `Sent a ${msgType}`;
      
      for (const uDoc of usersSnap.docs) {
        const userData = uDoc.data();
        if (userData.currentActiveTab !== 'chat') {
          await sendNotificationToUser(uDoc.id, title, body, 'chat');
        }
      }
    } catch (err) {
      console.error('Error notifying other users:', err);
    }
  };

  // ── Upload helpers (Supabase → Firestore) ────────────────────
  const handleSendImage = async () => {
    if (!imagePreview || !currentUser || sending) return;
    const { file } = imagePreview;
    setImagePreview(null);
    setSending(true);
    setUploading('image');
    try {
      const url = await uploadToSupabase('chat-media', `images/${currentUser.uid}`, file);
      await addDoc(collection(db, 'messages'), {
        type: 'image', text: null,
        imageUrl: url, fileName: file.name || 'image',
        ...senderMeta(),
      });
      notifyOtherUsers(file.name || 'image', 'image');
    } catch (err) {
      console.error('Image upload error:', err);
      alert('Failed to send image: ' + err.message);
    } finally {
      setSending(false);
      setUploading(null);
    }
  };

  const handleSendAudio = async () => {
    if (!audioPreview || !currentUser || sending) return;
    const preview = audioPreview;
    setAudioPreview(null);
    setSending(true);
    setUploading('audio');
    try {
      const audioFile = new File([preview.blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      if (audioFile.size > MAX_AUDIO_SIZE) throw new Error('Audio too large (max 20 MB)');
      const url = await uploadToSupabase('chat-media', `audio/${currentUser.uid}`, audioFile, 'audio/webm');
      await addDoc(collection(db, 'messages'), {
        type: 'audio', text: null,
        audioUrl: url, duration: Math.round(preview.duration),
        ...senderMeta(),
      });
      notifyOtherUsers('Voice message', 'audio');
    } catch (err) {
      console.error('Audio upload error:', err);
      alert('Failed to send voice message: ' + err.message);
    } finally {
      setSending(false);
      setUploading(null);
    }
  };

  const handleSendText = async () => {
    if (!message.trim() || sending || !currentUser) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), { type: 'text', text, ...senderMeta() });
      notifyOtherUsers(text, 'text');
    } catch (err) {
      console.error('Send error:', err);
      setMessage(text);
      alert('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  // ── Image picker ─────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > MAX_IMAGE_SIZE) { alert('Image too large (max 10 MB)'); return; }
    const reader = new FileReader();
    reader.onload = ev => setImagePreview({ file, dataUrl: ev.target.result });
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowAttach(false);
  };

  // ── Voice recording ──────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioPreview({ blob, url: URL.createObjectURL(blob), duration: recordingTime });
        setRecordingTime(0);
      };
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => {
          if (t >= MAX_RECORD_SECS) { stopRecording(); return t; }
          return t + 1;
        });
      }, 1000);
    } catch {
      alert('Microphone access denied. Allow microphone in browser settings.');
    }
  };

  const stopRecording = () => {
    clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const cancelRecording = () => {
    clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey && !sending && message.trim()) {
      e.preventDefault();
      handleSendText();
    }
  };

  // ── Render: date separator ───────────────────────────────────
  const renderDateSep = (timestamp, index) => {
    const label    = formatDateSeparator(timestamp);
    const prevLabel = index > 0 ? formatDateSeparator(messages[index - 1]?.timestamp) : null;
    if (label && label !== prevLabel) {
      return <div key={`sep-${index}`} className="date-separator"><span>{label}</span></div>;
    }
    return null;
  };

  // ── Render: single message ───────────────────────────────────
  const renderMessage = (msg) => {
    const isOwn = msg.userId === currentUser?.uid;
    return (
      <div
        key={msg.id}
        className={`chat-msg ${isOwn ? 'own' : 'other'}`}
        onContextMenu={e => handleContextMenu(e, msg, isOwn)}
        onTouchStart={e => handleTouchStart(e, msg, isOwn)}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
      >
        {!isOwn && <Avatar name={msg.userName} userId={msg.userId} size={30} />}
        <div className="chat-msg-body">
          {!isOwn && (
            <div className="chat-msg-name">
              {msg.userName || 'User'}
              {msg.isAdmin && <span className="admin-badge">Admin</span>}
            </div>
          )}
          <div className={`chat-bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
            {msg.type === 'image' && msg.imageUrl && (
              <ImageMessage imageUrl={msg.imageUrl} fileName={msg.fileName} />
            )}
            {msg.type === 'audio' && msg.audioUrl && (
              <AudioPlayer audioUrl={msg.audioUrl} duration={msg.duration} />
            )}
            {(msg.type === 'text' || !msg.type) && msg.text && (
              <div className="chat-bubble-text">{msg.text}</div>
            )}
            <div className="chat-bubble-time">{formatTime(msg.timestamp)}</div>
          </div>

          {/* Quick delete button visible on own messages (desktop hover) */}
          {isOwn && (
            <button
              className="msg-delete-btn"
              onClick={() => handleDeleteMessage(msg)}
              title="Delete message"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Loading screen ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="chat-header-avatar"><span>PG</span></div>
            <div>
              <div className="chat-header-title">PG Group Chat</div>
              <div className="chat-header-status">Connecting…</div>
            </div>
          </div>
        </div>
        <div className="chat-loading">
          <div className="chat-spinner" />
          <div className="chat-loading-text">Loading messages…</div>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────
  return (
    <div className="chat-container">

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-header-avatar"><span>PG</span></div>
          <div>
            <div className="chat-header-title">PG Group Chat</div>
            <div className="chat-header-status">
              {uploading ? `Uploading ${uploading}…` : error ? '⚠ Error' : `${messages.length} messages`}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="chat-error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" onClick={() => setShowAttach(false)}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">No messages yet</div>
            <div className="chat-empty-sub">Be the first to say something!</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id}>
            {renderDateSep(msg.timestamp, i)}
            {renderMessage(msg)}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload overlay */}
      {uploading && <UploadingOverlay type={uploading} />}

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="media-preview-modal">
          <div className="media-preview-header">
            <span>Send Image</span>
            <button onClick={() => setImagePreview(null)}><CloseIcon /></button>
          </div>
          <div className="media-preview-body">
            <img src={imagePreview.dataUrl} alt="Preview" className="media-preview-img" />
          </div>
          <div className="media-preview-footer">
            <button className="media-cancel-btn" onClick={() => setImagePreview(null)}>Cancel</button>
            <button className="media-send-btn" onClick={handleSendImage} disabled={sending}>
              <SendIcon /> {sending ? 'Uploading…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Audio Preview */}
      {audioPreview && (
        <div className="audio-preview-bar">
          <button className="audio-cancel-btn" onClick={() => setAudioPreview(null)}><CloseIcon /></button>
          <AudioPlayer audioUrl={audioPreview.url} duration={audioPreview.duration} />
          <button className="media-send-btn" onClick={handleSendAudio} disabled={sending}>
            <SendIcon />
          </button>
        </div>
      )}

      {/* Attach Menu — with outside-click dismiss */}
      {showAttach && !recording && !imagePreview && !audioPreview && (
        <>
          {/* Transparent backdrop — clicking it closes the menu */}
          <div
            className="attach-backdrop"
            onClick={() => setShowAttach(false)}
          />
          <div ref={attachMenuRef} className="attach-menu">
            <button className="attach-option" onClick={() => fileInputRef.current?.click()}>
              <div className="attach-option-icon gallery"><ImageIcon /></div>
              <span>Gallery</span>
            </button>
            <button className="attach-option" onClick={() => cameraInputRef.current?.click()}>
              <div className="attach-option-icon camera"><CameraIcon /></div>
              <span>Camera</span>
            </button>
          </div>
        </>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef}   type="file" accept="image/*"                       style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Input Bar */}
      <div className="chat-input-bar">
        {recording ? (
          <div className="recording-bar">
            <div className="recording-dot" />
            <span className="recording-time">{formatDuration(recordingTime)}</span>
            <span className="recording-hint">Recording… tap Cancel to stop</span>
            <button className="recording-cancel-btn" onClick={cancelRecording}>Cancel</button>
            <button className="recording-stop-btn" onClick={stopRecording}><StopIcon /></button>
          </div>
        ) : !imagePreview && !audioPreview ? (
          <>
            <button
              ref={attachBtnRef}
              className={`chat-action-btn ${showAttach ? 'active' : ''}`}
              onClick={() => setShowAttach(v => !v)}
              disabled={sending}
            >
              <AttachIcon />
            </button>

            <input
              className="chat-text-input"
              placeholder="Type a message…"
              value={message}
              onChange={e => { setMessage(e.target.value); setShowAttach(false); }}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />

            {message.trim() ? (
              <button className="chat-send-btn" onClick={handleSendText} disabled={sending}>
                <SendIcon />
              </button>
            ) : (
              <button
                className="chat-mic-btn"
                onClick={startRecording}
                disabled={sending}
                title="Tap to record voice message"
              >
                <MicIcon />
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Context Menu (long-press / right-click delete) */}
      {ctxMenu && (
        <MessageContextMenu
          menu={ctxMenu}
          onDelete={handleDeleteMessage}
          onClose={() => setCtxMenu(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

export default Chat;