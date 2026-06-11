type EventCallback = (data?: any) => void;

class GameBridge {
  private listeners: Record<string, EventCallback[]> = {};

  // Register listener
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return unregister function
    return () => this.off(event, callback);
  }

  // Unregister listener
  off(event: string, callback: EventCallback): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  // Emit event
  emit(event: string, data?: any): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in GameBridge event listener for '${event}':`, err);
      }
    });
  }

  // Clear all listeners (useful on game unmount/reset)
  clear(): void {
    this.listeners = {};
  }
}

export const gameBridge = new GameBridge();
export default gameBridge;
