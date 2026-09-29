import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./index.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const events = [
  {
    id: 1,
    title: "QUIVA Live Night",
    date: "4 October 2026",
    description: "Music, food, drinks and an unforgettable night at QUIVA.",
    price: 3000,
  
  },
  {
    id: 2,
    title: "Saturday Night Experience",
    date: "10 October 2026",
    description: "Premium entertainment and great company.",
    price: 2500,
  },
  {
    id: 3,
    title: "QUIVA Weekend Party",
    date: "17 October 2026",
    description: "Join QUIVA members for another premium weekend.",
    price: 2000,
  },
];

const offers = [
  {
    id: 1,
    discount: "20% OFF",
    title: "Member Dining",
    text: "Enjoy selected restaurant offers as a QUIVA member.",
  },
  {
    id: 2,
    discount: "15% OFF",
    title: "Weekend Stay",
    text: "Special rates available for selected weekend rooms.",
  },
  {
    id: 3,
    discount: "VIP",
    title: "Event Members",
    text: "Members receive access to selected QUIVA experiences.",
  },
];

const menuItems = [
  {
    id: 1,
    name: "QUIVA Signature Burger",
    description: "Premium beef burger with fries.",
    price: 850,
  },
  {
    id: 2,
    name: "Chicken Platter",
    description: "Grilled chicken served with sides.",
    price: 1200,
  },
  {
    id: 3,
    name: "Premium Steak",
    description: "Tender steak prepared to order.",
    price: 2200,
  },
  {
    id: 4,
    name: "QUIVA Special Pizza",
    description: "Freshly prepared premium pizza.",
    price: 1400,
  },
];

const rooms = [
  {
    id: 1,
    name: "Deluxe Room",
    description: "Comfortable premium room for your stay.",
    price: 4500,
  },
  {
    id: 2,
    name: "Executive Room",
    description: "Spacious room with an elevated experience.",
    price: 6500,
  },
  {
    id: 3,
    name: "Premium Suite",
    description: "Our premium accommodation experience.",
    price: 9500,
  },
];

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("quivaUser")) || null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => localStorage.getItem("quivaToken") || ""
  );

  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  const [activePage, setActivePage] = useState("Home");

  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notifications, setNotifications] = useState([]);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [bookingModal, setBookingModal] = useState(null);
  const [bookingType, setBookingType] = useState("table");

  const [bookingForm, setBookingForm] = useState({
    date: "",
    time: "",
    guests: "2",
  });

  const [myBookings, setMyBookings] = useState([]);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  const filteredMembers = useMemo(() => {
    const search = memberSearch.toLowerCase().trim();

    if (!search) {
      return members;
    }

    return members.filter((member) =>
      member.name?.toLowerCase().includes(search)
    );
  }, [members, memberSearch]);

  const totalUnread = Object.values(unreadCounts).reduce(
    (total, count) => total + Number(count || 0),
    0
  );

  useEffect(() => {
    if (!user || !token) return;

    loadMembers();
    loadBookings();

    const socket = io(API_URL, {
      auth: {
        token,
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("QUIVA real-time chat connected.");
    });

    socket.on("user_online", (userId) => {
      setOnlineUsers((previous) => {
        const next = new Set(previous);
        next.add(Number(userId));
        return next;
      });
    });

    socket.on("user_offline", (userId) => {
      setOnlineUsers((previous) => {
        const next = new Set(previous);
        next.delete(Number(userId));
        return next;
      });
    });

    socket.on("new_message", (message) => {
      const senderId = Number(message.sender_id);

      if (
        selectedMember &&
        Number(selectedMember.id) === senderId
      ) {
        setMessages((previous) => [...previous, message]);

        markMessagesRead(senderId);
      } else {
        setUnreadCounts((previous) => ({
          ...previous,
          [senderId]: (previous[senderId] || 0) + 1,
        }));

        setNotifications((previous) => [
          {
            id: Date.now(),
            text: "You received a new QUIVA message.",
          },
          ...previous,
        ]);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthMessage("");

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      localStorage.setItem("quivaToken", data.token);
      localStorage.setItem(
        "quivaUser",
        JSON.stringify(data.user)
      );

      setToken(data.token);
      setUser(data.user);

      setLoginForm({
        email: "",
        password: "",
      });
    } catch (error) {
      setAuthMessage(
        error.message || "Unable to login."
      );
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setAuthMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(registerForm),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Registration failed."
        );
      }

      localStorage.setItem("quivaToken", data.token);
      localStorage.setItem(
        "quivaUser",
        JSON.stringify(data.user)
      );

      setToken(data.token);
      setUser(data.user);

      setRegisterForm({
        name: "",
        email: "",
        phone: "",
        password: "",
      });
    } catch (error) {
      setAuthMessage(
        error.message || "Unable to create account."
      );
    }
  }

  function logout() {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    localStorage.removeItem("quivaToken");
    localStorage.removeItem("quivaUser");

    setToken("");
    setUser(null);
    setSelectedMember(null);
    setMessages([]);
    setActivePage("Home");
  }

  async function loadMembers(search = "") {
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/members?search=${encodeURIComponent(
          search
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();

      setMembers(data.members || data || []);
    } catch (error) {
      console.error("Members error:", error);
    }
  }

  async function openChat(member) {
    setSelectedMember(member);
    setActivePage("Chats");

    try {
      const response = await fetch(
        `${API_URL}/api/messages/${member.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load messages."
        );
      }

      setMessages(data.messages || data || []);

      markMessagesRead(member.id);

      setUnreadCounts((previous) => ({
        ...previous,
        [member.id]: 0,
      }));
    } catch (error) {
      console.error("Messages error:", error);
    }
  }

  async function markMessagesRead(userId) {
    try {
      await fetch(
        `${API_URL}/api/messages/${userId}/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      console.error("Read error:", error);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();

    if (!messageText.trim() || !selectedMember) {
      return;
    }

    const text = messageText.trim();

    try {
      const response = await fetch(
        `${API_URL}/api/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receiverId: selectedMember.id,
            message: text,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to send message."
        );
      }

      const sentMessage =
        data.message || data;

      setMessages((previous) => [
        ...previous,
        sentMessage,
      ]);

      setMessageText("");
    } catch (error) {
      alert(
        error.message || "Unable to send message."
      );
    }
  }

  function openBooking(item, type) {
    setBookingType(type);

    setBookingForm({
      date: "",
      time: "",
      guests: "2",
    });

    setBookingModal({
      item,
    });
  }

  async function submitBooking(event) {
    event.preventDefault();

    if (!bookingForm.date || !bookingForm.time) {
      alert("Please select a date and time.");
      return;
    }

    if (!token || !user) {
      alert("Please log in to continue.");
      return;
    }

    if (!bookingModal) {
      alert("Please select a booking first.");
      return;
    }

    try {
      const item = bookingModal.item;

      const serviceName =
        item?.name ||
        item?.title ||
        "QUIVA Booking";

      const amount = Number(item?.price || 0);

      const response = await fetch(
        `${API_URL}/api/bookings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            bookingType,
            serviceName,
            bookingDate: bookingForm.date,
            bookingTime: bookingForm.time,
            guests:
              bookingType === "room"
                ? 1
                : Number(bookingForm.guests || 1),
            amount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to create booking."
        );
      }

      setBookingModal(null);

      await loadBookings();

      alert(
        `Booking created successfully.\n\n` +
          `Booking Number: ${
            data.booking?.booking_number ||
            "Pending"
          }\n\n` +
          `Payment is required before QUIVA can confirm this booking.`
      );

      setActivePage("Bookings");
    } catch (error) {
      console.error("Booking error:", error);

      alert(
        error.message ||
          "Something went wrong while creating your booking."
      );
    }
  }

  async function loadBookings() {
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/bookings`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();

      setMyBookings(data.bookings || data || []);
    } catch (error) {
      console.error("Bookings error:", error);
    }
  }

  function eventChat(eventItem) {
    const prompt = `Hi! Tell me more about ${eventItem.title}.`;

    setActivePage("Chats");

    setTimeout(() => {
      if (!selectedMember) {
        setNotifications((previous) => [
          {
            id: Date.now(),
            text: prompt,
          },
          ...previous,
        ]);
      }
    }, 100);
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-background"></div>

        <div className="auth-card">
          <div className="auth-brand">
            <div className="quiva-mark">Q</div>

            <div>
              <h1>QUIVA</h1>
              <span>
                CLUB • RESTAURANT • HOTEL
              </span>
            </div>
          </div>

          <div className="auth-heading">
            <h2>
              {authMode === "login"
                ? "Welcome back"
                : "Join QUIVA"}
            </h2>

            <p>
              {authMode === "login"
                ? "Sign in to continue to your QUIVA account."
                : "Create your free QUIVA member account."}
            </p>
          </div>

          {authMessage && (
            <div className="auth-message">
              {authMessage}
            </div>
          )}

          {authMode === "login" ? (
            <form
              onSubmit={handleLogin}
              className="auth-form"
            >
              <label>Email</label>

              <input
                type="email"
                placeholder="Enter your email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm({
                    ...loginForm,
                    email: event.target.value,
                  })
                }
                required
              />

              <label>Password</label>

              <input
                type="password"
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm({
                    ...loginForm,
                    password: event.target.value,
                  })
                }
                required
              />

              <button
                type="submit"
                className="primary-button"
              >
                LOGIN
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleRegister}
              className="auth-form"
            >
              <label>Full Name</label>

              <input
                type="text"
                placeholder="Your full name"
                value={registerForm.name}
                onChange={(event) =>
                  setRegisterForm({
                    ...registerForm,
                    name: event.target.value,
                  })
                }
                required
              />

              <label>Email</label>

              <input
                type="email"
                placeholder="Your email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm({
                    ...registerForm,
                    email: event.target.value,
                  })
                }
                required
              />

              <label>Phone Number</label>

              <input
                type="tel"
                placeholder="+254..."
                value={registerForm.phone}
                onChange={(event) =>
                  setRegisterForm({
                    ...registerForm,
                    phone: event.target.value,
                  })
                }
                required
              />

              <label>Password</label>

              <input
                type="password"
                placeholder="Create a password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm({
                    ...registerForm,
                    password: event.target.value,
                  })
                }
                required
              />

              <button
                type="submit"
                className="primary-button"
              >
                CREATE ACCOUNT
              </button>
            </form>
          )}

          <div className="auth-switch">
            {authMode === "login" ? (
              <>
                <span>
                  Don't have a QUIVA account?
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthMessage("");
                  }}
                >
                  REGISTER
                </button>
              </>
            ) : (
              <>
                <span>
                  Already have a QUIVA account?
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthMessage("");
                  }}
                >
                  LOGIN
                </button>
              </>
            )}
          </div>

          <div className="auth-footer">
            <span>© 2026 QUIVA</span>
            <span>Premium Experience</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="quiva-mark small">
            Q
          </div>

          <div>
            <strong>QUIVA</strong>
            <span>MEMBERS</span>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="avatar">
            {user.name
              ?.charAt(0)
              ?.toUpperCase() || "Q"}
          </div>

          <div className="sidebar-user-info">
            <strong>{user.name}</strong>

            <span>
              <i className="online-dot"></i>
              Online
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={
              activePage === "Home"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Home")
            }
          >
            <span>⌂</span>
            Home
          </button>

          <button
            className={
              activePage === "Chats"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Chats")
            }
          >
            <span>◈</span>
            Chats

            {totalUnread > 0 && (
              <b className="nav-badge">
                {totalUnread}
              </b>
            )}
          </button>

          <button
            className={
              activePage === "Members"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Members")
            }
          >
            <span>♙</span>
            Members
          </button>

          <button
            className={
              activePage === "Events"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Events")
            }
          >
            <span>★</span>
            Events
          </button>

          <button
            className={
              activePage === "Restaurant"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Restaurant")
            }
          >
            <span>♨</span>
            Restaurant
          </button>

          <button
            className={
              activePage === "Rooms"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Rooms")
            }
          >
            <span>▣</span>
            Rooms
          </button>

          <button
            className={
              activePage === "Bookings"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Bookings")
            }
          >
            <span>▤</span>
            My Bookings
          </button>

          <button
            className={
              activePage === "Offers"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Offers")
            }
          >
            <span>◆</span>
            Offers
          </button>

          <button
            className={
              activePage === "Settings"
                ? "active"
                : ""
            }
            onClick={() =>
              setActivePage("Settings")
            }
          >
            <span>⚙</span>
            Settings
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button
            className="logout-side-button"
            onClick={logout}
          >
            <span>↪</span>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="quiva-mark small">
              Q
            </div>
            <strong>QUIVA</strong>
          </div>

          <div className="global-search">
            <span>⌕</span>

            <input
              placeholder="Search people..."
              value={memberSearch}
              onChange={(event) => {
                setMemberSearch(
                  event.target.value
                );
                loadMembers(
                  event.target.value
                );
              }}
            />
          </div>

          <div className="topbar-actions">
            <button
              className="notification-button"
              onClick={() =>
                setShowNotifications(
                  !showNotifications
                )
              }
            >
              ♢

              {notifications.length > 0 && (
                <b>{notifications.length}</b>
              )}
            </button>

            <div className="profile-container">
              <button
                className="profile-button"
                onClick={() =>
                  setShowProfileMenu(
                    !showProfileMenu
                  )
                }
              >
                <div className="avatar small-avatar">
                  {user.name
                    ?.charAt(0)
                    ?.toUpperCase() || "Q"}
                </div>

                <div className="profile-name">
                  <strong>{user.name}</strong>
                  <span>QUIVA Member</span>
                </div>

                <span>⌄</span>
              </button>

              {showProfileMenu && (
                <div className="profile-menu">
                  <div className="profile-menu-header">
                    <div className="avatar">
                      {user.name
                        ?.charAt(0)
                        ?.toUpperCase() || "Q"}
                    </div>

                    <div>
                      <strong>
                        {user.name}
                      </strong>
                      <span>
                        {user.email}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActivePage(
                        "Settings"
                      );
                      setShowProfileMenu(
                        false
                      );
                    }}
                  >
                    ⚙ Settings
                  </button>

                  <button
                    className="danger-button"
                    onClick={logout}
                  >
                    ↪ Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {showNotifications && (
            <div className="notifications-panel">
              <div className="panel-title">
                <strong>
                  Notifications
                </strong>

                <button
                  onClick={() =>
                    setNotifications([])
                  }
                >
                  Clear
                </button>
              </div>

              {notifications.length === 0 ? (
                <p>
                  No new notifications.
                </p>
              ) : (
                notifications.map(
                  (notification) => (
                    <div
                      className="notification-item"
                      key={notification.id}
                    >
                      <span>●</span>
                      <p>
                        {notification.text}
                      </p>
                    </div>
                  )
                )
              )}
            </div>
          )}
        </header>

        <section className="page-content">

          {activePage === "Home" && (
            <div className="home-page">
              <div className="hero-card">
                <div>
                  <span className="eyebrow">
                    WELCOME TO QUIVA
                  </span>

                  <h1>
                    Your place to
                    <br />
                    <strong>
                      connect & experience.
                    </strong>
                  </h1>

                  <p>
                    Chat with QUIVA members,
                    discover events, enjoy
                    great food and book
                    premium rooms.
                  </p>

                  <div className="hero-buttons">
                    <button
                      className="primary-button"
                      onClick={() =>
                        setActivePage(
                          "Events"
                        )
                      }
                    >
                      EXPLORE EVENTS
                    </button>

                    <button
                      className="outline-button"
                      onClick={() =>
                        setActivePage(
                          "Restaurant"
                        )
                      }
                    >
                      VIEW RESTAURANT
                    </button>
                  </div>
                </div>

                <div className="hero-symbol">
                  Q
                </div>
              </div>

              <div className="welcome-row">
                <div>
                  <span className="eyebrow">
                    YOUR ACCOUNT
                  </span>

                  <h2>
                    Welcome, {user.name}
                  </h2>

                  <p>
                    You are logged in as a
                    QUIVA member.
                  </p>
                </div>

                <button
                  className="outline-button"
                  onClick={() =>
                    setActivePage(
                      "Chats"
                    )
                  }
                >
                  START CHATTING
                </button>
              </div>

              <div className="quick-grid">
                <button
                  onClick={() =>
                    setActivePage(
                      "Chats"
                    )
                  }
                  className="quick-card"
                >
                  <span>◈</span>
                  <strong>Chat</strong>
                  <small>
                    Connect with members
                  </small>
                </button>

                <button
                  onClick={() =>
                    setActivePage(
                      "Events"
                    )
                  }
                  className="quick-card"
                >
                  <span>★</span>
                  <strong>Events</strong>
                  <small>
                    Discover what's happening
                  </small>
                </button>

                <button
                  onClick={() =>
                    setActivePage(
                      "Restaurant"
                    )
                  }
                  className="quick-card"
                >
                  <span>♨</span>
                  <strong>
                    Restaurant
                  </strong>
                  <small>
                    Explore our menu
                  </small>
                </button>

                <button
                  onClick={() =>
                    setActivePage(
                      "Rooms"
                    )
                  }
                  className="quick-card"
                >
                  <span>▣</span>
                  <strong>Rooms</strong>
                  <small>
                    Find your stay
                  </small>
                </button>
              </div>

              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    COMING UP
                  </span>

                  <h2>
                    Upcoming Events
                  </h2>
                </div>

                <button
                  onClick={() =>
                    setActivePage(
                      "Events"
                    )
                  }
                  className="text-button"
                >
                  View all →
                </button>
              </div>

              <div className="event-grid">
                {events
                  .slice(0, 3)
                  .map((event) => (
                    <div
                      className="event-card"
                      key={event.id}
                    >
                      <div className="event-image">
                        <span>
                          QUIVA
                        </span>
                      </div>

                      <div className="event-body">
                        <span className="event-date">
                          {event.date}
                        </span>

                        <h3>
                          {event.title}
                        </h3>

                        <p>
                          {event.description}
                        </p>

                        <div className="card-bottom">
                          <strong>
                            KSh{" "}
                            {event.price.toLocaleString()}
                          </strong>

                          <button
                            onClick={() =>
                              openBooking(
                                event,
                                "event"
                              )
                            }
                          >
                            BOOK
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    SPECIAL
                  </span>

                  <h2>
                    Member Offers
                  </h2>
                </div>
              </div>

              <div className="offers-grid">
                {offers.map(
                  (offer) => (
                    <div
                      className="offer-card"
                      key={offer.id}
                    >
                      <span>
                        {offer.discount}
                      </span>

                      <h3>
                        {offer.title}
                      </h3>

                      <p>
                        {offer.text}
                      </p>

                      <button
                        onClick={() =>
                          setActivePage(
                            "Offers"
                          )
                        }
                      >
                        VIEW OFFER
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Chats" && (
            <div className="chat-page">
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    COMMUNITY
                  </span>

                  <h1>Chats</h1>
                </div>

                <span className="page-count">
                  {members.length} members
                </span>
              </div>

              <div className="chat-layout">
                <div className="conversation-list">
                  <div className="conversation-search">
                    <span>⌕</span>

                    <input
                      placeholder="Search members..."
                      value={memberSearch}
                      onChange={(event) => {
                        setMemberSearch(
                          event.target.value
                        );
                        loadMembers(
                          event.target.value
                        );
                      }}
                    />
                  </div>

                  {filteredMembers.length ===
                  0 ? (
                    <div className="empty-small">
                      <strong>
                        No members found
                      </strong>

                      <p>
                        Register another
                        QUIVA account to
                        start chatting.
                      </p>
                    </div>
                  ) : (
                    filteredMembers.map(
                      (member) => (
                        <button
                          key={member.id}
                          className={`conversation-item ${
                            selectedMember?.id ===
                            member.id
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            openChat(
                              member
                            )
                          }
                        >
                          <div className="avatar">
                            {member.name
                              ?.charAt(
                                0
                              )
                              ?.toUpperCase() ||
                              "Q"}

                            {onlineUsers.has(
                              Number(
                                member.id
                              )
                            ) && (
                              <i className="avatar-online"></i>
                            )}
                          </div>

                          <div className="conversation-info">
                            <strong>
                              {member.name}
                            </strong>

                            <span>
                              {onlineUsers.has(
                                Number(
                                  member.id
                                )
                              )
                                ? "Online"
                                : "Offline"}
                            </span>
                          </div>

                          {unreadCounts[
                            member.id
                          ] > 0 && (
                            <b className="unread-badge">
                              {
                                unreadCounts[
                                  member.id
                                ]
                              }
                            </b>
                          )}
                        </button>
                      )
                    )
                  )}
                </div>

                <div className="chat-window">
                  {!selectedMember ? (
                    <div className="chat-empty">
                      <div className="chat-empty-icon">
                        ◈
                      </div>

                      <h2>
                        Start a conversation
                      </h2>

                      <p>
                        Select a QUIVA member
                        from the left to
                        start chatting.
                      </p>

                      <button
                        className="primary-button"
                        onClick={() =>
                          setActivePage(
                            "Members"
                          )
                        }
                      >
                        FIND MEMBERS
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="chat-header">
                        <div className="avatar">
                          {selectedMember.name
                            ?.charAt(
                              0
                            )
                            ?.toUpperCase() ||
                            "Q"}
                        </div>

                        <div>
                          <strong>
                            {
                              selectedMember.name
                            }
                          </strong>

                          <span>
                            {onlineUsers.has(
                              Number(
                                selectedMember.id
                              )
                            )
                              ? "Online"
                              : "Offline"}
                          </span>
                        </div>
                      </div>

                      <div className="messages-area">
                        {messages.length ===
                        0 ? (
                          <div className="chat-empty">
                            <div className="chat-empty-icon">
                              ◈
                            </div>

                            <h2>
                              No messages yet
                            </h2>

                            <p>
                              Start the
                              conversation.
                            </p>
                          </div>
                        ) : (
                          messages.map(
                            (message) => {
                              const mine =
                                Number(
                                  message.sender_id
                                ) ===
                                Number(
                                  user.id
                                );

                              return (
                                <div
                                  key={
                                    message.id
                                  }
                                  className={`message-row ${
                                    mine
                                      ? "mine"
                                      : ""
                                  }`}
                                >
                                  <div className="message-bubble">
                                    {
                                      message.message
                                    }

                                    <small>
                                      {message.created_at
                                        ? new Date(
                                            message.created_at
                                          ).toLocaleTimeString(
                                            [],
                                            {
                                              hour: "2-digit",
                                              minute:
                                                "2-digit",
                                            }
                                          )
                                        : ""}
                                    </small>
                                  </div>
                                </div>
                              );
                            }
                          )
                        )}

                        <div
                          ref={
                            messagesEndRef
                          }
                        />
                      </div>

                      <form
                        className="chat-input-area"
                        onSubmit={
                          sendMessage
                        }
                      >
                        <input
                          value={
                            messageText
                          }
                          onChange={(
                            event
                          ) =>
                            setMessageText(
                              event.target
                                .value
                            )
                          }
                          placeholder="Write a message..."
                        />

                        <button
                          type="submit"
                          className="primary-button"
                        >
                          SEND
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePage === "Members" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    COMMUNITY
                  </span>

                  <h1>Members</h1>
                </div>

                <span className="page-count">
                  {members.length} members
                </span>
              </div>

              <div className="member-grid">
                {filteredMembers.map(
                  (member) => (
                    <div
                      className="member-card"
                      key={member.id}
                    >
                      <div className="avatar large-avatar">
                        {member.name
                          ?.charAt(0)
                          ?.toUpperCase() ||
                          "Q"}
                      </div>

                      <h3>
                        {member.name}
                      </h3>

                      <span>
                        {onlineUsers.has(
                          Number(
                            member.id
                          )
                        )
                          ? "Online"
                          : "Offline"}
                      </span>

                      <button
                        className="primary-button"
                        onClick={() =>
                          openChat(
                            member
                          )
                        }
                      >
                        CHAT
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Events" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    WHAT'S ON
                  </span>

                  <h1>
                    Upcoming Events
                  </h1>
                </div>
              </div>

              <div className="event-grid">
                {events.map(
                  (event) => (
                    <div
                      className="event-card"
                      key={event.id}
                    >
                      <div className="event-image">
                        <span>
                          QUIVA
                        </span>
                      </div>

                      <div className="event-body">
                        <span className="event-date">
                          {event.date}
                        </span>

                        <h3>
                          {event.title}
                        </h3>

                        <p>
                          {event.description}
                        </p>

                        <div className="card-bottom">
                          <strong>
                            KSh{" "}
                            {event.price.toLocaleString()}
                          </strong>

                          <div>
                            <button
                              onClick={() =>
                                eventChat(
                                  event
                                )
                              }
                            >
                              CHAT
                            </button>

                            <button
                              onClick={() =>
                                openBooking(
                                  event,
                                  "event"
                                )
                              }
                            >
                              BOOK
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Restaurant" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    DINING
                  </span>

                  <h1>
                    QUIVA Restaurant
                  </h1>
                </div>

                <button
                  className="primary-button"
                  onClick={() =>
                    openBooking(
                      {
                        name:
                          "Restaurant Table",
                        price: 0,
                      },
                      "table"
                    )
                  }
                >
                  BOOK A TABLE
                </button>
              </div>

              <div className="menu-grid">
                {menuItems.map(
                  (item) => (
                    <div
                      className="menu-card"
                      key={item.id}
                    >
                      <div className="menu-card-image">
                        QUIVA
                      </div>

                      <div>
                        <h3>
                          {item.name}
                        </h3>

                        <p>
                          {item.description}
                        </p>

                        <div className="card-bottom">
                          <strong>
                            KSh{" "}
                            {item.price.toLocaleString()}
                          </strong>

                          <button
                            className="primary-button"
                            onClick={() =>
                              openBooking(
                                item,
                                "table"
                              )
                            }
                          >
                            ORDER
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Rooms" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    ACCOMMODATION
                  </span>

                  <h1>
                    QUIVA Rooms
                  </h1>
                </div>
              </div>

              <div className="room-grid">
                {rooms.map(
                  (room) => (
                    <div
                      className="room-card"
                      key={room.id}
                    >
                      <div className="room-image">
                        QUIVA
                      </div>

                      <div className="room-body">
                        <span className="eyebrow">
                          PREMIUM STAY
                        </span>

                        <h2>
                          {room.name}
                        </h2>

                        <p>
                          {room.description}
                        </p>

                        <div className="card-bottom">
                          <strong>
                            KSh{" "}
                            {room.price.toLocaleString()}
                            <small>
                              / night
                            </small>
                          </strong>

                          <button
                            className="primary-button"
                            onClick={() =>
                              openBooking(
                                room,
                                "room"
                              )
                            }
                          >
                            BOOK ROOM
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Bookings" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    YOUR ACCOUNT
                  </span>

                  <h1>
                    My Bookings
                  </h1>
                </div>
              </div>

              {myBookings.length ===
              0 ? (
                <div className="empty-small">
                  <strong>
                    No bookings yet
                  </strong>

                  <p>
                    Your QUIVA bookings will
                    appear here.
                  </p>
                </div>
              ) : (
                <div className="booking-list">
                  {myBookings.map(
                    (booking) => (
                      <div
                        className="booking-card"
                        key={booking.id}
                      >
                        <div>
                          <span className="eyebrow">
                            {booking.booking_type}
                          </span>

                          <h2>
                            {
                              booking.service_name
                            }
                          </h2>

                          <p>
                            Booking Number:{" "}
                            <strong>
                              {
                                booking.booking_number
                              }
                            </strong>
                          </p>

                          <p>
                            Date:{" "}
                            {
                              booking.booking_date
                            }
                          </p>

                          <p>
                            Time:{" "}
                            {
                              booking.booking_time
                            }
                          </p>
                        </div>

                        <div>
                          <strong>
                            KSh{" "}
                            {Number(
                              booking.amount ||
                                0
                            ).toLocaleString()}
                          </strong>

                          <p>
                            Payment:{" "}
                            <b>
                              {
                                booking.payment_status
                              }
                            </b>
                          </p>

                          <p>
                            Booking:{" "}
                            <b>
                              {
                                booking.booking_status
                              }
                            </b>
                          </p>

                          {booking.payment_status !==
                            "PAID" && (
                            <button
                              className="primary-button"
                              onClick={() =>
                                alert(
                                  "Payment is required. M-Pesa payment verification will be connected next."
                                )
                              }
                            >
                              CONTINUE PAYMENT
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {activePage === "Offers" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    MEMBER BENEFITS
                  </span>

                  <h1>
                    Offers
                  </h1>
                </div>
              </div>

              <div className="offers-grid">
                {offers.map(
                  (offer) => (
                    <div
                      className="offer-card"
                      key={offer.id}
                    >
                      <span>
                        {offer.discount}
                      </span>

                      <h3>
                        {offer.title}
                      </h3>

                      <p>
                        {offer.text}
                      </p>

                      <button
                        onClick={() =>
                          setActivePage(
                            "Restaurant"
                          )
                        }
                      >
                        EXPLORE
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {activePage === "Settings" && (
            <div>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    ACCOUNT
                  </span>

                  <h1>
                    Settings
                  </h1>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-profile">
                  <div className="avatar large-avatar">
                    {user.name
                      ?.charAt(0)
                      ?.toUpperCase() ||
                      "Q"}
                  </div>

                  <div>
                    <h2>
                      {user.name}
                    </h2>

                    <p>
                      {user.email}
                    </p>

                    <p>
                      {user.phone}
                    </p>
                  </div>
                </div>

                <div className="settings-row">
                  <span>
                    Account
                  </span>

                  <strong>
                    QUIVA Member
                  </strong>
                </div>

                <div className="settings-row">
                  <span>
                    Messaging
                  </span>

                  <strong>
                    Enabled
                  </strong>
                </div>

                <div className="settings-row">
                  <span>
                    Booking verification
                  </span>

                  <strong>
                    Payment Required
                  </strong>
                </div>

                <button
                  className="danger-button"
                  onClick={logout}
                >
                  LOGOUT
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {bookingModal && (
        <div
          className="modal-overlay"
          onClick={() =>
            setBookingModal(null)
          }
        >
          <div
            className="booking-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">
                  {bookingType === "room"
                    ? "ROOM BOOKING"
                    : "BOOKING"}
                </span>

                <h2>
                  {bookingModal.item
                    .name ||
                    bookingModal.item
                      .title}
                </h2>
              </div>

              <button
                className="close-button"
                onClick={() =>
                  setBookingModal(null)
                }
              >
                ×
              </button>
            </div>

            <div className="payment-warning">
              <strong>
                Payment required
              </strong>

              <span>
                Your booking will only be
                confirmed after successful
                payment verification.
              </span>
            </div>

            <form
              className="booking-form"
              onSubmit={submitBooking}
            >
              <label>
                Date
              </label>

              <input
                type="date"
                value={
                  bookingForm.date
                }
                onChange={(event) =>
                  setBookingForm({
                    ...bookingForm,
                    date: event.target
                      .value,
                  })
                }
                required
              />

              <label>
                Time
              </label>

              <input
                type="time"
                value={
                  bookingForm.time
                }
                onChange={(event) =>
                  setBookingForm({
                    ...bookingForm,
                    time: event.target
                      .value,
                  })
                }
                required
              />

              {bookingType !==
                "room" && (
                <>
                  <label>
                    Number of Guests
                  </label>

                  <select
                    value={
                      bookingForm.guests
                    }
                    onChange={(event) =>
                      setBookingForm({
                        ...bookingForm,
                        guests:
                          event.target
                            .value,
                      })
                    }
                  >
                    <option value="1">
                      1 Guest
                    </option>
                    <option value="2">
                      2 Guests
                    </option>
                    <option value="3">
                      3 Guests
                    </option>
                    <option value="4">
                      4 Guests
                    </option>
                    <option value="5">
                      5 Guests
                    </option>
                    <option value="6">
                      6 Guests
                    </option>
                    <option value="7">
                      7 Guests
                    </option>
                    <option value="8">
                      8 Guests
                    </option>
                  </select>
                </>
              )}

              <div className="booking-summary">
                <span>
                  Service
                </span>

                <strong>
                  {bookingModal.item
                    .name ||
                    bookingModal.item
                      .title}
                </strong>

                {bookingModal.item
                  .price > 0 && (
                  <>
                    <span>
                      Amount
                    </span>

                    <strong>
                      KSh{" "}
                      {Number(
                        bookingModal
                          .item.price
                      ).toLocaleString()}
                    </strong>
                  </>
                )}
              </div>

              <button
                type="submit"
                className="primary-button full-button"
              >
                CONTINUE TO PAYMENT
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;