
CREATE DATABASE daily_wage_db;
USE daily_wage_db;


CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY, -- Unique ID for every human
    phone VARCHAR(15) NOT NULL UNIQUE,  -- Phone number (login ID), UNIQUE means no duplicates allowed
    password VARCHAR(255) NOT NULL,     -- Hashed password (never store plain text!)
    role ENUM('worker', 'employer') NOT NULL, -- Restricts value to ONLY these two
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Auto-fills with exact date/time
);

-- ==========================================
-- 2. SKILLS TABLE (Master List)
-- Pre-defined list so workers don't type "Mason", "mason", "masn"
-- ==========================================
CREATE TABLE skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE -- e.g., "Plumber", "Electrician"
);

-- ==========================================
-- 3. WORKER_PROFILES TABLE
-- Extra info that ONLY workers have.
-- Linked to users table via user_id.
-- ==========================================
CREATE TABLE worker_profiles (
    user_id INT PRIMARY KEY, -- This IS the foreign key (also acts as primary key here for 1-to-1 link)
    pincode VARCHAR(6) NOT NULL, -- e.g., "110020"
    experience_years INT DEFAULT 0,
    bio TEXT, -- Short description about themselves
    is_available BOOLEAN DEFAULT TRUE, -- False if they are already on a job
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE 
    -- ON DELETE CASCADE means: if user is deleted, their profile vanishes too
);

-- ==========================================
-- 4. WORKER_SKILLS TABLE (The Bridge)
-- A worker can have MANY skills. A skill belongs to MANY workers.
-- This table connects them.
-- ==========================================
CREATE TABLE worker_skills (
    worker_id INT,
    skill_id INT,
    PRIMARY KEY (worker_id, skill_id), -- Prevents same worker adding same skill twice
    FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- ==========================================
-- 5. EMPLOYER_PROFILES TABLE
-- Extra info that ONLY employers have.
-- ==========================================
CREATE TABLE employer_profiles (
    user_id INT PRIMARY KEY,
    company_name VARCHAR(100),
    pincode VARCHAR(6) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==========================================
-- 6. JOBS TABLE
-- The heart of the application.
-- ==========================================
CREATE TABLE jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employer_id INT NOT NULL, -- Who posted it?
    title VARCHAR(100) NOT NULL, -- e.g., "Need 2 painters for 2BHK"
    skill_required INT NOT NULL, -- Which skill? (Linked to skills table)
    pincode VARCHAR(6) NOT NULL, -- Where is the job?
    wage_per_day DECIMAL(10, 2) NOT NULL, -- DECIMAL is used for money, NOT float/int (avoids rounding errors)
    workers_needed INT NOT NULL DEFAULT 1, -- How many people?
    job_date DATE NOT NULL, -- When is the job?
    description TEXT,
    status ENUM('open', 'in-progress', 'completed', 'cancelled') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_required) REFERENCES skills(id) -- If skill is deleted, what happens? (Omit cascade here to keep job history)
);

-- ==========================================
-- 7. APPLICATIONS TABLE
-- When a worker clicks "Apply", a row is added here.
-- ==========================================
CREATE TABLE applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    worker_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Prevent a worker from applying to the SAME job twice
    UNIQUE(job_id, worker_id) 
);

-- ==========================================
-- 8. PAYMENTS TABLE
-- Tracks if the employer paid the worker for a specific job.
-- ==========================================
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL UNIQUE, -- 1 application = 1 payment
    amount DECIMAL(10, 2) NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP NULL, -- NULL until actually paid
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- ==========================================
-- 9. REVIEWS TABLE
-- Employer rates worker after job is done.
-- ==========================================
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    worker_id INT NOT NULL,
    employer_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5), -- Only allows 1, 2, 3, 4, or 5
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (employer_id) REFERENCES users(id),
    UNIQUE(job_id, worker_id) -- Employer can only review a worker once per job
);