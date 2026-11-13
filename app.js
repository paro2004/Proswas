const express = require('express');
const path = require('path');
const app = express();

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing requests and static assets
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Favicon 204 handler to prevent unnecessary error logs
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 1. Home / Root Route (Fixes the "Cannot GET /" error)
app.get('/', (req, res) => {
    // Render your index.ejs home page or redirect to /analyze
    res.render('index', { title: 'Proshwas - AI Chest X-Ray Screening' });
});

// 2. Mount Diagnostic / Analysis Routes
try {
    const diagnosticRoutes = require('./routes/diagnostic');
    app.use('/', diagnosticRoutes);
} catch (err) {
    console.log('Diagnostic routes not loaded yet or path differs:', err.message);
}

// Fallback Route for Undefined Paths (404)
app.use((req, res, next) => {
    res.status(404).render('error', { error: 'Page not found.' });
});

// Central Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Something went wrong on the server!';
    res.status(statusCode).render('error', { error: message });
});

// Server Listen (Render injects PORT automatically)
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Proshwas Frontend Server running on port ${PORT}`);
});