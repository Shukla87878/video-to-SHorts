const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'public', 'uploads');
const clipsDir = path.join(__dirname, 'public', 'clips');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({
    storage,
    limits: { fileSize: 300 * 1024 * 1024 }, // 300MB limit
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/process', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const inputPath = path.join(uploadsDir, req.file.filename);
    const outputFileName = `processed_${Date.now()}.mp4`;
    const outputPath = path.join(clipsDir, outputFileName);

    console.log('Starting FFmpeg processing...');

    // Function to create a reel from the input video
    const createReel = (startTime, reelIndex) => {
        const reelOutputFileName = `reel_${reelIndex}_${Date.now()}.mp4`;
        const reelOutputPath = path.join(clipsDir, reelOutputFileName);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .setStartTime(startTime)
                .setDuration(30) // Set each reel to 30 seconds
                .output(reelOutputPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .format('mp4')
                .outputOptions([
                  '-vf scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', // Set to vertical 1080x1920
                  '-movflags +faststart', // Optimization for playback
              ])
                .on('end', () => {
                    console.log(`Reel ${reelIndex} processing finished.`);
                    resolve(reelOutputFileName);
                })
                .on('error', (err) => {
                    console.error(`Error processing reel ${reelIndex}:`, err);
                    reject(err);
                })
                .run();
        });
    };

    const reelsPromises = [];
    const startTimes = [0, 30, 60, 90]; // Start times for reels (you can implement a more intelligent selection here)

    for (let i = 0; i < startTimes.length; i++) {
        if (startTimes[i] < 0) continue; // Skip if the start time is negative
        reelsPromises.push(createReel(startTimes[i], i + 1));
    }

    Promise.all(reelsPromises)
        .then(reelFiles => {
            const downloadUrls = reelFiles.map(reel => `/clips/${reel}`);
            res.json({ downloadUrls });
            // Cleanup code omitted for brevity
        })
        .catch(err => {
            console.error('Error creating reels:', err);
            res.status(500).send('An error occurred during processing.');
        });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
