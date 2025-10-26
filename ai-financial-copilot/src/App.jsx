import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth"; // Corrected import syntax
import { 
  getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, 
  collection, query, orderBy, updateDoc, serverTimestamp, setLogLevel 
} from "firebase/firestore";

/* --- Firebase Configuration (from .env) --- */
const firebaseConfigString = import.meta.env.VITE_FIREBASE_CONFIG;

let firebaseConfig = {};
try {
  firebaseConfig = firebaseConfigString ? JSON.parse(firebaseConfigString) : {};
} catch (err) {
  console.error("❌ Invalid Firebase config JSON:", err);
}

if (!firebaseConfig.apiKey) {
  console.error("❌ Firebase config missing or invalid. Check .env file.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel("info");

const appId = (firebaseConfig.appId || "local-app").replace(/[\/]/g, "_");

/* --- Gemini API Configuration (from .env) --- */
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!API_KEY) {
  console.error("❌ Gemini API key missing in .env");
}
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`;



/* --- Main App Component --- */
function App() {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // This listener works the same way
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
          const newUserId = user.uid;
          setUserId(newUserId);
          // Ensure user document exists at the correct path
          const userDocRef = doc(db, `artifacts/${appId}/users`, newUserId); 
          getDoc(userDocRef).then(docSnap => {
            if (!docSnap.exists()) {
              setDoc(userDocRef, { createdAt: serverTimestamp(), uid: newUserId });
            }
          });
        } else {
          setUserId(null);
        }
        setIsAuthReady(true);
      });

      // Sign in using the correct method for the environment
      try {
        await signInAnonymously(auth);
      } catch (error) {
         console.error("Sign-in error:", error);
      }

      return () => unsubscribe();
    };
    
    // Only initialize if config seems valid
    if (firebaseConfig.apiKey) {
      initAuth();
    } else {
      console.error("Firebase apiKey is missing. App cannot initialize.");
      // You could set an error state here
      setIsAuthReady(false); // Keep the loading screen
    }
  }, []); // appId is now derived from config, so it's fine

  if (!isAuthReady || !userId) {
     if (!firebaseConfig.apiKey) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-700">
          <IconXCircle className="h-12 w-12" />
          <h1 className="mt-4 text-xl font-bold">Firebase Configuration Error</h1>
          <p className="mt-2 text-center">Firebase configuration is missing or invalid.</p>
          <p className="mt-1 text-sm text-gray-600">Please check the environment setup.</p>
        </div>
      );
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <IconArrowPath className="h-8 w-8 text-indigo-600 animate-spin" />
        <span className="ml-3 text-lg font-medium text-gray-700">Connecting to Co-pilot...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-inter">
      <Header userId={userId} />
      <main className="container mx-auto max-w-7xl p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <TravelItinerary userId={userId} />
            <TransactionsFeed userId={userId} />
          </div>
          <div className="lg:col-span-1 space-y-6 flex flex-col">
            <FinancialChatbot userId={userId} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* --- Header Component --- */
function Header({ userId }) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto max-w-7xl px-4 lg:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <IconLifebuoy className="h-8 w-8 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">AI Financial Co-pilot</h1>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-xs text-gray-400 hidden sm:block">User ID: {userId}</span>
          <button className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <IconBell className="h-6 w-6" />
          </button>
          <button className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <IconUserCircle className="h-6 w-6" />
          </button>
        </div>
      </div>
    </header>
  );
}

/* --- Transactions Feed Component --- */
function TransactionsFeed({ userId }) {
  const [transactions, setTransactions] = useState([]);
  const [itinerary, setItinerary] = useState(null);
  const processingTxIds = useRef(new Set());

  // Subscribe to itinerary
  useEffect(() => {
    if (!userId) return;
    const itineraryDocRef = doc(db, `artifacts/${appId}/users/${userId}/itinerary/main`); // Corrected path
    const unsubscribe = onSnapshot(itineraryDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setItinerary(docSnap.data());
      } else {
        setItinerary(null);
      }
    }, (error) => console.error("Error subscribing to itinerary:", error));
    return () => unsubscribe();
  }, [userId]);

  // Subscribe to transactions
  useEffect(() => {
    if (!userId) return;
    const txColRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`); // Corrected path
    const q = query(txColRef, orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(txs);
      
      const currentUserId = auth.currentUser?.uid;
      if (currentUserId) {
        txs.forEach(tx => {
          if (tx.status === 'pending' && !processingTxIds.current.has(tx.id)) {
            processTransaction(tx, itinerary, currentUserId);
          }
        });
      }
    }, (error) => console.error("Error subscribing to transactions:", error));
    return () => unsubscribe();
  }, [userId, itinerary]);

  // Transaction Processing Pipeline
  const processTransaction = async (tx, itin, currentUserId) => {
    if (processingTxIds.current.has(tx.id)) return;
    processingTxIds.current.add(tx.id);

    const txDocRef = doc(db, `artifacts/${appId}/users/${currentUserId}/transactions`, tx.id); // Corrected path

    try {
      // 1. Run "PyTorch" Anomaly Detection
      const { isAnomaly, reason } = mockPyTorchAnomalyModel(tx, itin);

      if (!isAnomaly) {
        await updateDoc(txDocRef, { status: "verified" });
        processingTxIds.current.delete(tx.id);
        return;
      }

      // 2. Is an anomaly - update UI to "analyzing" immediately
      await updateDoc(txDocRef, { 
        status: "analyzing",
        anomalyReason: reason 
      });

      // 3. Call Gemini API in background for security insight
      const prompt = `
        You are a bank's fraud detection AI.
        A transaction was flagged as an anomaly.
        Reason: "${reason}"
        Transaction: ${JSON.stringify(tx)}
        User Itinerary: ${JSON.stringify(itin)}
        
        Write a brief, single-paragraph security alert for the user. Be friendly, explain the *exact* reason it was flagged (e.g., "it's in Tokyo but your itinerary..."), and ask them to verify it.
      `;

      const insight = await callGemini(prompt);

      // 4. Final update with AI insight
      await updateDoc(txDocRef, {
        status: "requires_verification",
        aiInsight: insight
      });

    } catch (error) {
      console.error("Error processing transaction:", error);
      try {
        await updateDoc(txDocRef, { 
          status: "error", 
          aiInsight: "An error occurred during analysis." 
        });
      } catch (updateError) {
        console.error("Error updating tx to error state:", updateError);
      }
    } finally {
      processingTxIds.current.delete(tx.id);
    }
  };

  const addMockTransaction = async () => {
    const mockTxs = [
      { name: "Amazon Marketplace", amount: 120.50, category: "Shopping" },
      { name: "Uber Trip", amount: 25.10, category: "Travel", location: "Tokyo, JP" },
      { name: "Netflix Subscription", amount: 15.99, category: "Subscriptions" },
      { name: "United Airlines", amount: 850.00, category: "Travel", location: "San Francisco, US" },
      { name: "Whole Foods", amount: 75.20, category: "Groceries" },
      { name: "Local Coffee Shop", amount: 5.75, category: "Food & Drink", location: "Osaka, JP"}
    ];
    const randomTx = mockTxs[Math.floor(Math.random() * mockTxs.length)];

    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/transactions`), { // Corrected path
        ...randomTx,
        timestamp: serverTimestamp(),
        status: "pending" // All new transactions start as pending
      });
    } catch (error) {
      console.error("Error adding mock transaction:", error);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="p-4 lg:p-6 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Transaction Feed</h2>
        <button
          onClick={addMockTransaction}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <IconPlus className="h-5 w-5 mr-2" />
          Add Tx
        </button>
      </div>
      <div className="divide-y divide-gray-200">
        {transactions.length === 0 ? (
          <p className="p-6 text-gray-500">No transactions yet. Click "Add Tx" to add one.</p>
        ) : (
          transactions.map(tx => (
            <TransactionItem key={tx.id} tx={tx} userId={userId} /> 
          ))
        )}
      </div>
    </div>
  );
}

/* --- Transaction Item Component --- */
function TransactionItem({ tx, userId }) { 
  const [isVerifying, setIsVerifying] = useState(false);

  const getStatusIcon = (status) => {
    switch (status) {
      case "verified":
        return <IconCheckCircle className="h-6 w-6 text-green-500" />;
      case "requires_verification":
        return <IconExclamationTriangle className="h-6 w-6 text-red-500" />;
      case "analyzing":
        return <IconArrowPath className="h-6 w-6 text-yellow-500 animate-spin" />;
      case "pending":
        return <IconArrowPath className="h-6 w-6 text-gray-400 animate-spin" />;
      case "error":
        return <IconXCircle className="h-6 w-6 text-red-700" />;
      default:
        return <IconLifebuoy className="h-6 w-6 text-gray-400" />;
    }
  };

  const handleVerification = async (isVerified) => {
    setIsVerifying(true);
    const txDocRef = doc(db, `artifacts/${appId}/users/${userId}/transactions`, tx.id);

    try {
      // Update transaction status in Firestore
      await updateDoc(txDocRef, {
        status: isVerified ? "verified" : "error",
        aiInsight: isVerified ? "Manually verified by user." : "User marked as fraudulent.",
      });

      // If user marked it as fraud, enqueue an email notification
      if (!isVerified) {
        const mailQueueRef = collection(db, `artifacts/${appId}/public/data/mailQueue`);
        await addDoc(mailQueueRef, {
          to: "masteravi2003@gmail.com",
          subject: "⚠️ FRAUD ALERT: User Reported a Suspicious Transaction",
          body: `
  A user has flagged a transaction as fraudulent.

  User ID: ${userId}
  Transaction ID: ${tx.id}
  Merchant: ${tx.name}
  Amount: $${tx.amount.toFixed(2)}
  Category: ${tx.category}
  Location: ${tx.location || "N/A"}
  Timestamp: ${tx.timestamp ? new Date(tx.timestamp.toDate()).toLocaleString() : "N/A"}

  Please review this transaction immediately.`,
          createdAt: serverTimestamp(),
          userId: userId,
        });

        console.log("📧 Fraud alert mail queued for masteravi2003@gmail.com");
      }
    } catch (error) {
      console.error("Error verifying transaction or queuing mail:", error);
    } finally {
      setIsVerifying(false);
    }
  };


  const isAnomaly = tx.status === "requires_verification" || tx.status === "analyzing" || tx.status === "error";

  return (
    <div className={`p-4 lg:p-6 ${isAnomaly ? 'bg-red-50' : 'bg-white'}`}>
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0 pt-1">
          {getStatusIcon(tx.status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 truncate">{tx.name}</span>
            <span className={`text-lg font-bold ${isAnomaly ? 'text-red-600' : 'text-gray-900'}`}>
              -${tx.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-gray-500">{tx.category} {tx.location ? `· ${tx.location}` : ''}</span>
            <span className="text-sm text-gray-500">
              {tx.timestamp ? new Date(tx.timestamp.toDate()).toLocaleDateString() : 'Just now'}
            </span>
          </div>
          
          {isAnomaly && (
            <div className="mt-4 p-4 bg-white border border-red-200 rounded-lg">
              <h4 className="text-sm font-bold text-red-800">Security Alert</h4>
              {tx.status === 'analyzing' && (
                 <div className="flex items-center text-sm text-gray-700 mt-2">
                   <IconArrowPath className="h-4 w-4 mr-2 animate-spin" />
                   Analyzing potential risk...
                 </div>
              )}
              {tx.aiInsight && tx.status !== 'analyzing' && ( // Don't show old insight while re-analyzing
                <p className="text-sm text-gray-700 mt-2">{tx.aiInsight}</p>
              )}
              
              {tx.status === 'requires_verification' && (
                <div className="flex items-center space-x-3 mt-4">
                  <button
                    onClick={() => handleVerification(true)}
                    disabled={isVerifying}
                    className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {isVerifying ? 'Saving...' : 'Yes, this was me'}
                  </button>
                  <button
                    onClick={() => handleVerification(false)}
                    disabled={isVerifying}
                    className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    {isVerifying ? 'Saving...' : 'No, this wasn\'t me'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Travel Itinerary Component --- */
function TravelItinerary({ userId }) {
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [itinerary, setItinerary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const itineraryDocRef = doc(db, `artifacts/${appId}/users/${userId}/itinerary/main`); // Corrected path

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onSnapshot(itineraryDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setItinerary(data);
        setLocation(data.location);
        setStartDate(data.startDate);
        setEndDate(data.endDate);
        setIsEditing(false);
      } else {
        setItinerary(null);
        setIsEditing(true); // No itinerary, open editor
      }
    }, (error) => console.error("Error subscribing to itinerary:", error));
    return () => unsubscribe();
  }, [userId]);

  const handleSave = async () => {
    if (!location || !startDate || !endDate) {
      alert("Please fill in all fields.");
      return;
    }
    setIsLoading(true);
    try {
      await setDoc(itineraryDocRef, { location, startDate, endDate });
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving itinerary:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const testAnomaly = async () => {
    if (!itinerary) {
      alert("Please set an itinerary first.");
      return;
    }

    const anomalyTx = {
      name: "Fraudulent Charge",
      amount: 999.00,
      category: "Shopping",
      location: "Moscow, RU", // A location far from the itinerary
      timestamp: serverTimestamp(),
      status: "pending"
    };

    try {
      // Add the anomaly transaction
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/transactions`), anomalyTx); // Corrected path
      
      // Also add to mail queue (simulation)
      const mailQueueRef = collection(db, `artifacts/${appId}/public/data/mailQueue`); // Corrected path
      await addDoc(mailQueueRef, {
        to: "masteravi2003@gmail.com",
        subject: "SECURITY ALERT: Potential Fraud Detected",
        body: `A suspicious transaction was detected and needs your review: ${JSON.stringify(anomalyTx)}`,
        createdAt: serverTimestamp(),
        userId: userId
      });

    } catch (error) {
      console.error("Error testing anomaly:", error);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Travel Mode</h2>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Edit
          </button>
        )}
      </div>
      
      {isEditing ? (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location (e.g., Tokyo, JP)</label>
            <input
              type="text"
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">End Date</label>
              <input
                type="date"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-indigo-600 text-white font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? <IconArrowPath className="h-5 w-5 mx-auto animate-spin" /> : "Save Itinerary"}
          </button>
        </div>
      ) : (
        <div className="mt-4 p-4 bg-indigo-50 rounded-lg flex items-center justify-between">
          <div>
            {itinerary ? (
              <>
                <p className="font-medium text-indigo-800">{itinerary.location}</p>
                <p className="text-sm text-indigo-700">
                  {itinerary.startDate ? new Date(itinerary.startDate).toLocaleDateString() : ''} - {itinerary.endDate ? new Date(itinerary.endDate).toLocaleDateString() : ''}
                </p>
                <button
                  onClick={testAnomaly}
                  className="mt-3 px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full hover:bg-yellow-500"
                >
                  Test Anomaly
                </button>
              </>
            ) : (
              <p className="text-gray-500">No active travel plans.</p>
            )}
          </div>
          <IconGlobeAlt className="h-16 w-16 text-indigo-100" />
        </div>
      )}
    </div>
  );
}

/* --- Financial Chatbot Component --- */
function FinancialChatbot({ userId }) {
  const [messages, setMessages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  
  const chatHistoryRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`); // Corrected path

  useEffect(() => {
    if (!userId) return;
    // Subscribe to chat history
    const q = query(chatHistoryRef, orderBy("timestamp"));
    const unsubscribeChat = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data()));
    }, (error) => console.error("Error subscribing to chat:", error));

    // Subscribe to transactions for context
    const txColRef = collection(db, `artifacts/${appId}/users/${userId}/transactions`); // Corrected path
    const qTx = query(txColRef, orderBy("timestamp", "desc"));
    const unsubscribeTx = onSnapshot(qTx, (snapshot) => {
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(txs);
    }, (error) => console.error("Error subscribing to transactions for chat:", error));

    return () => {
      unsubscribeChat();
      unsubscribeTx();
    };
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: "user", text: input, timestamp: serverTimestamp() };
    
    setInput("");
    setIsLoading(true);
    setMessages(prevMessages => [...prevMessages, userMessage]); // Optimistic update

    // Add user message to Firestore
    try {
      await addDoc(chatHistoryRef, userMessage);
    } catch (error) {
       console.error("Error saving user message:", error);
       setIsLoading(false);
       // Revert optimistic update
       setMessages(prevMessages => prevMessages.slice(0, -1));
       setInput(userMessage.text); // Put text back
       return;
    }
    
    // Prepare context for Gemini
    const txSummary = transactions
      .filter(tx => tx.status === 'verified') // Only use verified transactions for financial advice
      .map(tx => (
      `${tx.name} ($${tx.amount.toFixed(2)}) in ${tx.category} on ${tx.timestamp ? new Date(tx.timestamp.toDate()).toLocaleDateString() : 'N/A'}`
    )).join("\n");

    const chatHistoryForPrompt = [...messages, userMessage] // Use the latest state
      .map(m => `${m.role}: ${m.text}`)
      .join("\n");

    const systemPrompt = `
      You are a helpful AI financial co-pilot.
      You MUST answer questions based ONLY on the user's provided verified transaction data.
      Do not make up information. If the answer isn't in the data, say you can't find it.
      Be concise and friendly.
      
      CURRENT CHAT HISTORY (for context, do not repeat):
      ${chatHistoryForPrompt}
      
      USER'S VERIFIED TRANSACTION DATA (this is your only source of financial truth):
      ${txSummary || "No verified transactions found."}
    `;
    const userQuery = userMessage.text;

    try {
      const aiResponseText = await callGemini(userQuery, systemPrompt);
      const aiMessage = { role: "model", text: aiResponseText, timestamp: serverTimestamp() };
      
      // Add AI response to Firestore
      await addDoc(chatHistoryRef, aiMessage);
      // Note: The onSnapshot listener will automatically update the messages state

    } catch (error) {
      console.error("Gemini API error:", error);
      const errorMessage = { role: "model", text: "Sorry, I'm having trouble connecting. Please try again.", timestamp: serverTimestamp() };
      await addDoc(chatHistoryRef, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg flex flex-col h-[700px]">
      <div className="p-4 lg:p-6 border-b border-gray-200 flex items-center space-x-3">
        <IconChatBubbleLeftRight className="h-6 w-6 text-indigo-600" />
        <h2 className="text-xl font-bold text-gray-900">AI Co-pilot Chat</h2>
      </div>
      <div className="flex-1 p-4 lg:p-6 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-500">
            Ask me about your spending! (e.g., "How much did I spend on Travel?")
          </div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`px-4 py-3 rounded-2xl max-w-xs lg:max-w-md ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-br-none' 
                : 'bg-gray-100 text-gray-800 rounded-bl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-none px-4 py-3">
              <IconArrowPath className="h-5 w-5 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 lg:p-6 border-t border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your spending..."
            className="flex-1 block w-full px-4 py-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="p-3 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <IconPaperAirplane className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- Gemini API Helper --- */
async function callGemini(userQuery, systemPrompt = "") {
  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
      return candidate.content.parts[0].text;
    } else {
      console.warn("Gemini response was missing expected content:", result);
      return "Sorry, I couldn't generate a response.";
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Sorry, I'm having trouble connecting to the AI. Please try again.";
  }
}

/* --- Mock "PyTorch" Anomaly Model --- */
function mockPyTorchAnomalyModel(tx, itinerary) {
  // Rule 1: High value transaction
  if (tx.amount > 900) {
    return { isAnomaly: true, reason: "Transaction amount is unusually high." };
  }

  // Rule 2: Travel itinerary mismatch
  if (itinerary && (tx.category === "Travel" || tx.location)) {
    const txLocation = tx.location?.split(',')[0].toLowerCase();
    const itineraryLocation = itinerary.location?.split(',')[0].toLowerCase();

    if (txLocation && itineraryLocation && txLocation !== itineraryLocation) {
      const txDate = tx.timestamp ? tx.timestamp.toDate() : new Date();
      // Adjust dates to be at the start of the day for comparison
      const startDate = new Date(itinerary.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(itinerary.endDate);
      endDate.setHours(23, 59, 59, 999); // Set to end of day

      // Check if transaction date is within itinerary dates
      if (txDate >= startDate && txDate <= endDate) {
        return { 
          isAnomaly: true, 
          reason: `Transaction location "${tx.location}" does not match your active travel itinerary for "${itinerary.location}".` 
        };
      }
    }
  }

  // Rule 3: Specific merchant names
  if (tx.name.toLowerCase().includes("fraudulent")) {
    return { isAnomaly: true, reason: "Transaction merchant is on a known fraud list." };
  }

  return { isAnomaly: false, reason: null };
}

/* --- Inline SVG Icon Components --- */

function IconArrowPath({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.318a.75.75 0 0 0-1.5 0v3.183l-1.903-1.903A9 9 0 0 0 3.059 10.059v0c0 .17.006.338.017.504a.75.75 0 0 0 1.498-.035c-.01-.163-.015-.328-.015-.496v0ZM18.5 14.25a.75.75 0 0 0-1.5 0v3.183l-1.903-1.903a7.5 7.5 0 0 0-12.548 3.364l-1.903-1.903h3.183a.75.75 0 0 0 0-1.5H3.008a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.183l1.903 1.903A9 9 0 0 1 20.94 13.941v0c0-.17-.006-.338-.017-.504a.75.75 0 0 0-1.498.035c.01.163.015.328.015.496v0Z" clipRule="evenodd" />
    </svg>
  );
}

function IconBell({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-2.42 0-4.72.9-6.46 2.41a.75.75 0 0 0 .96 1.14A8.251 8.251 0 0 1 12 4.5c2.18 0 4.22.85 5.76 2.28a.75.75 0 0 0 .96-1.14A9.703 9.703 0 0 0 12 2.25ZM13.5 6a.75.75 0 0 1 .75.75v.008a6.75 6.75 0 0 1 5.92 5.034.75.75 0 0 1-1.48.22A5.25 5.25 0 0 0 13.5 6.75v-.008a.75.75 0 0 1-.75-.75Zm-3 0a.75.75 0 0 0-.75.75v.008a6.75 6.75 0 0 0-5.92 5.034.75.75 0 0 0 1.48.22A5.25 5.25 0 0 1 10.5 6.75v-.008a.75.75 0 0 0 .75-.75Z" clipRule="evenodd" />
      <path d="M12 18.75a.75.75 0 0 0 .75-.75V16.5a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 .75.75Z" />
      <path fillRule="evenodd" d="M8.006 4.636a.75.75 0 0 1 1.058-.06A9.718 9.718 0 0 1 12 4.5c.83 0 1.643.105 2.422.308a.75.75 0 0 1 .978 1.03A8.232 8.232 0 0 0 13.5 9v3.43c.808.232 1.556.59 2.222 1.05a.75.75 0 0 1-.9 1.21c-.55-.38-1.18-.68-1.822-.87V9a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75v4.82c-.642.19-1.272.49-1.822.87a.75.75 0 0 1-.9-1.21c.666-.46 1.414-.818 2.222-1.05V9a8.232 8.232 0 0 0-1.956-3.124.75.75 0 0 1-.06-1.058ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
      <path d="M14.25 18a.75.75 0 0 0 .75.75h1.5a.75.75 0 0 0 .75-.75V16.5a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 1-.75.75Z" />
      <path d="M8.25 18a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V16.5a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 0 .75.75Z" />
    </svg>
  );
}

function IconChatBubbleLeftRight({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 1 0 16.188V7.812a6.707 6.707 0 0 1 4.804-5.456.75.75 0 0 1 .842.842A5.207 5.207 0 0 0 3.75 7.812v8.376a5.207 5.207 0 0 0 1.896 4.628.75.75 0 0 1-.842.828Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M7.348 2.274a.75.75 0 0 1 .842-.842A6.707 6.707 0 0 1 13.646 0h2.536a6.707 6.707 0 0 1 5.456 4.804.75.75 0 0 1-.828.842A5.207 5.207 0 0 0 16.182 3.75h-2.536a5.207 5.207 0 0 0-4.628 1.896.75.75 0 0 1-.842-.828Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M19.196 2.356A6.707 6.707 0 0 1 24 7.812v8.376a6.707 6.707 0 0 1-4.804 5.456.75.75 0 0 1-.842-.842A5.207 5.207 0 0 0 20.25 16.188V7.812a5.207 5.207 0 0 0-1.896-4.628.75.75 0 0 1 .842-.828Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M16.652 21.726a.75.75 0 0 1-.842.842A6.707 6.707 0 0 1 10.354 24h-2.536a6.707 6.707 0 0 1-5.456-4.804.75.75 0 0 1 .828-.842A5.207 5.207 0 0 0 7.818 20.25h2.536a5.207 5.207 0 0 0 4.628-1.896.75.75 0 0 1 .842.828Z" clipRule="evenodd" />
    </svg>
  );
}

function IconCheckCircle({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.25 3.25-1.5-1.5a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.5-4.5Z" clipRule="evenodd" />
    </svg>
  );
}

function IconExclamationTriangle({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.557 13.004c1.155 2-.29 4.5-2.599 4.5H4.443c-2.309 0-3.753-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
    </svg>
  );
}

function IconGlobeAlt({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.25 3v1.5c0 .621.504 1.125 1.125 1.125h1.5a.75.75 0 0 0 0-1.5H13.5V3a.75.75 0 0 0-1.5 0ZM10.5 4.875A3.375 3.375 0 0 0 7.125 8.25v1.5a.75.75 0 0 0 1.5 0v-1.5a1.875 1.875 0 0 1 1.875-1.875h1.5a.75.75 0 0 0 0-1.5h-1.5ZM4.875 10.5A3.375 3.375 0 0 0 1.5 13.875v1.5a.75.75 0 0 0 1.5 0v-1.5a1.875 1.875 0 0 1 1.875-1.875h1.5a.75.75 0 0 0 0-1.5h-1.5Z" />
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM8.625 14.625a.75.75 0 0 0-1.5 0v2.625a.75.75 0 0 0 1.5 0v-2.625Zm-1.5 4.5a.75.75 0 0 1 .75-.75h2.625a.75.75 0 0 1 0 1.5H7.875a.75.75 0 0 1-.75-.75Zm5.625-1.5a.75.75 0 0 0 1.5 0v-2.625a.75.75 0 0 0-1.5 0v2.625Zm1.5-4.5a.75.75 0 0 1-.75.75H12a.75.75 0 0 1 0-1.5h2.625a.75.75 0 0 1 .75.75Zm-5.625 1.5a.75.75 0 0 0-1.5 0v2.625a.75.75 0 0 0 1.5 0v-2.625Zm-1.5 4.5a.75.75 0 0 1 .75-.75h2.625a.75.75 0 0 1 0 1.5H7.875a.75.75 0 0 1-.75-.75Zm5.625-1.5a.75.75 0 0 0 1.5 0v-2.625a.75.75 0 0 0-1.5 0v2.625Zm1.5-4.5a.75.75 0 0 1-.75.75H12a.75.75 0 0 1 0-1.5h2.625a.75.75 0 0 1 .75.75Z" clipRule="evenodd" />
    </svg>
  );
}

function IconLifebuoy({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM11.103 7.097c.338-.062.68-.097 1.028-.097.348 0 .69.035 1.028.097.316.058.622.13.916.218a.75.75 0 0 1 .64 1.303 6.72 6.72 0 0 0-1.584 1.584.75.75 0 0 1-1.303-.64c.088-.294.16-.6.218-.916Zm-2.206 0c.088.294.16.6.218.916a.75.75 0 0 1-1.303.64 6.72 6.72 0 0 0-1.584-1.584.75.75 0 0 1 .64-1.303c.294-.088.6-.16.916-.218ZM12 11.25a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75Zm-4.903 5.803c-.338.062-.68.097-1.028.097-.348 0-.69-.035-1.028-.097a.75.75 0 0 1-.64-1.303 6.72 6.72 0 0 0 1.584-1.584.75.75 0 0 1 1.303.64c-.088.294-.16.6-.218.916Zm11.012-1.303a.75.75 0 0 1-.64 1.303c-.294.088-.6.16-.916.218-.338.062-.68.097-1.028.097-.348 0-.69-.035-1.028-.097-.316-.058-.622-.13-.916-.218a.75.75 0 0 1-.64-1.303 6.72 6.72 0 0 0 1.584-1.584.75.75 0 0 1 1.303.64c-.088.294-.16.6-.218.916Z" clipRule="evenodd" />
    </svg>
  );
}

function IconPaperAirplane({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.941l18-8.25a.75.75 0 0 0 0-1.352l-18-8.25Z" />
    </svg>
  );
}

function IconPlus({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
    </svg>
  );
}

function IconUserCircle({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653ZM10.5 6a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM12 12.75a5.25 5.25 0 0 0-5.25 5.25v.244a.75.75 0 0 0 .75.75h9a.75.75 0 0 0 .75-.75v-.244a5.25 5.25 0 0 0-5.25-5.25Z" clipRule="evenodd" />
    </svg>
  );
}

function IconXCircle({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clipRule="evenodd" />
    </svg>
  );
}

export default App;

