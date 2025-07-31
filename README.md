# VoIP Analysis Tool

A comprehensive web-based tool for analyzing PSTN (Public Switched Telephone Network) and VoIP (Voice over IP) traffic patterns and bandwidth requirements.

## Features

- **PSTN Analysis**: Calculate required circuits, T-1 counts, and bandwidth for traditional telephone networks
- **VoIP Analysis**: Analyze bandwidth requirements for different codecs (G.711, G.729a)
- **Interactive Visualizations**: Network topology diagrams showing traffic flows between locations
- **AI-Powered Explanations**: Get detailed explanations of analysis results using Gemini AI
- **Comparison Tools**: Compare multiple analyses side-by-side with AI-generated summaries
- **Real-time Calculations**: Erlang-B formula implementation for accurate traffic engineering

## Usage

1. **Select Network Type**: Choose between PSTN or VoIP analysis
2. **Configure Parameters**:
   - For VoIP: Select codec (G.711 or G.729a)
   - Set blocking probability (0.001 to 0.1)
3. **Optional AI Features**: Enter your Gemini API key for AI-powered explanations
4. **Run Analysis**: Click "Run Analysis" to generate results
5. **Compare Results**: Select multiple snapshots to compare analyses

## Technical Details

### Traffic Model
- **Locations**: US, China, UK
- **Traffic Distribution**: Equal split between locations
- **Busy Hour Factor**: 0.17 (17% of daily traffic in busy hour)

### Calculations
- **PSTN**: Uses Erlang-B formula for circuit requirements
- **VoIP**: Calculates bandwidth per call including protocol overhead
- **Codecs**: G.711 (64 kbps), G.729a (8 kbps)

### AI Integration
- Supports Gemini API for result explanations
- Automatic model detection and selection
- Markdown-formatted explanations with tables and formatting

## Deployment

This project is designed to be deployed on GitHub Pages. The repository includes:

- Static HTML/CSS/JavaScript files
- No server-side dependencies
- Responsive design for mobile and desktop

## Local Development

1. Clone the repository
2. Open `index.html` in a web browser
3. No build process required - pure client-side application

## Browser Compatibility

- Modern browsers with ES6+ support
- Chrome, Firefox, Safari, Edge
- Mobile-responsive design

## License

This project is provided as-is for educational and analysis purposes.

## Contributing

Feel free to submit issues and enhancement requests! 