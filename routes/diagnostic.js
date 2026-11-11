const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// In-memory file processing
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG) are permitted.'), false);
        }
    }
});

// Clean base URL to prevent double '/predict/predict' bugs
const RAW_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000';
const BASE_AI_URL = RAW_URL.replace(/\/predict\/?$/, '').replace(/\/+$/, '');
const AI_PREDICT_ENDPOINT = `${BASE_AI_URL}/predict`;

// GET: Wake backend immediately when user loads the page
router.get('/', (req, res) => {
    // Proactive background ping so it wakes up before user finishes uploading
    axios.get(`${BASE_AI_URL}/`, { timeout: 8000 }).catch(() => {});

    res.render('index', {
        result: null,
        formData: {},
        error: null
    });
});

// Helper: Post with automatic retry for cold starts
async function queryAIWithRetry(form, maxAttempts = 2) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await axios.post(AI_PREDICT_ENDPOINT, form, {
                headers: { ...form.getHeaders() },
                timeout: 90000 // 90s to comfortably tolerate wake-up latency
            });
        } catch (err) {
            console.warn(`AI service call failed on attempt ${attempt}:`, err.message);
            if (attempt === maxAttempts) throw err;
            await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }
}

// POST: Run analysis
router.post('/analyze', upload.single('xray_image'), async (req, res) => {
    const { patient_name, age, patient_id } = req.body;
    const formData = { patient_name, age, patient_id };

    if (!req.file) {
        return res.render('index', {
            result: null,
            formData,
            error: 'Please upload a chest radiograph image to analyze.'
        });
    }

    try {
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await queryAIWithRetry(form);
        const { prediction, confidence_percent, overlay_base64 } = response.data;

        res.render('index', {
            result: {
                prediction,
                confidence_percent,
                overlay_base64,
                input_base64: req.file.buffer.toString('base64')
            },
            formData,
            error: null
        });

    } catch (err) {
        console.error('Final AI error:', err.message);
        let errorMsg = 'Failed to analyze radiograph. Please ensure the AI engine is running.';
        if (err.response && err.response.data && err.response.data.error) {
            errorMsg = err.response.data.error;
        }

        res.render('index', {
            result: null,
            formData,
            error: errorMsg
        });
    }
});

module.exports = router;