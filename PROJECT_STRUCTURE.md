# PG Manager React - Complete Project Structure

## 📦 Final Folder Structure

```
pg-manager-react/
│
├── index.html                     # Root HTML file (loads React app)
├── package.json                   # Dependencies and scripts
├── vite.config.js                 # Vite build configuration
├── .gitignore                     # Git ignore rules
├── README.md                      # Project documentation
│
└── src/
    ├── main.jsx                   # React app entry point
    ├── App.jsx                    # Main app component (routing & state)
    ├── index.css                  # All global styles
    │
    └── components/
        ├── Icons.jsx              # All SVG icons
        ├── AuthScreen.jsx         # Login/Signup screen
        ├── StudentHome.jsx        # Student dashboard
        ├── AdminHome.jsx          # Admin dashboard
        ├── Chat.jsx               # Group chat
        └── Payment.jsx            # Payment (student & admin views)
```

---

## 📄 File Details

### **Root Files**

#### `index.html`
- Basic HTML template
- Links to Google Fonts (Inter)
- Loads React app via `src/main.jsx`

#### `package.json`
- **Dependencies**: `react`, `react-dom`
- **DevDependencies**: `vite`, `@vitejs/plugin-react`
- **Scripts**:
  - `npm run dev` - Start dev server
  - `npm run build` - Build for production
  - `npm run preview` - Preview production build

#### `vite.config.js`
- Vite configuration with React plugin
- Optimized for development and production builds

---

### **Source Files (src/)**

#### `main.jsx` (Entry Point)
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

#### `App.jsx` (Main Component)
**State:**
- `isLoggedIn` - Auth status
- `userRole` - 'student' or 'admin'
- `activeTab` - 'home', 'chat', or 'payment'

**Renders:**
- `AuthScreen` (when not logged in)
- Student/Admin views based on role
- Bottom navigation bar

---

### **Component Files (src/components/)**

#### `Icons.jsx`
Exports all SVG icons as React components:
- `HomeIcon`
- `ChatIcon`
- `PaymentIcon`
- `BuildingIcon`
- `MegaphoneIcon`
- `ChevronLeft` / `ChevronRight`
- `SendIcon`
- `CloseIcon`

#### `AuthScreen.jsx`
**Props:** `onLogin(role)`

**State:**
- `activeTab` - 'login' or 'signup'
- `loginData` - { phone, password }
- `signupData` - { fullName, phone, password, roomNumber }

**Features:**
- Tab switching between login/signup
- Form inputs with validation (ready for Firebase)
- Calls `onLogin('student')` on success

---

#### `StudentHome.jsx`
**State:**
- `breakfast` / `dinner` - Today's food toggles
- `selectedDates` - Object mapping dates to meal selections
- `currentMonth` - Date object for calendar
- `showModal` - Date key for meal selection modal

**Features:**
- Announcement display
- Today's food selection toggles
- Calendar for advance planning
- Modal for selecting meals per date
- Navigation between months

---

#### `AdminHome.jsx`
**State:**
- `announcement` - Text input for announcements
- `showModal` - Which count card was clicked

**Features:**
- Announcement input and save button
- Three count cards:
  - Today's food count
  - Tomorrow's food count  
  - Upcoming advance selections
- Modal showing selected students (empty state for now)

---

#### `Chat.jsx`
**Props:** `isAdmin` (boolean)

**State:**
- `message` - Current message input

**Features:**
- Chat header
- Empty state (will show messages)
- Message input field
- Send button
- Enter key sends message

---

#### `Payment.jsx`
**Props:** `isStudent` (boolean)

**Student View State:**
- `showQR` - Toggle QR code display
- `paymentStatus` - 'pending' | 'paid' | 'confirmed'

**Features:**

**Student:**
- Monthly summary (food days, amount, rent)
- Pay Now button → Shows QR code
- Payment status badges
- "I have paid" action button

**Admin:**
- Payment overview with progress bar
- Student payment list (empty state for now)

---

### **Styles (src/index.css)**

Complete CSS with sections for:
- ✅ Global styles and resets
- ✅ Authentication screen
- ✅ Main app layout
- ✅ Bottom navigation
- ✅ Cards and announcements
- ✅ Toggles and form inputs
- ✅ Calendar grid
- ✅ Chat interface
- ✅ Payment screens
- ✅ Modals and overlays
- ✅ Responsive design (max-width: 480px)

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd pg-manager-react
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
App runs on `http://localhost:5173`

### 3. Build for Production
```bash
npm run build
```
Output in `dist/` folder

---

## 🔄 Migration Notes

### ✅ What Was Converted:

1. **React Components**
   - All screens split into separate `.jsx` files
   - Functional components with hooks
   - Proper import/export structure

2. **State Management**
   - All `useState` hooks preserved
   - Component-level state (ready for Context/Redux)

3. **Styling**
   - All inline `<style>` moved to `index.css`
   - Class names unchanged
   - No CSS-in-JS or styled-components

4. **Icons**
   - SVG icons extracted to `Icons.jsx`
   - Reusable across components

5. **Build System**
   - Vite for fast dev and optimized builds
   - No Babel/Webpack configuration needed

### ❌ What Was NOT Changed:

- UI/UX design (pixel-perfect match)
- Logic and behavior
- Class names and structure
- Placeholder data (still shows "—")

### 🔜 Ready for Firebase:

All Firebase integration points are marked:
```javascript
// Firebase login logic will go here
// Firebase signup logic will go here
// Firebase logic will go here
```

---

## 🎯 Next Steps

1. **Add Firebase**
   ```bash
   npm install firebase
   ```

2. **Create Firebase Config**
   ```javascript
   // src/firebase/config.js
   import { initializeApp } from 'firebase/app'
   import { getAuth } from 'firebase/auth'
   import { getFirestore } from 'firebase/firestore'
   ```

3. **Implement Authentication**
   - Phone/Email auth in `AuthScreen.jsx`
   - Protected routes in `App.jsx`

4. **Database Integration**
   - Food selections → Firestore
   - Announcements → Firestore
   - Messages → Firestore (real-time)
   - Payments → Firestore

5. **Add Context/State Management**
   ```javascript
   // src/context/AuthContext.jsx
   // src/context/AppContext.jsx
   ```

---

## 📚 Component Props Reference

### App.jsx
No props (root component)

### AuthScreen.jsx
- `onLogin: (role: 'student' | 'admin') => void`

### StudentHome.jsx
No props

### AdminHome.jsx
No props

### Chat.jsx
- `isAdmin: boolean`

### Payment.jsx
- `isStudent: boolean`

### Icons.jsx (exports)
- All icon components accept `className` prop

---

## 🛠️ Development Tips

1. **Hot Module Replacement (HMR)**
   - Vite provides instant updates
   - Changes reflect without full reload

2. **Component Dev**
   - Edit components in `src/components/`
   - Styles in `src/index.css`

3. **Debugging**
   - React DevTools recommended
   - Console logs already in place for Firebase placeholders

4. **Mobile Testing**
   - Use browser DevTools mobile view
   - App max-width: 480px (mobile-first)

---

## ✨ Key Features Preserved

- ✅ Login/Signup with tabs
- ✅ Student food selection (today + calendar)
- ✅ Admin announcements and count cards
- ✅ Group chat interface
- ✅ Student payment flow with QR placeholder
- ✅ Admin payment overview
- ✅ Modals and overlays
- ✅ Bottom navigation
- ✅ All animations and transitions

---

## 📝 Notes

- **No external UI libraries** (no Material-UI, Chakra, etc.)
- **Pure CSS** - no Tailwind or CSS modules
- **Functional components only** - no class components
- **ES6+ syntax** throughout
- **Vite** for modern, fast development

---

## 🎨 Design System

### Colors
- Primary: `#6366f1` (Indigo)
- Secondary: `#8b5cf6` (Purple)
- Warning: `#fbbf24` (Amber)
- Success: `#10b981` (Emerald)
- Danger: `#f87171` (Red)

### Typography
- Font: Inter (Google Fonts)
- Weights: 400, 500, 600, 700

### Spacing
- Base unit: 4px
- Common: 8px, 12px, 16px, 20px, 24px

---

## 🔗 Useful Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Add new dependency
npm install package-name

# Add dev dependency
npm install -D package-name
```

---

## ✅ Checklist for Completion

- [x] Project structure created
- [x] All components extracted
- [x] CSS moved to index.css
- [x] Icons componentized
- [x] Vite configuration
- [x] Package.json setup
- [x] README documentation
- [ ] Firebase integration
- [ ] Form validation
- [ ] Error handling
- [ ] Loading states
- [ ] Real data integration
- [ ] Testing setup
- [ ] Deployment configuration

---

**You now have a production-ready React project structure!** 🎉

The codebase is clean, organized, and ready for Firebase integration.
