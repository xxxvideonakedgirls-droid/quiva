import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const db = new Database("quiva.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const JWT_SECRET = "QUIVA_SECRET_KEY_CHANGE_LATER";
const PORT = process.env.PORT || 5000;

/* =========================================================
   DATABASE
========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_number TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    booking_type TEXT NOT NULL,
    service_name TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    booking_time TEXT,
    guests INTEGER DEFAULT 1,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'KES',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    booking_status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    payment_method TEXT,
    transaction_reference TEXT,
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    method TEXT NOT NULL,
    amount INTEGER NOT NULL,
    transaction_reference TEXT,
    provider_reference TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    raw_response TEXT,
    created_at TEXT NOT NULL,
    verified_at TEXT,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL UNIQUE,
    receipt_number TEXT NOT NULL UNIQUE,
    issued_at TEXT NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );
`);

console.log("QUIVA database connected.");

/* =========================================================
   HELPERS
========================================================= */

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired login session.",
    });
  }
}

function generateBookingNumber() {
  return `QB-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
}

function generateReceiptNumber() {
  return `QR-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
}

function now() {
  return new Date().toISOString();
}

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get("/", (req, res) => {
  res.json({
    name: "QUIVA Hotel & Restaurant",
    status: "online",
    message: "QUIVA backend is running.",
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    server: "QUIVA",
    database: "SQLite",
    chat: "ready",
    bookings: "ready",
    payments: "ready",
    receipts: "ready",
  });
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters.",
      });
    }

    const existing = db
      .prepare(
        "SELECT id FROM users WHERE email = ? OR phone = ?"
      )
      .get(email, phone);

    if (existing) {
      return res.status(409).json({
        message: "Email or phone number is already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db
      .prepare(
        `
        INSERT INTO users
        (name, email, phone, password, created_at)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        hashedPassword,
        now()
      );

    const user = db
      .prepare(
        `
        SELECT id, name, email, phone, created_at
        FROM users
        WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "QUIVA account created successfully.",
      token,
      user,
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      message: "Registration failed.",
    });
  }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = db
      .prepare(
        `
        SELECT *
        FROM users
        WHERE email = ?
        `
      )
      .get(email.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
    };

    const token = createToken(safeUser);

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      message: "Login failed.",
    });
  }
});

/* =========================================================
   MEMBERS
========================================================= */

app.get("/api/members", authenticate, (req, res) => {
  try {
    const search = (req.query.search || "").trim();

    let members;

    if (search) {
      members = db
        .prepare(
          `
          SELECT id, name, email, phone, created_at
          FROM users
          WHERE id != ?
          AND (
            name LIKE ?
            OR email LIKE ?
            OR phone LIKE ?
          )
          ORDER BY name ASC
          `
        )
        .all(
          req.user.id,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`
        );
    } else {
      members = db
        .prepare(
          `
          SELECT id, name, email, phone, created_at
          FROM users
          WHERE id != ?
          ORDER BY name ASC
          `
        )
        .all(req.user.id);
    }

    res.json({
      success: true,
      members,
    });
  } catch (error) {
    console.error("MEMBERS ERROR:", error);

    res.status(500).json({
      message: "Could not load members.",
    });
  }
});

/* =========================================================
   CHAT - GET MESSAGES
========================================================= */

app.get("/api/messages/:userId", authenticate, (req, res) => {
  try {
    const otherUserId = Number(req.params.userId);

    const messages = db
      .prepare(
        `
        SELECT
          id,
          sender_id,
          receiver_id,
          message,
          created_at,
          read_at
        FROM messages
        WHERE
          (sender_id = ? AND receiver_id = ?)
          OR
          (sender_id = ? AND receiver_id = ?)
        ORDER BY id ASC
        `
      )
      .all(
        req.user.id,
        otherUserId,
        otherUserId,
        req.user.id
      );

    res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("MESSAGES ERROR:", error);

    res.status(500).json({
      message: "Could not load messages.",
    });
  }
});

/* =========================================================
   CHAT - SEND MESSAGE
========================================================= */

app.post("/api/messages", authenticate, (req, res) => {
  try {
    const { receiverId, message } = req.body;

    if (!receiverId || !message?.trim()) {
      return res.status(400).json({
        message: "Receiver and message are required.",
      });
    }

    const receiver = db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(Number(receiverId));

    if (!receiver) {
      return res.status(404).json({
        message: "Member not found.",
      });
    }

    const createdAt = now();

    const result = db
      .prepare(
        `
        INSERT INTO messages
        (sender_id, receiver_id, message, created_at)
        VALUES (?, ?, ?, ?)
        `
      )
      .run(
        req.user.id,
        Number(receiverId),
        message.trim(),
        createdAt
      );

    const newMessage = db
      .prepare(
        `
        SELECT *
        FROM messages
        WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    io.to(`user_${receiverId}`).emit(
      "new_message",
      newMessage
    );

    io.to(`user_${req.user.id}`).emit(
      "message_sent",
      newMessage
    );

    res.status(201).json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);

    res.status(500).json({
      message: "Could not send message.",
    });
  }
});

/* =========================================================
   CHAT - MARK READ
========================================================= */

app.post("/api/messages/:userId/read", authenticate, (req, res) => {
  try {
    const otherUserId = Number(req.params.userId);

    db.prepare(
      `
      UPDATE messages
      SET read_at = ?
      WHERE sender_id = ?
      AND receiver_id = ?
      AND read_at IS NULL
      `
    ).run(
      now(),
      otherUserId,
      req.user.id
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error("READ MESSAGE ERROR:", error);

    res.status(500).json({
      message: "Could not mark messages as read.",
    });
  }
});

/* =========================================================
   BOOKINGS
========================================================= */

app.post("/api/bookings", authenticate, (req, res) => {
  try {
    const {
      bookingType,
      serviceName,
      bookingDate,
      bookingTime,
      guests,
      amount,
      paymentMethod,
    } = req.body;

    if (
      !bookingType ||
      !serviceName ||
      !bookingDate ||
      !amount
    ) {
      return res.status(400).json({
        message: "Booking information is incomplete.",
      });
    }

    const bookingNumber = generateBookingNumber();
    const createdAt = now();

    const result = db
      .prepare(
        `
        INSERT INTO bookings
        (
          booking_number,
          user_id,
          booking_type,
          service_name,
          booking_date,
          booking_time,
          guests,
          amount,
          currency,
          payment_status,
          booking_status,
          payment_method,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'KES', 'PENDING', 'PENDING_PAYMENT', ?, ?)
        `
      )
      .run(
        bookingNumber,
        req.user.id,
        bookingType,
        serviceName,
        bookingDate,
        bookingTime || null,
        Number(guests) || 1,
        Number(amount),
        paymentMethod || null,
        createdAt
      );

    const booking = db
      .prepare(
        `
        SELECT *
        FROM bookings
        WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message:
        "Booking created. Payment is required before confirmation.",
      booking,
    });
  } catch (error) {
    console.error("BOOKING ERROR:", error);

    res.status(500).json({
      message: "Could not create booking.",
    });
  }
});

/* =========================================================
   GET MY BOOKINGS
========================================================= */

app.get("/api/bookings", authenticate, (req, res) => {
  try {
    const bookings = db
      .prepare(
        `
        SELECT *
        FROM bookings
        WHERE user_id = ?
        ORDER BY id DESC
        `
      )
      .all(req.user.id);

    res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("GET BOOKINGS ERROR:", error);

    res.status(500).json({
      message: "Could not load bookings.",
    });
  }
});

/* =========================================================
   GET ONE BOOKING
========================================================= */

app.get("/api/bookings/:id", authenticate, (req, res) => {
  try {
    const booking = db
      .prepare(
        `
        SELECT *
        FROM bookings
        WHERE id = ?
        AND user_id = ?
        `
      )
      .get(
        Number(req.params.id),
        req.user.id
      );

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found.",
      });
    }

    const payments = db
      .prepare(
        `
        SELECT *
        FROM payments
        WHERE booking_id = ?
        ORDER BY id DESC
        `
      )
      .all(booking.id);

    const receipt = db
      .prepare(
        `
        SELECT *
        FROM receipts
        WHERE booking_id = ?
        `
      )
      .get(booking.id);

    res.json({
      success: true,
      booking,
      payments,
      receipt: receipt || null,
    });
  } catch (error) {
    console.error("GET BOOKING ERROR:", error);

    res.status(500).json({
      message: "Could not load booking.",
    });
  }
});

/* =========================================================
   PAYMENT RECORD
   This does NOT confirm payment.
========================================================= */

app.post(
  "/api/bookings/:id/payment",
  authenticate,
  (req, res) => {
    try {
      const bookingId = Number(req.params.id);

      const {
        method,
        amount,
        transactionReference,
      } = req.body;

      const booking = db
        .prepare(
          `
          SELECT *
          FROM bookings
          WHERE id = ?
          AND user_id = ?
          `
        )
        .get(bookingId, req.user.id);

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found.",
        });
      }

      if (booking.payment_status === "PAID") {
        return res.status(400).json({
          message: "This booking has already been paid.",
        });
      }

      if (!method || !amount) {
        return res.status(400).json({
          message: "Payment method and amount are required.",
        });
      }

      if (Number(amount) !== Number(booking.amount)) {
        return res.status(400).json({
          message:
            "Payment amount does not match the booking amount.",
        });
      }

      const result = db
        .prepare(
          `
          INSERT INTO payments
          (
            booking_id,
            method,
            amount,
            transaction_reference,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, 'PENDING', ?)
          `
        )
        .run(
          bookingId,
          method,
          Number(amount),
          transactionReference || null,
          now()
        );

      const payment = db
        .prepare(
          `
          SELECT *
          FROM payments
          WHERE id = ?
          `
        )
        .get(result.lastInsertRowid);

      res.status(201).json({
        success: true,
        message:
          "Payment request recorded. It must be verified by the payment provider before the booking is confirmed.",
        payment,
      });
    } catch (error) {
      console.error("PAYMENT ERROR:", error);

      res.status(500).json({
        message: "Could not record payment.",
      });
    }
  }
);

/* =========================================================
   PAYMENT STATUS
========================================================= */

app.get(
  "/api/bookings/:id/payment-status",
  authenticate,
  (req, res) => {
    try {
      const booking = db
        .prepare(
          `
          SELECT *
          FROM bookings
          WHERE id = ?
          AND user_id = ?
          `
        )
        .get(
          Number(req.params.id),
          req.user.id
        );

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found.",
        });
      }

      const payments = db
        .prepare(
          `
          SELECT *
          FROM payments
          WHERE booking_id = ?
          ORDER BY id DESC
          `
        )
        .all(booking.id);

      res.json({
        success: true,
        bookingId: booking.id,
        bookingNumber: booking.booking_number,
        paymentStatus: booking.payment_status,
        bookingStatus: booking.booking_status,
        payments,
      });
    } catch (error) {
      console.error("PAYMENT STATUS ERROR:", error);

      res.status(500).json({
        message: "Could not check payment status.",
      });
    }
  }
);

/* =========================================================
   MPESA CALLBACK
   IMPORTANT:
   This endpoint will later be connected to Safaricom
   Daraja API verification.
========================================================= */

app.post("/api/payments/mpesa/callback", (req, res) => {
  try {
    console.log(
      "M-PESA CALLBACK RECEIVED:",
      JSON.stringify(req.body, null, 2)
    );

    /*
      DO NOT mark a booking as paid here yet.

      The real Daraja callback handling will be added
      after your M-Pesa credentials and callback URL
      are configured.

      The booking will only become CONFIRMED after
      successful server-side payment verification.
    */

    res.json({
      ResultCode: 0,
      ResultDesc: "Callback received.",
    });
  } catch (error) {
    console.error("MPESA CALLBACK ERROR:", error);

    res.status(500).json({
      ResultCode: 1,
      ResultDesc: "Callback processing failed.",
    });
  }
});

/* =========================================================
   RECEIPT
========================================================= */

app.get(
  "/api/bookings/:id/receipt",
  authenticate,
  (req, res) => {
    try {
      const booking = db
        .prepare(
          `
          SELECT
            bookings.*,
            users.name,
            users.email,
            users.phone
          FROM bookings
          INNER JOIN users
          ON bookings.user_id = users.id
          WHERE bookings.id = ?
          AND bookings.user_id = ?
          `
        )
        .get(
          Number(req.params.id),
          req.user.id
        );

      if (!booking) {
        return res.status(404).json({
          message: "Booking not found.",
        });
      }

      if (booking.payment_status !== "PAID") {
        return res.status(403).json({
          message:
            "Receipt is available only after successful payment verification.",
        });
      }

      let receipt = db
        .prepare(
          `
          SELECT *
          FROM receipts
          WHERE booking_id = ?
          `
        )
        .get(booking.id);

      if (!receipt) {
        const receiptNumber = generateReceiptNumber();

        db.prepare(
          `
          INSERT INTO receipts
          (
            booking_id,
            receipt_number,
            issued_at
          )
          VALUES (?, ?, ?)
          `
        ).run(
          booking.id,
          receiptNumber,
          now()
        );

        receipt = db
          .prepare(
            `
            SELECT *
            FROM receipts
            WHERE booking_id = ?
            `
          )
          .get(booking.id);
      }

      res.json({
        success: true,
        receipt,
        booking,
      });
    } catch (error) {
      console.error("RECEIPT ERROR:", error);

      res.status(500).json({
        message: "Could not generate receipt.",
      });
    }
  }
);

/* =========================================================
   SOCKET.IO
========================================================= */

const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("QUIVA socket connected:", socket.id);

  socket.on("authenticate", (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const userId = Number(decoded.id);

      onlineUsers.set(userId, socket.id);

      socket.userId = userId;
      socket.join(`user_${userId}`);

      io.emit("user_online", {
        userId,
      });

      console.log(
        `User ${userId} is online.`
      );
    } catch (error) {
      console.log(
        "Socket authentication failed."
      );
    }
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);

      io.emit("user_offline", {
        userId: socket.userId,
      });

      console.log(
        `User ${socket.userId} went offline.`
      );
    }

    console.log(
      "QUIVA socket disconnected:",
      socket.id
    );
  });
});

/* =========================================================
   START SERVER
========================================================= */

server.listen(PORT, () => {
  console.log("=================================");
  console.log("QUIVA SERVER IS RUNNING");
  console.log(`http://localhost:${PORT}`);
  console.log("QUIVA DATABASE: SQLite");
  console.log("QUIVA REAL-TIME CHAT: READY");
  console.log("QUIVA BOOKINGS: READY");
  console.log("QUIVA PAYMENTS: READY");
  console.log("QUIVA RECEIPTS: READY");
  console.log("=================================");
});