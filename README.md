# AYSO Roster Pro

A professional lineup generator for AYSO youth soccer teams, ensuring fair play time and optimal position rotation for all players. Designed specifically for AYSO's "Everyone Plays" philosophy.

## Features

- **Player Management**: Import players from text file or add manually
- **Smart Rotation Algorithm**: 
  - No player sits more than 1 quarter in a row
  - No player sits more than 2 quarters total
  - Every player gets both offensive and defensive positions
  - Maximum 1 quarter as goalkeeper per player
  - Minimizes position repetition
- **Visual Field Display**: See player positions on a soccer field diagram for each quarter
- **Season Stats Tracking**: Track lineups across an entire season with per-player statistics (games played, quarters, positions, goalkeeper duties)
- **Export Options**: Export lineups to text file or print
- **Flexible Team Sizes**: Supports 5v5, 7v7, 9v9, and 11v11 formations

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run the server:
```bash
npm start
```

3. Open http://localhost:3000 in your browser

## Deployment to Railway

1. Push this code to a GitHub repository

2. Connect your GitHub repo to Railway:
   - Go to [Railway](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Select your repository

3. Railway will automatically:
   - Detect the Node.js application
   - Install dependencies
   - Run `npm start`
   - Provide you with a public URL

## Usage

1. **Add Players**: 
   - Import a text file with one player name per line
   - Or add players manually one by one

2. **Set Field Size**: 
   - Default is 7 players (7v7)
   - Can adjust for different game formats

3. **Generate Lineup**: 
   - Click "Generate Lineup" to create automatic rotations
   - System ensures fair play time and position variety

4. **Review & Export**:
   - Check the visual field diagrams
   - Review player summary for balance
   - Export or print the lineup

5. **Track Season Stats**:
   - Click "Save Game" after generating a lineup
   - View the Season Stats tab to see cumulative player statistics
   - Track games played, quarters, sitting time, and position history

## Rules Enforced

- **Playing Time**: Equal distribution across all players
- **Sitting**: No consecutive quarters, maximum 2 quarters per game
- **Goalkeeper**: Maximum 1 quarter per player
- **Positions**: Players rotate between offensive and defensive roles
- **Variety**: Algorithm minimizes playing the same position twice

## License

MIT