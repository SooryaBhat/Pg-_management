# 🚀 Quick Start Guide

Get your PG Manager React app running in 3 minutes!

## Step 1: Navigate to Project
```bash
cd pg-manager-react
```

## Step 2: Install Dependencies
```bash
npm install
```

This will install:
- React 18
- React DOM 18
- Vite 5
- React plugin for Vite

**Expected time:** 1-2 minutes

## Step 3: Start Development Server
```bash
npm run dev
```

**You should see:**
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

## Step 4: Open in Browser
Visit: `http://localhost:5173`

You should see the **PG Manager login screen**!

---

## 🎮 Test the App

### Login Flow
1. Click **Login** tab
2. Enter any phone number and password
3. Click **Login** button
4. You'll be logged in as a student

### Student Features to Try
- **Home Tab:**
  - Toggle breakfast/dinner switches
  - Click calendar dates to select meals
  - Navigate between months

- **Chat Tab:**
  - Type a message
  - Click send or press Enter

- **Payments Tab:**
  - View payment summary
  - Click "Pay Now" to see QR placeholder
  - Click "I have paid" to change status

### Admin View (Coming Soon)
Currently logs in as student. To test admin:
1. In `src/components/AuthScreen.jsx`, change:
   ```javascript
   onLogin('student'); // Change to 'admin'
   ```

---

## 📁 Project Structure (Quick Reference)

```
pg-manager-react/
├── src/
│   ├── components/          # All React components
│   ├── App.jsx             # Main app
│   ├── main.jsx           # Entry point
│   └── index.css          # All styles
├── index.html             # HTML template
└── package.json          # Dependencies
```

---

## 🛠️ Common Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build  
npm run preview

# Stop dev server
Ctrl + C (in terminal)
```

---

## 🔧 Troubleshooting

### Port Already in Use?
```bash
# Vite will auto-increment port
# Or specify a different port:
npm run dev -- --port 3000
```

### Dependencies Won't Install?
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and try again
rm -rf node_modules
npm install
```

### Changes Not Reflecting?
- Save your files (Ctrl/Cmd + S)
- Check terminal for errors
- Hard refresh browser (Ctrl/Cmd + Shift + R)

### Module Not Found Error?
```bash
# Make sure you're in the right directory
pwd  # Should show: .../pg-manager-react

# Reinstall dependencies
npm install
```

---

## 🎯 Next: Add Firebase

Once your app is running, follow these steps to add Firebase:

1. **Install Firebase**
   ```bash
   npm install firebase
   ```

2. **Create Firebase Project**
   - Go to https://console.firebase.google.com
   - Create new project
   - Enable Authentication and Firestore

3. **Add Firebase Config**
   - Create `src/firebase/config.js`
   - Copy your Firebase config

4. **Implement Authentication**
   - Replace placeholders in `AuthScreen.jsx`
   - Add phone/email auth

See `PROJECT_STRUCTURE.md` for detailed Firebase integration guide.

---

## ✅ You're All Set!

Your React app is now running. Start coding! 🎉

**Resources:**
- React Docs: https://react.dev
- Vite Docs: https://vitejs.dev
- Firebase Docs: https://firebase.google.com/docs

**Questions?** Check `README.md` or `PROJECT_STRUCTURE.md`
