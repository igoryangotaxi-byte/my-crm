# RideFlow CRM - Cursor AI Design Review Instructions

## Overview
This is a React + TypeScript B2B CRM application with a modern glassmorphism design (2026 aesthetic). The design uses bright red accents, black text, and soft light gray backgrounds with floating semi-transparent blocks and smooth animations.

---

## Design System

### Colors
```typescript
// Primary Colors
const colors = {
  accent: {
    red: '#ef4444',      // red-500 - primary accent
    redDark: '#dc2626',  // red-600 - hover states
  },
  text: {
    primary: '#000000',   // black - headings, important text
    secondary: '#374151', // gray-700 - body text
    tertiary: '#6b7280',  // gray-600 - labels
    muted: '#9ca3af',     // gray-500 - disabled
  },
  background: {
    page: '#f3f4f6',      // gray-100 - main background
    light: '#e5e7eb',     // gray-200 - subtle variation
  },
  glass: {
    strong: 'rgba(255, 255, 255, 0.9)',   // bg-white/90
    medium: 'rgba(255, 255, 255, 0.8)',   // bg-white/80
    light: 'rgba(255, 255, 255, 0.6)',    // bg-white/60
    subtle: 'rgba(255, 255, 255, 0.4)',   // bg-white/40
    soft: 'rgba(255, 255, 255, 0.3)',     // bg-white/30
  },
};

// Glassmorphism Effect
backdrop-blur-xl   // 24px blur
backdrop-blur-2xl  // 40px blur
backdrop-blur-3xl  // 64px blur
```

### Typography Scale
```typescript
text-xs    // 12px - labels, small text
text-sm    // 14px - body text, table cells
text-base  // 16px - default, paragraphs
text-lg    // 18px - modal titles, sidebar brand
text-2xl   // 24px - stats, prices
text-3xl   // 30px - page headings
```

### Spacing Scale (4px grid)
```typescript
p-3  // 12px padding
p-4  // 16px padding
p-5  // 20px padding
p-6  // 24px padding
p-8  // 32px padding

gap-2  // 8px gap
gap-3  // 12px gap
gap-4  // 16px gap
gap-6  // 24px gap

space-y-2  // 8px vertical spacing
space-y-3  // 12px vertical spacing
space-y-4  // 16px vertical spacing
space-y-6  // 24px vertical spacing
```

### Border Radius System
```typescript
rounded-lg   // 8px  - small elements
rounded-xl   // 12px - medium cards, buttons
rounded-2xl  // 16px - inputs, large cards
rounded-3xl  // 24px - modals, main blocks
```

### Shadow System
```typescript
shadow-sm  // subtle elevation
shadow-md  // input hover
shadow-lg  // cards
shadow-xl  // floating blocks
shadow-2xl // modals, sidebar

// Colored shadows
shadow-red-500/60   // red glow on active elements
shadow-black/10     // subtle depth
shadow-black/20     // modal backdrop
```

---

## Component Specifications

### 1. Sidebar (Layout.tsx)

**Position & Behavior:**
- Fixed position, left side, full height
- Collapsed: 64px (w-16)
- Expanded: 256px (w-64) on hover
- On Request Rides page: pushes floating blocks when expanded
- On other pages: overlay, doesn't affect layout

**Styling:**
```tsx
className="fixed w-16 hover:w-64 p-5 backdrop-blur-3xl bg-white/30 border-r border-white/40 rounded-r-3xl shadow-2xl shadow-black/10 overflow-y-auto overflow-x-hidden transition-all duration-300 z-50 h-screen"
```

**Logo Section:**
```tsx
// Icon container
w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/60

// Text
<h1 className="text-lg text-black">RideFlow</h1>
<p className="text-xs text-gray-600">B2B CRM</p>
```

**Nav Items:**
```tsx
// Active state
className="bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/60 px-4 py-3 rounded-xl"

// Inactive state
className="text-gray-700 hover:bg-white/50 px-4 py-3 rounded-xl"

// Hover animation
whileHover={{ x: 4 }}
```

**Check for:**
- [ ] Sidebar expands smoothly on hover (300ms)
- [ ] Logo has red gradient background
- [ ] Active nav item has red gradient + white text
- [ ] Nav icons are 20x20px (w-5 h-5)
- [ ] Bottom badge shows "2026 Edition" / "Premium"

---

### 2. Request Rides Page (RequestRides.tsx)

**Map Background:**
```tsx
// Full screen SVG map
className="w-full h-full bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 relative overflow-hidden"
viewBox="0 0 1000 800"

// Animated markers
- Green circle at pickup (cx="350" cy="350", fill="#10B981")
- Red circle at destination (cx="650" cy="450", fill="#EF4444")
- Pulsing animation on both (scale + opacity)
- Blue dashed line connecting them (stroke="#6366F1")
```

**Floating Blocks Container:**
```tsx
<motion.div
  animate={{ marginLeft: isSidebarHovered ? "280px" : "88px" }}
  transition={{ duration: 0.3, ease: "easeOut" }}
  className="absolute top-6 space-y-4 z-10 w-96"
>
```

**Expandable Block:**
```tsx
// Container
className="rounded-3xl bg-white/80 backdrop-blur-2xl border border-white shadow-xl overflow-hidden"
whileHover={{ scale: 1.02, y: -2 }}

// Header (clickable)
className="w-full p-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40"

// Chevron rotation
animate={{ rotate: expanded ? 180 : 0 }}

// Content (expandable)
initial={{ height: 0, opacity: 0 }}
animate={{ height: "auto", opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
transition={{ duration: 0.4, ease: "easeInOut" }}
```

**Input Fields:**
```tsx
className="w-full px-4 py-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50 transition-all duration-300 shadow-sm hover:shadow-md"
whileHover={{ scale: 1.01 }}
```

**3D Request Ride Button:**
```tsx
className="w-full px-6 py-4 rounded-2xl bg-gradient-to-br from-red-400 via-red-500 to-red-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 font-medium text-base relative overflow-hidden"
style={{
  boxShadow: "0 10px 30px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
}}
whileHover={{ scale: 1.03, y: -3, boxShadow: "0 20px 40px rgba(239, 68, 68, 0.4)" }}
whileTap={{ scale: 0.97 }}
```

**Add Stop Button Position:**
```tsx
// MUST appear in this order:
1. Pickup Location input
2. All stops (mapped array)
3. <Add Stop button> ← HERE (between stops and destination)
4. Destination input
5. Passenger phone input
```

**Requested Rides (Top Right):**
```tsx
className="absolute top-6 right-6 z-10 space-y-3 max-w-sm"

// Card styling
className={`p-4 rounded-2xl backdrop-blur-2xl border border-white shadow-xl ${
  ride.scheduled ? "bg-white/60" : "bg-white/90"
}`}
whileHover={{ scale: 1.02, y: -2 }}
```

**Check for:**
- [ ] Map renders with Tel Aviv streets and buildings
- [ ] Floating blocks start at marginLeft: 88px
- [ ] Blocks shift to 280px when sidebar hovered
- [ ] All blocks have glassmorphism (blur + transparency)
- [ ] Expandable blocks animate smoothly (400ms)
- [ ] Request Ride button has 3D gradient effect
- [ ] Add Stop button between stops and destination
- [ ] Scheduled rides are more transparent (bg-white/60)
- [ ] Each stop has address AND phone fields

---

### 3. Orders & Pre-Orders Pages

**Table Styling:**
```tsx
// Header row
className="border-b border-gray-300/60"
// Header cell
className="text-left py-3 px-4 text-gray-600 text-xs uppercase"

// Body row
className="border-b border-gray-200/60 hover:bg-white/40 transition-all duration-200 cursor-pointer"
onClick={() => setSelectedOrder(order)}

// Cell text
className="text-black text-sm" // or text-gray-700
```

**Status Badges:**
```tsx
// Unassigned
className="inline-block px-3 py-1 rounded-full text-xs bg-red-100 text-red-700 border border-red-300"

// In Progress
className="inline-block px-3 py-1 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-300"

// Completed
className="inline-block px-3 py-1 rounded-full text-xs bg-green-100 text-green-700 border border-green-300"

// Canceled
className="inline-block px-3 py-1 rounded-full text-xs bg-red-100 text-red-700 border border-red-300"

// Waiting
className="inline-block px-3 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700 border border-yellow-300"
```

**Filter Section:**
```tsx
// Container
className="flex items-center gap-4"

// Each filter input
className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl"
```

**Check for:**
- [ ] Table rows are clickable
- [ ] Clicking row opens modal
- [ ] Status badges have correct colors
- [ ] Hover effect on table rows (bg-white/40)
- [ ] Filter inputs have glassmorphism effect

---

### 4. Modal Components

**Modal Backdrop:**
```tsx
className="fixed inset-0 bg-black/40 backdrop-blur-md z-50"
onClick={onClose}
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
```

**Modal Content:**
```tsx
className="w-full max-w-3xl bg-white/80 backdrop-blur-3xl rounded-3xl border border-white shadow-2xl shadow-black/20 overflow-hidden"
initial={{ opacity: 0, scale: 0.9, y: 20 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.9, y: 20 }}
transition={{ type: "spring", duration: 0.5 }}
```

**Modal Header:**
```tsx
className="flex items-center justify-between p-6 border-b border-gray-300/60"
// Title
className="text-lg text-black font-medium"
```

**Close Button:**
```tsx
className="w-10 h-10 rounded-xl bg-white/40 hover:bg-white/60 flex items-center justify-center transition-all duration-300 backdrop-blur-xl border border-white/60"
whileHover={{ scale: 1.1, rotate: 90 }}
whileTap={{ scale: 0.9 }}
```

**Tabs (Order Detail Modal):**
```tsx
// Tab button
className={`px-6 py-3 text-sm transition-all duration-300 relative ${
  activeTab === "route" ? "text-black font-medium" : "text-gray-600"
}`}

// Active indicator
{activeTab === "route" && (
  <motion.div
    layoutId="activeTab"
    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-red-600"
  />
)}
```

**Info Blocks (inside modals):**
```tsx
className="p-4 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60"
// Title
className="text-sm text-black font-medium mb-4"
// Field label
className="text-xs text-gray-600 mb-1"
// Field value
className="text-sm text-black" // or "text-sm text-gray-500 italic" for "Not provided"
```

**Check for:**
- [ ] Modal opens with spring animation
- [ ] Backdrop has blur effect
- [ ] Close button rotates 90° on hover
- [ ] Tabs have animated underline indicator
- [ ] Info blocks have glassmorphism effect
- [ ] Modal content separated into visual blocks

---

### 5. Dashboard Page

**Stats Grid:**
```tsx
className="grid grid-cols-4 gap-4 mb-6"
// Each stat card uses GlassCard component
```

**Stat Card Content:**
```tsx
// Label
className="text-gray-600 text-xs mb-1"
// Value
className="text-2xl text-black"
// Trend indicator (if present)
className="flex items-center gap-2 text-xs"
// Icon colors
text-green-600 // for positive trend
text-red-600   // for negative trend
```

**Charts Grid:**
```tsx
className="grid grid-cols-2 gap-6"
```

**Chart Styling:**
```tsx
<ResponsiveContainer width="100%" height={200}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
    <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
    <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
    <Tooltip />
    <Line 
      type="monotone" 
      dataKey="value" 
      stroke="#3b82f6" 
      strokeWidth={2} 
      dot={{ fill: "#3b82f6" }} 
      activeDot={{ r: 6 }}
    />
  </LineChart>
</ResponsiveContainer>
```

**Data Structure (IMPORTANT):**
```tsx
// Each data point MUST have unique id to avoid key conflicts
const data = [
  { id: "unique-jan", name: "Jan", value: 80 },
  { id: "unique-feb", name: "Feb", value: 95 },
  // etc...
];
```

**Check for:**
- [ ] 4 stat cards in a row
- [ ] Charts render without errors
- [ ] No duplicate key warnings in console
- [ ] Chart colors: blue (#3b82f6), green (#10b981), purple (#8b5cf6), red (#ef4444)
- [ ] Bar chart has rounded top corners
- [ ] All data points have unique IDs

---

### 6. GlassCard Component

**Default Implementation:**
```tsx
export function GlassCard({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string 
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={`p-6 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/80 shadow-lg overflow-hidden ${className}`}
    >
      {children}
    </motion.div>
  );
}
```

**Check for:**
- [ ] Used consistently across all pages
- [ ] Has glassmorphism effect (blur + transparency)
- [ ] Accepts custom className prop
- [ ] Has subtle hover effect (y: -2)

---

## Animation Specifications

### Hover Animations
```tsx
// Buttons (small)
whileHover={{ scale: 1.02, y: -2 }}

// Buttons (medium)
whileHover={{ scale: 1.03, y: -2 }}

// Main action button
whileHover={{ scale: 1.03, y: -3, boxShadow: "..." }}

// Cards
whileHover={{ scale: 1.02, y: -2 }}

// Close/Remove icons
whileHover={{ scale: 1.1, rotate: 90 }}

// Nav items
whileHover={{ x: 4 }}

// Input fields
whileHover={{ scale: 1.01 }}
```

### Tap Animations
```tsx
whileTap={{ scale: 0.97 }} // or 0.98 for subtle
```

### Page Load
```tsx
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.5 }}
```

### Expandable Sections
```tsx
<AnimatePresence>
  {isExpanded && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

### Stagger Animations (Tables)
```tsx
transition={{ duration: 0.3, delay: index * 0.05 }}
```

---

## Common Issues to Check

### 1. React Keys
```tsx
// ❌ BAD - duplicate keys
{data.map(item => <div key={item.name}>...</div>)}

// ✅ GOOD - unique keys
{data.map(item => <div key={item.id}>...</div>)}
```

### 2. Motion Components
```tsx
// ❌ BAD - missing AnimatePresence
{isOpen && <motion.div exit={{...}}>...</motion.div>}

// ✅ GOOD - wrapped in AnimatePresence
<AnimatePresence>
  {isOpen && <motion.div exit={{...}}>...</motion.div>}
</AnimatePresence>
```

### 3. Form Inputs
```tsx
// ❌ BAD - uncontrolled input
<input type="text" />

// ✅ GOOD - controlled input
<input 
  type="text" 
  value={formData.field} 
  onChange={(e) => setFormData({...formData, field: e.target.value})} 
/>
```

### 4. Import Paths
```tsx
// ✅ Correct imports
import { motion, AnimatePresence } from "motion/react";
import { NavLink, useLocation, useOutletContext } from "react-router";
import { Car, MapPin, Plus } from "lucide-react";
```

### 5. Glassmorphism Effect
```tsx
// Must have BOTH blur and transparency
className="backdrop-blur-xl bg-white/60"
// Not just one
```

---

## File Structure to Verify

```
src/
├── app/
│   ├── App.tsx                    # RouterProvider setup
│   ├── routes.tsx                 # Route definitions
│   └── components/
│       ├── Layout.tsx             # Sidebar + Outlet
│       ├── RequestRides.tsx       # Main page with floating blocks
│       ├── PreOrders.tsx          # Table + modal
│       ├── Orders.tsx             # Table + modal
│       ├── Dashboard.tsx          # Charts + stats
│       ├── PriceCalculator.tsx    # Calculator form
│       ├── Communications.tsx     # Placeholder
│       ├── AccessManagement.tsx   # Placeholder
│       ├── GlassCard.tsx          # Reusable component
│       ├── Modal.tsx              # Generic modal
│       ├── OrderDetailModal.tsx   # Order details with tabs
│       └── PreOrderDetailModal.tsx # Pre-order details
└── styles/
    ├── theme.css                  # Tailwind v4 theme
    └── fonts.css                  # Font imports
```

---

## Testing Checklist for Cursor AI

Run these checks:

### Visual Design
- [ ] Background is soft light gray (gray-100/200)
- [ ] All accents use red-500 or red-600
- [ ] Text is black for headings, gray-700/600 for body
- [ ] All cards/blocks have glassmorphism (blur + transparency)
- [ ] Shadows create depth (not flat design)
- [ ] Border radius follows system (8/12/16/24px)
- [ ] Typography scale is consistent (xs/sm/base/lg/2xl/3xl)

### Layout & Structure
- [ ] Sidebar collapses to 64px, expands to 256px
- [ ] Sidebar is fixed position, z-50
- [ ] Request Rides blocks shift with sidebar (marginLeft animation)
- [ ] Other pages don't shift with sidebar
- [ ] Main content area has correct margins
- [ ] All spacing follows 4px grid

### Components
- [ ] All inputs have focus rings (red-400/50)
- [ ] All buttons have hover effects
- [ ] Expandable blocks animate smoothly
- [ ] Modals have spring animation on open
- [ ] Tables are clickable and open modals
- [ ] Status badges have correct colors
- [ ] Charts render without errors

### Functionality
- [ ] Sidebar expands on hover
- [ ] Navigation between pages works
- [ ] Add Stop button in correct position (between stops and destination)
- [ ] Each stop has address AND phone fields
- [ ] Schedule checkbox shows/hides datetime input
- [ ] Request Ride creates card in top-right
- [ ] Clicking table rows opens modals
- [ ] Modal tabs switch with animated indicator
- [ ] Price calculator computes correctly

### Code Quality
- [ ] No duplicate keys in lists/arrays
- [ ] All motion components wrapped in AnimatePresence when conditional
- [ ] All forms use controlled inputs (value + onChange)
- [ ] No console errors or warnings
- [ ] Imports use correct paths
- [ ] TypeScript types are correct
- [ ] No unused variables or imports

---

## Cursor AI Commands to Run

```bash
# Check for duplicate keys
cursor search: "key={" --filter "map"

# Check for uncontrolled inputs
cursor search: "<input" --exclude "value="

# Verify motion imports
cursor search: 'from "motion/react"'

# Check glassmorphism usage
cursor search: "backdrop-blur"

# Find all TODO/FIXME comments
cursor search: "TODO|FIXME"

# Verify all components exist
cursor verify-imports

# Check TypeScript errors
cursor check-types
```

---

## Priority Issues

If you find discrepancies, prioritize fixes in this order:

1. **Critical:** Functionality broken (buttons don't work, pages crash)
2. **High:** Visual design wrong (colors, glassmorphism missing)
3. **Medium:** Animations missing or incorrect
4. **Low:** Minor spacing/sizing adjustments

---

## Contact

If Cursor finds issues, report them with:
- Component name and file path
- Line number
- Expected behavior (from this spec)
- Actual behavior (what you found)
- Screenshot (if visual issue)

Example:
```
Issue: Request Ride button missing 3D effect
File: src/app/components/RequestRides.tsx:492
Expected: bg-gradient-to-br from-red-400 via-red-500 to-red-600 with boxShadow
Found: bg-red-500
Screenshot: [attach]
```

---

**End of Cursor Instructions**
