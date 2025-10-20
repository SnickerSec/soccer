const express = require('express');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');

const app = express();
const PORT = process.env.PORT || 3000;
const pdfExtract = new PDFExtract();

// Serve static files from the current directory
app.use(express.static(__dirname));
app.use(express.json());

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// API endpoint to analyze PDF and detect form fields
app.get('/api/analyze-form', async (req, res) => {
    try {
        const pdfPath = path.join(__dirname, 'assets', 'Player Evaluation Form 2025.pdf');

        const data = await pdfExtract.extract(pdfPath, {});

        // Analyze the first page
        const page = data.pages[0];
        const { width, height } = page;

        console.log(`\n=== PDF Analysis ===`);
        console.log(`Page dimensions: ${width} x ${height}`);
        console.log(`Total content items: ${page.content.length}\n`);

        // Extract text elements with their positions
        const textElements = page.content.filter(item => item.str && item.str.trim());

        // Find potential form field labels (text ending with ":")
        const labels = textElements.filter(item => item.str.includes(':'));

        console.log('Detected Labels:');
        labels.forEach(label => {
            console.log(`  "${label.str}" at (${label.x.toFixed(2)}, ${label.y.toFixed(2)})`);
        });

        // Calculate optimal text placement coordinates
        // Text should be placed just after the label
        const fieldCoordinates = {};

        labels.forEach(label => {
            const fieldName = label.str.replace(':', '').trim();

            // Calculate text start position (label x + label width + small gap)
            const textX = Math.round(label.x + label.width + 5);

            // PDF coordinates are from bottom-left, but we need to adjust for text baseline
            // The y coordinate from pdf.js is the top of the text, but drawText uses baseline
            // For baseline, we subtract a portion of the height
            const textY = Math.round(label.y - (label.height * 0.2));

            fieldCoordinates[fieldName] = {
                x: textX,
                y: textY,
                labelText: label.str,
                labelX: label.x,
                labelY: label.y,
                labelWidth: label.width,
                labelHeight: label.height
            };

            console.log(`  → Field "${fieldName}" should be at (${textX}, ${textY})`);
        });

        // Find player list starting position
        const playerNameLabel = textElements.find(t => t.str.includes('Player') && t.str.includes('Name'));
        const currentRatingLabel = textElements.find(t => t.str.includes('Current Rating'));
        const commentsLabel = textElements.find(t => t.str.includes('Comments'));

        if (playerNameLabel) {
            console.log('\nPlayer List Columns:');
            console.log(`  Player Name column: x=${playerNameLabel.x.toFixed(2)}`);
            if (currentRatingLabel) console.log(`  Rating column: x=${currentRatingLabel.x.toFixed(2)}`);
            if (commentsLabel) console.log(`  Comments column: x=${commentsLabel.x.toFixed(2)}`);
        }

        res.json({
            success: true,
            dimensions: { width, height },
            fieldCoordinates,
            playerColumns: {
                playerName: playerNameLabel ? { x: playerNameLabel.x, y: playerNameLabel.y } : null,
                currentRating: currentRatingLabel ? { x: currentRatingLabel.x, y: currentRatingLabel.y } : null,
                comments: commentsLabel ? { x: commentsLabel.x, y: commentsLabel.y } : null
            },
            labels: labels.map(l => ({
                text: l.str,
                x: l.x,
                y: l.y,
                width: l.width,
                height: l.height
            }))
        });
    } catch (error) {
        console.error('Error analyzing PDF:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`AYSO Roster Pro running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});