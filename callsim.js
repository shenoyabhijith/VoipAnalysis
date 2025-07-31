(() => {
  // Global simulation state
  window.simulationRunning = false;
  window.currentSimulationId = null;
  window.simulationData = {};
  window.simulationTimers = {};
  window.simulationMetrics = {};

  // Initialize simulation for each snapshot
  function initializeSimulation(snapshotId) {
    console.log('Initializing simulation for snapshot:', snapshotId);
    
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) {
      console.log('Missing elements for snapshot:', snapshotId, { startBtn: !!startBtn, stopBtn: !!stopBtn, logElement: !!logElement });
      return;
    }

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

    // Remove existing event listeners to prevent duplicates
    const newStartBtn = startBtn.cloneNode(true);
    const newStopBtn = stopBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    stopBtn.parentNode.replaceChild(newStopBtn, stopBtn);

    // Add event listeners
    newStartBtn.addEventListener('click', () => {
      console.log('Start simulation clicked for:', snapshotId);
      startSimulation(snapshotId);
    });
    newStopBtn.addEventListener('click', () => {
      console.log('Stop simulation clicked for:', snapshotId);
      stopSimulation(snapshotId);
    });

    console.log('Simulation initialized for snapshot:', snapshotId);
  }

  function startSimulation(snapshotId) {
    console.log('Starting simulation for snapshot:', snapshotId);
    
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) {
      console.log('Missing elements for starting simulation:', snapshotId);
      return;
    }

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
      console.log('No snapshot found for ID:', snapshotId);
      return;
    }

    console.log('Found snapshot:', snapshot);

    // Calculate dynamic simulation parameters based on network type and blocking probability
    const simulationParams = calculateDynamicSimulationParams(snapshot);
    
    // Initialize simulation with dynamic traffic data
    const links = snapshot.trafficData.map(link => {
      const linkParams = calculateLinkSimulationParams(link, snapshot, simulationParams);
      return {
        name: `${link.from} → ${link.to}`,
        rate: linkParams.callRate,
        bandwidth: linkParams.bandwidthPerCall,
        protocol: snapshot.networkType,
        codec: snapshot.codec || 'N/A',
        blockingProb: snapshot.blockingProb,
        maxConcurrentCalls: linkParams.maxConcurrentCalls,
        callDuration: linkParams.callDuration
      };
    });

    console.log('Created dynamic links:', links);

    window.simulationData[snapshotId].links = links;
    window.simulationData[snapshotId].startTime = performance.now();
    window.simulationData[snapshotId].activeCalls = 0;
    window.simulationData[snapshotId].totalCalls = 0;
    window.simulationData[snapshotId].bandwidthUsage = 0;
    window.simulationData[snapshotId].blockedCalls = 0;
    window.simulationData[snapshotId].simulationParams = simulationParams;

    addLogEntry(logElement, '📈 Dynamic simulation started', '#2ecc71');
    addLogEntry(logElement, `Protocol: ${snapshot.networkType.toUpperCase()}`, '#3498db');
    addLogEntry(logElement, `Blocking Probability: ${(snapshot.blockingProb * 100).toFixed(1)}%`, '#3498db');
    if (snapshot.codec) {
      addLogEntry(logElement, `Codec: ${snapshot.codec.toUpperCase()}`, '#3498db');
    }
    addLogEntry(logElement, `Call Duration: ${simulationParams.callDuration} seconds`, '#3498db');

    // Start call generation for each link with dynamic rates
    links.forEach((link, index) => {
      const interval = Math.max(500, 1000 / link.rate); // Convert calls per minute to interval
      console.log(`Setting up dynamic timer for ${link.name} with interval: ${interval}ms (${link.rate} calls/min)`);
      
      const timer = setInterval(() => {
        spawnDynamicCall(snapshotId, link, index);
      }, interval);
      
      window.simulationTimers[`${snapshotId}-${index}`] = timer;
    });

    // Start metrics update
    const metricsTimer = setInterval(() => {
      updateSimulationMetrics(snapshotId);
    }, 1000);
    
    window.simulationTimers[`${snapshotId}-metrics`] = metricsTimer;
    
    console.log('Dynamic simulation started successfully for:', snapshotId);
  }

  function calculateDynamicSimulationParams(snapshot) {
    const { networkType, codec, blockingProb } = snapshot;
    
    // Base parameters
    const baseCallDuration = 180; // 3 minutes in seconds
    const busyHourFactor = 0.17; // 17% of daily traffic in busy hour
    
    // Network-specific parameters
    let callDuration, bandwidthPerCall, maxConcurrentCalls;
    
    if (networkType === 'pstn') {
      // PSTN: Circuit-based, blocking probability affects capacity
      callDuration = baseCallDuration;
      bandwidthPerCall = 64; // 64 kbps per call
      maxConcurrentCalls = Math.floor(1.544 * 1000 / bandwidthPerCall); // T1 capacity
    } else {
      // VoIP: Packet-based, codec affects bandwidth
      callDuration = baseCallDuration;
      bandwidthPerCall = codec === 'g729a' ? 8 : 64; // 8 kbps for G.729a, 64 kbps for G.711
      maxConcurrentCalls = Math.floor(1000 / bandwidthPerCall); // Assume 1 Mbps capacity
    }
    
    return {
      callDuration,
      bandwidthPerCall,
      maxConcurrentCalls,
      blockingProb,
      networkType,
      codec
    };
  }

  function calculateLinkSimulationParams(link, snapshot, simulationParams) {
    const { busyHourErlangs, dailyMinutes } = link;
    const { blockingProb, networkType, callDuration } = simulationParams;
    
    // Calculate actual call rate based on Erlangs and blocking probability
    // Erlangs = call rate × average call duration
    // With blocking, actual call rate is reduced
    const theoreticalCallRate = (busyHourErlangs * 60) / callDuration; // calls per hour
    const actualCallRate = theoreticalCallRate * (1 - blockingProb); // accounting for blocking
    
    // Convert to calls per minute for simulation
    const callRatePerMinute = actualCallRate / 60;
    
    // Calculate bandwidth per call based on network type
    let bandwidthPerCall;
    if (networkType === 'pstn') {
      bandwidthPerCall = 64 / 1000; // 64 kbps = 0.064 Mbps
    } else {
      bandwidthPerCall = (snapshot.codec === 'g729a' ? 8 : 64) / 1000; // Convert to Mbps
    }
    
    // Calculate max concurrent calls based on link capacity
    const maxConcurrentCalls = Math.min(
      Math.floor(busyHourErlangs), // Based on Erlang capacity
      simulationParams.maxConcurrentCalls // Based on bandwidth capacity
    );
    
    return {
      callRate: callRatePerMinute,
      bandwidthPerCall,
      maxConcurrentCalls,
      callDuration: simulationParams.callDuration * 1000 // Convert to milliseconds
    };
  }

  function spawnDynamicCall(snapshotId, link, linkIndex) {
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    const data = window.simulationData[snapshotId];
    
    // Check if we can accept more calls (blocking simulation)
    const currentActiveCalls = data.activeCalls;
    const maxCalls = link.maxConcurrentCalls;
    
    // Simulate blocking based on blocking probability
    const blockingThreshold = maxCalls * (1 - link.blockingProb);
    const isBlocked = currentActiveCalls >= blockingThreshold;
    
    const callId = (link.callId || 0) + 1;
    link.callId = callId;

    if (isBlocked) {
      // Call is blocked
      data.blockedCalls++;
      addLogEntry(logElement, `🚫 Call ${callId} BLOCKED: ${link.name} (capacity reached)`, '#e74c3c');
      return;
    }

    // Call is accepted
    data.activeCalls++;
    data.totalCalls++;
    data.bandwidthUsage += link.bandwidth;

    addLogEntry(logElement, `🟢 Call ${callId} started: ${link.name}`, '#2ecc71');

    // Simulate call duration
    setTimeout(() => {
      if (data.activeCalls > 0) {
        data.activeCalls--;
        data.bandwidthUsage -= link.bandwidth;
        addLogEntry(logElement, `🔴 Call ${callId} ended: ${link.name}`, '#e74c3c');
      }
    }, link.callDuration);
  }

  function stopSimulation(snapshotId) {
    console.log('Stopping simulation for snapshot:', snapshotId);
    
    const startBtn = document.getElementById(`startSim-${snapshotId}`);
    const stopBtn = document.getElementById(`stopSim-${snapshotId}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    
    if (!startBtn || !stopBtn || !logElement) {
      console.log('Missing elements for stopping simulation:', snapshotId);
      return;
    }

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
    
    console.log('Simulation stopped for:', snapshotId);
  }

  function clearSimulation(snapshotId) {
    console.log('Clearing simulation for snapshot:', snapshotId);
    
    // Clear all timers for this simulation
    Object.keys(window.simulationTimers).forEach(key => {
      if (key.startsWith(snapshotId)) {
        clearInterval(window.simulationTimers[key]);
        delete window.simulationTimers[key];
      }
    });
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

    // Update blocked calls if element exists
    const blockedCallsElement = document.getElementById(`blockedCalls-${snapshotId}`);
    if (blockedCallsElement) {
      blockedCallsElement.textContent = data.blockedCalls || 0;
    }

    // Update blocking rate if element exists
    const blockingRateElement = document.getElementById(`blockingRate-${snapshotId}`);
    if (blockingRateElement && data.totalCalls > 0) {
      const blockingRate = ((data.blockedCalls || 0) / (data.totalCalls + (data.blockedCalls || 0)) * 100).toFixed(1);
      blockingRateElement.textContent = `${blockingRate}%`;
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
    console.log('DOM loaded, setting up simulation observer');
    
    // Watch for new snapshots and initialize their simulations
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const snapshots = node.querySelectorAll('.snapshot');
            snapshots.forEach(snapshot => {
              const snapshotId = snapshot.id.replace('snapshot-', '');
              if (snapshotId && !window.simulationData[snapshotId]) {
                console.log('Found new snapshot, initializing simulation:', snapshotId);
                setTimeout(() => initializeSimulation(snapshotId), 100);
              }
            });
          }
        });
      });
    });

    const resultsElement = document.getElementById('results');
    if (resultsElement) {
      observer.observe(resultsElement, {
        childList: true,
        subtree: true
      });
      console.log('Observer set up for results element');
    } else {
      console.log('Results element not found');
    }
  });

  // Also initialize any existing snapshots
  function initializeExistingSnapshots() {
    const existingSnapshots = document.querySelectorAll('.snapshot');
    existingSnapshots.forEach(snapshot => {
      const snapshotId = snapshot.id.replace('snapshot-', '');
      if (snapshotId && !window.simulationData[snapshotId]) {
        console.log('Initializing existing snapshot:', snapshotId);
        setTimeout(() => initializeSimulation(snapshotId), 100);
      }
    });
  }

  // Call this after a short delay to catch any snapshots that were already rendered
  setTimeout(initializeExistingSnapshots, 500);

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

  // Expose initialization function for manual calls
  window.initializeSimulation = initializeSimulation;

})();