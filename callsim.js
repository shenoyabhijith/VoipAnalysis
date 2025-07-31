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
    addLogEntry(logElement, `⏱️ Simulation Duration: 10 seconds`, '#f39c12');
    
    // Add simulation parameter summary
    addLogEntry(logElement, '📊 Simulation Parameters:', '#9b59b6');
    addLogEntry(logElement, `  • Bandwidth per call: ${simulationParams.bandwidthPerCall} kbps`, '#9b59b6');
    addLogEntry(logElement, `  • Max concurrent calls: ${simulationParams.maxConcurrentCalls}`, '#9b59b6');
    addLogEntry(logElement, `  • Blocking threshold: ${(simulationParams.blockingProb * 100).toFixed(1)}%`, '#9b59b6');
    
    // Add link-specific information
    addLogEntry(logElement, '🔗 Link Configuration:', '#9b59b6');
    links.forEach((link, index) => {
      addLogEntry(logElement, `  • ${link.name}: ${link.rate.toFixed(2)} calls/min, max ${link.maxConcurrentCalls} calls`, '#9b59b6');
    });

    // Start call generation for each link with dynamic rates and randomness
    links.forEach((link, index) => {
      const baseInterval = Math.max(500, 1000 / link.rate); // Convert calls per minute to interval
      console.log(`Setting up dynamic timer for ${link.name} with interval: ${baseInterval}ms (${link.rate} calls/min)`);
      
      const timer = setInterval(() => {
        // Add randomness to call generation (±20% variation)
        const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
        const actualInterval = baseInterval * randomFactor;
        
        // Randomly decide if we should spawn a call (adds more randomness)
        if (Math.random() < 0.8) { // 80% chance to spawn
          spawnDynamicCall(snapshotId, link, index);
        }
      }, baseInterval);
      
      window.simulationTimers[`${snapshotId}-${index}`] = timer;
    });

    // Start metrics update with reduced frequency
    const metricsTimer = setInterval(() => {
      updateSimulationMetrics(snapshotId);
    }, 2000); // Update every 2 seconds instead of 1
    
    window.simulationTimers[`${snapshotId}-metrics`] = metricsTimer;
    
    // Auto-stop simulation after 10 seconds
    const autoStopTimer = setTimeout(() => {
      addLogEntry(logElement, '⏰ Simulation completed (10 seconds)', '#f39c12');
      stopSimulation(snapshotId);
      
      // Show post-simulation results (protocol metrics and diagram)
      if (window.showPostSimulationResults) {
        setTimeout(() => {
          window.showPostSimulationResults(snapshotId);
        }, 500);
      }
    }, 10000); // 10 seconds
    
    window.simulationTimers[`${snapshotId}-autostop`] = autoStopTimer;
    
    // Start countdown timer (silent - no log entries)
    let timeRemaining = 10;
    const countdownTimer = setInterval(() => {
      timeRemaining--;
      // No log entries for countdown - keep logs focused on call events
    }, 1000);
    
    window.simulationTimers[`${snapshotId}-countdown`] = countdownTimer;
    
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
    
    // Simulate blocking based on Erlang-B formula
    // Blocking probability increases as system approaches capacity
    const utilization = currentActiveCalls / maxCalls;
    const blockingProbability = link.blockingProb * Math.pow(utilization, 2); // Higher blocking as utilization increases
    const isBlocked = Math.random() < blockingProbability;
    
    // Debug logging for blocking
    if (Math.random() < 0.1) { // Log 10% of calls for debugging
      console.log(`Call ${callId}: utilization=${utilization.toFixed(2)}, blockingProb=${(blockingProbability * 100).toFixed(1)}%, isBlocked=${isBlocked}`);
    }
    
    const callId = (link.callId || 0) + 1;
    link.callId = callId;

    if (isBlocked) {
      // Call is blocked
      data.blockedCalls++;
      addLogEntry(logElement, `🚫 Call ${callId} BLOCKED: ${link.name} (${currentActiveCalls}/${maxCalls} capacity, ${(blockingProbability * 100).toFixed(1)}% actual blocking)`, '#e74c3c');
      return;
    }

    // Call is accepted
    data.activeCalls++;
    data.totalCalls++;
    data.bandwidthUsage += link.bandwidth;
    
    // Track peak values
    if (data.activeCalls > (data.peakActiveCalls || 0)) {
      data.peakActiveCalls = data.activeCalls;
    }
    if (data.bandwidthUsage > (data.peakBandwidthUsage || 0)) {
      data.peakBandwidthUsage = data.bandwidthUsage;
    }

    addLogEntry(logElement, `🟢 Call ${callId} started: ${link.name} (${currentActiveCalls + 1}/${maxCalls} capacity, ${link.bandwidth.toFixed(3)} Mbps)`, '#2ecc71');

    // Simulate call duration
    setTimeout(() => {
      if (data.activeCalls > 0) {
        data.activeCalls--;
        data.bandwidthUsage -= link.bandwidth;
        addLogEntry(logElement, `🔴 Call ${callId} ended: ${link.name} (${data.activeCalls}/${maxCalls} capacity)`, '#e74c3c');
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
        if (key.includes('autostop') || key.includes('countdown')) {
          clearTimeout(window.simulationTimers[key]);
        } else {
          clearInterval(window.simulationTimers[key]);
        }
        delete window.simulationTimers[key];
      }
    });
  }

  function updateSimulationMetrics(snapshotId) {
    const data = window.simulationData[snapshotId];
    if (!data) return;

    // Throttle updates to reduce DOM jitter
    if (!data.lastUpdateTime || (performance.now() - data.lastUpdateTime) > 500) {
      data.lastUpdateTime = performance.now();
      
      // Batch all DOM updates
      const updates = [];
      
      const activeCallsElement = document.getElementById(`activeCalls-${snapshotId}`);
      if (activeCallsElement) {
        updates.push(() => {
          activeCallsElement.textContent = data.activeCalls;
        });
      }

      const callRateElement = document.getElementById(`callRate-${snapshotId}`);
      if (callRateElement && data.startTime) {
        const elapsed = (performance.now() - data.startTime) / 1000;
        const rate = elapsed > 0 ? (data.totalCalls / elapsed * 60).toFixed(1) : '0.0';
        updates.push(() => {
          callRateElement.textContent = `${rate} calls/min`;
        });
      }

      const bandwidthElement = document.getElementById(`bandwidthUsage-${snapshotId}`);
      if (bandwidthElement) {
        updates.push(() => {
          bandwidthElement.textContent = `${data.bandwidthUsage.toFixed(2)} Mbps`;
        });
      }

      // Update elapsed time and progress bar
      const elapsedTimeElement = document.getElementById(`elapsedTime-${snapshotId}`);
      const progressBarElement = document.getElementById(`progressBar-${snapshotId}`);
      if (elapsedTimeElement && data.startTime) {
        const elapsed = Math.min(10, Math.floor((performance.now() - data.startTime) / 1000));
        const progressPercent = (elapsed / 10) * 100;
        updates.push(() => {
          elapsedTimeElement.textContent = `${elapsed}s / 10s`;
          if (progressBarElement) {
            progressBarElement.style.width = `${progressPercent}%`;
          }
        });
      }

      // Update blocked calls if element exists
      const blockedCallsElement = document.getElementById(`blockedCalls-${snapshotId}`);
      if (blockedCallsElement) {
        updates.push(() => {
          blockedCallsElement.textContent = data.blockedCalls || 0;
        });
      }

      // Update blocking rate if element exists
      const blockingRateElement = document.getElementById(`blockingRate-${snapshotId}`);
      if (blockingRateElement && data.totalCalls > 0) {
        const blockingRate = ((data.blockedCalls || 0) / (data.totalCalls + (data.blockedCalls || 0)) * 100).toFixed(1);
        updates.push(() => {
          blockingRateElement.textContent = `${blockingRate}%`;
        });
      }

      // Execute all updates in a single batch
      if (updates.length > 0) {
        requestAnimationFrame(() => {
          updates.forEach(update => update());
        });
      }
    }
  }

  function addLogEntry(logElement, message, color = '#000') {
    if (!logElement) return;
    
    // Create log entry
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = new Date().toLocaleTimeString() + '  ' + message;
    entry.style.color = color;
    
    // Batch log updates to reduce DOM manipulation
    if (!logElement.batchUpdates) {
      logElement.batchUpdates = [];
      logElement.batchTimeout = null;
    }
    
    logElement.batchUpdates.push(entry);
    
    // Clear existing timeout and set new one
    if (logElement.batchTimeout) {
      clearTimeout(logElement.batchTimeout);
    }
    
    logElement.batchTimeout = setTimeout(() => {
      // Add all batched entries at once
      logElement.batchUpdates.forEach(entry => {
        logElement.appendChild(entry);
      });
      
      // Clear the batch
      logElement.batchUpdates = [];
      logElement.batchTimeout = null;
      
      // Limit log entries to prevent performance issues (keep last 50 entries)
      const maxEntries = 50;
      const entries = logElement.querySelectorAll('.log-entry');
      if (entries.length > maxEntries) {
        const entriesToRemove = entries.length - maxEntries;
        for (let i = 0; i < entriesToRemove; i++) {
          entries[i].remove();
        }
      }
      
      // Smooth scroll to bottom
      if (logElement.scrollHeight > logElement.clientHeight) {
        logElement.scrollTo({
          top: logElement.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100); // Batch updates every 100ms
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