const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session'); // <-- NEW

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// NEW: Session Setup (keeps user logged in)
app.use(session({
    secret: 'my_super_secret_key', // Used to encrypt sessions (can be any random string)
    resave: false,
    saveUninitialized: false
}));

// Connect to Database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'daily_wage_db'
});

db.connect((err) => {
    if (err) {
        console.error('DB Connection Error:', err);
        return;
    }
    console.log('✅ Connected to MySQL');
});

// ==========================================
// ROUTES
// ==========================================

// Route 1: Home Page
app.get('/', (req, res) => {
    res.render('index', { title: 'Daily Wage Platform' });
});

// Route 2: Show Registration Form
app.get('/register', (req, res) => {
    const selectedRole = req.query.role || ''; 
    res.render('register', { selectedRole, errorMsg: '' });
});

// Route 3: Handle Registration
app.post('/register', async (req, res) => {
    const { name, phone, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, ?)";
    
    db.query(sql, [name, phone, hashedPassword, role], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.render('register', { selectedRole: role, errorMsg: '⚠️ Phone number already registered!' });
            }
            return res.send("Error: " + err);
        }
        // CHANGED: Go to login page instead of home page!
        res.redirect('/login'); 
    });
});

// ==========================================
// NEW: LOGIN ROUTES
// ==========================================

// Route 4: Show Login Form
app.get('/login', (req, res) => {
    res.render('login', { errorMsg: '' });
});

// Route 5: Handle Login Form Submission
app.post('/login', (req, res) => {
    const { phone, password } = req.body;

    // Find user by phone number
    const sql = "SELECT * FROM users WHERE phone = ?";
    db.query(sql, [phone], async (err, results) => {
        if (err) return res.send("Error: " + err);
        
        // If phone not found
        if (results.length === 0) {
            return res.render('login', { errorMsg: '⚠️ Phone number not found!' });
        }

        const user = results[0];

        // Check if password is correct
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.render('login', { errorMsg: '⚠️ Incorrect password!' });
        }

        // SUCCESS! Save user info in session
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userRole = user.role;

        // CHANGED: Send them to the correct dashboard based on their role
        if (user.role === 'worker') {
            res.redirect('/worker/dashboard');
        } else {
            res.redirect('/employer/dashboard'); // We will build this later
        }
    });
});

// Route: Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        return res.redirect('/login');
    });
});

// ==========================================
// WORKER DASHBOARD
// ==========================================

// Show Worker Dashboard & Available Jobs
app.get('/worker/dashboard', (req, res) => {
    // Security check: If user is not logged in or is not a worker, kick them out
    if (!req.session.userId || req.session.userRole !== 'worker') {
        return res.redirect('/login');
    }

    // Fetch all jobs that are 'open'
    const sql = `
        SELECT jobs.*, skills.name AS skill_name 
        FROM jobs 
        JOIN skills ON jobs.skill_required = skills.id 
        WHERE jobs.status = 'open' 
        ORDER BY jobs.created_at DESC
    `;

    db.query(sql, (err, jobs) => {
        if (err) return res.send("Error fetching jobs: " + err);
        
        // Send the jobs list and the user's name to the HTML file
        res.render('worker-dashboard', { 
            name: req.session.userName, 
            jobs: jobs 
        });
    });
});

// ==========================================
// APPLICATION ROUTE
// ==========================================

app.post('/apply/:jobId', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'worker') {
        return res.redirect('/login');
    }

    const jobId = req.params.jobId;
    const workerId = req.session.userId;

    // Insert into applications table
    const sql = "INSERT INTO applications (job_id, worker_id) VALUES (?, ?)";
    
    db.query(sql, [jobId, workerId], (err, result) => {
        if (err) {
            // If they already applied, the UNIQUE constraint triggers an error
            if (err.code === 'ER_DUP_ENTRY') {
                console.log("Worker already applied");
            }
            return res.redirect('/worker/dashboard'); // Send them back either way
        }
        res.redirect('/worker/dashboard');
    });
});
// ==========================================
// EMPLOYER DASHBOARD
// ==========================================

// Route 1: Show Employer Dashboard & Post Job Form
app.get('/employer/dashboard', (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'employer') {
        return res.redirect('/login');
    }

    const skillsSql = "SELECT * FROM skills";
    const jobsSql = `
        SELECT jobs.*, skills.name AS skill_name 
        FROM jobs 
        JOIN skills ON jobs.skill_required = skills.id 
        WHERE jobs.employer_id = ? 
        ORDER BY jobs.created_at DESC
    `;

    db.query(skillsSql, (err, skills) => {
        if (err) return res.send("Error: " + err);

        db.query(jobsSql, [req.session.userId], (err, myJobs) => {
            if (err) return res.send("Error: " + err);
            
            // NEW: For every job, fetch its applicants
            const applicationsSql = `
                SELECT applications.*, users.name AS worker_name, users.phone AS worker_phone 
                FROM applications 
                JOIN users ON applications.worker_id = users.id
                WHERE job_id IN (?)
            `;

            // Extract job IDs to search for applicants
            const jobIds = myJobs.map(j => j.id);
            
            if (jobIds.length === 0) {
                return res.render('employer-dashboard', { name: req.session.userName, skills, myJobs, applications: [] });
            }

            db.query(applicationsSql, [jobIds], (err, applications) => {
                if (err) return res.send("Error fetching applicants: " + err);
                
                res.render('employer-dashboard', { 
                    name: req.session.userName, 
                    skills: skills,
                    myJobs: myJobs,
                    applications: applications // Send applicants to HTML
                });
            });
        });
    });
});
// Route 2: Handle Job Posting
app.post('/employer/post-job', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const { title, skill_required, pincode, wage_per_day, workers_needed, job_date, description } = req.body;

    const sql = `INSERT INTO jobs (employer_id, title, skill_required, pincode, wage_per_day, workers_needed, job_date, description) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [req.session.userId, title, skill_required, pincode, wage_per_day, workers_needed, job_date, description], (err, result) => {
        if (err) return res.send("Error posting job: " + err);
        
        // Redirect back to employer dashboard to see the new job
        res.redirect('/employer/dashboard');
    });
});
// ==========================================
// START THE SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});