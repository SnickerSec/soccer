# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- **Run the application locally**: `npm start` (runs on http://localhost:3000)
- **Install dependencies**: `npm install`

## Architecture

This is an AYSO Soccer Lineup Generator web application with a simple Node.js/Express backend and vanilla JavaScript frontend.

### Backend Structure
- **server.js**: Express server that serves static files and provides a health check endpoint for Railway deployment
- **PORT**: Uses environment variable or defaults to 3000

### Frontend Structure
- **index.html**: Main UI with player management, game settings, and lineup display sections
- **app.js**: Core application logic implemented as `SoccerLineupGenerator` class that handles:
  - Player roster management (import from file or manual entry)
  - Lineup generation with AYSO rotation rules (fair play time, position variety)
  - Visual field display for each quarter
  - Export/print functionality
- **styles.css**: Styling for the application UI

### Key Features & Constraints
The lineup generator enforces AYSO "Everyone Plays" rules:
- No player sits more than 1 quarter consecutively
- No player sits more than 2 quarters total
- Maximum 1 quarter as goalkeeper per player
- Players rotate between offensive and defensive positions
- Supports multiple formations (5v5, 7v7, 9v9, 11v11)

### Deployment
Configured for Railway deployment via **railway.json** with automatic builds using Nixpacks.