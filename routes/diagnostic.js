const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// Use memory storage to process radiographs directly in RAM (zero disk footprint)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG) are permitted.'), false);
        }
    }
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5000/predict';

// GET: Render the initial empty UI
router.get('/', (req, res) => {
    res.render('index', {
        result: null,
        formData: {},
        error: null
    });
});

// POST: Handle form submission and communicate with Flask AI microservice
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
        // Forward image buffer to Flask via multipart/form-data
        const form = new FormData();
        form.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await axios.post(AI_SERVICE_URL, form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 15000
        });

        const { prediction, confidence_percent, overlay_base64 } = response.data;

        // Render UI with result and base64 Grad-CAM overlay
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
        console.error('Error contacting AI service:', err.message);
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