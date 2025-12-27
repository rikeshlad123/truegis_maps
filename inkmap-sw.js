self.importScripts('inkmap-worker.js');

self.addEventListener('connect', (event) => {
  const port = event.ports[0];

  port.onmessage = async (event) => {
    const { id, ...rest } = event.data;

    const ctx = {
      postMessage: (msg) => port.postMessage({ id, ...msg }),
    };

    try {
      await self.inkmapWorker.handleMessage(rest, ctx);
    } catch (err) {
      port.postMessage({ id, error: err.message });
    }
  };
});
