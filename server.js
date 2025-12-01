const express = require('express');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const pdfExtract = new PDFExtract();

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
app.use(limiter);

// Stricter rate limiting for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // Limit API calls to 50 per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many API requests, please try again later.'
});

app.use(express.json());

// Serve static files only from safe directories
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(__dirname, {
    index: false,
    dotfiles: 'deny',
    extensions: ['html', 'css', 'js', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'woff', 'woff2', 'ttf'],
    setHeaders: (res, filePath) => {
        // Only serve specific file types
        const allowedExtensions = ['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.md'];
        const ext = path.extname(filePath).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            res.status(403).end();
        }
    }
}));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// API endpoint to analyze PDF and detect form fields
app.get('/api/analyze-form', apiLimiter, async (req, res) => {
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

            // Calculate underline start position
            // Underline typically starts shortly after the label
            const underlineStartX = Math.round(label.x + label.width + 10);

            // Text should be placed slightly after the underline starts
            // to account for the visual gap and ensure it's on the line
            const textX = Math.round(underlineStartX + 5);

            // PDF coordinates are from bottom-left, but we need to adjust for text baseline
            // The y coordinate from pdf.js is the top of the text, but drawText uses baseline
            // For baseline, we subtract a portion of the height (usually 20-25%)
            const textY = Math.round(label.y - (label.height * 0.25));

            fieldCoordinates[fieldName] = {
                x: textX,
                y: textY,
                underlineStartX: underlineStartX,
                labelText: label.str,
                labelX: label.x,
                labelY: label.y,
                labelWidth: label.width,
                labelHeight: label.height
            };

            console.log(`  → Field "${fieldName}": underline at x=${underlineStartX}, text at (${textX}, ${textY})`);
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