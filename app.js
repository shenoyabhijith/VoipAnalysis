// Constants
const LOCATIONS = ['US', 'China', 'UK'];

// Total outgoing traffic for each location (minutes per day)
const TOTAL_TRAFFIC = {
  'US': 12822,
  'China': 28286,
  'UK': 28000
};

const CODEC_BANDWIDTHS = {
  g711: 64,    // kbps
  g729a: 8     // kbps
};

const T1_BANDWIDTH = 1.544; // Mbps
const T1_CHANNELS = 24;
const DS0_BANDWIDTH = 0.064; // Mbps (64 kbps)
const HEADER_BANDWIDTH = (40 * 8 * 50) / 1000; // 40 bytes * 8 bits/byte * 50 pps / 1000 = 16 kbps

// Snapshots storage
let snapshots = [];
let availableModels = [];
let selectedSnapshots = new Set();

// DOM elements
const networkTypeRadios = document.querySelectorAll('input[name="networkType"]');
const codecSelect = document.getElementById('codecSelect');
const blockingProbInput = document.getElementById('blockingProb');
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const clearApiKeyBtn = document.getElementById('clearApiKeyBtn');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const compareBtn = document.getElementById('compareBtn');
const resultsSection = document.getElementById('results');

// Initialize API key and model from localStorage if available
document.addEventListener('DOMContentLoaded', () => {
  const savedApiKey = localStorage.getItem('geminiApiKey');
  const savedModel = localStorage.getItem('geminiModel');
  
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
    loadAvailableModels();
  }
  
  if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
    modelSelect.value = savedModel;
  }
  
  // Add event delegation for checkboxes
  resultsSection.addEventListener('change', (e) => {
    if (e.target.classList.contains('snapshot-checkbox')) {
      const id = e.target.dataset.snapshotId;
      if (e.target.checked) {
        selectedSnapshots.add(id);
        
        // Limit to 2 selections
        if (selectedSnapshots.size > 2) {
          // Remove the oldest selection
          const oldestId = selectedSnapshots.values().next().value;
          selectedSnapshots.delete(oldestId);
          document.querySelector(`#snapshot-${oldestId} .snapshot-checkbox`).checked = false;
        }
      } else {
        selectedSnapshots.delete(id);
      }
      updateCompareButton();
    }
  });
});

// Event listeners
networkTypeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    codecSelect.disabled = radio.value !== 'voip';
  });
});

apiKeyInput.addEventListener('input', () => {
  // Save API key to localStorage when it changes
  localStorage.setItem('geminiApiKey', apiKeyInput.value);
  
  // Load models when API key is entered
  if (apiKeyInput.value.trim()) {
    loadAvailableModels();
  }
});

modelSelect.addEventListener('change', () => {
  // Save selected model to localStorage when it changes
  localStorage.setItem('geminiModel', modelSelect.value);
});

refreshModelsBtn.addEventListener('click', loadAvailableModels);

clearApiKeyBtn.addEventListener('click', () => {
  apiKeyInput.value = '';
  localStorage.removeItem('geminiApiKey');
  modelSelect.innerHTML = '<option value="">Enter API key to load models</option>';
});

runBtn.addEventListener('click', runAnalysis);
clearBtn.addEventListener('click', clearSnapshots);
compareBtn.addEventListener('click', compareSelected);

// Functions
async function loadAvailableModels() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    modelSelect.innerHTML = '<option value="">Enter API key to load models</option>';
    return;
  }
  
  // Show loading state
  modelSelect.innerHTML = '<option value="">Loading models...</option>';
  modelSelect.disabled = true;
  refreshModelsBtn.disabled = true;
  
  try {
    // Fetch available models from Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      throw new Error(`Failed to load models: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter for models that support generateContent
    availableModels = data.models.filter(model => 
      model.supportedGenerationMethods && 
      model.supportedGenerationMethods.includes('generateContent')
    );
    
    // Populate model dropdown
    modelSelect.innerHTML = '';
    availableModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.name.split('/').pop(); // Extract model name from full resource name
      option.textContent = model.displayName || option.value;
      modelSelect.appendChild(option);
    });
    
    // Restore saved model if available
    const savedModel = localStorage.getItem('geminiModel');
    if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
      modelSelect.value = savedModel;
    }
    
  } catch (error) {
    modelSelect.innerHTML = '<option value="">Failed to load models</option>';
    console.error('Error loading models:', error);
  } finally {
    modelSelect.disabled = false;
    refreshModelsBtn.disabled = false;
  }
}

function generateTrafficMatrix() {
  // Create a 3x3 matrix where each location's outgoing traffic is split equally to the other two
  const matrix = [
    [0, 0, 0],  // From US
    [0, 0, 0],  // From China
    [0, 0, 0]   // From UK
  ];
  
  for (let i = 0; i < LOCATIONS.length; i++) {
    const location = LOCATIONS[i];
    const totalOutgoing = TOTAL_TRAFFIC[location];
    const splitAmount = totalOutgoing / 2;
    
    for (let j = 0; j < LOCATIONS.length; j++) {
      if (i === j) continue; // Skip self-links
      
      matrix[i][j] = splitAmount;
    }
  }
  
  return matrix;
}

function erlangB(erlangs, blockingProb) {
  // Exact Erlang-B calculation using recursive formula
  // B(E, m) = (E * B(E, m-1)) / (m + E * B(E, m-1))
  // Starting with B(E, 0) = 1
  
  if (erlangs === 0) return 0; // No traffic requires no circuits
  
  let B = 1; // B(E,0) = 1
  
  for (let m = 1; m <= 10000; m++) { // Set a high limit to avoid infinite loop
    B = (erlangs * B) / (m + erlangs * B);
    
    if (B <= blockingProb) {
      return m;
    }
  }
  
  // If we get here, we didn't find a solution within 10000 circuits
  return 10000;
}

function calculateTrafficData(networkType, codec, blockingProb) {
  const results = [];
  const trafficMatrix = generateTrafficMatrix();
  
  // Calculate traffic for each link
  for (let i = 0; i < LOCATIONS.length; i++) {
    for (let j = 0; j < LOCATIONS.length; j++) {
      if (i === j) continue; // Skip self-links
      
      const dailyMinutes = trafficMatrix[i][j];
      
      // Skip zero traffic links to avoid division-by-zero
      if (dailyMinutes === 0) continue;
      
      // Busy-hour Erlangs = dailyMinutes × 0.17 / 60
      const busyHourErlangs = dailyMinutes * 0.17 / 60;
      
      const linkData = {
        from: LOCATIONS[i],
        to: LOCATIONS[j],
        dailyMinutes: dailyMinutes,
        busyHourErlangs: busyHourErlangs
      };
      
      if (networkType === 'pstn') {
        // PSTN calculations
        const requiredCircuits = erlangB(busyHourErlangs, blockingProb);
        const t1Count = Math.ceil(requiredCircuits / T1_CHANNELS);
        const bandwidthMbps = t1Count * T1_BANDWIDTH;
        
        linkData.requiredCircuits = requiredCircuits;
        linkData.t1Count = t1Count;
        linkData.bandwidthMbps = bandwidthMbps;
      } else {
        // VoIP calculations
        const codecBandwidth = CODEC_BANDWIDTHS[codec];
        const totalBandwidthPerCall = codecBandwidth + HEADER_BANDWIDTH; // kbps
        const totalBandwidthMbps = (busyHourErlangs * totalBandwidthPerCall) / 1000;
        
        linkData.codec = codec;
        linkData.codecBandwidth = codecBandwidth;
        linkData.headerBandwidth = HEADER_BANDWIDTH;
        linkData.totalBandwidthPerCall = totalBandwidthPerCall;
        linkData.totalBandwidthMbps = totalBandwidthMbps;
      }
      
      results.push(linkData);
    }
  }
  
  return results;
}

function generateSvgDiagram(linkData) {
  const width = 600;
  const height = 500;
  const radius = 40;
  
  // Calculate positions for equilateral triangle
  const centerX = width / 2;
  const centerY = height / 2;
  const triangleRadius = Math.min(width, height) * 0.35;
  
  const positions = [
    { x: centerX, y: centerY - triangleRadius }, // US (top)
    { x: centerX - triangleRadius * Math.cos(Math.PI/6), y: centerY + triangleRadius * Math.sin(Math.PI/6) }, // China (bottom left)
    { x: centerX + triangleRadius * Math.cos(Math.PI/6), y: centerY + triangleRadius * Math.sin(Math.PI/6) }  // UK (bottom right)
  ];
  
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  
  // Draw links
  linkData.forEach(link => {
    const fromIndex = LOCATIONS.indexOf(link.from);
    const toIndex = LOCATIONS.indexOf(link.to);
    
    const fromPos = positions[fromIndex];
    const toPos = positions[toIndex];
    
    // Calculate midpoint for label
    const midX = (fromPos.x + toPos.x) / 2;
    const midY = (fromPos.y + toPos.y) / 2;
    
    // Calculate perpendicular offset for label to avoid overlap
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const offsetX = -dy / length * 25;
    const offsetY = dx / length * 25;
    
    // Draw line
    svg += `<line x1="${fromPos.x}" y1="${fromPos.y}" x2="${toPos.x}" y2="${toPos.y}" stroke="#1976d2" stroke-width="3"/>`;
    
    // Draw bandwidth label with background for better visibility
    const bandwidthText = link.bandwidthMbps ? 
      `${link.bandwidthMbps.toFixed(2)} Mbps` : 
      `${link.totalBandwidthMbps.toFixed(2)} Mbps`;
    
    svg += `<rect x="${midX + offsetX - 45}" y="${midY + offsetY - 12}" width="90" height="24" rx="4" fill="white" stroke="#1976d2" stroke-width="1"/>`;
    svg += `<text x="${midX + offsetX}" y="${midY + offsetY + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#1976d2">${bandwidthText}</text>`;
  });
  
  // Draw nodes
  positions.forEach((pos, index) => {
    // Draw circle with border
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${radius}" fill="white" stroke="#1976d2" stroke-width="3"/>`;
    
    // Draw label with background for better visibility
    svg += `<rect x="${pos.x - 25}" y="${pos.y - 10}" width="50" height="20" rx="3" fill="white"/>`;
    svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" dominant-baseline="middle" font-size="16" font-weight="bold" fill="#1976d2">${LOCATIONS[index]}</text>`;
  });
  
  svg += '</svg>';
  
  return svg;
}

function renderTable(id, headers, rows) {
  let table = `<table id="${id}">`;
  
  // Add header row
  table += '<thead><tr>';
  headers.forEach(header => {
    table += `<th>${header}</th>`;
  });
  table += '</tr></thead>';
  
  // Add data rows
  table += '<tbody>';
  rows.forEach(row => {
    table += '<tr>';
    row.forEach((cell, index) => {
      const isNumeric = typeof cell === 'number' || (typeof cell === 'string' && !isNaN(cell));
      table += `<td class="${isNumeric ? 'numeric' : ''}">${cell}</td>`;
    });
    table += '</tr>';
  });
  table += '</tbody></table>';
  
  return table;
}

function renderSvgDiagram(linkData) {
  return `<div class="diagram-container">${generateSvgDiagram(linkData)}</div>`;
}

function renderSummary(text) {
  return `<p>${text}</p>`;
}

function simpleMarkdownToHtml(markdown) {
    // Simple markdown to HTML converter for basic formatting
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*)\*/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]*)`/g, '<code>$1</code>');
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Tables - NEW IMPLEMENTATION
    // First, identify and process tables
    const tableRegex = /(\|.*\|[\r\n]+)+/g;
    html = html.replace(tableRegex, (match) => {
      const lines = match.trim().split('\n');
      const headerLine = lines[0];
      const separatorLine = lines[1];
      const dataLines = lines.slice(2);
      
      // Extract headers
      const headers = headerLine.split('|').slice(1, -1).map(h => h.trim());
      
      // Extract data rows
      const rows = dataLines.map(line => 
        line.split('|').slice(1, -1).map(cell => cell.trim())
      );
      
      // Build HTML table
      let tableHtml = '<table><thead><tr>';
      headers.forEach(header => {
        tableHtml += `<th>${header}</th>`;
      });
      tableHtml += '</tr></thead><tbody>';
      
      rows.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(cell => {
          tableHtml += `<td>${cell}</td>`;
        });
        tableHtml += '</tr>';
      });
      
      tableHtml += '</tbody></table>';
      return tableHtml;
    });
    
    // Unordered lists
    html = html.replace(/^(.*)$/gim, function(match, content) {
      if (content.trim().startsWith('- ')) {
        return '<li>' + content.trim().substring(2) + '</li>';
      }
      return match;
    });
    
    // Wrap consecutive list items in ul tags
    html = html.replace(/(<li>.*<\/li>)(?=<li>)/g, '$1');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Ordered lists
    html = html.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>');
    
    // Wrap consecutive ordered list items in ol tags
    html = html.replace(/(<li>.*<\/li>)(?=<li>)/g, '$1');
    html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Fix nested lists
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/<\/ol>\s*<ol>/g, '');
    
    return html;
  }
  
  async function getAiComparisonSummary(snapshot1, snapshot2) {
    const apiKey = apiKeyInput.value.trim();
    const selectedModel = modelSelect.value;
    
    if (!apiKey) {
      resultsSection.innerHTML += '<div class="error-message">Please enter a Gemini API key to get AI comparison summary.</div>';
      return;
    }
    
    if (!selectedModel) {
      resultsSection.innerHTML += '<div class="error-message">Please select a model to get AI comparison summary.</div>';
      return;
    }
    
    // Show loading state
    const aiSummaryBtn = document.getElementById('getAiSummaryBtn');
    const originalText = aiSummaryBtn.textContent;
    aiSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating Summary...';
    aiSummaryBtn.disabled = true;
    
    try {
      // Format the data for the LLM
      let prompt = `Please provide a comparison summary of the following two network traffic analyses:\n\n`;
      
      // First snapshot
      prompt += `ANALYSIS 1:\n`;
      prompt += `Network Type: ${snapshot1.networkType.toUpperCase()}\n`;
      prompt += `Timestamp: ${snapshot1.timestamp}\n`;
      prompt += `Blocking Probability: ${snapshot1.blockingProb}\n`;
      
      if (snapshot1.networkType === 'pstn') {
        prompt += `PSTN Analysis Results:\n`;
        prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Required Circuits | T-1 Count | Bandwidth (Mbps) |\n`;
        
        snapshot1.trafficData.forEach(link => {
          prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.requiredCircuits} | ${link.t1Count} | ${link.bandwidthMbps.toFixed(2)} |\n`;
        });
      } else {
        prompt += `VoIP Analysis Results:\n`;
        prompt += `Codec: ${snapshot1.codec.toUpperCase()}\n`;
        prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Bandwidth per Call (kbps) | Total Bandwidth (Mbps) |\n`;
        
        snapshot1.trafficData.forEach(link => {
          prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.totalBandwidthPerCall.toFixed(0)} | ${link.totalBandwidthMbps.toFixed(2)} |\n`;
        });
      }
      
      // Second snapshot
      prompt += `\nANALYSIS 2:\n`;
      prompt += `Network Type: ${snapshot2.networkType.toUpperCase()}\n`;
      prompt += `Timestamp: ${snapshot2.timestamp}\n`;
      prompt += `Blocking Probability: ${snapshot2.blockingProb}\n`;
      
      if (snapshot2.networkType === 'pstn') {
        prompt += `PSTN Analysis Results:\n`;
        prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Required Circuits | T-1 Count | Bandwidth (Mbps) |\n`;
        
        snapshot2.trafficData.forEach(link => {
          prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.requiredCircuits} | ${link.t1Count} | ${link.bandwidthMbps.toFixed(2)} |\n`;
        });
      } else {
        prompt += `VoIP Analysis Results:\n`;
        prompt += `Codec: ${snapshot2.codec.toUpperCase()}\n`;
        prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Bandwidth per Call (kbps) | Total Bandwidth (Mbps) |\n`;
        
        snapshot2.trafficData.forEach(link => {
          prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.totalBandwidthPerCall.toFixed(0)} | ${link.totalBandwidthMbps.toFixed(2)} |\n`;
        });
      }
      
      // Add explanations if available
      if (snapshot1.explanation) {
        prompt += `\nANALYSIS 1 EXPLANATION (${snapshot1.modelUsed}):\n${snapshot1.explanation}\n`;
      }
      
      if (snapshot2.explanation) {
        prompt += `\nANALYSIS 2 EXPLANATION (${snapshot2.modelUsed}):\n${snapshot2.explanation}\n`;
      }
      
      prompt += `\nPlease provide a comprehensive comparison summary that:\n`;
      prompt += `1. Highlights the key differences between these two analyses\n`;
      prompt += `2. Explains what these differences mean in practical terms\n`;
      prompt += `3. Provides insights about network performance implications\n`;
      prompt += `4. Offers recommendations based on the comparison\n`;
      prompt += `5. Uses markdown formatting for better readability, including tables for comparing metrics\n`;
      prompt += `6. IMPORTANT: Do not ask questions or offer additional assistance at the end. Just provide the summary and conclude.\n`;
      
      // Make API request to Gemini with the selected model
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API request failed with status ${response.status}: ${errorData.error.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      // Check if the response has the expected structure
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        throw new Error('Invalid response structure from Gemini API');
      }
      
      let summary = data.candidates[0].content.parts[0].text;
      
      // Remove any questions at the end of the summary
      // Look for patterns like "Do you want me to..." or "Would you like me to..."
      summary = summary.replace(/\n\nDo you want me to[\s\S]*$/gm, '');
      summary = summary.replace(/\n\nWould you like me to[\s\S]*$/gm, '');
      summary = summary.replace(/\n\nShould I[\s\S]*$/gm, '');
      summary = summary.replace(/\n\nLet me know if[\s\S]*$/gm, '');
      
      // Display the AI comparison summary
      const summaryHtml = `
        <div class="explanation-section" id="ai-comparison-summary">
          <div class="explanation-header">
            <h3>AI Comparison Summary (${selectedModel})</h3>
          </div>
          <div class="explanation-content">${simpleMarkdownToHtml(summary)}</div>
        </div>
      `;
      
      // Remove the AI summary button
      aiSummaryBtn.remove();
      
      // Add the summary
      const comparisonSection = document.getElementById('comparison');
      comparisonSection.insertAdjacentHTML('beforeend', summaryHtml);
      
    } catch (error) {
      resultsSection.innerHTML += `<div class="error-message">Error generating AI comparison summary: ${error.message}</div>`;
    } finally {
      // Reset button state
      if (aiSummaryBtn) {
        aiSummaryBtn.textContent = originalText;
        aiSummaryBtn.disabled = false;
      }
    }
  }

function updateCompareButton() {
  const count = selectedSnapshots.size;
  compareBtn.textContent = `Compare Selected (${count}/2)`;
  compareBtn.disabled = count !== 2;
}

function runAnalysis() {
  // Get input values
  const networkType = document.querySelector('input[name="networkType"]:checked').value;
  const codec = codecSelect.value;
  const blockingProb = parseFloat(blockingProbInput.value);
  
  // Validate inputs
  if (isNaN(blockingProb) || blockingProb < 0.001 || blockingProb > 0.1) {
    resultsSection.innerHTML = '<div class="error-message">Please enter a valid blocking probability between 0.001 and 0.1</div>';
    return;
  }
  
  // Calculate traffic data
  const trafficData = calculateTrafficData(networkType, codec, blockingProb);
  
  // Create snapshot with unique ID
  const timestamp = new Date().toLocaleString();
  const snapshot = {
    id: Date.now() + '-' + Math.floor(Math.random() * 1000), // Unique ID with random suffix
    timestamp,
    networkType,
    codec,
    blockingProb,
    trafficData,
    explanation: null,
    modelUsed: null
  };
  
  snapshots.push(snapshot);
  
  // Render results
  renderSnapshot(snapshot);
  
  // Show comparison instructions if this is the first snapshot
  const comparisonInstructions = document.getElementById('comparisonInstructions');
  if (snapshots.length === 1 && comparisonInstructions) {
    comparisonInstructions.style.display = 'block';
  }
  
  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function renderSnapshot(snapshot) {
  const { id, timestamp, networkType, codec, blockingProb, trafficData, explanation, modelUsed } = snapshot;
  
  // Check if this snapshot is already rendered
  const existingSnapshot = document.getElementById(`snapshot-${id}`);
  if (existingSnapshot) {
    // Update the existing snapshot instead of creating a new one
    existingSnapshot.innerHTML = '';
  } else {
    // Create a new snapshot section
    const snapshotSection = document.createElement('section');
    snapshotSection.id = `snapshot-${id}`;
    snapshotSection.className = 'snapshot';
    resultsSection.appendChild(snapshotSection);
  }
  
  const snapshotElement = document.getElementById(`snapshot-${id}`);
  
  let snapshotHtml = '<div class="snapshot-header">';
  snapshotHtml += `<input type="checkbox" class="snapshot-checkbox" data-snapshot-id="${id}" ${selectedSnapshots.has(id) ? 'checked' : ''}>`;
  snapshotHtml += `<h2>${networkType.toUpperCase()} Analysis</h2>`;
  snapshotHtml += `<span class="timestamp">${timestamp}</span>`;
  snapshotHtml += '</div>';
  
  if (networkType === 'pstn') {
    // PSTN table
    const headers = ['From', 'To', 'Daily Minutes', 'Busy Hour Erlangs', 'Required Circuits', 'T-1 Count', 'Bandwidth (Mbps)'];
    const rows = trafficData.map(link => [
      link.from,
      link.to,
      link.dailyMinutes.toLocaleString(),
      link.busyHourErlangs.toFixed(2),
      link.requiredCircuits,
      link.t1Count,
      link.bandwidthMbps.toFixed(2)
    ]);
    
    snapshotHtml += renderTable(`pstn-table-${id}`, headers, rows);
    snapshotHtml += renderSummary(`Blocking Probability: ${blockingProb}`);
  } else {
    // VoIP table
    const headers = ['From', 'To', 'Daily Minutes', 'Busy Hour Erlangs', 'Codec', 'Bandwidth per Call (kbps)', 'Total Bandwidth (Mbps)'];
    const rows = trafficData.map(link => [
      link.from,
      link.to,
      link.dailyMinutes.toLocaleString(),
      link.busyHourErlangs.toFixed(2),
      link.codec.toUpperCase(),
      link.totalBandwidthPerCall.toFixed(0),
      link.totalBandwidthMbps.toFixed(2)
    ]);
    
    snapshotHtml += renderTable(`voip-table-${id}`, headers, rows);
    snapshotHtml += renderSummary(`Codec: ${codec.toUpperCase()}, Blocking Probability: ${blockingProb}`);
  }
  
  // Add diagram
  snapshotHtml += renderSvgDiagram(trafficData);
  
  // Add explanation if available
  if (explanation) {
    snapshotHtml += `
      <div class="explanation-section" id="explanation-${id}">
        <div class="explanation-header">
          <h3>AI Explanation (${modelUsed})</h3>
          <button class="close-explanation" data-snapshot-id="${id}">×</button>
        </div>
        <div class="explanation-content">${simpleMarkdownToHtml(explanation)}</div>
      </div>
    `;
  }
  
  // Add explain button if API key is provided and no explanation exists
  if (apiKeyInput.value.trim() && !explanation) {
    snapshotHtml += `<button id="explain-btn-${id}" class="secondary" data-snapshot-id="${id}">Explain Results</button>`;
  }
  
  snapshotElement.innerHTML = snapshotHtml;
  
  // Add event listener to the explain button
  const explainBtn = document.getElementById(`explain-btn-${id}`);
  if (explainBtn) {
    explainBtn.addEventListener('click', () => explainResults(id));
  }
  
  // Add event listener to close button if explanation exists
  const closeBtn = document.querySelector(`#explanation-${id} .close-explanation`);
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      // Remove explanation from snapshot
      const snapshotIndex = snapshots.findIndex(s => s.id === id);
      if (snapshotIndex !== -1) {
        snapshots[snapshotIndex].explanation = null;
        snapshots[snapshotIndex].modelUsed = null;
      }
      
      // Re-render the snapshot without the explanation
      renderSnapshot(snapshots[snapshotIndex]);
    });
  }
}

async function explainResults(snapshotId) {
  const snapshot = snapshots.find(s => s.id === snapshotId);
  if (!snapshot) return;
  
  const apiKey = apiKeyInput.value.trim();
  const selectedModel = modelSelect.value;
  
  if (!apiKey) {
    resultsSection.innerHTML += '<div class="error-message">Please enter a Gemini API key to explain results.</div>';
    return;
  }
  
  if (!selectedModel) {
    resultsSection.innerHTML += '<div class="error-message">Please select a model to explain results.</div>';
    return;
  }
  
  // Show loading state
  const explainBtn = document.getElementById(`explain-btn-${snapshotId}`);
  const originalText = explainBtn.textContent;
  explainBtn.innerHTML = '<span class="loading-spinner"></span> Explaining...';
  explainBtn.disabled = true;
  
  try {
    // Format the data for the LLM
    let prompt = `Explain the following network traffic analysis results in simple terms:\n\n`;
    prompt += `Network Type: ${snapshot.networkType.toUpperCase()}\n`;
    prompt += `Blocking Probability: ${snapshot.blockingProb}\n\n`;
    
    if (snapshot.networkType === 'pstn') {
      prompt += `PSTN Analysis Results:\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Required Circuits | T-1 Count | Bandwidth (Mbps) |\n`;
      
      snapshot.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.requiredCircuits} | ${link.t1Count} | ${link.bandwidthMbps.toFixed(2)} |\n`;
      });
    } else {
      prompt += `VoIP Analysis Results:\n`;
      prompt += `Codec: ${snapshot.codec.toUpperCase()}\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Bandwidth per Call (kbps) | Total Bandwidth (Mbps) |\n`;
      
      snapshot.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.totalBandwidthPerCall.toFixed(0)} | ${link.totalBandwidthMbps.toFixed(2)} |\n`;
      });
    }
    
    prompt += `\nPlease provide a clear explanation of these results, including what the numbers mean and any insights about the network performance. Use markdown formatting for better readability.`;
    
    // Make API request to Gemini with the selected model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API request failed with status ${response.status}: ${errorData.error.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    
    // Check if the response has the expected structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response structure from Gemini API');
    }
    
    const explanation = data.candidates[0].content.parts[0].text;
    
    // Update snapshot with explanation
    const snapshotIndex = snapshots.findIndex(s => s.id === snapshotId);
    if (snapshotIndex !== -1) {
      snapshots[snapshotIndex].explanation = explanation;
      snapshots[snapshotIndex].modelUsed = selectedModel;
    }
    
    // Re-render the snapshot to include the explanation
    renderSnapshot(snapshots[snapshotIndex]);
    
  } catch (error) {
    resultsSection.innerHTML += `<div class="error-message">Error explaining results: ${error.message}</div>`;
    
    // Reset button state
    explainBtn.textContent = originalText;
    explainBtn.disabled = false;
  }
}

function clearSnapshots() {
  snapshots = [];
  selectedSnapshots.clear();
  resultsSection.innerHTML = '';
  updateCompareButton();
  
  // Hide comparison instructions when all snapshots are cleared
  const comparisonInstructions = document.getElementById('comparisonInstructions');
  if (comparisonInstructions) {
    comparisonInstructions.style.display = 'none';
  }
}

async function compareSelected() {
  if (selectedSnapshots.size !== 2) {
    resultsSection.innerHTML = '<div class="error-message">Please select exactly two snapshots to compare.</div>';
    return;
  }
  
  const selectedIds = Array.from(selectedSnapshots);
  const snapshot1 = snapshots.find(s => s.id === selectedIds[0]);
  const snapshot2 = snapshots.find(s => s.id === selectedIds[1]);
  
  if (!snapshot1 || !snapshot2) {
    resultsSection.innerHTML = '<div class="error-message">Selected snapshots not found.</div>';
    return;
  }
  
  // Create comparison section
  let comparisonHtml = '<section id="comparison"><h2>Comparison of Selected Analyses</h2>';
  
  // Add comparison tables
  if (snapshot1.networkType === snapshot2.networkType) {
    // Same network type comparison
    if (snapshot1.networkType === 'pstn') {
      comparisonHtml += '<h3>PSTN Comparison</h3>';
      
      const headers = ['From', 'To', 'Snapshot', 'Daily Minutes', 'Busy Hour Erlangs', 'Required Circuits', 'T-1 Count', 'Bandwidth (Mbps)'];
      const rows = [];
      
      // Add rows for first snapshot
      snapshot1.trafficData.forEach(link => {
        rows.push([
          link.from,
          link.to,
          `1 (${snapshot1.timestamp})`,
          link.dailyMinutes.toLocaleString(),
          link.busyHourErlangs.toFixed(2),
          link.requiredCircuits.toString(),
          link.t1Count.toString(),
          link.bandwidthMbps.toFixed(2)
        ]);
      });
      
      // Add rows for second snapshot
      snapshot2.trafficData.forEach(link => {
        rows.push([
          link.from,
          link.to,
          `2 (${snapshot2.timestamp})`,
          link.dailyMinutes.toLocaleString(),
          link.busyHourErlangs.toFixed(2),
          link.requiredCircuits.toString(),
          link.t1Count.toString(),
          link.bandwidthMbps.toFixed(2)
        ]);
      });
      
      comparisonHtml += renderTable('pstn-comparison', headers, rows);
    } else {
      comparisonHtml += '<h3>VoIP Comparison</h3>';
      
      const headers = ['From', 'To', 'Snapshot', 'Daily Minutes', 'Busy Hour Erlangs', 'Codec', 'Bandwidth per Call (kbps)', 'Total Bandwidth (Mbps)'];
      const rows = [];
      
      // Add rows for first snapshot
      snapshot1.trafficData.forEach(link => {
        rows.push([
          link.from,
          link.to,
          `1 (${snapshot1.timestamp})`,
          link.dailyMinutes.toLocaleString(),
          link.busyHourErlangs.toFixed(2),
          link.codec.toUpperCase(),
          link.totalBandwidthPerCall.toFixed(0),
          link.totalBandwidthMbps.toFixed(2)
        ]);
      });
      
      // Add rows for second snapshot
      snapshot2.trafficData.forEach(link => {
        rows.push([
          link.from,
          link.to,
          `2 (${snapshot2.timestamp})`,
          link.dailyMinutes.toLocaleString(),
          link.busyHourErlangs.toFixed(2),
          link.codec.toUpperCase(),
          link.totalBandwidthPerCall.toFixed(0),
          link.totalBandwidthMbps.toFixed(2)
        ]);
      });
      
      comparisonHtml += renderTable('voip-comparison', headers, rows);
    }
  } else {
    // Different network types - show both tables
    comparisonHtml += '<h3>PSTN Analysis</h3>';
    
    const pstnSnapshot = snapshot1.networkType === 'pstn' ? snapshot1 : snapshot2;
    const pstnHeaders = ['From', 'To', 'Daily Minutes', 'Busy Hour Erlangs', 'Required Circuits', 'T-1 Count', 'Bandwidth (Mbps)'];
    const pstnRows = pstnSnapshot.trafficData.map(link => [
      link.from,
      link.to,
      link.dailyMinutes.toLocaleString(),
      link.busyHourErlangs.toFixed(2),
      link.requiredCircuits,
      link.t1Count,
      link.bandwidthMbps.toFixed(2)
    ]);
    
    comparisonHtml += renderTable('pstn-comparison', pstnHeaders, pstnRows);
    
    comparisonHtml += '<h3>VoIP Analysis</h3>';
    
    const voipSnapshot = snapshot1.networkType === 'voip' ? snapshot1 : snapshot2;
    const voipHeaders = ['From', 'To', 'Daily Minutes', 'Busy Hour Erlangs', 'Codec', 'Bandwidth per Call (kbps)', 'Total Bandwidth (Mbps)'];
    const voipRows = voipSnapshot.trafficData.map(link => [
      link.from,
      link.to,
      link.dailyMinutes.toLocaleString(),
      link.busyHourErlangs.toFixed(2),
      link.codec.toUpperCase(),
      link.totalBandwidthPerCall.toFixed(0),
      link.totalBandwidthMbps.toFixed(2)
    ]);
    
    comparisonHtml += renderTable('voip-comparison', voipHeaders, voipRows);
  }
  
  // Add explanations comparison if available
  const explanations = [];
  if (snapshot1.explanation) {
    explanations.push({
      title: `${snapshot1.networkType.toUpperCase()} Analysis (${snapshot1.timestamp}) - ${snapshot1.modelUsed}`,
      content: snapshot1.explanation
    });
  }
  
  if (snapshot2.explanation) {
    explanations.push({
      title: `${snapshot2.networkType.toUpperCase()} Analysis (${snapshot2.timestamp}) - ${snapshot2.modelUsed}`,
      content: snapshot2.explanation
    });
  }
  
  if (explanations.length > 0) {
    comparisonHtml += '<h3>AI Explanations</h3>';
    
    explanations.forEach(explanation => {
      comparisonHtml += `
        <div class="explanation-section">
          <div class="explanation-header">
            <h4>${explanation.title}</h4>
          </div>
          <div class="explanation-content">${simpleMarkdownToHtml(explanation.content)}</div>
        </div>
      `;
    });
  }
  
  // Add AI comparison summary button if API key is available
  if (apiKeyInput.value.trim()) {
    comparisonHtml += `<button id="getAiSummaryBtn" class="secondary">Get AI Comparison Summary</button>`;
  }
  
  comparisonHtml += '</section>';
  
  resultsSection.innerHTML += comparisonHtml;
  
  // Add event listener to AI summary button
  const aiSummaryBtn = document.getElementById('getAiSummaryBtn');
  if (aiSummaryBtn) {
    aiSummaryBtn.addEventListener('click', () => getAiComparisonSummary(snapshot1, snapshot2));
  }
  
  // Scroll to comparison
  document.getElementById('comparison').scrollIntoView({ behavior: 'smooth' });
}

async function getAiComparisonSummary(snapshot1, snapshot2) {
  const apiKey = apiKeyInput.value.trim();
  const selectedModel = modelSelect.value;
  
  if (!apiKey) {
    resultsSection.innerHTML += '<div class="error-message">Please enter a Gemini API key to get AI comparison summary.</div>';
    return;
  }
  
  if (!selectedModel) {
    resultsSection.innerHTML += '<div class="error-message">Please select a model to get AI comparison summary.</div>';
    return;
  }
  
  // Show loading state
  const aiSummaryBtn = document.getElementById('getAiSummaryBtn');
  const originalText = aiSummaryBtn.textContent;
  aiSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating Summary...';
  aiSummaryBtn.disabled = true;
  
  try {
    // Format the data for the LLM
    let prompt = `Please provide a comparison summary of the following two network traffic analyses:\n\n`;
    
    // First snapshot
    prompt += `ANALYSIS 1:\n`;
    prompt += `Network Type: ${snapshot1.networkType.toUpperCase()}\n`;
    prompt += `Timestamp: ${snapshot1.timestamp}\n`;
    prompt += `Blocking Probability: ${snapshot1.blockingProb}\n`;
    
    if (snapshot1.networkType === 'pstn') {
      prompt += `PSTN Analysis Results:\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Required Circuits | T-1 Count | Bandwidth (Mbps) |\n`;
      
      snapshot1.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.requiredCircuits} | ${link.t1Count} | ${link.bandwidthMbps.toFixed(2)} |\n`;
      });
    } else {
      prompt += `VoIP Analysis Results:\n`;
      prompt += `Codec: ${snapshot1.codec.toUpperCase()}\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Bandwidth per Call (kbps) | Total Bandwidth (Mbps) |\n`;
      
      snapshot1.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.totalBandwidthPerCall.toFixed(0)} | ${link.totalBandwidthMbps.toFixed(2)} |\n`;
      });
    }
    
    // Second snapshot
    prompt += `\nANALYSIS 2:\n`;
    prompt += `Network Type: ${snapshot2.networkType.toUpperCase()}\n`;
    prompt += `Timestamp: ${snapshot2.timestamp}\n`;
    prompt += `Blocking Probability: ${snapshot2.blockingProb}\n`;
    
    if (snapshot2.networkType === 'pstn') {
      prompt += `PSTN Analysis Results:\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Required Circuits | T-1 Count | Bandwidth (Mbps) |\n`;
      
      snapshot2.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.requiredCircuits} | ${link.t1Count} | ${link.bandwidthMbps.toFixed(2)} |\n`;
      });
    } else {
      prompt += `VoIP Analysis Results:\n`;
      prompt += `Codec: ${snapshot2.codec.toUpperCase()}\n`;
      prompt += `| From | To | Daily Minutes | Busy Hour Erlangs | Bandwidth per Call (kbps) | Total Bandwidth (Mbps) |\n`;
      
      snapshot2.trafficData.forEach(link => {
        prompt += `| ${link.from} | ${link.to} | ${link.dailyMinutes.toLocaleString()} | ${link.busyHourErlangs.toFixed(2)} | ${link.totalBandwidthPerCall.toFixed(0)} | ${link.totalBandwidthMbps.toFixed(2)} |\n`;
      });
    }
    
    // Add explanations if available
    if (snapshot1.explanation) {
      prompt += `\nANALYSIS 1 EXPLANATION (${snapshot1.modelUsed}):\n${snapshot1.explanation}\n`;
    }
    
    if (snapshot2.explanation) {
      prompt += `\nANALYSIS 2 EXPLANATION (${snapshot2.modelUsed}):\n${snapshot2.explanation}\n`;
    }
    
    prompt += `\nPlease provide a comprehensive comparison summary that:\n`;
    prompt += `1. Highlights the key differences between these two analyses\n`;
    prompt += `2. Explains what these differences mean in practical terms\n`;
    prompt += `3. Provides insights about network performance implications\n`;
    prompt += `4. Offers recommendations based on the comparison\n`;
    prompt += `5. Uses markdown formatting for better readability\n`;
    
    // Make API request to Gemini with the selected model
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API request failed with status ${response.status}: ${errorData.error.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    
    // Check if the response has the expected structure
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      throw new Error('Invalid response structure from Gemini API');
    }
    
    const summary = data.candidates[0].content.parts[0].text;
    
    // Display the AI comparison summary
    const summaryHtml = `
      <div class="explanation-section" id="ai-comparison-summary">
        <div class="explanation-header">
          <h3>AI Comparison Summary (${selectedModel})</h3>
        </div>
        <div class="explanation-content">${simpleMarkdownToHtml(summary)}</div>
      </div>
    `;
    
    // Remove the AI summary button
    aiSummaryBtn.remove();
    
    // Add the summary
    const comparisonSection = document.getElementById('comparison');
    comparisonSection.insertAdjacentHTML('beforeend', summaryHtml);
    
  } catch (error) {
    resultsSection.innerHTML += `<div class="error-message">Error generating AI comparison summary: ${error.message}</div>`;
  } finally {
    // Reset button state
    if (aiSummaryBtn) {
      aiSummaryBtn.textContent = originalText;
      aiSummaryBtn.disabled = false;
    }
  }
}