# 💸 AI-Powered Financial Co-pilot 🚀

A full-stack, demo-ready **Value-Added Service (VAS)** platform built with **React**, **Firebase**, and **Google's Gemini API**.  
This application acts as a **personal financial co-pilot**, offering enhanced security, intelligent expense management, and context-aware travel assistance.

> **Note:** This version is an all-in-one demo designed for showcasing capabilities. All core logic, including mock anomaly detection ("PyTorch Model") and Generative AI calls (Gemini API), is self-contained within the React frontend for ease of review and demonstration during interviews.

---

## ✨ Features

This platform integrates multiple AI-driven services into a cohesive user experience:

### 🛡️ Dynamic Fraud Shield (Travel Mode)
- Allows users to input their travel itineraries (location, dates).
- Utilizes a mock anomaly detection model (simulating PyTorch) that dynamically adjusts sensitivity based on the active itinerary.
- Effectively reduces false positives for legitimate travel spending while accurately flagging suspicious activity far from the planned location.
- Generates context-aware security alerts using the Gemini API.

### 💬 Conversational Expense & Subscription Manager
- Features a Generative AI chatbot (powered by Gemini) grounded in the user's verified transaction history.
- Automatically categorizes expenses and identifies recurring subscriptions (based on mock data).
- Allows users to ask natural language questions about their spending (e.g., “How much did I spend on Shopping last month?”, “List my current subscriptions.”).

### 🧠 Context-Aware Security Insights
- When the anomaly model flags a transaction, the raw alert is enriched using the Gemini API.
- Presents users with clear, plain-English explanations for why a transaction was flagged, incorporating details like location mismatch or unusual spending patterns.
- Provides simple “Yes/No” verification buttons for quick user feedback.

### 📧 Simulated Email Alerts
- Includes a “Test Anomaly” button to simulate a high-risk transaction guaranteed to trigger the fraud shield.
- Writes alert details to a mailQueue collection in Firestore, mimicking how a production system would trigger backend email notifications (e.g., via Firebase Cloud Functions).
- Also queues an email alert when a user explicitly marks a transaction as fraudulent (“No, this wasn't me”).

---

## 🛠️ Tech Stack

| Component | Technology |
|------------|-------------|
| **Frontend** | React (Vite), Tailwind CSS |
| **Database** | Google Firestore (Real-time NoSQL Database) |
| **Authentication** | Firebase Authentication (Anonymous Sign-in for demo) |
| **Generative AI** | Google Gemini API (via gemini-2.5-flash-preview-09-2025) |
| **Environment** | Node.js |
| **Containerization** | Docker, Docker Compose (Optional, for development) |

---

## 📸 Screenshots

- [Main Dashboard - Initial State & Travel Mode Setup](https://github.com/Avi2099GIT/AI-Financial-Copilot/blob/main/ai-financial-copilot/images/dashboard.png)
- [Transaction Feed showing verified transactions](https://github.com/Avi2099GIT/AI-Financial-Copilot/blob/main/ai-financial-copilot/images/transaction_feed.png)
- [Dashboard with Travel Mode active and AI Co-pilot Chat responding](https://github.com/Avi2099GIT/AI-Financial-Copilot/blob/main/ai-financial-copilot/images/chatbot.png)
- [Transaction Feed displaying a flagged anomaly with AI-generated insight and verification options](https://github.com/Avi2099GIT/AI-Financial-Copilot/blob/main/ai-financial-copilot/images/anomaly_detection.png)

---

## ⚙️ Setup & Installation

Follow these steps to get the project running locally:

### Prerequisites
- Node.js (LTS version recommended) installed. This includes npm.
- A Firebase project created.
- A Google AI (Gemini) API Key.

### Clone the Repository

```bash
git clone https://github.com/Avi2099GIT/AI-Financial-Copilot.git
cd AI-Financial-Copilot/ai-financial-copilot
```

### Install Dependencies
```bash
npm install
```

### Firebase Setup
1. Go to your Firebase project console.
2. **Authentication:** Go to Build > Authentication > Sign-in method and enable Anonymous sign-in.
3. **Firestore Database:** Go to Build > Firestore Database > Create database. Start in Test mode and publish the following rules under the “Rules” tab:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own private data
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Authenticated users can write to the public mail queue
    match /artifacts/{appId}/public/data/mailQueue/{document=**} {
      allow create: if request.auth != null;
    }
  }
}
```

### Get Firebase Config
In Firebase Project Settings → General → Your apps → Web, copy your Firebase config object.

### Configure Environment Variables
Create a file named `.env` in the project root and add:

```bash
VITE_FIREBASE_CONFIG='{"apiKey":"AIzaSy...","authDomain":"...","projectId":"..."}'
VITE_GEMINI_API_KEY="AIzaSy...your...gemini...key..."
```

---

## ▶️ Running the Application

### Development Mode
```bash
npm run dev
```
Then open your browser at [http://localhost:5173](http://localhost:5173).

### Using Docker (Optional)
```bash
docker-compose up --build
```
Then open your browser at [http://localhost:5173](http://localhost:5173).

---

## 📄 License

This project is licensed under the **MIT License**.  
See the LICENSE file for details.
