const express = require('express');
const path = require('path');
const app = express();

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Root Route
app.get('/', (req, res) => {
    res.render('index', { 
        error: null, 
        success: null, 
        formData: {}, 
        result: null 
    });
});

// Mount Diagnostic Routes
try {
    const diagnosticRoutes = require('./routes/diagnostic');
    app.use('/', diagnosticRoutes);
} catch (err) {
    console.error('Error loading diagnostic routes:', err.message);
}

// Fallback Analyze Route
app.get('/analyze', (req, res) => {
    res.render('index', { 
        error: null, 
        success: null, 
        formData: {}, 
        result: null 
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Page not found.');
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).send('Internal Server Error: ' + err.message);
});

// Server Listen
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Proshwas Frontend Server running on port ${PORT}`);
});