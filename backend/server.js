const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');

const SERVER_PORT = process.env.PORT || 8000;

if (!SERVER_PORT) {
  throw new Error('Forgot to initialize some variables');
}

Array.prototype.random = function () {
  return this[Math.floor(Math.random() * this.length)];
};

Array.prototype.shuffle = function () {
  for (let i = this.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [this[i], this[j]] = [this[j], this[i]];
  }
  return this;
};

const app = express();
const port = SERVER_PORT;

const server = createServer(app);
server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on port ${port}`);
});

const wss = new WebSocket.Server({ server });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPeer(user, userMap) {
  await sleep(Math.floor(Math.random() * 1000 + 1000)); // sleep for 1 to 2 seconds
  const peers = Array.from(userMap.keys());
  if (!peers.length) return undefined;

  let peer = peers.random();
  if (peers.length === 1 && peer === user) return undefined;
  while (peer === user) {
    peer = peers.random();
  }
  return peer;
}

function addUser(user, userMap) {
  userMap.set(user, true);
}

function deleteUser(user, userMap) {
  userMap.delete(user);
}

wss.textUserMap = new Map();
wss.videoUserMap = new Map();

wss.on('connection', (ws, req) => {
  console.log('New connection');

  ws.channels = new Map();

  ws.init = function () {
    this.on('message', this.handleMessage.bind(this));
  };

  ws.handleMessage = function (message) {
    try {
      const { channel, data } = JSON.parse(message.toString());
      this.propagate(channel, data);
    } catch (e) {
      console.error(e);
    }
  };

  ws.register = function (channel, callback) {
    this.channels.set(channel, callback);
  };

  ws.propagate = function (channel, data) {
    const callback = this.channels.get(channel);
    if (callback) {
      callback(data);
    } else if (this.peer) {
      this.peer.send(JSON.stringify({ channel, data }));
    }
  };

  ws.init();

  ws.register('match', async ({ data }) => {
    ws.userMap = data === 'video' ? wss.videoUserMap : wss.textUserMap;
    const peer = await findPeer(ws, ws.userMap);

    if (ws.peer) return;

    if (!peer) {
      console.log('No peers found');
      console.log(`Pushing ${req.socket.remoteAddress}:${req.socket.remotePort} to queue`);
      return addUser(ws, ws.userMap);
    }

    console.log('Peer available:');
    console.log(`Matching ${req.socket.remoteAddress}:${req.socket.remotePort} now`);
    deleteUser(peer, peer.userMap);

    ws.peer = peer;
    peer.peer = ws;

    ws.send(JSON.stringify({ channel: 'connected', data: '' }));
    peer.send(JSON.stringify({ channel: 'connected', data: '' }));
    if (data === 'video') {
      ws.send(JSON.stringify({ channel: 'begin', data: '' }));
    }
  });

  ws.register('disconnect', () => {
    if (!ws.peer) return;
    ws.peer.peer = undefined;
    ws.peer.send(JSON.stringify({ channel: 'disconnect', data: '' }));
    ws.peer = undefined;
  });

  ws.on('close', () => {
    console.log(`${req.socket.remoteAddress}:${req.socket.remotePort} disconnected`);
    if (ws.peer) {
      ws.peer.send(JSON.stringify({ channel: 'disconnect', data: '' }));
      ws.peer.peer = undefined;
    }
    if (ws.userMap) {
      deleteUser(ws, ws.userMap);
    }
  });
});
