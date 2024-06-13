import { WEBSOCKET_URL } from './env.js';

if (!WEBSOCKET_URL) {
  throw new Error('Forgot to initialize some variables');
}

class CustomWebSocket extends WebSocket {
  constructor(url) {
    super(url);
    this.channels = new Map();
    this.addEventListener('message', this.handleMessage.bind(this));
  }

  handleMessage(message) {
    const { channel, data } = JSON.parse(message.data.toString());
    this.propagate(channel, data);
  }

  init() {
    setInterval(() => {
      if (this.readyState === WebSocket.OPEN) {
        this.emit('ping', ''); // Use 'ping' channel to keep the connection alive
      }
    }, 30000);
  }

  emit(channel, data) {
    this.send(JSON.stringify({ channel, data }));
  }

  register(channel, callback) {
    this.channels.set(channel, callback);
  }

  propagate(channel, data) {
    const callback = this.channels.get(channel);
    if (callback) {
      callback(data);
    }
  }
}

export const createSocket = () => {
  return new Promise((resolve, reject) => {
    const ws = new CustomWebSocket(WEBSOCKET_URL);

    ws.addEventListener('open', () => {
      ws.init();
      resolve(ws);
    });

    ws.addEventListener('error', (err) => {
      reject(err);
    });
  });
};
