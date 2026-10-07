const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = new Database("ridham-emitra.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const timeSlots = [
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM"
];

const MAX_BOOKINGS_PER_SLOT = 3;

function generateToken(date) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM appointments WHERE date = ?")
    .get(date);

  return `RDM-${String(row.count + 1).padStart(3, "0")}`;
}

// Get available slots
app.get("/api/slots", (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  const bookings = db
    .prepare(`
      SELECT time, COUNT(*) AS count
      FROM appointments
      WHERE date = ?
      GROUP BY time
    `)
    .all(date);

  const bookedMap = {};

  bookings.forEach((item) => {
    bookedMap[item.time] = item.count;
  });

  const slots = timeSlots.map((time) => ({
    time,
    available: (bookedMap[time] || 0) < MAX_BOOKINGS_PER_SLOT,
    remaining: Math.max(
      0,
      MAX_BOOKINGS_PER_SLOT - (bookedMap[time] || 0)
    )
  }));

  res.json(slots);
});

// Create appointment
app.post("/api/appointments", (req, res) => {
  try {
    const { name, phone, service, date, time } = req.body;

    if (!name || !phone || !service || !date || !time) {
      return res.status(400).json({
        error: "Please fill all required fields."
      });
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        error: "Please enter a valid 10-digit mobile number."
      });
    }

    if (!timeSlots.includes(time)) {
      return res.status(400).json({
        error: "Invalid time slot."
      });
    }

    const count = db
      .prepare(
        "SELECT COUNT(*) AS count FROM appointments WHERE date = ? AND time = ?"
      )
      .get(date, time);

    if (count.count >= MAX_BOOKINGS_PER_SLOT) {
      return res.status(400).json({
        error: "This time slot is full. Please select another slot."
      });
    }

    const token = generateToken(date);

    const result = db
      .prepare(`
        INSERT INTO appointments
        (token, name, phone, service, date, time, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending')
      `)
      .run(token, name, phone, service, date, time);

    res.json({
      success: true,
      appointment: {
        id: result.lastInsertRowid,
        token,
        name,
        phone,
        service,
        date,
        time,
        status: "Pending"
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Something went wrong while booking."
    });
  }
});

// Search appointment
app.get("/api/appointments/search", (req, res) => {
  const { phone, token } = req.query;

  let appointment;

  if (token) {
    appointment = db
      .prepare(
        "SELECT * FROM appointments WHERE token = ? ORDER BY id DESC LIMIT 1"
      )
      .get(token.toUpperCase());
  } else if (phone) {
    appointment = db
      .prepare(
        "SELECT * FROM appointments WHERE phone = ? ORDER BY id DESC LIMIT 1"
      )
      .get(phone);
  }

  if (!appointment) {
    return res.status(404).json({
      error: "Appointment not found."
    });
  }

  res.json(appointment);
});

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === process.env.ADMIN_PASSWORD) {
    return res.json({
      success: true,
      message: "Login successful"
    });
  }

  res.status(401).json({
    error: "Incorrect password."
  });
});

// Admin appointments
app.get("/api/admin/appointments", (req, res) => {
  const appointments = db
    .prepare("SELECT * FROM appointments ORDER BY date DESC, id DESC")
    .all();

  res.json(appointments);
});

// Update status
app.patch("/api/admin/appointments/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = [
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled"
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid status."
    });
  }

  db.prepare(
    "UPDATE appointments SET status = ? WHERE id = ?"
  ).run(status, id);

  res.json({
    success: true
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    shop: "Ridham eMitra"
  });
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Ridham eMitra running at http://localhost:${PORT}`);
});