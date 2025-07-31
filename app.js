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

function updateCompareButton() {
  const count = selectedSnapshots.size;
  compareBtn.textContent = `Compare Selected (${count}/2)`;
  compareBtn.disabled = count !== 2;
}

function runAnalysis() {
  // Check if we already have 2 snapshots
  if (snapshots.length >= 2) {
    resultsSection.innerHTML = '<div class="error-message">You already have 2 analyses. Please clear existing analyses before running a new one.</div>';
    return;
  }
  
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
  
  // Auto-select both snapshots if we now have 2
  if (snapshots.length === 2) {
    selectedSnapshots.clear();
    snapshots.forEach(snapshot => {
      selectedSnapshots.add(snapshot.id);
      const checkbox = document.querySelector(`#snapshot-${snapshot.id} .snapshot-checkbox`);
      if (checkbox) checkbox.checked = true;
    });
    updateCompareButton();
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
  
  // Check if explanation already exists
  const existingExplanation = document.getElementById(`explanation-${snapshotId}`);
  if (existingExplanation) {
    existingExplanation.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  
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
    
    prompt += `\nPlease provide a comprehensive explanation with the following structure:\n\n`;
    prompt += `## Overview\n`;
    prompt += `- Brief description of the analysis type and methodology\n`;
    prompt += `- Key parameters and their significance\n\n`;
    prompt += `## Results Analysis\n`;
    prompt += `- Detailed interpretation of the traffic data\n`;
    prompt += `- What the numbers mean in practical terms\n`;
    prompt += `- Performance implications for each link\n\n`;
    prompt += `## Technical Insights\n`;
    prompt += `- Bandwidth utilization patterns\n`;
    prompt += `- Infrastructure requirements\n`;
    prompt += `- Scalability considerations\n\n`;
    prompt += `## Recommendations\n`;
    prompt += `- Implementation considerations\n`;
    prompt += `- Potential optimizations\n`;
    prompt += `- Risk factors to monitor\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Use clear, professional language\n`;
    prompt += `- Include specific insights about the data\n`;
    prompt += `- Use markdown formatting for better readability\n`;
    prompt += `- Focus on practical implications for network engineers\n`;
    prompt += `- Do not ask questions or offer additional assistance at the end\n`;
    
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

function checkIfSnapshotsAreIdentical(snapshot1, snapshot2) {
  // Check if network types are different
  if (snapshot1.networkType !== snapshot2.networkType) {
    return false;
  }
  
  // Check if blocking probabilities are different
  if (snapshot1.blockingProb !== snapshot2.blockingProb) {
    return false;
  }
  
  // For VoIP, check if codecs are different
  if (snapshot1.networkType === 'voip' && snapshot1.codec !== snapshot2.codec) {
    return false;
  }
  
  // Check if traffic data is the same
  if (snapshot1.trafficData.length !== snapshot2.trafficData.length) {
    return false;
  }
  
  for (let i = 0; i < snapshot1.trafficData.length; i++) {
    const link1 = snapshot1.trafficData[i];
    const link2 = snapshot2.trafficData[i];
    
    if (link1.from !== link2.from || link1.to !== link2.to) {
      return false;
    }
    
    if (Math.abs(link1.dailyMinutes - link2.dailyMinutes) > 0.01) {
      return false;
    }
    
    if (Math.abs(link1.busyHourErlangs - link2.busyHourErlangs) > 0.01) {
      return false;
    }
    
    if (snapshot1.networkType === 'pstn') {
      if (link1.requiredCircuits !== link2.requiredCircuits ||
          link1.t1Count !== link2.t1Count ||
          Math.abs(link1.bandwidthMbps - link2.bandwidthMbps) > 0.01) {
        return false;
      }
    } else {
      if (link1.codec !== link2.codec ||
          link1.totalBandwidthPerCall !== link2.totalBandwidthPerCall ||
          Math.abs(link1.totalBandwidthMbps - link2.totalBandwidthMbps) > 0.01) {
        return false;
      }
    }
  }
  
  return true;
}

function generateDescriptiveLabel(snapshot) {
  if (snapshot.networkType === 'pstn') {
    return `PSTN (${(snapshot.blockingProb * 100).toFixed(1)}% blocking)`;
  } else {
    return `VoIP ${snapshot.codec.toUpperCase()} (${(snapshot.blockingProb * 100).toFixed(1)}% blocking)`;
  }
}

function generateEfficiencyChart(snapshot1, snapshot2) {
    // Check if snapshots are identical
    if (checkIfSnapshotsAreIdentical(snapshot1, snapshot2)) {
      return '<div class="chart-message">The selected analyses are identical. No efficiency comparison can be made.</div>';
    }
    
    // Create a chart comparing bandwidth efficiency
    const width = 900;
    const height = 500;
    const margin = { top: 60, right: 80, bottom: 100, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Get all unique links
    const links = new Set();
    snapshot1.trafficData.forEach(link => {
      links.add(`${link.from}-${link.to}`);
    });
    snapshot2.trafficData.forEach(link => {
      links.add(`${link.from}-${link.to}`);
    });
    
    const linkArray = Array.from(links);
    
    // Find maximum bandwidth value for scaling
    let maxBandwidth = 0;
    snapshot1.trafficData.forEach(link => {
      const bandwidth = link.bandwidthMbps || link.totalBandwidthMbps;
      if (bandwidth > maxBandwidth) maxBandwidth = bandwidth;
    });
    snapshot2.trafficData.forEach(link => {
      const bandwidth = link.bandwidthMbps || link.totalBandwidthMbps;
      if (bandwidth > maxBandwidth) maxBandwidth = bandwidth;
    });
    
    // Add some padding to the max
    maxBandwidth = Math.ceil(maxBandwidth * 1.2);
    
    // Calculate bar width and spacing
    const barWidth = 35;
    const groupSpacing = 15;
    const groupWidth = barWidth * 2 + groupSpacing;
    const totalGroupsWidth = groupWidth * linkArray.length;
    const spacing = (chartWidth - totalGroupsWidth) / (linkArray.length + 1);
    
    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    
    // Add background
    svg += `<rect width="${width}" height="${height}" fill="#fafafa"/>`;
    
    // Generate descriptive labels
    const label1 = generateDescriptiveLabel(snapshot1);
    const label2 = generateDescriptiveLabel(snapshot2);
    
    // Add title
    svg += `<text x="${width/2}" y="30" text-anchor="middle" font-size="24" font-weight="bold" fill="#2c3e50">Bandwidth Efficiency Comparison</text>`;
    svg += `<text x="${width/2}" y="50" text-anchor="middle" font-size="14" fill="#7f8c8d">${label1} vs ${label2}</text>`;
    
    // Add chart area with background
    svg += `<g transform="translate(${margin.left},${margin.top})">`;
    svg += `<rect width="${chartWidth}" height="${chartHeight}" fill="white" stroke="#e0e0e0" stroke-width="1" rx="8"/>`;
    
    // Add grid lines
    for (let i = 0; i <= 5; i++) {
      const y = (i * chartHeight / 5);
      svg += `<line x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>`;
    }
    
    // Add X axis
    svg += `<line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="#34495e" stroke-width="2"/>`;
    
    // Add Y axis
    svg += `<line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="#34495e" stroke-width="2"/>`;
    
    // Add Y axis labels and tick marks
    for (let i = 0; i <= 5; i++) {
      const y = chartHeight - (i * chartHeight / 5);
      const value = (i * maxBandwidth / 5).toFixed(1);
      svg += `<line x1="-8" y1="${y}" x2="0" y2="${y}" stroke="#34495e" stroke-width="1"/>`;
      svg += `<text x="-15" y="${y+4}" text-anchor="end" font-size="12" font-weight="500" fill="#2c3e50">${value}</text>`;
    }
    
    // Add Y axis title
    svg += `<text x="-50" y="${chartHeight/2}" text-anchor="middle" font-size="14" font-weight="bold" fill="#2c3e50" transform="rotate(-90, -50, ${chartHeight/2})">Bandwidth (Mbps)</text>`;
    
    // Add bars and labels for each link
    linkArray.forEach((link, index) => {
      const x = spacing + index * (groupWidth + spacing);
      
      // Get bandwidth values for both snapshots
      let bandwidth1 = 0;
      let bandwidth2 = 0;
      
      const link1 = snapshot1.trafficData.find(l => `${l.from}-${l.to}` === link);
      if (link1) {
        bandwidth1 = link1.bandwidthMbps || link1.totalBandwidthMbps;
      }
      
      const link2 = snapshot2.trafficData.find(l => `${l.from}-${l.to}` === link);
      if (link2) {
        bandwidth2 = link2.bandwidthMbps || link2.totalBandwidthMbps;
      }
      
      // Calculate bar heights
      const height1 = (bandwidth1 / maxBandwidth) * chartHeight;
      const height2 = (bandwidth2 / maxBandwidth) * chartHeight;
      
      // Draw bars with rounded corners and shadows
      svg += `<rect x="${x}" y="${chartHeight - height1}" width="${barWidth}" height="${height1}" fill="#3498db" rx="3" ry="3"/>`;
      svg += `<rect x="${x + barWidth + groupSpacing}" y="${chartHeight - height2}" width="${barWidth}" height="${height2}" fill="#2ecc71" rx="3" ry="3"/>`;
      
      // Add link label
      svg += `<text x="${x + groupWidth/2}" y="${chartHeight + 25}" text-anchor="middle" font-size="13" font-weight="600" fill="#2c3e50">${link}</text>`;
      
      // Add bandwidth values on top of bars
      if (height1 > 25) {
        svg += `<rect x="${x - 2}" y="${chartHeight - height1 - 25}" width="${barWidth + 4}" height="22" fill="white" stroke="#3498db" stroke-width="1.5" rx="3"/>`;
        svg += `<text x="${x + barWidth/2}" y="${chartHeight - height1 - 10}" text-anchor="middle" font-size="11" font-weight="bold" fill="#3498db">${bandwidth1.toFixed(2)}</text>`;
      } else {
        svg += `<text x="${x + barWidth/2}" y="${chartHeight - height1 - 8}" text-anchor="middle" font-size="11" font-weight="bold" fill="#3498db">${bandwidth1.toFixed(2)}</text>`;
      }
      
      if (height2 > 25) {
        svg += `<rect x="${x + barWidth + groupSpacing - 2}" y="${chartHeight - height2 - 25}" width="${barWidth + 4}" height="22" fill="white" stroke="#2ecc71" stroke-width="1.5" rx="3"/>`;
        svg += `<text x="${x + barWidth + groupSpacing + barWidth/2}" y="${chartHeight - height2 - 10}" text-anchor="middle" font-size="11" font-weight="bold" fill="#2ecc71">${bandwidth2.toFixed(2)}</text>`;
      } else {
        svg += `<text x="${x + barWidth + groupSpacing + barWidth/2}" y="${chartHeight - height2 - 8}" text-anchor="middle" font-size="11" font-weight="bold" fill="#2ecc71">${bandwidth2.toFixed(2)}</text>`;
      }
    });
    
    // Add legend with descriptive labels
    const legendX = chartWidth - 200;
    const legendY = 20;
    
    // Calculate legend width based on label lengths
    const legendWidth = Math.max(label1.length, label2.length) * 8 + 50;
    
    // Legend background
    svg += `<rect x="${legendX - 15}" y="${legendY - 10}" width="${legendWidth}" height="70" fill="white" stroke="#bdc3c7" stroke-width="1" rx="6"/>`;
    
    // First analysis legend
    svg += `<rect x="${legendX}" y="${legendY}" width="18" height="18" fill="#3498db" rx="2"/>`;
    svg += `<text x="${legendX + 25}" y="${legendY + 13}" font-size="12" font-weight="bold" fill="#2c3e50">${label1}</text>`;
    
    // Second analysis legend
    svg += `<rect x="${legendX}" y="${legendY + 25}" width="18" height="18" fill="#2ecc71" rx="2"/>`;
    svg += `<text x="${legendX + 25}" y="${legendY + 38}" font-size="12" font-weight="bold" fill="#2c3e50">${label2}</text>`;
    
    svg += '</g>';
    svg += '</svg>';
    
    return `<div class="chart-container">${svg}</div>`;
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
  
  // Check if comparison already exists for these snapshots
  const existingComparison = document.getElementById('comparison');
  if (existingComparison) {
    // Check if this is the same comparison (same snapshots)
    const currentComparisonIds = existingComparison.getAttribute('data-comparison-ids');
    const newComparisonIds = `${selectedIds[0]}-${selectedIds[1]}`;
    
    if (currentComparisonIds === newComparisonIds) {
      // Same comparison already exists, show message and scroll to it
      existingComparison.scrollIntoView({ behavior: 'smooth' });
      return;
    } else {
      // Different comparison, remove the old one
      existingComparison.remove();
    }
  }
  
  // Create comparison section
  let comparisonHtml = '<section id="comparison" data-comparison-ids="' + selectedIds[0] + '-' + selectedIds[1] + '"><h2>Comparison of Selected Analyses</h2>';
  
  // Check if snapshots are identical
  if (checkIfSnapshotsAreIdentical(snapshot1, snapshot2)) {
    comparisonHtml += '<div class="error-message">The selected analyses are identical. Please run different analyses to compare.</div>';
    comparisonHtml += '</section>';
    resultsSection.innerHTML += comparisonHtml;
    
    // Scroll to comparison
    document.getElementById('comparison').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  
  // Generate descriptive labels for table headers
  const label1 = generateDescriptiveLabel(snapshot1);
  const label2 = generateDescriptiveLabel(snapshot2);
  
  // Create unified comparison table
  comparisonHtml += '<h3>Metrics Comparison</h3>';
  
  const headers = ['From', 'To', 'Metric', label1, label2, 'Difference'];
  const rows = [];
  
  // Add common metrics for both snapshots
  const commonLinks = new Set();
  snapshot1.trafficData.forEach(link => {
    commonLinks.add(`${link.from}-${link.to}`);
  });
  snapshot2.trafficData.forEach(link => {
    commonLinks.add(`${link.from}-${link.to}`);
  });
  
  commonLinks.forEach(linkStr => {
    const [from, to] = linkStr.split('-');
    
    const link1 = snapshot1.trafficData.find(l => l.from === from && l.to === to);
    const link2 = snapshot2.trafficData.find(l => l.from === from && l.to === to);
    
    if (link1 && link2) {
      // Daily Minutes
      rows.push([
        from,
        to,
        'Daily Minutes',
        link1.dailyMinutes.toLocaleString(),
        link2.dailyMinutes.toLocaleString(),
        (link1.dailyMinutes - link2.dailyMinutes).toLocaleString()
      ]);
      
      // Busy Hour Erlangs
      rows.push([
        from,
        to,
        'Busy Hour Erlangs',
        link1.busyHourErlangs.toFixed(2),
        link2.busyHourErlangs.toFixed(2),
        (link1.busyHourErlangs - link2.busyHourErlangs).toFixed(2)
      ]);
      
      // Bandwidth
      const bandwidth1 = link1.bandwidthMbps || link1.totalBandwidthMbps;
      const bandwidth2 = link2.bandwidthMbps || link2.totalBandwidthMbps;
      rows.push([
        from,
        to,
        'Bandwidth (Mbps)',
        bandwidth1.toFixed(2),
        bandwidth2.toFixed(2),
        (bandwidth1 - bandwidth2).toFixed(2)
      ]);
      
      // Network-specific metrics
      if (snapshot1.networkType === 'pstn' && snapshot2.networkType === 'pstn') {
        // Required Circuits
        rows.push([
          from,
          to,
          'Required Circuits',
          link1.requiredCircuits.toString(),
          link2.requiredCircuits.toString(),
          (link1.requiredCircuits - link2.requiredCircuits).toString()
        ]);
        
        // T-1 Count
        rows.push([
          from,
          to,
          'T-1 Count',
          link1.t1Count.toString(),
          link2.t1Count.toString(),
          (link1.t1Count - link2.t1Count).toString()
        ]);
      } else if (snapshot1.networkType === 'voip' && snapshot2.networkType === 'voip') {
        // Bandwidth per Call
        rows.push([
          from,
          to,
          'Bandwidth per Call (kbps)',
          link1.totalBandwidthPerCall.toFixed(0),
          link2.totalBandwidthPerCall.toFixed(0),
          (link1.totalBandwidthPerCall - link2.totalBandwidthPerCall).toFixed(0)
        ]);
      }
    }
  });
  
  comparisonHtml += renderTable('comparison-table', headers, rows);
  
  // Add configuration comparison
  comparisonHtml += '<h3>Configuration Comparison</h3>';
  const configHeaders = ['Property', 'Analysis 1', 'Analysis 2'];
  const configRows = [
    ['Network Type', snapshot1.networkType.toUpperCase(), snapshot2.networkType.toUpperCase()],
    ['Blocking Probability', snapshot1.blockingProb.toString(), snapshot2.blockingProb.toString()]
  ];
  
  if (snapshot1.networkType === 'voip' && snapshot2.networkType === 'voip') {
    configRows.push(['Codec', snapshot1.codec.toUpperCase(), snapshot2.codec.toUpperCase()]);
  }
  
  comparisonHtml += renderTable('config-table', configHeaders, configRows);
  
  // Add efficiency chart
  comparisonHtml += '<h3>Efficiency Comparison</h3>';
  comparisonHtml += generateEfficiencyChart(snapshot1, snapshot2);
  
  // Add explanations comparison if available
  const explanations = [];
  if (snapshot1.explanation) {
    explanations.push({
      title: `Analysis 1 (${snapshot1.timestamp}) - ${snapshot1.modelUsed}`,
      content: snapshot1.explanation
    });
  }
  
  if (snapshot2.explanation) {
    explanations.push({
      title: `Analysis 2 (${snapshot2.timestamp}) - ${snapshot2.modelUsed}`,
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
  
  // Check if AI summary already exists
  const existingAiSummary = document.getElementById('ai-comparison-summary');
  if (existingAiSummary) {
    existingAiSummary.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  
  // Show loading state
  const aiSummaryBtn = document.getElementById('getAiSummaryBtn');
  const originalText = aiSummaryBtn.textContent;
  aiSummaryBtn.innerHTML = '<span class="loading-spinner"></span> Generating Summary...';
  aiSummaryBtn.disabled = true;
  
  try {
    // Generate descriptive labels
    const label1 = generateDescriptiveLabel(snapshot1);
    const label2 = generateDescriptiveLabel(snapshot2);
    
    // Format the data for the LLM
    let prompt = `Please provide a comparison summary of the following two network traffic analyses:\n\n`;
    
    // First snapshot
    prompt += `${label1.toUpperCase()}:\n`;
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
    prompt += `\n${label2.toUpperCase()}:\n`;
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
      prompt += `\n${label1.toUpperCase()} EXPLANATION (${snapshot1.modelUsed}):\n${snapshot1.explanation}\n`;
    }
    
    if (snapshot2.explanation) {
      prompt += `\n${label2.toUpperCase()} EXPLANATION (${snapshot2.modelUsed}):\n${snapshot2.explanation}\n`;
    }
    
    prompt += `\nPlease provide a comprehensive, structured comparison summary with the following sections:\n\n`;
    prompt += `## 1. Executive Summary\n`;
    prompt += `- Brief overview of the two analyses being compared\n`;
    prompt += `- Key findings at a glance\n\n`;
    prompt += `## 2. Technical Comparison\n`;
    prompt += `- Detailed comparison of network metrics\n`;
    prompt += `- Use tables to clearly show differences\n`;
    prompt += `- Highlight significant variations\n\n`;
    prompt += `## 3. Performance Analysis\n`;
    prompt += `- Bandwidth efficiency comparison\n`;
    prompt += `- Infrastructure requirements\n`;
    prompt += `- Scalability implications\n\n`;
    prompt += `## 4. Cost and Resource Implications\n`;
    prompt += `- Infrastructure costs\n`;
    prompt += `- Maintenance requirements\n`;
    prompt += `- Resource utilization\n\n`;
    prompt += `## 5. Recommendations\n`;
    prompt += `- Which approach might be better for different scenarios\n`;
    prompt += `- Implementation considerations\n`;
    prompt += `- Risk factors to consider\n\n`;
    prompt += `## 6. Conclusion\n`;
    prompt += `- Summary of key insights\n`;
    prompt += `- Final recommendations\n\n`;
    prompt += `IMPORTANT GUIDELINES:\n`;
    prompt += `- Use clear, professional language\n`;
    prompt += `- Include specific numbers and percentages where relevant\n`;
    prompt += `- Use markdown tables for metric comparisons\n`;
    prompt += `- Provide actionable insights\n`;
    prompt += `- Do not ask questions or offer additional assistance at the end\n`;
    prompt += `- Focus on practical implications for network engineers and decision makers\n`;
    
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