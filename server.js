
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DATABASE
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

// SHOP TIMING: 8 AM TO 9 PM
// 25-MINUTE APPOINTMENT SLOTS

const OPENING_MINUTES = 8 * 60;
const CLOSING_MINUTES = 21 * 60;
const SLOT_DURATION = 25;
const MAX_BOOKINGS_PER_SLOT = 3;

function formatTime(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return (
    String(hour12).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0") +
    " " +
    period
  );
}

const timeSlots = [];

for (
  let minutes = OPENING_MINUTES;
  minutes + SLOT_DURATION <= CLOSING_MINUTES;
  minutes += SLOT_DURATION
) {
  timeSlots.push(formatTime(minutes));
}

// DATE VALIDATION
function isValidDate(date) {
  if (typeof date !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(date + "T00:00:00Z");

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isPastSlot(date, time) {
  if (date < todayInIndia()) return true;
  if (date > todayInIndia()) return false;

  const now = new Date();

  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(now);

  const [hours, minutes] = currentTime.split(":").map(Number);
  const currentMinutes = hours * 60 + minutes;

  const [clock, period] = time.split(" ");
  let [slotHour, slotMinute] = clock.split(":").map(Number);

  slotHour = slotHour % 12;
  if (period === "PM") slotHour += 12;

  const slotMinutes = slotHour * 60 + slotMinute;

  return slotMinutes <= currentMinutes;
}

// GENERATE TOKEN
function generateToken(date) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM appointments
    WHERE date = ?
  `).get(date);

  return `RDM-${String(row.count + 1).padStart(3, "0")}`;
}

// GET AVAILABLE SLOTS
app.get("/api/slots", (req, res) => {
  try {
    const { date } = req.query;

    if (!isValidDate(date)) {
      return res.status(400).json({
        error: "Please select a valid date."
      });
    }

    if (date < todayInIndia()) {
      return res.json([]);
    }

    const bookings = db.prepare(`
      SELECT time, COUNT(*) AS count
      FROM appointments
      WHERE date = ?
        AND status != 'Cancelled'
      GROUP BY time
    `).all(date);

    const bookedMap = {};

    bookings.forEach((item) => {
      bookedMap[item.time] = item.count;
    });

    const slots = timeSlots.map((time) => {
      const booked = bookedMap[time] || 0;
      const remaining = Math.max(
        0,
        MAX_BOOKINGS_PER_SLOT - booked
      );

      return {
        time,
        available:
          remaining > 0 && !isPastSlot(date, time),
        remaining
      };
    });

    res.json(slots);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load slots."
    });
  }
});

// BOOK APPOINTMENT
const createAppointment = db.transaction((data) => {
  const { name, phone, service, date, time } = data;

  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM appointments
    WHERE date = ?
      AND time = ?
      AND status != 'Cancelled'
  `).get(date, time);

  if (count.count >= MAX_BOOKINGS_PER_SLOT) {
    return {
      error: "This time slot is full."
    };
  }

  const token = generateToken(date);

  const result = db.prepare(`
    INSERT INTO appointments
    (token, name, phone, service, date, time, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending')
  `).run(
    token,
    name,
    phone,
    service,
    date,
    time
  );

  return {
    appointment: {
      id: Number(result.lastInsertRowid),
      token,
      name,
      phone,
      service,
      date,
      time,
      status: "Pending"
    }
  };
});

app.post("/api/appointments", (req, res) => {
  try {
    const { name, phone, service, date, time } = req.body;

    if (
      typeof name !== "string" ||
      typeof phone !== "string" ||
      typeof service !== "string" ||
      !name.trim() ||
      !service.trim() ||
      !isValidDate(date) ||
      !time
    ) {
      return res.status(400).json({
        error: "Please fill all required fields."
      });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        error: "Enter a valid 10-digit mobile number."
      });
    }

    if (!timeSlots.includes(time)) {
      return res.status(400).json({
        error: "Invalid time slot."
      });
    }

    if (isPastSlot(date, time)) {
      return res.status(400).json({
        error: "Please select a future time slot."
      });
    }

    const result = createAppointment({
      name: name.trim(),
      phone,
      service: service.trim(),
      date,
      time
    });

    if (result.error) {
      return res.status(400).json({
        error: result.error
      });
    }

    res.json({
      success: true,
      appointment: result.appointment
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Something went wrong while booking."
    });
  }
});

// SEARCH APPOINTMENT
app.get("/api/appointments/search", (req, res) => {
  try {
    const { phone, token } = req.query;

    let appointment;

    if (typeof token === "string" && token.trim()) {
      appointment = db.prepare(`
        SELECT *
        FROM appointments
        WHERE token = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(token.trim().toUpperCase());

    } else if (typeof phone === "string" && phone.trim()) {
      appointment = db.prepare(`
        SELECT *
        FROM appointments
        WHERE phone = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(phone.trim());
    }

    if (!appointment) {
      return res.status(404).json({
        error: "Appointment not found."
      });
    }

    res.json(appointment);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to search appointment."
    });
  }
});

// ADMIN LOGIN
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (
    process.env.ADMIN_PASSWORD &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({
      success: true,
      message: "Login successful"
    });
  }

  res.status(401).json({
    error: "Incorrect password."
  });
});

// ADMIN APPOINTMENTS
app.get("/api/admin/appointments", (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT *
      FROM appointments
      ORDER BY date DESC, id DESC
    `).all();

    res.json(appointments);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load appointments."
    });
  }
});

// UPDATE APPOINTMENT STATUS
app.patch("/api/admin/appointments/:id", (req, res) => {
  try {
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

    const result = db.prepare(`
      UPDATE appointments
      SET status = ?
      WHERE id = ?
    `).run(status, id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Appointment not found."
      });
    }

    res.json({
      success: true
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to update appointment."
    });
  }
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    shop: "Ridham eMitra",
    openingTime: "08:00 AM",
    closingTime: "09:00 PM",
    slotDuration: 25,
    maxBookingsPerSlot: MAX_BOOKINGS_PER_SLOT
  });
});

// STATIC WEBSITE
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Ridham eMitra running on port ${PORT}`
  );
});
