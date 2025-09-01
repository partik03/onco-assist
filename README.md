# 🩺 Onco-Assist

> An AI-powered caregiver workflow built with [n8n](https://n8n.io), designed to organize medical reports, track medicine prices, and keep families & doctors updated — all in real-time.

---

## 🌟 Why Onco-Assist?

Managing oncology treatments often means juggling **dozens of reports, prescriptions, invoices, and medicines**.  
Onco-Assist was born out of a personal journey of supporting my mother through her treatment.  

Instead of drowning in PDFs and emails, I built a system that **classifies, organizes, and alerts automatically** — turning medical chaos into clarity.

---

## ✨ Features

### 📧 Email-Driven Automation
- Uses **Gmail Trigger** to catch every new hospital email (reports, prescriptions, invoices).  
- No more missed attachments or digging through inboxes.  

### 🧠 Smart Classification
- Classifies incoming documents into:
  - PET/CT & Histopathology reports
  - Blood tests
  - Bills & invoices
  - Medicines & prescriptions  

### 📑 Report Management
- **Google Docs integration**:
  - If a report already exists → updates it.  
  - If not → creates a new one automatically.  
- Always up-to-date documents, ready to share with doctors.  

### 💊 Medicine Price Tracker
- Integrates with **Bright Data** to scrape [GoodRx](https://www.goodrx.com/) prices.  
- Fetches:
  - Lowest & original price  
  - Pharmacy details
  - Related drugs & conditions  
- Helps compare and save on critical medicines.  

### 📲 Real-Time Alerts
- **Twilio SMS/WhatsApp integration** sends instant updates:
  - “Your latest PET/CT report has been added.”  
  - “Invoices draft is ready for review and to be sent”  
- Keeps caregivers, patients, and doctors on the same page.  

### 📊 Google Sheets Sync
- Stores **medicine names → GoodRx URLs** mapping.  
- Automatically updates sheets with new drug lookups.  
- Provides a structured dataset for reference or further analysis.  

---

## 🔧 Tech Stack

- [n8n](https://n8n.io) – automation backbone  
- **Google Workspace APIs** – Gmail, Google Docs, Google Sheets  
- **Bright Data** – Web scraping for drug prices  
- **Twilio** – SMS & WhatsApp notifications  
- **OpenAI / LLMs** – Text classification and summarization  

---

## 🚀 How It Works (Workflow Overview)

1. **Gmail Trigger** → Detects new hospital email.  
2. **Text Classifier** → Categorizes it (report / test / bill / medicine).  
3. **Docs Flow** → Creates or updates a Google Doc for that report type.  
4. **Sheets Flow** → Generates GoodRx URLs for medicines and logs them.  
5. **Bright Data Scraper** → Fetches price & pharmacy info.  
6. **Notifier** → Sends real-time SMS/WhatsApp alerts.  

---

## 📌 Roadmap

- [ ] Add voice support (so patients can ask “What’s my latest report?”)  
- [ ] Doctor dashboard for direct access to latest reports  
- [ ] Insurance integration for claim tracking  
- [ ] Expand beyond oncology use cases  

---

## ❤️ Motivation

This project was built not for a client, but for my **mother**.  
To reclaim time from paperwork, and give it back to what matters — **care and presence**.  

---

## 📜 License

MIT License

---

