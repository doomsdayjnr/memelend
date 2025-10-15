import WebSocket, { Server as WebSocketServer } from 'ws';
import { redisPublisher, redisSubscriber } from './db/redisPubSub';


interface CustomWebSocket extends WebSocket {
  subscriptions: Map<string, Set<string>>; // mint → set of intervals
  isAlive?: boolean;
}

export const wss = new WebSocketServer({ port: 8081 });

// Handle WebSocket connections
wss.on('connection', (socket: WebSocket) => {
  const customSocket = socket as CustomWebSocket;
  customSocket.subscriptions = new Map();
  customSocket.isAlive = true;

  console.log('🔌 WebSocket client connected');
  socket.send(JSON.stringify({ type: 'welcome', message: 'WebSocket connected' }));

  socket.on('pong', () => { customSocket.isAlive = true; });

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'subscribe': {
          if (msg.mint && msg.interval) {
            let intervals = customSocket.subscriptions.get(msg.mint);
            if (!intervals) {
              intervals = new Set();
              customSocket.subscriptions.set(msg.mint, intervals);
            }
            intervals.add(msg.interval);
            console.log(`Subscribed: mint=${msg.mint} interval=${msg.interval}`);
            socket.send(JSON.stringify({ type: 'subscribed', ...msg }));
          } else {
            socket.send(JSON.stringify({ type: 'error', message: 'mint and interval required for subscribe' }));
          }
          break;
        }

        case 'unsubscribe': {
          if (msg.mint && msg.interval) {
            const intervals = customSocket.subscriptions.get(msg.mint);
            if (intervals) {
              intervals.delete(msg.interval);
              if (intervals.size === 0) {
                customSocket.subscriptions.delete(msg.mint);
              }
              console.log(`Unsubscribed: mint=${msg.mint} interval=${msg.interval}`);
              socket.send(JSON.stringify({ type: 'unsubscribed', ...msg }));
            }
          } else if (msg.mint) {
            customSocket.subscriptions.delete(msg.mint);
            console.log(`Unsubscribed all intervals for mint=${msg.mint}`);
            socket.send(JSON.stringify({ type: 'unsubscribed', mint: msg.mint }));
          } else {
            socket.send(JSON.stringify({ type: 'error', message: 'mint required for unsubscribe' }));
          }
          break;
        }

        default:
          socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (e) {
      console.error('WS message parse error:', e);
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  socket.on('close', () => {
    console.log('❌ WebSocket client disconnected');
    customSocket.subscriptions.clear();
  });
});

// Keep connections alive
setInterval(() => {
  wss.clients.forEach((ws) => {
    const customWs = ws as CustomWebSocket;
    if (!customWs.isAlive) return ws.terminate();
    customWs.isAlive = false;
    ws.ping();
  });
}, 30000);



/**
 * Subscribe to updates from Redis and send to relevant WS clients
 */
redisSubscriber.subscribe('chart_updates');
redisSubscriber.subscribe('trade_updates');
redisSubscriber.subscribe('short_updates');

redisSubscriber.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message);

    if (channel === 'chart_updates') {
      // Expect Redis messages to carry isFinal flag
      const msgStr = JSON.stringify({ type: 'kline', data });

      wss.clients.forEach((client) => {
        const customClient = client as CustomWebSocket;
        if (
          client.readyState === WebSocket.OPEN &&
          customClient.subscriptions.get(data.mint)?.has(data.interval)
        ) {
          client.send(msgStr);
        }
      });
    }

    if (channel === 'trade_updates') {
      const msgStr = JSON.stringify({ type: 'trade', ...data });
      wss.clients.forEach((client) => {
        const customClient = client as CustomWebSocket;
        if (client.readyState === WebSocket.OPEN && customClient.subscriptions.has(data.mint)) {
          client.send(msgStr);
        }
      });
    }

    if (channel === 'short_updates') {
      const msgStr = JSON.stringify({ type: 'short', ...data });
      wss.clients.forEach((client) => {
        const customClient = client as CustomWebSocket;
        if (client.readyState === WebSocket.OPEN && customClient.subscriptions.has(data.mint)) {
          client.send(msgStr);
        }
      });
    }
  } catch (error) {
    console.error('Error processing Redis message:', error);
  }
});
