const express = require('express');
const path = require('path');
const app = express();

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware for parsing requests and static files
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Favicon 204 handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Root Route with safe fallback
app.get('/', (req, res) => {
    try {
        res.render('index');
    } catch (err) {
        res.redirect('/analyze');
    }
});

// Mount Diagnostic Routes safely
try {
    const diagnosticRoutes = require('./routes/diagnostic');
    app.use('/', diagnosticRoutes);
} catch (err) {
    console.error('Error loading diagnostic routes:', err.message);
}

// Fallback /analyze route
app.get('/analyze', (req, res) => {
    try {
        res.render('index');
    } catch (err) {
        res.send('Analysis portal view template is loading...');
    }
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Page not found.');
});

// Central Error Handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).send('Internal Server Error: ' + err.message);
});

// Server Listen (Render injects PORT automatically)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Proshwas Frontend Server running on port ${PORT}`);
});