import React, { useEffect, useState, useRef } from 'react';
import { createSocket } from './socket.js';
import './style.css';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const videoPeerRef = useRef(null);
  const videoSelfRef = useRef(null);
  const messagesRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = localStream;
        videoSelfRef.current.srcObject = localStream;
      } catch (e) {
        alert('This website needs video and audio permission to work correctly');
      }
    };

    init();
  }, []);

  const startSearching = async () => {
    setLoading(true);
    const ws = await createSocket();
    wsRef.current = ws;

    ws.register('begin', handleBegin);
    ws.register('connected', handleConnected);
    ws.register('message', handleMessage);
    ws.register('iceCandidate', handleIceCandidate);
    ws.register('description', handleDescription);
    ws.register('typing', handleTyping);
    ws.register('disconnect', handleDisconnect);

    await initializeConnection(ws);
    configureChat(ws);
  };

  const initializeConnection = async (ws) => {
    setInputValue('');
    setLoading(true);

    const iceConfig = {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    };

    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;

    pc.onicecandidate = (e) => handleIceCandidateEvent(e, ws);
    pc.oniceconnectionstatechange = () => handleIceConnectionStateChange(ws);
    pc.ontrack = handleTrackEvent;

    localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    const remoteStream = new MediaStream();
    videoPeerRef.current.srcObject = remoteStream;

    ws.emit('match', { data: 'video' });
  };

  const handleIceCandidateEvent = (e, ws) => {
    if (e.candidate) {
      ws.emit('iceCandidate', e.candidate);
    } else if (!pcRef.current.sentRemoteDescription) {
      pcRef.current.sentRemoteDescription = true;
      ws.emit('description', pcRef.current.localDescription);
    }
  };

  const handleIceConnectionStateChange = async (ws) => {
    if (['disconnected', 'closed'].includes(pcRef.current.iceConnectionState)) {
      pcRef.current.close();
      await initializeConnection(ws);
    }
  };

  const handleTrackEvent = (event) => {
    const remoteStream = videoPeerRef.current.srcObject;
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
  };

  const handleBegin = async () => {
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
  };

  const handleConnected = () => {
    setConnected(true);
    setLoading(false);
  };

  const handleMessage = (msg) => {
    if (!msg) return;
    setMessages((prev) => [...prev, { text: msg, type: 'stranger' }]);
  };

  const handleIceCandidate = async (data) => {
    await pcRef.current.addIceCandidate(data);
  };

  const handleDescription = async (data) => {
    await pcRef.current.setRemoteDescription(data);
    if (!pcRef.current.localDescription) {
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
    }
  };

  const handleTyping = (isTyping) => {
    setIsTyping(isTyping);
  };

  const handleDisconnect = async () => {
    pcRef.current.close();
    setConnected(false);
    setLoading(false);
    startSearching();
  };

  const configureChat = () => {
    document.addEventListener('keydown', handleKeyDown);

    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('keydown', handleMessageInputKeyDown);
    messageInput.addEventListener('keyup', handleMessageInputKeyUp);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleSkip(wsRef.current);
      e.preventDefault();
    }
  };

  const handleMessageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(typingTimeoutRef.current);
      wsRef.current.emit('typing', false);
      handleSendMessage(wsRef.current);
      e.preventDefault();
    } else {
      wsRef.current.emit('typing', true);
    }
  };

  const handleMessageInputKeyUp = () => {
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      wsRef.current.emit('typing', false);
    }, 1000);
  };

  const handleSkip = async (ws) => {
    if (ws) {
      ws.emit('disconnect');
      pcRef.current.close();
      setConnected(false);
      setLoading(false);
      startSearching();
    }
  };

  const handleSendMessage = (ws) => {
    const msg = inputValue.trim();
    if (!msg) return;

    setMessages((prev) => [...prev, { text: msg, type: 'you' }]);
    setInputValue('');
    ws.emit('message', msg);
  };

  useEffect(() => {
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  return (
    <div id="main">
      <div id="videos">
        <div className="video-container">
          <video className="video-player" ref={videoSelfRef} autoPlay playsInline muted></video>
          {loading && <div className="video-loader"></div>}
        </div>
        <div className="video-container">
          <video className="video-player" ref={videoPeerRef} autoPlay playsInline></video>
          {loading && <div className="video-loader"></div>}
        </div>
      </div>
      <div id="status-bar">
        <button className="button large-button" onClick={connected ? () => handleSkip(wsRef.current) : startSearching}>
          {connected ? 'Пропуск собеседника' : 'Поиск собеседника'}
        </button>
      </div>
      <div id="message-area">
        <div id="messages" ref={messagesRef}>
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              {msg.text}
            </div>
          ))}
        </div>
        {isTyping && <div className="message typing">Stranger is typing...</div>}
        <div id="input-area">
          <input
            type="text"
            id="message-input"
            placeholder="Сообщение"
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleMessageInputKeyDown}
            onKeyUp={handleMessageInputKeyUp}
            readOnly={!connected}
          />
          <button className="button" onClick={() => handleSendMessage(wsRef.current)} id="send-btn">Отправить</button>
        </div>
      </div>
    </div>
  );
};

export default App;
