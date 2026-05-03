# RideFlow CRM - Design Specification 2026

## Цветовая палитра

### Основные цвета
- **Accent Red**: `#ef4444` (red-500), `#dc2626` (red-600)
- **Text Black**: `#000000` (black)
- **Text Gray**: `#6b7280` (gray-600), `#9ca3af` (gray-500)
- **Background**: `#f3f4f6` (gray-100), `#e5e7eb` (gray-200)

### Glassmorphism эффекты
- **Glass Background**: `rgba(255, 255, 255, 0.8)` - `bg-white/80`
- **Glass Background Light**: `rgba(255, 255, 255, 0.4)` - `bg-white/40`
- **Glass Background Medium**: `rgba(255, 255, 255, 0.6)` - `bg-white/60`
- **Glass Background Strong**: `rgba(255, 255, 255, 0.9)` - `bg-white/90`
- **Backdrop Blur**: `backdrop-blur-xl`, `backdrop-blur-2xl`, `backdrop-blur-3xl`

### Градиенты
- **Button Gradient**: `from-red-400 via-red-500 to-red-600`
- **Active Nav**: `from-red-500 to-red-600`
- **Background**: `from-gray-100 via-gray-50 to-gray-100`

---

## Layout Component (Sidebar + Main)

### Sidebar
- **Width (collapsed)**: `w-16` (64px)
- **Width (expanded)**: `w-64` (256px)
- **Position**: `fixed` (поверх контента)
- **Background**: `bg-white/30` (полупрозрачный белый 30%)
- **Backdrop Blur**: `backdrop-blur-3xl`
- **Border**: `border-r border-white/40`
- **Border Radius**: `rounded-r-3xl` (24px справа)
- **Padding**: `p-5` (20px)
- **Shadow**: `shadow-2xl shadow-black/10`
- **z-index**: `z-50`
- **Transition**: `duration-300` (300ms)

### Logo Section (в sidebar)
- **Icon Container**: 
  - Size: `w-10 h-10` (40x40px)
  - Border Radius: `rounded-xl` (12px)
  - Background: `bg-gradient-to-br from-red-500 to-red-700`
  - Shadow: `shadow-lg shadow-red-500/60`
- **Title**: 
  - Font Size: `text-lg` (18px)
  - Color: `text-black`
  - Content: "RideFlow"
- **Subtitle**: 
  - Font Size: `text-xs` (12px)
  - Color: `text-gray-600`
  - Content: "B2B CRM"

### Navigation Items
- **Padding**: `px-4 py-3` (16px horizontal, 12px vertical)
- **Border Radius**: `rounded-xl` (12px)
- **Gap**: `gap-3` (12px between icon and text)
- **Icon Size**: `w-5 h-5` (20x20px)
- **Font Size**: `text-sm` (14px)
- **Active State**:
  - Background: `bg-gradient-to-r from-red-500 to-red-600`
  - Text: `text-white`
  - Shadow: `shadow-lg shadow-red-500/60`
- **Inactive State**:
  - Text: `text-gray-700`
  - Hover: `hover:bg-white/50`
- **Hover Animation**: `whileHover={{ x: 4 }}` (сдвиг на 4px вправо)

### Bottom Badge (2026 Edition)
- **Position**: `absolute bottom-5 left-5 right-5`
- **Padding**: `p-3` (12px)
- **Border Radius**: `rounded-xl` (12px)
- **Background**: `bg-white/30`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-white/50`
- **Shadow**: `shadow-lg`
- **Hover**: `whileHover={{ scale: 1.02 }}`

### Main Content Area
- **For Request Rides page**: no left margin (blocks have absolute positioning)
- **For other pages**: `ml-16` (margin-left 64px to account for collapsed sidebar)

---

## Request Rides Page

### Map Background (full screen)
- **Width**: `100%`
- **Height**: `100%`
- **Background**: `bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100`
- **SVG viewBox**: `0 0 1000 800`
- **Grid Pattern**: 30x30px, stroke `#E5E7EB`, opacity 0.4
- **Streets**: stroke width 4-6px, color `#CBD5E1`, opacity 0.5
- **Buildings**: fill `#9CA3AF`, opacity 0.15, border radius 4px

### Floating Blocks Container
- **Position**: `absolute top-6`
- **Animation**: `animate={{ marginLeft: isSidebarHovered ? "280px" : "88px" }}`
- **Width**: `w-96` (384px)
- **Gap**: `space-y-4` (16px between blocks)
- **z-index**: `z-10`

### Expandable Block (общий стиль)
- **Border Radius**: `rounded-3xl` (24px)
- **Background**: `bg-white/80`
- **Backdrop Blur**: `backdrop-blur-2xl`
- **Border**: `border border-white`
- **Shadow**: `shadow-xl`
- **Overflow**: `overflow-hidden`
- **Hover**: `whileHover={{ scale: 1.02, y: -2 }}`

### Block Header (кликабельный)
- **Padding**: `p-5` (20px)
- **Display**: flex items-center justify-between
- **Hover Background**: `hover:bg-gradient-to-r hover:from-white/60 hover:to-white/40`
- **Title Font Size**: `text-sm` (Select Client) или `text-base` (остальные)
- **Title Color**: `text-gray-700` (uppercase) или `text-black`
- **Chevron Size**: `w-5 h-5`
- **Chevron Color**: `text-gray-600`
- **Chevron Rotation**: `animate={{ rotate: expanded ? 180 : 0 }}`

### Block Content (expandable)
- **Padding**: `p-5 pt-0` (20px sides/bottom, 0 top)
- **Gap**: `space-y-4` (16px between items)
- **Animation**: 
  - Initial: `{ height: 0, opacity: 0 }`
  - Animate: `{ height: "auto", opacity: 1 }`
  - Exit: `{ height: 0, opacity: 0 }`
  - Duration: `0.4s`, Easing: `easeInOut`

### Input Fields
- **Width**: `w-full`
- **Padding**: `px-4 py-3.5` (16px horizontal, 14px vertical)
- **Border Radius**: `rounded-2xl` (16px)
- **Background**: `bg-white/90`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-gray-200`
- **Text Color**: `text-black`
- **Placeholder Color**: `placeholder-gray-400`
- **Focus Ring**: `focus:ring-2 focus:ring-red-400/50 focus:border-red-400/50`
- **Shadow**: `shadow-sm hover:shadow-md`
- **Hover**: `whileHover={{ scale: 1.01 }}`

### Input with Icon (MapPin)
- **Icon Position**: `absolute left-4 top-1/2 -translate-y-1/2`
- **Icon Size**: `w-5 h-5`
- **Icon Color**: `text-gray-500`
- **Input Padding Left**: `pl-12` (48px for icon space)

### Labels
- **Font Size**: `text-xs` (12px)
- **Color**: `text-gray-600`
- **Text Transform**: `uppercase`
- **Letter Spacing**: `tracking-wide`
- **Margin Bottom**: `mb-2` (8px)
- **Font Weight**: `font-medium`

### Select Dropdown
- **Same as Input Fields** plus:
- **Appearance**: `appearance-none` (hide default arrow)
- **Cursor**: `cursor-pointer`
- **Chevron Icon**: absolute right-3, w-4 h-4, text-gray-600, pointer-events-none

### Stop Entry (each stop)
- **Layout**: flex gap-2 items-start
- **Left Column**: flex-1 space-y-2
- **Address & Phone**: separate labeled inputs
- **Remove Button**: 
  - Size: `w-10 h-10`
  - Border Radius: `rounded-xl`
  - Background: `bg-red-50 hover:bg-red-100`
  - Margin Top: `mt-8` (to align with first input)
  - Icon: Plus rotated 45deg, `w-5 h-5 text-red-600`
  - Hover: `whileHover={{ scale: 1.1, rotate: 90 }}`

### Add Stop Button
- **Width**: `w-full`
- **Padding**: `px-4 py-3` (16px horizontal, 12px vertical)
- **Border Radius**: `rounded-2xl`
- **Background**: `bg-white/90`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-gray-200`
- **Text Color**: `text-black`
- **Font Weight**: `font-medium`
- **Shadow**: `shadow-md hover:shadow-lg`
- **Display**: flex items-center justify-center gap-2
- **Plus Icon**: `w-4 h-4`
- **Hover**: `whileHover={{ scale: 1.05, y: -2 }}`

### Schedule Ride Checkbox
- **Size**: `w-5 h-5`
- **Border Radius**: `rounded-md`
- **Border**: `border-2 border-gray-400`
- **Background**: `bg-white` (default unchecked)
- **Checked Color**: `text-red-500`
- **Focus Ring**: `focus:ring-2 focus:ring-red-400/40`
- **Label**: text-sm text-black font-medium, cursor-pointer, gap-3

### DateTime Input (when scheduled)
- **Type**: datetime-local
- **Same styling as regular inputs**

### Request Ride Button (3D effect)
- **Width**: `w-full`
- **Padding**: `px-6 py-4` (24px horizontal, 16px vertical)
- **Border Radius**: `rounded-2xl`
- **Background**: `bg-gradient-to-br from-red-400 via-red-500 to-red-600`
- **Text Color**: `text-white`
- **Font Size**: `text-base`
- **Font Weight**: `font-medium`
- **Shadow**: `shadow-xl hover:shadow-2xl`
- **Inline Shadow**: `inset 0 1px 0 rgba(255, 255, 255, 0.3)`
- **Box Shadow**: `0 10px 30px rgba(239, 68, 68, 0.3)`
- **Hover**: `whileHover={{ scale: 1.03, y: -3, boxShadow: "0 20px 40px rgba(239, 68, 68, 0.4)" }}`
- **Tap**: `whileTap={{ scale: 0.97 }}`

### Secondary Button
- **Same as Add Stop Button** but different hover scale: 1.03

### Requested Rides Section (top-right)
- **Position**: `absolute top-6 right-6 z-10`
- **Max Width**: `max-w-sm`
- **Gap**: `space-y-3` (12px between cards)

### Requested Ride Card
- **Padding**: `p-4` (16px)
- **Border Radius**: `rounded-2xl`
- **Backdrop Blur**: `backdrop-blur-2xl`
- **Border**: `border border-white`
- **Shadow**: `shadow-xl hover:shadow-2xl`
- **Background**: 
  - Scheduled: `bg-white/60`
  - Not Scheduled: `bg-white/90`
- **Hover**: `whileHover={{ scale: 1.02, y: -2 }}`

---

## Pre-Orders & Orders Pages

### Page Container
- **Padding**: `p-8` (32px)

### Page Header
- **Title**: 
  - Font Size: `text-3xl` (30px)
  - Color: `text-black`
  - Margin Bottom: `mb-2` (8px)
- **Subtitle**: 
  - Font Size: default (16px)
  - Color: `text-gray-700`

### Filter Card (GlassCard)
- **Margin Bottom**: `mb-6` (24px)
- **Layout**: flex items-center gap-4
- **Filter Input/Select**: 
  - Flex: `flex-1` (equal width distribution)
  - Same styling as Request Rides inputs but smaller padding: `py-2` (8px vertical)
  - Font Size: `text-sm` (14px)

### Stats Section (Orders page)
- **Display**: flex gap-6
- **Number Font Size**: `text-2xl` (24px)
- **Number Color**: `text-black`
- **Label Font Size**: `text-xs` (12px)
- **Label Color**: `text-gray-600`

### Export Button
- **Padding**: `px-6 py-2`
- **Border Radius**: `rounded-lg`
- **Background**: `bg-white/40`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-white/60`
- **Color**: `text-gray-700`
- **Hover**: `hover:bg-white/60`
- **Icon Size**: `w-4 h-4`
- **Gap**: `gap-2`

### Table (GlassCard)
- **Width**: `w-full`
- **Header Row**: 
  - Border: `border-b border-gray-300/60`
  - Padding: `py-3 px-4`
  - Font Size: `text-xs` (12px)
  - Color: `text-gray-600`
  - Text Transform: `uppercase`
  - Align: `text-left`
- **Body Row**: 
  - Border: `border-b border-gray-200/60`
  - Padding: `py-4 px-4`
  - Hover: `hover:bg-white/40`
  - Cursor: `cursor-pointer`
  - Animation: stagger delay `index * 0.05`
- **Cell Text**: 
  - Font Size: `text-sm` (14px)
  - Color: `text-black` or `text-gray-700`

### Status Badges
- **Padding**: `px-3 py-1`
- **Border Radius**: `rounded-full`
- **Font Size**: `text-xs` (12px)
- **Border**: `border`
- **Colors**:
  - Unassigned: `bg-red-100 text-red-700 border-red-300`
  - In Progress: `bg-blue-100 text-blue-700 border-blue-300`
  - Completed: `bg-green-100 text-green-700 border-green-300`
  - Canceled: `bg-red-100 text-red-700 border-red-300`
  - Waiting: `bg-yellow-100 text-yellow-700 border-yellow-300`

---

## Modal Components

### Modal Backdrop
- **Position**: `fixed inset-0`
- **Background**: `bg-black/40`
- **Backdrop Blur**: `backdrop-blur-md`
- **z-index**: `z-50`
- **Animation**: fade in/out, duration 0.3s

### Modal Container
- **Position**: `fixed inset-0 flex items-center justify-center z-50`
- **Padding**: `p-4`

### Modal Content
- **Max Width**: `max-w-3xl` (768px)
- **Width**: `w-full`
- **Background**: `bg-white/80`
- **Backdrop Blur**: `backdrop-blur-3xl`
- **Border Radius**: `rounded-3xl` (24px)
- **Border**: `border border-white`
- **Shadow**: `shadow-2xl shadow-black/20`
- **Animation**: 
  - Initial: `{ opacity: 0, scale: 0.9, y: 20 }`
  - Animate: `{ opacity: 1, scale: 1, y: 0 }`
  - Type: spring, duration 0.5s

### Modal Header
- **Padding**: `p-6` (24px)
- **Border Bottom**: `border-b border-gray-300/60`
- **Layout**: flex items-center justify-between
- **Title Font Size**: `text-lg` (18px)
- **Title Color**: `text-black`
- **Title Font Weight**: `font-medium`

### Close Button
- **Size**: `w-10 h-10`
- **Border Radius**: `rounded-xl`
- **Background**: `bg-white/40 hover:bg-white/60`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-white/60`
- **Icon Size**: `w-5 h-5`
- **Icon Color**: `text-gray-600`
- **Hover**: `whileHover={{ scale: 1.1, rotate: 90 }}`
- **Tap**: `whileTap={{ scale: 0.9 }}`

### Modal Tabs (Order Detail)
- **Container**: flex border-b border-gray-300/60 px-6
- **Tab Button**: 
  - Padding: `px-6 py-3`
  - Font Size: `text-sm` (14px)
  - Color: Active `text-black font-medium`, Inactive `text-gray-600`
  - Position: `relative`
  - Hover: `whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.3)" }}`
- **Active Tab Indicator**: 
  - Position: `absolute bottom-0 left-0 right-0`
  - Height: `h-0.5` (2px)
  - Background: `bg-gradient-to-r from-red-500 to-red-600`
  - Layout ID: "activeTab" (for smooth animation)

### Modal Content Area
- **Padding**: `p-6` (24px)

### Info Blocks (in modals)
- **Padding**: `p-4` (16px)
- **Border Radius**: `rounded-2xl` (16px)
- **Background**: `bg-white/40`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-white/60`
- **Title**: text-sm text-black font-medium mb-4
- **Gap**: `space-y-3` (12px between fields)

### Info Field (in modal)
- **Label**: 
  - Font Size: `text-xs` (12px)
  - Color: `text-gray-600`
  - Margin Bottom: `mb-1` (4px)
- **Value**: 
  - Font Size: `text-sm` (14px)
  - Color: `text-black` or `text-gray-500 italic` (if "Not provided")

### Action Buttons (in modals)
- **Width**: `w-full`
- **Padding**: `px-4 py-3` (16px horizontal, 12px vertical)
- **Border Radius**: `rounded-2xl`
- **Font Size**: `text-sm` (14px)
- **Font Weight**: `font-medium`
- **Shadow**: `shadow-sm hover:shadow-md`
- **Hover**: `whileHover={{ scale: 1.02, y: -2 }}`
- **Colors**:
  - Cancel: `bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`
  - Open: `bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100`

---

## Dashboard Page

### Stats Cards Grid
- **Layout**: `grid grid-cols-4 gap-4`
- **Margin Bottom**: `mb-6` (24px)
- **Card Animation**: stagger delay `0.1s * index`

### Stat Card
- **Uses GlassCard component**
- **Label**: 
  - Font Size: `text-xs` (12px)
  - Color: `text-gray-600`
  - Margin Bottom: `mb-1` (4px)
- **Value**: 
  - Font Size: `text-2xl` (24px)
  - Color: `text-black`
- **Trend Indicator** (if present):
  - Display: flex items-center gap-2
  - Font Size: `text-xs` (12px)
  - Icon Size: `w-3 h-3`
  - Color: Green `text-green-600` or Red `text-red-600`

### Charts Grid
- **Layout**: `grid grid-cols-2 gap-6`
- **Animation**: stagger delay `0.1s * index`

### Chart Container
- **Uses GlassCard component**
- **Title**: 
  - Font Size: default (16px)
  - Color: `text-black`
  - Margin Bottom: `mb-1` (4px)
- **Subtitle**: 
  - Font Size: `text-xs` (12px)
  - Color: `text-gray-600`
- **ResponsiveContainer**: 
  - Width: 100%
  - Height: 200px

### Chart Styling (recharts)
- **CartesianGrid**: 
  - Stroke Dasharray: "3 3"
  - Stroke: `#e5e7eb` (gray-200)
- **XAxis/YAxis**: 
  - Stroke: `#6b7280` (gray-500)
  - Font Size: 12px
- **Line Charts**: 
  - Stroke Width: 2px
  - Colors: `#3b82f6` (blue), `#10b981` (green), `#ef4444` (red)
  - Dot Fill: same as stroke
  - Active Dot Radius: 6px
- **Bar Chart**: 
  - Fill: `#8b5cf6` (purple-500)
  - Border Radius: `[8, 8, 0, 0]` (top corners rounded)

---

## Price Calculator Page

### Calculator Form
- **Max Width**: `max-w-3xl`
- **Uses GlassCard**
- **Gap**: `space-y-6` (24px)

### Two-column inputs grid
- **Layout**: `grid grid-cols-2 gap-4`
- **Distance & Duration inputs**

### Calculate Button
- **Same styling as Request Ride button**
- **Icon**: Calculator `w-5 h-5`
- **Text**: "Calculate Price"

### Result Card (when calculated)
- **Animation**: 
  - Initial: `{ opacity: 0, scale: 0.9 }`
  - Animate: `{ opacity: 1, scale: 1 }`
  - Duration: 0.3s
- **Background**: `bg-gradient-to-br from-green-50 to-emerald-50`
- **Icon Container**: 
  - Size: `w-12 h-12`
  - Border Radius: `rounded-xl`
  - Background: `bg-gradient-to-br from-green-500 to-emerald-600`
  - Icon: DollarSign `w-6 h-6 text-white`
- **Price Display**: 
  - Font Size: `text-3xl` (30px)
  - Color: `text-black`
  - Prefix: ₪ (shekel symbol)

### Pricing Breakdown Card
- **Margin Top**: `mt-6` (24px)
- **Uses GlassCard**
- **Row Style**: 
  - Padding: `p-3`
  - Border Radius: `rounded-lg`
  - Background: `bg-white/40`
  - Layout: flex justify-between items-center
- **Gap**: `space-y-3` (12px between rows)

---

## GlassCard Component

### Default Styling
- **Padding**: `p-6` (24px)
- **Border Radius**: `rounded-2xl` (16px)
- **Background**: `bg-white/60`
- **Backdrop Blur**: `backdrop-blur-xl`
- **Border**: `border border-white/80`
- **Shadow**: `shadow-lg`
- **Overflow**: `overflow-hidden`
- **Additional Classes**: can be passed via className prop

---

## Animations & Transitions

### Page Load Animations
- **Container**: 
  - Initial: `{ opacity: 0, y: 20 }`
  - Animate: `{ opacity: 1, y: 0 }`
  - Duration: 0.5s

### Hover Effects
- **Buttons**: `scale: 1.02-1.05`, `y: -2 to -3`
- **Cards**: `scale: 1.02`, `y: -2`
- **Icons**: `scale: 1.1`, `rotate: 90` (for close/remove)
- **Nav Items**: `x: 4` (horizontal shift)

### Transitions
- **All interactive elements**: `transition-all duration-300`
- **Sidebar**: `duration-300 ease-out`
- **Expandable blocks**: `duration-400 ease-in-out`

### Stagger Animations (tables)
- **Delay**: `index * 0.05` seconds
- **Direction**: `x: -20` (from left)

---

## Typography

### Headings
- **Page Title (h2)**: `text-3xl text-black mb-2`
- **Section Title (h3)**: `text-lg text-black mb-4`
- **Card Title (h4)**: `text-sm text-black font-medium mb-4`

### Body Text
- **Default**: 16px (no class)
- **Small**: `text-sm` (14px)
- **Extra Small**: `text-xs` (12px)

### Font Weights
- **Medium**: `font-medium` (используется для заголовков и labels)
- **Regular**: default (для основного текста)

### Text Colors
- **Primary**: `text-black`
- **Secondary**: `text-gray-700`
- **Tertiary**: `text-gray-600`
- **Disabled/Placeholder**: `text-gray-500`, `text-gray-400`
- **Italic Hint**: `text-gray-500 italic`

---

## Spacing System

### Padding
- **xs**: `p-3` (12px)
- **sm**: `p-4` (16px)
- **md**: `p-5` (20px)
- **lg**: `p-6` (24px)
- **xl**: `p-8` (32px)

### Margin
- **xs**: `mb-1` (4px), `mb-2` (8px)
- **sm**: `mb-4` (16px)
- **md**: `mb-6` (24px)
- **lg**: `mb-8` (32px)

### Gap
- **xs**: `gap-2` (8px), `gap-3` (12px)
- **sm**: `gap-4` (16px)
- **md**: `gap-6` (24px)

### Space Between
- **xs**: `space-y-2` (8px), `space-y-3` (12px)
- **sm**: `space-y-4` (16px)
- **md**: `space-y-6` (24px)

---

## Border Radius System

- **Small**: `rounded-lg` (8px) - filters, small buttons
- **Medium**: `rounded-xl` (12px) - nav items, icons, small cards
- **Large**: `rounded-2xl` (16px) - inputs, buttons, cards
- **Extra Large**: `rounded-3xl` (24px) - modals, main blocks

---

## Shadow System

- **sm**: `shadow-sm` - subtle elevation
- **md**: `shadow-md` - input hover states
- **lg**: `shadow-lg` - cards, sidebar
- **xl**: `shadow-xl` - floating blocks, modals
- **2xl**: `shadow-2xl` - sidebar, modal backdrop

### Colored Shadows
- **Red**: `shadow-red-500/60` - active nav, red buttons
- **Black**: `shadow-black/10`, `shadow-black/20` - general depth

---

## Responsive Behavior

### Sidebar
- Always starts collapsed (64px)
- Expands to 256px on hover
- On Request Rides: pushes floating blocks with margin animation
- On other pages: fixed overlay, doesn't push content

### Floating Blocks (Request Rides)
- Base position: `marginLeft: 88px` (sidebar collapsed + offset)
- Sidebar hovered: `marginLeft: 280px` (sidebar expanded + offset)
- Transition: 300ms ease-out

### Tables
- Overflow: `overflow-x-auto` for horizontal scroll on small screens

---

## Z-Index Layers

- **Sidebar**: `z-50`
- **Modals (backdrop + content)**: `z-50`
- **Floating Blocks (Request Rides)**: `z-10`
- **Requested Rides (top-right)**: `z-10`
- **Map Background**: default (z-0)

---

## Icon Sizes

- **Small**: `w-3 h-3` (12px) - trends, small indicators
- **Medium**: `w-4 h-4` (16px) - filters, dropdown arrows
- **Default**: `w-5 h-5` (20px) - nav icons, input icons, buttons
- **Large**: `w-6 h-6` (24px) - result icons

---

## Special Components

### Tel Aviv Map (SVG)
- **Location**: Request Rides page background
- **ViewBox**: 0 0 1000 800
- **Grid**: 30x30px pattern
- **Streets**: horizontal & vertical lines, varying widths (4-6px)
- **Buildings**: rectangles with rounded corners
- **Animated Markers**: 
  - Green circle (pickup): cx="350" cy="350", r="12", fill="#10B981"
  - Red circle (destination): cx="650" cy="450", r="12", fill="#EF4444"
  - Pulse animation: expanding circle with fade-out, repeat infinity
- **Route Line**: curved path (quadratic bezier), dashed, blue color (#6366F1)

### Checkbox (Schedule Ride)
- **Unchecked**: white background, gray border
- **Checked**: red checkmark, white background
- **Border**: 2px solid

### DateTime Input
- **Type**: datetime-local
- **Same styling as text inputs**
- **Shows calendar picker on focus**

---

## File Structure

```
src/
├── app/
│   ├── App.tsx                    # Router setup
│   ├── routes.tsx                 # Route configuration
│   └── components/
│       ├── Layout.tsx             # Sidebar + main layout
│       ├── RequestRides.tsx       # Main ride request page
│       ├── PreOrders.tsx          # Pre-orders table
│       ├── Orders.tsx             # Orders table
│       ├── Dashboard.tsx          # Analytics dashboard
│       ├── PriceCalculator.tsx    # Price estimation
│       ├── Communications.tsx     # Communications page
│       ├── AccessManagement.tsx   # Access management
│       ├── GlassCard.tsx          # Reusable glass card
│       ├── Modal.tsx              # Generic modal
│       ├── OrderDetailModal.tsx   # Order detail with tabs
│       └── PreOrderDetailModal.tsx # Pre-order detail
└── styles/
    ├── theme.css                  # Tailwind v4 theme tokens
    └── fonts.css                  # Font imports
```

---

## Component Dependencies

### Motion (Framer Motion)
- `motion.div`, `motion.aside`, `motion.button`
- `AnimatePresence` for enter/exit animations
- Properties: `initial`, `animate`, `exit`, `whileHover`, `whileTap`

### React Router
- `RouterProvider`, `createBrowserRouter`
- `Outlet`, `NavLink`, `useLocation`, `useOutletContext`

### Lucide React Icons
- Car, Package, Sparkles, ClipboardList, MessageSquare
- BarChart3, Calculator, Settings, MapPin, Phone
- Plus, ChevronDown, Clock, X, Calendar
- TrendingUp, TrendingDown, Download

### Recharts
- `LineChart`, `BarChart`, `Line`, `Bar`
- `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`
- `ResponsiveContainer`

---

## Implementation Notes

1. **All animations use Motion** (not CSS transitions for complex animations)
2. **Glassmorphism** achieved via `backdrop-blur` + semi-transparent backgrounds
3. **3D buttons** use multiple shadow layers + gradient backgrounds
4. **Responsive** via Tailwind breakpoints and dynamic margin animations
5. **Accessibility**: cursor-pointer on clickables, focus rings on inputs
6. **Performance**: AnimatePresence for smooth mount/unmount
7. **State management**: useState hooks, no external state library
8. **Styling**: Tailwind CSS v4 with inline classes

---

## Testing Checklist for Cursor AI

### Visual Checks
- [ ] All colors match the palette (red-500/600, black, gray tones)
- [ ] Glassmorphism effect visible (blur + transparency)
- [ ] Border radius consistent (8px/12px/16px/24px system)
- [ ] Shadows applied correctly (layered depth)
- [ ] Typography sizes match spec (xs/sm/base/lg/2xl/3xl)
- [ ] Spacing follows 4px grid (gap-2/3/4/6, p-3/4/5/6/8)

### Interaction Checks
- [ ] Sidebar collapses/expands on hover
- [ ] Sidebar pushes Request Rides blocks (not other pages)
- [ ] All buttons have hover effects (scale + y-shift)
- [ ] Expandable blocks animate smoothly (400ms)
- [ ] Modals open/close with spring animation
- [ ] Tab switching in Order modal has sliding indicator
- [ ] Form inputs have focus rings
- [ ] Checkboxes toggle correctly
- [ ] Add Stop appears between stops and destination

### Functionality Checks
- [ ] Navigation between pages works
- [ ] Modal opens when clicking table rows
- [ ] Schedule ride checkbox shows/hides datetime input
- [ ] Add Stop button adds new stop with address + phone
- [ ] Remove stop button deletes the stop
- [ ] Request Ride creates new card in top-right
- [ ] Price calculator computes correctly
- [ ] Charts render with correct data

### Code Quality Checks
- [ ] No duplicate keys in lists/maps
- [ ] All images use correct import paths
- [ ] Motion components have proper initial/animate/exit
- [ ] useOutletContext provides isSidebarHovered
- [ ] All forms have controlled inputs (value + onChange)
- [ ] Buttons have descriptive aria-labels where needed
- [ ] No console errors or warnings

---

**End of Design Specification**
