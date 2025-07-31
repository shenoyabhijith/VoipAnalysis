(() => {
  // Global simulation state
  window.simulationRunning = false;
  window.currentSimulationId = null;
  window.simulationData = {};
  window.simulationTimers = {};
  window.simulationMetrics = {};

  // Initialize simulation for each snapshot
  function initializeSimulation(snapshotId) {
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) return;

    // Clear previous simulation data
    if (window.simulationData[snapshotId]) {
      clearSimulation(snapshotId);
    }

    // Initialize simulation data
    window.simulationData[snapshotId] = {
      activeCalls: 0,
      totalCalls: 0,
      startTime: null,
      bandwidthUsage: 0,
      callRate: 0,
      links: []
    };

    // Add event listeners
    startBtn.addEventListener('click', () => startSimulation(snapshotId));
    stopBtn.addEventListener('click', () => stopSimulation(snapshotId));
  }

  function startSimulation(snapshotId) {
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) return;

    // Stop any other running simulation
    if (window.simulationRunning && window.currentSimulationId !== snapshotId) {
      stopSimulation(window.currentSimulationId);
    }

    window.simulationRunning = true;
    window.currentSimulationId = snapshotId;
    
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Get snapshot data
    const snapshot = window.snapshots?.find(s => s.id === snapshotId);
    if (!snapshot) {
      addLogEntry(logElement, '❌ No snapshot data found', '#e74c3c');
      return;
    }

    // Initialize simulation with real traffic data
    const links = snapshot.trafficData.map(link => ({
      name: `${link.from} → ${link.to}`,
      rate: link.busyHourErlangs,
      bandwidth: snapshot.networkType === 'pstn' ? link.bandwidthMbps : link.totalBandwidthMbps,
      protocol: snapshot.networkType,
      codec: snapshot.codec || 'N/A'
    }));

    window.simulationData[snapshotId].links = links;
    window.simulationData[snapshotId].startTime = performance.now();
    window.simulationData[snapshotId].activeCalls = 0;
    window.simulationData[snapshotId].totalCalls = 0;
    window.simulationData[snapshotId].bandwidthUsage = 0;

    addLogEntry(logElement, '📈 Simulation started', '#2ecc71');
    addLogEntry(logElement, `Protocol: ${snapshot.networkType.toUpperCase()}`, '#3498db');
    if (snapshot.codec) {
      addLogEntry(logElement, `Codec: ${snapshot.codec.toUpperCase()}`, '#3498db');
    }

    // Start call generation for each link
    links.forEach((link, index) => {
      const interval = 5000 / link.rate; // Convert Erlangs to call interval
      const timer = setInterval(() => {
        spawnCall(snapshotId, link, index);
      }, interval);
      
      window.simulationTimers[`${snapshotId}-${index}`] = timer;
    });

    // Start metrics update
    const metricsTimer = setInterval(() => {
      updateSimulationMetrics(snapshotId);
    }, 1000);
    
    window.simulationTimers[`${snapshotId}-metrics`] = metricsTimer;
  }

  function stopSimulation(snapshotId) {
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) return;

    window.simulationRunning = false;
    if (window.currentSimulationId === snapshotId) {
      window.currentSimulationId = null;
    }
    
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Clear all timers for this simulation
    clearSimulation(snapshotId);

    addLogEntry(logElement, '📉 Simulation stopped', '#e74c3c');
    
    // Final metrics update
    updateSimulationMetrics(snapshotId);
  }

  function clearSimulation(snapshotId) {
    // Clear all timers for this simulation
    Object.keys(window.simulationTimers).forEach(key => {
      if (key.startsWith(snapshotId)) {
        clearInterval(window.simulationTimers[key]);
        delete window.simulationTimers[key];
      }
    });
  }

  function spawnCall(snapshotId, link, linkIndex) {
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    const callId = (link.callId || 0) + 1;
    link.callId = callId;

    // Update simulation data
    window.simulationData[snapshotId].activeCalls++;
    window.simulationData[snapshotId].totalCalls++;
    window.simulationData[snapshotId].bandwidthUsage += link.bandwidth;

    addLogEntry(logElement, `🟢 Call ${callId} started: ${link.name}`, '#2ecc71');

    // Simulate call duration (3 minutes = 180000ms, but use 3 seconds for demo)
    const callDuration = 3000;
    setTimeout(() => {
      if (window.simulationData[snapshotId]) {
        window.simulationData[snapshotId].activeCalls--;
        addLogEntry(logElement, `🔴 Call ${callId} ended: ${link.name}`, '#e74c3c');
      }
    }, callDuration);
  }

  function updateSimulationMetrics(snapshotId) {
    const data = window.simulationData[snapshotId];
    if (!data) return;

    const activeCallsElement = document.getElementById(`activeCalls-${snapshotId}`);
    const callRateElement = document.getElementById(`callRate-${snapshotId}`);
    const bandwidthElement = document.getElementById(`bandwidthUsage-${snapshotId}`);

    if (activeCallsElement) {
      activeCallsElement.textContent = data.activeCalls;
    }

    if (callRateElement && data.startTime) {
      const elapsed = (performance.now() - data.startTime) / 1000;
      const rate = elapsed > 0 ? (data.totalCalls / elapsed * 60).toFixed(1) : '0.0';
      callRateElement.textContent = `${rate} calls/min`;
    }

    if (bandwidthElement) {
      bandwidthElement.textContent = `${data.bandwidthUsage.toFixed(2)} Mbps`;
    }
  }

  function addLogEntry(logElement, message, color = '#000') {
    if (!logElement) return;
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = new Date().toLocaleTimeString() + '  ' + message;
    entry.style.color = color;
    
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
  }

  // Initialize simulations when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Watch for new snapshots and initialize their simulations
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const snapshots = node.querySelectorAll('.snapshot');
            snapshots.forEach(snapshot => {
              const snapshotId = snapshot.id.replace('snapshot-', '');
              if (snapshotId && !window.simulationData[snapshotId]) {
                setTimeout(() => initializeSimulation(snapshotId), 100);
              }
            });
          }
        });
      });
    });

    observer.observe(document.getElementById('results'), {
      childList: true,
      subtree: true
    });
  });

  // Expose functions for external use
  window.updateSimulationLinks = function(links) {
    // This function can be called from app.js to update simulation data
    console.log('Simulation links updated:', links);
  };

  window.getSimulationMetrics = function(snapshotId) {
    return window.simulationData[snapshotId] || null;
  };

  window.clearAllSimulations = function() {
    Object.keys(window.simulationData).forEach(snapshotId => {
      clearSimulation(snapshotId);
    });
    window.simulationData = {};
    window.simulationRunning = false;
    window.currentSimulationId = null;
  };

})();