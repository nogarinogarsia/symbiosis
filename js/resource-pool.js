// LRU keeps a bounded number of idle resources. Live users pin their resources.
export class ResourcePool {
  constructor(maxIdle, dispose) {
    this.maxIdle = maxIdle; this.dispose = dispose; this.entries = new Map(); this.byValue = new Map();
  }
  acquire(key, create) {
    let entry = this.entries.get(key);
    if (!entry) {
      const value = create();
      entry = {key,value,refs:0}; this.byValue.set(value,entry);
    }
    entry.refs++;
    this.entries.delete(key); this.entries.set(key,entry);
    this.trim();
    return entry.value;
  }
  release(value) {
    const entry = this.byValue.get(value);
    if (!entry || entry.refs === 0) return;
    entry.refs--;
    if (entry.refs === 0) { this.entries.delete(entry.key); this.entries.set(entry.key,entry); }
    this.trim();
  }
  trim(maxIdle = this.maxIdle) {
    let idle = [...this.entries.values()].filter(entry=>entry.refs===0).length;
    for (const [key,entry] of this.entries) {
      if (idle <= maxIdle) break;
      if (entry.refs) continue;
      this.entries.delete(key); this.byValue.delete(entry.value); this.dispose(entry.value); idle--;
    }
  }
  stats() {
    const entries=[...this.entries.values()];
    return {entries:entries.length,active:entries.filter(entry=>entry.refs>0).length,idle:entries.filter(entry=>entry.refs===0).length,refs:entries.reduce((sum,entry)=>sum+entry.refs,0)};
  }
}
