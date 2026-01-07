# 📧 Email Tracking Backend

A Node.js + Express backend application for tracking and processing emails using Google services, Firebase, and Gemini AI. This project provides APIs to parse email data, integrate with Google Calendar, and leverage generative AI for intelligent email insights.

---

## 🚀 Features

- 📬 Email parsing and tracking  
- 🤖 Gemini AI integration for email analysis  
- 📅 Google Calendar integration  
- 🔥 Firebase configuration support  
- ⚡ RESTful API built with Express  
- 🔐 Environment-based configuration using dotenv  

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js  
- **AI:** Google Gemini (`@google/generative-ai`)  
- **Database / Auth:** Firebase  
- **APIs:** Google Calendar API  
- **Utilities:** dotenv  
- **Dev Tools:** Nodemon  

---

## 📁 Project Structure

```
email-tracking-main/
│
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── firebase.js
│   │   └── googleConfig.js
│   ├── controllers/
│   │   └── emailController.js
│   ├── services/
│   │   ├── calendarService.js
│   │   └── geminiService.js
│   └── utils/
│       └── parser.js
│
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

---

## ⚙️ Installation

1. Clone the repository
```bash
git clone https://github.com/Varenya-ramayanam/email-tracking.git
cd email-tracking-main
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file
```env
PORT=5000
GEMINI_API_KEY = your-api-key
FIREBASE_SERVICE_ACCOUNT = "{your-credentials-in-json-format}"
```

---

## ▶️ Running the Project

### Development
```bash
npx nodemon src/app.js
```

### Production
```bash
node src/app.js
```

Server runs at:
```
http://localhost:5000
```

---

## 📡 API Overview

| Method | Endpoint | Description |
|------|---------|-------------|
| POST | /email/process | Parse and analyze email |
| GET | /calendar/events | Fetch calendar events |
| POST | /email/analyze | AI-based email insights |

---
