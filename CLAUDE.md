# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Run the application locally**: `npm start` (runs on http://localhost:3000)
- **Install dependencies**: `npm install`

## Architecture

This is an AYSO Soccer Lineup Generator web application with a simple Node.js/Express backend and vanilla JavaScript frontend.

### Project Structure
```
├── server.js           # Express server with API endpoints
├── public/             # Frontend static files
│   ├── index.html      # Main UI
│   ├── app.js          # Core application logic (SoccerLineupGenerator class)
│   ├── styles.css      # Application styles
│   ├── favicon.svg     # Site favicon
│   └── assets/         # Fonts, PDFs, images
├── docs/               # Documentation (security, privacy)
├── test-data/          # Sample player roster files
├── package.json        # Dependencies and scripts
└── railway.json        # Railway deployment config
```

### Backend (server.js)
- Express server serving static files from `public/`
- Health check endpoint for Railway deployment
- PDF analysis API endpoint
- Rate limiting middleware

### Frontend (public/)
- **index.html**: Main UI with player management, game settings, and lineup display
- **app.js**: `SoccerLineupGenerator` class handling:
  - Player roster management (import from file or manual entry)
  - Lineup generation with AYSO rotation rules
  - Visual field display for each quarter
  - Export/print functionality
- **styles.css**: Application styling

### Key Features & Constraints
The lineup generator enforces AYSO "Everyone Plays" rules:
- No player sits more than 1 quarter consecutively
- No player sits more than 2 quarters total
- Maximum 1 quarter as goalkeeper per player
- Players rotate between offensive and defensive positions
- Supports multiple formations (5v5, 7v7, 9v9, 11v11)

### Deployment
Configured for Railway deployment via **railway.json** with automatic builds using Nixpacks.