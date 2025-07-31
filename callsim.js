(() => {
  // Global simulation state - support multiple simultaneous simulations
  window.simulationData = {};
  window.simulationTimers = {};
  window.simulationMetrics = {};
  window.runningSimulations = new Set(); // Track all running simulations

  // Utility function for factorial calculation
  function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  // Proper Erlang-B formula implementation
  function erlangBBlocking(offeredLoad, capacity) {
    // Erlang-B formula: B(E,m) = (E^m/m!) / Σ(i=0 to m) (E^i/i!)
    let numerator = Math.pow(offeredLoad, capacity) / factorial(capacity);
    let denominator = 0;
    
    for (let i = 0; i <= capacity; i++) {
      denominator += Math.pow(offeredLoad, i) / factorial(i);
    }
    
    const result = numerator / denominator;
    
    // DEBUG: Log Erlang-B calculation
    console.log(`📊 ERLANG-B DEBUG: offeredLoad=${offeredLoad.toFixed(2)}, capacity=${capacity}, numerator=${numerator.toExponential(3)}, denominator=${denominator.toExponential(3)}, result=${(result * 100).toFixed(6)}%`);
    
    return result;
  }

  // Calculate blocking probability using proper Erlang-B
  function calculateBlockingProbability(activeCalls, maxCalls, offeredLoad) {
    // Offered load = call arrival rate × average call duration
    const currentOfferedLoad = offeredLoad * (activeCalls / maxCalls);
    const blockingProb = erlangBBlocking(currentOfferedLoad, maxCalls);
    
    // DEBUG: Log blocking calculation
    console.log(`🔍 BLOCKING DEBUG: activeCalls=${activeCalls}, maxCalls=${maxCalls}, offeredLoad=${offeredLoad.toFixed(2)}, currentOfferedLoad=${currentOfferedLoad.toFixed(2)}, blockingProb=${(blockingProb * 100).toFixed(3)}%`);
    
    return blockingProb;
  }

  // Calculate VoIP bandwidth with protocol overhead
  function calculateVoIPBandwidth(codec, includeHeaders = true) {
    const codecRates = {
      'g711': 64,    // kbps
      'g729a': 8     // kbps
    };
    
    let bandwidth = codecRates[codec] || 64;
    
    if (includeHeaders) {
      // Add protocol overhead
      const rtpHeader = 12; // bytes
      const udpHeader = 8;  // bytes
      const ipHeader = 20;  // bytes
      const ethernetHeader = 14; // bytes
      
      const totalHeaders = rtpHeader + udpHeader + ipHeader + ethernetHeader;
      const packetSize = (bandwidth * 1000) / (8 * 50); // 50 packets per second
      const overheadRatio = totalHeaders / packetSize;
      
      bandwidth *= (1 + overheadRatio);
    }
    
    return bandwidth;
  }

  // Simulate network conditions
  function simulateNetworkConditions(bandwidth) {
    // Add realistic network variations
    const jitter = Math.random() * 20; // 0-20ms jitter
    const packetLoss = Math.random() * 0.02; // 0-2% packet loss
    const delay = 50 + Math.random() * 100; // 50-150ms delay
    
    return {
      effectiveBandwidth: bandwidth * (1 - packetLoss),
      jitter,
      delay,
      packetLoss
    };
  }

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
      links: [],
      targetCallCount: 0, // Track target call count for consistency
      linkCallCounts: {} // Track calls per link
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

    // Check if this simulation is already running
    if (window.runningSimulations.has(snapshotId)) {
      console.log('Simulation already running for:', snapshotId);
      return;
    }

    // Add to running simulations set
    window.runningSimulations.add(snapshotId);
    
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

    // Start call generation using Poisson process
    links.forEach((link, index) => {
      // Generate call intervals using Poisson distribution
      const offeredLoad = link.rate; // calls per minute
      const lambda = offeredLoad / 60; // calls per second
      const simulationDuration = 20; // seconds
      
      console.log(`Setting up Poisson call generation for ${link.name} with rate: ${offeredLoad} calls/min (λ=${lambda.toFixed(3)} calls/sec)`);
      
      // Generate call arrival times using exponential distribution
      let cumulativeTime = 0;
      let callCount = 0;
      const maxCalls = Math.floor(offeredLoad * simulationDuration / 60); // Expected calls in 20 seconds
      
      const generateNextCall = () => {
        if (callCount >= maxCalls || cumulativeTime >= simulationDuration * 1000) {
          return; // Stop generating calls
        }
        
        // Exponential distribution for inter-arrival times
        const interval = -Math.log(1 - Math.random()) / lambda * 1000; // Convert to milliseconds
        cumulativeTime += interval;
        
        if (cumulativeTime <= simulationDuration * 1000) {
          console.log(`📞 CALL SCHEDULED: link=${link.name}, time=${cumulativeTime}ms, callCount=${callCount + 1}`);
          setTimeout(() => {
            console.log(`🚀 SPAWNING CALL: link=${link.name}, callCount=${callCount + 1}`);
            spawnDynamicCall(snapshotId, link, index);
            callCount++;
            generateNextCall(); // Schedule next call
          }, cumulativeTime);
        } else {
          console.log(`⏹️ CALL GENERATION COMPLETE: link=${link.name}, totalCalls=${callCount}`);
        }
      };
      
      // Start generating calls
      generateNextCall();
    });

    // Start metrics update with reduced frequency
    const metricsTimer = setInterval(() => {
      updateSimulationMetrics(snapshotId);
    }, 2000); // Update every 2 seconds instead of 1
    
    window.simulationTimers[`${snapshotId}-metrics`] = metricsTimer;
    
    // Auto-stop simulation after 20 seconds
    const autoStopTimer = setTimeout(() => {
      addLogEntry(logElement, '⏰ Simulation completed (20 seconds)', '#f39c12');
      stopSimulation(snapshotId);
      
      // Show post-simulation results (protocol metrics and diagram)
      if (window.showPostSimulationResults) {
        setTimeout(() => {
          window.showPostSimulationResults(snapshotId);
        }, 500);
      }
      
      // Enable AI summary button after simulation completes
      const explainBtn = document.getElementById(`explain-btn-${snapshotId}`);
      if (explainBtn) {
        explainBtn.disabled = false;
        explainBtn.textContent = '🤖 Explain Results';
      }
    }, 20000); // 20 seconds
    
    window.simulationTimers[`${snapshotId}-autostop`] = autoStopTimer;
    
    // Start countdown timer (silent - no log entries)
    let timeRemaining = 20;
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
    console.log(`🎯 SPAWN DYNAMIC CALL: snapshotId=${snapshotId}, link=${link.name}, linkIndex=${linkIndex}`);
    const logElement = document.getElementById(`simLog-${snapshotId}`);
    const data = window.simulationData[snapshotId];
    
    if (!data) {
      console.log(`❌ NO SIMULATION DATA: snapshotId=${snapshotId}`);
      return;
    }
    
    // Check if we can accept more calls (blocking simulation)
    const currentActiveCalls = data.activeCalls;
    const maxCalls = link.maxConcurrentCalls;
    
    // Simulate blocking using proper Erlang-B formula
    const offeredLoad = link.rate * (180 / 3600); // Convert calls/min to Erlangs (3-minute calls)
    const blockingProbability = calculateBlockingProbability(currentActiveCalls, maxCalls, offeredLoad);
    const isBlocked = Math.random() < blockingProbability;
    
    const callId = (link.callId || 0) + 1;
    link.callId = callId;
    
    // Debug logging for blocking
    if (Math.random() < 0.3) { // Log 30% of calls for debugging
      const offeredLoad = link.rate * (180 / 3600); // Convert calls/min to Erlangs
      console.log(`Call ${callId}: activeCalls=${currentActiveCalls}, maxCalls=${maxCalls}, offeredLoad=${offeredLoad.toFixed(2)}E, blockingProb=${(blockingProbability * 100).toFixed(1)}%, isBlocked=${isBlocked}`);
    }

    if (isBlocked) {
      // Call is blocked
      data.blockedCalls++;
      addLogEntry(logElement, `🚫 Call ${callId} BLOCKED: ${link.name} (${currentActiveCalls}/${maxCalls} capacity, ${(blockingProbability * 100).toFixed(1)}% actual blocking)`, '#e74c3c');
      return;
    }

    // Call is accepted
    data.activeCalls++;
    data.totalCalls++;
    
    // Track call count for this link
    if (!data.linkCallCounts[linkIndex]) {
      data.linkCallCounts[linkIndex] = 0;
    }
    data.linkCallCounts[linkIndex]++;
    
    // Calculate bandwidth with protocol overhead
    const actualBandwidth = calculateVoIPBandwidth(link.codec || 'g711', true);
    data.bandwidthUsage += actualBandwidth;
    
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
        data.bandwidthUsage -= actualBandwidth; // Use the same randomized bandwidth
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

    // Remove from running simulations set
    window.runningSimulations.delete(snapshotId);
    
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Clear all timers for this simulation
    clearSimulation(snapshotId);

    addLogEntry(logElement, '📉 Simulation stopped', '#e74c3c');
    
    // Final metrics update
    updateSimulationMetrics(snapshotId);
    
    // Enable AI summary button after simulation stops
    const explainBtn = document.getElementById(`explain-btn-${snapshotId}`);
    if (explainBtn) {
      explainBtn.disabled = false;
      explainBtn.textContent = '🤖 Explain Results';
    }
    
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
        const elapsed = Math.min(20, Math.floor((performance.now() - data.startTime) / 1000));
        const progressPercent = (elapsed / 20) * 100;
        updates.push(() => {
          elapsedTimeElement.textContent = `${elapsed}s / 20s`;
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
    // Stop all running simulations
    window.runningSimulations.forEach(snapshotId => {
      stopSimulation(snapshotId);
    });
    
    // Clear all simulation data
    Object.keys(window.simulationData).forEach(snapshotId => {
      clearSimulation(snapshotId);
    });
    window.simulationData = {};
    window.runningSimulations.clear();
  };

  // Expose initialization function for manual calls
  window.initializeSimulation = initializeSimulation;

})();