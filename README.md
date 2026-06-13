# 🏠 PG Food & Rent Manager

A simple web application to manage food selection and rent payments for a PG (Paying Guest) system.

🌐 **Live App:** https://pg-food-rent-manager.web.app

---

## 🚀 Overview

This app helps PG owners and students manage:

* Daily and advance food selection
* Monthly rent and food payment tracking
* Admin monitoring of all students

It is designed to be simple, fast, and easy to use on mobile devices.

---

## 👨‍🎓 Student Features

* 🔐 Login using phone number
* 🍽️ Select breakfast and dinner
* 📅 Plan food in advance using calendar
* 💰 View total rent + food amount
* 📲 Make payment and update status

---

## 🧑‍💼 Admin Features

* 👥 View all students in one place
* 📊 Track:

  * Total students
  * Paid / Pending users
* 💵 See:

  * Rent amount
  * Food usage (days)
  * Total payable amount
* ✅ Update payment status (Pending → Paid → Confirmed)

---

## 💰 Payment Logic

* Breakfast = ₹35
* Dinner = ₹40

Total amount is calculated automatically based on:

* Food days selected
* Monthly rent

---

## 🛠️ Tech Stack

* **React (Vite)** – Frontend
* **Firebase Authentication** – Login system
* **Firebase Firestore** – Database
* **Firebase Hosting** – Deployment

---

## 📁 Project Structure

```
src/
 ├── components/
 │    ├── AuthScreen.jsx
 │    ├── StudentHome.jsx
 │    ├── AdminHome.jsx
 │    ├── Payment.jsx
 │    └── Chat.jsx
 ├── App.jsx
 └── firebase.js
```

---

## ⚙️ Setup (For Developers)

```bash
npm install
npm run dev
```

Build and deploy:

```bash
npm run build
firebase deploy
```

---

## 📌 Current Status

This is the first version of the app with core features.
More features and improvements will be added in future updates.

---

## 🙌 Author

Developed by **Soorya Bhat**

---

## 📄 Note

This project is built for real-world PG management use and learning purposes.
